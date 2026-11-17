<?php
/**
 * Invoices and customer orders.
 *
 *  - The seller creates an invoice -> 'confirmed' at once, stock is deducted.
 *  - A customer places an order from the store page -> 'pending'. Prices come
 *    from the customer's role. The seller can edit items/prices/discount, then
 *    approve (stock deducted) or reject.
 *  - A confirmed invoice can be cancelled -> stock is returned.
 */
if (!defined('BEAUTYHUB')) {
    exit;
}

const MAX_INVOICE_LINES = 200;

/* ---------------- pricing ---------------- */

/**
 * Selling price and cost for each product for a tier: the tier's own price, else
 * the next tier up that has one (see tier_price() in 006_role_tiers.sql); an
 * active promo applies when it is lower. Returns
 * [product_id => ['price' => ?, 'cost' => ?, 'name' => ..., ...]] for the store's products.
 */
function prices_for_role($conn, $store, array $productIds, $roleId) {
    if (!$productIds) {
        return [];
    }
    $roleId = (int) $roleId ?: default_role_id($conn, $store['id']);
    $in = implode(',', array_fill(0, count($productIds), '?'));
    $stmt = $conn->prepare(
        "SELECT p.id, p.name, p.is_active, p.stock_qty, p.has_variants, p.variant_label, p.promo_price, p.promo_type, p.promo_until,
                b.name AS brand, u.code AS uom,
                tier_price(p.id, ?) AS price,
                tier_price(p.id, ?) AS cost
         FROM product_details p
         LEFT JOIN brands b ON b.id = p.brand_id
         LEFT JOIN uoms u ON u.id = p.uom_id
         WHERE p.store_id = ? AND p.id IN ($in)"
    );
    $stmt->execute(array_merge([(int) $roleId, (int) $store['cost_role_id'], $store['id']], $productIds));

    $out = [];
    foreach ($stmt->fetchAll() as $row) {
        $price = $row['price'];
        if (promo_is_active($row) && ($price === null || (float) $row['promo_price'] < (float) $price)) {
            $price = $row['promo_price'];
        }
        $row['price'] = $price;
        $out[(int) $row['id']] = $row;
    }
    return $out;
}

/* ---------------- helpers ---------------- */

function next_invoice_no($conn, $storeId) {
    // Lock the store row so two invoices can't get the same number.
    $conn->prepare('SELECT id FROM stores WHERE id = ? FOR UPDATE')->execute([$storeId]);
    // Numbers of deleted invoices are never reused (the highest one is remembered).
    $stmt = $conn->prepare(
        "SELECT GREATEST(
                    COALESCE(MAX(CAST(substring(invoice_no FROM '[0-9]+$') AS INTEGER)), 0),
                    COALESCE((SELECT value::int FROM app_settings WHERE key = ?), 0)
                ) + 1
         FROM invoices WHERE store_id = ?"
    );
    $stmt->execute(["last_deleted_invoice:$storeId", $storeId]);
    return 'INV-' . str_pad((string) $stmt->fetchColumn(), 6, '0', STR_PAD_LEFT);
}

/**
 * Deletes an invoice for good. A confirmed one puts its items back in stock
 * first (the stock history keeps a "deleted" note). Payments and their
 * receipts go with it. Inputs: id.
 */
function delete_invoice($conn) {
    [$user, $store] = require_seller_store($conn);
    $conn->beginTransaction();
    $invoice = load_invoice($conn, input('id'), $store['id']);
    if (!$invoice) {
        $conn->rollBack();
        fail('Invoice not found.', 404);
    }
    try {
        if ($invoice['status'] === 'confirmed') {
            foreach ($invoice['items'] as $it) {
                if ($it['product_id']) {
                    apply_stock_change($conn, $store['id'], $it['product_id'], $it['qty'], 'invoice_deleted', $user['id'], null,
                        "{$invoice['invoice_no']} (deleted)", $it['variant_id'] ? (int) $it['variant_id'] : null);
                }
            }
        }
    } catch (ProductError $e) {
        $conn->rollBack();
        fail($e->getMessage());
    }
    // Earlier stock moves of this invoice keep their note, but no longer point to it.
    $conn->prepare('UPDATE inventory_movements SET invoice_id = NULL WHERE invoice_id = ?')->execute([$invoice['id']]);
    $number = (int) preg_replace('/\D/', '', $invoice['invoice_no']);
    $conn->prepare(
        "INSERT INTO app_settings (key, value) VALUES (?, ?)
         ON CONFLICT (key) DO UPDATE SET value = GREATEST(app_settings.value::int, EXCLUDED.value::int)::text, updated_at = NOW()"
    )->execute(["last_deleted_invoice:{$store['id']}", (string) $number]);
    $conn->prepare('DELETE FROM invoices WHERE id = ?')->execute([$invoice['id']]);
    $conn->commit();

    foreach ($invoice['payments'] as $p) {
        delete_upload($p['proof_path']);
        delete_upload($p['proof_thumb']);
    }
    respond(['success' => true, 'restocked' => $invoice['status'] === 'confirmed']);
}

