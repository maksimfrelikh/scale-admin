/**
 * BLOCK-08 — Search (B) + Filters (C) + Highlight (D) UI behavior.
 * Drives the combined search input on the Prices section, takes evidence,
 * counts visible rows for each query.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://maksimfrelikh.ru';
const QA_PASSWORD = process.env.QA_PASSWORD;
const STORE_P = process.env.STORE_P;
const EVI = path.resolve(__dirname, '..', 'evidence', 'block-08');
fs.mkdirSync(EVI, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function login(page) {
  await page.goto(`${TARGET}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill('qa-admin@***.invalid');
  await page.locator('input[type="password"]').first().fill(QA_PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForResponse(r => r.url().includes('/api/auth/login') && r.status() === 200, { timeout: 15000 }).catch(()=>{});
  await sleep(1500);
}

async function getPricesRows(page) {
  return page.evaluate(() => {
    const h2 = Array.from(document.querySelectorAll('h2,h3,h4')).find(h => /Store product prices/i.test(h.innerText));
    if (!h2) return null;
    let container = h2;
    for (let i = 0; i < 6 && container && container.parentElement; i++) {
      container = container.parentElement;
      if (container.tagName === 'SECTION' || container.children.length > 5) break;
    }
    const table = container.querySelector('table');
    if (!table) return { rows: [], empty: container.innerText.match(/No products|empty|нет данных/i)?.[0] || null };
    return {
      rows: Array.from(table.querySelectorAll('tbody tr')).map(tr => ({
        cellTexts: Array.from(tr.querySelectorAll('td')).map(c => c.innerText.trim()).slice(0,6),
      })),
      emptyHint: container.querySelector('table tbody tr:only-child td[colspan]')?.innerText || null,
    };
  });
}

async function setSearch(page, q) {
  const input = page.locator('input[placeholder*="Name, short name"]').first();
  await input.fill('');
  if (q.length > 0) await input.fill(q);
  await sleep(800);
}

async function setSelect(page, ariaOrText, value) {
  // We have 2 selects in the section; identify by their options
  await page.evaluate(({ariaOrText, value}) => {
    const selects = Array.from(document.querySelectorAll('select'));
    const target = selects.find(s => Array.from(s.options).some(o => o.text.includes(ariaOrText)));
    if (!target) return false;
    const opt = Array.from(target.options).find(o => o.text === value || o.value === value);
    if (!opt) return false;
    target.value = opt.value;
    target.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, {ariaOrText, value});
  await sleep(800);
}

(async () => {
  const out = { steps: {} };
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();

  // Capture API calls related to prices/products to determine server vs client search
  const apiCalls = [];
  page.on('request', r => {
    if (/\/api\/(stores|products)/.test(r.url())) apiCalls.push({t: Date.now(), method: r.method(), url: r.url().slice(0,200)});
  });

  await login(page);
  await page.goto(`${TARGET}/dashboard#store:${STORE_P}`, { waitUntil: 'domcontentloaded' });
  await sleep(3000);

  // Helper to mark calls for a step
  async function step(name, fn) {
    const start = apiCalls.length;
    await fn();
    const calls = apiCalls.slice(start).map(c => `${c.method} ${c.url.replace(/^https?:\/\/[^/]+/,'')}`);
    const data = await getPricesRows(page);
    out.steps[name] = { rowsVisible: data?.rows?.length, productsShown: data?.rows?.map(r=>r.cellTexts[0]?.split('\n')[0]) || [], emptyHint: data?.emptyHint, apiCalls: calls };
    await page.screenshot({ path: path.join(EVI, `B-${name}.png`), fullPage: false }).catch(()=>{});
  }

  await step('initial', async () => {});
  await step('search-apple-name', () => setSearch(page, 'Apple'));
  await step('search-bnn-shortname', () => setSearch(page, 'Bnn'));
  await step('search-plu-81002', () => setSearch(page, '81002'));
  await step('search-sku-lf', () => setSearch(page, 'SKU-LF'));
  await step('search-barcode-bagel', () => setSearch(page, '4600100100005'));
  await step('search-empty', () => setSearch(page, ''));
  await step('search-no-match', () => setSearch(page, 'zzznonexistentzzz'));

  // Filters
  await step('filter-clear', () => setSearch(page, ''));
  await step('filter-cat-fruit', () => setSelect(page, 'All categories', 'QA-FRUIT-235548'));
  await step('filter-cat-bread', () => setSelect(page, 'All categories', 'QA-BREAD-235548'));
  await step('filter-cat-all', () => setSelect(page, 'All categories', 'All categories'));
  await step('filter-missing-only', () => setSelect(page, 'All products', 'Missing price only'));
  await step('filter-with-only', () => setSelect(page, 'All products', 'With price only'));
  await step('filter-all-products', () => setSelect(page, 'All products', 'All products'));
  // Combined
  await step('combo-fruit-missing', async () => {
    await setSelect(page, 'All categories', 'QA-FRUIT-235548');
    await setSelect(page, 'All products', 'Missing price only');
  });
  await step('combo-clear', async () => {
    await setSelect(page, 'All categories', 'All categories');
    await setSelect(page, 'All products', 'All products');
  });

  // D — highlight check: look for "NO PRICE" badge in rows
  await step('highlight-detect', async () => {});
  const highlight = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table tbody tr'));
    return rows.map(r => ({
      productCell: r.querySelector('td')?.innerText?.trim() || '',
      classNames: r.className,
      hasNoPriceBadge: /NO PRICE/i.test(r.innerText),
      hasRedClass: /red|danger|missing|warning/i.test(r.className) || Array.from(r.querySelectorAll('*')).some(el => /red|danger|missing|warning/i.test(el.className||'')),
    }));
  });
  out.steps['highlight-detect'].rowHighlight = highlight;

  fs.writeFileSync(path.join(EVI, 'B-search-filter.json'), JSON.stringify(out, null, 2));
  console.log('DONE — see B-search-filter.json');

  // Print compact summary
  for (const [k, v] of Object.entries(out.steps)) {
    console.log(`${k.padEnd(28)} rows=${v.rowsVisible} ${v.productsShown.join(',').slice(0,80)} apiCalls=${v.apiCalls.length}`);
  }

  await browser.close();
})().catch(e => { console.error(e.stack || e); process.exit(1); });
