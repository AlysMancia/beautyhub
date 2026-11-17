'use client';

import { useState } from 'react';
import { formatCode } from '../lib/format';

/** Shows an account's code with a copy button, and what it's for. */
export default function AccountCode({ code, hint = 'Give this code to a seller so they can link your account to their customer list.' }) {
  const [copied, setCopied] = useState(false);
  if (!code) return null;
  const pretty = formatCode(code);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pretty);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the code is still on screen */
    }
  };

  return (
    <div className="account_code">
      <div>
        <small>Your account code</small>
        <strong>{pretty}</strong>
        <span>{hint}</span>
      </div>
      <button type="button" onClick={copy} aria-label="Copy account code">
        <i className={copied ? 'fa-solid fa-check' : 'fa-regular fa-copy'} /> {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
