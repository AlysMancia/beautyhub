<?php
/**
 * Seller catalog setup: brands, product categories and units of measure (UOM).
 * Every query is scoped to the logged-in seller's store.
 */
if (!defined('BEAUTYHUB')) {
    exit;
}

/** Everything the product forms need in one call. */
function list_catalog($conn) {
    [, $store] = require_seller_store($conn);
    respond(['success' => true] + catalog_lists($conn, $store['id']));
}

function catalog_lists($conn, $storeId) {
    $brands = $conn->prepare(
        'SELECT b.id, b.name, b.logo_path, COUNT(p.id) AS product_count
         FROM brands b LEFT JOIN product_details p ON p.brand_id = b.id
         WHERE b.store_id = ? GROUP BY b.id ORDER BY LOWER(b.name)'
    );
    $brands->execute([$storeId]);

    $categories = $conn->prepare(
        'SELECT c.id, c.name, COUNT(p.id) AS product_count
         FROM product_category c LEFT JOIN product_details p ON p.product_category_id = c.id
         WHERE c.store_id = ? GROUP BY c.id ORDER BY c.sort_order, LOWER(c.name)'
    );
    $categories->execute([$storeId]);

    $uoms = $conn->prepare(
        'SELECT u.id, u.code, u.name, u.is_measure, COUNT(p.id) AS product_count
         FROM uoms u LEFT JOIN product_details p ON p.uom_id = u.id
         WHERE u.store_id = ? GROUP BY u.id ORDER BY u.sort_order, LOWER(u.code)'
    );
    $uoms->execute([$storeId]);

    $roles = $conn->prepare(
        'SELECT r.id, r.name, r.is_default, r.tier_level, (s.cost_role_id = r.id) IS TRUE AS is_cost
         FROM store_roles r JOIN stores s ON s.id = r.store_id
         WHERE r.store_id = ? ORDER BY r.tier_level, r.id'
    );
    $roles->execute([$storeId]);

    $ints = function ($rows, $keys) {
        return array_map(function ($row) use ($keys) {
            foreach ($keys as $k) {
                $row[$k] = is_bool($row[$k]) ? $row[$k] : (int) $row[$k];
            }
            return $row;
        }, $rows);
    };

    return [
        'brands' => $ints($brands->fetchAll(), ['id', 'product_count']),
        'categories' => $ints($categories->fetchAll(), ['id', 'product_count']),
        'uoms' => $ints($uoms->fetchAll(), ['id', 'product_count']),
        'roles' => $ints($roles->fetchAll(), ['id', 'tier_level']),
    ];
}

function required_name($key, $label, $max = 120) {
    $value = input($key);
    if ($value === '' || mb_strlen($value) > $max) {
        fail("$label must be 1-$max characters.");
    }
    return $value;
}

/** Throws a friendly error when (store, LOWER(column)) is already used by another row. */
function ensure_unique($conn, $table, $column, $storeId, $value, $exceptId, $message) {
    $stmt = $conn->prepare("SELECT 1 FROM $table WHERE store_id = ? AND LOWER($column) = LOWER(?) AND id <> ?");
    $stmt->execute([$storeId, $value, (int) $exceptId]);
    if ($stmt->fetch()) {
        fail($message);
    }
}

/** Fails unless row $id of $table belongs to $storeId. */
function ensure_owned($conn, $table, $storeId, $id, $label) {
    $stmt = $conn->prepare("SELECT 1 FROM $table WHERE id = ? AND store_id = ?");
    $stmt->execute([(int) $id, $storeId]);
    if (!$stmt->fetch()) {
        fail("$label not found.", 404);
    }
}

/* ---------------- brands ---------------- */

function save_brand($conn) {
    [, $store] = require_seller_store($conn);
    $id = (int) input('id');
    $name = required_name('name', 'Brand name');
    ensure_unique($conn, 'brands', 'name', $store['id'], $name, $id, 'You already have a brand with that name.');

    if ($id) {
        ensure_owned($conn, 'brands', $store['id'], $id, 'Brand');
        $conn->prepare('UPDATE brands SET name = ?, updated_at = NOW() WHERE id = ?')->execute([$name, $id]);
    } else {
        $stmt = $conn->prepare('INSERT INTO brands (store_id, name, slug) VALUES (?, ?, ?) RETURNING id');
        $stmt->execute([$store['id'], $name, slugify($name)]);
        $id = (int) $stmt->fetchColumn();
    }
    respond(['success' => true, 'id' => $id]);
}

