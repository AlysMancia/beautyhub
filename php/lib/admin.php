<?php
/**
 * Admin: manage every account (sellers, customers and other admins).
 * Only accounts with account_type = 'admin' can call these.
 */
if (!defined('BEAUTYHUB')) {
    exit;
}

const ACCOUNT_TYPES = ['admin', 'seller', 'customer'];

function require_admin($conn) {
    return require_user($conn, 'admin');
}

/** Totals for the admin home. */
function admin_overview($conn) {
    require_admin($conn);
    $types = $conn->query(
        "SELECT account_type, COUNT(*) AS total, COUNT(*) FILTER (WHERE NOT is_active) AS off FROM users GROUP BY account_type"
    )->fetchAll();
    $sales = $conn->query(
        "SELECT COUNT(*) AS invoices, COALESCE(SUM(total), 0) AS total FROM invoices WHERE status = 'confirmed'"
    )->fetch();
    $recent = $conn->query(
        'SELECT id, name, username, email, account_type, is_active, created_at FROM users ORDER BY created_at DESC, id DESC LIMIT 8'
    )->fetchAll();
    respond([
        'success' => true,
        'types' => $types,
        'stores' => (int) $conn->query('SELECT COUNT(*) FROM stores')->fetchColumn(),
        'sales' => $sales,
        'recent' => array_map('admin_user_row', $recent),
    ]);
}

function admin_user_row($u) {
    return [
        'id' => (int) $u['id'],
        'name' => $u['name'],
        'username' => $u['username'],
        'email' => $u['email'],
        'phone' => $u['phone'] ?? null,
        'code' => $u['code'] ?? null,
        'account_type' => $u['account_type'],
        'is_active' => (bool) $u['is_active'],
        'has_password' => array_key_exists('has_password', $u) ? (bool) $u['has_password'] : null,
        'created_at' => $u['created_at'],
        'store_name' => $u['store_name'] ?? null,
        'store_slug' => $u['store_slug'] ?? null,
        'store_count' => isset($u['store_count']) ? (int) $u['store_count'] : null,
    ];
}

/** One page of accounts. Inputs: page, per_page, q, type, status (active|off). */
function admin_list_users($conn) {
    require_admin($conn);
    [$page, $perPage] = page_params(25, 100);
    $where = 'TRUE';
    $params = [];
    if (in_array(input('type'), ACCOUNT_TYPES, true)) {
        $where .= ' AND u.account_type = ?';
        $params[] = input('type');
    }
    if (input('status') === 'active') {
        $where .= ' AND u.is_active';
    } elseif (input('status') === 'off') {
        $where .= ' AND NOT u.is_active';
    }
    [$searchSql, $searchParams] = search_sql(input('q'), ['u.name', 'u.username', 'u.email', 'u.code', 'u.phone', 's.name']);
    $where .= $searchSql;
    $params = array_merge($params, $searchParams);

    $from = 'FROM users u LEFT JOIN stores s ON s.owner_id = u.id';
    $count = $conn->prepare("SELECT COUNT(*) $from WHERE $where");
    $count->execute($params);
    $stmt = $conn->prepare(
        "SELECT u.id, u.name, u.username, u.email, u.phone, u.code, u.account_type, u.is_active, u.created_at,
                u.password IS NOT NULL AS has_password, s.name AS store_name, s.slug AS store_slug,
                (SELECT COUNT(*) FROM store_members m WHERE m.user_id = u.id) AS store_count
         $from WHERE $where
         ORDER BY u.created_at DESC, u.id DESC LIMIT ? OFFSET ?"
    );
    $stmt->execute(array_merge($params, [$perPage, ($page - 1) * $perPage]));
    $counts = $conn->query('SELECT account_type, COUNT(*) FROM users GROUP BY account_type')->fetchAll(PDO::FETCH_KEY_PAIR);
    respond([
        'success' => true,
        'users' => array_map('admin_user_row', $stmt->fetchAll()),
        'total' => (int) $count->fetchColumn(),
        'page' => $page,
        'per_page' => $perPage,
        'counts' => $counts,
    ]);
}

function admin_target($conn, $id) {
    $stmt = $conn->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([(int) $id]);
    $user = $stmt->fetch();
    if (!$user) {
        fail('Account not found.', 404);
    }
    return $user;
}

/** Checks name/username/email/phone from the request; returns them cleaned. */
function admin_profile_fields($conn, $exceptId = 0) {
    $name = mb_substr(input('name'), 0, 255);
    $username = strtolower(input('username'));
    $email = strtolower(input('email'));
    $phone = mb_substr(input('phone'), 0, 30) ?: null;
    if ($name === '') {
        fail('Enter a name.');
    }
    if (!preg_match('/^[a-z0-9_.]{3,30}$/', $username)) {
        fail('Username must be 3-30 characters: letters, numbers, _ or .');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        fail('Enter a valid email address.');
    }
    $taken = $conn->prepare(
        'SELECT LOWER(email) = ? AS email_taken FROM users WHERE (LOWER(email) = ? OR LOWER(username) = ?) AND id <> ? LIMIT 1'
    );
    $taken->execute([$email, $email, $username, $exceptId]);
    if ($row = $taken->fetch()) {
        fail($row['email_taken'] ? 'Another account already uses that email.' : 'That username is taken.');
    }
    return [$name, $username, $email, $phone];
}

