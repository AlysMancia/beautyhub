<?php
/**
 * "Explore stores": the public store directory, store categories (managed by
 * admins) and the categories each seller picks for their shop.
 */
if (!defined('BEAUTYHUB')) {
    exit;
}

const MAX_STORE_CATEGORIES = 5;

/** All store categories, with how many (visible) stores use each. */
function store_categories($conn) {
    return array_map(fn ($c) => ['id' => (int) $c['id'], 'name' => $c['name'], 'icon' => $c['icon'], 'store_count' => (int) $c['store_count']],
        $conn->query(
            'SELECT c.id, c.name, c.icon, COUNT(s.id) AS store_count
             FROM store_categories c
             LEFT JOIN store_category_links l ON l.category_id = c.id
             LEFT JOIN stores s ON s.id = l.store_id AND EXISTS (SELECT 1 FROM users u WHERE u.id = s.owner_id AND u.is_active)
             GROUP BY c.id ORDER BY c.sort_order, LOWER(c.name)'
        )->fetchAll());
}

/** [store_id => [{id, name, icon}]] */
function categories_for_stores($conn, array $storeIds) {
    if (!$storeIds) {
        return [];
    }
    $in = implode(',', array_fill(0, count($storeIds), '?'));
    $stmt = $conn->prepare(
        "SELECT l.store_id, c.id, c.name, c.icon FROM store_category_links l JOIN store_categories c ON c.id = l.category_id
         WHERE l.store_id IN ($in) ORDER BY c.sort_order, LOWER(c.name)"
    );
    $stmt->execute(array_map('intval', $storeIds));
    $out = [];
    foreach ($stmt->fetchAll() as $r) {
        $out[(int) $r['store_id']][] = ['id' => (int) $r['id'], 'name' => $r['name'], 'icon' => $r['icon']];
    }
    return $out;
}

/** Public: categories for the filter. A logged-in seller also gets the ones they picked (`mine`). */
function list_store_categories($conn) {
    $result = ['success' => true, 'categories' => store_categories($conn)];
    $user = current_user($conn);
    if ($user && $user['account_type'] === 'seller') {
        $stmt = $conn->prepare('SELECT l.category_id FROM store_category_links l JOIN stores s ON s.id = l.store_id WHERE s.owner_id = ?');
        $stmt->execute([$user['id']]);
        $result['mine'] = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }
    respond($result);
}

/**
 * Public store directory. Inputs: q, category, page, per_page.
 * Stores of turned-off sellers are hidden.
 */
function list_stores($conn) {
    [$page, $perPage] = page_params(24, 60);
    $where = 'EXISTS (SELECT 1 FROM users u WHERE u.id = s.owner_id AND u.is_active)';
    $params = [];
    if ((int) input('category')) {
        $where .= ' AND EXISTS (SELECT 1 FROM store_category_links l WHERE l.store_id = s.id AND l.category_id = ?)';
        $params[] = (int) input('category');
    }
    [$searchSql, $searchParams] = search_sql(input('q'), ['s.name', 's.description', 's.city_name', 's.province_name']);
    $where .= $searchSql;
    $params = array_merge($params, $searchParams);

    $count = $conn->prepare("SELECT COUNT(*) FROM stores s WHERE $where");
    $count->execute($params);
    $stmt = $conn->prepare(
        "SELECT s.id, s.slug, s.name, s.description, s.logo_path, s.city_name, s.province_name,
                (SELECT COUNT(*) FROM product_details p WHERE p.store_id = s.id AND p.is_active) AS product_count
         FROM stores s WHERE $where
         ORDER BY (SELECT COUNT(*) FROM product_details p WHERE p.store_id = s.id AND p.is_active) > 0 DESC, LOWER(s.name)
         LIMIT ? OFFSET ?"
    );
    $stmt->execute(array_merge($params, [$perPage, ($page - 1) * $perPage]));
    $rows = $stmt->fetchAll();
    $ids = array_map(fn ($r) => (int) $r['id'], $rows);
    $cats = categories_for_stores($conn, $ids);

    // A few product photos per store, for the card.
    $photos = [];
    if ($ids) {
        $in = implode(',', array_fill(0, count($ids), '?'));
        $p = $conn->prepare(
            "SELECT store_id, thumb_path FROM (
                 SELECT p.store_id, m.thumb_path, ROW_NUMBER() OVER (PARTITION BY p.store_id ORDER BY p.updated_at DESC, p.id DESC) AS n
                 FROM product_details p JOIN product_media m ON m.product_id = p.id AND m.is_cover
                 WHERE p.store_id IN ($in) AND p.is_active AND m.thumb_path IS NOT NULL
             ) x WHERE n <= 3"
        );
        $p->execute($ids);
        foreach ($p->fetchAll() as $r) {
            $photos[(int) $r['store_id']][] = $r['thumb_path'];
        }
    }

    respond([
        'success' => true,
        'stores' => array_map(fn ($r) => [
            'slug' => $r['slug'],
            'name' => $r['name'],
            'description' => $r['description'],
            'logo_path' => $r['logo_path'],
            'place' => implode(', ', array_filter([$r['city_name'], $r['province_name']])),
            'product_count' => (int) $r['product_count'],
            'categories' => $cats[(int) $r['id']] ?? [],
            'photos' => $photos[(int) $r['id']] ?? [],
        ], $rows),
        'total' => (int) $count->fetchColumn(),
        'page' => $page,
        'per_page' => $perPage,
        'categories' => store_categories($conn),
    ]);
}