function load_invoice($conn, $invoiceId, $storeId = null, $customerId = null) {
    $sql = 'SELECT i.*, s.name AS store_name, s.slug AS store_slug, s.logo_path AS store_logo,
                   s.street_address, s.barangay_name, s.city_name, s.province_name, s.postal_code
            FROM invoices i JOIN stores s ON s.id = i.store_id WHERE i.id = ?';
    $params = [(int) $invoiceId];
    if ($storeId !== null) {
        $sql .= ' AND i.store_id = ?';
        $params[] = $storeId;
    }
    if ($customerId !== null) {
        $sql .= ' AND i.customer_user_id = ?';
        $params[] = $customerId;
    }
    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    $invoice = $stmt->fetch();
    if (!$invoice) {
        return null;
    }
    // Each line shows the product's cover photo, if it has one.
    $items = $conn->prepare(
        'SELECT ii.*, COALESCE(
                    (SELECT pm.thumb_path FROM product_variants pv JOIN product_media pm ON pm.id = pv.media_id WHERE pv.id = ii.variant_id),
                    (SELECT thumb_path FROM product_media pm WHERE pm.product_id = ii.product_id AND pm.is_cover LIMIT 1)
                ) AS image
         FROM invoice_items ii WHERE ii.invoice_id = ? ORDER BY ii.sort_order, ii.id'
    );
    $items->execute([$invoice['id']]);
    $invoice['items'] = array_map(function ($it) {
        foreach (['id', 'product_id', 'qty'] as $k) {
            $it[$k] = $it[$k] === null ? null : (int) $it[$k];
        }
        return $it;
    }, $items->fetchAll());
    foreach (['id', 'store_id', 'customer_user_id', 'role_id'] as $k) {
        $invoice[$k] = $invoice[$k] === null ? null : (int) $invoice[$k];
    }
    $invoice['payments'] = invoice_payments($conn, $invoice['id']);
    $invoice['balance'] = number_format(max(0, (float) $invoice['total'] - (float) $invoice['amount_paid']), 2, '.', '');
    // How to pay: the store's active payment methods (with QR codes etc.).
    $invoice['payment_methods'] = payment_methods($conn, $invoice['store_id'], true);
    return $invoice;
}