/** Inputs: id, name, username, email, phone. */
function admin_update_user($conn) {
    require_admin($conn);
    $target = admin_target($conn, input('id'));
    [$name, $username, $email, $phone] = admin_profile_fields($conn, (int) $target['id']);
    $conn->prepare('UPDATE users SET name = ?, username = ?, email = ?, phone = ?, updated_at = NOW() WHERE id = ?')
        ->execute([$name, $username, $email, $phone, $target['id']]);
    respond(['success' => true]);
}

/** Inputs: id, password. Logs that account out everywhere. */
function admin_set_password($conn) {
    require_admin($conn);
    $target = admin_target($conn, input('id'));
    $password = input('password');
    if (strlen($password) < 6) {
        fail('Password must be at least 6 characters.');
    }
    $conn->prepare('UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?')
        ->execute([password_hash($password, PASSWORD_DEFAULT), $target['id']]);
    forget_all_remember_tokens($conn, (int) $target['id']);
    respond(['success' => true]);
}

/** Inputs: id, active (1|0). A turned-off account cannot log in, and a seller's store page is hidden. */
function admin_set_active($conn) {
    $admin = require_admin($conn);
    $target = admin_target($conn, input('id'));
    $active = input('active') === '1';
    if ((int) $target['id'] === (int) $admin['id'] && !$active) {
        fail('You cannot turn off your own account.');
    }
    $conn->prepare('UPDATE users SET is_active = ?, updated_at = NOW() WHERE id = ?')
        ->execute([$active ? 'true' : 'false', $target['id']]);
    if (!$active) {
        forget_all_remember_tokens($conn, (int) $target['id']);
    }
    respond(['success' => true]);
}

/**
 * New account. Inputs: account_type, name, username, email, phone, password,
 * store_name (sellers).
 */
function admin_create_user($conn) {
    require_admin($conn);
    $type = input('account_type');
    if (!in_array($type, ACCOUNT_TYPES, true)) {
        fail('Choose admin, seller or customer.');
    }
    [$name, $username, $email, $phone] = admin_profile_fields($conn);
    $password = input('password');
    if (strlen($password) < 6) {
        fail('Password must be at least 6 characters.');
    }
    $storeName = mb_substr(input('store_name'), 0, 120);
    if ($type === 'seller' && $storeName === '') {
        fail('Enter the seller\'s store name.');
    }

    $conn->beginTransaction();
    $stmt = $conn->prepare(
        'INSERT INTO users (name, username, email, phone, password, account_type) VALUES (?, ?, ?, ?, ?, ?) RETURNING id'
    );
    $stmt->execute([$name, $username, $email, $phone, password_hash($password, PASSWORD_DEFAULT), $type]);
    $userId = (int) $stmt->fetchColumn();
    if ($type === 'seller') {
        $stmt = $conn->prepare('INSERT INTO stores (owner_id, slug, name) VALUES (?, ?, ?) RETURNING id');
        $stmt->execute([$userId, unique_store_slug($conn, $storeName), $storeName]);
        $conn->prepare('SELECT seed_store_defaults(?)')->execute([(int) $stmt->fetchColumn()]);
    }
    $conn->commit();
    respond(['success' => true, 'id' => $userId]);
}

/**
 * Deletes an account for good. A seller's store, products, invoices and
 * uploaded files go with it. Inputs: id, confirm (must equal the username).
 */
function admin_delete_user($conn) {
    $admin = require_admin($conn);
    $target = admin_target($conn, input('id'));
    if ((int) $target['id'] === (int) $admin['id']) {
        fail('You cannot delete your own account.');
    }
    if (strtolower(input('confirm')) !== strtolower((string) $target['username'])) {
        fail('Type the username to confirm.');
    }
    $store = $conn->prepare('SELECT id FROM stores WHERE owner_id = ?');
    $store->execute([$target['id']]);
    $storeId = $store->fetchColumn();

    $conn->prepare('DELETE FROM users WHERE id = ?')->execute([$target['id']]);

    if ($storeId) {
        remove_tree(uploads_root() . '/store-' . (int) $storeId);
    }
    respond(['success' => true]);
}

/** Deletes a folder of uploads (used when a store is deleted). */
function remove_tree($dir) {
    if (!is_dir($dir) || !str_starts_with(realpath($dir), realpath(uploads_root()))) {
        return;
    }
    $items = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($items as $item) {
        $item->isDir() ? @rmdir($item->getPathname()) : @unlink($item->getPathname());
    }
    @rmdir($dir);
}
