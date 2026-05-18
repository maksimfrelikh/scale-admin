/** Click admin "Global Logs" + open invite/add user dialogs, capture API. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://maksimfrelikh.ru';
const QA_PASSWORD = process.env.QA_PASSWORD || (() => { throw new Error('Set QA_PASSWORD') })();
const ADMIN = { email: 'qa-admin@***.invalid', password: QA_PASSWORD };
const EVI = path.resolve(__dirname, '..', 'evidence', 'block-03');
const REPORT = path.resolve(EVI, 'admin-globallogs.json');

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

  const apiCalls = [];
  page.on('response', async r => {
    if (r.url().includes('/api/')) {
      try { apiCalls.push({ ts: Date.now(), m: r.request().method(), u: r.url(), s: r.status() }); } catch {}
    }
  });

  await page.goto(TARGET + '/dashboard', { waitUntil: 'networkidle' });
  await sleep(1500);

  const results = { steps: [] };

  // Click "Global Logs" button
  const beforeGL = apiCalls.length;
  await page.getByRole('button', { name: /global logs/i }).first().click({ timeout: 4000 }).catch(() => {});
  await sleep(2500);
  results.steps.push({ step: 'click Global Logs', after: page.url(), h1: await page.locator('h1').first().textContent().catch(()=>null), h2: await page.locator('h2').first().textContent().catch(()=>null), apiCalls: apiCalls.slice(beforeGL).map(c => ({m: c.m, u: c.u, s: c.s})) });
  await page.screenshot({ path: path.resolve(EVI, 'admin-globallogs-after-click.png'), fullPage: true });

  // Inspect Global Logs panel content
  const glText = await page.locator('main, [role="main"], #root').first().innerText().catch(()=>'');
  results.globalLogsSnippet = (glText || '').slice(0, 1200);

  // Go to Users & Access
  await page.goto(TARGET + '/dashboard', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /users & access/i }).first().click({ timeout: 4000 }).catch(() => {});
  await sleep(2500);

  // Find invite-related buttons/inputs
  const inviteUI = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('button, [role="button"], a').forEach(el => {
      const t = (el.innerText || el.textContent || '').trim();
      if (/invite|пригла|add user|create user|new user/i.test(t) && t.length < 80) {
        out.push({ tag: el.tagName, text: t, href: el.getAttribute('href') });
      }
    });
    return out;
  });
  results.inviteUI = inviteUI;
  await page.screenshot({ path: path.resolve(EVI, 'admin-users-access.png'), fullPage: true });

  // Click invite button if present
  const beforeInvite = apiCalls.length;
  const inviteBtn = page.getByRole('button', { name: /invite|пригла|add user|create user|new user/i }).first();
  if (await inviteBtn.count()) {
    await inviteBtn.click({ timeout: 3000 }).catch(() => {});
    await sleep(1500);
    await page.screenshot({ path: path.resolve(EVI, 'admin-invite-dialog.png'), fullPage: true });
    // capture dialog text/fields
    const dialogText = await page.locator('[role="dialog"], .modal, dialog').first().innerText({ timeout: 2000 }).catch(() => '');
    results.inviteDialogSnippet = (dialogText || '').slice(0, 600);
  }

  results.allApiCalls = apiCalls.map(c => ({m: c.m, u: c.u, s: c.s}));
  fs.writeFileSync(REPORT, JSON.stringify(results, null, 2));
  console.log('Wrote', REPORT);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
