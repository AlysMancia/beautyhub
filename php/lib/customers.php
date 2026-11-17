<?php
/**
 * Seller: add or edit customers by hand (walk-in regulars, people who order by
 * chat, ...). They get a customer account without a password; if they later
 * sign up with the same email they take it over (see create_user).
 */
if (!defined('BEAUTYHUB')) {
    exit;
}

/** Validated name / email / phone / notes from the form. */
function customer_form_fields() {
    $name = input('name');
    if ($name === '' || mb_strlen($name) > 120) {
        fail('Enter the customer name (max 120 characters).');
    }
    $email = strtolower(input('email'));
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        fail('That email address does not look right.');
    }
    $phone = input('phone');
    if ($phone !== '' && !preg_match('/^[0-9+()\-\s]{7,40}$/', $phone)) {
        fail('Phone number can only have digits, spaces, + ( ) and -.');
    }
    return [
        'name' => $name,
        'email' => $email === '' ? null : $email,
        'phone' => $phone === '' ? null : $phone,
        'notes' => mb_substr(input('notes'), 0, 2000) ?: null,
    ];
}

/** A unique username like "maria.santos" / "maria.santos2". */
function unique_username($conn, $name) {
    $base = trim(preg_replace('/[^a-z0-9]+/', '.', strtolower($name)), '.');
    $base = substr($base ?: 'customer', 0, 24);
    if (strlen($base) < 3) {
        $base .= '.customer';
    }
    $stmt = $conn->prepare('SELECT 1 FROM users WHERE LOWER(username) = ?');
    for ($i = 1; ; $i++) {
        $candidate = $i === 1 ? $base : $base . $i;
        $stmt->execute([$candidate]);
        if (!$stmt->fetch()) {
            return $candidate;
        }
    }
}

/**
 * Add a customer to your store. If the email belongs to an existing customer
 * account, that account is added to your store instead of making a new one.
 * Inputs: name, email?, phone?, role_id?, notes?
 */
function add_customer($conn) {
    [, $store] = require_seller_store($conn);
    $f = customer_form_fields();
    $roleId = (int) input('role_id') ?: default_role_id($conn, $store['id']);
    owned_role($conn, $store['id'], $roleId);

    $conn->beginTransaction();
    $userId = null;
    if ($f['email']) {
        $stmt = $conn->prepare('SELECT id, account_type FROM users WHERE LOWER(email) = ?');
        $stmt->execute([$f['email']]);
        $existing = $stmt->fetch();
        if ($existing && $existing['account_type'] !== 'customer') {
            $conn->rollBack();
            fail('That email belongs to a seller account.');
        }
        $userId = $existing ? (int) $existing['id'] : null;
    }

    if ($userId) {
        $member = $conn->prepare('SELECT 1 FROM store_members WHERE store_id = ? AND user_id = ?');
        $member->execute([$store['id'], $userId]);
        if ($member->fetch()) {
            $conn->rollBack();
            fail('That customer is already in your store.');
        }
        // Fill in a missing phone, never overwrite what they set themselves.
        if ($f['phone']) {
            $conn->prepare('UPDATE users SET phone = COALESCE(phone, ?) WHERE id = ?')->execute([$f['phone'], $userId]);
        }
    } else {
        $stmt = $conn->prepare(
            "INSERT INTO users (name, username, email, phone, password, account_type) VALUES (?, ?, ?, ?, NULL, 'customer') RETURNING id"
        );
        $stmt->execute([$f['name'], unique_username($conn, $f['name']), $f['email'], $f['phone']]);
        $userId = (int) $stmt->fetchColumn();
    }

    $stmt = $conn->prepare(
        'INSERT INTO store_members (store_id, user_id, role_id, notes, added_by_seller) VALUES (?, ?, ?, ?, TRUE) RETURNING id'
    );
    $stmt->execute([$store['id'], $userId, $roleId, $f['notes']]);
    $memberId = (int) $stmt->fetchColumn();
    $conn->commit();

    respond(['success' => true, 'member_id' => $memberId, 'linked_existing' => $f['email'] && !empty($existing)]);
}

/**
 * Edit a customer. Notes can always be changed. Name, email and phone only for
 * customers without a login (people with their own account manage those).
 * Inputs: member_id, name, email, phone, notes
 */
