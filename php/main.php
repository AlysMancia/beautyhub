<?php
header('Content-Type: application/json; charset=utf-8');

session_set_cookie_params([
    'path' => '/',
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

$dbHost = getenv('DB_HOST') ?: 'localhost';
$dbPort = getenv('DB_PORT') ?: '5432';
$dbName = getenv('DB_NAME') ?: 'beautyhub';
$dbUser = getenv('DB_USER') ?: 'beautyhub';
$dbPass = getenv('DB_PASSWORD') ?: 'beautyhub';

try {
    $conn = new PDO(
        "pgsql:host=$dbHost;port=$dbPort;dbname=$dbName",
        $dbUser,
        $dbPass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]
    );
    // Store and compare times in the shop's timezone (APP_TIMEZONE, e.g. Asia/Manila),
    // so "today", "this month" and the times shown on invoices are local times.
    $conn->exec('SET TIME ZONE ' . $conn->quote(getenv('APP_TIMEZONE') ?: 'UTC'));
} catch (PDOException $e) {
    respond([
        'success' => false,
        'message' => "Database connection failed. Is the postgres container running? (db '$dbName')",
        'error' => $e->getMessage(),
    ], 500);
}

date_default_timezone_set(getenv('APP_TIMEZONE') ?: 'UTC');

define('BEAUTYHUB', true);
require __DIR__ . '/lib/catalog.php';
require __DIR__ . '/lib/products.php';
require __DIR__ . '/lib/profile.php';
require __DIR__ . '/lib/location.php';
require __DIR__ . '/lib/inventory.php';
require __DIR__ . '/lib/invoices.php';
require __DIR__ . '/lib/media.php';
require __DIR__ . '/lib/listings.php';

$routes = [
    // auth
    'create_user'     => 'create_user',
    'login_user'      => 'login_user',
    'logout_user'     => 'logout_user',
    'me'              => 'me',
    'get_user_info'   => 'get_user_info',
    // public store page + customers
    'get_store'       => 'get_store',
    'join_store'      => 'join_store',
    // seller only
    'update_store'    => 'update_store',
    'update_store_location' => 'update_store_location',
    'list_roles'      => 'list_roles',
    'create_role'     => 'create_role',
    'rename_role'     => 'rename_role',
    'set_default_role'=> 'set_default_role',
    'delete_role'     => 'delete_role',
    'list_members'    => 'list_members',
    'set_member_role' => 'set_member_role',
    'remove_member'   => 'remove_member',
    // seller: catalog setup (lib/catalog.php)
    'list_catalog'    => 'list_catalog',
    'save_brand'      => 'save_brand',
    'delete_brand'    => 'delete_brand',
    'save_category'   => 'save_category',
    'delete_category' => 'delete_category',
    'save_uom'        => 'save_uom',
    'delete_uom'      => 'delete_uom',
    // seller: products (lib/products.php)
    'list_products'   => 'list_products',
    'save_product'    => 'save_product',
    'delete_product'  => 'delete_product',
    'import_products' => 'import_products',
    // any logged-in user (lib/profile.php)
    // seller: inventory (lib/inventory.php)
    'list_inventory'  => 'list_inventory',
    'adjust_stock'    => 'adjust_stock',
    'set_reorder_level' => 'set_reorder_level',
    'stock_history'   => 'stock_history',
    // invoices (lib/invoices.php)
    'list_invoices'   => 'list_invoices',
    'get_invoice'     => 'get_invoice',
    'save_invoice'    => 'save_invoice',
    'approve_invoice' => 'approve_invoice',
    'reject_invoice'  => 'reject_invoice',
    'cancel_invoice'  => 'cancel_invoice',
    'invoice_customers' => 'invoice_customers',
    'dashboard_stats' => 'dashboard_stats',
    'place_order'     => 'place_order',
    'my_orders'       => 'my_orders',
    'set_cost_role'   => 'set_cost_role',
    'move_role'       => 'move_role',
    // photos, videos, logos (lib/media.php)
    'get_product_media'    => 'get_product_media',
    'upload_product_media' => 'upload_product_media',
    'set_product_cover'    => 'set_product_cover',
    'delete_product_media' => 'delete_product_media',
    'upload_brand_logo'    => 'upload_brand_logo',
    'delete_brand_logo'    => 'delete_brand_logo',
    'upload_store_logo'    => 'upload_store_logo',
    'delete_store_logo'    => 'delete_store_logo',
    // server-side lists for the invoice form and store page
    'search_products'      => 'search_products',
    'quote_prices'         => 'quote_prices',
    'get_store_product'    => 'get_store_product',
    'get_product'          => 'get_product',
    'export_products'      => 'export_products',
    'update_profile'  => 'update_profile',
    'change_password' => 'change_password',
];

$functionName = $_POST['FunctionName'] ?? '';
if (!isset($routes[$functionName])) {
    fail('Invalid FunctionName.');
}

try {
    $routes[$functionName]($conn);
} catch (PDOException $e) {
    if ($conn->inTransaction()) {
        $conn->rollBack();
    }
    respond(['success' => false, 'message' => 'Database error.', 'error' => $e->getMessage()], 500);
}

/* =====================================================================
 * Helpers
 * ===================================================================== */

function respond($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

function fail($message, $status = 400) {
    respond(['success' => false, 'message' => $message], $status);
}

function input($key) {
    return trim((string) ($_POST[$key] ?? ''));
}

/**
 * Parses a money amount ("1,250.50", "₱99") into a "1250.50" string, or null when blank.
 * Fails the request with `$label` in the message when the value isn't a valid amount.
 */
function parse_money($value, $label) {
    $value = trim(str_replace([',', '₱', 'PHP', ' '], '', (string) $value));
    if ($value === '') {
        return null;
    }
    if (!preg_match('/^\d{1,10}(\.\d{1,2})?$/', $value)) {
        fail("$label must be an amount like 120 or 120.50.");
    }
    return number_format((float) $value, 2, '.', '');
}

/** Decodes a JSON-encoded form field into an array (empty array when missing). */
function json_input($key) {
    $raw = $_POST[$key] ?? '';
    if ($raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        fail("Invalid $key data.");
    }
    return $data;
}

function current_user($conn) {
    if (empty($_SESSION['user_id'])) {
        return null;
    }
    $stmt = $conn->prepare('SELECT id, name, username, email, account_type FROM users WHERE id = ?');
    $stmt->execute([(int) $_SESSION['user_id']]);
    $user = $stmt->fetch();
    return $user ?: null;
}

/** Fails with 401/403 unless someone is logged in (optionally with a specific account type). */
function require_user($conn, $accountType = null) {
    $user = current_user($conn);
    if (!$user) {
        fail('Please log in first.', 401);
    }
    if ($accountType && $user['account_type'] !== $accountType) {
        fail("Only $accountType accounts can do this.", 403);
    }
    return $user;
}

/** Logged-in seller + their store. Every seller action is scoped to this store id. */
function require_seller_store($conn) {
    $user = require_user($conn, 'seller');
    $stmt = $conn->prepare('SELECT * FROM stores WHERE owner_id = ?');
    $stmt->execute([$user['id']]);
    $store = $stmt->fetch();
    if (!$store) {
        fail('Seller account has no store.', 404);
    }
    return [$user, $store];
}

function find_store_by_slug($conn, $slug) {
    $stmt = $conn->prepare('SELECT * FROM stores WHERE slug = ?');
    $stmt->execute([strtolower($slug)]);
    return $stmt->fetch() ?: null;
}

function slugify($text) {
    $slug = strtolower(trim($text));
    $slug = preg_replace('/[^a-z0-9]+/', '-', $slug);
    $slug = trim($slug, '-');
    return substr($slug, 0, 50) ?: 'store';
}

function unique_store_slug($conn, $name) {
    $base = slugify($name);
    $slug = $base;
    $stmt = $conn->prepare('SELECT 1 FROM stores WHERE slug = ?');
    for ($i = 2; ; $i++) {
        $stmt->execute([$slug]);
        if (!$stmt->fetch()) {
            return $slug;
        }
        $slug = $base . '-' . $i;
    }
}

function default_role_id($conn, $storeId) {
    $stmt = $conn->prepare('SELECT id FROM store_roles WHERE store_id = ? AND is_default LIMIT 1');
    $stmt->execute([$storeId]);
    $id = $stmt->fetchColumn();
    return $id === false ? null : (int) $id;
}

function add_member($conn, $storeId, $userId) {
    $stmt = $conn->prepare(
        'INSERT INTO store_members (store_id, user_id, role_id) VALUES (?, ?, ?)
         ON CONFLICT (store_id, user_id) DO NOTHING'
    );
    $stmt->execute([$storeId, $userId, default_role_id($conn, $storeId)]);
    return $stmt->rowCount() > 0;
}

/** Signed token that lets a seller's browser subscribe to their store's WebSocket channel. */
function store_ws_token($storeId) {
    $secret = getenv('WS_BROADCAST_SECRET') ?: 'change-me';
    return $storeId . '.' . hash_hmac('sha256', "store:$storeId", $secret);
}

/**
 * Push an event to the WebSocket server. Only browsers subscribed to that
 * store's channel receive it. Best effort: never breaks the request.
 */
function broadcast_event($storeId, $type, $payload = []) {
    $url = getenv('WS_BROADCAST_URL');
    if (!$url) {
        return;
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\n"
                . 'X-Broadcast-Secret: ' . (getenv('WS_BROADCAST_SECRET') ?: '') . "\r\n",
            'content' => json_encode(['store_id' => (int) $storeId, 'type' => $type, 'payload' => $payload]),
            'timeout' => 1,
            'ignore_errors' => true,
        ],
    ]);

    @file_get_contents($url, false, $context);
}

