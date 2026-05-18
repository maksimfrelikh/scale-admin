/** Find and revoke the test invite. Captures full Users & Access html + invite-revoke API trace. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://maksimfrelikh.ru';
const QA_PASSWORD = process.env.QA_PASSWORD || (() => { throw new Error('Set QA_PASSWORD') })();
const ADMIN = { email: 'qa-admin@***.invalid', password: QA_PASSWORD };
const EVI = path.resolve(__dirname, '..', 'evidence', 'block-03');
const TEST_EMAIL = 'qa-block3-rbac-1779046499156@example.invalid';

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  const traffic = [];
  page.on('response', async r => {
    if (r.url().includes('/api/')) {
      let body = ''; try { body = await r.text(); } catch {}
      traffic.push({ m: r.request().method(), u: r.url(), s: r.status(), bodyHead: (body || '').slice(0, 250) });
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

  const fullText = await page.locator('main, [role="main"], #root').first().innerText().catch(() => '');
  fs.writeFileSync(path.resolve(EVI, 'admin-users-access-full.txt'), fullText);
  fs.writeFileSync(path.resolve(EVI, 'admin-users-access-html.html'), await page.content());

  // Try to find the row containing test email and revoke
  const found = await page.getByText(TEST_EMAIL, { exact: false }).count();
  console.log('rows mentioning test email:', found);

  let revoked = false;
  if (found > 0) {
    // Try to click a Revoke/Cancel near that email
    const row = page.locator(`*:has-text("${TEST_EMAIL}")`).last();
    await page.screenshot({ path: path.resolve(EVI, 'invite-row-before-revoke.png'), fullPage: true });
    // The revoke could be Cancel / Revoke / Delete / X near the row
    const buttons = ['revoke','cancel','delete','remove','отмен','удал','отозв'];
    for (const t of buttons) {
      try {
        const btn = row.locator(`button:has-text("${t}"), a:has-text("${t}")`).first();
        if (await btn.count() > 0) {
          page.once('dialog', d => d.accept().catch(() => {}));
          await btn.click({ timeout: 3000 });
          await sleep(2000);
          revoked = true;
          break;
        }
      } catch {}
    }
  }
  await page.screenshot({ path: path.resolve(EVI, 'after-revoke-attempt.png'), fullPage: true });
  fs.writeFileSync(path.resolve(EVI, 'admin-invite-revoke-trace.json'), JSON.stringify({ revoked, traffic: traffic.slice(-40) }, null, 2));
  console.log('Wrote trace, revoked=', revoked);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
