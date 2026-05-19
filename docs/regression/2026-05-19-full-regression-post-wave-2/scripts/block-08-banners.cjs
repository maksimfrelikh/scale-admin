/**
 * BLOCK 8 — Advertising banners: upload, sortOrder, archive cascade.
 */
const H = require('./helpers/common.cjs');
const { chromium, FE, API, QA_ADMIN, sleep, log, shot, shotPath, writeReport, apiLogin } = H;

(async () => {
  const block = 'block-08';
  const report = { startedAt: new Date().toISOString(), scenarios: {} };
  const browser = await chromium.launch({ headless: true });

  const adminCtx = await browser.newContext();
  const adminLogin = await apiLogin(adminCtx, QA_ADMIN);
  const adminCsrf = adminLogin.csrf;
  log('admin login', adminLogin.status);

  // Setup: store
  let storeId;
  {
    const sR = await adminCtx.request.post(`${API}/api/stores`, {
      data: { code: `qa-w3-bn-${Date.now()}`, name: 'Wave3 Banners Test', timezone: 'Europe/Moscow' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    storeId = (await sR.json()).store.id;
    report.scenarios['8.0_setup'] = { storeId };
  }

  // === 8.1 List banners (empty) ===
  {
    const r = await adminCtx.request.get(`${API}/api/stores/${storeId}/advertising/banners`);
    const j = await r.json().catch(() => ({}));
    const arr = j.banners || j.items || (Array.isArray(j) ? j : []);
    report.scenarios['8.1_list_empty'] = { status: r.status(), count: arr.length };
  }

  // === 8.2 Create banner — imageUrl form (no file asset) ===
  let banner1Id, banner2Id, banner3Id;
  {
    const r = await adminCtx.request.post(`${API}/api/stores/${storeId}/advertising/banners`, {
      data: { imageUrl: 'https://example.com/banner1.png', status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    banner1Id = j.id || j.banner?.id;
    report.scenarios['8.2_create_url_banner'] = { status: r.status(), id: banner1Id, imageUrl: j.imageUrl };
  }

  // === 8.3 Create two more banners ===
  {
    const r2 = await adminCtx.request.post(`${API}/api/stores/${storeId}/advertising/banners`, {
      data: { imageUrl: 'https://example.com/banner2.png', status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j2 = await r2.json().catch(() => ({}));
    banner2Id = j2.id || j2.banner?.id;

    const r3 = await adminCtx.request.post(`${API}/api/stores/${storeId}/advertising/banners`, {
      data: { imageUrl: 'https://example.com/banner3.png', status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j3 = await r3.json().catch(() => ({}));
    banner3Id = j3.id || j3.banner?.id;
    report.scenarios['8.3_create_2_more'] = { b2: { status: r2.status(), id: banner2Id }, b3: { status: r3.status(), id: banner3Id } };
  }

  // === 8.4 Create banner — invalid imageUrl ===
  {
    const r = await adminCtx.request.post(`${API}/api/stores/${storeId}/advertising/banners`, {
      data: { imageUrl: 'not-a-url', status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['8.4_invalid_url'] = { status: r.status(), msg: (j.message || '').slice(0, 100) };
  }

  // === 8.5 Create banner — javascript: URI (XSS attempt) ===
  {
    const r = await adminCtx.request.post(`${API}/api/stores/${storeId}/advertising/banners`, {
      data: { imageUrl: 'javascript:alert(1)', status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['8.5_javascript_uri'] = { status: r.status(), msg: (j.message || '').slice(0, 100) };
  }

  // === 8.6 Create banner — missing imageUrl ===
  {
    const r = await adminCtx.request.post(`${API}/api/stores/${storeId}/advertising/banners`, {
      data: { status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['8.6_missing_url'] = { status: r.status(), msg: (j.message || '').slice(0, 100) };
  }

  // === 8.7 List banners + check sortOrder ===
  {
    const r = await adminCtx.request.get(`${API}/api/stores/${storeId}/advertising/banners`);
    const j = await r.json().catch(() => ({}));
    const arr = j.banners || j.items || (Array.isArray(j) ? j : []);
    report.scenarios['8.7_list_after_create'] = { count: arr.length, sortOrders: arr.map(b => b.sortOrder), ids: arr.map(b => b.id) };
  }

  // === 8.8 Reorder banners ===
  if (banner1Id && banner2Id && banner3Id) {
    const r = await adminCtx.request.post(`${API}/api/stores/${storeId}/advertising/banners/reorder`, {
      data: { bannerIds: [banner3Id, banner2Id, banner1Id] },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    const arr = j.banners || j.items || (Array.isArray(j) ? j : []);
    report.scenarios['8.8_reorder'] = { status: r.status(), newOrder: arr.map(b => b.id) };
  }

  // === 8.9 Patch banner — change imageUrl ===
  if (banner1Id) {
    const r = await adminCtx.request.patch(`${API}/api/stores/${storeId}/advertising/banners/${banner1Id}`, {
      data: { imageUrl: 'https://example.com/banner1-renamed.png' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['8.9_patch_url'] = { status: r.status(), newUrl: j.imageUrl };
  }

  // === 8.10 Archive single banner via status endpoint ===
  if (banner1Id) {
    const r = await adminCtx.request.patch(`${API}/api/stores/${storeId}/advertising/banners/${banner1Id}/status`, {
      data: { status: 'archived' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['8.10_archive_via_status'] = { status: r.status(), newStatus: j.status };
  }

  // === 8.11 List active only ===
  {
    const r = await adminCtx.request.get(`${API}/api/stores/${storeId}/advertising/banners?status=active`);
    const j = await r.json().catch(() => ({}));
    const arr = j.banners || j.items || (Array.isArray(j) ? j : []);
    report.scenarios['8.11_list_active'] = { count: arr.length, ids: arr.map(b => b.id) };
  }

  // === 8.12 Archive entire store — does it cascade to banners? ===
  {
    const r = await adminCtx.request.patch(`${API}/api/stores/${storeId}`, {
      data: { status: 'archived' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    await sleep(300);
    // Check banners status (we can no longer list under archived store? or can we?)
    const listR = await adminCtx.request.get(`${API}/api/stores/${storeId}/advertising/banners`);
    const listJ = await listR.json().catch(() => ({}));
    const arr = listJ.banners || listJ.items || (Array.isArray(listJ) ? listJ : []);
    report.scenarios['8.12_archive_store_cascade'] = {
      archive_store_status: r.status(),
      list_after_archive_status: listR.status(),
      banners_count: arr.length,
      banner_statuses: arr.map(b => ({ id: b.id, status: b.status })),
    };
    // Restore store for cleanliness
    await adminCtx.request.patch(`${API}/api/stores/${storeId}`, {
      data: { status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
  }

  await adminCtx.close();
  await browser.close();
  report.finishedAt = new Date().toISOString();
  writeReport(block, report);
  console.log('\n=== BLOCK 8 SUMMARY ===');
  console.log(JSON.stringify(report.scenarios, null, 2));
})();
