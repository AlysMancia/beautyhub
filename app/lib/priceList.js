'use client';

/**
 * Price list layout and downloads: Excel, PDF and pictures (PNG).
 * `data` comes from the `price_list` API: { store, roles, products, generated_at }.
 *
 * On screen the list is one line per product (tiny photo, name, a price per
 * tier) in newspaper columns, grouped by brand. The PDF and the pictures are
 * made from those same pages (`.price-page` elements), so they look identical.
 * Excel is a table grouped by brand.
 */

const slug = (s) => (s || 'price-list').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const fileBase = (data, title) => `${slug(data.store.name)}-${slug(title)}-${data.generated_at.slice(0, 10)}`;

/** Products grouped by brand, in order: [{ brand, logo, products: [...] }]. */
export function groupByBrand(products) {
  const groups = [];
  for (const p of products) {
    const name = p.brand || 'Other';
    let g = groups[groups.length - 1];
    if (!g || g.brand !== name) {
      g = { brand: name, logo: p.brand_logo, products: [] };
      groups.push(g);
    }
    g.products.push(p);
  }
  return groups;
}

/** Short price: "₱245" for whole pesos, "₱245.50" otherwise. */
export function priceShort(n) {
  if (n == null || n === '') return '';
  const v = Number(n);
  return `₱${v.toLocaleString('en-PH', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/**
 * The price list as a flat list of lines, in order:
 *   { type: 'brand', group }                 brand bar (with tier names)
 *   { type: 'product', p }                   one product
 *   { type: 'vnames', p, names }             variants that cost the same as the product, on one line
 *   { type: 'variant', p, v }                a variant with its own price
 */
export function buildLines(groups, roles) {
  const lines = [];
  for (const group of groups) {
    lines.push({ type: 'brand', group, key: `b-${group.brand}` });
    for (const p of group.products) {
      lines.push({ type: 'product', p, key: `p-${p.id}` });
      const vs = p.variants ?? [];
      const own = (v) => roles.some((r) => v.prices[r.id] != null && v.prices[r.id] !== p.prices[r.id]);
      const same = vs.filter((v) => !own(v));
      if (same.length) lines.push({ type: 'vnames', p, names: same.map((v) => v.name), key: `vn-${p.id}` });
      vs.filter(own).forEach((v) => lines.push({ type: 'variant', p, v, key: `v-${v.id}` }));
    }
  }
  return lines;
}

/**
 * Pours lines into columns of at most `height` px (newspaper style).
 * A brand bar is never left alone at the bottom of a column, and a brand that
 * continues into a new column shows its bar again, marked "cont.".
 */
function pour(lines, heights, height, brandHeight) {
  const cols = [];
  let col = [];
  let used = 0;
  let brand = null;
  lines.forEach((line, i) => {
    if (line.type === 'brand') brand = line;
    const need = heights[i] + (line.type === 'brand' ? heights[i + 1] ?? 0 : 0);
    if (used > 0 && used + need > height) {
      cols.push(col);
      col = [];
      used = 0;
      if (line.type !== 'brand' && brand) {
        col.push({ ...brand, continued: true, key: `${brand.key}-c${cols.length}` });
        used += brandHeight;
      }
    }
    col.push(line);
    used += heights[i];
  });
  if (col.length) cols.push(col);
  return cols;
}

/**
 * Lays the lines out on pages of at most `columns` columns, each column at
 * most `pageHeight` px tall.
 *
 * Every brand gets whole columns of its own, so a page shows 1 to `columns`
 * brands. A brand too long for one column is spread evenly over 2–3 columns;
 * one too long for a whole page fills full pages and continues on the next.
 * Brands keep their order; a brand that doesn't fit the columns left on a
 * page starts the next page.
 * Returns pages: [[column of lines]].
 */
export function layoutLines(lines, heights, { columns, pageHeight, brandHeight }) {
  if (!lines.length) return [];

  // Split into brands: each segment starts at a brand bar.
  const segments = [];
  lines.forEach((line, i) => {
    if (line.type === 'brand' || !segments.length) segments.push({ lines: [], heights: [] });
    segments[segments.length - 1].lines.push(line);
    segments[segments.length - 1].heights.push(heights[i]);
  });

  const pages = [];
  let page = [];
  const flush = () => {
    if (page.length) pages.push(page);
    page = [];
  };

  for (const seg of segments) {
    let cols = pour(seg.lines, seg.heights, pageHeight, brandHeight);
    if (cols.length > columns) {
      // Longer than a page: full pages of this brand, the rest can share.
      flush();
      while (cols.length > columns) {
        pages.push(cols.slice(0, columns));
        cols = cols.slice(columns);
      }
      page = cols;
      continue;
    }
    if (cols.length > 1) {
      // Even out the brand's columns (e.g. 2 half-full columns, not 1 full + 1 short).
      const n = cols.length;
      let height = Math.ceil(seg.heights.reduce((s, h) => s + h, 0) / n);
      while ((cols = pour(seg.lines, seg.heights, height, brandHeight)).length > n) height += 8;
    }
    if (page.length + cols.length > columns) flush();
    page.push(...cols);
  }
  flush();
  return pages;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Loads an image into a small JPEG data URL (Excel can't use WebP). Cached per URL. */
const imageCache = new Map();
function imageData(url, size = 120) {
  if (!url) return Promise.resolve(null);
  if (!imageCache.has(url)) {
    imageCache.set(
      url,
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const scale = Math.min(1, size / Math.max(img.width, img.height));
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve({ url: canvas.toDataURL('image/jpeg', 0.85), w: canvas.width, h: canvas.height });
        };
        img.onerror = () => resolve(null);
        img.src = url;
      })
    );
  }
  return imageCache.get(url);
}

/* ---------------- Excel: one table, grouped by brand ---------------- */

export async function priceListExcel(data, { photos, title }) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = data.store.name;
  const ws = wb.addWorksheet('Price list', {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: { paperSize: 9, orientation: data.roles.length > 3 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
  });

  ws.columns = [
    ...(photos ? [{ width: 8 }] : []),
    { width: 46 },
    { width: 10 },
    ...data.roles.map(() => ({ width: 13 })),
  ];
  const width = ws.columns.length;
  const firstPrice = (photos ? 1 : 0) + 3;

  ws.mergeCells(1, 1, 1, width);
  ws.getCell(1, 1).value = `${data.store.name} — ${title}`;
  ws.getCell(1, 1).font = { bold: true, size: 15 };
  ws.mergeCells(2, 1, 2, width);
  ws.getCell(2, 1).value = data.generated_at;
  ws.getCell(2, 1).font = { color: { argb: 'FF8E808B' } };
  const head = ws.getRow(3);
  head.values = [...(photos ? [''] : []), 'Product', 'Size', ...data.roles.map((r) => r.name)];
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE25A86' } };

  let r = 4;
  for (const group of groupByBrand(data.products)) {
    // Brand heading row.
    ws.mergeCells(r, 1, r, width);
    const cell = ws.getCell(r, 1);
    cell.value = group.brand.toUpperCase();
    cell.font = { bold: true, size: 12, color: { argb: 'FFC2456E' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDEAF1' } };
    ws.getRow(r).height = 20;
    r++;

    for (const p of group.products) {
      const lines = [{ ...p, isVariant: false }, ...(p.variants ?? []).map((v) => ({ ...v, isVariant: true, label: p.variant_label }))];
      for (const line of lines) {
        const row = ws.getRow(r);
        row.values = [
          ...(photos ? [''] : []),
          line.isVariant ? `   ↳ ${line.label || 'Variant'}: ${line.name}` : line.name,
          line.isVariant ? '' : p.size ?? '',
          ...data.roles.map((role) => (line.prices[role.id] == null ? '' : Number(line.prices[role.id]))),
        ];
        data.roles.forEach((_, i) => (row.getCell(firstPrice + i).numFmt = '"₱"#,##0.00'));
        if (line.isVariant) row.font = { color: { argb: 'FF6B5D66' } };
        if (photos) {
          row.height = line.isVariant && !line.image ? 16 : 40;
          const img = await imageData(line.image, 100);
          if (img) {
            const id = wb.addImage({ base64: img.url, extension: 'jpeg' });
            const scale = (line.isVariant ? 34 : 48) / Math.max(img.w, img.h);
            ws.addImage(id, { tl: { col: 0.1, row: r - 1 + 0.08 }, ext: { width: img.w * scale, height: img.h * scale } });
          }
        }
        r++;
      }
    }
  }
  const buffer = await wb.xlsx.writeBuffer();
  download(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileBase(data, title)}.xlsx`);
}

