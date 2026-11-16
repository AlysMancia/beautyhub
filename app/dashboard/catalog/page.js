'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Old address: Catalog Setup is now Settings → Brands / Categories / Units.
export default function Page() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/settings/brands');
  }, [router]);
  return null;
}
