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

export default function SignupPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setBusy(true);

    if (!firstName.trim() || !lastName.trim() || !username.trim() || !email.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      setBusy(false);
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email.trim())) {
      setError('Please enter a valid email address.');
      setBusy(false);
      return;
    }

    if (password.trim().length < 6) {
      setError('Password must be at least 6 characters.');
      setBusy(false);
      return;
    }

    const result = await postForm({
      FunctionName: 'create_user',
      Firstname: firstName.trim(),
      Lastname: lastName.trim(),
      username: username.trim().toLowerCase(),
      email: email.trim().toLowerCase(),
      password: password.trim(),
    });

    if (!result || result.success !== true) {
      setError(result?.message || 'Signup failed. Please try again.');
      setBusy(false);
      return;
    }

    setSuccess('Account created successfully. Redirecting to login...');
    setTimeout(() => router.push('/login'), 1400);
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
              <Link href="/login" className="btn login_btn" style={{ textDecoration: 'none' }}>
                Login
              </Link>
            </div>
          </div>
        </nav>
      </header>

      <main className="auth_page auth_page_signup">
        <section className="auth_card auth_card_large">
          <p className="auth_eyebrow">Create Account</p>
          <div className="auth_header">
            <h1>Join InVoice today</h1>
            <p className="auth_subtitle">Build your beauty business dashboard in minutes.</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="auth_form_row">
              <div className="auth_form_group">
                <label className="auth_label" htmlFor="signupFirstName">
                  First name
                </label>
                <input
                  id="signupFirstName"
                  className="form-control auth_input"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jane"
                />
              </div>

              <div className="auth_form_group">
                <label className="auth_label" htmlFor="signupLastName">
                  Last name
                </label>
                <input
                  id="signupLastName"
                  className="form-control auth_input"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                />
              </div>
            </div>

            <div className="auth_form_group">
              <label className="auth_label" htmlFor="signupUsername">
                Username
              </label>
              <input
                id="signupUsername"
                className="form-control auth_input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="janedoe"
              />
            </div>

            <div className="auth_form_group">
              <label className="auth_label" htmlFor="signupEmail">
                Email
              </label>
              <input
                id="signupEmail"
                className="form-control auth_input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
              />
            </div>

            <div className="auth_form_group">
              <label className="auth_label" htmlFor="signupPassword">
                Password
              </label>
              <input
                id="signupPassword"
                className="form-control auth_input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
            </div>

            {error && <p className="auth_error">{error}</p>}
            {success && <p className="auth_success">{success}</p>}

            <button className="btn btn-primary auth_submit" type="submit" disabled={busy}>
              {busy ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <div className="auth_divider">
            <p className="auth_switch">
              Already have an account?{' '}
              <Link href="/login" className="auth_link">
                Sign in
              </Link>
            </p>
          </div>
        </section>
      </main>
    </>
  );
}

