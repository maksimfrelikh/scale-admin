/** Admin: open Users & Access → click Create invite → fill dialog → submit. Capture POST endpoint. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://maksimfrelikh.ru';
const QA_PASSWORD = process.env.QA_PASSWORD || (() => { throw new Error('Set QA_PASSWORD') })();
const ADMIN = { email: 'qa-admin@***.invalid', password: QA_PASSWORD };
const EVI = path.resolve(__dirname, '..', 'evidence', 'block-03');
const REPORT = path.resolve(EVI, 'admin-invite-flow.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function login(page, who) {
  await page.goto(TARGET + '/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(who.email);
  await page.locator('input[type="password"]').first().fill(who.password);
  await Promise.all([
    page.waitForURL(/\/(dashboard|stores|$)/, { timeout: 10000 }).catch(() => {}),
    page.locator('button[type="submit"]').first().click(),
  ]);
  await sleep(1500);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  await login(page, ADMIN);

  const reqs = [];
  page.on('request', r => { if (r.url().includes('/api/') && r.method() !== 'GET') reqs.push({ when: Date.now(), m: r.method(), u: r.url(), pd: r.postData() }); });
  page.on('response', async r => { if (r.url().includes('/api/') && r.request().method() !== 'GET') {
    let body = ''; try { body = await r.text(); } catch {}
    reqs.push({ when: Date.now(), respFor: r.url(), s: r.status(), m: r.request().method(), body: (body || '').slice(0, 300) });
  }});

  await page.goto(TARGET + '/dashboard', { waitUntil: 'networkidle' });
  await sleep(1500);
  await page.getByRole('button', { name: /users & access/i }).first().click({ timeout: 4000 });
  await sleep(2000);

  await page.getByRole('button', { name: /create invite/i }).first().click({ timeout: 4000 });
  await sleep(1500);

  // Capture dialog after open
  await page.screenshot({ path: path.resolve(EVI, 'admin-invite-open.png'), fullPage: true });

  // Find inputs in dialog
  const allInputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, select, textarea, button')).map((el, i) => ({
      idx: i, tag: el.tagName, type: el.type, name: el.name, placeholder: el.getAttribute('placeholder'), text: (el.innerText || el.textContent || '').trim().slice(0, 60),
    }));
  });
  fs.writeFileSync(path.resolve(EVI, 'admin-invite-inputs.json'), JSON.stringify(allInputs, null, 2));

  // Try to fill email + role; then click Submit/Create
  const dialog = page.locator('[role="dialog"], .modal, dialog').last();
  const email = `qa-block03-${Date.now()}@example.invalid`;
  try { await dialog.locator('input[type="email"], input[name*="email" i], input[placeholder*="email" i]').first().fill(email); } catch {}
  try { await dialog.locator('select, [role="combobox"]').first().selectOption('operator').catch(()=>{}); } catch {}

  // Click submit
  await page.screenshot({ path: path.resolve(EVI, 'admin-invite-filled.png'), fullPage: true });
  const submitBtn = dialog.getByRole('button', { name: /create|invite|submit|send|пригла/i }).last();
  await submitBtn.click({ timeout: 4000 }).catch(() => {});
  await sleep(3000);
  await page.screenshot({ path: path.resolve(EVI, 'admin-invite-submitted.png'), fullPage: true });

  fs.writeFileSync(REPORT, JSON.stringify({ filledEmail: email, requests: reqs }, null, 2));
  console.log('Wrote', REPORT);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
