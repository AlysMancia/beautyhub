'use client';

import StoreView from './components/StoreView';
import StartPage from './start/page';
import { DEFAULT_STORE_SLUG } from './lib/api';

/**
 * Main page. Shows the default store (NEXT_PUBLIC_DEFAULT_STORE_SLUG in .env);
 * without one it falls back to the general login/signup page, also at /start.
 */
export default function Home() {
  return DEFAULT_STORE_SLUG ? <StoreView slug={DEFAULT_STORE_SLUG} /> : <StartPage />;
}
