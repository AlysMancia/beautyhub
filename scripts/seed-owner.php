<?php
/**
 * Creates (or updates) the default seller account + store from the OWNER_* values in .env.
 * Runs inside the PHP container via seed-owner.bat. Safe to run on every start:
 *   - creates the user and store if they don't exist
 *   - keeps the password in sync with OWNER_PASSWORD
 *   - never touches anything else (store name/description edits in the dashboard are kept)
 * It is piped in on stdin, so it is never reachable from the web.
 */
if (PHP_SAPI !== 'cli') {
    exit(1);
}

$env = function ($key, $default = '') {
    $value = getenv($key);
    return $value === false ? $default : trim($value);
};

$name      = $env('OWNER_NAME');
$username  = strtolower($env('OWNER_USERNAME'));
$email     = strtolower($env('OWNER_EMAIL'));
$password  = $env('OWNER_PASSWORD');
$storeName = $env('OWNER_STORE_NAME');
$storeSlug = strtolower($env('OWNER_STORE_SLUG'));

if ($email === '') {
    echo "[skip] OWNER_EMAIL is not set in .env - no default seller created.\n";
    exit(0);
}
foreach (compact('name', 'username', 'password', 'storeName', 'storeSlug') as $key => $value) {
    if ($value === '') {
        fwrite(STDERR, "[ERROR] OWNER_* setting '$key' is empty in .env\n");
        exit(1);
    }
}
if (!preg_match('/^[a-z0-9-]{1,60}$/', $storeSlug)) {
    fwrite(STDERR, "[ERROR] OWNER_STORE_SLUG may only contain a-z, 0-9 and -\n");
    exit(1);
}

// Always the Docker-internal address: DB_PORT in .env is the port published on your PC.
$pdo = new PDO(
    sprintf('pgsql:host=postgres;port=5432;dbname=%s', $env('DB_NAME', 'beautyhub')),
    $env('DB_USER', 'beautyhub'),
    $env('DB_PASSWORD', 'beautyhub'),
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

$pdo->beginTransaction();

// ---- user ----
$stmt = $pdo->prepare('SELECT id, password, account_type FROM users WHERE LOWER(email) = ?');
$stmt->execute([$email]);
$user = $stmt->fetch();

if (!$user) {
    $taken = $pdo->prepare('SELECT 1 FROM users WHERE LOWER(username) = ?');
    $taken->execute([$username]);
    if ($taken->fetch()) {
        fwrite(STDERR, "[ERROR] Username '$username' is already used by another account. Change OWNER_USERNAME.\n");
        exit(1);
    }
    $stmt = $pdo->prepare(
        "INSERT INTO users (name, username, email, password, account_type) VALUES (?, ?, ?, ?, 'seller') RETURNING id"
    );
    $stmt->execute([$name, $username, $email, password_hash($password, PASSWORD_DEFAULT)]);
    $userId = (int) $stmt->fetchColumn();
    echo "[OK] Created seller account $email\n";
} else {
    $userId = (int) $user['id'];
    if ($user['account_type'] !== 'seller') {
        fwrite(STDERR, "[ERROR] $email already exists as a customer account.\n");
        exit(1);
    }
    // Only apply OWNER_PASSWORD when it changed in .env since the last run, so a
    // password changed on the profile page isn't overwritten on every start.
    $marker = $pdo->query("SELECT value FROM app_settings WHERE key = 'owner_env_password'")->fetchColumn();
    $envChanged = $marker === false || !password_verify($password, $marker);
    if ($envChanged && !password_verify($password, $user['password'])) {
        $pdo->prepare('UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?')
            ->execute([password_hash($password, PASSWORD_DEFAULT), $userId]);
        echo "[OK] Updated password for $email from .env\n";
    }
}

if (!isset($marker) || $marker === false || !password_verify($password, $marker)) {
    $pdo->prepare(
        "INSERT INTO app_settings (key, value) VALUES ('owner_env_password', ?)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()"
    )->execute([password_hash($password, PASSWORD_DEFAULT)]);
}

// ---- store ----
$stmt = $pdo->prepare('SELECT id, owner_id FROM stores WHERE owner_id = ? OR slug = ?');
$stmt->execute([$userId, $storeSlug]);
$stores = $stmt->fetchAll();

foreach ($stores as $s) {
    if ((int) $s['owner_id'] !== $userId) {
        fwrite(STDERR, "[ERROR] Store link '$storeSlug' already belongs to another seller.\n");
        exit(1);
    }
}

if ($stores) {
    $storeId = (int) $stores[0]['id'];
} else {
    $stmt = $pdo->prepare('INSERT INTO stores (owner_id, slug, name) VALUES (?, ?, ?) RETURNING id');
    $stmt->execute([$userId, $storeSlug, $storeName]);
    $storeId = (int) $stmt->fetchColumn();
    echo "[OK] Created store '$storeName' at /store/$storeSlug\n";
}

// ---- default roles, categories and units (seeder in database/postgres/003_*.sql; runs once per store) ----
$pdo->prepare('SELECT seed_store_defaults(?)')->execute([$storeId]);

$pdo->commit();
echo "[OK] Default seller is ready.\n";
