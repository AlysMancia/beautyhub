<?php
/**
 * In-app notifications (the bell). Sellers: new customer, new order, payment
 * sent. Customers: order confirmed / rejected, payment checked, items released.
 * Sellers also get them live over the store's WebSocket channel.
 */
if (!defined('BEAUTYHUB')) {
    exit;
}

/** Saves a notification for one account. Never breaks the request it is part of. */
function notify($conn, $userId, $type, $title, $body = null, $link = null) {
    if (!$userId) {
        return;
    }
    try {
        $conn->prepare('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)')
            ->execute([(int) $userId, $type, mb_substr($title, 0, 200), $body, $link]);
    } catch (PDOException $e) {
        // A missing notification is not worth failing an order for.
    }
}

/** Notifies the seller who owns a store, and pings their open dashboards. */
function notify_store_owner($conn, $storeId, $type, $title, $body = null, $link = null) {
    $stmt = $conn->prepare('SELECT owner_id FROM stores WHERE id = ?');
    $stmt->execute([(int) $storeId]);
    notify($conn, $stmt->fetchColumn(), $type, $title, $body, $link);
    broadcast_event($storeId, 'notification', ['type' => $type, 'title' => $title, 'body' => $body, 'link' => $link]);
}

/** Latest notifications + unread count. Inputs: limit (default 30). */
function list_notifications($conn) {
    $user = require_user($conn);
    $limit = min(max((int) input('limit') ?: 30, 1), 100);
    $stmt = $conn->prepare(
        'SELECT id, type, title, body, link, read_at IS NOT NULL AS is_read, created_at
         FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?'
    );
    $stmt->execute([$user['id'], $limit]);
    respond([
        'success' => true,
        'notifications' => array_map(fn ($n) => ['id' => (int) $n['id']] + $n, $stmt->fetchAll()),
        'unread' => unread_count($conn, $user['id']),
    ]);
}

function unread_count($conn, $userId) {
    $stmt = $conn->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL');
    $stmt->execute([$userId]);
    return (int) $stmt->fetchColumn();
}

/** Cheap check for the bell. */
function notification_count($conn) {
    $user = require_user($conn);
    respond(['success' => true, 'unread' => unread_count($conn, $user['id'])]);
}

/** Inputs: ids (JSON list) or all=1. */
function mark_notifications_read($conn) {
    $user = require_user($conn);
    if (input('all') === '1') {
        $conn->prepare('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL')->execute([$user['id']]);
    } else {
        $ids = array_values(array_filter(array_map('intval', json_input('ids'))));
        if ($ids) {
            $in = implode(',', array_fill(0, count($ids), '?'));
            $conn->prepare("UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL AND id IN ($in)")
                ->execute(array_merge([$user['id']], $ids));
        }
    }
    respond(['success' => true, 'unread' => unread_count($conn, $user['id'])]);
}