function update_customer($conn) {
    [, $store] = require_seller_store($conn);
    $stmt = $conn->prepare(
        'SELECT m.id, m.user_id, u.password IS NULL AS no_login FROM store_members m JOIN users u ON u.id = m.user_id
         WHERE m.id = ? AND m.store_id = ?'
    );
    $stmt->execute([(int) input('member_id'), $store['id']]);
    $member = $stmt->fetch();
    if (!$member) {
        fail('Customer not found in your store.', 404);
    }
    $f = customer_form_fields();

    $conn->beginTransaction();
    if ($member['no_login']) {
        if ($f['email']) {
            $dup = $conn->prepare('SELECT 1 FROM users WHERE LOWER(email) = ? AND id <> ?');
            $dup->execute([$f['email'], $member['user_id']]);
            if ($dup->fetch()) {
                $conn->rollBack();
                fail('Another account already uses that email.');
            }
        }
        $conn->prepare('UPDATE users SET name = ?, email = ?, phone = ?, updated_at = NOW() WHERE id = ?')
            ->execute([$f['name'], $f['email'], $f['phone'], $member['user_id']]);
    }
    $conn->prepare('UPDATE store_members SET notes = ?, updated_at = NOW() WHERE id = ?')->execute([$f['notes'], $member['id']]);
    $conn->commit();
    respond(['success' => true]);
}

/** "k7m2-qx9p" / "K7M2QX9P" -> "K7M2QX9P" (or '' if it can't be a code). */
function normalize_user_code($code) {
    $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $code));
    return preg_match('/^[A-Z0-9]{8}$/', $code) ? $code : '';
}

/**
 * Link a customer you added by hand (no login) to the account they made
 * themselves, using that account's code. Their tier, notes and this store's
 * invoices move to the real account; the hand-added entry is removed.
 * Inputs: member_id, code
 */
function link_customer_account($conn) {
    [, $store] = require_seller_store($conn);
    $code = normalize_user_code(input('code'));
    if ($code === '') {
        fail('Enter the 8-character code from the customer’s account page, e.g. K7M2-QX9P.');
    }

    $stmt = $conn->prepare(
        'SELECT m.id, m.user_id, m.role_id, m.notes, u.phone, u.password IS NULL AS no_login
         FROM store_members m JOIN users u ON u.id = m.user_id WHERE m.id = ? AND m.store_id = ?'
    );
    $stmt->execute([(int) input('member_id'), $store['id']]);
    $manual = $stmt->fetch();
    if (!$manual) {
        fail('Customer not found in your store.', 404);
    }
    if (!$manual['no_login']) {
        fail('This customer already has their own account.');
    }

    $stmt = $conn->prepare('SELECT id, name, account_type, password IS NOT NULL AS has_login FROM users WHERE code = ?');
    $stmt->execute([$code]);
    $target = $stmt->fetch();
    if (!$target) {
        fail('No account has that code. Check it with the customer.');
    }
    if ($target['account_type'] !== 'customer') {
        fail('That code belongs to a seller account.');
    }
    if (!$target['has_login']) {
        fail('That code belongs to another customer who has no login yet.');
    }
    $targetId = (int) $target['id'];
    $manualUserId = (int) $manual['user_id'];

    $conn->beginTransaction();

    // Membership: keep the tier and notes you set.
    $existing = $conn->prepare('SELECT id, notes FROM store_members WHERE store_id = ? AND user_id = ?');
    $existing->execute([$store['id'], $targetId]);
    $already = $existing->fetch();
    if ($already) {
        $notes = trim(implode("\n", array_filter([$already['notes'], $manual['notes']]))) ?: null;
        $conn->prepare('UPDATE store_members SET role_id = COALESCE(?, role_id), notes = ?, updated_at = NOW() WHERE id = ?')
            ->execute([$manual['role_id'], $notes, $already['id']]);
        $conn->prepare('DELETE FROM store_members WHERE id = ?')->execute([$manual['id']]);
    } else {
        $conn->prepare('UPDATE store_members SET user_id = ?, updated_at = NOW() WHERE id = ?')->execute([$targetId, $manual['id']]);
    }

    // This store's invoices for the hand-added customer now belong to the real account.
    $conn->prepare('UPDATE invoices SET customer_user_id = ? WHERE store_id = ? AND customer_user_id = ?')
        ->execute([$targetId, $store['id'], $manualUserId]);

    // Keep a phone number we knew if they didn't give one.
    if ($manual['phone']) {
        $conn->prepare('UPDATE users SET phone = COALESCE(phone, ?) WHERE id = ?')->execute([$manual['phone'], $targetId]);
    }

    // Remove the hand-added account if no other store uses it.
    $left = $conn->prepare('SELECT COUNT(*) FROM store_members WHERE user_id = ?');
    $left->execute([$manualUserId]);
    $otherInvoices = $conn->prepare('SELECT COUNT(*) FROM invoices WHERE customer_user_id = ?');
    $otherInvoices->execute([$manualUserId]);
    if ((int) $left->fetchColumn() === 0 && (int) $otherInvoices->fetchColumn() === 0) {
        $conn->prepare('DELETE FROM users WHERE id = ? AND password IS NULL')->execute([$manualUserId]);
    }

    $conn->commit();
    respond(['success' => true, 'name' => $target['name']]);
}
