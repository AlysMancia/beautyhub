<?php
/**
 * Photos, videos and logos.
 *
 * Files are saved under /var/www/html/uploads/store-{id}/... (a Docker volume)
 * and served as /uploads/... through Next.js. Every upload is checked by its
 * real content (not its name), photos are re-encoded (which also strips any
 * hidden payload), resized and get a small thumbnail.
 */
if (!defined('BEAUTYHUB')) {
    exit;
}

const IMAGE_TYPES = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
const VIDEO_TYPES = ['video/mp4' => 'mp4', 'video/webm' => 'webm', 'video/quicktime' => 'mov'];
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 60 * 1024 * 1024;
const MAX_PRODUCT_PHOTOS = 12;
const MAX_PRODUCT_VIDEOS = 3;

function uploads_root() {
    return dirname(__DIR__, 2) . '/uploads';
}

/** The uploaded file in $_FILES['file'], or fails with a friendly message. */
function uploaded_file() {
    $f = $_FILES['file'] ?? null;
    if (!$f || !is_array($f) || ($f['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        fail('Choose a file to upload.');
    }
    if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE) {
        fail('That file is too big.');
    }
    if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) {
        fail('The upload did not finish. Please try again.');
    }
    $f['mime'] = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']) ?: '';
    return $f;
}

function new_upload_path($storeId, $folder, $ext) {
    $rel = sprintf('store-%d/%s/%s.%s', $storeId, $folder, bin2hex(random_bytes(12)), $ext);
    $abs = uploads_root() . '/' . $rel;
    if (!is_dir(dirname($abs)) && !mkdir(dirname($abs), 0775, true)) {
        fail('Could not save the file on the server.', 500);
    }
    return [$abs, '/uploads/' . $rel];
}

/** Deletes a file we saved earlier (path like /uploads/store-1/...). */
function delete_upload($publicPath) {
    if (!$publicPath || !str_starts_with($publicPath, '/uploads/store-') || str_contains($publicPath, '..')) {
        return;
    }
    $abs = uploads_root() . substr($publicPath, strlen('/uploads'));
    if (is_file($abs)) {
        @unlink($abs);
    }
}

/** Loads an uploaded photo with GD, upright (phone photos store rotation in EXIF). */
function load_image($tmp, $mime) {
    $info = @getimagesize($tmp);
    if (!$info || $info[0] < 1 || $info[1] < 1) {
        fail('That file is not a readable photo.');
    }
    if ($info[0] * $info[1] > 50_000_000) {
        fail('That photo is too large (max 50 megapixels).');
    }
    $img = match ($mime) {
        'image/jpeg' => @imagecreatefromjpeg($tmp),
        'image/png' => @imagecreatefrompng($tmp),
        'image/webp' => @imagecreatefromwebp($tmp),
        default => false,
    };
    if (!$img) {
        fail('That file is not a readable photo.');
    }
    if ($mime === 'image/jpeg' && function_exists('exif_read_data')) {
        $orientation = (int) (@exif_read_data($tmp)['Orientation'] ?? 1);
        $angle = [3 => 180, 6 => -90, 8 => 90][$orientation] ?? 0;
        if ($angle) {
            $img = imagerotate($img, $angle, 0);
        }
    }
    return $img;
}

/** Saves $img scaled to fit $max px as WebP (keeps transparency). Returns [public path, bytes]. */
function save_webp($img, $storeId, $folder, $max) {
    $w = imagesx($img);
    $h = imagesy($img);
    $scale = min(1, $max / max($w, $h));
    $out = $img;
    if ($scale < 1) {
        $out = imagecreatetruecolor(max(1, (int) round($w * $scale)), max(1, (int) round($h * $scale)));
        imagealphablending($out, false);
        imagesavealpha($out, true);
        imagecopyresampled($out, $img, 0, 0, 0, 0, imagesx($out), imagesy($out), $w, $h);
    } else {
        imagepalettetotruecolor($out);
        imagealphablending($out, false);
        imagesavealpha($out, true);
    }
    [$abs, $public] = new_upload_path($storeId, $folder, 'webp');
    if (!imagewebp($out, $abs, 82)) {
        fail('Could not save the photo.', 500);
    }
    if ($out !== $img) {
        imagedestroy($out);
    }
    return [$public, filesize($abs)];
}

