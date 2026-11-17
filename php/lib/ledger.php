<?php
/**
 * Expenses and other business income (not from invoices), with categories.
 * Summary for a period: sales (confirmed invoices) + other income - expenses.
 */
if (!defined('BEAUTYHUB')) {
    exit;
}

const LEDGER_KINDS = ['expense', 'income'];

/** The store's categories (default ones are added the first time). */
function ledger_categories($conn, $storeId) {
    $conn->prepare('SELECT seed_ledger_categories(?)')->execute([$storeId]);
    $stmt = $conn->prepare(
        'SELECT c.id, c.kind, c.name, COUNT(e.id) AS entry_count
         FROM ledger_categories c LEFT JOIN ledger_entries e ON e.category_id = c.id
         WHERE c.store_id = ? GROUP BY c.id ORDER BY c.kind, c.sort_order, LOWER(c.name)'
    );
    $stmt->execute([$storeId]);
    return array_map(fn ($c) => ['id' => (int) $c['id'], 'kind' => $c['kind'], 'name' => $c['name'], 'entry_count' => (int) $c['entry_count']], $stmt->fetchAll());
}

function list_ledger_categories($conn) {
    [, $store] = require_seller_store($conn);
    respond(['success' => true, 'categories' => ledger_categories($conn, $store['id'])]);
}

/** Inputs: id?, kind, name. */
function save_ledger_category($conn) {
    [, $store] = require_seller_store($conn);
    $id = (int) input('id');
    $name = mb_substr(trim(input('name')), 0, 60);
    if ($name === '') {
        fail('Enter a category name.');
    }
    if ($id) {
        $stmt = $conn->prepare('SELECT kind FROM ledger_categories WHERE id = ? AND store_id = ?');
        $stmt->execute([$id, $store['id']]);
        $kind = $stmt->fetchColumn();
        if (!$kind) {
            fail('Category not found.', 404);
        }
    } else {
        $kind = input('kind');
        if (!in_array($kind, LEDGER_KINDS, true)) {
            fail('Choose expense or income.');
        }
    }
    $dup = $conn->prepare('SELECT 1 FROM ledger_categories WHERE store_id = ? AND kind = ? AND LOWER(name) = LOWER(?) AND id <> ?');
    $dup->execute([$store['id'], $kind, $name, $id]);
    if ($dup->fetchColumn()) {
        fail("You already have an $kind category called “{$name}”.");
    }
    if ($id) {
        $conn->prepare('UPDATE ledger_categories SET name = ?, updated_at = NOW() WHERE id = ?')->execute([$name, $id]);
        // Entries show the new name too.
        $conn->prepare('UPDATE ledger_entries SET category_name = ? WHERE category_id = ?')->execute([$name, $id]);
    } else {
        $conn->prepare(
            'INSERT INTO ledger_categories (store_id, kind, name, sort_order)
             VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM ledger_categories WHERE store_id = ? AND kind = ?))'
        )->execute([$store['id'], $kind, $name, $store['id'], $kind]);
    }
    respond(['success' => true, 'categories' => ledger_categories($conn, $store['id'])]);
}

/** Entries keep the category's name; they just aren't linked to it any more. */
function delete_ledger_category($conn) {
    [, $store] = require_seller_store($conn);
    $stmt = $conn->prepare('DELETE FROM ledger_categories WHERE id = ? AND store_id = ?');
    $stmt->execute([(int) input('id'), $store['id']]);
    if (!$stmt->rowCount()) {
        fail('Category not found.', 404);
    }
    respond(['success' => true, 'categories' => ledger_categories($conn, $store['id'])]);
}

/* ---------------- entries ---------------- */

/** [from, to] dates from the request (YYYY-MM-DD, either may be empty). */
function ledger_range() {
    $out = [];
    foreach (['from', 'to'] as $k) {
        $v = input($k);
        $out[] = preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) && strtotime($v) ? $v : null;
    }
    return $out;
}

/**
 * One page of entries plus the period summary.
 * Inputs: page, per_page, kind, category, q, from, to.
 */
