<?php
/**
 * Server-side lists: one page at a time with search and filters, so pages stay
 * fast with hundreds of products. Used by the store page, the seller's
 * products / inventory / invoices / customers lists and the invoice form.
 */
if (!defined('BEAUTYHUB')) {
    exit;
}

/** [page, per_page] from the request, clamped. */
function page_params($default = 25, $max = 100) {
    $page = max(1, (int) input('page'));
    $perPage = (int) input('per_page') ?: $default;
    return [$page, min(max($perPage, 1), $max)];
}

/**
 * "AND ..." conditions for a search: every word must appear in one of the
 * given columns. Returns [sql, params].
 */
function search_sql($q, array $columns) {
    $sql = '';
    $params = [];
    foreach (array_slice(preg_split('/\s+/', trim((string) $q), -1, PREG_SPLIT_NO_EMPTY), 0, 6) as $word) {
        $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $word) . '%';
        $sql .= ' AND (' . implode(' OR ', array_map(fn ($c) => "$c ILIKE ?", $columns)) . ')';
        foreach ($columns as $_) {
            $params[] = $like;
        }
    }
    return [$sql, $params];
}

function product_search_sql($q) {
    return search_sql($q, ['p.name', 'p.sku', 'b.name', 'c.name']);
}

/** "500 ml" / "pc" for display. */
function size_label($qty, $uom) {
    if (!$uom) {
        return null;
    }
    if ($qty === null || $qty === '') {
        return $uom;
    }
    return rtrim(rtrim(number_format((float) $qty, 3, '.', ''), '0'), '.') . ' ' . $uom;
}

/* ---------------- store page ---------------- */

/**
 * One page of active products for the store page, priced for tier `$roleId`
 * (tier_price(): own tier, else the next tier up). An active promo is always
 * labelled and used when lower. Never includes the seller's cost.
 * Filters: q, brand, category, id. Also returns brand/category filter options.
 */
function store_products_page($conn, $storeId, $roleId, array $filters, $page, $perPage) {
    $base = 'p.store_id = ? AND p.is_active';
    $baseParams = [$storeId];
    if (!empty($filters['id'])) {
        $base .= ' AND p.id = ?';
        $baseParams[] = $filters['id'];
    }
    [$searchSql, $searchParams] = product_search_sql($filters['q'] ?? '');
    $facetWhere = $base . $searchSql;
    $facetParams = array_merge($baseParams, $searchParams);

    $where = $base;
    $params = $baseParams;
    if (!empty($filters['brand'])) {
        $where .= ' AND p.brand_id = ?';
        $params[] = $filters['brand'];
    }
    if (!empty($filters['category'])) {
        $where .= ' AND p.product_category_id = ?';
        $params[] = $filters['category'];
    }
    $where .= $searchSql;
    $params = array_merge($params, $searchParams);

    $from = 'FROM product_details p
             LEFT JOIN brands b ON b.id = p.brand_id
             LEFT JOIN product_category c ON c.id = p.product_category_id
             LEFT JOIN uoms u ON u.id = p.uom_id';

    $count = $conn->prepare("SELECT COUNT(*) $from WHERE $where");
    $count->execute($params);
    $total = (int) $count->fetchColumn();

    $stmt = $conn->prepare(
        "SELECT p.id, p.name, p.description, p.brand_id, b.name AS brand, b.logo_path AS brand_logo, p.has_variants, p.variant_label,
                c.name AS category, u.code AS uom, p.uom_qty,
                p.promo_price, p.promo_type, p.promo_until,
                tier_price(p.id, ?) AS price,
                (SELECT thumb_path FROM product_media WHERE product_id = p.id AND is_cover LIMIT 1) AS cover,
                (SELECT COUNT(*) FROM product_media WHERE product_id = p.id) AS media_count
         $from WHERE $where
         ORDER BY LOWER(b.name), LOWER(p.name)
         LIMIT ? OFFSET ?"
    );
    $stmt->execute(array_merge([(int) $roleId], $params, [$perPage, ($page - 1) * $perPage]));

    $products = array_map(function ($row) {
        $active = promo_is_active($row);
        $lower = $active && ($row['price'] === null || (float) $row['promo_price'] < (float) $row['price']);
        return [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'description' => $row['description'],
            'brand_id' => $row['brand_id'] === null ? null : (int) $row['brand_id'],
            'brand' => $row['brand'],
            'brand_logo' => $row['brand_logo'],
            'category' => $row['category'],
            'uom' => $row['uom'],
            'size' => size_label($row['uom_qty'], $row['uom']),
            'cover' => $row['cover'],
            'media_count' => (int) $row['media_count'],
            'price' => $row['price'],
            'promo_price' => $lower ? $row['promo_price'] : null,
            'promo_type' => $active ? $row['promo_type'] : null,
            'promo_until' => $active ? $row['promo_until'] : null,
            'has_variants' => (bool) $row['has_variants'],
            'variant_label' => $row['variant_label'],
        ];
    }, $stmt->fetchAll());

    // Variants customers can pick from (only active ones; stock shown as in / out).
    $variants = variants_for_products($conn, array_column(array_filter($products, fn ($p) => $p['has_variants']), 'id'));
    $store = ['id' => $storeId, 'cost_role_id' => 0];
    $vPrices = variant_prices_for_role($conn, $store, array_merge([], ...array_map(fn ($list) => array_column($list, 'id'), array_values($variants))), $roleId);
    foreach ($products as &$p) {
        $p['variants'] = array_values(array_map(
            fn ($v) => ['id' => $v['id'], 'name' => $v['name'], 'image' => $v['image'], 'image_full' => $v['image_full'], 'in_stock' => $v['stock_qty'] > 0, 'price' => $vPrices[$v['id']]['price'] ?? null],
            array_filter($variants[$p['id']] ?? [], fn ($v) => $v['is_active'])
        ));
    }
    unset($p);

    // Filter options with counts (search applied; brand/category not, so you can switch).
    $brands = $conn->prepare(
        "SELECT b.id, b.name, b.logo_path, COUNT(*) AS n $from WHERE $facetWhere AND b.id IS NOT NULL
         GROUP BY b.id ORDER BY LOWER(b.name)"
    );
    $brands->execute($facetParams);
    $cats = $conn->prepare(
        "SELECT c.id, c.name, COUNT(*) AS n $from WHERE $facetWhere AND c.id IS NOT NULL
         GROUP BY c.id ORDER BY c.sort_order, LOWER(c.name)"
    );
    $cats->execute($facetParams);

    return [
        'products' => $products,
        'total' => $total,
        'page' => $page,
        'per_page' => $perPage,
        'facets' => ['brands' => $brands->fetchAll(), 'categories' => $cats->fetchAll()],
    ];
}

