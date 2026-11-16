'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import SiteHeader from '../components/SiteHeader';
import { api, storeHref } from '../lib/api';

const slugPreview = (name) =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'your-store';

function Field({ id, label, children }) {
  return (
    <div className="auth_form_group">
      <label className="auth_label" htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const storeSlug = params.get('store') || ''; // came from a seller's link
  const [accountType, setAccountType] = useState(
    storeSlug ? 'customer' : params.get('type') === 'seller' ? 'seller' : 'customer'
  );
  const [joiningStore, setJoiningStore] = useState(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', username: '', email: '', password: '', storeName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!storeSlug) return;
    api('get_store', { slug: storeSlug }).then((data) => {
      if (data.success) setJoiningStore(data.store);
      else setError('That store link is not valid. You can still create a customer account.');
    });
  }, [storeSlug]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const isSeller = accountType === 'seller';

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const { firstName, lastName, username, email, password, storeName } = form;
    if (!firstName.trim() || !lastName.trim() || !username.trim() || !email.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    if (isSeller && !storeName.trim()) {
      setError('Please enter your store name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.trim().length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setBusy(true);
    const result = await api('create_user', {
      account_type: accountType,
      Firstname: firstName.trim(),
      Lastname: lastName.trim(),
      username: username.trim().toLowerCase(),
      email: email.trim().toLowerCase(),
      password: password.trim(),
      ...(isSeller ? { store_name: storeName.trim() } : {}),
      ...(!isSeller && joiningStore ? { store_slug: storeSlug } : {}),
    });

    if (!result.success) {
      setError(result.message || 'Signup failed. Please try again.');
      setBusy(false);
      return;
    }

    // The new account is already logged in.
    if (result.account_type === 'seller') router.push('/dashboard');
    else router.push(result.store_slug ? storeHref(result.store_slug) : '/account');
  };

  const loginHref = storeSlug ? `/login?store=${encodeURIComponent(storeSlug)}` : '/login';

  return (
    <>
      <SiteHeader>
        <Link href={loginHref} className="btn login_btn">Login</Link>
      </SiteHeader>

      <main className="auth_page auth_page_signup">
        <section className="auth_card auth_card_large">
          <p className="auth_eyebrow">Create Account</p>
          <div className="auth_header">
            <h1>{joiningStore ? `Join ${joiningStore.name}` : 'Join InVoice today'}</h1>
            <p className="auth_subtitle">
              {isSeller ? 'Get your own store link in minutes.' : 'Shop from the sellers you buy from.'}
            </p>
          </div>

          {joiningStore ? (
            <p className="joining_banner">
              You&apos;re signing up as a customer of <strong>{joiningStore.name}</strong>.
            </p>
          ) : (
            <div className="type_picker" role="radiogroup" aria-label="Account type">
              {[
                ['seller', 'fa-store', 'Seller', 'I sell products'],
                ['customer', 'fa-bag-shopping', 'Customer', 'I buy from sellers'],
              ].map(([value, icon, title, hint]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={accountType === value}
                  className={`type_option${accountType === value ? ' selected' : ''}`}
                  onClick={() => setAccountType(value)}
                >
                  <strong><i className={`fa-solid ${icon}`} />{title}</strong>
                  <span>{hint}</span>
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {isSeller && (
              <Field id="signupStore" label="Store name">
                <input
                  id="signupStore"
                  className="form-control auth_input"
                  value={form.storeName}
                  onChange={set('storeName')}
                  placeholder="Glow Beauty Supply"
                />
                <p className="link_preview">
                  Your store link: <code>/store/{slugPreview(form.storeName)}</code>
                </p>
              </Field>
            )}

            <div className="auth_form_row">
              <Field id="signupFirstName" label="First name">
                <input id="signupFirstName" className="form-control auth_input" value={form.firstName} onChange={set('firstName')} placeholder="Jane" />
              </Field>
              <Field id="signupLastName" label="Last name">
                <input id="signupLastName" className="form-control auth_input" value={form.lastName} onChange={set('lastName')} placeholder="Doe" />
              </Field>
            </div>

            <Field id="signupUsername" label="Username">
              <input id="signupUsername" className="form-control auth_input" autoComplete="username" value={form.username} onChange={set('username')} placeholder="janedoe" />
            </Field>

            <Field id="signupEmail" label="Email">
              <input id="signupEmail" className="form-control auth_input" type="email" autoComplete="email" value={form.email} onChange={set('email')} placeholder="jane@example.com" />
            </Field>

            <Field id="signupPassword" label="Password">
              <input id="signupPassword" className="form-control auth_input" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} placeholder="At least 6 characters" />
            </Field>

            {error && <p className="auth_error">{error}</p>}

            <button className="btn btn-primary auth_submit" type="submit" disabled={busy}>
              {busy ? 'Creating account...' : isSeller ? 'Create my store' : 'Create Account'}
            </button>
          </form>

          <div className="auth_divider">
            <p className="auth_switch">
              Already have an account? <Link href={loginHref} className="auth_link">Sign in</Link>
            </p>
          </div>
        </section>
      </main>
    </>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
