#!/usr/bin/env node
/**
 * Turns a supplier price list (.xlsx, sheet "All Products" with columns
 * Brand | Product | Promo | DD | CD | RS | SRP) into a SQL seeder:
 *
 *   node scripts/build-product-seed.js docs/October-2026-Vanity-Connections-Price-List.xlsx
 *     -> database/seeds/default_products.sql
 *
 * The SQL defines seed_default_products(store_id). seed-owner.bat runs it once
 * for the default seller's store. Column -> role: DD -> "DD", CD -> "CD",
 * RS -> "Reseller", SRP -> "Retailer".
 *
 * Clean-up done here (and printed):
 *   - exact duplicate rows are merged; same name with different prices gets " (2)"
 *   - rows whose tiers are out of order (e.g. Reseller > SRP) are seeded hidden
 *   - "PROMO" rows become "while supplies last" promos at the SRP price
 *   - categories and units are guessed from the product name
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const input = process.argv[2] || 'docs/October-2026-Vanity-Connections-Price-List.xlsx';
const output = path.join(__dirname, '..', 'database', 'seeds', 'default_products.sql');

// First matching rule wins. Category names must match the store's seeded categories.
const CATEGORY_RULES = [
  ['Fragrance', /\b(perfume|cologne|eau de|edp|edt|fragrance|scents?)\b/i],
  ['Sets & Bundles', /\b(set|kit|bundle|package|combo)\b|\bb1t1\b|\bbuy \d+ get \d+\b|\bwith free\b|\+/i],
  ['Health & Supplements', /\d+\s?(caps|capsules?|tabs|tablets?|softgels?)\b|\b(capsules?|tablets?|softgels?|supplement|vitamins?|collagen|probiotic|multivitamin|barley|paragis|moringa)\b/i],
  ['Slimming', /\b(slim|slimming|fit ?gum|detox|fiber|burn|keto|diet|tummy|coffee|choco|chocolate|cocoa|juice|cantaloupe|dalandan|caffe|latte|melon|macchiato|turmerico|avocado|promeal|konjac|shirataki|drinks?|drink mix|tea|teabags|milk tea|matcha|acai|flavor|beauty milk|senna|chia|four season)\b/i],
  ['Nail Care', /\b(nail|cuticle)\b/i],
  ['Makeup', /\b(lipstick|lip|lips|liptint|blush|foundation|concealer|mascara|eyeliner|brow|eyeshadow|cushion|bb cream|cc cream|primer|setting spray|highlighter|contour|tint|eyelash|lashes|pressed powder)\b/i],
  ['Haircare', /\b(hair|shampoo|conditioner|keratin|scalp|argan|rebond|botox|blowout|plex|vials?)\b/i],
  ['Bath & Shower', /\b(soap|body wash|shower|bath|scrub|salt|bar|intimate wash|feminine wash)\b/i],
  ['Whitening', /\b(whitening|lightening|bleaching|brightening|white|gluta)\b/i],
  ['Body Care', /\b(lotion|body|deo|deodorant|underarm|roll-on|feminine|wax|hand cream|foot|butter|oil)\b/i],
  ['Skincare', /\b(serum|serumlotion|toner|cleanser|cleansing|facial|face|foam wash|sunscreen|sunblock|sunblocker|sunshield|sun defense|sun protect|cleanse|mist|scar\w*|extract|spf\d*|moisturizer|cream|gel|jelly|mask|essence|ampoule|rejuv|rejuvenating|acne|pimple|peel|exfoliat\w*|eye|night|day|kojic|niacinamide|retinol|hyaluronic|glow|skin)\b/i],
  ['Tools & Accessories', /\b(brush|sponge|puff|applicator|tool|roller|tweezer|ziplock|pouch|bag)\b/i],
];

const UOM_RULES = [
  ['set', /\b(set|kit|bundle|b1t1)\b|\bbuy \d+ get \d+\b/i],
  ['box', /\bbox\b/i],
  ['pack', /\bpack\b/i],
  ['sachet', /\bsachets?\b/i],
  ['tube', /\btube\b/i],
  ['jar', /\bjar\b/i],
  ['bottle', /\b\d+(\.\d+)?\s?(ml|l)\b/i],
];

const cellValue = (v) => {
  if (v && typeof v === 'object') {
    if ('result' in v) return v.result;
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return v.text;
    return null;
  }
  return v;
};
const titleCase = (s) =>
  s.toLowerCase().replace(/(^|[\s\-('&.])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bAnd\b/g, 'and');
const sql = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? v.toFixed(2) : `'${String(v).replace(/'/g, "''")}'`);

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(input);
  const ws = wb.getWorksheet('All Products');
  if (!ws) throw new Error('Sheet "All Products" not found');

  const header = ws.getRow(1).values.slice(1).map((h) => String(cellValue(h) ?? '').trim().toUpperCase());
  const col = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`Column ${name} not found (have: ${header.join(', ')})`);
    return i + 1;
  };
  const C = { brand: col('BRAND'), name: col('PRODUCT'), promo: col('PROMO'), dd: col('DD'), cd: col('CD'), rs: col('RS'), srp: col('SRP') };

  const products = [];
  const seen = new Map(); // brand|name -> prices string
  const report = { merged: [], renamed: [], hidden: [], promo: 0, uncategorized: [] };

  ws.eachRow({ includeEmpty: false }, (row, i) => {
    if (i === 1) return;
    const get = (k) => cellValue(row.getCell(C[k]).value);
    const brandRaw = String(get('brand') ?? '').trim();
    let name = String(get('name') ?? '').trim().replace(/\s+/g, ' ');
    if (!brandRaw || !name) return;
    const prices = { dd: get('dd'), cd: get('cd'), rs: get('rs'), srp: get('srp') };
    if (Object.values(prices).some((p) => typeof p !== 'number')) {
      report.hidden.push(`row ${i}: ${brandRaw} ${name} (missing price)`);
    }

    const key = `${brandRaw}|${name}`.toLowerCase();
    const sig = JSON.stringify(prices);
    if (seen.has(key)) {
      if (seen.get(key).includes(sig)) {
        report.merged.push(`row ${i}: ${brandRaw} - ${name}`);
        return;
      }
      const n = seen.get(key).length + 1;
      seen.get(key).push(sig);
      report.renamed.push(`row ${i}: ${brandRaw} - ${name} -> "${name} (${n})"`);
      name = `${name} (${n})`;
    } else {
      seen.set(key, [sig]);
    }

    const ordered = prices.dd <= prices.cd && prices.cd <= prices.rs && prices.rs <= prices.srp;
    if (!ordered) report.hidden.push(`row ${i}: ${brandRaw} - ${name} (DD/CD/RS/SRP = ${prices.dd}/${prices.cd}/${prices.rs}/${prices.srp})`);

    const isPromo = String(get('promo') ?? '').trim().toUpperCase() === 'PROMO';
    if (isPromo) report.promo++;

    const category = (CATEGORY_RULES.find(([, re]) => re.test(name)) || [null])[0];
    if (!category) report.uncategorized.push(`${brandRaw} - ${name}`);
    const uom = (UOM_RULES.find(([, re]) => re.test(name)) || ['pc'])[0];

    products.push({
      brand: titleCase(brandRaw),
      name,
      category,
      uom,
      ...prices,
      active: ordered,
      promo: isPromo,
      note: ordered ? null : 'Check prices: the supplier list has these tiers out of order.',
    });
  });

  const values = products
    .map((p) =>
      `    (${[sql(p.brand), sql(p.name), sql(p.category), sql(p.uom), sql(p.dd), sql(p.cd), sql(p.rs), sql(p.srp), p.active, p.promo, sql(p.note)].join(', ')})`
    )
    .join(',\n');

  const out = `-- GENERATED by scripts/build-product-seed.js from ${path.basename(input)}
-- Do not edit by hand: change the spreadsheet and run
--   node scripts/build-product-seed.js ${input.replace(/\\/g, '/')}
--
-- Defines seed_default_products(store_id): adds these ${products.length} products to a store,
-- once (tracked in app_settings). Brands are created; categories/units are matched by name
-- to the store's own (missing ones are left empty). Prices go to the roles named
-- DD, CD, Reseller and Retailer when the store has them.

CREATE OR REPLACE FUNCTION seed_default_products(p_store_id BIGINT) RETURNS INTEGER
LANGUAGE plpgsql AS $fn$
DECLARE
    v_key TEXT := 'seed:default_products:store:' || p_store_id;
    v_count INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM app_settings WHERE key = v_key) THEN
        RETURN 0;
    END IF;

    CREATE TEMP TABLE seed_rows (
        brand TEXT, name TEXT, category TEXT, uom TEXT,
        dd NUMERIC, cd NUMERIC, rs NUMERIC, srp NUMERIC,
        active BOOLEAN, promo BOOLEAN, note TEXT
    ) ON COMMIT DROP;

    INSERT INTO seed_rows VALUES
${values};

    INSERT INTO brands (store_id, name, slug)
    SELECT DISTINCT p_store_id, s.brand, lower(regexp_replace(s.brand, '[^a-zA-Z0-9]+', '-', 'g'))
    FROM seed_rows s
    WHERE NOT EXISTS (SELECT 1 FROM brands b WHERE b.store_id = p_store_id AND lower(b.name) = lower(s.brand));

    INSERT INTO product_details (store_id, brand_id, product_category_id, uom_id, name, description,
                                 is_active, promo_price, promo_type)
    SELECT p_store_id,
           (SELECT id FROM brands b WHERE b.store_id = p_store_id AND lower(b.name) = lower(s.brand)),
           (SELECT id FROM product_category c WHERE c.store_id = p_store_id AND lower(c.name) = lower(s.category)),
           (SELECT id FROM uoms u WHERE u.store_id = p_store_id AND lower(u.code) = lower(s.uom)),
           s.name, s.note, s.active,
           CASE WHEN s.promo THEN s.srp END,
           CASE WHEN s.promo THEN 'while_supplies_last' END
    FROM seed_rows s
    WHERE NOT EXISTS (
        SELECT 1 FROM product_details p
        JOIN brands b ON b.id = p.brand_id
        WHERE p.store_id = p_store_id AND lower(b.name) = lower(s.brand) AND lower(p.name) = lower(s.name)
    );
    GET DIAGNOSTICS v_count = ROW_COUNT;

    INSERT INTO product_role_prices (product_id, role_id, price)
    SELECT p.id, r.id, CASE lower(r.name) WHEN 'dd' THEN s.dd WHEN 'cd' THEN s.cd WHEN 'reseller' THEN s.rs ELSE s.srp END
    FROM seed_rows s
    JOIN brands b ON b.store_id = p_store_id AND lower(b.name) = lower(s.brand)
    JOIN product_details p ON p.store_id = p_store_id AND p.brand_id = b.id AND lower(p.name) = lower(s.name)
    JOIN store_roles r ON r.store_id = p_store_id AND lower(r.name) IN ('dd', 'cd', 'reseller', 'retailer')
    ON CONFLICT (product_id, role_id) DO NOTHING;

    INSERT INTO app_settings (key, value) VALUES (v_key, v_count::text);
    RETURN v_count;
END
$fn$;
`;

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, out);

  const byCat = {};
  products.forEach((p) => (byCat[p.category || '(none)'] = (byCat[p.category || '(none)'] || 0) + 1));
  const byUom = {};
  products.forEach((p) => (byUom[p.uom] = (byUom[p.uom] || 0) + 1));
  console.log(`Wrote ${output}`);
  console.log(`${products.length} products, ${new Set(products.map((p) => p.brand)).size} brands, ${report.promo} promo`);
  console.log('Categories:', byCat);
  console.log('Units:', byUom);
  console.log(`Merged exact duplicates (${report.merged.length}):\n  ${report.merged.join('\n  ')}`);
  console.log(`Same name, different prices (${report.renamed.length}):\n  ${report.renamed.join('\n  ')}`);
  console.log(`Seeded hidden (${report.hidden.length}):\n  ${report.hidden.join('\n  ')}`);
  if (process.argv.includes('--show-uncategorized')) console.log('Uncategorized:\n  ' + report.uncategorized.join('\n  '));
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
