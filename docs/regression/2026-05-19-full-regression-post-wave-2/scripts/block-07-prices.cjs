/**
 * BLOCK 7 — Prices: inline editing, RUB-only currency, filters, no-price highlight.
 * BUG-REG-027/029 closure check (RUB only).
 */
const H = require('./helpers/common.cjs');
const { chromium, FE, API, QA_ADMIN, sleep, log, shot, shotPath, writeReport, apiLogin } = H;

(async () => {
  const block = 'block-07';
  const report = { startedAt: new Date().toISOString(), scenarios: {} };
  const browser = await chromium.launch({ headless: true });

  const adminCtx = await browser.newContext();
  const adminLogin = await apiLogin(adminCtx, QA_ADMIN);
  const adminCsrf = adminLogin.csrf;
  log('admin login', adminLogin.status);

  // Setup: store + category + product + placement
  let storeId, catId, prodId;
  {
    const sR = await adminCtx.request.post(`${API}/api/stores`, {
      data: { code: `qa-w3-pr-${Date.now()}`, name: 'Wave3 Prices Test', timezone: 'Europe/Moscow' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    storeId = (await sR.json()).store.id;
    const cR = await adminCtx.request.post(`${API}/api/stores/${storeId}/catalog/categories`, {
      data: { name: 'PriceCat', status: 'active' }, headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const cJ = await cR.json();
    catId = cJ.id || cJ.category?.id;
    const plu = String(7800000000000n + BigInt(Math.floor(Math.random() * 1e9))).slice(0, 13);
    const pR = await adminCtx.request.post(`${API}/api/products`, {
      data: { defaultPluCode: plu, name: 'PriceP ' + Date.now(), shortName: 'PP', unit: 'g', status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const pJ = await pR.json();
    prodId = pJ.id || pJ.product?.id;
    await adminCtx.request.post(`${API}/api/stores/${storeId}/catalog/placements`, {
      data: { categoryId: catId, productId: prodId, status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    report.scenarios['7.0_setup'] = { storeId, catId, prodId };
  }

  // === 7.1 List prices — initial (no price set, missingPrice should highlight) ===
  {
    const r = await adminCtx.request.get(`${API}/api/stores/${storeId}/prices`);
    const j = await r.json().catch(() => ({}));
    const arr = j.prices || j.items || (Array.isArray(j) ? j : []);
    const ourRow = arr.find(p => p.productId === prodId);
    report.scenarios['7.1_list_no_price'] = { status: r.status(), count: arr.length, ourRow };
  }

  // === 7.2 Set price (RUB, valid) ===
  {
    const r = await adminCtx.request.put(`${API}/api/stores/${storeId}/prices`, {
      data: { productId: prodId, price: 99.50, currency: 'RUB' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['7.2_set_price_RUB'] = { status: r.status(), price: j.price || j.priceRecord?.price, currency: j.currency || j.priceRecord?.currency };
  }

  // === 7.3 Set price USD — must be rejected (BUG-REG-027) ===
  {
    const r = await adminCtx.request.put(`${API}/api/stores/${storeId}/prices`, {
      data: { productId: prodId, price: 1.5, currency: 'USD' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['7.3_set_price_USD_rejected'] = { status: r.status(), msg: (j.message || '').slice(0, 100) };
  }

  // === 7.4 Set price EUR — rejected ===
  {
    const r = await adminCtx.request.put(`${API}/api/stores/${storeId}/prices`, {
      data: { productId: prodId, price: 1.5, currency: 'EUR' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['7.4_set_price_EUR_rejected'] = { status: r.status(), msg: (j.message || '').slice(0, 100) };
  }

  // === 7.5 Set price without currency — should default to RUB or require? ===
  {
    const r = await adminCtx.request.put(`${API}/api/stores/${storeId}/prices`, {
      data: { productId: prodId, price: 88.25 },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['7.5_set_price_no_currency_default'] = { status: r.status(), currency: j.currency || j.priceRecord?.currency, price: j.price || j.priceRecord?.price };
  }

  // === 7.6 Set price negative ===
  {
    const r = await adminCtx.request.put(`${API}/api/stores/${storeId}/prices`, {
      data: { productId: prodId, price: -10, currency: 'RUB' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['7.6_negative_price'] = { status: r.status(), msg: (j.message || '').slice(0, 100) };
  }

  // === 7.7 Set price NaN / string ===
  {
    const r = await adminCtx.request.put(`${API}/api/stores/${storeId}/prices`, {
      data: { productId: prodId, price: 'not-a-number', currency: 'RUB' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['7.7_NaN_price'] = { status: r.status(), msg: (j.message || '').slice(0, 100) };
  }

  // === 7.8 Set price zero ===
  {
    const r = await adminCtx.request.put(`${API}/api/stores/${storeId}/prices`, {
      data: { productId: prodId, price: 0, currency: 'RUB' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['7.8_zero_price'] = { status: r.status(), msg: (j.message || '').slice(0, 100), price: j.price || j.priceRecord?.price };
  }

  // === 7.9 List with missingPrice filter ===
  {
    const r = await adminCtx.request.get(`${API}/api/stores/${storeId}/prices?missingPrice=true`);
    const j = await r.json().catch(() => ({}));
    const arr = j.prices || j.items || (Array.isArray(j) ? j : []);
    report.scenarios['7.9_list_missing_price'] = { status: r.status(), count: arr.length, missingFlag: arr.every(p => !p.price || p.price === null) };
  }

  // === 7.10 List with category filter ===
  {
    const r = await adminCtx.request.get(`${API}/api/stores/${storeId}/prices?categoryId=${catId}`);
    const j = await r.json().catch(() => ({}));
    const arr = j.prices || j.items || (Array.isArray(j) ? j : []);
    report.scenarios['7.10_list_by_category'] = { status: r.status(), count: arr.length };
  }

  // === 7.11 Set price via :productId PUT (path-based) ===
  {
    const r = await adminCtx.request.put(`${API}/api/stores/${storeId}/prices/${prodId}`, {
      data: { price: 77.77, currency: 'RUB' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['7.11_set_price_via_param'] = { status: r.status(), price: j.price || j.priceRecord?.price };
  }

  // === 7.12 Search by product name ===
  {
    const r = await adminCtx.request.get(`${API}/api/stores/${storeId}/prices?search=PriceP`);
    const j = await r.json().catch(() => ({}));
    const arr = j.prices || j.items || (Array.isArray(j) ? j : []);
    report.scenarios['7.12_search'] = { status: r.status(), count: arr.length };
  }

  // === 7.13 UI: navigate to store prices page (look for RUB symbol only) ===
  {
    const page = await adminCtx.newPage();
    await page.goto(`${FE}/stores/${storeId}/prices`, { waitUntil: 'domcontentloaded' });
    await sleep(3000);
    const body = (await page.locator('body').textContent({ timeout: 2000 }).catch(() => '')) || '';
    await shot(page, shotPath(block, '7-13-prices-ui'));
    report.scenarios['7.13_ui_prices'] = {
      url: page.url(),
      hasRUB: /руб|RUB|₽/i.test(body),
      hasUSD: /\$|USD/i.test(body),
      hasEUR: /€|EUR/i.test(body),
    };
    await page.close();
  }

  await adminCtx.close();
  await browser.close();
  report.finishedAt = new Date().toISOString();
  writeReport(block, report);
  console.log('\n=== BLOCK 7 SUMMARY ===');
  console.log(JSON.stringify(report.scenarios, null, 2));
})();
