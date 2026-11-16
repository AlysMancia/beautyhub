'use client';

/**
 * Product Excel export/import. The same column layout is used both ways, so an
 * exported file can be edited and imported back.
 */

const FIXED_COLUMNS = [
  { header: 'Brand', key: 'brand', width: 18 },
  { header: 'Product', key: 'name', width: 32 },
  { header: 'SKU', key: 'sku', width: 14 },
  { header: 'Category', key: 'category', width: 18 },
  { header: 'UOM', key: 'uom', width: 8 },
  { header: 'Size', key: 'uom_qty', width: 8 },
  { header: 'Stock', key: 'stock', width: 8 },
  { header: 'Low Stock At', key: 'reorder_level', width: 12 },
];

const PROMO_COLUMNS = [
  { header: 'Promo Price', key: 'promo_price', width: 12, money: true },
  { header: 'Promo Type', key: 'promo_type', width: 20 },
  { header: 'Promo Valid Until', key: 'promo_until', width: 16 },
  { header: 'Active', key: 'is_active', width: 8 },
  { header: 'Description', key: 'description', width: 40 },
];

const loadExcel = async () => (await import('exceljs')).default;

function download(buffer, filename) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Downloads `products` as .xlsx with one price column per role.
 * With an empty list it produces a template with one example row.
 */
export async function exportProducts({ products, roles, catalog, storeName, template = false }) {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  wb.creator = storeName;
  const ws = wb.addWorksheet('Products', { views: [{ state: 'frozen', ySplit: 1 }] });

  const roleColumns = roles.map((r) => ({ header: r.name, key: `role_${r.id}`, width: 11, money: true }));
  const columns = [...FIXED_COLUMNS, ...roleColumns, ...PROMO_COLUMNS];
  ws.columns = columns.map(({ header, key, width }) => ({ header, key, width }));

  const rows = template
    ? [{
        brand: 'Sample Brand', name: 'Sample Product (delete this row)', sku: 'SKU-001', category: catalog.categories[0]?.name ?? '',
        uom: catalog.uoms[0]?.code ?? 'pc', stock: 10, reorder_level: 5, promo_price: '', promo_type: '', promo_until: '', is_active: 'Yes', description: '',
        ...Object.fromEntries(roles.map((r, i) => [`role_${r.id}`, 110 + i * 10])),
      }]
    : products.map((p) => ({
        brand: p.brand ?? '',
        name: p.name,
        sku: p.sku ?? '',
        category: p.category ?? '',
        uom: p.uom ?? '',
        uom_qty: p.uom_qty === null || p.uom_qty === undefined ? '' : Number(p.uom_qty),
        stock: p.stock_qty,
        reorder_level: p.reorder_level,
        promo_price: p.promo_price === null ? '' : Number(p.promo_price),
        promo_type: p.promo_type === 'while_supplies_last' ? 'while supplies last' : p.promo_type === 'until_date' ? 'until date' : '',
        // Excel stores dates as UTC midnight; a local-time Date would shift the day.
        promo_until: p.promo_until ? new Date(`${p.promo_until}T00:00:00Z`) : '',
        is_active: p.is_active ? 'Yes' : 'No',
        description: p.description ?? '',
        ...Object.fromEntries(roles.map((r) => [`role_${r.id}`, p.prices[r.id] !== undefined ? Number(p.prices[r.id]) : ''])),
      }));
  rows.forEach((row) => ws.addRow(row));

  // Formatting
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE25A86' } };
  columns.forEach((col, i) => {
    if (col.money) ws.getColumn(i + 1).numFmt = '#,##0.00';
  });
  ws.getColumn('promo_until').numFmt = 'yyyy-mm-dd';
  const last = Math.max(rows.length + 1, 200);
  const colLetter = (key) => ws.getColumn(key).letter;
  for (let r = 2; r <= last; r++) {
    ws.getCell(`${colLetter('promo_type')}${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"until date,while supplies last"'],
    };
    ws.getCell(`${colLetter('is_active')}${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"Yes,No"'],
    };
  }

  // A second sheet explaining the columns.
  const help = wb.addWorksheet('How to use');
  help.columns = [{ width: 22 }, { width: 90 }];
  [
    ['Column', 'What to enter'],
    ['Brand', 'Required. New brands are created automatically.'],
    ['Product', 'Required. Product name.'],
    ['SKU', 'Optional code. If filled, it is used to find and update an existing product.'],
    ['Category', `Optional. Yours: ${catalog.categories.map((c) => c.name).join(', ')}. New ones are created.`],
    ['UOM', `Optional unit. Yours: ${catalog.uoms.map((u) => u.code).join(', ')}. New ones are created.`],
    ['Size', 'For units that measure (ml, L, g, kg): how many, e.g. 500 for 500 ml. Leave empty for pc, box, set…'],
    ['Stock', 'How many you have now. Importing sets the stock to this number (the change is recorded in Inventory). Leave empty to keep the current stock.'],
    ['Low Stock At', 'Show a low-stock alert when stock is at or below this number.'],
    ...roles.map((r) => [r.name, `Price for your ${r.name} customers.${r.is_cost ? ' This is also YOUR COST (what you pay), used for profit.' : ''}${r.is_default ? ' Also shown to visitors who are not logged in.' : ''}`]),
    ['Promo Price', 'Optional promo price. Leave empty for no promo.'],
    ['Promo Type', '"until date" (fill Promo Valid Until) or "while supplies last".'],
    ['Promo Valid Until', 'Last day of the promo, e.g. 2026-12-31.'],
    ['Active', 'Yes = shown on your store page, No = hidden.'],
    ['', ''],
    ['Updating', 'Products are matched by SKU, or by Brand + Product name. Matching products are updated, others are added.'],
    ['Blank cells', 'A blank price removes that price. Columns you delete from the sheet are left unchanged.'],
    ['Tier prices', `Tier columns go from best price to retail (${roles.map((r) => r.name).join(' → ')}). A customer whose tier has no price pays the next tier to the right.`],
  ].forEach((r, i) => {
    const row = help.addRow(r);
    if (i === 0) row.font = { bold: true };
  });

  const date = new Date().toISOString().slice(0, 10);
  const slug = (storeName || 'store').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  download(await wb.xlsx.writeBuffer(), template ? `${slug}-product-template.xlsx` : `${slug}-products-${date}.xlsx`);
}

/** Converts one ExcelJS cell value into a plain string for the server. */
function cellText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    // Excel dates are stored as UTC midnight.
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'object') {
    if ('result' in value) return cellText(value.result); // formula
    if ('text' in value) return String(value.text); // hyperlink
    if ('richText' in value) return value.richText.map((t) => t.text).join('');
    return '';
  }
  return String(value).trim();
}

/** Reads the first sheet of an .xlsx file into [{header: value}] rows. */
export async function readProductsFile(file) {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('The file has no sheets.');

  const headers = [];
  ws.getRow(1).eachCell((cell, col) => {
    headers[col] = cellText(cell.value);
  });
  if (!headers.some((h) => /^(product|name|product name)$/i.test(h || ''))) {
    throw new Error('Could not find a "Product" column in the first row. Download the template to see the layout.');
  }

  const rows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const obj = {};
    headers.forEach((h, col) => {
      if (h) obj[h] = cellText(row.getCell(col).value);
    });
    rows.push(obj);
  }
  // Drop trailing empty rows.
  while (rows.length && Object.values(rows[rows.length - 1]).every((v) => v === '')) rows.pop();
  return rows;
}
