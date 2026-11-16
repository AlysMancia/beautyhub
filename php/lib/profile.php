<?php
/** Profile settings for any logged-in user (seller or customer). */
if (!defined('BEAUTYHUB')) {
    exit;
}

function update_profile($conn) {
    $user = require_user($conn);
    $name = input('name');
    $username = strtolower(input('username'));
    $email = strtolower(input('email'));

    if ($name === '' || mb_strlen($name) > 120) {
        fail('Name must be 1-120 characters.');
    }
    if (!preg_match('/^[a-z0-9_.]{3,30}$/', $username)) {
        fail('Username must be 3-30 characters: letters, numbers, _ or .');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        fail('Please enter a valid email address.');
    }

    $check = $conn->prepare(
        'SELECT LOWER(email) = ? AS email_taken FROM users WHERE (LOWER(email) = ? OR LOWER(username) = ?) AND id <> ? LIMIT 1'
    );
    $check->execute([$email, $email, $username, $user['id']]);
    $taken = $check->fetch();
    if ($taken) {
        fail($taken['email_taken'] ? 'That email is used by another account.' : 'That username is taken.');
    }

    $conn->prepare('UPDATE users SET name = ?, username = ?, email = ?, updated_at = NOW() WHERE id = ?')
        ->execute([$name, $username, $email, $user['id']]);
    respond(['success' => true]);
}

function change_password($conn) {
    $user = require_user($conn);
    $current = input('current_password');
    $new = input('new_password');

    $stmt = $conn->prepare('SELECT password FROM users WHERE id = ?');
    $stmt->execute([$user['id']]);
    if (!password_verify($current, (string) $stmt->fetchColumn())) {
        fail('Your current password is not correct.');
    }
    if (strlen($new) < 6) {
        fail('New password must be at least 6 characters.');
    }

    $conn->prepare('UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?')
        ->execute([password_hash($new, PASSWORD_DEFAULT), $user['id']]);
    session_regenerate_id(true);
    respond(['success' => true]);
}
