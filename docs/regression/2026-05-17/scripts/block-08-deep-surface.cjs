/**
 * BLOCK-08 — deeper inspection of Prices section: all inputs, filter widgets, highlight classes
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

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await login(page);
  await page.goto(`${TARGET}/dashboard#store:${STORE_P}`, { waitUntil: 'domcontentloaded' });
  await sleep(3000);

  const deep = await page.evaluate(() => {
    // Find the section labelled "Store product prices"
    const h2 = Array.from(document.querySelectorAll('h2,h3,h4')).find(h => /Store product prices/i.test(h.innerText));
    if (!h2) return { found: false };
    // Walk up to section / nearest container
    let container = h2;
    for (let i = 0; i < 6 && container && container.parentElement; i++) {
      container = container.parentElement;
      if (container.tagName === 'SECTION' || container.tagName === 'ARTICLE' || container.tagName === 'MAIN' || container.children.length > 5) break;
    }
    // All inputs in this container
    const inputs = Array.from(container.querySelectorAll('input')).map(i => ({
      type: i.type, placeholder: i.placeholder, value: i.value.slice(0,30), name: i.name,
      ariaLabel: i.getAttribute('aria-label'), id: i.id, role: i.getAttribute('role'),
      min: i.min, max: i.max, step: i.step,
    }));
    const selects = Array.from(container.querySelectorAll('select')).map(s => ({
      ariaLabel: s.getAttribute('aria-label'), id: s.id, name: s.name,
      options: Array.from(s.options).map(o=>o.text),
      value: s.value,
    }));
    const buttons = Array.from(container.querySelectorAll('button')).map(b => b.innerText.trim()).filter(t=>t.length>0);
    // Identify rows and any highlight classes
    const table = container.querySelector('table');
    let rows = [];
    if (table) {
      rows = Array.from(table.querySelectorAll('tbody tr')).map((tr, i) => ({
        i,
        className: tr.className,
        cellTexts: Array.from(tr.querySelectorAll('td')).map(c => c.innerText.trim().slice(0,120)),
        cellClasses: Array.from(tr.querySelectorAll('td')).map(c => c.className),
        badges: Array.from(tr.querySelectorAll('.badge, [class*="badge" i], [class*="no-price" i], [class*="missing" i]')).map(b => ({ cls: b.className, text: b.innerText.trim() })),
      }));
    }
    // Section innerText preview
    const preview = container.innerText.slice(0, 4000);
    return { found: true, containerTag: container.tagName, containerClass: container.className, inputs, selects, buttons, rows, preview };
  });

  fs.writeFileSync(path.join(EVI, 'A-deep-surface.json'), JSON.stringify(deep, null, 2));
  console.log('inputs:', deep.inputs?.length, 'selects:', deep.selects?.length, 'rows:', deep.rows?.length);
  console.log('selects summary:');
  (deep.selects||[]).forEach((s,i) => console.log(`  [${i}] aria=${s.ariaLabel} opts=${(s.options||[]).slice(0,3).join('|')}...`));
  console.log('inputs summary:');
  (deep.inputs||[]).forEach((i,k) => console.log(`  [${k}] type=${i.type} aria=${i.ariaLabel} placeholder="${i.placeholder}" min=${i.min} max=${i.max}`));

  await page.screenshot({ path: path.join(EVI, 'A-prices-section.png'), fullPage: true }).catch(()=>{});
  await browser.close();
})().catch(e => { console.error(e.stack || e); process.exit(1); });
