/**
 * BLOCK-06 reconnaissance — round 2.
 * Open each form by clicking the actual trigger and dump full DOM state.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://maksimfrelikh.ru';
const QA_PASSWORD = process.env.QA_PASSWORD;
const ADMIN = { email: 'qa-admin@***.invalid', password: QA_PASSWORD };
const OPER_STORE = 'e73ba6bd-abb9-4596-9289-cca474fb2ec1';
const EVI = path.resolve(__dirname, '..', 'evidence', 'block-06');
fs.mkdirSync(EVI, { recursive: true });
const REPORT = path.join(EVI, 'recon-2.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toISOString().slice(11, 23);
const out = { startedAt: new Date().toISOString() };
const log = (k, v) => { console.log(`[${ts()}] ${k}`, typeof v === 'object' ? JSON.stringify(v).slice(0, 300) : v); };

async function shot(page, name) {
  const p = path.join(EVI, `recon2-${name}.png`);
  await page.screenshot({ path: p, fullPage: false }).catch(() => {});
  return path.basename(p);
}

async function dumpVisibleInputs(page) {
  return await page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    return Array.from(document.querySelectorAll('input, textarea, select')).filter(visible).map(el => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || '',
      name: el.getAttribute('name') || '',
      id: el.id || '',
      placeholder: el.getAttribute('placeholder') || '',
      required: el.hasAttribute('required'),
      ariaLabel: el.getAttribute('aria-label') || '',
      labelText: (() => {
        const id = el.id;
        if (id) {
          const lbl = document.querySelector(`label[for="${id}"]`);
          if (lbl) return (lbl.textContent || '').trim().slice(0, 60);
        }
        const lbl = el.closest('label');
        return lbl ? (lbl.textContent || '').trim().slice(0, 60) : '';
      })(),
      value: el.value || '',
      maxLength: el.maxLength === -1 ? null : el.maxLength,
      pattern: el.getAttribute('pattern') || '',
      min: el.getAttribute('min') || '',
      max: el.getAttribute('max') || '',
      step: el.getAttribute('step') || '',
    }));
  });
}

async function dumpDialogs(page) {
  return await page.evaluate(() => {
    const find = (sel) => Array.from(document.querySelectorAll(sel)).filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 50 && r.height > 50;
    }).map(el => ({
      sel,
      role: el.getAttribute('role'),
      tag: el.tagName.toLowerCase(),
      classes: el.className.toString().slice(0, 120),
      headingText: (el.querySelector('h1,h2,h3')?.textContent || '').trim().slice(0, 100),
      textSnip: (el.textContent || '').replace(/\s+/g, ' ').slice(0, 240),
    }));
    return {
      roleDialog: find('[role="dialog"]'),
      ariaModal: find('[aria-modal="true"]'),
      fixedOverlay: find('div[class*="modal" i], div[class*="dialog" i], div[class*="overlay" i]'),
      bodyChildren: Array.from(document.body.children).map(c => ({ tag: c.tagName.toLowerCase(), id: c.id, classes: c.className.toString().slice(0, 80) })),
    };
  });
}

async function login(page, who) {
  await page.goto(`${TARGET}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name="email"]').first().fill(who.email);
  await page.locator('input[type="password"]').first().fill(who.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForResponse(r => r.url().includes('/api/auth/login') && r.status() === 200, { timeout: 15000 }).catch(() => {});
  await sleep(1500);
}

async function clickThenDump(page, btnSelector, name) {
  const before = await dumpVisibleInputs(page);
  const btn = page.locator(btnSelector).first();
  if (await btn.count() === 0) {
    return { name, error: 'btn-not-found' };
  }
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await btn.click({ force: false }).catch(e => log(`${name} click err`, e.message));
  await sleep(1500);
  const after = await dumpVisibleInputs(page);
  const dialogs = await dumpDialogs(page);
  const screenshot = await shot(page, name);
  return { name, beforeInputs: before.length, afterInputs: after.length, newInputs: after.filter(a => !before.some(b => b.placeholder === a.placeholder && b.type === a.type && b.labelText === a.labelText)), dialogs, screenshot };
}

async function main() {
  const br = await chromium.launch({ headless: true });
  const ctx = await br.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await login(page, ADMIN);
  out.adminDashboardURL = page.url();

  // --- A. Store create
  await page.goto(`${TARGET}/dashboard#stores`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  out.storeCreate = await clickThenDump(page, 'button:has-text("Create store")', 'A-store-create');
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(500);

  // --- A2. Store edit (first row)
  await page.goto(`${TARGET}/dashboard#stores`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  out.storeEdit = await clickThenDump(page, 'table tbody tr button:has-text("Edit"), tr button:has-text("Edit")', 'A-store-edit');
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(500);

  // --- B. Product create
  await page.goto(`${TARGET}/dashboard#products`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  out.productCreate = await clickThenDump(page, 'button:has-text("Create product")', 'B-product-create');
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(500);

  // --- D. Invite (Users & Access)
  await page.goto(`${TARGET}/dashboard#users-access`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  out.invite = await clickThenDump(page, 'button:has-text("Create invite")', 'D-invite-create');
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(500);

  // --- store detail forms (Scale, Category, Edit store, Banner)
  await page.goto(`${TARGET}/dashboard#store:${OPER_STORE}`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await shot(page, 'storeDetail-loaded');

  // Edit store
  out.editStore = await clickThenDump(page, 'button:has-text("Edit store")', 'A-edit-store');
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(500);

  // Re-navigate (Escape may close section)
  await page.goto(`${TARGET}/dashboard#store:${OPER_STORE}`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);

  // Category create root
  out.categoryCreate = await clickThenDump(page, 'button:has-text("Create root category")', 'C-category-create');
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(500);

  await page.goto(`${TARGET}/dashboard#store:${OPER_STORE}`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);

  // Scale register
  out.scaleRegister = await clickThenDump(page, 'button:has-text("Register device")', 'F-scale-register');
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(500);

  await page.goto(`${TARGET}/dashboard#store:${OPER_STORE}`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);

  // Banners — need to find upload trigger. After Refresh banners click, list might show + Add button
  out.bannerArea = {
    visibleBeforeRefresh: await dumpVisibleInputs(page),
    sectionText: await page.evaluate(() => {
      const sections = Array.from(document.querySelectorAll('section, article, div'));
      const s = sections.find(el => /banner|реклам/i.test(el.textContent || ''));
      return s ? (s.textContent || '').replace(/\s+/g, ' ').slice(0, 1500) : null;
    }),
  };
  // Try clicking on Refresh banners then look for an "Upload" button
  await page.locator('button:has-text("Refresh banners")').first().click().catch(() => {});
  await sleep(2000);
  await shot(page, 'G-banner-after-refresh');
  out.bannerButtons = await page.evaluate(() => {
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return Array.from(document.querySelectorAll('button')).filter(visible).map(b => (b.textContent || '').trim()).filter(Boolean);
  });
  // Try to click Upload/Add banner
  out.bannerUpload = await clickThenDump(page, 'button:has-text("Upload"), button:has-text("Add banner"), button:has-text("Загрузить"), button:has-text("Добавить баннер"), button:has-text("New banner")', 'G-banner-upload');

  // Prices inline — find edit trigger
  await page.goto(`${TARGET}/dashboard#store:${OPER_STORE}`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  out.pricesArea = await page.evaluate(() => {
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const inputs = Array.from(document.querySelectorAll('input')).filter(visible).map(el => ({
      type: el.type, placeholder: el.placeholder, ariaLabel: el.getAttribute('aria-label') || '',
      readonly: el.readOnly, disabled: el.disabled,
    }));
    const priceSection = Array.from(document.querySelectorAll('section, div')).find(el => /price tab|prices tab|prices\b/i.test((el.textContent || '').slice(0, 200)));
    return { inputs, priceSectionText: priceSection ? (priceSection.textContent || '').replace(/\s+/g, ' ').slice(0, 1000) : null };
  });
  await page.locator('button:has-text("Refresh prices")').first().click().catch(() => {});
  await sleep(2500);
  await shot(page, 'H-prices-after-refresh');
  out.pricesAfterRefresh = await page.evaluate(() => {
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const inputs = Array.from(document.querySelectorAll('input, [contenteditable]')).filter(visible).map(el => ({
      tag: el.tagName.toLowerCase(),
      type: el.tagName === 'INPUT' ? el.type : 'contenteditable',
      placeholder: el.getAttribute('placeholder') || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      readonly: el.readOnly || el.getAttribute('contenteditable') === 'false',
      disabled: el.disabled,
      value: el.value || (el.textContent || '').slice(0, 30),
    }));
    return { inputs };
  });

  await br.close();

  out.endedAt = new Date().toISOString();
  fs.writeFileSync(REPORT, JSON.stringify(out, null, 2));
  console.log('Report saved:', REPORT);
}

main().catch(e => { console.error(e); process.exit(1); });