function public_user($user) {
    return [
        'id' => (int) $user['id'],
        'name' => $user['name'],
        'username' => $user['username'],
        'email' => $user['email'],
        'account_type' => $user['account_type'],
    ];
}

/* =====================================================================
 * Auth
 * ===================================================================== */

function create_user($conn) {
    $firstName = input('Firstname');
    $lastName = input('Lastname');
    $username = strtolower(input('username'));
    $email = strtolower(input('email'));
    $password = input('password');
    $accountType = input('account_type') ?: 'customer';
    $storeName = input('store_name');
    $joinSlug = input('store_slug'); // customer signing up from a seller's link

    if ($firstName === '' || $lastName === '' || $username === '' || $email === '' || $password === '') {
        fail('Missing required signup fields.');
    }
    if (!in_array($accountType, ['seller', 'customer'], true)) {
        fail('Account type must be seller or customer.');
    }
    if (!preg_match('/^[a-z0-9_.]{3,30}$/', $username)) {
        fail('Username must be 3-30 characters: letters, numbers, _ or .');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        fail('Please enter a valid email address.');
    }
    if (strlen($password) < 6) {
        fail('Password must be at least 6 characters.');
    }
    if ($accountType === 'seller' && $storeName === '') {
        fail('Please enter your store name.');
    }

    $joinStore = null;
    if ($accountType === 'customer' && $joinSlug !== '') {
        $joinStore = find_store_by_slug($conn, $joinSlug);
        if (!$joinStore) {
            fail('That store link is not valid.');
        }
    }

    $check = $conn->prepare('SELECT LOWER(email) = ? AS email_taken FROM users WHERE LOWER(email) = ? OR LOWER(username) = ? LIMIT 1');
    $check->execute([$email, $email, $username]);
    $existing = $check->fetch();
    if ($existing) {
        fail($existing['email_taken'] ? 'Email is already registered.' : 'Username is already taken.');
    }

    $conn->beginTransaction();

    $stmt = $conn->prepare(
        'INSERT INTO users (name, username, email, password, account_type) VALUES (?, ?, ?, ?, ?) RETURNING id'
    );
    $stmt->execute([
        trim("$firstName $lastName"),
        $username,
        $email,
        password_hash($password, PASSWORD_DEFAULT),
        $accountType,
    ]);
    $userId = (int) $stmt->fetchColumn();

    $storeSlug = null;
    if ($accountType === 'seller') {
        $storeSlug = unique_store_slug($conn, $storeName);
        $stmt = $conn->prepare('INSERT INTO stores (owner_id, slug, name) VALUES (?, ?, ?) RETURNING id');
        $stmt->execute([$userId, $storeSlug, $storeName]);
        $storeId = (int) $stmt->fetchColumn();

        // Default roles, categories and units (seeder in database/postgres/003_*.sql).
        $conn->prepare('SELECT seed_store_defaults(?)')->execute([$storeId]);
    } elseif ($joinStore) {
        add_member($conn, $joinStore['id'], $userId);
        $storeSlug = $joinStore['slug'];
    }

    $conn->commit();

    if ($joinStore) {
        broadcast_event($joinStore['id'], 'member_joined', ['name' => trim("$firstName $lastName")]);
    }

    // Log the new account in straight away.
    session_regenerate_id(true);
    $_SESSION['user_id'] = $userId;

    respond([
        'success' => true,
        'message' => 'Account created successfully.',
        'user_id' => $userId,
        'account_type' => $accountType,
        'store_slug' => $storeSlug,
    ]);
}

