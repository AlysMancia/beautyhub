<?php
/**
 * Payment methods (with attachments such as QR codes), payments on invoices
 * (with proof of payment) and releasing an invoice's items.
 */
if (!defined('BEAUTYHUB')) {
    exit;
}

const PAYMENT_KINDS = ['cash', 'gcash', 'maya', 'bank', 'card', 'cod', 'other'];
const MAX_METHOD_FILES = 6;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

/**
 * Saves an attachment: photos become WebP (+ thumbnail), PDFs are kept as is.
 * Returns ['path', 'thumb_path', 'mime', 'bytes'].
 */
function store_attachment($file, $storeId, $folder) {
    if ($file['mime'] === 'application/pdf') {
        if ($file['size'] > MAX_PDF_BYTES) {
            fail('PDF files can be up to 10 MB.');
        }
        [$abs, $public] = new_upload_path($storeId, $folder, 'pdf');
        if (!move_uploaded_file($file['tmp_name'], $abs)) {
            fail('Could not save the file.', 500);
        }
        return ['path' => $public, 'thumb_path' => null, 'mime' => 'application/pdf', 'bytes' => (int) $file['size']];
    }
    if (!isset(IMAGE_TYPES[$file['mime']])) {
        fail('Attachments must be a photo (JPG, PNG, WebP) or a PDF.');
    }
    return store_photo($file, $storeId, $folder, 1600, 400);
}

/** The optional uploaded file in $_FILES['file'], or null when none was sent. */
function optional_upload() {
    $f = $_FILES['file'] ?? null;
    if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        return null;
    }
    return uploaded_file();
}

/* ---------------- payment methods ---------------- */

/** A store's payment methods with their attachments. */
function payment_methods($conn, $storeId, $activeOnly = false) {
    $stmt = $conn->prepare(
        'SELECT id, kind, name, account_name, account_number, instructions, is_active
         FROM payment_methods WHERE store_id = ?' . ($activeOnly ? ' AND is_active' : '') . '
         ORDER BY sort_order, id'
    );
    $stmt->execute([$storeId]);
    $methods = $stmt->fetchAll();
    if (!$methods) {
        return [];
    }
    $ids = array_column($methods, 'id');
    $files = $conn->prepare(
        'SELECT id, payment_method_id, path, thumb_path, mime, original_name FROM payment_method_files
         WHERE payment_method_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ') ORDER BY id'
    );
    $files->execute($ids);
    $byMethod = [];
    foreach ($files->fetchAll() as $f) {
        $byMethod[$f['payment_method_id']][] = [
            'id' => (int) $f['id'], 'path' => $f['path'], 'thumb_path' => $f['thumb_path'],
            'mime' => $f['mime'], 'name' => $f['original_name'],
        ];
    }
    return array_map(fn ($m) => [
        'id' => (int) $m['id'],
        'kind' => $m['kind'],
        'name' => $m['name'],
        'account_name' => $m['account_name'],
        'account_number' => $m['account_number'],
        'instructions' => $m['instructions'],
        'is_active' => (bool) $m['is_active'],
        'files' => $byMethod[$m['id']] ?? [],
    ], $methods);
}

function owned_payment_method($conn, $storeId, $id) {
    $stmt = $conn->prepare('SELECT * FROM payment_methods WHERE id = ? AND store_id = ?');
    $stmt->execute([(int) $id, $storeId]);
    $row = $stmt->fetch();
    if (!$row) {
        fail('Payment method not found.', 404);
    }
    return $row;
}

function list_payment_methods($conn) {
    [, $store] = require_seller_store($conn);
    respond(['success' => true, 'methods' => payment_methods($conn, $store['id']), 'kinds' => PAYMENT_KINDS]);
}

/** Create or update. Inputs: id?, kind, name, account_name, account_number, instructions, is_active. */
function save_payment_method($conn) {
    [, $store] = require_seller_store($conn);
    $kind = input('kind') ?: 'other';
    $name = input('name');
    if (!in_array($kind, PAYMENT_KINDS, true)) {
        fail('Unknown payment type.');
    }
    if ($name === '' || mb_strlen($name) > 80) {
        fail('Give the payment method a name (up to 80 characters).');
    }
    $values = [
        $kind, $name,
        mb_substr(input('account_name'), 0, 120) ?: null,
        mb_substr(input('account_number'), 0, 80) ?: null,
        input('instructions') ?: null,
        input('is_active') === '0' ? 'false' : 'true',
    ];
    if ((int) input('id')) {
        owned_payment_method($conn, $store['id'], input('id'));
        $conn->prepare(
            'UPDATE payment_methods SET kind = ?, name = ?, account_name = ?, account_number = ?, instructions = ?, is_active = ?, updated_at = NOW()
             WHERE id = ? AND store_id = ?'
        )->execute([...$values, (int) input('id'), $store['id']]);
    } else {
        $conn->prepare(
            'INSERT INTO payment_methods (kind, name, account_name, account_number, instructions, is_active, store_id, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM payment_methods WHERE store_id = ?))'
        )->execute([...$values, $store['id'], $store['id']]);
    }
    respond(['success' => true, 'methods' => payment_methods($conn, $store['id'])]);
}