function list_ledger($conn) {
    [, $store] = require_seller_store($conn);
    [$page, $perPage] = page_params(50, 200);
    [$from, $to] = ledger_range();

    $range = '';
    $rangeParams = [];
    if ($from) {
        $range .= ' AND e.entry_date >= ?';
        $rangeParams[] = $from;
    }
    if ($to) {
        $range .= ' AND e.entry_date <= ?';
        $rangeParams[] = $to;
    }

    $where = 'e.store_id = ?' . $range;
    $params = array_merge([$store['id']], $rangeParams);
    if (in_array(input('kind'), LEDGER_KINDS, true)) {
        $where .= ' AND e.kind = ?';
        $params[] = input('kind');
    }
    if ((int) input('category')) {
        $where .= ' AND e.category_id = ?';
        $params[] = (int) input('category');
    }
    [$searchSql, $searchParams] = search_sql(input('q'), ['e.description', 'e.category_name', 'e.reference', 'e.method_name']);
    $where .= $searchSql;
    $params = array_merge($params, $searchParams);

    $count = $conn->prepare("SELECT COUNT(*) FROM ledger_entries e WHERE $where");
    $count->execute($params);
    $stmt = $conn->prepare(
        "SELECT e.id, e.kind, e.category_id, e.category_name, e.amount, e.entry_date, e.description,
                e.payment_method_id, e.method_name, e.reference, e.receipt_path, e.receipt_thumb, e.receipt_mime, e.created_at
         FROM ledger_entries e WHERE $where
         ORDER BY e.entry_date DESC, e.id DESC LIMIT ? OFFSET ?"
    );
    $stmt->execute(array_merge($params, [$perPage, ($page - 1) * $perPage]));
    $entries = array_map(function ($e) {
        $e['id'] = (int) $e['id'];
        $e['category_id'] = $e['category_id'] === null ? null : (int) $e['category_id'];
        $e['payment_method_id'] = $e['payment_method_id'] === null ? null : (int) $e['payment_method_id'];
        return $e;
    }, $stmt->fetchAll());

    // Summary for the period (ignores the kind / category / search filters).
    $sum = $conn->prepare(
        "SELECT COALESCE(SUM(amount) FILTER (WHERE kind = 'income'), 0) AS income,
                COALESCE(SUM(amount) FILTER (WHERE kind = 'expense'), 0) AS expenses
         FROM ledger_entries e WHERE e.store_id = ? $range"
    );
    $sum->execute(array_merge([$store['id']], $rangeParams));
    $totals = $sum->fetch();

    $salesRange = str_replace('e.entry_date', 'i.confirmed_at::date', $range);
    $sales = $conn->prepare(
        "SELECT COALESCE(SUM(i.total), 0) AS sales, COUNT(*) AS invoices,
                COALESCE(SUM((SELECT SUM(ii.qty * ii.unit_cost) FROM invoice_items ii WHERE ii.invoice_id = i.id)), 0) AS cost
         FROM invoices i WHERE i.store_id = ? AND i.status = 'confirmed' $salesRange"
    );
    $sales->execute(array_merge([$store['id']], $rangeParams));
    $s = $sales->fetch();

    $byCat = $conn->prepare(
        "SELECT e.kind, COALESCE(e.category_name, 'No category') AS name, SUM(e.amount) AS total, COUNT(*) AS n
         FROM ledger_entries e WHERE e.store_id = ? $range
         GROUP BY e.kind, COALESCE(e.category_name, 'No category') ORDER BY e.kind, total DESC"
    );
    $byCat->execute(array_merge([$store['id']], $rangeParams));

    $grossProfit = (float) $s['sales'] - (float) $s['cost'];
    respond([
        'success' => true,
        'entries' => $entries,
        'total' => (int) $count->fetchColumn(),
        'page' => $page,
        'per_page' => $perPage,
        'summary' => [
            'sales' => $s['sales'],
            'invoices' => (int) $s['invoices'],
            'gross_profit' => number_format($grossProfit, 2, '.', ''),
            'income' => $totals['income'],
            'expenses' => $totals['expenses'],
            // What's left: profit on sales + other income - expenses.
            'net' => number_format($grossProfit + (float) $totals['income'] - (float) $totals['expenses'], 2, '.', ''),
        ],
        'by_category' => $byCat->fetchAll(),
        'categories' => ledger_categories($conn, $store['id']),
        'payment_methods' => array_map(fn ($m) => ['id' => $m['id'], 'name' => $m['name']], payment_methods($conn, $store['id'])),
    ]);
}

