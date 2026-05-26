'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_URL = '/api/php/main';

const postForm = async (data) => {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(data),
    credentials: 'include',
  });

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

export default function LoginPage() {
  const router = useRouter();
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);

    if (!usernameOrEmail.trim() || !password.trim()) {
      setError('Please fill in both fields.');
      setBusy(false);
      return;
    }

    const result = await postForm({
      FunctionName: 'login_user',
      username: usernameOrEmail.trim(),
      email: usernameOrEmail.trim(),
      password: password.trim(),
    });

    if (result && result.success === true && Number(result.user_id) > 0) {
      localStorage.setItem('user_id', String(result.user_id));
      router.push('/dashboard');
      return;
    }

    setError(result?.message || 'Incorrect email or password.');
    setBusy(false);
  };

  return (
    <>
      <header className="nav_sticky">
        <nav>
          <div className="container-fluid nav_container">
            <div className="brand_block">
              <div className="brand_logo">
                <img src="/Assets/InVoice.png" alt="InVoice logo" />
                <span className="brand_name">InVoice</span>
              </div>
              <span className="brand_tag">Beauty | Sales | Inventory</span>
            </div>
            <div style={{ flex: 1 }} />
            <div className="users_tab">
              <Link href="/signup" className="btn signup_btn" style={{ textDecoration: 'none' }}>
                Sign Up
              </Link>
            </div>
          </div>
        </nav>
      </header>

      <main className="auth_page auth_page_login">
        <section className="auth_card">
          <p className="auth_eyebrow">Welcome Back</p>
          <div className="auth_header">
            <h1>Sign in to your account</h1>
            <p className="auth_subtitle">Manage your beauty inventory and sales from one place.</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="auth_form_group">
              <label className="auth_label" htmlFor="loginUsername">
                Email or Username
              </label>
              <input
                id="loginUsername"
                className="form-control auth_input"
                type="text"
                value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)}
                placeholder="hello@example.com"
              />
            </div>

            <div className="auth_form_group">
              <label className="auth_label" htmlFor="loginPassword">
                Password
              </label>
              <input
                id="loginPassword"
                className="form-control auth_input"
                type="password"
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
              <Link href="/signup" className="auth_link">
                Create one
              </Link>
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
