import { NextResponse } from 'next/server';

export async function POST(request) {
  const body = await request.text();
  const cookies = request.headers.get('cookie');
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  if (cookies) {
    headers.Cookie = cookies;
  }

  const response = await fetch('http://localhost/beautyhub/php/main.php', {
    method: 'POST',
    headers,
    body,
  });

  const responseText = await response.text();
  const responseHeaders = new Headers();

  response.headers.forEach((value, key) => {
    if (key === 'set-cookie' || key === 'content-type') {
      responseHeaders.set(key, value);
    }
  });

  return new NextResponse(responseText, {
    status: response.status,
    headers: responseHeaders,
  });
}
