<?php
/**
 * Product variants (shades, colors, sizes...) and quick edits from the
 * products list. Every stock change goes through apply_stock_change(), so it
 * shows up in the inventory history.
 */
if (!defined('BEAUTYHUB')) {
    exit;
}

const MAX_VARIANTS = 60;

/**
 * Save a product's variants in one go.
 * Inputs: product_id, has_variants (1/0), variant_label,
 *         variants = JSON [{ id?, name, sku?, media_id?, stock, is_active? }]
 * Variants missing from the list are deleted. "stock" is the count you have
 * now; differences are recorded as stock adjustments.
 */
function save_variants($conn) {
    [$user, $store] = require_seller_store($conn);
    $productId = owned_product($conn, $store['id'], input('product_id'));
    $enabled = filter_var(input('has_variants'), FILTER_VALIDATE_BOOLEAN);
    $label = mb_substr(input('variant_label'), 0, 40) ?: 'Variant';
    $items = json_input('variants');

    $conn->beginTransaction();
    try {
        $p = $conn->prepare('SELECT has_variants, stock_qty FROM product_details WHERE id = ? FOR UPDATE');
        $p->execute([$productId]);
        $product = $p->fetch();

        $existing = [];
        $stmt = $conn->prepare('SELECT * FROM product_variants WHERE product_id = ? FOR UPDATE');
        $stmt->execute([$productId]);
        foreach ($stmt->fetchAll() as $v) {
            $existing[(int) $v['id']] = $v;
        }

        if (!$enabled) {
            // Turning variants off: the product keeps their total stock.
            $conn->prepare('DELETE FROM product_variants WHERE product_id = ?')->execute([$productId]);
            $conn->prepare('UPDATE product_details SET has_variants = FALSE, variant_label = NULL, updated_at = NOW() WHERE id = ?')
                ->execute([$productId]);
            $conn->commit();
            respond(['success' => true, 'variants' => []]);
        }

        if (count($items) === 0) {
            throw new ProductError('Add at least one variant, e.g. a shade or size.');
        }
        if (count($items) > MAX_VARIANTS) {
            throw new ProductError('Up to ' . MAX_VARIANTS . ' variants per product.');
        }

        // Validate names first.
        $seen = [];
        foreach ($items as $i => $it) {
            $name = trim((string) ($it['name'] ?? ''));
            if ($name === '' || mb_strlen($name) > 120) {
                throw new ProductError('Variant ' . ($i + 1) . ': enter a name (max 120 characters).');
            }
            $key = mb_strtolower($name);
            if (isset($seen[$key])) {
                throw new ProductError("Two variants are called \"$name\".");
            }
            $seen[$key] = true;
            $stock = trim((string) ($it['stock'] ?? '0'));
            if (!preg_match('/^-?\d{1,7}$/', $stock === '' ? '0' : $stock)) {
                throw new ProductError("$name: stock must be a whole number.");
            }
        }

        // Switching variants on: existing product stock moves into the variants you enter.
        if (!$product['has_variants']) {
            if ((int) $product['stock_qty'] !== 0) {
                apply_stock_change($conn, $store['id'], $productId, -(int) $product['stock_qty'], 'adjustment', $user['id'], null, 'Moved into variants');
            }
            $conn->prepare('UPDATE product_details SET has_variants = TRUE WHERE id = ?')->execute([$productId]);
        }
        $conn->prepare('UPDATE product_details SET variant_label = ?, updated_at = NOW() WHERE id = ?')->execute([$label, $productId]);

        $mediaOk = $conn->prepare("SELECT 1 FROM product_media WHERE id = ? AND product_id = ? AND kind = 'image'");
        $keep = [];
        foreach ($items as $order => $it) {
            $name = trim((string) $it['name']);
            $sku = trim((string) ($it['sku'] ?? '')) ?: null;
            $mediaId = (int) ($it['media_id'] ?? 0) ?: null;
            if ($mediaId) {
                $mediaOk->execute([$mediaId, $productId]);
                if (!$mediaOk->fetch()) {
                    $mediaId = null;
                }
            }
            $active = !isset($it['is_active']) || filter_var($it['is_active'], FILTER_VALIDATE_BOOLEAN);
            $stock = (int) (trim((string) ($it['stock'] ?? '0')) ?: 0);
            $id = (int) ($it['id'] ?? 0);

            if ($id && isset($existing[$id])) {
                $conn->prepare(
                    'UPDATE product_variants SET name = ?, sku = ?, media_id = ?, is_active = ?, sort_order = ?, updated_at = NOW() WHERE id = ?'
                )->execute([$name, $sku, $mediaId, $active ? 'true' : 'false', $order, $id]);
                $delta = $stock - (int) $existing[$id]['stock_qty'];
                if ($delta !== 0) {
                    apply_stock_change($conn, $store['id'], $productId, $delta, 'adjustment', $user['id'], null, 'Edited in variants', $id);
                }
            } else {
                $ins = $conn->prepare(
                    'INSERT INTO product_variants (store_id, product_id, name, sku, media_id, is_active, sort_order)
                     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id'
                );
                $ins->execute([$store['id'], $productId, $name, $sku, $mediaId, $active ? 'true' : 'false', $order]);
                $id = (int) $ins->fetchColumn();
                if ($stock !== 0) {
                    apply_stock_change($conn, $store['id'], $productId, $stock, 'opening', $user['id'], null, null, $id);
                }
            }
            $keep[$id] = true;

            // The variant's own prices: a number sets that tier, blank uses the product's price.
            if (isset($it['prices']) && is_array($it['prices'])) {
                $roleOk = $conn->prepare('SELECT name FROM store_roles WHERE id = ? AND store_id = ?');
                foreach ($it['prices'] as $roleId => $value) {
                    $roleOk->execute([(int) $roleId, $store['id']]);
                    $roleName = $roleOk->fetchColumn();
                    if ($roleName === false) {
                        continue;
                    }
                    $price = money_or_error($value, "$name $roleName price");
                    if ($price === null) {
                        $conn->prepare('DELETE FROM product_variant_prices WHERE variant_id = ? AND role_id = ?')->execute([$id, (int) $roleId]);
                    } else {
                        $conn->prepare(
                            'INSERT INTO product_variant_prices (variant_id, role_id, price) VALUES (?, ?, ?)
                             ON CONFLICT (variant_id, role_id) DO UPDATE SET price = EXCLUDED.price, updated_at = NOW()'
                        )->execute([$id, (int) $roleId, $price]);
                    }
                }
            }
        }

        // Removed variants: take their stock out (recorded), then delete them.
        foreach ($existing as $id => $v) {
            if (!isset($keep[$id])) {
                if ((int) $v['stock_qty'] !== 0) {
                    apply_stock_change($conn, $store['id'], $productId, -(int) $v['stock_qty'], 'adjustment', $user['id'], null, "Variant \"{$v['name']}\" removed", $id);
                }
                $conn->prepare('DELETE FROM product_variants WHERE id = ?')->execute([$id]);
            }
        }
        sync_variant_stock_total($conn, $productId);
    } catch (ProductError $e) {
        $conn->rollBack();
        fail($e->getMessage());
    }
    $conn->commit();
    respond(['success' => true, 'variants' => variants_for_products($conn, [$productId])[$productId] ?? []]);
}

