const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const EV = '/home/clawd/projects/scale-admin-test/docs/regression/2026-05-17/evidence/wave-1-verify';
const BASE = 'http://localhost:5174';

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`console:${m.type()} ${m.text()}`); });

  // UI1: login
  log('UI1: goto + login');
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="email"]', { timeout: 15000 });
  await page.fill('input[name="email"]', 'admin@example.com');
  await page.fill('input[name="password"]', 'admin12345');
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST'),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForSelector('nav.app-nav', { timeout: 10000 });
  log('UI1: login OK, nav visible');

  // UI2: Stores → STORE-001 → Details
  await page.click('nav.app-nav >> button:has-text("Stores")');
  await page.waitForSelector('.store-card', { timeout: 10000 });
  const storeCard = page.locator('.store-card', { has: page.locator('p.store-code:text("STORE-001")') });
  await storeCard.locator('button:has-text("Details")').first().click();
  await page.waitForSelector('section.prices-tab', { timeout: 10000 });
  log('UI2: store-details visible (Prices tab present)');

  // Wait for Apples row to load (product.name = "Apples Red Weighted", PLU 1001)
  const APPLES_NAME = 'Apples Red Weighted';
  await page.waitForFunction(
    (name) => Array.from(document.querySelectorAll('.price-row strong')).some((el) => (el.textContent || '').includes(name)),
    APPLES_NAME,
    { timeout: 20000 }
  );
  const applesRow = page.locator('tr.price-row', { has: page.locator(`strong:has-text("${APPLES_NAME}")`) });
  await applesRow.scrollIntoViewIfNeeded();

  // UI3: select disabled + only RUB option
  const currencySelect = applesRow.locator(`select[aria-label="Currency for ${APPLES_NAME}"]`);
  const isDisabled = await currencySelect.evaluate((el) => el.disabled);
  const selectedValue = await currencySelect.evaluate((el) => el.value);
  const optionValues = await currencySelect.locator('option').evaluateAll((els) => els.map((e) => e.value));
  const optionTexts = await currencySelect.locator('option').allTextContents();
  log(`UI3: disabled=${isDisabled} selected=${selectedValue} options=${JSON.stringify(optionValues)} text=${JSON.stringify(optionTexts)}`);
  fs.writeFileSync(
    path.join(EV, 'UI3-select-attrs.txt'),
    [
      `aria-label: Currency for ${APPLES_NAME}`,
      `disabled: ${isDisabled}`,
      `selected value: ${selectedValue}`,
      `option values: ${JSON.stringify(optionValues)}`,
      `option text: ${JSON.stringify(optionTexts)}`,
    ].join('\n') + '\n'
  );
  await applesRow.screenshot({ path: path.join(EV, 'UI3.png') });

  // UI4: Save price=11, capture PUT body, ensure currency=RUB
  const ui4Requests = [];
  const ui4Listener = (req) => {
    if (/\/api\/stores\/.+\/prices\/.+/.test(req.url()) && req.method() === 'PUT') {
      ui4Requests.push({ url: req.url(), method: req.method(), postData: req.postData() });
    }
  };
  page.on('request', ui4Listener);
  await applesRow.locator(`input[aria-label="Price for ${APPLES_NAME}"]`).fill('11');
  const [ui4Resp] = await Promise.all([
    page.waitForResponse((r) => /\/prices\//.test(r.url()) && r.request().method() === 'PUT', { timeout: 15000 }),
    applesRow.locator('button:has-text("Save")').click(),
  ]);
  await page.waitForTimeout(400);
  page.off('request', ui4Listener);

  const ui4RespBody = await ui4Resp.json().catch(() => null);
  fs.writeFileSync(
    path.join(EV, 'UI4-network.json'),
    JSON.stringify(
      {
        requests: ui4Requests,
        response: { status: ui4Resp.status(), body: ui4RespBody },
      },
      null,
      2
    )
  );
  log(`UI4: PUT body=${ui4Requests[0]?.postData} resp.status=${ui4Resp.status()}`);
  await applesRow.screenshot({ path: path.join(EV, 'UI4-network.png') });

  // UI5: intercept PUT, rewrite body currency=USD, expect 400 + inline error
  const ui5Requests = [];
  await page.route('**/api/stores/*/prices/*', async (route) => {
    const req = route.request();
    if (req.method() === 'PUT') {
      let orig;
      try { orig = JSON.parse(req.postData() || '{}'); } catch { orig = {}; }
      const modified = { ...orig, currency: 'USD' };
      ui5Requests.push({ original: orig, modified });
      await route.continue({ postData: JSON.stringify(modified) });
    } else {
      await route.continue();
    }
  });

  // need to dirty form
  await applesRow.locator(`input[aria-label="Price for ${APPLES_NAME}"]`).fill('12');
  const [ui5Resp] = await Promise.all([
    page.waitForResponse((r) => /\/prices\//.test(r.url()) && r.request().method() === 'PUT', { timeout: 15000 }),
    applesRow.locator('button:has-text("Save")').click(),
  ]);
  await page.waitForTimeout(800);

  const ui5RespBody = await ui5Resp.json().catch(() => null);
  let inlineErr = '';
  const errLoc = applesRow.locator('.inline-error');
  if ((await errLoc.count()) > 0) {
    inlineErr = (await errLoc.first().textContent()) || '';
  }
  fs.writeFileSync(
    path.join(EV, 'UI5-error.json'),
    JSON.stringify(
      {
        intercept: ui5Requests,
        response: { status: ui5Resp.status(), body: ui5RespBody },
        inlineErrorText: inlineErr,
      },
      null,
      2
    )
  );
  log(`UI5: intercept body→USD resp.status=${ui5Resp.status()} inlineErr="${inlineErr}"`);
  await applesRow.screenshot({ path: path.join(EV, 'UI5-error.png') });

  fs.writeFileSync(path.join(EV, 'UI-page-errors.log'), consoleErrors.join('\n') || '(none)\n');

  await browser.close();
  log('DONE');
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
