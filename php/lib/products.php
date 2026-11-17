<?php
/**
 * Seller products: list, save, delete, Excel import, plus the public product
 * list for the store page. Every query is scoped to the seller's store.
 */
if (!defined('BEAUTYHUB')) {
    exit;
}

/** Validation problem with one product (shown to the user, or per row on import). */
class ProductError extends Exception {}

const PROMO_TYPES = ['until_date', 'while_supplies_last'];

/** A promo counts when it has a price and is either "while supplies last" or not past its date. */
function promo_is_active($row) {
    if ($row['promo_price'] === null || $row['promo_price'] === '') {
        return false;
    }
    if ($row['promo_type'] === 'while_supplies_last') {
        return true;
    }
    return $row['promo_until'] !== null && $row['promo_until'] >= date('Y-m-d');
}

function money_or_error($value, $label) {
    $value = trim(str_replace([',', '₱', 'PHP', ' '], '', (string) $value));
    if ($value === '') {
        return null;
    }
    if (!is_numeric($value) || (float) $value < 0 || (float) $value >= 1e10) {
        throw new ProductError("$label must be an amount like 120 or 120.50.");
    }
    return number_format(round((float) $value, 2), 2, '.', '');
}

function date_or_error($value, $label) {
    $value = trim((string) $value);
    if ($value === '') {
        return null;
    }
    foreach (['Y-m-d', 'm/d/Y', 'n/j/Y', 'Y/m/d'] as $format) {
        $date = DateTime::createFromFormat('!' . $format, $value);
        if ($date && $date->format($format) === $value) {
            return $date->format('Y-m-d');
        }
    }
    throw new ProductError("$label must be a date like 2026-12-31.");
}

function promo_type_or_error($value) {
    $value = strtolower(trim((string) $value));
    if ($value === '') {
        return null;
    }
    if (in_array($value, ['until_date', 'until date', 'date', 'valid until', 'until'], true)) {
        return 'until_date';
    }
    if (in_array($value, ['while_supplies_last', 'while supplies last', 'supplies last', 'until supplies last', 'supplies'], true)) {
        return 'while_supplies_last';
    }
    throw new ProductError('Promo type must be "until date" or "while supplies last".');
}

/* ---------------- list ---------------- */

/**
 * Seller product rows. $opts: id | q, brand, category, stock (low|out), limit, offset.
 * Returns [rows, total].
 */
function product_rows($conn, $storeId, $productId = null, array $opts = []) {
    $where = 'p.store_id = ?';
    $params = [$storeId];
    if ($productId) {
        $where .= ' AND p.id = ?';
        $params[] = $productId;
    }
    if (!empty($opts['brand'])) {
        $where .= ' AND p.brand_id = ?';
        $params[] = (int) $opts['brand'];
    }
    if (!empty($opts['category'])) {
        $where .= $opts['category'] === 'none' ? ' AND p.product_category_id IS NULL' : ' AND p.product_category_id = ?';
        if ($opts['category'] !== 'none') $params[] = (int) $opts['category'];
    }
    if (($opts['stock'] ?? '') === 'low') $where .= ' AND p.stock_qty > 0 AND p.stock_qty <= p.reorder_level';
    if (($opts['stock'] ?? '') === 'out') $where .= ' AND p.stock_qty <= 0';
    if (($opts['stock'] ?? '') === 'in') $where .= ' AND p.stock_qty > 0';
    if (($opts['status'] ?? '') === 'hidden') $where .= ' AND NOT p.is_active';
    [$searchSql, $searchParams] = product_search_sql($opts['q'] ?? '');
    $where .= $searchSql;
    $params = array_merge($params, $searchParams);

    $from = 'FROM product_details p
            LEFT JOIN brands b ON b.id = p.brand_id
            LEFT JOIN product_category c ON c.id = p.product_category_id
            LEFT JOIN uoms u ON u.id = p.uom_id';

    $total = null;
    $limit = '';
    if (isset($opts['limit'])) {
        $count = $conn->prepare("SELECT COUNT(*) $from WHERE $where");
        $count->execute($params);
        $total = (int) $count->fetchColumn();
        $limit = ' LIMIT ' . (int) $opts['limit'] . ' OFFSET ' . (int) ($opts['offset'] ?? 0);
    }

    $stmt = $conn->prepare(
        "SELECT p.id, p.name, p.sku, p.description, p.is_active, p.has_variants, p.variant_label,
                p.brand_id, b.name AS brand, b.logo_path AS brand_logo,
                p.product_category_id AS category_id, c.name AS category,
                p.uom_id, u.code AS uom, u.is_measure AS uom_is_measure, p.uom_qty,
                p.stock_qty, p.reorder_level, p.promo_price, p.promo_type, p.promo_until,
                (SELECT thumb_path FROM product_media WHERE product_id = p.id AND is_cover LIMIT 1) AS cover,
                (SELECT COUNT(*) FROM product_media WHERE product_id = p.id) AS media_count,
                COALESCE((SELECT json_object_agg(rp.role_id, rp.price) FROM product_role_prices rp WHERE rp.product_id = p.id), '{}') AS prices
         $from WHERE $where
         ORDER BY LOWER(b.name), LOWER(p.name)$limit"
    );
    $stmt->execute($params);

    $rows = array_map(function ($row) {
        foreach (['id', 'brand_id', 'category_id', 'uom_id', 'stock_qty', 'reorder_level', 'media_count'] as $k) {
            $row[$k] = $row[$k] === null ? null : (int) $row[$k];
        }
        $row['uom_qty'] = $row['uom_qty'] === null ? null : rtrim(rtrim($row['uom_qty'], '0'), '.');
        $row['size'] = size_label($row['uom_qty'], $row['uom']);
        $row['prices'] = (object) array_map('strval', json_decode($row['prices'], true) ?: []);
        $row['promo_active'] = promo_is_active($row);
        return $row;
    }, $stmt->fetchAll());

    // Variants (shades, sizes…) of the products that have them.
    $variants = variants_for_products($conn, array_column(array_filter($rows, fn ($r) => $r['has_variants']), 'id'));
    foreach ($rows as &$r) {
        $r['variants'] = $variants[$r['id']] ?? [];
    }
    unset($r);

    return $total === null ? $rows : [$rows, $total];
}

