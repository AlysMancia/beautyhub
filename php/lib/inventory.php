<?php
/** Seller inventory: stock levels, manual adjustments and history. */
if (!defined('BEAUTYHUB')) {
    exit;
}

/**
 * Changes stock by $delta and records why. With $variantId the variant's
 * stock changes and the product's stock becomes the total of its variants.
 * Locks the rows, so call it inside a transaction. Returns the new stock
 * (of the variant when one is given).
 */
function apply_stock_change($conn, $storeId, $productId, $delta, $reason, $userId, $invoiceId = null, $note = null, $variantId = null) {
    if ($variantId) {
        $stmt = $conn->prepare(
            'UPDATE product_variants SET stock_qty = stock_qty + ?, updated_at = NOW()
             WHERE id = ? AND product_id = ? AND store_id = ? RETURNING stock_qty'
        );
        $stmt->execute([(int) $delta, $variantId, $productId, $storeId]);
        $after = $stmt->fetchColumn();
        if ($after === false) {
            throw new ProductError('Variant not found.');
        }
        sync_variant_stock_total($conn, $productId);
    } else {
        $stmt = $conn->prepare(
            'UPDATE product_details SET stock_qty = stock_qty + ?, updated_at = NOW()
             WHERE id = ? AND store_id = ? RETURNING stock_qty'
        );
        $stmt->execute([(int) $delta, $productId, $storeId]);
        $after = $stmt->fetchColumn();
        if ($after === false) {
            throw new ProductError('Product not found.');
        }
    }
    $conn->prepare(
        'INSERT INTO inventory_movements (store_id, product_id, variant_id, qty_change, stock_after, reason, invoice_id, note, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([$storeId, $productId, $variantId ?: null, (int) $delta, (int) $after, $reason, $invoiceId, $note, $userId]);
    return (int) $after;
}

/** A product with variants shows the total stock of its variants. */
function sync_variant_stock_total($conn, $productId) {
    $conn->prepare(
        'UPDATE product_details SET stock_qty = COALESCE((SELECT SUM(stock_qty) FROM product_variants WHERE product_id = ?), 0)
         WHERE id = ? AND has_variants'
    )->execute([$productId, $productId]);
}

/**
 * [variant_id => ['price' => ?, 'cost' => ?]]: what each variant sells for to
 * tier $roleId (variant_tier_price(); an active product promo wins when lower)
 * and what it costs you (your cost tier).
 */
function variant_prices_for_role($conn, $store, array $variantIds, $roleId) {
    if (!$variantIds) {
        return [];
    }
    $roleId = (int) $roleId ?: default_role_id($conn, $store['id']);
    $in = implode(',', array_fill(0, count($variantIds), '?'));
    $stmt = $conn->prepare(
        "SELECT v.id, variant_tier_price(v.id, ?) AS price, variant_tier_price(v.id, ?) AS cost,
                p.promo_price, p.promo_type, p.promo_until
         FROM product_variants v JOIN product_details p ON p.id = v.product_id
         WHERE v.store_id = ? AND v.id IN ($in)"
    );
    $stmt->execute(array_merge([$roleId, (int) $store['cost_role_id'], $store['id']], array_map('intval', $variantIds)));
    $out = [];
    foreach ($stmt->fetchAll() as $r) {
        $price = $r['price'];
        if (promo_is_active($r) && ($price === null || (float) $r['promo_price'] < (float) $price)) {
            $price = $r['promo_price'];
        }
        $out[(int) $r['id']] = ['price' => $price, 'cost' => $r['cost']];
    }
    return $out;
}

/** [product_id => [variants...]] for a list of products (only ones with variants). */
function variants_for_products($conn, array $productIds) {
    if (!$productIds) {
        return [];
    }
    $in = implode(',', array_fill(0, count($productIds), '?'));
    $stmt = $conn->prepare(
        "SELECT v.id, v.product_id, v.name, v.sku, v.stock_qty, v.is_active, v.media_id,
                m.thumb_path AS image, m.path AS image_full
         FROM product_variants v LEFT JOIN product_media m ON m.id = v.media_id
         WHERE v.product_id IN ($in) ORDER BY v.sort_order, v.id"
    );
    $stmt->execute(array_map('intval', $productIds));
    $rows = $stmt->fetchAll();

    // The variant's own prices per tier (only the tiers it overrides).
    $prices = [];
    if ($rows) {
        $vin = implode(',', array_fill(0, count($rows), '?'));
        $p = $conn->prepare("SELECT variant_id, role_id, price FROM product_variant_prices WHERE variant_id IN ($vin)");
        $p->execute(array_map(fn ($v) => (int) $v['id'], $rows));
        foreach ($p->fetchAll() as $r) {
            $prices[(int) $r['variant_id']][(int) $r['role_id']] = $r['price'];
        }
    }

    $out = [];
    foreach ($rows as $v) {
        $v['id'] = (int) $v['id'];
        $v['product_id'] = (int) $v['product_id'];
        $v['stock_qty'] = (int) $v['stock_qty'];
        $v['media_id'] = $v['media_id'] === null ? null : (int) $v['media_id'];
        $v['prices'] = (object) ($prices[$v['id']] ?? []);
        $out[$v['product_id']][] = $v;
    }
    return $out;
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
        "SELECT p.id, p.name, p.sku, p.is_active, p.stock_qty, p.reorder_level, p.uom_qty, p.has_variants, p.variant_label,
                b.name AS brand, c.name AS category, u.code AS uom,
                (SELECT thumb_path FROM product_media WHERE product_id = p.id AND is_cover LIMIT 1) AS cover,
                (SELECT COUNT(*) FROM product_media WHERE product_id = p.id) AS media_count,
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
    $variants = variants_for_products($conn, array_column(array_filter($rows, fn ($r) => $r['has_variants']), 'id'));
    foreach ($rows as &$r) {
        $r['variants'] = $variants[$r['id']] ?? [];
    }
    unset($r);

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

/** mode: add | remove | set. variant_id is required for products with variants. */
function adjust_stock($conn) {
    [$user, $store] = require_seller_store($conn);
    $productId = (int) input('product_id');
    $variantId = (int) input('variant_id') ?: null;
    $mode = input('mode');
    $qty = input('qty');
    $note = mb_substr(input('note'), 0, 255) ?: null;

    if (!preg_match('/^\d{1,7}$/', $qty)) {
        fail('Quantity must be a whole number.');
    }
    $qty = (int) $qty;

    $conn->beginTransaction();
    $stmt = $conn->prepare('SELECT stock_qty, has_variants FROM product_details WHERE id = ? AND store_id = ? FOR UPDATE');
    $stmt->execute([$productId, $store['id']]);
    $product = $stmt->fetch();
    if (!$product) {
        $conn->rollBack();
        fail('Product not found.', 404);
    }
    if ($product['has_variants'] && !$variantId) {
        $conn->rollBack();
        fail('Choose which variant to adjust.');
    }
    $current = $product['stock_qty'];
    if ($variantId) {
        $v = $conn->prepare('SELECT stock_qty FROM product_variants WHERE id = ? AND product_id = ? FOR UPDATE');
        $v->execute([$variantId, $productId]);
        $current = $v->fetchColumn();
        if ($current === false) {
            $conn->rollBack();
            fail('Variant not found.', 404);
        }
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

    $after = apply_stock_change($conn, $store['id'], $productId, $delta, 'adjustment', $user['id'], null, $note, $variantId);

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
        'SELECT m.id, m.qty_change, m.stock_after, m.reason, m.note, m.created_at, m.invoice_id, i.invoice_no, u.name AS by_name,
                v.name AS variant
         FROM inventory_movements m
         LEFT JOIN invoices i ON i.id = m.invoice_id
         LEFT JOIN users u ON u.id = m.created_by
         LEFT JOIN product_variants v ON v.id = m.variant_id
         WHERE m.store_id = ? AND m.product_id = ?
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT 100'
    );
    $stmt->execute([$store['id'], (int) input('product_id')]);
    respond(['success' => true, 'movements' => $stmt->fetchAll()]);
}
