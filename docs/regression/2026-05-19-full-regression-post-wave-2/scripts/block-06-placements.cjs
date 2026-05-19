/**
 * BLOCK 6 — Catalog placements.
 * Single-active-per-(store,product) invariant + move flow + cascade archive on parent archive (BUG-REG-026).
 */
const H = require('./helpers/common.cjs');
const { chromium, FE, API, QA_ADMIN, sleep, log, shot, shotPath, writeReport, apiLogin } = H;

(async () => {
  const block = 'block-06';
  const report = { startedAt: new Date().toISOString(), scenarios: {} };
  const browser = await chromium.launch({ headless: true });

  const adminCtx = await browser.newContext();
  const adminLogin = await apiLogin(adminCtx, QA_ADMIN);
  const adminCsrf = adminLogin.csrf;
  log('admin login', adminLogin.status);

  // Setup: fresh store + 2 categories + 2 products
  let storeId, catA, catB, prodId1, prodId2;
  {
    const sR = await adminCtx.request.post(`${API}/api/stores`, {
      data: { code: `qa-w3-pl-${Date.now()}`, name: 'Wave3 Placements Test', timezone: 'Europe/Moscow' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const sJ = await sR.json();
    storeId = sJ.id || sJ.store?.id;

    const cA = await adminCtx.request.post(`${API}/api/stores/${storeId}/catalog/categories`, {
      data: { name: 'CatA', status: 'active' }, headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const cAj = await cA.json();
    catA = cAj.id || cAj.category?.id;
    const cB = await adminCtx.request.post(`${API}/api/stores/${storeId}/catalog/categories`, {
      data: { name: 'CatB', status: 'active' }, headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const cBj = await cB.json();
    catB = cBj.id || cBj.category?.id;

    const plu1 = String(7300000000000n + BigInt(Math.floor(Math.random() * 1e9))).slice(0, 13);
    const plu2 = String(7400000000000n + BigInt(Math.floor(Math.random() * 1e9))).slice(0, 13);
    const p1 = await adminCtx.request.post(`${API}/api/products`, {
      data: { defaultPluCode: plu1, name: 'PlProd1 ' + Date.now(), shortName: 'P1', unit: 'g', status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const p1j = await p1.json();
    prodId1 = p1j.id || p1j.product?.id;
    const p2 = await adminCtx.request.post(`${API}/api/products`, {
      data: { defaultPluCode: plu2, name: 'PlProd2 ' + Date.now(), shortName: 'P2', unit: 'g', status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const p2j = await p2.json();
    prodId2 = p2j.id || p2j.product?.id;
    report.scenarios['6.0_setup'] = { storeId, catA, catB, prodId1, prodId2 };
  }

  // === 6.1 List placements — empty ===
  {
    const r = await adminCtx.request.get(`${API}/api/stores/${storeId}/catalog/placements`);
    const j = await r.json().catch(() => ({}));
    const arr = j.placements || j.items || (Array.isArray(j) ? j : []);
    report.scenarios['6.1_list_empty'] = { status: r.status(), count: arr.length };
  }

  // === 6.2 Create placement (catA, prod1) ===
  let placement1Id;
  {
    const r = await adminCtx.request.post(`${API}/api/stores/${storeId}/catalog/placements`, {
      data: { categoryId: catA, productId: prodId1, status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    placement1Id = j.id || j.placement?.id;
    report.scenarios['6.2_create_placement_A_prod1'] = { status: r.status(), id: placement1Id, productId: j.productId || j.placement?.productId };
  }

  // === 6.3 Create SECOND placement same product (catB, prod1) — should fail (BUG-REG-026 invariant) ===
  {
    const r = await adminCtx.request.post(`${API}/api/stores/${storeId}/catalog/placements`, {
      data: { categoryId: catB, productId: prodId1, status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['6.3_duplicate_active_placement'] = { status: r.status(), msg: (j.message || '').slice(0, 120) };
  }

  // === 6.4 Move placement from catA to catB ===
  if (placement1Id) {
    const r = await adminCtx.request.post(`${API}/api/stores/${storeId}/catalog/placements/${placement1Id}/move`, {
      data: { categoryId: catB, sortOrder: 0 },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['6.4_move_placement'] = { status: r.status(), newCategoryId: j.categoryId || j.placement?.categoryId };
  }

  // === 6.5 List by category ===
  {
    const rA = await adminCtx.request.get(`${API}/api/stores/${storeId}/catalog/placements?categoryId=${catA}`);
    const jA = await rA.json().catch(() => ({}));
    const arrA = jA.placements || jA.items || (Array.isArray(jA) ? jA : []);
    const rB = await adminCtx.request.get(`${API}/api/stores/${storeId}/catalog/placements?categoryId=${catB}`);
    const jB = await rB.json().catch(() => ({}));
    const arrB = jB.placements || jB.items || (Array.isArray(jB) ? jB : []);
    report.scenarios['6.5_list_by_cat_after_move'] = { catA_count: arrA.length, catB_count: arrB.length, catA_status: rA.status(), catB_status: rB.status() };
  }

  // === 6.6 Add placement for prod2 under catA + reorder ===
  let placement2Id;
  {
    const r = await adminCtx.request.post(`${API}/api/stores/${storeId}/catalog/placements`, {
      data: { categoryId: catA, productId: prodId2, status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    placement2Id = j.id;
    report.scenarios['6.6_create_placement_B_prod2'] = { status: r.status(), id: placement2Id };
  }

  // Reorder is per-category. Single placement in catA so reorder is trivial — skip ordering test.

  // === 6.7 Archive placement1 (manual) ===
  if (placement1Id) {
    const r = await adminCtx.request.patch(`${API}/api/stores/${storeId}/catalog/placements/${placement1Id}`, {
      data: { status: 'archived' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['6.7_archive_placement'] = { status: r.status(), newStatus: j.status || j.placement?.status };
  }

  // === 6.8 Now CAN we re-create active placement for prod1 in catA? ===
  {
    const r = await adminCtx.request.post(`${API}/api/stores/${storeId}/catalog/placements`, {
      data: { categoryId: catA, productId: prodId1, status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['6.8_recreate_after_archive'] = { status: r.status(), id: j.id, msg: (j.message || '').slice(0, 100) };
  }

  // === 6.9 Cascade archive: archive category (with active placements inside) → cascade ===
  {
    // Re-archive catA → expect placements inside catA to also archive
    const r = await adminCtx.request.patch(`${API}/api/stores/${storeId}/catalog/categories/${catA}`, {
      data: { status: 'archived' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    await sleep(300);
    const list = await adminCtx.request.get(`${API}/api/stores/${storeId}/catalog/placements?categoryId=${catA}`);
    const j = await list.json().catch(() => ({}));
    const arr = j.placements || j.items || (Array.isArray(j) ? j : []);
    const archivedList = await adminCtx.request.get(`${API}/api/stores/${storeId}/catalog/placements?categoryId=${catA}&status=archived`);
    const jArch = await archivedList.json().catch(() => ({}));
    const archArr = jArch.placements || jArch.items || (Array.isArray(jArch) ? jArch : []);
    report.scenarios['6.9_cascade_category_archive'] = {
      archive_status: r.status(),
      catA_active_count_after: arr.length,
      catA_archived_count_after: archArr.length,
      catA_archived_placements_match_cascade: archArr.length >= 1,
    };
  }

  // === 6.10 Validation: missing categoryId on create ===
  {
    const r = await adminCtx.request.post(`${API}/api/stores/${storeId}/catalog/placements`, {
      data: { productId: prodId2, status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['6.10_missing_category'] = { status: r.status(), msg: (j.message || '').slice(0, 100) };
  }

  await adminCtx.close();
  await browser.close();
  report.finishedAt = new Date().toISOString();
  writeReport(block, report);
  console.log('\n=== BLOCK 6 SUMMARY ===');
  console.log(JSON.stringify(report.scenarios, null, 2));
})();