function owned_ledger_entry($conn, $storeId, $id) {
    $stmt = $conn->prepare('SELECT * FROM ledger_entries WHERE id = ? AND store_id = ?');
    $stmt->execute([(int) $id, $storeId]);
    $row = $stmt->fetch();
    if (!$row) {
        fail('Entry not found.', 404);
    }
    return $row;
}

/**
 * Add or edit. Inputs: id?, kind, category_id, amount, entry_date, description,
 * payment_method_id, reference, file? (receipt), remove_receipt=1.
 */
function save_ledger_entry($conn) {
    [$user, $store] = require_seller_store($conn);
    $id = (int) input('id');
    $existing = $id ? owned_ledger_entry($conn, $store['id'], $id) : null;

    $kind = input('kind');
    if (!in_array($kind, LEDGER_KINDS, true)) {
        fail('Choose expense or income.');
    }
    $amount = parse_money(input('amount'), 'Amount');
    if ($amount === null || (float) $amount <= 0) {
        fail('Enter the amount.');
    }
    $date = input('entry_date') ?: date('Y-m-d');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !strtotime($date)) {
        fail('Enter a valid date.');
    }
    $categoryId = (int) input('category_id') ?: null;
    $categoryName = null;
    if ($categoryId) {
        $c = $conn->prepare('SELECT name, kind FROM ledger_categories WHERE id = ? AND store_id = ?');
        $c->execute([$categoryId, $store['id']]);
        $cat = $c->fetch();
        if (!$cat) {
            fail('Category not found.');
        }
        if ($cat['kind'] !== $kind) {
            fail("“{$cat['name']}” is an {$cat['kind']} category.");
        }
        $categoryName = $cat['name'];
    }
    $methodId = (int) input('payment_method_id') ?: null;
    $methodName = $methodId ? owned_payment_method($conn, $store['id'], $methodId)['name'] : null;

    // Receipt: a new upload replaces the old one; remove_receipt clears it.
    $receipt = [$existing['receipt_path'] ?? null, $existing['receipt_thumb'] ?? null, $existing['receipt_mime'] ?? null];
    $file = optional_upload();
    if ($file || input('remove_receipt') === '1') {
        if ($existing) {
            delete_upload($existing['receipt_path']);
            delete_upload($existing['receipt_thumb']);
        }
        $receipt = [null, null, null];
        if ($file) {
            $saved = store_attachment($file, $store['id'], 'receipts');
            $receipt = [$saved['path'], $saved['thumb_path'], $saved['mime']];
        }
    }

    $values = [
        $kind, $categoryId, $categoryName, $amount, $date, input('description') ?: null,
        $methodId, $methodName, mb_substr(input('reference'), 0, 120) ?: null, ...$receipt,
    ];
    if ($existing) {
        $conn->prepare(
            'UPDATE ledger_entries SET kind = ?, category_id = ?, category_name = ?, amount = ?, entry_date = ?, description = ?,
                    payment_method_id = ?, method_name = ?, reference = ?, receipt_path = ?, receipt_thumb = ?, receipt_mime = ?, updated_at = NOW()
             WHERE id = ?'
        )->execute([...$values, $id]);
    } else {
        $conn->prepare(
            'INSERT INTO ledger_entries (kind, category_id, category_name, amount, entry_date, description,
                    payment_method_id, method_name, reference, receipt_path, receipt_thumb, receipt_mime, store_id, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([...$values, $store['id'], $user['id']]);
    }
    respond(['success' => true]);
}

function delete_ledger_entry($conn) {
    [, $store] = require_seller_store($conn);
    $entry = owned_ledger_entry($conn, $store['id'], input('id'));
    delete_upload($entry['receipt_path']);
    delete_upload($entry['receipt_thumb']);
    $conn->prepare('DELETE FROM ledger_entries WHERE id = ?')->execute([$entry['id']]);
    respond(['success' => true]);
}