/** Seller product list, one page at a time. Inputs: page, per_page, q, brand, category, stock, status. */
function list_products($conn) {
    [, $store] = require_seller_store($conn);
    [$page, $perPage] = page_params(50, 200);
    [$rows, $total] = product_rows($conn, $store['id'], null, [
        'q' => input('q'), 'brand' => input('brand'), 'category' => input('category'),
        'stock' => input('stock'), 'status' => input('status'),
        'limit' => $perPage, 'offset' => ($page - 1) * $perPage,
    ]);
    respond(['success' => true, 'products' => $rows, 'total' => $total, 'page' => $page, 'per_page' => $perPage]
        + catalog_lists($conn, $store['id']));
}

/** Every product matching the filters (for Excel export). */
function export_products($conn) {
    [, $store] = require_seller_store($conn);
    $rows = product_rows($conn, $store['id'], null, [
        'q' => input('q'), 'brand' => input('brand'), 'category' => input('category'),
        'stock' => input('stock'), 'status' => input('status'),
    ]);
    respond(['success' => true, 'products' => $rows] + catalog_lists($conn, $store['id']));
}

/** One product for the edit form, with its photos/videos and the form's lists. */
function get_product($conn) {
    [, $store] = require_seller_store($conn);
    $rows = product_rows($conn, $store['id'], (int) input('id'));
    if (!$rows) {
        fail('Product not found.', 404);
    }
    respond(['success' => true, 'product' => $rows[0], 'media' => product_media_rows($conn, $rows[0]['id']), 'qty_prices' => product_qty_prices($conn, $rows[0]['id'])]
        + catalog_lists($conn, $store['id']));
}

/* ---------------- save (shared by the form and the importer) ---------------- */

/**
 * Creates or updates one product. `$data` keys (all optional on update):
 *   name, sku, brand_id, category_id, uom_id, description, reorder_level, is_active,
 *   promo_price, promo_type, promo_until, prices => [role_id => price|null]
 * (The seller's cost is the price of the store's cost role, e.g. DD. Stock is
 * changed only through apply_stock_change() so every change is recorded.)
 * Throws ProductError on bad input. Returns the product id.
 */