function delete_brand($conn) {
    [, $store] = require_seller_store($conn);
    $id = (int) input('id');
    ensure_owned($conn, 'brands', $store['id'], $id, 'Brand');

    $count = $conn->prepare('SELECT COUNT(*) FROM product_details WHERE brand_id = ?');
    $count->execute([$id]);
    if ((int) $count->fetchColumn() > 0) {
        fail('This brand still has products. Move or delete them first.');
    }
    $logo = $conn->prepare('SELECT logo_path FROM brands WHERE id = ?');
    $logo->execute([$id]);
    $logoPath = $logo->fetchColumn();
    $conn->prepare('DELETE FROM brands WHERE id = ?')->execute([$id]);
    delete_upload($logoPath);
    respond(['success' => true]);
}

/* ---------------- categories ---------------- */

function save_category($conn) {
    [, $store] = require_seller_store($conn);
    $id = (int) input('id');
    $name = required_name('name', 'Category name', 60);
    ensure_unique($conn, 'product_category', 'name', $store['id'], $name, $id, 'You already have a category with that name.');

    if ($id) {
        ensure_owned($conn, 'product_category', $store['id'], $id, 'Category');
        $conn->prepare('UPDATE product_category SET name = ?, slug = ?, updated_at = NOW() WHERE id = ?')
            ->execute([$name, slugify($name), $id]);
    } else {
        $stmt = $conn->prepare(
            'INSERT INTO product_category (store_id, name, slug, sort_order)
             VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM product_category WHERE store_id = ?))
             RETURNING id'
        );
        $stmt->execute([$store['id'], $name, slugify($name), $store['id']]);
        $id = (int) $stmt->fetchColumn();
    }
    respond(['success' => true, 'id' => $id]);
}

function delete_category($conn) {
    [, $store] = require_seller_store($conn);
    $id = (int) input('id');
    ensure_owned($conn, 'product_category', $store['id'], $id, 'Category');
    // Products in this category become "uncategorized" (ON DELETE SET NULL).
    $conn->prepare('DELETE FROM product_category WHERE id = ?')->execute([$id]);
    respond(['success' => true]);
}

/* ---------------- units of measure ---------------- */

function save_uom($conn) {
    [, $store] = require_seller_store($conn);
    $id = (int) input('id');
    $code = required_name('code', 'Unit code', 20);
    $name = input('name') ?: $code;
    if (mb_strlen($name) > 60) {
        fail('Unit name must be at most 60 characters.');
    }
    ensure_unique($conn, 'uoms', 'code', $store['id'], $code, $id, 'You already have a unit with that code.');
    // Measures (ml, g, ...) ask "how many?" on each product.
    $isMeasure = filter_var(input('is_measure'), FILTER_VALIDATE_BOOLEAN) ? 'true' : 'false';

    if ($id) {
        ensure_owned($conn, 'uoms', $store['id'], $id, 'Unit');
        $conn->prepare('UPDATE uoms SET code = ?, name = ?, is_measure = ?, updated_at = NOW() WHERE id = ?')
            ->execute([$code, $name, $isMeasure, $id]);
    } else {
        $stmt = $conn->prepare(
            'INSERT INTO uoms (store_id, code, name, is_measure, sort_order)
             VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM uoms WHERE store_id = ?))
             RETURNING id'
        );
        $stmt->execute([$store['id'], $code, $name, $isMeasure, $store['id']]);
        $id = (int) $stmt->fetchColumn();
    }
    respond(['success' => true, 'id' => $id]);
}

function delete_uom($conn) {
    [, $store] = require_seller_store($conn);
    $id = (int) input('id');
    ensure_owned($conn, 'uoms', $store['id'], $id, 'Unit');
    // Products using this unit keep working with no unit (ON DELETE SET NULL).
    $conn->prepare('DELETE FROM uoms WHERE id = ?')->execute([$id]);
    respond(['success' => true]);
}
