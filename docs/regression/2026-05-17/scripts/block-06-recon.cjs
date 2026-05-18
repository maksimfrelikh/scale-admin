/**
 * BLOCK-06 reconnaissance.
 * Discover all forms in the admin/operator UI:
 *  - A Store create/edit
 *  - B Product create/edit
 *  - C Category create/edit
 *  - D User invite
 *  - E Password reset
 *  - F Scale register/edit
 *  - G Banner upload
 *  - H Price inline edit
 * Capture screenshots, locator strategies, dialog open/close, field names.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://maksimfrelikh.ru';
const QA_PASSWORD = process.env.QA_PASSWORD || (() => { throw new Error('Set QA_PASSWORD'); })();
const ADMIN = { email: 'qa-admin@***.invalid', password: QA_PASSWORD };
const OPER  = { email: 'qa-operator@***.invalid', password: QA_PASSWORD };
const OPER_STORE = 'e73ba6bd-abb9-4596-9289-cca474fb2ec1';
const EVI = path.resolve(__dirname, '..', 'evidence', 'block-06');
fs.mkdirSync(EVI, { recursive: true });
const REPORT = path.join(EVI, 'recon.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toISOString().slice(11, 23);
const out = { startedAt: new Date().toISOString(), admin: {}, operator: {} };
const log = (k, v) => { console.log(`[${ts()}] ${k}`, typeof v === 'object' ? JSON.stringify(v).slice(0, 400) : v); };

async function shot(page, name) {
  const p = path.join(EVI, `recon-${name}.png`);
  await page.screenshot({ path: p, fullPage: false }).catch(() => {});
  return path.basename(p);
}

async function login(page, who) {
  await page.goto(`${TARGET}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name="email"]').first().fill(who.email);
  await page.locator('input[type="password"]').first().fill(who.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForResponse(r => r.url().includes('/api/auth/login') && r.status() === 200, { timeout: 15000 }).catch(() => {});
  await sleep(1500);
}

async function probeForms(page, label) {
  const data = {};
  // collect text of all buttons that could open a form
  const allButtonsText = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => (b.textContent || '').trim()).filter(Boolean));
  data.allButtonsText = allButtonsText.slice(0, 200);
  // inputs visible
  const inputs = await page.evaluate(() => Array.from(document.querySelectorAll('input,textarea,select')).map(el => ({
    tag: el.tagName.toLowerCase(),
    type: el.getAttribute('type') || '',
    name: el.getAttribute('name') || '',
    id: el.id || '',
    placeholder: el.getAttribute('placeholder') || '',
    required: el.hasAttribute('required'),
  })));
  data.inputs = inputs;
  return data;
}

async function exploreHashOnAdmin(page, hash) {
  await page.goto(`${TARGET}/dashboard${hash}`, { waitUntil: 'domcontentloaded' });
  await sleep(2000);
  const url = page.url();
  const h1 = (await page.locator('h1').first().textContent({ timeout: 1500 }).catch(() => '') || '').trim();
  const probe = await probeForms(page, hash);
  return { hash, url, h1, ...probe };
}

async function main() {
  // ===== ADMIN =====
  const br = await chromium.launch({ headless: true });
  const ctx = await br.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  // capture login form too (E reset link discovery)
  await page.goto(`${TARGET}/login`, { waitUntil: 'domcontentloaded' });
  await sleep(1000);
  out.admin.loginPage = {
    screenshot: await shot(page, 'admin-00-login'),
    bodyText: (await page.locator('body').textContent({ timeout: 2000 }).catch(() => '') || '').replace(/\s+/g, ' ').slice(0, 1500),
    forgotLink: await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('a,button')).find(el => /forgot|reset|сброс|восстановить|пароль/i.test((el.textContent || '')));
      return a ? { text: (a.textContent || '').trim(), href: a.getAttribute('href') } : null;
    }),
  };
  log('admin login page', out.admin.loginPage);
  // Try direct password reset paths
  const resetPaths = ['/forgot-password', '/reset-password', '/password-reset', '/auth/forgot', '/auth/reset'];
  out.admin.resetPathProbe = {};
  for (const p of resetPaths) {
    await page.goto(`${TARGET}${p}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(1000);
    out.admin.resetPathProbe[p] = {
      url: page.url(),
      h1: (await page.locator('h1').first().textContent({ timeout: 800 }).catch(() => '') || '').trim(),
      inputs: await page.evaluate(() => Array.from(document.querySelectorAll('input')).map(el => ({ type: el.type, name: el.name, placeholder: el.placeholder }))),
    };
  }
  log('reset path probe', out.admin.resetPathProbe);
  await shot(page, 'admin-01-resetpath-last');

  await login(page, ADMIN);
  await shot(page, 'admin-02-dashboard');

  // Stores list
  out.admin.stores = await exploreHashOnAdmin(page, '#stores');
  await shot(page, 'admin-03-stores');
  // Try opening Create store dialog
  const createStoreBtn = await page.locator('button:has-text("Create store"), button:has-text("Создать магазин"), button:has-text("Новый магазин")').first();
  if (await createStoreBtn.count()) {
    await createStoreBtn.click().catch(() => {});
    await sleep(1200);
    out.admin.storeCreate = {
      inputs: await page.evaluate(() => Array.from(document.querySelectorAll('[role="dialog"] input, [role="dialog"] textarea, [role="dialog"] select')).map(el => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || '',
        name: el.getAttribute('name') || '',
        placeholder: el.getAttribute('placeholder') || '',
        required: el.hasAttribute('required'),
      }))),
      dialogText: (await page.locator('[role="dialog"]').first().textContent({ timeout: 1500 }).catch(() => '') || '').replace(/\s+/g, ' ').slice(0, 800),
      buttons: await page.evaluate(() => Array.from(document.querySelectorAll('[role="dialog"] button')).map(b => (b.textContent || '').trim()).filter(Boolean)),
    };
    await shot(page, 'admin-04-store-create-dialog');
    // close
    const cancel = await page.locator('[role="dialog"] button:has-text("Cancel"), [role="dialog"] button:has-text("Отмена"), [role="dialog"] button:has-text("Закрыть"), [role="dialog"] [aria-label="Close"]').first();
    if (await cancel.count()) await cancel.click().catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(500);
  }

  // Products list
  out.admin.products = await exploreHashOnAdmin(page, '#products');
  await shot(page, 'admin-05-products');
  const createProductBtn = await page.locator('button:has-text("Create product"), button:has-text("Создать продукт"), button:has-text("Новый товар"), button:has-text("Добавить")').first();
  if (await createProductBtn.count()) {
    await createProductBtn.click().catch(() => {});
    await sleep(1200);
    out.admin.productCreate = {
      inputs: await page.evaluate(() => Array.from(document.querySelectorAll('[role="dialog"] input, [role="dialog"] textarea, [role="dialog"] select')).map(el => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || '',
        name: el.getAttribute('name') || '',
        placeholder: el.getAttribute('placeholder') || '',
        required: el.hasAttribute('required'),
      }))),
      dialogText: (await page.locator('[role="dialog"]').first().textContent({ timeout: 1500 }).catch(() => '') || '').replace(/\s+/g, ' ').slice(0, 800),
      buttons: await page.evaluate(() => Array.from(document.querySelectorAll('[role="dialog"] button')).map(b => (b.textContent || '').trim()).filter(Boolean)),
    };
    await shot(page, 'admin-06-product-create-dialog');
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(500);
  }

  // Users access (invite + admin form D)
  out.admin.users = await exploreHashOnAdmin(page, '#users-access');
  await shot(page, 'admin-07-users');
  const inviteBtn = await page.locator('button:has-text("Invite"), button:has-text("Пригласить"), button:has-text("Add user")').first();
  if (await inviteBtn.count()) {
    await inviteBtn.click().catch(() => {});
    await sleep(1200);
    out.admin.invite = {
      inputs: await page.evaluate(() => Array.from(document.querySelectorAll('[role="dialog"] input, [role="dialog"] textarea, [role="dialog"] select')).map(el => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || '',
        name: el.getAttribute('name') || '',
        placeholder: el.getAttribute('placeholder') || '',
        required: el.hasAttribute('required'),
      }))),
      dialogText: (await page.locator('[role="dialog"]').first().textContent({ timeout: 1500 }).catch(() => '') || '').replace(/\s+/g, ' ').slice(0, 800),
      buttons: await page.evaluate(() => Array.from(document.querySelectorAll('[role="dialog"] button')).map(b => (b.textContent || '').trim()).filter(Boolean)),
    };
    await shot(page, 'admin-08-invite-dialog');
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(500);
  }

  // Open store-detail to find Scale / Banner / Price / Category forms
  await page.goto(`${TARGET}/dashboard#store:${OPER_STORE}`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await shot(page, 'admin-09-store-detail');
  out.admin.storeDetail = {
    url: page.url(),
    h1: (await page.locator('h1').first().textContent({ timeout: 1500 }).catch(() => '') || '').trim(),
    bodyText: (await page.locator('body').textContent({ timeout: 2000 }).catch(() => '') || '').replace(/\s+/g, ' ').slice(0, 1500),
    tabs: await page.evaluate(() => Array.from(document.querySelectorAll('[role="tab"], button[aria-selected], a[role="tab"]')).map(t => (t.textContent || '').trim()).filter(Boolean)),
    allButtons: await page.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => (b.textContent || '').trim()).filter(Boolean).slice(0, 100)),
  };
  log('admin storeDetail tabs', out.admin.storeDetail.tabs);

  // Try to find tab clicks for: scales, advertising/banners, prices, catalog/categories
  const tryTabClicks = ['Scales', 'Весы', 'Banner', 'Баннер', 'Advertising', 'Реклам', 'Prices', 'Цены', 'Catalog', 'Каталог', 'Categor', 'Категор'];
  out.admin.tabExplore = [];
  for (const text of tryTabClicks) {
    const tab = await page.locator(`button:has-text("${text}"), a:has-text("${text}"), [role="tab"]:has-text("${text}")`).first();
    const count = await tab.count();
    if (count) {
      await tab.click().catch(() => {});
      await sleep(1200);
      const snap = {
        clicked: text,
        url: page.url(),
        screenshot: await shot(page, `admin-10-tab-${text.replace(/[^A-Za-z]/g, '')}`),
        h2: (await page.locator('h2').first().textContent({ timeout: 800 }).catch(() => '') || '').trim(),
        sectionButtons: await page.evaluate(() => Array.from(document.querySelectorAll('main button, [role="tabpanel"] button')).map(b => (b.textContent || '').trim()).filter(Boolean).slice(0, 30)),
        bodyExcerpt: (await page.locator('body').textContent({ timeout: 1200 }).catch(() => '') || '').replace(/\s+/g, ' ').slice(0, 500),
      };
      out.admin.tabExplore.push(snap);
    }
  }

  await br.close();

  // ===== OPERATOR =====
  const br2 = await chromium.launch({ headless: true });
  const ctx2 = await br2.newContext({ viewport: { width: 1366, height: 768 } });
  const page2 = await ctx2.newPage();
  await login(page2, OPER);
  await shot(page2, 'op-01-dashboard');
  out.operator.dashboard = {
    h1: (await page2.locator('h1').first().textContent({ timeout: 1500 }).catch(() => '') || '').trim(),
  };
  out.operator.products = await exploreHashOnAdmin(page2, '#products');
  await shot(page2, 'op-02-products');
  await page2.goto(`${TARGET}/dashboard#store:${OPER_STORE}`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await shot(page2, 'op-03-store-detail');
  out.operator.storeDetail = {
    h1: (await page2.locator('h1').first().textContent({ timeout: 1500 }).catch(() => '') || '').trim(),
    tabs: await page2.evaluate(() => Array.from(document.querySelectorAll('[role="tab"], button[aria-selected], a[role="tab"]')).map(t => (t.textContent || '').trim()).filter(Boolean)),
    allButtons: await page2.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => (b.textContent || '').trim()).filter(Boolean).slice(0, 100)),
  };
  await br2.close();

  out.endedAt = new Date().toISOString();
  fs.writeFileSync(REPORT, JSON.stringify(out, null, 2));
  console.log('Report saved:', REPORT);
}

main().catch(e => { console.error(e); process.exit(1); });
