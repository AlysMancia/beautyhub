'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { storeHref } from '../lib/api';

/** Shows the seller's shareable store link with a copy button. */
export default function StoreLinkCard({ slug }) {
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => setOrigin(window.location.origin), []);

  const path = storeHref(slug);
  const url = `${origin}${path === '/' ? '' : path}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the link is still visible to copy by hand */
    }
  };

  return (
    <article className="card link-card">
      <div className="link-text">
        <h4>Your store link</h4>
        <code>{url}</code>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          Share it with your customers. Anyone who signs up through it joins your store with your default role.
        </p>
      </div>
      <button type="button" className="dash-btn" onClick={copy}>{copied ? 'Copied!' : 'Copy link'}</button>
      <Link href={path} className="dash-btn ghost" style={{ textDecoration: 'none' }}>Open</Link>
    </article>
  );
}