function login_user($conn) {
    $lookup = strtolower(input('username') ?: input('email'));
    $password = input('password');

    if ($lookup === '' || $password === '') {
        fail('Missing login credentials.');
    }

    $stmt = $conn->prepare(
        'SELECT id, name, password, account_type FROM users WHERE LOWER(email) = ? OR LOWER(username) = ? LIMIT 1'
    );
    $stmt->execute([$lookup, $lookup]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password'])) {
        fail('Invalid email or password.');
    }

    session_regenerate_id(true);
    $_SESSION['user_id'] = (int) $user['id'];

    if ($user['account_type'] === 'customer') {
        $stores = $conn->prepare('SELECT store_id FROM store_members WHERE user_id = ?');
        $stores->execute([$user['id']]);
        foreach ($stores->fetchAll(PDO::FETCH_COLUMN) as $storeId) {
            broadcast_event($storeId, 'member_logged_in', ['name' => $user['name']]);
        }
    }

    respond([
        'success' => true,
        'user_id' => (int) $user['id'],
        'account_type' => $user['account_type'],
    ]);
}

function logout_user($conn) {
    $_SESSION = [];
    session_destroy();
    respond(['success' => true]);
}

/** Who is logged in, plus their store (seller) or memberships (customer). */
function me($conn) {
    $user = current_user($conn);
    if (!$user) {
        respond(['success' => true, 'user' => null]);
    }

    $result = ['success' => true, 'user' => public_user($user)];

    if ($user['account_type'] === 'seller') {
        $stmt = $conn->prepare('SELECT * FROM stores WHERE owner_id = ?');
        $stmt->execute([$user['id']]);
        $row = $stmt->fetch();
        $store = null;
        if ($row) {
            $store = [
                'id' => $row['id'],
                'slug' => $row['slug'],
                'name' => $row['name'],
                'description' => $row['description'],
                'logo_path' => $row['logo_path'],
                'location' => store_location($row),
            ];
            $store['id'] = (int) $store['id'];
            $store['ws_token'] = store_ws_token($store['id']);
        }
        $result['store'] = $store ?: null;
    } else {
        $stmt = $conn->prepare(
            'SELECT s.slug, s.name, r.name AS role, m.created_at AS joined_at
             FROM store_members m
             JOIN stores s ON s.id = m.store_id
             LEFT JOIN store_roles r ON r.id = m.role_id
             WHERE m.user_id = ?
             ORDER BY s.name'
        );
        $stmt->execute([$user['id']]);
        $result['memberships'] = $stmt->fetchAll();
    }

    respond($result);
}