/** Replaces an invoice's lines and totals. $lines: [['product' => row, 'qty' => n, 'unit_price' => '0.00']] */
function write_invoice_lines($conn, $invoiceId, array $lines, $discount) {
    $conn->prepare('DELETE FROM invoice_items WHERE invoice_id = ?')->execute([$invoiceId]);
    $insert = $conn->prepare(
        'INSERT INTO invoice_items (invoice_id, product_id, variant_id, variant_name, product_name, brand_name, uom, qty, unit_price, unit_cost, line_total, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $subtotal = 0.0;
    foreach ($lines as $i => $line) {
        $p = $line['product'];
        $lineTotal = round($line['qty'] * (float) $line['unit_price'], 2);
        $subtotal += $lineTotal;
        $insert->execute([
            $invoiceId, $p['id'], $line['variant']['id'] ?? null, $line['variant']['name'] ?? null, $p['name'], $p['brand'], $p['uom'], $line['qty'], $line['unit_price'],
            $p['cost'], number_format($lineTotal, 2, '.', ''), $i,
        ]);
    }
    if ((float) $discount > $subtotal) {
        throw new ProductError('The discount is bigger than the subtotal.');
    }
    $total = $subtotal - (float) $discount;
    $conn->prepare('UPDATE invoices SET subtotal = ?, discount = ?, total = ?, updated_at = NOW() WHERE id = ?')
        ->execute([number_format($subtotal, 2, '.', ''), $discount, number_format($total, 2, '.', ''), $invoiceId]);
    // A new total changes the payment status (e.g. paid -> partial after adding an item).
    recompute_payment($conn, $invoiceId);
}

/**
 * Validates posted item lines against the store's products.
 * $items: [{product_id, qty, unit_price?}]. When $pricesFromRole is true the
 * posted unit_price is ignored (customer orders).
 */
function build_lines($conn, $store, array $items, $roleId, $pricesFromRole) {
    if (count($items) === 0) {
        throw new ProductError('Add at least one product.');
    }
    if (count($items) > MAX_INVOICE_LINES) {
        throw new ProductError('Too many lines on one invoice (max ' . MAX_INVOICE_LINES . ').');
    }
    $ids = array_values(array_unique(array_map(fn ($it) => (int) ($it['product_id'] ?? 0), $items)));
    $products = prices_for_role($conn, $store, $ids, $roleId);
    $variantsByProduct = variants_for_products($conn, $ids);

    $lines = [];
    foreach ($items as $n => $it) {
        $pid = (int) ($it['product_id'] ?? 0);
        $product = $products[$pid] ?? null;
        if (!$product) {
            throw new ProductError('Line ' . ($n + 1) . ': product not found.');
        }
        $qty = $it['qty'] ?? '';
        if (!preg_match('/^\d{1,6}$/', (string) $qty) || (int) $qty < 1) {
            throw new ProductError("{$product['name']}: quantity must be a whole number of at least 1.");
        }
        if ($pricesFromRole) {
            if (!$product['is_active']) {
                throw new ProductError("{$product['name']} is not available.");
            }
            // (Variant products are priced per variant below.)
            if ($product['price'] === null && !$product['has_variants']) {
                throw new ProductError("{$product['name']} has no price yet. Please ask the seller.");
            }
            $unitPrice = $product['price'] === null ? null : number_format((float) $product['price'], 2, '.', '');
        } else {
            $unitPrice = money_or_error($it['unit_price'] ?? '', "{$product['name']} price");
            if ($unitPrice === null) {
                throw new ProductError("{$product['name']}: enter a price.");
            }
        }
        // Products with variants need one chosen (e.g. which shade).
        $variant = null;
        $followsProduct = true; // false when a variant has its own special price
        if ($product['has_variants']) {
            $vid = (int) ($it['variant_id'] ?? 0);
            foreach ($variantsByProduct[$pid] ?? [] as $v) {
                if ($v['id'] === $vid) {
                    $variant = $v;
                }
            }
            $label = strtolower($product['variant_label'] ?: 'variant');
            if (!$variant) {
                throw new ProductError("{$product['name']}: choose a $label.");
            }
            if ($pricesFromRole && !$variant['is_active']) {
                throw new ProductError("{$product['name']} – {$variant['name']} is not available.");
            }
            // A variant can have its own price (and cost).
            $vp = variant_prices_for_role($conn, $store, [$variant['id']], $roleId)[$variant['id']] ?? null;
            if ($vp) {
                $product['cost'] = $vp['cost'];
                if ($pricesFromRole) {
                    if ($vp['price'] === null) {
                        throw new ProductError("{$product['name']} – {$variant['name']} has no price yet. Please ask the seller.");
                    }
                    $unitPrice = number_format((float) $vp['price'], 2, '.', '');
                    $followsProduct = $product['price'] !== null && (float) $vp['price'] === (float) $product['price'];
                }
            }
        }
        $lines[] = ['product' => $product, 'variant' => $variant, 'qty' => (int) $qty, 'unit_price' => $unitPrice, 'follows_product' => $followsProduct];
    }

    // Quantity prices: the product's total on this order (all variants) decides the step.
    if ($pricesFromRole) {
        $breaks = qty_breaks($conn, $ids, (int) $roleId ?: default_role_id($conn, $store['id']));
        $totals = [];
        foreach ($lines as $l) {
            $totals[$l['product']['id']] = ($totals[$l['product']['id']] ?? 0) + $l['qty'];
        }
        foreach ($lines as &$l) {
            $pid = (int) $l['product']['id'];
            if ($l['follows_product'] && isset($breaks[$pid])) {
                $l['unit_price'] = price_at_qty($l['unit_price'], $breaks[$pid], $totals[$pid]);
            }
        }
        unset($l);
    }
    return $lines;
}

/**
 * Products (or variants) whose stock would go below zero.
 * $rows: [['product_id' => .., 'variant_id' => ?, 'qty' => ..]] (already summed).
 * Returns [['name' => .., 'stock' => .., 'qty' => ..]].
 */
function stock_shortages($conn, $storeId, array $rows) {
    $short = [];
    $product = $conn->prepare('SELECT name, stock_qty FROM product_details WHERE id = ? AND store_id = ? FOR UPDATE');
    $variant = $conn->prepare(
        'SELECT p.name || \' – \' || v.name AS name, v.stock_qty FROM product_variants v JOIN product_details p ON p.id = v.product_id
         WHERE v.id = ? AND v.store_id = ? FOR UPDATE'
    );
    foreach ($rows as $r) {
        $stmt = $r['variant_id'] ? $variant : $product;
        $stmt->execute([$r['variant_id'] ?: $r['product_id'], $storeId]);
        $p = $stmt->fetch();
        if ($p && (int) $p['stock_qty'] < (int) $r['qty']) {
            $short[] = ['name' => $p['name'], 'stock' => (int) $p['stock_qty'], 'qty' => (int) $r['qty']];
        }
    }
    return $short;
}

/** An invoice's quantities per product/variant: ["productId:variantId" => qty]. */
function invoice_quantities(array $items) {
    $qty = [];
    foreach ($items as $it) {
        if ($it['product_id']) {
            $key = $it['product_id'] . ':' . ($it['variant_id'] ?: '');
            $qty[$key] = ($qty[$key] ?? 0) + (int) $it['qty'];
        }
    }
    return $qty;
}

/**
 * After a confirmed invoice is edited: moves only the difference in stock
 * (more of an item = taken out, less or removed = put back). Fails with
 * `shortages` when stock would go below zero (never allowed).
 */
function apply_invoice_edit_stock($conn, $store, $userId, $invoiceId, $invoiceNo, array $before) {
    $items = $conn->prepare('SELECT product_id, variant_id, qty FROM invoice_items WHERE invoice_id = ?');
    $items->execute([$invoiceId]);
    $after = invoice_quantities($items->fetchAll());

    $changes = [];
    foreach (array_unique(array_merge(array_keys($before), array_keys($after))) as $key) {
        $diff = ($after[$key] ?? 0) - ($before[$key] ?? 0); // positive = more sold
        if ($diff !== 0) {
            [$productId, $variantId] = explode(':', $key);
            $changes[] = ['product_id' => (int) $productId, 'variant_id' => $variantId === '' ? null : (int) $variantId, 'qty' => $diff];
        }
    }

    $short = stock_shortages($conn, $store['id'], array_values(array_filter($changes, fn ($c) => $c['qty'] > 0)));
    if ($short) {
        $conn->rollBack();
        respond([
            'success' => false,
            'code' => 'insufficient_stock',
            'message' => short_stock_message($short),
            'shortages' => $short,
        ], 409);
    }
    foreach ($changes as $c) {
        apply_stock_change($conn, $store['id'], $c['product_id'], -$c['qty'], 'invoice_edited', $userId, $invoiceId, $invoiceNo, $c['variant_id']);
    }
}

/** "Not enough stock: X (only 2 left), Y (out of stock)." */
function short_stock_message(array $short) {
    $parts = array_map(fn ($s) => $s['stock'] <= 0 ? "{$s['name']} (out of stock)" : "{$s['name']} (only {$s['stock']} left, you asked for {$s['qty']})", $short);
    return 'Not enough stock: ' . implode('; ', $parts) . '.';
}

/** Fails (ProductError) when the lines ask for more than is in stock. $lines as from build_lines(). */
function assert_lines_in_stock($conn, $storeId, array $lines) {
    $rows = [];
    foreach ($lines as $l) {
        $key = $l['product']['id'] . ':' . ($l['variant']['id'] ?? '');
        $rows[$key] = [
            'product_id' => (int) $l['product']['id'],
            'variant_id' => isset($l['variant']['id']) ? (int) $l['variant']['id'] : null,
            'qty' => ($rows[$key]['qty'] ?? 0) + $l['qty'],
        ];
    }
    $short = stock_shortages($conn, $storeId, array_values($rows));
    if ($short) {
        throw new ProductError(short_stock_message($short));
    }
}

/** Deducts stock for a confirmed invoice (per variant). Fails with `shortages` when there isn't enough stock. */
function deduct_invoice_stock($conn, $store, $userId, $invoiceId, $invoiceNo) {
    $items = $conn->prepare(
        'SELECT product_id, variant_id, SUM(qty) AS qty FROM invoice_items
         WHERE invoice_id = ? AND product_id IS NOT NULL GROUP BY product_id, variant_id'
    );
    $items->execute([$invoiceId]);
    $rows = array_map(fn ($r) => [
        'product_id' => (int) $r['product_id'],
        'variant_id' => $r['variant_id'] === null ? null : (int) $r['variant_id'],
        'qty' => (int) $r['qty'],
    ], $items->fetchAll());

    $short = stock_shortages($conn, $store['id'], $rows);
    if ($short) {
        $conn->rollBack();
        respond([
            'success' => false,
            'code' => 'insufficient_stock',
            'message' => short_stock_message($short),
            'shortages' => $short,
        ], 409);
    }
    foreach ($rows as $r) {
        apply_stock_change($conn, $store['id'], $r['product_id'], -$r['qty'], 'invoice', $userId, $invoiceId, $invoiceNo, $r['variant_id']);
    }
}

function customer_role($conn, $storeId, $userId) {
    $stmt = $conn->prepare(
        'SELECT m.id AS member_id, u.name, u.email, u.phone, r.id AS role_id, r.name AS role_name
         FROM store_members m JOIN users u ON u.id = m.user_id LEFT JOIN store_roles r ON r.id = m.role_id
         WHERE m.store_id = ? AND m.user_id = ?'
    );
    $stmt->execute([$storeId, $userId]);
    return $stmt->fetch() ?: null;
}

function role_name($conn, $storeId, $roleId) {
    $stmt = $conn->prepare('SELECT name FROM store_roles WHERE id = ? AND store_id = ?');
    $stmt->execute([(int) $roleId, $storeId]);
    $name = $stmt->fetchColumn();
    return $name === false ? null : $name;
}

/* ---------------- seller ---------------- */

/**
 * One page of invoices. Inputs: page, per_page, status, q (number or customer),
 * payment (unpaid|partial|paid|overpaid|due = unpaid or partial), release (open|released).
 */
function list_invoices($conn) {
    [, $store] = require_seller_store($conn);
    [$page, $perPage] = page_params(25, 100);
    $where = 'store_id = ?';
    $params = [$store['id']];
    $status = input('status');
    if (in_array($status, ['pending', 'confirmed', 'rejected', 'cancelled'], true)) {
        $where .= ' AND status = ?';
        $params[] = $status;
    }
    $payment = input('payment');
    if ($payment === 'due') {
        $where .= " AND payment_status IN ('unpaid', 'partial') AND status IN ('pending', 'confirmed')";
    } elseif (in_array($payment, ['unpaid', 'partial', 'paid', 'overpaid'], true)) {
        $where .= ' AND payment_status = ?';
        $params[] = $payment;
    }
    if (in_array(input('release'), ['open', 'released'], true)) {
        $where .= " AND release_status = ? AND status = 'confirmed'";
        $params[] = input('release');
    }
    [$searchSql, $searchParams] = search_sql(input('q'), ['invoice_no', 'customer_name', 'customer_contact']);
    $where .= $searchSql;
    $params = array_merge($params, $searchParams);

    $count = $conn->prepare("SELECT COUNT(*) FROM invoices WHERE $where");
    $count->execute($params);

    $stmt = $conn->prepare(
        "SELECT id, invoice_no, source, status, customer_name, customer_user_id, role_name, total, created_at, confirmed_at,
                amount_paid, payment_status, release_status, released_to,
                (SELECT COUNT(*) FROM invoice_items WHERE invoice_id = invoices.id) AS line_count,
                (SELECT COUNT(*) FROM invoice_payments WHERE invoice_id = invoices.id AND status = 'pending') AS payments_to_check
         FROM invoices WHERE $where
         ORDER BY (status = 'pending') DESC, created_at DESC
         LIMIT ? OFFSET ?"
    );
    $stmt->execute(array_merge($params, [$perPage, ($page - 1) * $perPage]));

    $counts = $conn->prepare('SELECT status, COUNT(*) FROM invoices WHERE store_id = ? GROUP BY status');
    $counts->execute([$store['id']]);

    respond([
        'success' => true, 'invoices' => $stmt->fetchAll(), 'total' => (int) $count->fetchColumn(),
        'page' => $page, 'per_page' => $perPage, 'counts' => $counts->fetchAll(PDO::FETCH_KEY_PAIR),
    ]);
}

function get_invoice($conn) {
    $user = require_user($conn);
    if ($user['account_type'] === 'seller') {
        [, $store] = require_seller_store($conn);
        $invoice = load_invoice($conn, input('id'), $store['id']);
    } else {
        $invoice = load_invoice($conn, input('id'), null, $user['id']);
        if ($invoice) {
            // Customers don't see the seller's cost.
            $invoice['items'] = array_map(function ($it) {
                unset($it['unit_cost']);
                return $it;
            }, $invoice['items']);
        }
    }
    if (!$invoice) {
        fail('Invoice not found.', 404);
    }
    respond(['success' => true, 'invoice' => $invoice]);
}

/**
 * Create (confirmed right away) or edit a pending customer order.
 * Fields: id?, customer_user_id? | customer_name, customer_contact, role_id,
 *         items (JSON [{product_id, qty, unit_price}]), discount, notes,
 *         approve=1 (pending only). Items can't go on an invoice for more than the stock you have.
 */
function save_invoice($conn) {
    [$user, $store] = require_seller_store($conn);
    $id = (int) input('id');
    $items = json_input('items');

    $conn->beginTransaction();
    try {
        $existing = null;
        if ($id) {
            $existing = load_invoice($conn, $id, $store['id']);
            if (!$existing) {
                throw new ProductError('Invoice not found.');
            }
            if (!in_array($existing['status'], ['pending', 'confirmed'], true)) {
                throw new ProductError('Rejected or cancelled invoices cannot be edited.');
            }
        }

        // Customer: a registered member, or a walk-in name.
        $customerUserId = (int) input('customer_user_id') ?: null;
        $roleId = (int) input('role_id') ?: null;
        if ($existing) {
            $customerUserId = $existing['customer_user_id']; // the order stays with the customer who placed it
        }
        if ($customerUserId) {
            $member = customer_role($conn, $store['id'], $customerUserId);
            if (!$member) {
                throw new ProductError('That customer is not in your store.');
            }
            $customerName = $member['name'];
            $contact = input('customer_contact') ?: ($member['phone'] ?: $member['email']);
            $roleId = $roleId ?: (int) $member['role_id'];
        } else {
            $customerName = mb_substr(input('customer_name'), 0, 160) ?: 'Walk-in customer';
            $contact = mb_substr(input('customer_contact'), 0, 160) ?: null;
            $roleId = $roleId ?: default_role_id($conn, $store['id']);
        }
        $roleName = $roleId ? role_name($conn, $store['id'], $roleId) : null;
        if ($roleId && $roleName === null) {
            throw new ProductError('Price tier not found.');
        }

        $discount = money_or_error(input('discount'), 'Discount') ?? '0.00';
        $lines = build_lines($conn, $store, $items, $roleId, false);
        $notes = input('notes') ?: null;

        if ($existing) {
            // A walk-in name on a seller-made invoice can be corrected too.
            $nameSql = $customerUserId ? '' : 'customer_name = ?, ';
            $conn->prepare(
                "UPDATE invoices SET {$nameSql}customer_contact = ?, role_id = ?, role_name = ?, notes = ?, updated_at = NOW() WHERE id = ?"
            )->execute([...($customerUserId ? [] : [$customerName]), $contact, $roleId, $roleName, $notes, $id]);
            write_invoice_lines($conn, $id, $lines, $discount);
            $invoiceNo = $existing['invoice_no'];
            if ($existing['status'] === 'confirmed') {
                // Already took stock: only move what changed. Payment status follows the new total.
                apply_invoice_edit_stock($conn, $store, $user['id'], $id, $invoiceNo, invoice_quantities($existing['items']));
                $confirm = false;
            } else {
                $confirm = input('approve') === '1';
            }
        } else {
            $invoiceNo = next_invoice_no($conn, $store['id']);
            $stmt = $conn->prepare(
                "INSERT INTO invoices (store_id, invoice_no, source, status, customer_user_id, customer_name, customer_contact,
                                       role_id, role_name, notes, created_by)
                 VALUES (?, ?, 'seller', 'pending', ?, ?, ?, ?, ?, ?, ?) RETURNING id"
            );
            $stmt->execute([$store['id'], $invoiceNo, $customerUserId, $customerName, $contact, $roleId, $roleName, $notes, $user['id']]);
            $id = (int) $stmt->fetchColumn();
            write_invoice_lines($conn, $id, $lines, $discount);
            $confirm = true; // seller-made invoices are final right away
        }

        if ($confirm) {
            deduct_invoice_stock($conn, $store, $user['id'], $id, $invoiceNo);
            $conn->prepare("UPDATE invoices SET status = 'confirmed', confirmed_at = NOW() WHERE id = ?")->execute([$id]);
        }
    } catch (ProductError $e) {
        $conn->rollBack();
        fail($e->getMessage());
    }
    $conn->commit();

    // Approving a customer's order from the editor.
    if ($existing && $existing['status'] === 'pending' && $confirm) {
        notify_order_confirmed($conn, $existing, $store);
    }
    respond(['success' => true, 'invoice' => load_invoice($conn, $id, $store['id'])]);
}

