'use client';

import AccountCode from '../../../components/AccountCode';
import ProfileForm from '../../../components/ProfileForm';
import { useSeller } from '../../SellerContext';

export default function SellerProfilePage() {
  const { user, reload } = useSeller();
  return (
    <>
      <header className="dash-top">
        <div>
          <h1>My profile</h1>
          <p>Your login details. Your store name is in Settings → Store details.</p>
        </div>
      </header>
      <div style={{ marginTop: 12, maxWidth: 560 }}>
        <AccountCode code={user.code} hint="Your account's unique code." />
      </div>
      <div style={{ marginTop: 12 }}>
        <ProfileForm user={user} onSaved={reload} />
      </div>
    </>
  );
}