/** Kept for older pages: returns the logged-in user's name only. */
function get_user_info($conn) {
    $user = require_user($conn);
    respond(['success' => true, 'name' => $user['name'], 'username' => $user['username']]);
}

/* =====================================================================
 * Store page (public) + customers joining
 * ===================================================================== */

/**
 * Store page: store info, who is viewing, and one page of products.
 * Inputs: slug, page, per_page, q (search), brand (id), category (id).
 */
function get_store($conn) {
    $store = find_store_by_slug($conn, input('slug'));
    if (!$store) {
        fail('Store not found.', 404);
    }

    $owner = $conn->prepare('SELECT name FROM users WHERE id = ?');
    $owner->execute([$store['owner_id']]);

    [$viewer, $roleId] = store_viewer($conn, $store);
    [$page, $perPage] = page_params(24, 96);
    $list = store_products_page($conn, $store['id'], $roleId, [
        'q' => input('q'), 'brand' => (int) input('brand'), 'category' => (int) input('category'),
    ], $page, $perPage);

    respond([
        'success' => true,
        'store' => [
            'slug' => $store['slug'],
            'name' => $store['name'],
            'description' => $store['description'],
            'owner_name' => $owner->fetchColumn(),
            'logo_path' => $store['logo_path'],
            'location' => store_location($store),
        ],
        'viewer' => $viewer,
    ] + $list);
}