function upsert_product($conn, $storeId, $id, array $data) {
    $owned = function ($table, $value, $label) use ($conn, $storeId) {
        if ($value === null || $value === '' || (int) $value === 0) {
            return null;
        }
        $stmt = $conn->prepare("SELECT 1 FROM $table WHERE id = ? AND store_id = ?");
        $stmt->execute([(int) $value, $storeId]);
        if (!$stmt->fetch()) {
            throw new ProductError("$label not found.");
        }
        return (int) $value;
    };

    $current = null;
    if ($id) {
        $stmt = $conn->prepare('SELECT * FROM product_details WHERE id = ? AND store_id = ?');
        $stmt->execute([$id, $storeId]);
        $current = $stmt->fetch();
        if (!$current) {
            throw new ProductError('Product not found.');
        }
    }

    // Start from the current values so a partial update (import) keeps the rest.
    $row = [
        'name' => $current['name'] ?? '',
        'sku' => $current['sku'] ?? null,
        'brand_id' => $current['brand_id'] ?? null,
        'product_category_id' => $current['product_category_id'] ?? null,
        'uom_id' => $current['uom_id'] ?? null,
        'description' => $current['description'] ?? null,
        'reorder_level' => $current ? (int) $current['reorder_level'] : 5,
        'uom_qty' => $current['uom_qty'] ?? null,
        'is_active' => $current ? (bool) $current['is_active'] : true,
        'promo_price' => $current['promo_price'] ?? null,
        'promo_type' => $current['promo_type'] ?? null,
        'promo_until' => $current['promo_until'] ?? null,
    ];

    if (array_key_exists('name', $data)) $row['name'] = trim((string) $data['name']);
    if (array_key_exists('sku', $data)) $row['sku'] = trim((string) $data['sku']) ?: null;
    if (array_key_exists('brand_id', $data)) $row['brand_id'] = $owned('brands', $data['brand_id'], 'Brand');
    if (array_key_exists('category_id', $data)) $row['product_category_id'] = $owned('product_category', $data['category_id'], 'Category');
    if (array_key_exists('uom_id', $data)) $row['uom_id'] = $owned('uoms', $data['uom_id'], 'Unit');
    if (array_key_exists('description', $data)) $row['description'] = trim((string) $data['description']) ?: null;
    if (array_key_exists('reorder_level', $data) && trim((string) $data['reorder_level']) !== '') {
        if (!preg_match('/^\d{1,6}$/', trim((string) $data['reorder_level']))) {
            throw new ProductError('Low-stock level must be a whole number.');
        }
        $row['reorder_level'] = (int) $data['reorder_level'];
    }
    if (array_key_exists('is_active', $data)) $row['is_active'] = filter_var($data['is_active'], FILTER_VALIDATE_BOOLEAN);
    if (array_key_exists('promo_price', $data)) $row['promo_price'] = money_or_error($data['promo_price'], 'Promo price');
    if (array_key_exists('promo_type', $data)) $row['promo_type'] = promo_type_or_error($data['promo_type']);
    if (array_key_exists('promo_until', $data)) $row['promo_until'] = date_or_error($data['promo_until'], 'Promo valid until');

    if ($row['name'] === '' || mb_strlen($row['name']) > 255) {
        throw new ProductError('Product name is required (max 255 characters).');
    }
    // Size: "how many ml / g ..." when the unit is a measure.
    if (array_key_exists('uom_qty', $data)) {
        $q = trim(str_replace(',', '', (string) $data['uom_qty']));
        if ($q !== '' && (!is_numeric($q) || (float) $q <= 0 || (float) $q >= 1e7)) {
            throw new ProductError('Size must be a number like 500 or 1.5.');
        }
        $row['uom_qty'] = $q === '' ? null : round((float) $q, 3);
    }
    $isMeasure = false;
    if ($row['uom_id']) {
        $m = $conn->prepare('SELECT is_measure, name FROM uoms WHERE id = ?');
        $m->execute([$row['uom_id']]);
        $unit = $m->fetch();
        $isMeasure = $unit && $unit['is_measure'];
        if ($isMeasure && $row['uom_qty'] === null && !empty($data['_require_size'])) {
            throw new ProductError('How many ' . strtolower($unit['name']) . 's? Enter the size, e.g. 500.');
        }
    }
    if (!$isMeasure) {
        $row['uom_qty'] = null;
    }

    if ($row['sku'] !== null && mb_strlen($row['sku']) > 100) {
        throw new ProductError('SKU must be at most 100 characters.');
    }
    if (!$row['brand_id']) {
        throw new ProductError('Please choose a brand.');
    }

    // Promo rules
    if ($row['promo_price'] === null) {
        $row['promo_type'] = null;
        $row['promo_until'] = null;
    } else {
        if ($row['promo_type'] === null) {
            $row['promo_type'] = $row['promo_until'] ? 'until_date' : 'while_supplies_last';
        }
        if ($row['promo_type'] === 'until_date' && !$row['promo_until']) {
            throw new ProductError('Choose the date the promo is valid until.');
        }
        if ($row['promo_type'] === 'while_supplies_last') {
            $row['promo_until'] = null;
        }
    }

    if ($row['sku'] !== null) {
        $dup = $conn->prepare('SELECT 1 FROM product_details WHERE store_id = ? AND LOWER(sku) = LOWER(?) AND id <> ?');
        $dup->execute([$storeId, $row['sku'], (int) $id]);
        if ($dup->fetch()) {
            throw new ProductError("SKU \"{$row['sku']}\" is already used by another product.");
        }
    }

    $values = [
        $row['name'], $row['sku'], $row['brand_id'], $row['product_category_id'], $row['uom_id'],
        $row['description'], $row['reorder_level'], $row['is_active'] ? 'true' : 'false',
        $row['promo_price'], $row['promo_type'], $row['promo_until'], $row['uom_qty'],
    ];

    if ($id) {
        $stmt = $conn->prepare(
            'UPDATE product_details SET name = ?, sku = ?, brand_id = ?, product_category_id = ?, uom_id = ?,
                    description = ?, reorder_level = ?, is_active = ?, promo_price = ?, promo_type = ?, promo_until = ?,
                    uom_qty = ?, updated_at = NOW()
             WHERE id = ? AND store_id = ?'
        );
        $stmt->execute(array_merge($values, [$id, $storeId]));
    } else {
        $stmt = $conn->prepare(
            'INSERT INTO product_details (name, sku, brand_id, product_category_id, uom_id, description, reorder_level,
                                          is_active, promo_price, promo_type, promo_until, uom_qty, store_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id'
        );
        $stmt->execute(array_merge($values, [$storeId]));
        $id = (int) $stmt->fetchColumn();
    }

    // Per-role prices: a blank price removes it.
    if (isset($data['prices']) && is_array($data['prices'])) {
        $roleCheck = $conn->prepare('SELECT name FROM store_roles WHERE id = ? AND store_id = ?');
        $upsert = $conn->prepare(
            'INSERT INTO product_role_prices (product_id, role_id, price) VALUES (?, ?, ?)
             ON CONFLICT (product_id, role_id) DO UPDATE SET price = EXCLUDED.price, updated_at = NOW()'
        );
        $remove = $conn->prepare('DELETE FROM product_role_prices WHERE product_id = ? AND role_id = ?');
        foreach ($data['prices'] as $roleId => $price) {
            $roleCheck->execute([(int) $roleId, $storeId]);
            $roleName = $roleCheck->fetchColumn();
            if ($roleName === false) {
                throw new ProductError('Customer role not found.');
            }
            $price = money_or_error($price, "$roleName price");
            if ($price === null) {
                $remove->execute([$id, (int) $roleId]);
            } else {
                $upsert->execute([$id, (int) $roleId, $price]);
            }
        }
    }

    return $id;
}