function delete_payment_method($conn) {
    [, $store] = require_seller_store($conn);
    $method = owned_payment_method($conn, $store['id'], input('id'));
    $files = $conn->prepare('SELECT path, thumb_path FROM payment_method_files WHERE payment_method_id = ?');
    $files->execute([$method['id']]);
    foreach ($files->fetchAll() as $f) {
        delete_upload($f['path']);
        delete_upload($f['thumb_path']);
    }
    // Past payments keep the method's name (method_name); their link is cleared.
    $conn->prepare('DELETE FROM payment_methods WHERE id = ?')->execute([$method['id']]);
    respond(['success' => true, 'methods' => payment_methods($conn, $store['id'])]);
}

/** Inputs: id (method), file. */
function upload_payment_method_file($conn) {
    [, $store] = require_seller_store($conn);
    $method = owned_payment_method($conn, $store['id'], input('id'));
    $count = $conn->prepare('SELECT COUNT(*) FROM payment_method_files WHERE payment_method_id = ?');
    $count->execute([$method['id']]);
    if ((int) $count->fetchColumn() >= MAX_METHOD_FILES) {
        fail('A payment method can have up to ' . MAX_METHOD_FILES . ' attachments.');
    }
    $file = uploaded_file();
    $saved = store_attachment($file, $store['id'], 'payments');
    $conn->prepare(
        'INSERT INTO payment_method_files (payment_method_id, path, thumb_path, mime, original_name, bytes) VALUES (?, ?, ?, ?, ?, ?)'
    )->execute([$method['id'], $saved['path'], $saved['thumb_path'], $saved['mime'], mb_substr(basename($file['name']), 0, 255), $saved['bytes']]);
    respond(['success' => true, 'methods' => payment_methods($conn, $store['id'])]);
}

/** Inputs: id (file). */
function delete_payment_method_file($conn) {
    [, $store] = require_seller_store($conn);
    $stmt = $conn->prepare(
        'SELECT f.* FROM payment_method_files f JOIN payment_methods m ON m.id = f.payment_method_id
         WHERE f.id = ? AND m.store_id = ?'
    );
    $stmt->execute([(int) input('id'), $store['id']]);
    $file = $stmt->fetch();
    if (!$file) {
        fail('Attachment not found.', 404);
    }
    delete_upload($file['path']);
    delete_upload($file['thumb_path']);
    $conn->prepare('DELETE FROM payment_method_files WHERE id = ?')->execute([$file['id']]);
    respond(['success' => true, 'methods' => payment_methods($conn, $store['id'])]);
}

/* ---------------- payments on invoices ---------------- */

/** Recounts the confirmed payments and sets amount_paid + payment_status. */
function recompute_payment($conn, $invoiceId) {
    $conn->prepare(
        "UPDATE invoices i SET
             amount_paid = p.paid,
             payment_status = CASE
                 WHEN p.paid <= 0 THEN 'unpaid'
                 WHEN p.paid < i.total THEN 'partial'
                 WHEN p.paid = i.total THEN 'paid'
                 ELSE 'overpaid' END
         FROM (SELECT COALESCE(SUM(amount), 0) AS paid FROM invoice_payments WHERE invoice_id = ? AND status = 'confirmed') p
         WHERE i.id = ?"
    )->execute([$invoiceId, $invoiceId]);
}

/** Payments on an invoice, newest last. */
function invoice_payments($conn, $invoiceId) {
    $stmt = $conn->prepare(
        'SELECT p.id, p.payment_method_id, p.method_name, p.amount, p.paid_on, p.reference, p.note,
                p.proof_path, p.proof_thumb, p.proof_mime, p.status, p.created_at, u.name AS added_by
         FROM invoice_payments p LEFT JOIN users u ON u.id = p.created_by
         WHERE p.invoice_id = ? ORDER BY p.paid_on, p.id'
    );
    $stmt->execute([$invoiceId]);
    return array_map(function ($p) {
        $p['id'] = (int) $p['id'];
        $p['payment_method_id'] = $p['payment_method_id'] === null ? null : (int) $p['payment_method_id'];
        return $p;
    }, $stmt->fetchAll());
}