/** One product with all its photos/videos, priced for the viewer. */
function get_store_product($conn) {
    $store = find_store_by_slug($conn, input('slug'));
    if (!$store) {
        fail('Store not found.', 404);
    }
    [, $roleId] = store_viewer($conn, $store);
    $list = store_products_page($conn, $store['id'], $roleId, ['id' => (int) input('id')], 1, 1);
    if (!$list['products']) {
        fail('Product not found.', 404);
    }
    $product = $list['products'][0];
    $product['media'] = array_map(fn ($m) => ['kind' => $m['kind'], 'path' => $m['path'], 'thumb_path' => $m['thumb_path']],
        product_media_rows($conn, $product['id']));
    respond(['success' => true, 'product' => $product]);
}

/** [viewer info, role id whose prices to show]. Guests and non-members get the default tier. */
function store_viewer($conn, $store) {
    $viewer = ['relation' => 'guest', 'role' => null];
    $roleId = null; // whose prices to show
    $user = current_user($conn);
    if ($user) {
        if ((int) $user['id'] === (int) $store['owner_id']) {
            $viewer['relation'] = 'owner';
        } elseif ($user['account_type'] === 'customer') {
            $stmt = $conn->prepare(
                'SELECT r.id, r.name FROM store_members m LEFT JOIN store_roles r ON r.id = m.role_id
                 WHERE m.store_id = ? AND m.user_id = ?'
            );
            $stmt->execute([$store['id'], $user['id']]);
            $membership = $stmt->fetch();
            $viewer['relation'] = $membership ? 'member' : 'customer';
            $viewer['role'] = $membership['name'] ?? null;
            $roleId = $membership['id'] ?? null;
        } else {
            $viewer['relation'] = 'other_seller';
        }
    }

    // Members see their tier's prices; everyone else sees the default tier's prices.
    return [$viewer, $roleId ?: default_role_id($conn, $store['id'])];
}

function join_store($conn) {
    $user = require_user($conn, 'customer');
    $store = find_store_by_slug($conn, input('slug'));
    if (!$store) {
        fail('Store not found.', 404);
    }

    if (add_member($conn, $store['id'], $user['id'])) {
        broadcast_event($store['id'], 'member_joined', ['name' => $user['name']]);
    }
    respond(['success' => true]);
}

/* =====================================================================
 * Seller: store settings, roles, members
 * ===================================================================== */

function update_store($conn) {
    [, $store] = require_seller_store($conn);
    $name = input('name');
    if ($name === '') {
        fail('Store name is required.');
    }
    $stmt = $conn->prepare('UPDATE stores SET name = ?, description = ?, updated_at = NOW() WHERE id = ?');
    $stmt->execute([$name, input('description'), $store['id']]);
    respond(['success' => true]);
}

function list_roles($conn) {
    [, $store] = require_seller_store($conn);
    $stmt = $conn->prepare(
        'SELECT r.id, r.name, r.is_default, r.tier_level, COUNT(m.id) AS member_count
         FROM store_roles r
         LEFT JOIN store_members m ON m.role_id = r.id
         WHERE r.store_id = ?
         GROUP BY r.id
         ORDER BY r.tier_level, r.id'
    );
    $stmt->execute([$store['id']]);
    $costRoleId = (int) $store['cost_role_id'];
    $roles = array_map(function ($r) use ($costRoleId) {
        return [
            'id' => (int) $r['id'],
            'name' => $r['name'],
            'tier_level' => (int) $r['tier_level'],
            'is_default' => (bool) $r['is_default'],
            'is_cost' => (int) $r['id'] === $costRoleId,
            'member_count' => (int) $r['member_count'],
        ];
    }, $stmt->fetchAll());
    respond(['success' => true, 'roles' => $roles]);
}

