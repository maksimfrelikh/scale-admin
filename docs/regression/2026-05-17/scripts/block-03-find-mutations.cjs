/** Trace admin Users & Access role-change and store-assign mutations to find real endpoints. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://maksimfrelikh.ru';
const QA_PASSWORD = process.env.QA_PASSWORD || (() => { throw new Error('Set QA_PASSWORD') })();
const ADMIN = { email: 'qa-admin@***.invalid', password: QA_PASSWORD };
const EVI = path.resolve(__dirname, '..', 'evidence', 'block-03');
const REPORT = path.resolve(EVI, 'admin-mutations-trace.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  const traffic = [];
  page.on('response', async r => {
    if (r.url().includes('/api/') && ['POST','PATCH','PUT','DELETE'].includes(r.request().method())) {
      let body = ''; try { body = await r.text(); } catch {}
      traffic.push({ m: r.request().method(), u: r.url(), s: r.status(), reqBody: r.request().postData(), respHead: (body || '').slice(0, 300) });
    }
  });

  await page.goto(TARGET + '/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(ADMIN.email);
  await page.locator('input[type="password"]').first().fill(ADMIN.password);
  await Promise.all([
    page.waitForURL(/\/(dashboard|stores|$)/, { timeout: 10000 }).catch(() => {}),
    page.locator('button[type="submit"]').first().click(),
  ]);
  await sleep(1500);

  await page.getByRole('button', { name: /users & access/i }).first().click();
  await sleep(3000);

  // Find first non-admin (operator) row and try Assign store
  // The Users & Access page has rows with per-user controls. Each row has:
  //   - role select (operator/admin)
  //   - Block button
  //   - store select (Choose store / Assign store / Revoke)
  // Click "Assign store" on the first user row to see what endpoint
  await page.screenshot({ path: path.resolve(EVI, 'mutations-before.png'), fullPage: true });

  // Get all "Assign store" buttons and click the first (this might mutate; we'll check what endpoint)
  const assignButtons = page.getByRole('button', { name: /^assign store$/i });
  const countAssign = await assignButtons.count();
  console.log('Assign store buttons:', countAssign);

  // Strategy: select a store with the FIRST select preceding "Assign store" but DO NOT click "Assign store" yet —
  // instead just OBSERVE what request a role-select change triggers. Many SPAs trigger PATCH on select change.
  // We'll change role on a user and see what fires.
  // To avoid touching admin/operator QA accounts: target QA operator user, change role to admin, then back.
  // Actually, this IS a mutation. Manager has not approved this.
  // Safer: search for an existing test user (qa-...) to use, OR don't trigger writes at all.

  // Cleaner: don't write — just inspect the page DOM for forms and their data-attributes/event handlers
  // For an SPA built with RTK Query, the endpoint is usually visible in the bundle. We can grep window.__RTK_QUERY__ keys.

  const rtkInfo = await page.evaluate(() => {
    const out = { keys: [], endpointPatterns: [] };
    try {
      const root = document.getElementById('root');
      // Look for inline script with endpoints
      const html = document.documentElement.outerHTML;
      const matches = html.match(/\/api\/[a-z0-9\/_\-{}:]+/gi) || [];
      out.endpointPatterns = [...new Set(matches)];
    } catch (e) { out.error = e.message; }
    return out;
  });
  fs.writeFileSync(path.resolve(EVI, 'rtk-endpoints-snapshot.json'), JSON.stringify(rtkInfo, null, 2));

  // Also walk the JS bundle and grep for endpoints
  const scripts = await page.evaluate(() => Array.from(document.querySelectorAll('script[src]')).map(s => s.src));
  const allEndpoints = new Set();
  for (const src of scripts) {
    try {
      const resp = await page.request.get(src);
      const text = await resp.text();
      const m = text.match(/\/api\/[a-zA-Z0-9\/_\-{}:?&=]+/g) || [];
      m.forEach(x => allEndpoints.add(x));
    } catch {}
  }
  fs.writeFileSync(path.resolve(EVI, 'js-bundle-endpoints.json'), JSON.stringify([...allEndpoints].sort(), null, 2));

  fs.writeFileSync(REPORT, JSON.stringify({ rtkInfo, traffic }, null, 2));
  console.log('Wrote', REPORT, 'and bundle endpoints.');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
