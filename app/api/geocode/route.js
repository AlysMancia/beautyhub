import { NextResponse } from 'next/server';

/**
 * Finds the rough map position of a Philippine address (barangay/city) so the
 * location picker can centre its map. Uses OpenStreetMap Nominatim, which asks
 * for at most 1 request per second and an identifying User-Agent; results are
 * cached for a week. Only returns { lat, lng } or null.
 */
const lastCall = { at: 0 };

export async function GET(request) {
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 200);
  if (q.length < 3) return NextResponse.json(null);

  // Simple 1 request/second spacing for this server process.
  const wait = lastCall.at + 1000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall.at = Date.now();

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ph&q=${encodeURIComponent(q)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'BeautyHub-store-locator/1.0', Accept: 'application/json' },
      next: { revalidate: 604800 },
    });
    if (!response.ok) return NextResponse.json(null);
    const [hit] = await response.json();
    if (!hit) return NextResponse.json(null);
    return NextResponse.json(
      { lat: Number(hit.lat), lng: Number(hit.lon) },
      { headers: { 'Cache-Control': 'public, max-age=604800' } }
    );
  } catch {
    return NextResponse.json(null);
  }
}