/** Validated payment fields from the request: [method id, method name, amount, paid on, reference, note]. */
function payment_fields($conn, $storeId) {
    $amount = parse_money(input('amount'), 'Amount');
    if ($amount === null || (float) $amount <= 0) {
        fail('Enter the amount paid.');
    }
    $methodId = (int) input('payment_method_id') ?: null;
    $methodName = null;
    if ($methodId) {
        $methodName = owned_payment_method($conn, $storeId, $methodId)['name'];
    } elseif (input('method_name') !== '') {
        $methodName = mb_substr(input('method_name'), 0, 80);
    }
    $paidOn = input('paid_on') ?: date('Y-m-d');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $paidOn) || !strtotime($paidOn)) {
        fail('Payment date must be a valid date.');
    }
    return [$methodId, $methodName, $amount, $paidOn, mb_substr(input('reference'), 0, 120) ?: null, input('note') ?: null];
}

function insert_payment($conn, $invoice, $storeId, $userId, $status) {
    [$methodId, $methodName, $amount, $paidOn, $reference, $note] = payment_fields($conn, $storeId);
    $file = optional_upload();
    $proof = $file ? store_attachment($file, $storeId, 'payment-proofs') : null;
    $conn->prepare(
        'INSERT INTO invoice_payments (invoice_id, payment_method_id, method_name, amount, paid_on, reference, note,
                                       proof_path, proof_thumb, proof_mime, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        $invoice['id'], $methodId, $methodName, $amount, $paidOn, $reference, $note,
        $proof['path'] ?? null, $proof['thumb_path'] ?? null, $proof['mime'] ?? null, $status, $userId,
    ]);
    recompute_payment($conn, $invoice['id']);
}

function payable_invoice($conn, $invoiceId, $storeId = null, $customerId = null) {
    $invoice = load_invoice($conn, $invoiceId, $storeId, $customerId);
    if (!$invoice) {
        fail('Invoice not found.', 404);
    }
    if (in_array($invoice['status'], ['rejected', 'cancelled'], true)) {
        fail('This invoice was ' . $invoice['status'] . ', so it takes no payments.');
    }
    return $invoice;
}

/** Seller records a payment (counted right away). Inputs: invoice_id, amount, payment_method_id, paid_on, reference, note, file?. */
function add_payment($conn) {
    [$user, $store] = require_seller_store($conn);
    $invoice = payable_invoice($conn, input('invoice_id'), $store['id']);
    insert_payment($conn, $invoice, $store['id'], $user['id'], 'confirmed');
    respond(['success' => true, 'invoice' => load_invoice($conn, $invoice['id'], $store['id'])]);
}

/**
 * One click: records the remaining balance as paid today.
 * Inputs: invoice_id, payment_method_id? (else "Marked paid").
 */
function mark_paid($conn) {
    [$user, $store] = require_seller_store($conn);
    $invoice = payable_invoice($conn, input('invoice_id'), $store['id']);
    $balance = round((float) $invoice['total'] - (float) $invoice['amount_paid'], 2);
    if ($balance <= 0) {
        fail('This invoice is already fully paid.');
    }
    $methodId = (int) input('payment_method_id') ?: null;
    $methodName = $methodId ? owned_payment_method($conn, $store['id'], $methodId)['name'] : 'Marked paid';
    $conn->prepare(
        "INSERT INTO invoice_payments (invoice_id, payment_method_id, method_name, amount, paid_on, status, created_by)
         VALUES (?, ?, ?, ?, CURRENT_DATE, 'confirmed', ?)"
    )->execute([$invoice['id'], $methodId, $methodName, number_format($balance, 2, '.', ''), $user['id']]);
    recompute_payment($conn, $invoice['id']);
    respond(['success' => true, 'invoice' => load_invoice($conn, $invoice['id'], $store['id'])]);
}