/** Validates and stores an uploaded photo: full size (max $max px) + thumbnail. */
function store_photo($file, $storeId, $folder, $max = 1600, $thumb = 480) {
    if (!isset(IMAGE_TYPES[$file['mime']])) {
        fail('Photos must be JPG, PNG or WebP.');
    }
    if ($file['size'] > MAX_IMAGE_BYTES) {
        fail('Photos can be up to 12 MB.');
    }
    $img = load_image($file['tmp_name'], $file['mime']);
    [$path, $bytes] = save_webp($img, $storeId, $folder, $max);
    $thumbPath = $thumb ? save_webp($img, $storeId, $folder, $thumb)[0] : null;
    imagedestroy($img);
    return ['path' => $path, 'thumb_path' => $thumbPath, 'mime' => 'image/webp', 'bytes' => $bytes];
}

function store_video($file, $storeId, $folder) {
    $ext = VIDEO_TYPES[$file['mime']] ?? null;
    if (!$ext) {
        fail('Videos must be MP4, WebM or MOV.');
    }
    if ($file['size'] > MAX_VIDEO_BYTES) {
        fail('Videos can be up to 60 MB.');
    }
    [$abs, $public] = new_upload_path($storeId, $folder, $ext);
    if (!move_uploaded_file($file['tmp_name'], $abs)) {
        fail('Could not save the video.', 500);
    }
    return ['path' => $public, 'thumb_path' => null, 'mime' => $file['mime'], 'bytes' => (int) $file['size']];
}

/* ---------------- product photos & videos ---------------- */

function product_media_rows($conn, $productId) {
    $stmt = $conn->prepare(
        'SELECT id, kind, path, thumb_path, is_cover, bytes FROM product_media WHERE product_id = ?
         ORDER BY is_cover DESC, kind, sort_order, id'
    );
    $stmt->execute([$productId]);
    return array_map(function ($m) {
        $m['id'] = (int) $m['id'];
        $m['bytes'] = (int) $m['bytes'];
        return $m;
    }, $stmt->fetchAll());
}

function owned_product($conn, $storeId, $productId) {
    $stmt = $conn->prepare('SELECT id FROM product_details WHERE id = ? AND store_id = ?');
    $stmt->execute([(int) $productId, $storeId]);
    if (!$stmt->fetch()) {
        fail('Product not found.', 404);
    }
    return (int) $productId;
}

function get_product_media($conn) {
    [, $store] = require_seller_store($conn);
    $productId = owned_product($conn, $store['id'], input('product_id'));
    respond(['success' => true, 'media' => product_media_rows($conn, $productId)]);
}

/** Upload one photo or video (field "file") for a product. The first photo becomes the cover. */
function upload_product_media($conn) {
    [, $store] = require_seller_store($conn);
    $productId = owned_product($conn, $store['id'], input('product_id'));
    $file = uploaded_file();
    if (!isset(IMAGE_TYPES[$file['mime']]) && !isset(VIDEO_TYPES[$file['mime']])) {
        fail('Use a JPG, PNG or WebP photo, or an MP4, WebM or MOV video.');
    }
    $kind = isset(VIDEO_TYPES[$file['mime']]) ? 'video' : 'image';

    $count = $conn->prepare('SELECT COUNT(*) FROM product_media WHERE product_id = ? AND kind = ?');
    $count->execute([$productId, $kind]);
    $limit = $kind === 'video' ? MAX_PRODUCT_VIDEOS : MAX_PRODUCT_PHOTOS;
    if ((int) $count->fetchColumn() >= $limit) {
        fail($kind === 'video' ? "Up to $limit videos per product." : "Up to $limit photos per product.");
    }

    $saved = $kind === 'video'
        ? store_video($file, $store['id'], 'products')
        : store_photo($file, $store['id'], 'products');

    $hasCover = $conn->prepare('SELECT 1 FROM product_media WHERE product_id = ? AND is_cover');
    $hasCover->execute([$productId]);
    $isCover = $kind === 'image' && !$hasCover->fetch();

    $stmt = $conn->prepare(
        'INSERT INTO product_media (store_id, product_id, kind, path, thumb_path, mime, bytes, is_cover, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM product_media WHERE product_id = ?))'
    );
    $stmt->execute([
        $store['id'], $productId, $kind, $saved['path'], $saved['thumb_path'], $saved['mime'], $saved['bytes'],
        $isCover ? 'true' : 'false', $productId,
    ]);
    respond(['success' => true, 'media' => product_media_rows($conn, $productId)]);
}