/** Tells the customer their order was confirmed (with the final total). */
function notify_order_confirmed($conn, $invoice, $store) {
    $fresh = load_invoice($conn, $invoice['id'], $store['id']);
    notify($conn, $fresh['customer_user_id'], 'order_confirmed', "{$store['name']} confirmed order {$fresh['invoice_no']}",
        'Total ' . '₱' . number_format((float) $fresh['total'], 2) . '. You can pay now — see how to pay on your order.', "/account/orders/{$fresh['id']}");
}

function approve_invoice($conn) {
    [$user, $store] = require_seller_store($conn);
    $conn->beginTransaction();
    $invoice = load_invoice($conn, input('id'), $store['id']);
    if (!$invoice || $invoice['status'] !== 'pending') {
        $conn->rollBack();
        fail('Only pending orders can be approved.');
    }
    deduct_invoice_stock($conn, $store, $user['id'], $invoice['id'], $invoice['invoice_no']);
    $conn->prepare("UPDATE invoices SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW() WHERE id = ?")
        ->execute([$invoice['id']]);
    $conn->commit();
    notify_order_confirmed($conn, $invoice, $store);
    respond(['success' => true]);
}

function reject_invoice($conn) {
    [, $store] = require_seller_store($conn);
    $reason = input('reason');
    $stmt = $conn->prepare(
        "UPDATE invoices SET status = 'rejected', closed_at = NOW(), updated_at = NOW(),
                notes = CASE WHEN ? = '' THEN notes ELSE trim(both E'\\n' FROM COALESCE(notes, '') || E'\\nRejected: ' || ?) END
         WHERE id = ? AND store_id = ? AND status = 'pending'"
    );
    $stmt->execute([$reason, $reason, (int) input('id'), $store['id']]);
    if ($stmt->rowCount() === 0) {
        fail('Only pending orders can be rejected.');
    }
    $invoice = load_invoice($conn, input('id'), $store['id']);
    notify($conn, $invoice['customer_user_id'], 'order_rejected', "{$store['name']} could not accept order {$invoice['invoice_no']}",
        $reason !== '' ? "Reason: $reason" : null, "/account/orders/{$invoice['id']}");
    respond(['success' => true]);
}

