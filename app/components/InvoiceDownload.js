'use client';

import { useState } from 'react';

/**
 * "Download PDF" / "Download image" for an invoice. Renders the element with
 * id `targetId` to a picture (html2canvas) and, for PDF, puts it on A4 pages.
 */
export default function InvoiceDownload({ targetId, fileName, className = 'dash-btn ghost' }) {
  const [busy, setBusy] = useState('');

  const capture = async () => {
    const el = document.getElementById(targetId);
    const html2canvas = (await import('html2canvas')).default;
    el.classList.add('capturing');
    try {
      return await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
    } finally {
      el.classList.remove('capturing');
    }
  };

  const save = (href, name) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const asImage = async () => {
    setBusy('png');
    try {
      const canvas = await capture();
      save(canvas.toDataURL('image/png'), `${fileName}.png`);
    } finally {
      setBusy('');
    }
  };

  const asPdf = async () => {
    setBusy('pdf');
    try {
      const canvas = await capture();
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
      const margin = 10;
      const pageW = pdf.internal.pageSize.getWidth() - margin * 2;
      const pageH = pdf.internal.pageSize.getHeight() - margin * 2;
      const imgH = (canvas.height * pageW) / canvas.width;
      const img = canvas.toDataURL('image/jpeg', 0.92);
      // Long invoices continue on the next page.
      for (let y = 0; y < imgH; y += pageH) {
        if (y > 0) pdf.addPage();
        pdf.addImage(img, 'JPEG', margin, margin - y, pageW, imgH);
      }
      pdf.save(`${fileName}.pdf`);
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={asPdf} disabled={!!busy}>
        <i className="fa-solid fa-file-pdf" /> {busy === 'pdf' ? 'Making PDF…' : 'PDF'}
      </button>
      <button type="button" className={className} onClick={asImage} disabled={!!busy}>
        <i className="fa-solid fa-image" /> {busy === 'png' ? 'Making image…' : 'Image'}
      </button>
    </>
  );
}