/**
 * Quick edit from the products list (click a cell, type, Enter).
 * Inputs: product_id, field = name | stock | price, value, role_id (for price)
 */
function quick_update_product($conn) {
    [$user, $store] = require_seller_store($conn);
    $productId = owned_product($conn, $store['id'], input('product_id'));
    $field = input('field');
    $value = input('value');

    $conn->beginTransaction();
    try {
        if ($field === 'name') {
            if ($value === '' || mb_strlen($value) > 255) {
                throw new ProductError('Product name is required (max 255 characters).');
            }
            $conn->prepare('UPDATE product_details SET name = ?, updated_at = NOW() WHERE id = ?')->execute([$value, $productId]);
        } elseif ($field === 'stock') {
            if (!preg_match('/^-?\d{1,7}$/', $value)) {
                throw new ProductError('Stock must be a whole number.');
            }
            $p = $conn->prepare('SELECT stock_qty, has_variants FROM product_details WHERE id = ? FOR UPDATE');
            $p->execute([$productId]);
            $row = $p->fetch();
            if ($row['has_variants']) {
                throw new ProductError('This product has variants. Change the stock of each variant on the product page or in Inventory.');
            }
            $delta = (int) $value - (int) $row['stock_qty'];
            if ($delta !== 0) {
                apply_stock_change($conn, $store['id'], $productId, $delta, 'adjustment', $user['id'], null, 'Quick edit');
            }
        } elseif ($field === 'price') {
            $role = $conn->prepare('SELECT name FROM store_roles WHERE id = ? AND store_id = ?');
            $role->execute([(int) input('role_id'), $store['id']]);
            $roleName = $role->fetchColumn();
            if ($roleName === false) {
                throw new ProductError('Price tier not found.');
            }
            $price = money_or_error($value, "$roleName price");
            if ($price === null) {
                $conn->prepare('DELETE FROM product_role_prices WHERE product_id = ? AND role_id = ?')->execute([$productId, (int) input('role_id')]);
            } else {
                $conn->prepare(
                    'INSERT INTO product_role_prices (product_id, role_id, price) VALUES (?, ?, ?)
                     ON CONFLICT (product_id, role_id) DO UPDATE SET price = EXCLUDED.price, updated_at = NOW()'
                )->execute([$productId, (int) input('role_id'), $price]);
            }
        } else {
            throw new ProductError('That can’t be edited here.');
        }
    } catch (ProductError $e) {
        $conn->rollBack();
        fail($e->getMessage());
    }
    $conn->commit();
    respond(['success' => true, 'product' => product_rows($conn, $store['id'], $productId)[0]]);
}
