import { NextResponse } from 'next/server';

/**
 * Cached proxy for the PSGC Cloud API (https://psgc.cloud/api-docs), used by the
 * store location picker. Only the address-picker lookups below are allowed.
 *
 *   /api/psgc/regions
 *   /api/psgc/regions/{code}/provinces
 *   /api/psgc/regions/{code}/cities-municipalities      (NCR has no provinces)
 *   /api/psgc/provinces/{code}/cities-municipalities
 *   /api/psgc/cities-municipalities/{code}/barangays
 *
 * Responses are normalised to [{ code, name, type?, zip_code? }], sorted, and
 * cached for a day (PSGC allows 120 requests/minute).
 */
const PSGC_BASE = 'https://psgc.cloud/api';
const ALLOWED = [
  /^regions$/,
  /^regions\/\d{10}\/provinces$/,
  /^regions\/\d{10}\/cities-municipalities$/,
  /^provinces\/\d{10}\/cities-municipalities$/,
  /^cities-municipalities\/\d{10}\/barangays$/,
];

/** PSGC sends some names double-encoded ("BiÃ±an" instead of "Biñan"). */
function fixEncoding(text) {
  if (typeof text !== 'string' || !/[ÃÂ]/.test(text)) return text;
  const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0));
  if (bytes.some((b, i) => text.charCodeAt(i) > 255)) return text;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return text;
  }
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/**
 * Manila is split into sub-municipalities (Tondo, Sampaloc, ...) that hold the
 * barangays; the "City of Manila" entry itself has none. Replace such a parent
 * city with its districts, named "Tondo I/II, City of Manila".
 */
function mergeSubMunicipalities(items) {
  const subs = items.filter((i) => i.type === 'SubMun');
  if (subs.length === 0) return items;
  const parentOf = (sub) => items.find((i) => i.type !== 'SubMun' && i.code.slice(0, 5) === sub.code.slice(0, 5));
  const parents = new Set();
  const renamed = subs.map((sub) => {
    const parent = parentOf(sub);
    if (!parent) return sub;
    parents.add(parent.code);
    return { ...sub, name: `${sub.name}, ${parent.name}`, zip_code: sub.zip_code || parent.zip_code };
  });
  return [...items.filter((i) => i.type !== 'SubMun' && !parents.has(i.code)), ...renamed];
}

export async function GET(_request, { params }) {
  const path = params.path.join('/');
  if (!ALLOWED.some((re) => re.test(path))) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  let data;
  try {
    const response = await fetch(`${PSGC_BASE}/${path}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 86400 },
    });
    if (!response.ok) throw new Error(`PSGC returned ${response.status}`);
    data = await response.json();
    if (!Array.isArray(data)) throw new Error('Unexpected PSGC response');
  } catch {
    return NextResponse.json({ message: 'The address service is not available right now. Please try again.' }, { status: 502 });
  }

  let items = data.map((item) => ({
    code: String(item.code),
    name: fixEncoding(item.name),
    ...(item.type ? { type: item.type } : {}),
    ...(item.zip_code !== undefined ? { zip_code: String(item.zip_code ?? '').trim() } : {}),
  }));

  if (path.endsWith('cities-municipalities')) items = mergeSubMunicipalities(items);
  items.sort((a, b) => collator.compare(a.name, b.name));

  return NextResponse.json(items, {
    headers: { 'Cache-Control': 'public, max-age=86400' },
  });
}