/** Marks the role whose price is what the seller pays (their cost), e.g. DD. */
function set_cost_role($conn) {
    [, $store] = require_seller_store($conn);
    $role = owned_role($conn, $store['id'], input('role_id'));
    $conn->prepare('UPDATE stores SET cost_role_id = ? WHERE id = ?')->execute([$role['id'], $store['id']]);
    respond(['success' => true]);
}

function validated_role_name() {
    $name = input('name');
    if ($name === '' || mb_strlen($name) > 60) {
        fail('Role name must be 1-60 characters.');
    }
    return $name;
}

function role_name_taken($conn, $storeId, $name, $exceptId = 0) {
    $stmt = $conn->prepare('SELECT 1 FROM store_roles WHERE store_id = ? AND LOWER(name) = LOWER(?) AND id <> ?');
    $stmt->execute([$storeId, $name, $exceptId]);
    return (bool) $stmt->fetch();
}

/** Loads a role and makes sure it belongs to this seller's store. */
function owned_role($conn, $storeId, $roleId) {
    $stmt = $conn->prepare('SELECT * FROM store_roles WHERE id = ? AND store_id = ?');
    $stmt->execute([(int) $roleId, $storeId]);
    $role = $stmt->fetch();
    if (!$role) {
        fail('Role not found.', 404);
    }
    return $role;
}

function create_role($conn) {
    [, $store] = require_seller_store($conn);
    $name = validated_role_name();
    if (role_name_taken($conn, $store['id'], $name)) {
        fail('You already have a role with that name.');
    }
    // New tiers go last (closest to retail); the seller can move them.
    $stmt = $conn->prepare(
        'INSERT INTO store_roles (store_id, name, sort_order, tier_level)
         SELECT ?, ?, COALESCE(MAX(sort_order), 0) + 1, COALESCE(MAX(tier_level), 0) + 1 FROM store_roles WHERE store_id = ?
         RETURNING id'
    );
    $stmt->execute([$store['id'], $name, $store['id']]);
    respond(['success' => true, 'role_id' => (int) $stmt->fetchColumn()]);
}

/** Moves a tier one step up (better price, direction=up) or down (toward retail). */
function move_role($conn) {
    [, $store] = require_seller_store($conn);
    $role = owned_role($conn, $store['id'], input('role_id'));
    $up = input('direction') === 'up';

    $conn->beginTransaction();
    // Renumber 1..n first so swapping always works, even after deletes.
    $conn->prepare(
        'UPDATE store_roles r SET tier_level = t.n FROM (
            SELECT id, ROW_NUMBER() OVER (ORDER BY tier_level, id) AS n FROM store_roles WHERE store_id = ?
         ) t WHERE t.id = r.id'
    )->execute([$store['id']]);
    $stmt = $conn->prepare('SELECT id, tier_level FROM store_roles WHERE store_id = ? ORDER BY tier_level');
    $stmt->execute([$store['id']]);
    $order = $stmt->fetchAll();
    $index = array_search((int) $role['id'], array_map(fn ($r) => (int) $r['id'], $order), true);
    $other = $order[$up ? $index - 1 : $index + 1] ?? null;
    if ($other) {
        $swap = $conn->prepare('UPDATE store_roles SET tier_level = ? WHERE id = ?');
        $swap->execute([$other['tier_level'], $role['id']]);
        $swap->execute([$order[$index]['tier_level'], $other['id']]);
    }
    $conn->commit();
    respond(['success' => true]);
}

function rename_role($conn) {
    [, $store] = require_seller_store($conn);
    $role = owned_role($conn, $store['id'], input('role_id'));
    $name = validated_role_name();
    if (role_name_taken($conn, $store['id'], $name, $role['id'])) {
        fail('You already have a role with that name.');
    }
    $stmt = $conn->prepare('UPDATE store_roles SET name = ?, updated_at = NOW() WHERE id = ?');
    $stmt->execute([$name, $role['id']]);
    respond(['success' => true]);
}

