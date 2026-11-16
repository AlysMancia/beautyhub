'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Settings opens on Store details.
export default function Page() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/settings/store');
  }, [router]);
  return null;
}
