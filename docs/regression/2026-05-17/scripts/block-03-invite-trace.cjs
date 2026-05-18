/** Fill invite form precisely + click Create invite, log POST endpoint+payload+response. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://maksimfrelikh.ru';
const QA_PASSWORD = process.env.QA_PASSWORD || (() => { throw new Error('Set QA_PASSWORD') })();
const ADMIN = { email: 'qa-admin@***.invalid', password: QA_PASSWORD };
const EVI = path.resolve(__dirname, '..', 'evidence', 'block-03');
const REPORT = path.resolve(EVI, 'admin-invite-trace.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

  const traffic = [];
  page.on('request', r => { if (r.url().includes('/api/') && ['POST','PATCH','PUT','DELETE'].includes(r.method())) {
    traffic.push({ kind:'req', m: r.method(), u: r.url(), pd: r.postData() });
  }});
  page.on('response', async r => { if (r.url().includes('/api/') && ['POST','PATCH','PUT','DELETE'].includes(r.request().method())) {
    let body = ''; try { body = await r.text(); } catch {}
    traffic.push({ kind:'resp', m: r.request().method(), u: r.url(), s: r.status(), body: (body || '').slice(0, 400) });
  }});

  // Login
  await page.goto(TARGET + '/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(ADMIN.email);
  await page.locator('input[type="password"]').first().fill(ADMIN.password);
  await Promise.all([
    page.waitForURL(/\/(dashboard|stores|$)/, { timeout: 10000 }).catch(() => {}),
    page.locator('button[type="submit"]').first().click(),
  ]);
  await sleep(1500);

  // Open Users & Access
  await page.getByRole('button', { name: /users & access/i }).first().click();
  await sleep(2000);

  // Find the FIRST email input on the page (which is the invite email per inputs dump idx=9)
  const emailInput = page.locator('input[type="email"]').first();
  const email = `qa-block3-rbac-${Date.now()}@example.invalid`;
  await emailInput.fill(email);
  // The role select - first SELECT after the email input. Use the first SELECT.
  const roleSelect = page.locator('select').first();
  await roleSelect.selectOption('operator').catch(() => {});

  // Click "Create invite" - it's a submit button
  await page.getByRole('button', { name: 'Create invite' }).first().click({ timeout: 5000 });
  await sleep(3000);
  await page.screenshot({ path: path.resolve(EVI, 'admin-invite-after-submit.png'), fullPage: true });

  fs.writeFileSync(REPORT, JSON.stringify({ filledEmail: email, traffic }, null, 2));
  console.log('Wrote', REPORT);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