/** Cancels a confirmed invoice and puts its items back in stock. */
function cancel_invoice($conn) {
    [$user, $store] = require_seller_store($conn);
    $conn->beginTransaction();
    $invoice = load_invoice($conn, input('id'), $store['id']);
    if (!$invoice || $invoice['status'] !== 'confirmed') {
        $conn->rollBack();
        fail('Only confirmed invoices can be cancelled.');
    }
    try {
        foreach ($invoice['items'] as $it) {
            if ($it['product_id']) {
                apply_stock_change($conn, $store['id'], $it['product_id'], $it['qty'], 'invoice_cancelled', $user['id'], $invoice['id'], $invoice['invoice_no'], $it['variant_id'] ? (int) $it['variant_id'] : null);
            }
        }
    } catch (ProductError $e) {
        $conn->rollBack();
        fail($e->getMessage());
    }
    $conn->prepare("UPDATE invoices SET status = 'cancelled', closed_at = NOW(), updated_at = NOW() WHERE id = ?")
        ->execute([$invoice['id']]);
    $conn->commit();
    respond(['success' => true]);
}

/** Members to choose from on the invoice form. */
function invoice_customers($conn) {
    [, $store] = require_seller_store($conn);
    // Type-ahead: up to 15 customers matching q (name, username, email).
    [$searchSql, $searchParams] = search_sql(input('q'), ['u.name', 'u.username', 'u.email', 'u.phone']);
    $stmt = $conn->prepare(
        "SELECT u.id AS user_id, u.name, u.username, u.email, u.phone, m.role_id, r.name AS role_name
         FROM store_members m JOIN users u ON u.id = m.user_id LEFT JOIN store_roles r ON r.id = m.role_id
         WHERE m.store_id = ? $searchSql ORDER BY LOWER(u.name) LIMIT 15"
    );
    $stmt->execute(array_merge([$store['id']], $searchParams));
    respond(['success' => true, 'customers' => array_map(function ($c) {
        $c['user_id'] = (int) $c['user_id'];
        $c['role_id'] = $c['role_id'] === null ? null : (int) $c['role_id'];
        return $c;
    }, $stmt->fetchAll())]);
}