function set_product_cover($conn) {
    [, $store] = require_seller_store($conn);
    $stmt = $conn->prepare("SELECT product_id FROM product_media WHERE id = ? AND store_id = ? AND kind = 'image'");
    $stmt->execute([(int) input('id'), $store['id']]);
    $productId = $stmt->fetchColumn();
    if ($productId === false) {
        fail('Photo not found.', 404);
    }
    $conn->beginTransaction();
    $conn->prepare('UPDATE product_media SET is_cover = FALSE WHERE product_id = ?')->execute([$productId]);
    $conn->prepare('UPDATE product_media SET is_cover = TRUE WHERE id = ?')->execute([(int) input('id')]);
    $conn->commit();
    respond(['success' => true, 'media' => product_media_rows($conn, (int) $productId)]);
}

function delete_product_media($conn) {
    [, $store] = require_seller_store($conn);
    $stmt = $conn->prepare('SELECT * FROM product_media WHERE id = ? AND store_id = ?');
    $stmt->execute([(int) input('id'), $store['id']]);
    $m = $stmt->fetch();
    if (!$m) {
        fail('File not found.', 404);
    }
    $conn->beginTransaction();
    $conn->prepare('DELETE FROM product_media WHERE id = ?')->execute([$m['id']]);
    if ($m['is_cover']) {
        // Next photo becomes the cover.
        $conn->prepare(
            "UPDATE product_media SET is_cover = TRUE WHERE id = (
                SELECT id FROM product_media WHERE product_id = ? AND kind = 'image' ORDER BY sort_order, id LIMIT 1)"
        )->execute([$m['product_id']]);
    }
    $conn->commit();
    delete_upload($m['path']);
    delete_upload($m['thumb_path']);
    respond(['success' => true, 'media' => product_media_rows($conn, (int) $m['product_id'])]);
}

/** Removes the files of products about to be deleted (rows go with ON DELETE CASCADE). */
function delete_product_files($conn, $storeId, array $productIds) {
    if (!$productIds) {
        return;
    }
    $in = implode(',', array_fill(0, count($productIds), '?'));
    $stmt = $conn->prepare("SELECT path, thumb_path FROM product_media WHERE store_id = ? AND product_id IN ($in)");
    $stmt->execute(array_merge([$storeId], $productIds));
    foreach ($stmt->fetchAll() as $m) {
        delete_upload($m['path']);
        delete_upload($m['thumb_path']);
    }
}

/* ---------------- logos ---------------- */

function upload_brand_logo($conn) {
    [, $store] = require_seller_store($conn);
    $brandId = (int) input('brand_id');
    ensure_owned($conn, 'brands', $store['id'], $brandId, 'Brand');
    $saved = store_photo(uploaded_file(), $store['id'], 'brands', 400, 0);

    $old = $conn->prepare('SELECT logo_path FROM brands WHERE id = ?');
    $old->execute([$brandId]);
    $oldPath = $old->fetchColumn();
    $conn->prepare('UPDATE brands SET logo_path = ?, updated_at = NOW() WHERE id = ?')->execute([$saved['path'], $brandId]);
    delete_upload($oldPath);
    respond(['success' => true, 'logo_path' => $saved['path']]);
}

function delete_brand_logo($conn) {
    [, $store] = require_seller_store($conn);
    $brandId = (int) input('brand_id');
    ensure_owned($conn, 'brands', $store['id'], $brandId, 'Brand');
    $old = $conn->prepare('SELECT logo_path FROM brands WHERE id = ?');
    $old->execute([$brandId]);
    $oldPath = $old->fetchColumn();
    $conn->prepare('UPDATE brands SET logo_path = NULL WHERE id = ?')->execute([$brandId]);
    delete_upload($oldPath);
    respond(['success' => true]);
}

/** The seller's own store logo (shown on the store page, dashboard and invoices). */
function upload_store_logo($conn) {
    [, $store] = require_seller_store($conn);
    $saved = store_photo(uploaded_file(), $store['id'], 'logo', 600, 0);
    $conn->prepare('UPDATE stores SET logo_path = ?, updated_at = NOW() WHERE id = ?')->execute([$saved['path'], $store['id']]);
    delete_upload($store['logo_path']);
    respond(['success' => true, 'logo_path' => $saved['path']]);
}

function delete_store_logo($conn) {
    [, $store] = require_seller_store($conn);
    $conn->prepare('UPDATE stores SET logo_path = NULL WHERE id = ?')->execute([$store['id']]);
    delete_upload($store['logo_path']);
    respond(['success' => true]);
}