/* ---------------- invoice form ---------------- */

/** Seller: type-ahead product search for the invoice form, priced for a tier. */
function search_products($conn) {
    [, $store] = require_seller_store($conn);
    $roleId = (int) input('role_id') ?: default_role_id($conn, $store['id']);
    [$searchSql, $searchParams] = product_search_sql(input('q'));
    if ($searchSql === '') {
        respond(['success' => true, 'products' => []]);
    }
    $stmt = $conn->prepare(
        "SELECT p.id FROM product_details p
         LEFT JOIN brands b ON b.id = p.brand_id
         LEFT JOIN product_category c ON c.id = p.product_category_id
         WHERE p.store_id = ? $searchSql
         ORDER BY p.is_active DESC, LOWER(p.name) LIMIT 12"
    );
    $stmt->execute(array_merge([$store['id']], $searchParams));
    $ids = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    respond(['success' => true, 'products' => quoted_products($conn, $store, $ids, $roleId)]);
}

/** Seller: current tier prices for products already on an invoice (when the tier changes). */
function quote_prices($conn) {
    [, $store] = require_seller_store($conn);
    $ids = array_values(array_filter(array_map('intval', json_input('ids'))));
    $roleId = (int) input('role_id') ?: default_role_id($conn, $store['id']);
    respond(['success' => true, 'products' => quoted_products($conn, $store, array_slice($ids, 0, 200), $roleId)]);
}

function quoted_products($conn, $store, array $ids, $roleId) {
    if (!$ids) {
        return [];
    }
    $rows = prices_for_role($conn, $store, $ids, $roleId);
    $in = implode(',', array_fill(0, count($ids), '?'));
    $t = $conn->prepare("SELECT product_id, thumb_path FROM product_media WHERE is_cover AND product_id IN ($in)");
    $t->execute($ids);
    $thumbs = $t->fetchAll(PDO::FETCH_KEY_PAIR);
    $variants = variants_for_products($conn, $ids);
    $vPrices = variant_prices_for_role($conn, $store, array_merge([], ...array_map(fn ($list) => array_column($list, 'id'), array_values($variants))), $roleId);

    $out = [];
    foreach ($ids as $id) {
        if (!isset($rows[$id])) {
            continue;
        }
        $r = $rows[$id];
        $out[] = [
            'id' => $id,
            'name' => $r['name'],
            'brand' => $r['brand'],
            'uom' => $r['uom'],
            'is_active' => (bool) $r['is_active'],
            'stock_qty' => (int) $r['stock_qty'],
            'price' => $r['price'],
            'cost' => $r['cost'],
            'cover' => $thumbs[$id] ?? null,
            'has_variants' => (bool) $r['has_variants'],
            'variant_label' => $r['variant_label'],
            'variants' => array_map(function ($v) use ($vPrices) {
                $v['price'] = $vPrices[$v['id']]['price'] ?? null;
                $v['cost'] = $vPrices[$v['id']]['cost'] ?? null;
                return $v;
            }, $variants[$id] ?? []),
        ];
    }
    return $out;
}

/* ---------------- price list (Excel / PDF / picture) ---------------- */

/**
 * Seller: products with their price for each chosen tier, for a printable /
 * shareable price list. Prices are what that tier pays (tier fallback applied).
 * Inputs: roles (JSON list of tier ids; empty = all), q, category,
 *         brands_in / brands_out (JSON lists of brand ids to include only / leave out),
 *         stock (in = only in stock), variants (1 = include variants)
 */
