'use client';

import { useParams } from 'next/navigation';
import StoreView from '../../components/StoreView';

/** A seller's own page: /store/{slug}. This is the link sellers share. */
export default function StorePage() {
  const { slug } = useParams();
  return <StoreView slug={slug} />;
}
