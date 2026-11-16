'use client';

import { useCallback, useEffect, useState } from 'react';

const API_URL = '/api/php/main';

/** Calls a FunctionName on the PHP backend. Always resolves to an object with `success`. */
export async function api(functionName, data = {}) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ FunctionName: functionName, ...data }),
      credentials: 'include',
    });
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { success: false, message: 'Unexpected response from server.' };
    }
  } catch {
    return { success: false, message: 'Cannot reach the server. Is it running?' };
  }
}

/**
 * Uploads one file (field "file") to a FunctionName, with progress (0..1).
 * Resolves to the JSON response.
 */
export function uploadFile(functionName, data, file, onProgress) {
  return new Promise((resolve) => {
    const form = new FormData();
    form.append('FunctionName', functionName);
    Object.entries(data).forEach(([k, v]) => form.append(k, v));
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', API_URL);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        resolve({ success: false, message: xhr.status === 413 ? 'That file is too big.' : 'Upload failed.' });
      }
    };
    xhr.onerror = () => resolve({ success: false, message: 'Upload failed. Check your connection.' });
    xhr.send(form);
  });
}

/** The store shown on the main page (/), from NEXT_PUBLIC_DEFAULT_STORE_SLUG in .env. */
export const DEFAULT_STORE_SLUG = process.env.NEXT_PUBLIC_DEFAULT_STORE_SLUG || '';

/** Link to a store's page. The default store lives at /. */
export function storeHref(slug) {
  return slug && slug === DEFAULT_STORE_SLUG ? '/' : `/store/${slug}`;
}

/** Where a user should land after login/signup. */
export function homeFor(user) {
  if (!user) return '/login';
  return user.account_type === 'seller' ? '/dashboard' : '/account';
}

/**
 * The logged-in user (from the PHP session).
 * Sellers also get `store` (with ws_token); customers get `memberships`.
 */
export function useSession() {
  const [state, setState] = useState({ loading: true, user: null, store: null, memberships: [] });

  const reload = useCallback(async () => {
    const data = await api('me');
    setState({
      loading: false,
      user: data.user ?? null,
      store: data.store ?? null,
      memberships: data.memberships ?? [],
    });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload };
}

export async function logout() {
  await api('logout_user');
  try {
    localStorage.removeItem('user_id');
    localStorage.removeItem('username');
  } catch {
    /* ignore */
  }
}