function set_default_role($conn) {
    [, $store] = require_seller_store($conn);
    $role = owned_role($conn, $store['id'], input('role_id'));
    $conn->beginTransaction();
    $conn->prepare('UPDATE store_roles SET is_default = FALSE WHERE store_id = ?')->execute([$store['id']]);
    $conn->prepare('UPDATE store_roles SET is_default = TRUE WHERE id = ?')->execute([$role['id']]);
    $conn->commit();
    respond(['success' => true]);
}

function delete_role($conn) {
    [, $store] = require_seller_store($conn);
    $role = owned_role($conn, $store['id'], input('role_id'));
    if ($role['is_default']) {
        fail('This is your default role. Make another role the default before deleting it.');
    }
    $conn->beginTransaction();
    // Members in the deleted role move to the default role.
    $stmt = $conn->prepare('UPDATE store_members SET role_id = ?, updated_at = NOW() WHERE role_id = ?');
    $stmt->execute([default_role_id($conn, $store['id']), $role['id']]);
    $conn->prepare('DELETE FROM store_roles WHERE id = ?')->execute([$role['id']]);
    $conn->commit();
    respond(['success' => true]);
}

/** One page of customers. Inputs: page, per_page, q, role_id. */
function list_members($conn) {
    [, $store] = require_seller_store($conn);
    [$page, $perPage] = page_params(50, 200);
    $where = 'm.store_id = ?';
    $params = [$store['id']];
    if ((int) input('role_id')) {
        $where .= ' AND m.role_id = ?';
        $params[] = (int) input('role_id');
    }
    [$searchSql, $searchParams] = search_sql(input('q'), ['u.name', 'u.username', 'u.email']);
    $where .= $searchSql;
    $params = array_merge($params, $searchParams);
    $from = 'FROM store_members m JOIN users u ON u.id = m.user_id LEFT JOIN store_roles r ON r.id = m.role_id';

    $count = $conn->prepare("SELECT COUNT(*) $from WHERE $where");
    $count->execute($params);
    $stmt = $conn->prepare(
        "SELECT m.id, u.name, u.username, u.email, m.role_id, r.name AS role, m.created_at AS joined_at,
                (SELECT COUNT(*) FROM invoices i WHERE i.store_id = m.store_id AND i.customer_user_id = m.user_id AND i.status = 'confirmed') AS orders,
                (SELECT COALESCE(SUM(total), 0) FROM invoices i WHERE i.store_id = m.store_id AND i.customer_user_id = m.user_id AND i.status = 'confirmed') AS spent
         $from WHERE $where
         ORDER BY m.created_at DESC
         LIMIT ? OFFSET ?"
    );
    $stmt->execute(array_merge($params, [$perPage, ($page - 1) * $perPage]));
    $members = array_map(function ($m) {
        $m['id'] = (int) $m['id'];
        $m['role_id'] = $m['role_id'] === null ? null : (int) $m['role_id'];
        $m['orders'] = (int) $m['orders'];
        return $m;
    }, $stmt->fetchAll());
    respond(['success' => true, 'members' => $members, 'total' => (int) $count->fetchColumn(), 'page' => $page, 'per_page' => $perPage]);
}

function set_member_role($conn) {
    [, $store] = require_seller_store($conn);
    $role = owned_role($conn, $store['id'], input('role_id'));
    $stmt = $conn->prepare('UPDATE store_members SET role_id = ?, updated_at = NOW() WHERE id = ? AND store_id = ?');
    $stmt->execute([$role['id'], (int) input('member_id'), $store['id']]);
    if ($stmt->rowCount() === 0) {
        fail('Customer not found in your store.', 404);
    }
    respond(['success' => true]);
}

function remove_member($conn) {
    [, $store] = require_seller_store($conn);
    $stmt = $conn->prepare('DELETE FROM store_members WHERE id = ? AND store_id = ?');
    $stmt->execute([(int) input('member_id'), $store['id']]);
    if ($stmt->rowCount() === 0) {
        fail('Customer not found in your store.', 404);
    }
    respond(['success' => true]);
}
