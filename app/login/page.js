'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import SiteHeader from '../components/SiteHeader';
import { api, homeFor, storeHref } from '../lib/api';

function LoginForm() {
  const router = useRouter();
  const storeSlug = useSearchParams().get('store') || '';
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const signupHref = storeSlug ? `/signup?store=${encodeURIComponent(storeSlug)}` : '/signup';

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!usernameOrEmail.trim() || !password.trim()) {
      setError('Please fill in both fields.');
      return;
    }

    setBusy(true);
    const result = await api('login_user', {
      username: usernameOrEmail.trim(),
      password: password.trim(),
    });

    if (result.success) {
      // Came from a seller's link: go back to that store page.
      router.push(storeSlug ? storeHref(storeSlug) : homeFor(result));
      return;
    }

    setError(result.message || 'Incorrect email or password.');
    setBusy(false);
  };

  return (
    <>
      <SiteHeader>
        <Link href={signupHref} className="btn signup_btn">Sign Up</Link>
      </SiteHeader>

      <main className="auth_page auth_page_login">
        <section className="auth_card">
          <p className="auth_eyebrow">Welcome Back</p>
          <div className="auth_header">
            <h1>Sign in to your account</h1>
            <p className="auth_subtitle">Sellers and customers both sign in here.</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="auth_form_group">
              <label className="auth_label" htmlFor="loginUsername">Email or Username</label>
              <input
                id="loginUsername"
                className="form-control auth_input"
                type="text"
                autoComplete="username"
                value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)}
                placeholder="hello@example.com"
              />
            </div>

            <div className="auth_form_group">
              <label className="auth_label" htmlFor="loginPassword">Password</label>
              <input
                id="loginPassword"
                className="form-control auth_input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
            </div>

            {error && <p className="auth_error">{error}</p>}

            <button className="btn btn-primary auth_submit" type="submit" disabled={busy}>
              {busy ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="auth_divider">
            <p className="auth_switch">
              Don&apos;t have an account?{' '}
              <Link href={signupHref} className="auth_link">Create one</Link>
            </p>
          </div>
        </section>
      </main>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
