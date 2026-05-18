/**
 * BLOCK-08 — Prices UI surface inspection (A.* + visual highlight D.*).
 * Login admin → open #store:STORE_P → inspect Prices section:
 *  - column headers
 *  - row count
 *  - missing-price highlight (D)
 *  - search/filter widgets presence
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://maksimfrelikh.ru';
const QA_PASSWORD = process.env.QA_PASSWORD;
if (!QA_PASSWORD) { console.error('Set QA_PASSWORD'); process.exit(2); }
const STORE_P = process.env.STORE_P;
if (!STORE_P) { console.error('Set STORE_P'); process.exit(2); }

const EVI = path.resolve(__dirname, '..', 'evidence', 'block-08');
fs.mkdirSync(EVI, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function login(page) {
  await page.goto(`${TARGET}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill('qa-admin@***.invalid');
  await page.locator('input[type="password"]').first().fill(QA_PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForResponse(r => r.url().includes('/api/auth/login') && r.status() === 200, { timeout: 15000 }).catch(() => {});
  await sleep(1500);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0,300)); });

  await login(page);
  await page.goto(`${TARGET}/dashboard#store:${STORE_P}`, { waitUntil: 'domcontentloaded' });
  await sleep(3000);

  await page.screenshot({ path: path.join(EVI, 'A-store-detail.png'), fullPage: true }).catch(()=>{});

  // Locate Prices section h-headers and pricing-related elements
  const surface = await page.evaluate(() => {
    function txt(el) { return el ? (el.innerText || el.textContent || '').trim().slice(0, 400) : null; }
    // Find any header mentioning "Prices" or "Цены"
    const heads = Array.from(document.querySelectorAll('h1,h2,h3,h4')).map(h => h.innerText.trim());
    // Find any region/section with prices context
    const allTables = Array.from(document.querySelectorAll('table'));
    const tableInfos = allTables.map((t, i) => {
      const ths = Array.from(t.querySelectorAll('thead th, thead td, tr:first-child th')).map(x => x.innerText.trim());
      const rows = t.querySelectorAll('tbody tr').length;
      const firstRowCells = Array.from(t.querySelectorAll('tbody tr')[0]?.querySelectorAll('td,th') || []).map(c => c.innerText.trim().slice(0,80));
      return { i, ths, rows, firstRowCells };
    });
    // Find any input that looks like a price field
    const priceInputs = Array.from(document.querySelectorAll('input[type=number], input[aria-label*="price" i], input[placeholder*="0.00"]')).map(inp => ({
      type: inp.type, placeholder: inp.placeholder, value: inp.value, name: inp.name, ariaLabel: inp.getAttribute('aria-label'),
      min: inp.min, max: inp.max, step: inp.step,
    }));
    // Find any text saying "missing price" or "no price"
    const flagText = Array.from(document.querySelectorAll('*')).filter(el => {
      const t = (el.innerText||'').toLowerCase();
      return /no price|missing|без цены|нет цены|not set/.test(t) && el.children.length === 0;
    }).map(el => el.innerText.trim().slice(0,100));
    // Find search inputs and filter selects in prices section
    const searches = Array.from(document.querySelectorAll('input[type=search], input[placeholder*="earch" i], input[placeholder*="оиск" i]')).map(s => ({placeholder: s.placeholder, ariaLabel: s.getAttribute('aria-label')}));
    const selects = Array.from(document.querySelectorAll('select')).map(s => ({name: s.name, ariaLabel: s.getAttribute('aria-label'), options: Array.from(s.options).map(o=>o.text).slice(0,10)}));
    const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(t=>t.length>0 && t.length<60);
    return { heads, tableInfos, priceInputs, flagText, searches, selects, buttons };
  });

  fs.writeFileSync(path.join(EVI, 'A-surface.json'), JSON.stringify(surface, null, 2));
  console.log(JSON.stringify({ ok: true, heads: surface.heads, tables: surface.tableInfos.length, priceInputs: surface.priceInputs.length, consoleErrors: consoleErrors.length }, null, 2));

  await browser.close();
})().catch(e => { console.error(e.stack || e); process.exit(1); });
