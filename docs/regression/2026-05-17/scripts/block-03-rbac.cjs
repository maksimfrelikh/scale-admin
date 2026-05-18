/** BLOCK-03 RBAC — UI checks for B.9 (foreign store URL), C.6 (/users), E (DOM hiding), H (known bugs). */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://maksimfrelikh.ru';
const QA_PASSWORD = process.env.QA_PASSWORD || (() => { throw new Error('Set QA_PASSWORD env (see AGENTS.md §2)'); })();
const ADMIN = { email: 'qa-admin@***.invalid', password: QA_PASSWORD };
const OPER  = { email: 'qa-operator@***.invalid', password: QA_PASSWORD };

const FOREIGN_STORE = 'adc14d18-59b7-43f1-995f-f079c2ef0b96';
const ASSIGNED_STORE = 'e73ba6bd-abb9-4596-9289-cca474fb2ec1';

const EVI = path.resolve(__dirname, '..', 'evidence', 'block-03');
fs.mkdirSync(EVI, { recursive: true });
const REPORT = path.resolve(EVI, 'ui-report.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function login(page, who) {
  await page.goto(TARGET + '/login', { waitUntil: 'domcontentloaded' });
  const emailInput = await page.locator('input[type="email"], input[name="email"]').first();
  await emailInput.fill(who.email);
  const passwordInput = await page.locator('input[type="password"]').first();
  await passwordInput.fill(who.password);
  await Promise.all([
    page.waitForURL(/\/(dashboard|stores|$)/, { timeout: 10000 }).catch(() => {}),
    page.locator('button[type="submit"], button:has-text("Войти"), button:has-text("Sign in")').first().click(),
  ]);
  await sleep(800);
}

async function captureState(page, label) {
  const url = page.url();
  const title = await page.title();
  const h1 = await page.locator('h1').first().textContent({ timeout: 1500 }).catch(() => null);
  const h2 = await page.locator('h2').first().textContent({ timeout: 1500 }).catch(() => null);
  const main = await page.locator('main, [role="main"], #root').first().innerText({ timeout: 1500 }).catch(() => '');
  const screenshot = path.resolve(EVI, `${label}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  return { label, url, title, h1, h2, mainSnippet: (main || '').slice(0, 800), screenshot };
}

async function probeOperatorForeignStore(context, results) {
  const page = await context.newPage();
  const requests = [];
  page.on('response', async r => {
    if (r.url().includes('/api/')) {
      try { requests.push({ url: r.url(), status: r.status(), method: r.request().method() }); } catch {}
    }
  });
  await page.goto(`${TARGET}/stores/${FOREIGN_STORE}`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await sleep(1500);
  const state = await captureState(page, 'B9-operator-foreign-store');
  results.B9 = { ...state, apiCalls: requests.slice(0, 40) };
  await page.close();
}

async function probeOperatorUsersDirect(context, results) {
  const page = await context.newPage();
  await page.goto(`${TARGET}/users`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await sleep(1500);
  const state = await captureState(page, 'C6-operator-users-direct');
  results.C6 = state;
  await page.close();
}

async function probeOperatorDomHiding(context, results) {
  const page = await context.newPage();
  await page.goto(`${TARGET}/dashboard`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await sleep(1200);
  const navLinks = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a, button, [role="menuitem"]'));
    return anchors.map(el => ({
      tag: el.tagName,
      href: el.getAttribute('href') || null,
      text: (el.innerText || el.textContent || '').trim().slice(0, 80),
      hidden: el.hidden || getComputedStyle(el).display === 'none' || getComputedStyle(el).visibility === 'hidden',
      disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
      hasAdminKeyword: /users|access|invite|audit|global log/i.test((el.innerText || el.textContent || '') + ' ' + (el.getAttribute('href') || '')),
    })).filter(item => item.hasAdminKeyword);
  });
  const adminOnlyHidden = navLinks.filter(l => l.hidden || l.disabled);
  results.E1 = { adminKeywordLinks: navLinks, adminKeywordHidden: adminOnlyHidden };
  await page.screenshot({ path: path.resolve(EVI, 'E1-operator-dashboard-dom.png'), fullPage: true });
  await page.close();
}

async function probeOperatorAdminUrls(context, results) {
  const urls = ['/users', '/users/new', '/invites', '/audit-log', '/logs', '/stores/new', `/stores/${FOREIGN_STORE}/edit`, `/stores/${ASSIGNED_STORE}/edit`];
  results.H = {};
  for (const u of urls) {
    const page = await context.newPage();
    const requests = [];
    page.on('response', async r => {
      if (r.url().includes('/api/')) {
        try { requests.push({ url: r.url(), status: r.status() }); } catch {}
      }
    });
    await page.goto(TARGET + u, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    await sleep(1200);
    const state = await captureState(page, `H-operator${u.replace(/[\/]/g, '_')}`);
    results.H[u] = { ...state, apiCalls: requests.slice(0, 20) };
    await page.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const results = {};

  // Login as operator and run all operator-side UI probes in this context
  const loginPage = await context.newPage();
  await login(loginPage, OPER);
  results.loginState = await captureState(loginPage, 'operator-after-login');
  await loginPage.close();

  await probeOperatorForeignStore(context, results);
  await probeOperatorUsersDirect(context, results);
  await probeOperatorDomHiding(context, results);
  await probeOperatorAdminUrls(context, results);

  fs.writeFileSync(REPORT, JSON.stringify(results, null, 2));
  console.log('Wrote', REPORT);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
