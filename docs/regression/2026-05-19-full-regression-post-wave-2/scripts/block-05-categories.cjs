/**
 * BLOCK 5 — Categories tree + parent/child + sortOrder + archive cascade parent→children.
 * BUG-REG-035 closure check.
 *
 * Categories live under /api/stores/:storeId/catalog/categories.
 * Strategy: pick an existing store the admin has access to (or create one) — build a tiny tree,
 * reorder, archive parent, observe cascade to children.
 */
const H = require('./helpers/common.cjs');
const { chromium, FE, API, QA_ADMIN, sleep, log, shot, shotPath, writeReport, apiLogin } = H;

(async () => {
  const block = 'block-05';
  const report = { startedAt: new Date().toISOString(), scenarios: {} };
  const browser = await chromium.launch({ headless: true });

  const adminCtx = await browser.newContext();
  const adminLogin = await apiLogin(adminCtx, QA_ADMIN);
  const adminCsrf = adminLogin.csrf;
  log('admin login', adminLogin.status);

  // Use a dedicated test store for Block 5/6
  let storeId;
  {
    const code = `qa-w3-cat-${Date.now()}`;
    const r = await adminCtx.request.post(`${API}/api/stores`, {
      data: { code, name: 'Wave3 Categories Test', timezone: 'Europe/Moscow' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    storeId = j.id || j.store?.id;
    report.scenarios['5.0_setup_store'] = { status: r.status(), storeId, code };
  }

  // === 5.1 List categories — initial empty ===
  {
    const r = await adminCtx.request.get(`${API}/api/stores/${storeId}/catalog/categories`);
    const j = await r.json().catch(() => ({}));
    const arr = j.categories || j.items || (Array.isArray(j) ? j : []);
    report.scenarios['5.1_initial_empty_tree'] = { status: r.status(), count: arr.length, shape: typeof j };
  }

  // === 5.2 Create root category ===
  let rootId, child1Id, child2Id, grandchildId;
  {
    const r = await adminCtx.request.post(`${API}/api/stores/${storeId}/catalog/categories`, {
      data: { name: 'Root W3', shortName: 'R', status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    rootId = j.id || j.category?.id;
    report.scenarios['5.2_create_root'] = { status: r.status(), id: rootId };
  }

  // === 5.3 Create two child categories under root ===
  {
    const r1 = await adminCtx.request.post(`${API}/api/stores/${storeId}/catalog/categories`, {
      data: { name: 'Child A', parentId: rootId, status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j1 = await r1.json().catch(() => ({}));
    child1Id = j1.id || j1.category?.id;
    const r2 = await adminCtx.request.post(`${API}/api/stores/${storeId}/catalog/categories`, {
      data: { name: 'Child B', parentId: rootId, status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j2 = await r2.json().catch(() => ({}));
    child2Id = j2.id || j2.category?.id;
    report.scenarios['5.3_create_two_children'] = { childA: { status: r1.status(), id: child1Id }, childB: { status: r2.status(), id: child2Id } };
  }

  // === 5.4 Create grandchild under Child A ===
  {
    const r = await adminCtx.request.post(`${API}/api/stores/${storeId}/catalog/categories`, {
      data: { name: 'Grandchild A1', parentId: child1Id, status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    grandchildId = j.id || j.category?.id;
    report.scenarios['5.4_create_grandchild'] = { status: r.status(), id: grandchildId };
  }

  // === 5.5 List tree — verify structure ===
  {
    const r = await adminCtx.request.get(`${API}/api/stores/${storeId}/catalog/categories`);
    const j = await r.json().catch(() => ({}));
    const arr = j.categories || j.items || (Array.isArray(j) ? j : []);
    report.scenarios['5.5_tree_after_create'] = { status: r.status(), count: arr.length, sampleKeys: arr[0] ? Object.keys(arr[0]).slice(0, 8) : [], structure: arr };
  }

  // === 5.6 Reorder children: B then A ===
  {
    const r = await adminCtx.request.post(`${API}/api/stores/${storeId}/catalog/categories/reorder`, {
      data: { parentId: rootId, categoryIds: [child2Id, child1Id] },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['5.6_reorder'] = { status: r.status(), msg: j.message || JSON.stringify(j).slice(0, 80) };
  }

  // === 5.7 Validation: invalid parentId ===
  {
    const r = await adminCtx.request.post(`${API}/api/stores/${storeId}/catalog/categories`, {
      data: { name: 'Orphan', parentId: '00000000-0000-0000-0000-000000000000', status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['5.7_invalid_parent'] = { status: r.status(), msg: (j.message || '').slice(0, 100) };
  }

  // === 5.8 Validation: empty name ===
  {
    const r = await adminCtx.request.post(`${API}/api/stores/${storeId}/catalog/categories`, {
      data: { name: '', status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['5.8_empty_name'] = { status: r.status(), msg: (j.message || '').slice(0, 100) };
  }

  // === 5.9 ARCHIVE root (cascade test) — BUG-REG-035 closure ===
  {
    const r = await adminCtx.request.patch(`${API}/api/stores/${storeId}/catalog/categories/${rootId}`, {
      data: { status: 'archived' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['5.9_archive_root'] = { status: r.status(), newStatus: j.status || j.category?.status };
  }

  // === 5.10 Verify all descendants archived ===
  {
    await sleep(300);
    const r = await adminCtx.request.get(`${API}/api/stores/${storeId}/catalog/categories?status=archived`);
    const j = await r.json().catch(() => ({}));
    const arr = j.categories || j.items || (Array.isArray(j) ? j : []);
    // Flatten tree to collect IDs
    const collect = (nodes, acc) => { for (const n of nodes) { if (n) { acc.push({ id: n.id, name: n.name, status: n.status, parentId: n.parentId }); if (Array.isArray(n.children)) collect(n.children, acc); } } return acc; };
    const flat = collect(arr, []);
    const rootCat = flat.find(c => c.id === rootId);
    const childACat = flat.find(c => c.id === child1Id);
    const childBCat = flat.find(c => c.id === child2Id);
    const grandCat = flat.find(c => c.id === grandchildId);
    report.scenarios['5.10_cascade_verify'] = {
      list_archived_status: r.status(),
      totalFlat: flat.length,
      rootStatus: rootCat?.status,
      childAStatus: childACat?.status,
      childBStatus: childBCat?.status,
      grandStatus: grandCat?.status,
      allFourArchived: [rootCat, childACat, childBCat, grandCat].every(c => c?.status === 'archived'),
    };
  }

  // === 5.11 Also fetch including active filter to double-check children not in active anymore ===
  {
    const r = await adminCtx.request.get(`${API}/api/stores/${storeId}/catalog/categories?status=active`);
    const j = await r.json().catch(() => ({}));
    const arr = j.categories || j.items || (Array.isArray(j) ? j : []);
    const collect = (nodes, acc) => { for (const n of nodes) { if (n) { acc.push(n.id); if (Array.isArray(n.children)) collect(n.children, acc); } } return acc; };
    const flat = collect(arr, []);
    report.scenarios['5.11_active_list_after_cascade'] = {
      status: r.status(),
      containsRoot: flat.includes(rootId),
      containsChildA: flat.includes(child1Id),
      containsChildB: flat.includes(child2Id),
      containsGrand: flat.includes(grandchildId),
    };
  }

  // === 5.12 Restore the root → does cascade reverse? ===
  {
    const r = await adminCtx.request.patch(`${API}/api/stores/${storeId}/catalog/categories/${rootId}`, {
      data: { status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    await sleep(300);
    const r2 = await adminCtx.request.get(`${API}/api/stores/${storeId}/catalog/categories?status=active`);
    const j2 = await r2.json().catch(() => ({}));
    const arr = j2.categories || j2.items || (Array.isArray(j2) ? j2 : []);
    const collect = (nodes, acc) => { for (const n of nodes) { if (n) { acc.push(n); if (Array.isArray(n.children)) collect(n.children, acc); } } return acc; };
    const flat = collect(arr, []);
    report.scenarios['5.12_restore_root_reverse_cascade'] = {
      restore_status: r.status(),
      restoredRoot: !!flat.find(c => c.id === rootId),
      restoredChildA: !!flat.find(c => c.id === child1Id),
      restoredChildB: !!flat.find(c => c.id === child2Id),
      restoredGrand: !!flat.find(c => c.id === grandchildId),
    };
  }

  // === 5.13 UI categories tree screenshot ===
  {
    const page = await adminCtx.newPage();
    await page.goto(`${FE}/stores/${storeId}`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    await shot(page, shotPath(block, '5-13-ui-store-detail'));
    const body = (await page.locator('body').textContent({ timeout: 2000 }).catch(() => '')) || '';
    report.scenarios['5.13_ui_store_detail'] = { url: page.url(), hasCategoryRefs: /Кат|Categor/i.test(body) };
    await page.close();
  }

  await adminCtx.close();
  await browser.close();
  report.finishedAt = new Date().toISOString();
  writeReport(block, report);
  console.log('\n=== BLOCK 5 SUMMARY ===');
  console.log(JSON.stringify(report.scenarios, null, 2));
})();
