<?php
/** Seller inventory: stock levels, manual adjustments and history. */
if (!defined('BEAUTYHUB')) {
    exit;
}

/**
 * Changes a product's stock by $delta and records why. Locks the product row,
 * so call it inside a transaction. Returns the new stock.
 */
function apply_stock_change($conn, $storeId, $productId, $delta, $reason, $userId, $invoiceId = null, $note = null) {
    $stmt = $conn->prepare(
        'UPDATE product_details SET stock_qty = stock_qty + ?, updated_at = NOW()
         WHERE id = ? AND store_id = ? RETURNING stock_qty'
    );
    $stmt->execute([(int) $delta, $productId, $storeId]);
    $after = $stmt->fetchColumn();
    if ($after === false) {
        throw new ProductError('Product not found.');
    }
    $conn->prepare(
        'INSERT INTO inventory_movements (store_id, product_id, qty_change, stock_after, reason, invoice_id, note, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([$storeId, $productId, (int) $delta, (int) $after, $reason, $invoiceId, $note, $userId]);
    return (int) $after;
}

/** One page of stock levels. Inputs: page, per_page, q, filter (all|in|low|out), product (id). */
function list_inventory($conn) {
    [, $store] = require_seller_store($conn);
    [$page, $perPage] = page_params(50, 200);
    $costRole = (int) $store['cost_role_id'];

    $where = 'p.store_id = ?';
    $params = [$store['id']];
    $filter = input('filter');
    if ($filter === 'in') $where .= ' AND p.stock_qty > 0';
    if ($filter === 'low') $where .= ' AND p.stock_qty > 0 AND p.stock_qty <= p.reorder_level';
    if ($filter === 'out') $where .= ' AND p.stock_qty <= 0';
    if ((int) input('product')) {
        $where .= ' AND p.id = ?';
        $params[] = (int) input('product');
    }
    [$searchSql, $searchParams] = product_search_sql(input('q'));
    $where .= $searchSql;
    $params = array_merge($params, $searchParams);
    $from = 'FROM product_details p
             LEFT JOIN brands b ON b.id = p.brand_id
             LEFT JOIN product_category c ON c.id = p.product_category_id
             LEFT JOIN uoms u ON u.id = p.uom_id';

    $count = $conn->prepare("SELECT COUNT(*) $from WHERE $where");
    $count->execute($params);

    $stmt = $conn->prepare(
        "SELECT p.id, p.name, p.sku, p.is_active, p.stock_qty, p.reorder_level, p.uom_qty,
                b.name AS brand, c.name AS category, u.code AS uom,
                (SELECT thumb_path FROM product_media WHERE product_id = p.id AND is_cover LIMIT 1) AS cover,
                tier_price(p.id, ?) AS unit_cost
         $from WHERE $where
         ORDER BY LOWER(b.name), LOWER(p.name)
         LIMIT ? OFFSET ?"
    );
    $stmt->execute(array_merge([$costRole], $params, [$perPage, ($page - 1) * $perPage]));
    $rows = array_map(function ($r) {
        $r['id'] = (int) $r['id'];
        $r['stock_qty'] = (int) $r['stock_qty'];
        $r['reorder_level'] = (int) $r['reorder_level'];
        $r['size'] = size_label($r['uom_qty'], $r['uom']);
        return $r;
    }, $stmt->fetchAll());

    // Totals for the whole store (not just this page).
    $totals = $conn->prepare(
        'SELECT COALESCE(SUM(GREATEST(stock_qty, 0)), 0) AS units,
                COALESCE(SUM(GREATEST(stock_qty, 0) * COALESCE(tier_price(id, ?), 0)), 0) AS value,
                COUNT(*) FILTER (WHERE stock_qty > 0 AND stock_qty <= reorder_level) AS low,
                COUNT(*) FILTER (WHERE stock_qty <= 0) AS out
         FROM product_details WHERE store_id = ?'
    );
    $totals->execute([$costRole, $store['id']]);
    $t = $totals->fetch();

    respond([
        'success' => true, 'products' => $rows, 'total' => (int) $count->fetchColumn(), 'page' => $page, 'per_page' => $perPage,
        'totals' => ['units' => (int) $t['units'], 'value' => $t['value'], 'low' => (int) $t['low'], 'out' => (int) $t['out']],
    ]);
}

/** mode: add | remove | set. */
function adjust_stock($conn) {
    [$user, $store] = require_seller_store($conn);
    $productId = (int) input('product_id');
    $mode = input('mode');
    $qty = input('qty');
    $note = mb_substr(input('note'), 0, 255) ?: null;

    if (!preg_match('/^\d{1,7}$/', $qty)) {
        fail('Quantity must be a whole number.');
    }
    $qty = (int) $qty;

    $stmt = $conn->prepare('SELECT stock_qty FROM product_details WHERE id = ? AND store_id = ? FOR UPDATE');
    $conn->beginTransaction();
    $stmt->execute([$productId, $store['id']]);
    $current = $stmt->fetchColumn();
    if ($current === false) {
        $conn->rollBack();
        fail('Product not found.', 404);
    }

    $delta = ['add' => $qty, 'remove' => -$qty, 'set' => $qty - (int) $current][$mode] ?? null;
    if ($delta === null) {
        $conn->rollBack();
        fail('Choose add, remove or set.');
    }
    if ($delta === 0) {
        $conn->rollBack();
        respond(['success' => true, 'stock_qty' => (int) $current]);
    }

    $after = apply_stock_change($conn, $store['id'], $productId, $delta, 'adjustment', $user['id'], null, $note);

    if (input('reorder_level') !== '') {
        if (!preg_match('/^\d{1,6}$/', input('reorder_level'))) {
            $conn->rollBack();
            fail('Low-stock level must be a whole number.');
        }
        $conn->prepare('UPDATE product_details SET reorder_level = ? WHERE id = ?')->execute([(int) input('reorder_level'), $productId]);
    }
    $conn->commit();
    respond(['success' => true, 'stock_qty' => $after]);
}

function set_reorder_level($conn) {
    [, $store] = require_seller_store($conn);
    if (!preg_match('/^\d{1,6}$/', input('reorder_level'))) {
        fail('Low-stock level must be a whole number.');
    }
    $stmt = $conn->prepare('UPDATE product_details SET reorder_level = ? WHERE id = ? AND store_id = ?');
    $stmt->execute([(int) input('reorder_level'), (int) input('product_id'), $store['id']]);
    respond(['success' => $stmt->rowCount() > 0]);
}

function stock_history($conn) {
    [, $store] = require_seller_store($conn);
    $stmt = $conn->prepare(
        'SELECT m.id, m.qty_change, m.stock_after, m.reason, m.note, m.created_at, m.invoice_id, i.invoice_no, u.name AS by_name
         FROM inventory_movements m
         LEFT JOIN invoices i ON i.id = m.invoice_id
         LEFT JOIN users u ON u.id = m.created_by
         WHERE m.store_id = ? AND m.product_id = ?
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT 100'
    );
    $stmt->execute([$store['id'], (int) input('product_id')]);
    respond(['success' => true, 'movements' => $stmt->fetchAll()]);
}
