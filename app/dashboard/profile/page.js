'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Old address: My Profile is now Settings → My profile.
export default function Page() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/settings/profile');
  }, [router]);
  return null;
}
