/**
 * Quick discovery: find submit button texts on each form route.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const TARGET = 'https://maksimfrelikh.ru';
const QA_PASSWORD = process.env.QA_PASSWORD;
const ADMIN = { email: 'qa-admin@***.invalid', password: QA_PASSWORD };
const OPER_STORE = 'e73ba6bd-abb9-4596-9289-cca474fb2ec1';
const EVI = path.resolve(__dirname, '..', 'evidence', 'block-06');
const out = {};

async function login(page, who) {
  await page.goto(`${TARGET}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(who.email);
  await page.locator('input[type="password"]').first().fill(who.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForResponse(r => r.url().includes('/api/auth/login'), { timeout: 15000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));
}

async function getAllButtons(page) {
  return await page.evaluate(() => {
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return Array.from(document.querySelectorAll('button, a[role="button"]')).filter(visible).map((b, i) => ({
      idx: i,
      text: (b.textContent || '').trim().slice(0, 60),
      type: b.getAttribute('type'),
      ariaLabel: b.getAttribute('aria-label'),
      disabled: b.disabled,
      classes: (b.className || '').toString().slice(0, 80),
      tag: b.tagName.toLowerCase(),
    }));
  });
}

async function main() {
  const br = await chromium.launch({ headless: true });
  const ctx = await br.newContext({ viewport: { width: 1366, height: 1100 } });
  const page = await ctx.newPage();
  await login(page, ADMIN);

  // 1. /dashboard#stores -> click Create store -> get all buttons
  await page.goto(`${TARGET}/dashboard#stores`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));
  await page.locator('button:has-text("Create store")').first().click().catch(() => {});
  await new Promise(r => setTimeout(r, 1500));
  out.storeCreatePage = { url: page.url(), buttons: await getAllButtons(page) };
  await page.screenshot({ path: path.join(EVI, 'discover-store-new.png'), fullPage: true });

  // 2. /dashboard#products -> click Create product
  await page.goto(`${TARGET}/dashboard#products`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));
  await page.locator('button:has-text("Create product")').first().click().catch(() => {});
  await new Promise(r => setTimeout(r, 1500));
  out.productCreatePage = { url: page.url(), buttons: await getAllButtons(page) };
  await page.screenshot({ path: path.join(EVI, 'discover-product-new.png'), fullPage: true });

  // 3. /dashboard#users-access (D Invite is inline)
  await page.goto(`${TARGET}/dashboard#users-access`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));
  out.usersPage = { url: page.url(), buttons: (await getAllButtons(page)).filter(b => /invite|create|приглас/i.test(b.text)).slice(0, 20) };
  await page.screenshot({ path: path.join(EVI, 'discover-users.png'), fullPage: true });

  // 4. store detail -> C, F, G, H
  await page.goto(`${TARGET}/dashboard#store:${OPER_STORE}`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 3000));
  out.storeDetailPage = { url: page.url(), buttons: await getAllButtons(page) };
  await page.screenshot({ path: path.join(EVI, 'discover-store-detail.png'), fullPage: true });

  await br.close();
  fs.writeFileSync(path.join(EVI, 'discover.json'), JSON.stringify(out, null, 2));
  console.log('done');
}

main().catch(e => { console.error(e); process.exit(1); });
