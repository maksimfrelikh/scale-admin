/**
 * BLOCK 3 — Stores CRUD + Store Details + RBAC scoping.
 */
const H = require('./helpers/common.cjs');
const { chromium, FE, API, QA_ADMIN, QA_OP, sleep, log, uiState, uiLogin, shot, shotPath, writeReport, apiLogin } = H;

(async () => {
  const block = 'block-03';
  const report = { startedAt: new Date().toISOString(), scenarios: {} };
  const browser = await chromium.launch({ headless: true });

  const adminCtx = await browser.newContext();
  const adminLogin = await apiLogin(adminCtx, QA_ADMIN);
  const adminCsrf = adminLogin.csrf;
  log('admin login', adminLogin.status);

  // === 3.1 List visible stores (admin sees all) ===
  let stores = [];
  {
    const r = await adminCtx.request.get(`${API}/api/stores`);
    const j = await r.json().catch(() => ({}));
    stores = j.stores || j.items || (Array.isArray(j) ? j : []);
    report.scenarios['3.1_admin_lists_stores'] = { status: r.status(), count: stores.length, statuses: [...new Set(stores.map(s => s.status))] };
  }

  // === 3.2 Create store — valid ===
  let newStoreId = null;
  const newCode = `qa-w3-${Date.now()}`;
  {
    const r = await adminCtx.request.post(`${API}/api/stores`, {
      data: { code: newCode, name: 'Wave3 Test Store', address: 'Test 1, City', timezone: 'Europe/Moscow' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    newStoreId = j.id || j.store?.id;
    report.scenarios['3.2_create_store'] = { status: r.status(), id: newStoreId, code: j.code || j.store?.code };
  }

  // === 3.3 Create store — duplicate code ===
  {
    const r = await adminCtx.request.post(`${API}/api/stores`, {
      data: { code: newCode, name: 'Duplicate' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['3.3_create_store_duplicate_code'] = { status: r.status(), msg: (j.message || '').slice(0, 80) };
  }

  // === 3.4 Create store — empty code/name validation ===
  {
    const r = await adminCtx.request.post(`${API}/api/stores`, {
      data: { code: '', name: '' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['3.4_create_store_empty'] = { status: r.status(), msg: (j.message || '').slice(0, 80) };
  }

  // === 3.5 GET /stores/:id ===
  if (newStoreId) {
    const r = await adminCtx.request.get(`${API}/api/stores/${newStoreId}`);
    const j = await r.json().catch(() => ({}));
    report.scenarios['3.5_store_detail'] = { status: r.status(), code: j.code, name: j.name, status_field: j.status };
  }

  // === 3.6 GET /stores/:id/details (Catalog tab) ===
  if (newStoreId) {
    const r = await adminCtx.request.get(`${API}/api/stores/${newStoreId}/details`);
    const j = await r.json().catch(() => ({}));
    report.scenarios['3.6_store_details_catalog'] = { status: r.status(), keys: Object.keys(j).slice(0, 10) };
  }

  // === 3.7 Patch store — rename ===
  if (newStoreId) {
    const r = await adminCtx.request.patch(`${API}/api/stores/${newStoreId}`, {
      data: { name: 'Wave3 Test Store (renamed)' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['3.7_patch_store_rename'] = { status: r.status(), name: j.name };
  }

  // === 3.8 Patch store — invalid status ===
  if (newStoreId) {
    const r = await adminCtx.request.patch(`${API}/api/stores/${newStoreId}`, {
      data: { status: 'banana' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['3.8_patch_invalid_status'] = { status: r.status(), msg: (j.message || '').slice(0, 80) };
  }

  // === 3.9 Archive store (status=archived) ===
  if (newStoreId) {
    const r = await adminCtx.request.patch(`${API}/api/stores/${newStoreId}`, {
      data: { status: 'archived' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['3.9_archive_store'] = { status: r.status(), newStatus: j.status };
  }

  // === 3.10 Re-list — archived store visibility (depending on filter) ===
  {
    const r = await adminCtx.request.get(`${API}/api/stores`);
    const j = await r.json().catch(() => ({}));
    const arr = j.stores || j.items || (Array.isArray(j) ? j : []);
    const found = arr.find(s => s.id === newStoreId);
    report.scenarios['3.10_list_includes_archived'] = { listCount: arr.length, foundArchived: !!found, foundStatus: found?.status };
  }

  // === 3.11 Restore (back to active) ===
  if (newStoreId) {
    const r = await adminCtx.request.patch(`${API}/api/stores/${newStoreId}`, {
      data: { status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['3.11_restore_store'] = { status: r.status(), newStatus: j.status };
  }

  // === 3.12 admin-check endpoint ===
  {
    const r = await adminCtx.request.get(`${API}/api/stores/admin-check`);
    const j = await r.json().catch(() => ({}));
    report.scenarios['3.12_admin_check'] = { status: r.status(), ok: j.ok, role: j.user?.role };
  }

  // === 3.13 UI — admin stores list ===
  {
    const page = await adminCtx.newPage();
    await page.goto(`${FE}/stores`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    const body = (await page.locator('body').textContent({ timeout: 2000 }).catch(() => '')) || '';
    await shot(page, shotPath(block, '3-13-admin-stores-list'));
    report.scenarios['3.13_ui_admin_stores'] = {
      url: page.url(),
      hasCreateBtn: /Создать|Create|Добавить/i.test(body),
      hasStoresCount: /магазин|Stores/i.test(body),
    };
    await page.close();
  }

  await adminCtx.close();

  // Wait then operator
  await sleep(2000);

  // === 3.14 Operator RBAC: cannot CREATE ===
  const opCtx = await browser.newContext();
  const opLogin = await apiLogin(opCtx, QA_OP);
  const opCsrf = opLogin.csrf;
  {
    const r = await opCtx.request.post(`${API}/api/stores`, {
      data: { code: 'op-attempt-' + Date.now(), name: 'op-attempt' },
      headers: { 'x-csrf-token': opCsrf, 'Content-Type': 'application/json' },
    });
    report.scenarios['3.14_operator_create_forbidden'] = { status: r.status() };
  }

  // === 3.15 Operator RBAC: list only assigned ===
  {
    const r = await opCtx.request.get(`${API}/api/stores`);
    const j = await r.json().catch(() => ({}));
    const arr = j.stores || j.items || (Array.isArray(j) ? j : []);
    report.scenarios['3.15_operator_lists_assigned_only'] = { status: r.status(), count: arr.length, codes: arr.slice(0, 5).map(s => s.code) };
  }

  // === 3.16 Operator can NOT access store they don't have access to (use newStoreId) ===
  if (newStoreId) {
    const r = await opCtx.request.get(`${API}/api/stores/${newStoreId}`);
    report.scenarios['3.16_operator_no_access_to_unassigned'] = { status: r.status(), targetId: newStoreId };
  }

  // === 3.17 admin-check forbidden for operator ===
  {
    const r = await opCtx.request.get(`${API}/api/stores/admin-check`);
    report.scenarios['3.17_admin_check_forbidden_for_op'] = { status: r.status() };
  }

  // === 3.18 Operator UI sees "Operator navigation: assigned stores only" ===
  {
    const page = await opCtx.newPage();
    await page.goto(`${FE}/stores`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    const body = (await page.locator('body').textContent({ timeout: 2000 }).catch(() => '')) || '';
    await shot(page, shotPath(block, '3-18-operator-stores-list'));
    report.scenarios['3.18_ui_operator_stores'] = {
      url: page.url(),
      hasOperatorBanner: /Operator navigation|assigned stores|assigned/i.test(body),
      hasCreateBtn: /Создать|Create/i.test(body),
    };
    await page.close();
  }

  await opCtx.close();
  await browser.close();
  report.finishedAt = new Date().toISOString();
  writeReport(block, report);
  console.log('\n=== BLOCK 3 SUMMARY ===');
  console.log(JSON.stringify(report.scenarios, null, 2));
})();