function save_product($conn) {
    [$user, $store] = require_seller_store($conn);
    $id = (int) input('id');
    $data = [
        'name' => input('name'),
        'sku' => input('sku'),
        'brand_id' => input('brand_id'),
        'category_id' => input('category_id'),
        'uom_id' => input('uom_id'),
        'description' => input('description'),
        'reorder_level' => input('reorder_level'),
        'is_active' => input('is_active') ?: 'true',
        'promo_price' => input('promo_price'),
        'promo_type' => input('promo_type'),
        'promo_until' => input('promo_until'),
        'uom_qty' => input('uom_qty'),
        '_require_size' => true,
        'prices' => json_input('prices'),
    ];
    $openingStock = input('opening_stock');

    $conn->beginTransaction();
    try {
        $isNew = !$id;
        $id = upsert_product($conn, $store['id'], $id, $data);
        if ($isNew && $openingStock !== '') {
            if (!preg_match('/^\d{1,7}$/', $openingStock)) {
                throw new ProductError('Opening stock must be a whole number.');
            }
            if ((int) $openingStock > 0) {
                apply_stock_change($conn, $store['id'], $id, (int) $openingStock, 'opening', $user['id']);
            }
        }
    } catch (ProductError $e) {
        $conn->rollBack();
        fail($e->getMessage());
    }
    $conn->commit();

    respond(['success' => true, 'product' => product_rows($conn, $store['id'], $id)[0]]);
}

