import { NextResponse } from 'next/server';

const PHP_BACKEND_URL = process.env.PHP_BACKEND_URL || 'http://localhost:8088/php/main.php';
const MAX_BODY = 70 * 1024 * 1024; // matches PHP post_max_size (videos up to 60 MB)

export async function POST(request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_BODY) {
    return NextResponse.json({ success: false, message: 'That file is too big.' }, { status: 413 });
  }

  // Forward the body as-is so file uploads (multipart/form-data) work too.
  const headers = {
    'Content-Type': request.headers.get('content-type') || 'application/x-www-form-urlencoded',
  };
  const cookies = request.headers.get('cookie');
  if (cookies) headers.Cookie = cookies;

  const response = await fetch(PHP_BACKEND_URL, {
    method: 'POST',
    headers,
    body: await request.arrayBuffer(),
    cache: 'no-store',
  });

  const responseText = await response.text();
  const responseHeaders = new Headers();

  const contentType = response.headers.get('content-type');
  if (contentType) responseHeaders.set('content-type', contentType);

  // PHP can send several Set-Cookie headers (e.g. session id regenerated on login).
  for (const cookie of response.headers.getSetCookie()) {
    responseHeaders.append('set-cookie', cookie);
  }

  return new NextResponse(responseText, {
    status: response.status,
    headers: responseHeaders,
  });
}
