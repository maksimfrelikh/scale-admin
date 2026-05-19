/**
 * BLOCK 4 — Products master catalog.
 * Coverage: list, search, status filter, create, validation, archive cascade.
 */
const H = require('./helpers/common.cjs');
const { chromium, FE, API, QA_ADMIN, QA_OP, sleep, log, uiState, uiLogin, shot, shotPath, writeReport, apiLogin } = H;

(async () => {
  const block = 'block-04';
  const report = { startedAt: new Date().toISOString(), scenarios: {} };
  const browser = await chromium.launch({ headless: true });

  const adminCtx = await browser.newContext();
  const adminLogin = await apiLogin(adminCtx, QA_ADMIN);
  const adminCsrf = adminLogin.csrf;
  log('admin login', adminLogin.status);

  // === 4.1 List products — default ===
  let products = [];
  {
    const r = await adminCtx.request.get(`${API}/api/products`);
    const j = await r.json().catch(() => ({}));
    products = j.products || j.items || (Array.isArray(j) ? j : []);
    report.scenarios['4.1_list_default'] = { status: r.status(), count: products.length, statuses: [...new Set(products.map(p => p.status))], hasTotal: typeof j.total === 'number' };
  }

  // === 4.2 List products — status filter active ===
  {
    const r = await adminCtx.request.get(`${API}/api/products?status=active`);
    const j = await r.json().catch(() => ({}));
    const arr = j.products || j.items || (Array.isArray(j) ? j : []);
    report.scenarios['4.2_list_status_active'] = { status: r.status(), count: arr.length, allActive: arr.every(p => p.status === 'active') };
  }

  // === 4.3 List products — status filter archived ===
  {
    const r = await adminCtx.request.get(`${API}/api/products?status=archived`);
    const j = await r.json().catch(() => ({}));
    const arr = j.products || j.items || (Array.isArray(j) ? j : []);
    report.scenarios['4.3_list_status_archived'] = { status: r.status(), count: arr.length, allArchived: arr.every(p => p.status === 'archived') };
  }

  // === 4.4 Search — pick something likely in DB and search ===
  let firstName = products[0]?.name?.slice(0, 5) || 'Test';
  {
    const r = await adminCtx.request.get(`${API}/api/products?search=${encodeURIComponent(firstName)}`);
    const j = await r.json().catch(() => ({}));
    const arr = j.products || j.items || (Array.isArray(j) ? j : []);
    report.scenarios['4.4_search'] = { status: r.status(), query: firstName, count: arr.length, allMatch: arr.every(p => (p.name || '').toLowerCase().includes(firstName.toLowerCase()) || (p.defaultPluCode || '').includes(firstName)) };
  }

  // === 4.5 Create product — valid ===
  let newPid = null;
  const pluCode = String(7000000000000n + BigInt(Math.floor(Math.random() * 1e9))).slice(0, 13);
  const newName = `Wave3 Test Product ${Date.now()}`;
  {
    const r = await adminCtx.request.post(`${API}/api/products`, {
      data: { defaultPluCode: pluCode, name: newName, shortName: 'W3P', unit: 'g', status: 'active', description: 'Wave3 regression seed' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    newPid = j.id || j.product?.id;
    report.scenarios['4.5_create_valid'] = { status: r.status(), id: newPid, name: j.name || j.product?.name };
  }

  // === 4.6 Create product — duplicate PLU ===
  {
    const r = await adminCtx.request.post(`${API}/api/products`, {
      data: { defaultPluCode: pluCode, name: 'dup', shortName: 'D', unit: 'g', status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['4.6_create_duplicate_plu'] = { status: r.status(), msg: (j.message || '').slice(0, 100) };
  }

  // === 4.7 Create product — empty/invalid ===
  {
    const r = await adminCtx.request.post(`${API}/api/products`, {
      data: { defaultPluCode: '', name: '', shortName: '', unit: '', status: '' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['4.7_create_empty'] = { status: r.status(), msg: (j.message || '').slice(0, 120) };
  }

  // === 4.8 Get product by id ===
  if (newPid) {
    const r = await adminCtx.request.get(`${API}/api/products/${newPid}`);
    const j = await r.json().catch(() => ({}));
    report.scenarios['4.8_get_product'] = { status: r.status(), name: j.name, status_field: j.status, plu: j.defaultPluCode };
  }

  // === 4.9 Patch — rename ===
  if (newPid) {
    const r = await adminCtx.request.patch(`${API}/api/products/${newPid}`, {
      data: { name: newName + ' (renamed)' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['4.9_patch_rename'] = { status: r.status(), name: j.name };
  }

  // === 4.10 Patch — invalid status ===
  if (newPid) {
    const r = await adminCtx.request.patch(`${API}/api/products/${newPid}`, {
      data: { status: 'banana' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['4.10_patch_invalid_status'] = { status: r.status(), msg: (j.message || '').slice(0, 100) };
  }

  // === 4.11 Archive product ===
  if (newPid) {
    const r = await adminCtx.request.patch(`${API}/api/products/${newPid}`, {
      data: { status: 'archived' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['4.11_archive_product'] = { status: r.status(), newStatus: j.status };
  }

  // === 4.12 GET product after archive ===
  if (newPid) {
    const r = await adminCtx.request.get(`${API}/api/products/${newPid}`);
    const j = await r.json().catch(() => ({}));
    report.scenarios['4.12_get_after_archive'] = { status: r.status(), status_field: j.status };
  }

  // === 4.13 Restore product ===
  if (newPid) {
    const r = await adminCtx.request.patch(`${API}/api/products/${newPid}`, {
      data: { status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['4.13_restore'] = { status: r.status(), newStatus: j.status };
  }

  // === 4.14 XSS attempt in name ===
  {
    const xss = '<script>alert("xss")</script>Test ' + Date.now();
    const xssPlu = String(7100000000000n + BigInt(Math.floor(Math.random() * 1e9))).slice(0, 13);
    const r = await adminCtx.request.post(`${API}/api/products`, {
      data: { defaultPluCode: xssPlu, name: xss, shortName: 'XSS', unit: 'g', status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['4.14_xss_in_name'] = { status: r.status(), name: j.name || j.product?.name, persistedAsIs: (j.name || j.product?.name || '').includes('<script>') };
    if (j.id) {
      // archive immediately
      await adminCtx.request.patch(`${API}/api/products/${j.id}`, { data: { status: 'archived' }, headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' } });
    }
  }

  // === 4.15 UI products list (admin) ===
  {
    const page = await adminCtx.newPage();
    await page.goto(`${FE}/products`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    const body = (await page.locator('body').textContent({ timeout: 2000 }).catch(() => '')) || '';
    await shot(page, shotPath(block, '4-15-admin-products'));
    report.scenarios['4.15_ui_admin_products'] = {
      url: page.url(),
      hasProductsTitle: /Products|Товары|товар/i.test(body),
    };
    await page.close();
  }

  await adminCtx.close();
  await browser.close();
  report.finishedAt = new Date().toISOString();
  writeReport(block, report);
  console.log('\n=== BLOCK 4 SUMMARY ===');
  console.log(JSON.stringify(report.scenarios, null, 2));
})();