/** Customer sends a payment for their own order; the seller checks it. Same inputs as add_payment. */
function submit_payment($conn) {
    $user = require_user($conn, 'customer');
    $invoice = payable_invoice($conn, input('invoice_id'), null, $user['id']);
    if (!optional_upload() && input('reference') === '') {
        fail('Add the reference number or a photo of your receipt so the seller can check it.');
    }
    insert_payment($conn, $invoice, $invoice['store_id'], $user['id'], 'pending');
    notify_store_owner($conn, $invoice['store_id'], 'payment_submitted', "{$user['name']} sent a payment for {$invoice['invoice_no']}",
        '₱' . number_format((float) input('amount'), 2) . ' · check it and confirm', "/dashboard/invoices/{$invoice['id']}");
    respond(['success' => true, 'invoice' => load_invoice($conn, $invoice['id'], null, $user['id'])]);
}

/** Seller confirms or rejects a customer's payment. Inputs: id, decision (confirm|reject). */
function review_payment($conn) {
    [, $store] = require_seller_store($conn);
    $payment = owned_payment($conn, $store['id'], input('id'));
    $status = ['confirm' => 'confirmed', 'reject' => 'rejected'][input('decision')] ?? null;
    if (!$status) {
        fail('Choose confirm or reject.');
    }
    $conn->prepare('UPDATE invoice_payments SET status = ?, updated_at = NOW() WHERE id = ?')->execute([$status, $payment['id']]);
    recompute_payment($conn, $payment['invoice_id']);
    $inv = load_invoice($conn, $payment['invoice_id'], $store['id']);
    notify($conn, $inv['customer_user_id'], "payment_$status",
        $status === 'confirmed'
            ? "{$store['name']} confirmed your " . '₱' . number_format((float) $payment['amount'], 2) . " payment"
            : "{$store['name']} could not confirm your " . '₱' . number_format((float) $payment['amount'], 2) . " payment",
        "{$inv['invoice_no']}" . ($status === 'confirmed' ? ($inv['payment_status'] === 'paid' ? ' is fully paid.' : ' · balance ' . '₱' . number_format((float) $inv['balance'], 2)) : ' · please check and send it again.'),
        "/account/orders/{$inv['id']}");
    respond(['success' => true, 'invoice' => load_invoice($conn, $payment['invoice_id'], $store['id'])]);
}

/** Inputs: id. */
function delete_payment($conn) {
    [, $store] = require_seller_store($conn);
    $payment = owned_payment($conn, $store['id'], input('id'));
    delete_upload($payment['proof_path']);
    delete_upload($payment['proof_thumb']);
    $conn->prepare('DELETE FROM invoice_payments WHERE id = ?')->execute([$payment['id']]);
    recompute_payment($conn, $payment['invoice_id']);
    respond(['success' => true, 'invoice' => load_invoice($conn, $payment['invoice_id'], $store['id'])]);
}

function owned_payment($conn, $storeId, $id) {
    $stmt = $conn->prepare(
        'SELECT p.* FROM invoice_payments p JOIN invoices i ON i.id = p.invoice_id WHERE p.id = ? AND i.store_id = ?'
    );
    $stmt->execute([(int) $id, $storeId]);
    $payment = $stmt->fetch();
    if (!$payment) {
        fail('Payment not found.', 404);
    }
    return $payment;
}

/* ---------------- release ---------------- */

/**
 * Marks an invoice's items as released (handed over / shipped) or open again.
 * Inputs: invoice_id, status (open|released), released_to, note.
 */
function set_release($conn) {
    [, $store] = require_seller_store($conn);
    $invoice = load_invoice($conn, input('invoice_id'), $store['id']);
    if (!$invoice) {
        fail('Invoice not found.', 404);
    }
    if ($invoice['status'] !== 'confirmed') {
        fail('Only confirmed invoices can be released.');
    }
    if (input('status') === 'released') {
        $to = mb_substr(input('released_to'), 0, 160);
        if ($to === '') {
            fail('Who were the items released to?');
        }
        $conn->prepare(
            "UPDATE invoices SET release_status = 'released', released_to = ?, release_note = ?, released_at = NOW(), updated_at = NOW() WHERE id = ?"
        )->execute([$to, input('note') ?: null, $invoice['id']]);
        notify($conn, $invoice['customer_user_id'], 'order_released', "Your order {$invoice['invoice_no']} is on its way",
            "Released to $to" . (input('note') ? ' · ' . input('note') : ''), "/account/orders/{$invoice['id']}");
    } else {
        $conn->prepare(
            "UPDATE invoices SET release_status = 'open', released_to = NULL, release_note = NULL, released_at = NULL, updated_at = NOW() WHERE id = ?"
        )->execute([$invoice['id']]);
    }
    respond(['success' => true, 'invoice' => load_invoice($conn, $invoice['id'], $store['id'])]);
}