function dashboard_stats($conn) {
    [, $store] = require_seller_store($conn);
    $sid = $store['id'];
    $monthStart = date('Y-m-01');
    $lastMonthStart = date('Y-m-01', strtotime('first day of last month'));

    $sales = $conn->prepare(
        "SELECT
            COALESCE(SUM(total) FILTER (WHERE confirmed_at >= ?), 0) AS month_sales,
            COALESCE(SUM(total) FILTER (WHERE confirmed_at >= ? AND confirmed_at < ?), 0) AS last_month_sales,
            COUNT(*) FILTER (WHERE confirmed_at >= ?) AS month_invoices
         FROM invoices WHERE store_id = ? AND status = 'confirmed'"
    );
    $sales->execute([$monthStart, $lastMonthStart, $monthStart, $monthStart, $sid]);
    $s = $sales->fetch();

    $profit = $conn->prepare(
        "SELECT COALESCE(SUM(ii.line_total - ii.qty * ii.unit_cost), 0)
         FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
         WHERE i.store_id = ? AND i.status = 'confirmed' AND i.confirmed_at >= ? AND ii.unit_cost IS NOT NULL"
    );
    $profit->execute([$sid, $monthStart]);

    $one = function ($sql, $params) use ($conn) {
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchColumn();
    };

    $recent = $conn->prepare(
        'SELECT id, invoice_no, customer_name, total, status, source, created_at FROM invoices
         WHERE store_id = ? ORDER BY created_at DESC LIMIT 6'
    );
    $recent->execute([$sid]);

    $low = $conn->prepare(
        'SELECT p.id, p.name, b.name AS brand, p.stock_qty, p.reorder_level FROM product_details p
         LEFT JOIN brands b ON b.id = p.brand_id
         WHERE p.store_id = ? AND p.is_active AND p.stock_qty <= p.reorder_level
         ORDER BY p.stock_qty, LOWER(p.name) LIMIT 6'
    );
    $low->execute([$sid]);

    $daily = $conn->prepare(
        "SELECT to_char(d::date, 'YYYY-MM-DD') AS day, COALESCE(SUM(i.total), 0) AS total
         FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day') d
         LEFT JOIN invoices i ON i.store_id = ? AND i.status = 'confirmed' AND i.confirmed_at::date = d::date
         GROUP BY d ORDER BY d"
    );
    $daily->execute([$sid]);

    respond([
        'success' => true,
        'month_sales' => $s['month_sales'],
        'last_month_sales' => $s['last_month_sales'],
        'month_invoices' => (int) $s['month_invoices'],
        'month_profit' => $profit->fetchColumn(),
        'pending_orders' => (int) $one("SELECT COUNT(*) FROM invoices WHERE store_id = ? AND status = 'pending'", [$sid]),
        'customers' => (int) $one('SELECT COUNT(*) FROM store_members WHERE store_id = ?', [$sid]),
        'low_stock' => (int) $one('SELECT COUNT(*) FROM product_details WHERE store_id = ? AND is_active AND stock_qty <= reorder_level', [$sid]),
        'products' => (int) $one('SELECT COUNT(*) FROM product_details WHERE store_id = ?', [$sid]),
        'recent_invoices' => $recent->fetchAll(),
        'low_stock_items' => $low->fetchAll(),
        'daily_sales' => $daily->fetchAll(),
    ]);
}

