<?php
/** Seller store location (PSGC address + map pin). */
if (!defined('BEAUTYHUB')) {
    exit;
}

const LOCATION_COLUMNS = [
    'region_code', 'region_name', 'province_code', 'province_name', 'city_code', 'city_name',
    'barangay_code', 'barangay_name', 'postal_code', 'street_address', 'latitude', 'longitude',
];

/** Location fields of a store row, with coordinates as numbers. */
function store_location($store) {
    $loc = [];
    foreach (LOCATION_COLUMNS as $col) {
        $loc[$col] = $store[$col] ?? null;
    }
    foreach (['latitude', 'longitude'] as $col) {
        $loc[$col] = $loc[$col] === null ? null : (float) $loc[$col];
    }
    return $loc;
}

function update_store_location($conn) {
    [, $store] = require_seller_store($conn);

    $code = function ($key, $label, $required) {
        $value = input($key);
        if ($value === '') {
            if ($required) fail("Please choose your $label.");
            return null;
        }
        if (!preg_match('/^\d{9,10}$/', $value)) fail("Invalid $label.");
        return $value;
    };
    $text = function ($key, $max) {
        $value = input($key);
        return $value === '' ? null : mb_substr($value, 0, $max);
    };

    $values = [
        'region_code' => $code('region_code', 'region', true),
        'region_name' => $text('region_name', 120),
        'province_code' => $code('province_code', 'province', false), // NCR has none
        'province_name' => $text('province_name', 120),
        'city_code' => $code('city_code', 'city / municipality', true),
        'city_name' => $text('city_name', 160),
        'barangay_code' => $code('barangay_code', 'barangay', true),
        'barangay_name' => $text('barangay_name', 120),
        'postal_code' => $text('postal_code', 10),
        'street_address' => $text('street_address', 255),
        'latitude' => null,
        'longitude' => null,
    ];

    if ($values['postal_code'] !== null && !preg_match('/^\d{4}$/', $values['postal_code'])) {
        fail('Postal code must be 4 digits.');
    }

    $lat = input('latitude');
    $lng = input('longitude');
    if ($lat !== '' || $lng !== '') {
        if (!is_numeric($lat) || !is_numeric($lng) || abs((float) $lat) > 90 || abs((float) $lng) > 180) {
            fail('Invalid map location.');
        }
        $values['latitude'] = round((float) $lat, 6);
        $values['longitude'] = round((float) $lng, 6);
    }

    $sets = implode(', ', array_map(fn ($c) => "$c = ?", array_keys($values)));
    $stmt = $conn->prepare("UPDATE stores SET $sets, updated_at = NOW() WHERE id = ?");
    $stmt->execute([...array_values($values), $store['id']]);
    respond(['success' => true]);
}