/* ---------------- pictures and PDF from the catalogue pages ---------------- */

async function renderPages(container, onProgress) {
  const html2canvas = (await import('html2canvas')).default;
  const pages = [...container.querySelectorAll('.price-page')];
  const canvases = [];
  for (let i = 0; i < pages.length; i++) {
    onProgress?.(i + 1, pages.length);
    canvases.push(await html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false }));
  }
  return canvases;
}

/**
 * One PDF page per price list page, at the page's own size (A4 = 794 px wide
 * portrait / 1123 px wide landscape; compact pages are shorter).
 */
export async function priceListPdf(data, { title }, container, onProgress) {
  const canvases = await renderPages(container, onProgress);
  const { jsPDF } = await import('jspdf');
  const MM_PER_PX = 210 / 794 / 2; // canvases are drawn at 2x
  const size = (c) => [c.width * MM_PER_PX, c.height * MM_PER_PX];
  const orient = ([w, h]) => (w > h ? 'landscape' : 'portrait');
  const pdf = new jsPDF({ unit: 'mm', format: size(canvases[0]), orientation: orient(size(canvases[0])) });
  canvases.forEach((canvas, i) => {
    const [w, h] = size(canvas);
    if (i > 0) pdf.addPage([w, h], orient([w, h]));
    // Sharp enough for the small list text.
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.88), 'JPEG', 0, 0, w, h, undefined, 'FAST');
  });
  pdf.save(`${fileBase(data, title)}.pdf`);
}

/** One picture per page; several pages download as a .zip. */
export async function priceListImages(data, { title }, container, onProgress) {
  const canvases = await renderPages(container, onProgress);
  const blobs = await Promise.all(canvases.map((c) => new Promise((res) => c.toBlob(res, 'image/png'))));
  const base = fileBase(data, title);
  if (blobs.length === 1) return download(blobs[0], `${base}.png`);
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  blobs.forEach((b, i) => zip.file(`${base}-page-${String(i + 1).padStart(2, '0')}.png`, b));
  download(await zip.generateAsync({ type: 'blob' }), `${base}-pictures.zip`);
}