function price_list($conn) {
    [, $store] = require_seller_store($conn);

    $allRoles = $conn->prepare('SELECT id, name, tier_level FROM store_roles WHERE store_id = ? ORDER BY tier_level, id');
    $allRoles->execute([$store['id']]);
    $allRoles = $allRoles->fetchAll();
    $wanted = array_map('intval', json_input('roles'));
    $roles = array_values(array_filter($allRoles, fn ($r) => !$wanted || in_array((int) $r['id'], $wanted, true)));
    if (!$roles) {
        fail('Choose at least one tier.');
    }

    $where = 'p.store_id = ? AND p.is_active';
    $params = [$store['id']];
    // Brands: include only these (if any), and leave these out.
    $ids = fn ($key) => array_values(array_filter(array_map('intval', json_input($key))));
    if ($in = $ids('brands_in')) {
        $where .= ' AND p.brand_id IN (' . implode(',', array_fill(0, count($in), '?')) . ')';
        array_push($params, ...$in);
    }
    if ($out = $ids('brands_out')) {
        // Products without a brand stay in.
        $where .= ' AND (p.brand_id IS NULL OR p.brand_id NOT IN (' . implode(',', array_fill(0, count($out), '?')) . '))';
        array_push($params, ...$out);
    }
    if ((int) input('category')) {
        $where .= ' AND p.product_category_id = ?';
        $params[] = (int) input('category');
    }
    if (input('stock') === 'in') {
        $where .= ' AND p.stock_qty > 0';
    }
    [$searchSql, $searchParams] = product_search_sql(input('q'));
    $where .= $searchSql;
    $params = array_merge($params, $searchParams);

    $cols = implode(', ', array_map(fn ($i) => "tier_price(p.id, ?) AS t$i", array_keys($roles)));
    $stmt = $conn->prepare(
        "SELECT p.id, p.name, p.sku, p.has_variants, p.variant_label, p.uom_qty, u.code AS uom,
                b.name AS brand, b.logo_path AS brand_logo, c.name AS category, p.promo_price, p.promo_type, p.promo_until,
                (SELECT thumb_path FROM product_media WHERE product_id = p.id AND is_cover LIMIT 1) AS image,
                $cols
         FROM product_details p
         LEFT JOIN brands b ON b.id = p.brand_id
         LEFT JOIN product_category c ON c.id = p.product_category_id
         LEFT JOIN uoms u ON u.id = p.uom_id
         WHERE $where
         ORDER BY LOWER(b.name), LOWER(p.name)
         LIMIT 3000"
    );
    $stmt->execute(array_merge(array_map(fn ($r) => (int) $r['id'], $roles), $params));

    $products = [];
    foreach ($stmt->fetchAll() as $row) {
        $prices = [];
        foreach ($roles as $i => $r) {
            $prices[(int) $r['id']] = $row["t$i"];
        }
        $products[] = [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'sku' => $row['sku'],
            'brand' => $row['brand'],
            'brand_logo' => $row['brand_logo'],
            'category' => $row['category'],
            'size' => size_label($row['uom_qty'], $row['uom']),
            'image' => $row['image'],
            'prices' => $prices,
            'promo' => promo_is_active($row) ? ['price' => $row['promo_price'], 'type' => $row['promo_type'], 'until' => $row['promo_until']] : null,
            'variant_label' => $row['variant_label'],
            'variants' => [],
            'has_variants' => (bool) $row['has_variants'],
        ];
    }

    // Variants, each with its own price per tier.
    if (input('variants') === '1') {
        $withVariants = array_column(array_filter($products, fn ($p) => $p['has_variants']), 'id');
        if ($withVariants) {
            $in = implode(',', array_fill(0, count($withVariants), '?'));
            $vcols = implode(', ', array_map(fn ($i) => "variant_tier_price(v.id, ?) AS t$i", array_keys($roles)));
            $v = $conn->prepare(
                "SELECT v.id, v.product_id, v.name, v.sku, m.thumb_path AS image, $vcols
                 FROM product_variants v LEFT JOIN product_media m ON m.id = v.media_id
                 WHERE v.is_active AND v.product_id IN ($in) ORDER BY v.sort_order, v.id"
            );
            $v->execute(array_merge(array_map(fn ($r) => (int) $r['id'], $roles), $withVariants));
            $byProduct = [];
            foreach ($v->fetchAll() as $row) {
                $prices = [];
                foreach ($roles as $i => $r) {
                    $prices[(int) $r['id']] = $row["t$i"];
                }
                $byProduct[(int) $row['product_id']][] = [
                    'id' => (int) $row['id'], 'name' => $row['name'], 'sku' => $row['sku'], 'image' => $row['image'], 'prices' => $prices,
                ];
            }
            foreach ($products as &$p) {
                $p['variants'] = $byProduct[$p['id']] ?? [];
            }
            unset($p);
        }
    }

    respond([
        'success' => true,
        'store' => ['name' => $store['name'], 'logo' => $store['logo_path']],
        'roles' => array_map(fn ($r) => ['id' => (int) $r['id'], 'name' => $r['name']], $roles),
        'products' => $products,
        'generated_at' => date('Y-m-d H:i'),
    ]);
}