function delete_product($conn) {
    [, $store] = require_seller_store($conn);
    $id = (int) input('id');
    owned_product($conn, $store['id'], $id);
    delete_product_files($conn, $store['id'], [$id]);
    $stmt = $conn->prepare('DELETE FROM product_details WHERE id = ? AND store_id = ?');
    $stmt->execute([$id, $store['id']]);
    respond(['success' => true]);
}

/* ---------------- Excel import ---------------- */

/**
 * `rows` is a JSON list of {column header: cell value} objects read from the sheet.
 * Known headers: Brand, Product, SKU, Category, UOM, Description, Stock,
 * Low Stock At, Promo Price, Promo Type, Promo Valid Until, Active, and one
 * column per role (e.g. "Retailer", "DD"; also "SRP"/"RS" for Retailer/Reseller,
 * and "My Cost" for the cost role). A product is matched by SKU, else by brand + name;
 * a Stock value sets the stock (recorded as an "import" movement);
 * columns missing from the file are left unchanged. Missing brands, categories
 * and units are created. Each row is saved on its own, so one bad row does not
 * stop the others.
 */
function import_products($conn) {
    [$user, $store] = require_seller_store($conn);
    $storeId = $store['id'];
    $rows = json_input('rows');
    if (count($rows) === 0) {
        fail('The file has no product rows.');
    }
    if (count($rows) > 5000) {
        fail('Please import at most 5000 products at a time.');
    }

    $roles = $conn->prepare('SELECT id, LOWER(name) AS name FROM store_roles WHERE store_id = ?');
    $roles->execute([$storeId]);
    $roleByName = [];
    foreach ($roles->fetchAll() as $r) {
        $roleByName[$r['name']] = (int) $r['id'];
        $roleByName[$r['name'] . ' price'] = (int) $r['id'];
    }
    // Supplier price-list headings.
    foreach (['srp' => 'retailer', 'rs' => 'reseller'] as $alias => $roleName) {
        if (isset($roleByName[$roleName]) && !isset($roleByName[$alias])) {
            $roleByName[$alias] = $roleByName[$roleName];
        }
    }
    if ($store['cost_role_id']) {
        foreach (['my cost', 'cost', 'cost price'] as $alias) {
            $roleByName[$alias] = (int) $store['cost_role_id'];
        }
    }

    $aliases = [
        'brand' => 'brand',
        'product' => 'name', 'product name' => 'name', 'name' => 'name',
        'sku' => 'sku', 'code' => 'sku',
        'category' => 'category',
        'uom' => 'uom', 'unit' => 'uom',
        'description' => 'description',
        'stock' => 'stock', 'qty' => 'stock', 'quantity' => 'stock', 'on hand' => 'stock',
        'low stock at' => 'reorder_level', 'reorder level' => 'reorder_level',
        'size' => 'uom_qty', 'amount' => 'uom_qty', 'content' => 'uom_qty',
        'promo price' => 'promo_price',
        'promo type' => 'promo_type',
        'promo valid until' => 'promo_until', 'promo until' => 'promo_until',
        'active' => 'is_active',
    ];

    $find = function ($table, $column, $value) use ($conn, $storeId) {
        $stmt = $conn->prepare("SELECT id FROM $table WHERE store_id = ? AND LOWER($column) = LOWER(?)");
        $stmt->execute([$storeId, $value]);
        $id = $stmt->fetchColumn();
        return $id === false ? null : (int) $id;
    };

    $created = 0;
    $updated = 0;
    $errors = [];

    $conn->beginTransaction();
    foreach ($rows as $index => $cells) {
        $rowNumber = $index + 2; // row 1 is the header
        if (!is_array($cells)) {
            continue;
        }

        $data = [];
        $prices = [];
        foreach ($cells as $header => $value) {
            $key = strtolower(trim((string) $header));
            $value = is_scalar($value) ? trim((string) $value) : '';
            if (isset($aliases[$key])) {
                $data[$aliases[$key]] = $value;
            } elseif (isset($roleByName[$key])) {
                $prices[$roleByName[$key]] = $value;
            }
        }
        if (implode('', array_map('strval', $data)) === '' && implode('', $prices) === '') {
            continue; // blank line
        }

        $conn->exec('SAVEPOINT import_row');
        try {
            if (($data['brand'] ?? '') === '') {
                throw new ProductError('Brand is required.');
            }
            if (($data['name'] ?? '') === '') {
                throw new ProductError('Product name is required.');
            }

            // Brand / category / unit by name, created when missing.
            $brandId = $find('brands', 'name', $data['brand']);
            if (!$brandId) {
                $stmt = $conn->prepare('INSERT INTO brands (store_id, name, slug) VALUES (?, ?, ?) RETURNING id');
                $stmt->execute([$storeId, $data['brand'], slugify($data['brand'])]);
                $brandId = (int) $stmt->fetchColumn();
            }
            $fields = ['brand_id' => $brandId, 'name' => $data['name']];

            if (array_key_exists('category', $data)) {
                $fields['category_id'] = null;
                if ($data['category'] !== '') {
                    $fields['category_id'] = $find('product_category', 'name', $data['category']);
                    if (!$fields['category_id']) {
                        $stmt = $conn->prepare(
                            'INSERT INTO product_category (store_id, name, slug, sort_order)
                             VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM product_category WHERE store_id = ?))
                             RETURNING id'
                        );
                        $stmt->execute([$storeId, $data['category'], slugify($data['category']), $storeId]);
                        $fields['category_id'] = (int) $stmt->fetchColumn();
                    }
                }
            }
            if (array_key_exists('uom', $data)) {
                $fields['uom_id'] = null;
                if ($data['uom'] !== '') {
                    $fields['uom_id'] = $find('uoms', 'code', $data['uom']) ?: $find('uoms', 'name', $data['uom']);
                    if (!$fields['uom_id']) {
                        $stmt = $conn->prepare(
                            'INSERT INTO uoms (store_id, code, name, sort_order)
                             VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM uoms WHERE store_id = ?))
                             RETURNING id'
                        );
                        $stmt->execute([$storeId, mb_substr($data['uom'], 0, 20), mb_substr($data['uom'], 0, 60), $storeId]);
                        $fields['uom_id'] = (int) $stmt->fetchColumn();
                    }
                }
            }
            foreach (['sku', 'description', 'reorder_level', 'uom_qty', 'promo_price', 'promo_type', 'promo_until'] as $k) {
                if (array_key_exists($k, $data)) {
                    $fields[$k] = $data[$k];
                }
            }
            if (array_key_exists('is_active', $data) && $data['is_active'] !== '') {
                $fields['is_active'] = !in_array(strtolower($data['is_active']), ['no', 'n', 'false', '0', 'inactive'], true);
            }
            if ($prices) {
                $fields['prices'] = $prices;
            }

            // Match an existing product: SKU first, then brand + name.
            $existingId = null;
            if (($data['sku'] ?? '') !== '') {
                $existingId = $find('product_details', 'sku', $data['sku']);
            }
            if (!$existingId) {
                $stmt = $conn->prepare(
                    'SELECT id FROM product_details WHERE store_id = ? AND brand_id = ? AND LOWER(name) = LOWER(?) LIMIT 1'
                );
                $stmt->execute([$storeId, $brandId, $data['name']]);
                $existingId = $stmt->fetchColumn() ?: null;
            }

            $productId = upsert_product($conn, $storeId, $existingId ? (int) $existingId : 0, $fields);

            // Stock column: set the stock to this number.
            if (($data['stock'] ?? '') !== '') {
                if (!preg_match('/^-?\d{1,7}$/', $data['stock'])) {
                    throw new ProductError('Stock must be a whole number.');
                }
                $cur = $conn->prepare('SELECT stock_qty FROM product_details WHERE id = ? FOR UPDATE');
                $cur->execute([$productId]);
                $delta = (int) $data['stock'] - (int) $cur->fetchColumn();
                if ($delta !== 0) {
                    apply_stock_change($conn, $storeId, $productId, $delta, 'import', $user['id']);
                }
            }
            $conn->exec('RELEASE SAVEPOINT import_row');
            $existingId ? $updated++ : $created++;
        } catch (ProductError $e) {
            $conn->exec('ROLLBACK TO SAVEPOINT import_row');
            $errors[] = ['row' => $rowNumber, 'message' => $e->getMessage()];
        } catch (PDOException $e) {
            $conn->exec('ROLLBACK TO SAVEPOINT import_row');
            $errors[] = ['row' => $rowNumber, 'message' => 'Could not save this row.'];
        }
    }
    $conn->commit();

    respond(['success' => true, 'created' => $created, 'updated' => $updated, 'errors' => $errors]);
}

/* ---------------- public store page ---------------- */

