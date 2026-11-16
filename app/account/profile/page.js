'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProfileForm from '../../components/ProfileForm';
import SiteHeader from '../../components/SiteHeader';
import { useSession } from '../../lib/api';

/** Customer profile page. Sellers use /dashboard/profile. */
export default function CustomerProfilePage() {
  const router = useRouter();
  const { loading, user, reload } = useSession();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (user.account_type === 'seller') router.replace('/dashboard/profile');
  }, [loading, user, router]);

  if (loading || !user || user.account_type !== 'customer') {
    return <div className="center_note">Loading…</div>;
  }

  return (
    <main>
      <SiteHeader>
        <Link href="/account" className="btn login_btn">My stores</Link>
      </SiteHeader>
      <div className="page_wrap">
        <h1>My Profile</h1>
        <ProfileForm
          user={user}
          onSaved={reload}
          cardClass="profile-card"
          inputClass="form-control auth_input"
          buttonClass="btn btn-primary"
        />
      </div>
    </main>
  );
}
