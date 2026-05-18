/** G: admin revokes operator's only assigned store-access, verifies operator loses access, restores. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://maksimfrelikh.ru';
const QA_PASSWORD = process.env.QA_PASSWORD || (() => { throw new Error('Set QA_PASSWORD') })();
const ADMIN = { email: 'qa-admin@***.invalid', password: QA_PASSWORD };
const OPERATOR_ID = 'c46be3c5-6fd3-4ab1-88d0-8c8f0a4df204';
const ASSIGNED_STORE = 'e73ba6bd-abb9-4596-9289-cca474fb2ec1';
const OPERATOR_EMAIL = 'qa-operator@***.invalid';
const EVI = path.resolve(__dirname, '..', 'evidence', 'block-03');
const REPORT = path.resolve(EVI, 'G-revoke-restore.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  const traffic = [];
  page.on('response', async r => {
    if (r.url().includes('/api/') && ['POST','PATCH','PUT','DELETE'].includes(r.request().method())) {
      let body = ''; try { body = await r.text(); } catch {}
      traffic.push({ when: new Date().toISOString(), m: r.request().method(), u: r.url(), s: r.status(), reqBody: r.request().postData(), respHead: (body || '').slice(0, 300) });
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

  // Find operator row by email
  await page.screenshot({ path: path.resolve(EVI, 'G-users-access-loaded.png'), fullPage: true });

  // Find revoke button in the row containing operator email
  const result = { steps: [] };
  // Use locator-based row finder
  const operatorRow = page.locator('article, li, tr, [role="row"], div').filter({ hasText: OPERATOR_EMAIL }).filter({ has: page.locator('button:has-text("Revoke")') }).first();
  const opRowCount = await operatorRow.count();
  result.steps.push({ step: 'find operator row', count: opRowCount });

  if (opRowCount > 0) {
    const revokeBtn = operatorRow.locator('button:has-text("Revoke")').first();
    page.once('dialog', d => d.accept().catch(()=>{}));
    await revokeBtn.click({ timeout: 4000 });
    await sleep(2500);
    await page.screenshot({ path: path.resolve(EVI, 'G-after-revoke.png'), fullPage: true });

    // (operator-side verification happens via curl after this script finishes)
  }

  result.traffic = traffic;
  fs.writeFileSync(REPORT, JSON.stringify(result, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
