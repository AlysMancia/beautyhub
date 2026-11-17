<?php
/**
 * "Remember me": stay logged in for REMEMBER_DAYS even after the browser
 * closes or the PHP session expires.
 *
 * Cookie bh_remember = "<selector>:<validator>". The database keeps the
 * selector and a SHA-256 hash of the validator. Each time the cookie is used
 * it is replaced with a new one (so a stolen, already-used cookie stops working).
 */
if (!defined('BEAUTYHUB')) {
    exit;
}

const REMEMBER_COOKIE = 'bh_remember';
const REMEMBER_DAYS = 30;

function set_remember_cookie($value, $expires) {
    setcookie(REMEMBER_COOKIE, $value, [
        'expires' => $expires,
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => (($_SERVER['HTTPS'] ?? '') === 'on') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'),
    ]);
}

/** Creates a new remember token for $userId and sends the cookie. */
function issue_remember_token($conn, $userId) {
    $selector = bin2hex(random_bytes(12));
    $validator = bin2hex(random_bytes(32));
    $expires = time() + REMEMBER_DAYS * 86400;
    $conn->prepare(
        'INSERT INTO remember_tokens (user_id, selector, validator_hash, expires_at) VALUES (?, ?, ?, ?)'
    )->execute([$userId, $selector, hash('sha256', $validator), date('Y-m-d H:i:s', $expires)]);
    set_remember_cookie("$selector:$validator", $expires);
}

/** Deletes this browser's remember token (and cookie). */
function forget_remember_token($conn) {
    $cookie = $_COOKIE[REMEMBER_COOKIE] ?? '';
    if ($cookie !== '' && str_contains($cookie, ':')) {
        [$selector] = explode(':', $cookie, 2);
        $conn->prepare('DELETE FROM remember_tokens WHERE selector = ?')->execute([$selector]);
    }
    set_remember_cookie('', time() - 3600);
}

/** Signs out every remembered browser of a user (e.g. after a password change). */
function forget_all_remember_tokens($conn, $userId, $keepCurrent = false) {
    $cookie = $_COOKIE[REMEMBER_COOKIE] ?? '';
    $current = $keepCurrent && str_contains($cookie, ':') ? explode(':', $cookie, 2)[0] : '';
    $conn->prepare('DELETE FROM remember_tokens WHERE user_id = ? AND selector <> ?')->execute([$userId, $current]);
}

/**
 * Called on every request: if the session has no user but a valid remember
 * cookie is present, log that user in again and rotate the token.
 */
function restore_remembered_login($conn) {
    if (!empty($_SESSION['user_id'])) {
        return;
    }
    $cookie = $_COOKIE[REMEMBER_COOKIE] ?? '';
    if (!preg_match('/^([a-f0-9]{24}):([a-f0-9]{64})$/', $cookie, $m)) {
        return;
    }
    [, $selector, $validator] = $m;

    $stmt = $conn->prepare('SELECT id, user_id, validator_hash, expires_at FROM remember_tokens WHERE selector = ?');
    $stmt->execute([$selector]);
    $token = $stmt->fetch();

    if (!$token || strtotime($token['expires_at']) < time() || !hash_equals($token['validator_hash'], hash('sha256', $validator))) {
        if ($token) {
            // Wrong validator for a real selector: someone may have copied the cookie. Drop it.
            $conn->prepare('DELETE FROM remember_tokens WHERE id = ?')->execute([$token['id']]);
        }
        set_remember_cookie('', time() - 3600);
        return;
    }

    // Valid: log in, and swap the token for a fresh one.
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int) $token['user_id'];
    $conn->prepare('DELETE FROM remember_tokens WHERE id = ?')->execute([$token['id']]);
    issue_remember_token($conn, (int) $token['user_id']);
}
