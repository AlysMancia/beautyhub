'use client';

import { PAYMENT_KINDS } from '../lib/invoice';

/** A photo (opens full size) or a PDF link. */
export function Attachment({ file, size = 'md' }) {
  if (file.mime === 'application/pdf') {
    return (
      <a href={file.path} target="_blank" rel="noreferrer" className={`att att-pdf ${size}`} title={file.name || 'PDF'}>
        <i className="fa-regular fa-file-pdf" />
        <span>{file.name || 'PDF'}</span>
      </a>
    );
  }
  return (
    <a href={file.path} target="_blank" rel="noreferrer" className={`att att-img ${size}`} title={file.name || 'Open full size'}>
      <img src={file.thumb_path || file.path} alt={file.name || ''} />
    </a>
  );
}

/**
 * A store's payment methods for customers: account details, instructions and
 * attachments (QR codes etc.). `compact` = smaller, for printed invoices.
 */
export default function HowToPay({ methods, title = 'How to pay', compact = false }) {
  if (!methods?.length) return null;
  return (
    <section className={`how-to-pay${compact ? ' compact' : ''}`}>
      <h3>{title}</h3>
      <div className="htp-list">
        {methods.map((m) => (
          <div key={m.id} className="htp-item">
            <div className="htp-head">
              <i className={`fa-solid ${PAYMENT_KINDS[m.kind]?.icon ?? 'fa-wallet'}`} />
              <strong>{m.name}</strong>
            </div>
            {(m.account_name || m.account_number) && (
              <div className="htp-account">
                {m.account_name && <span>{m.account_name}</span>}
                {m.account_number && <span className="htp-number">{m.account_number}</span>}
              </div>
            )}
            {m.instructions && <p className="htp-note">{m.instructions}</p>}
            {m.files?.length > 0 && (
              <div className="htp-files">
                {m.files.map((f) => <Attachment key={f.id} file={f} />)}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
