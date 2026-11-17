'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SiteHeader from '../components/SiteHeader';
import { homeFor, useSession } from '../lib/api';

/**
 * General entry page (/start). Each seller's own page lives at /store/{slug};
 * this one just asks you to log in or sign up as a seller or customer.
 */
export default function StartPage() {
  const router = useRouter();
  const { loading, user } = useSession();

  useEffect(() => {
    if (user) router.replace(homeFor(user));
  }, [user, router]);

  if (loading || user) {
    return <div className="center_note">Loading…</div>;
  }

  return (
    <main>
      <SiteHeader>
        <Link href="/stores" className="btn login_btn explore_btn"><i className="fa-regular fa-compass" /><span className="explore_label">Explore stores</span></Link>
        <Link href="/login" className="btn login_btn">Login</Link>
        <Link href="/signup" className="btn signup_btn">Sign Up</Link>
      </SiteHeader>

      <section className="hero_cta_section">
        <div className="hero_cta_box container-max">
          <p className="eyebrow">Invoice and inventory tracking</p>
          <h2>Your own beauty store, with invoices and inventory built in.</h2>
          <p className="hero_cta_text">
            Sellers get their own store link to share with resellers, retailers and wholesalers.
            Customers sign in to shop from the sellers they buy from.
          </p>

          <div className="landing_choices">
            <Link href="/signup?type=seller" className="type_option">
              <strong><i className="fa-solid fa-store" />I&apos;m a Seller</strong>
              <span>Create your store and get your own link.</span>
            </Link>
            <Link href="/signup?type=customer" className="type_option">
              <strong><i className="fa-solid fa-bag-shopping" />I&apos;m a Customer</strong>
              <span>Buy from your sellers.</span>
            </Link>
          </div>

          <p className="auth_switch">
            Already have an account? <Link href="/login" className="auth_link">Log in</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