/* ---------------- customer ---------------- */

/** Customer places an order from a store page. Prices come from their role. */
function place_order($conn) {
    $user = require_user($conn, 'customer');
    $store = find_store_by_slug($conn, input('slug'));
    if (!$store) {
        fail('Store not found.', 404);
    }
    $member = customer_role($conn, $store['id'], $user['id']);
    if (!$member) {
        fail('Join this store first to place an order.', 403);
    }

    $conn->beginTransaction();
    try {
        $items = array_map(fn ($it) => ['product_id' => $it['product_id'] ?? 0, 'variant_id' => $it['variant_id'] ?? 0, 'qty' => $it['qty'] ?? 0], json_input('items'));
        $lines = build_lines($conn, $store, $items, $member['role_id'], true);
        // Customers can only order what is in stock.
        assert_lines_in_stock($conn, $store['id'], $lines);
        $invoiceNo = next_invoice_no($conn, $store['id']);
        $stmt = $conn->prepare(
            "INSERT INTO invoices (store_id, invoice_no, source, status, customer_user_id, customer_name, customer_contact,
                                   role_id, role_name, notes, created_by)
             VALUES (?, ?, 'customer', 'pending', ?, ?, ?, ?, ?, ?, ?) RETURNING id"
        );
        $stmt->execute([
            $store['id'], $invoiceNo, $user['id'], $user['name'], mb_substr(input('contact'), 0, 160) ?: $user['email'],
            $member['role_id'], $member['role_name'], mb_substr(input('notes'), 0, 2000) ?: null, $user['id'],
        ]);
        $id = (int) $stmt->fetchColumn();
        write_invoice_lines($conn, $id, $lines, '0.00');
    } catch (ProductError $e) {
        $conn->rollBack();
        fail($e->getMessage());
    }
    $conn->commit();

    $total = $conn->prepare('SELECT total FROM invoices WHERE id = ?');
    $total->execute([$id]);
    $orderTotal = $conn->prepare('SELECT total FROM invoices WHERE id = ?');
    $orderTotal->execute([$id]);
    notify_store_owner($conn, $store['id'], 'order_placed', "New order {$invoiceNo} from {$user['name']}",
        '₱' . number_format((float) $orderTotal->fetchColumn(), 2) . ' · waiting for your approval', "/dashboard/invoices/$id");
    broadcast_event($store['id'], 'order_placed', [
        'name' => $user['name'], 'invoice_no' => $invoiceNo, 'invoice_id' => $id, 'total' => $total->fetchColumn(),
    ]);
    respond(['success' => true, 'invoice_id' => $id, 'invoice_no' => $invoiceNo]);
}

function my_orders($conn) {
    $user = require_user($conn, 'customer');
    $stmt = $conn->prepare(
        'SELECT i.id, i.invoice_no, i.status, i.total, i.amount_paid, i.payment_status, i.release_status, i.released_to, i.created_at, i.confirmed_at, s.name AS store_name, s.slug AS store_slug, s.logo_path AS store_logo,
                (SELECT COUNT(*) FROM invoice_items WHERE invoice_id = i.id) AS line_count
         FROM invoices i JOIN stores s ON s.id = i.store_id
         WHERE i.customer_user_id = ? ORDER BY i.created_at DESC LIMIT 200'
    );
    $stmt->execute([$user['id']]);
    respond(['success' => true, 'orders' => $stmt->fetchAll()]);
}