/** Seller: the categories their shop is listed under. Inputs: ids (JSON list). */
function set_store_categories($conn) {
    [, $store] = require_seller_store($conn);
    $ids = array_values(array_unique(array_filter(array_map('intval', json_input('ids')))));
    if (count($ids) > MAX_STORE_CATEGORIES) {
        fail('Choose up to ' . MAX_STORE_CATEGORIES . ' categories.');
    }
    if ($ids) {
        $in = implode(',', array_fill(0, count($ids), '?'));
        $check = $conn->prepare("SELECT COUNT(*) FROM store_categories WHERE id IN ($in)");
        $check->execute($ids);
        if ((int) $check->fetchColumn() !== count($ids)) {
            fail('Category not found.');
        }
    }
    $conn->beginTransaction();
    $conn->prepare('DELETE FROM store_category_links WHERE store_id = ?')->execute([$store['id']]);
    $insert = $conn->prepare('INSERT INTO store_category_links (store_id, category_id) VALUES (?, ?)');
    foreach ($ids as $id) {
        $insert->execute([$store['id'], $id]);
    }
    $conn->commit();
    respond(['success' => true, 'mine' => $ids]);
}

/* ---------------- admin: the list of store categories ---------------- */

/** Inputs: id?, name, icon. */
function admin_save_store_category($conn) {
    require_admin($conn);
    $id = (int) input('id');
    $name = mb_substr(trim(input('name')), 0, 60);
    $icon = input('icon');
    if ($name === '') {
        fail('Enter a category name.');
    }
    if ($icon !== '' && !preg_match('/^fa-[a-z0-9-]{1,36}$/', $icon)) {
        fail('Icon must look like fa-spa.');
    }
    $dup = $conn->prepare('SELECT 1 FROM store_categories WHERE LOWER(name) = LOWER(?) AND id <> ?');
    $dup->execute([$name, $id]);
    if ($dup->fetchColumn()) {
        fail('That category already exists.');
    }
    if ($id) {
        $conn->prepare('UPDATE store_categories SET name = ?, icon = COALESCE(NULLIF(?, \'\'), icon), updated_at = NOW() WHERE id = ?')
            ->execute([$name, $icon, $id]);
    } else {
        $conn->prepare(
            "INSERT INTO store_categories (name, icon, sort_order)
             VALUES (?, COALESCE(NULLIF(?, ''), 'fa-store'), (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM store_categories))"
        )->execute([$name, $icon]);
    }
    respond(['success' => true, 'categories' => store_categories($conn)]);
}

function admin_delete_store_category($conn) {
    require_admin($conn);
    $conn->prepare('DELETE FROM store_categories WHERE id = ?')->execute([(int) input('id')]);
    respond(['success' => true, 'categories' => store_categories($conn)]);
}
