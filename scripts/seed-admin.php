<?php
/**
 * Creates (or updates) the default admin account from the ADMIN_* values in .env.
 * Runs inside the PHP container via seed-owner.bat (setup.bat / start.bat).
 *   - creates the admin if it doesn't exist
 *   - applies ADMIN_PASSWORD only when it changed in .env (a password changed
 *     in the app is kept otherwise)
 * It is piped in on stdin, so it is never reachable from the web.
 */
if (PHP_SAPI !== 'cli') {
    exit(1);
}

$env = function ($key, $default = '') {
    $value = getenv($key);
    return $value === false ? $default : trim($value);
};

$name     = $env('ADMIN_NAME', 'Site Admin');
$username = strtolower($env('ADMIN_USERNAME'));
$email    = strtolower($env('ADMIN_EMAIL'));
$password = $env('ADMIN_PASSWORD');

if ($username === '' || $password === '') {
    echo "[skip] ADMIN_USERNAME / ADMIN_PASSWORD not set in .env - no admin account created.\n";
    exit(0);
}
if (!preg_match('/^[a-z0-9_.]{3,30}$/', $username)) {
    fwrite(STDERR, "[ERROR] ADMIN_USERNAME must be 3-30 characters: letters, numbers, _ or .\n");
    exit(1);
}
if ($email === '') {
    $email = $username . '@admin.local';
}
if (strlen($password) < 6) {
    fwrite(STDERR, "[ERROR] ADMIN_PASSWORD must be at least 6 characters.\n");
    exit(1);
}

$pdo = new PDO(
    sprintf('pgsql:host=postgres;port=5432;dbname=%s', $env('DB_NAME', 'beautyhub')),
    $env('DB_USER', 'beautyhub'),
    $env('DB_PASSWORD', 'beautyhub'),
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

$stmt = $pdo->prepare('SELECT id, password, account_type FROM users WHERE LOWER(username) = ?');
$stmt->execute([$username]);
$user = $stmt->fetch();

$marker = $pdo->query("SELECT value FROM app_settings WHERE key = 'admin_env_password'")->fetchColumn();
$envChanged = $marker === false || !password_verify($password, $marker);

if (!$user) {
    $taken = $pdo->prepare('SELECT 1 FROM users WHERE LOWER(email) = ?');
    $taken->execute([$email]);
    if ($taken->fetch()) {
        fwrite(STDERR, "[ERROR] Another account already uses $email. Change ADMIN_EMAIL.\n");
        exit(1);
    }
    $pdo->prepare("INSERT INTO users (name, username, email, password, account_type) VALUES (?, ?, ?, ?, 'admin')")
        ->execute([$name, $username, $email, password_hash($password, PASSWORD_DEFAULT)]);
    echo "[OK] Created admin account '$username'\n";
} else {
    if ($user['account_type'] !== 'admin') {
        fwrite(STDERR, "[ERROR] Username '$username' belongs to a {$user['account_type']} account. Change ADMIN_USERNAME.\n");
        exit(1);
    }
    if ($envChanged && !password_verify($password, $user['password'])) {
        $pdo->prepare('UPDATE users SET password = ?, is_active = TRUE, updated_at = NOW() WHERE id = ?')
            ->execute([password_hash($password, PASSWORD_DEFAULT), $user['id']]);
        echo "[OK] Updated admin password from .env\n";
    }
}

if ($envChanged) {
    $pdo->prepare(
        "INSERT INTO app_settings (key, value) VALUES ('admin_env_password', ?)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()"
    )->execute([password_hash($password, PASSWORD_DEFAULT)]);
}
echo "[OK] Admin account is ready.\n";
