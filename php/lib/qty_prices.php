<?php
/**
 * SRP tier and quantity prices ("buy 10 or more, pay 9 each").
 *
 * Quantity prices are set per product and tier. A customer gets the steps of
 * the tier their price comes from (their own tier, else the next tier toward
 * retail - price_tier_for() in 014_srp_qty_prices.sql). The quantity counted
 * is the product's total on the order, all variants together.
 */
if (!defined('BEAUTYHUB')) {
    exit;
}

const MAX_QTY_STEPS = 10; // per product and tier

/** The store's SRP / retail tier: the one ticked, else the last tier. */
function srp_role_id($conn, $storeId) {
    $stmt = $conn->prepare(
        'SELECT id FROM store_roles WHERE store_id = ? ORDER BY is_srp DESC, tier_level DESC, id DESC LIMIT 1'
    );
    $stmt->execute([$storeId]);
    $id = $stmt->fetchColumn();
    return $id === false ? null : (int) $id;
}

/**
 * Quantity steps that apply to tier $roleId: [product_id => [['min_qty' => 10, 'price' => '9.00'], ...]]
 * (lowest min_qty first). Products without steps are left out.
 */
function qty_breaks($conn, array $productIds, $roleId) {
    $productIds = array_values(array_unique(array_filter(array_map('intval', $productIds))));
    if (!$productIds || !$roleId) {
        return [];
    }
    $in = implode(',', array_fill(0, count($productIds), '?'));
    $stmt = $conn->prepare(
        "SELECT q.product_id, q.min_qty, q.price
         FROM product_qty_prices q
         WHERE q.product_id IN ($in) AND q.role_id = price_tier_for(q.product_id, ?)
         ORDER BY q.product_id, q.min_qty"
    );
    $stmt->execute(array_merge($productIds, [(int) $roleId]));
    $out = [];
    foreach ($stmt->fetchAll() as $r) {
        $out[(int) $r['product_id']][] = ['min_qty' => (int) $r['min_qty'], 'price' => $r['price']];
    }
    return $out;
}

/** Price per piece when buying $qty: the best step reached, if it beats $base. */
function price_at_qty($base, array $breaks, $qty) {
    $best = $base === null ? null : (float) $base;
    foreach ($breaks as $b) {
        if ($qty >= $b['min_qty'] && ($best === null || (float) $b['price'] < $best)) {
            $best = (float) $b['price'];
        }
    }
    return $best === null ? null : number_format($best, 2, '.', '');
}

/** All quantity steps of one product, every tier (for the product form). */
function product_qty_prices($conn, $productId) {
    $stmt = $conn->prepare('SELECT role_id, min_qty, price FROM product_qty_prices WHERE product_id = ? ORDER BY role_id, min_qty');
    $stmt->execute([(int) $productId]);
    return array_map(fn ($r) => ['role_id' => (int) $r['role_id'], 'min_qty' => (int) $r['min_qty'], 'price' => $r['price']], $stmt->fetchAll());
}

/**
 * Replaces a product's quantity steps.
 * Inputs: product_id, steps (JSON [{role_id, min_qty, price}]).
 */
function save_qty_prices($conn) {
    [, $store] = require_seller_store($conn);
    $productId = (int) input('product_id');
    $stmt = $conn->prepare('SELECT id FROM product_details WHERE id = ? AND store_id = ?');
    $stmt->execute([$productId, $store['id']]);
    if (!$stmt->fetchColumn()) {
        fail('Product not found.', 404);
    }
    $roles = $conn->prepare('SELECT id, name FROM store_roles WHERE store_id = ?');
    $roles->execute([$store['id']]);
    $roleNames = $roles->fetchAll(PDO::FETCH_KEY_PAIR);

    $rows = [];
    $perRole = [];
    foreach (json_input('steps') as $i => $s) {
        $roleId = (int) ($s['role_id'] ?? 0);
        $minQty = (string) ($s['min_qty'] ?? '');
        $price = trim((string) ($s['price'] ?? ''));
        if ($minQty === '' && $price === '') {
            continue; // empty row
        }
        if (!isset($roleNames[$roleId])) {
            fail('Row ' . ($i + 1) . ': choose a tier.');
        }
        if (!preg_match('/^\d{1,6}$/', $minQty) || (int) $minQty < 2) {
            fail("{$roleNames[$roleId]}: the quantity must be a whole number of 2 or more.");
        }
        $price = parse_money($price, "{$roleNames[$roleId]} price for {$minQty}+");
        if ($price === null) {
            fail("{$roleNames[$roleId]}: enter the price for {$minQty}+ pieces.");
        }
        $key = $roleId . ':' . (int) $minQty;
        if (isset($rows[$key])) {
            fail("{$roleNames[$roleId]} has {$minQty}+ twice.");
        }
        $perRole[$roleId] = ($perRole[$roleId] ?? 0) + 1;
        if ($perRole[$roleId] > MAX_QTY_STEPS) {
            fail("{$roleNames[$roleId]}: up to " . MAX_QTY_STEPS . ' quantity prices.');
        }
        $rows[$key] = [$productId, $roleId, (int) $minQty, $price];
    }

    $conn->beginTransaction();
    $conn->prepare('DELETE FROM product_qty_prices WHERE product_id = ?')->execute([$productId]);
    $insert = $conn->prepare('INSERT INTO product_qty_prices (product_id, role_id, min_qty, price) VALUES (?, ?, ?, ?)');
    foreach ($rows as $r) {
        $insert->execute($r);
    }
    $conn->commit();
    respond(['success' => true, 'qty_prices' => product_qty_prices($conn, $productId)]);
}
