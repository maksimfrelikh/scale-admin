/**
 * BLOCK 11 — Scale API: check-update (valid/unknown/malformed UUID per BUG-REG-031), ack, sync log, token regeneration.
 */
const H = require('./helpers/common.cjs');
const { chromium, API, QA_ADMIN, sleep, log, writeReport, apiLogin } = H;

(async () => {
  const block = 'block-11';
  const report = { startedAt: new Date().toISOString(), scenarios: {} };
  const browser = await chromium.launch({ headless: true });

  const adminCtx = await browser.newContext();
  const adminLogin = await apiLogin(adminCtx, QA_ADMIN);
  const adminCsrf = adminLogin.csrf;

  // === Setup: store + device + published catalog ===
  let storeId, deviceId, deviceCode, apiToken, publishedVersionId;
  {
    const sR = await adminCtx.request.post(`${API}/api/stores`, {
      data: { code: `qa-w3-sc-${Date.now()}`, name: 'Wave3 Scale Test', timezone: 'Europe/Moscow' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    storeId = (await sR.json()).store.id;

    // Setup minimal published catalog
    const cR = await adminCtx.request.post(`${API}/api/stores/${storeId}/catalog/categories`, {
      data: { name: 'Cx', status: 'active' }, headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const cj = await cR.json();
    const catId = cj.id || cj.category?.id;
    const plu = String(8400000000000n + BigInt(Math.floor(Math.random() * 1e9))).slice(0, 13);
    const pR = await adminCtx.request.post(`${API}/api/products`, {
      data: { defaultPluCode: plu, name: 'SP ' + Date.now(), shortName: 'SP', unit: 'g', status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const pj = await pR.json();
    const prodId = pj.id || pj.product?.id;
    await adminCtx.request.post(`${API}/api/stores/${storeId}/catalog/placements`, {
      data: { categoryId: catId, productId: prodId, status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    await adminCtx.request.put(`${API}/api/stores/${storeId}/prices`, {
      data: { productId: prodId, price: 10, currency: 'RUB' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const pubR = await adminCtx.request.post(`${API}/api/stores/${storeId}/publishing/catalog-publish`, {
      headers: { 'x-csrf-token': adminCsrf },
    });
    const pubJ = await pubR.json();
    publishedVersionId = pubJ.version?.id;

    // Register device
    deviceCode = `QAW3SC-${Date.now()}`;
    const dR = await adminCtx.request.post(`${API}/api/stores/${storeId}/scales`, {
      data: { deviceCode, name: 'Wave3 Test Scale', model: 'Test-1' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const dj = await dR.json();
    deviceId = dj.device?.id || dj.id;
    apiToken = dj.apiToken || dj.device?.apiToken;
    report.scenarios['11.0_setup'] = { storeId, deviceId, deviceCode, hasToken: !!apiToken, publishedVersionId };
  }

  // === 11.1 Scale auth-check with valid creds ===
  {
    const r = await adminCtx.request.get(`${API}/api/scale-api/auth-check`, {
      headers: { 'x-scale-device-code': deviceCode, 'x-scale-api-token': apiToken },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['11.1_auth_check'] = { status: r.status(), deviceId: j.device?.id, storeId: j.device?.storeId };
  }

  // === 11.2 Auth-check with wrong token → 401 ===
  {
    const r = await adminCtx.request.get(`${API}/api/scale-api/auth-check`, {
      headers: { 'x-scale-device-code': deviceCode, 'x-scale-api-token': 'wrong-token' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['11.2_auth_check_wrong_token'] = { status: r.status(), code: j.code };
  }

  // === 11.3 check-update with NO currentCatalogVersionId → returns latest ===
  {
    const r = await adminCtx.request.post(`${API}/api/scales/check-update`, {
      data: {},
      headers: { 'x-scale-device-code': deviceCode, 'x-scale-api-token': apiToken, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['11.3_check_update_no_current'] = { status: r.status(), updateAvailable: j.updateAvailable, versionNumber: j.version?.versionNumber, hasPackage: !!j.packageData || !!j.version?.packageData };
  }

  // === 11.4 check-update with current = latest → no update ===
  {
    const r = await adminCtx.request.post(`${API}/api/scales/check-update`, {
      data: { currentCatalogVersionId: publishedVersionId },
      headers: { 'x-scale-device-code': deviceCode, 'x-scale-api-token': apiToken, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['11.4_check_update_current'] = { status: r.status(), updateAvailable: j.updateAvailable };
  }

  // === 11.5 check-update with UNKNOWN UUID (BUG-REG-031 closure) — should treat as stale, return latest ===
  {
    const r = await adminCtx.request.post(`${API}/api/scales/check-update`, {
      data: { currentCatalogVersionId: '00000000-0000-0000-0000-000000000000' },
      headers: { 'x-scale-device-code': deviceCode, 'x-scale-api-token': apiToken, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['11.5_check_update_unknown_uuid'] = {
      status: r.status(),
      updateAvailable: j.updateAvailable,
      versionNumber: j.version?.versionNumber,
      msg: (j.message || '').slice(0, 100),
    };
  }

  // === 11.6 check-update with MALFORMED UUID (not a UUID at all) ===
  {
    const r = await adminCtx.request.post(`${API}/api/scales/check-update`, {
      data: { currentCatalogVersionId: 'not-a-uuid' },
      headers: { 'x-scale-device-code': deviceCode, 'x-scale-api-token': apiToken, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['11.6_check_update_malformed_uuid'] = {
      status: r.status(),
      updateAvailable: j.updateAvailable,
      msg: (j.message || '').slice(0, 100),
    };
  }

  // === 11.7 check-update with empty string ===
  {
    const r = await adminCtx.request.post(`${API}/api/scales/check-update`, {
      data: { currentCatalogVersionId: '' },
      headers: { 'x-scale-device-code': deviceCode, 'x-scale-api-token': apiToken, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['11.7_check_update_empty_string'] = { status: r.status(), updateAvailable: j.updateAvailable };
  }

  // === 11.8 ack — success ===
  {
    const r = await adminCtx.request.post(`${API}/api/scales/ack`, {
      data: { versionId: publishedVersionId, status: 'success' },
      headers: { 'x-scale-device-code': deviceCode, 'x-scale-api-token': apiToken, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['11.8_ack_success'] = { status: r.status(), ackedVersion: j.ackedVersionId || j.version?.id, body: JSON.stringify(j).slice(0, 200) };
  }

  // === 11.9 ack — error ===
  {
    const r = await adminCtx.request.post(`${API}/api/scales/ack`, {
      data: { versionId: publishedVersionId, status: 'error', errorMessage: 'Simulated error from Wave3 test' },
      headers: { 'x-scale-device-code': deviceCode, 'x-scale-api-token': apiToken, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['11.9_ack_error'] = { status: r.status(), body: JSON.stringify(j).slice(0, 200) };
  }

  // === 11.10 ack with no creds → 401 ===
  {
    const r = await adminCtx.request.post(`${API}/api/scales/ack`, {
      data: { versionId: publishedVersionId, status: 'success' },
      headers: { 'Content-Type': 'application/json' },
    });
    report.scenarios['11.10_ack_no_creds'] = { status: r.status() };
  }

  // === 11.11 Token regeneration — admin endpoint ===
  let newToken = apiToken;
  {
    const r = await adminCtx.request.post(`${API}/api/scales/${deviceId}/regenerate-token`, {
      headers: { 'x-csrf-token': adminCsrf },
    });
    const j = await r.json().catch(() => ({}));
    newToken = j.apiToken || j.device?.apiToken || apiToken;
    report.scenarios['11.11_regenerate_token'] = { status: r.status(), tokenChanged: newToken !== apiToken, tokenLen: newToken?.length };
  }

  // === 11.12 Old token rejected after regen ===
  {
    const r = await adminCtx.request.get(`${API}/api/scale-api/auth-check`, {
      headers: { 'x-scale-device-code': deviceCode, 'x-scale-api-token': apiToken },
    });
    report.scenarios['11.12_old_token_rejected'] = { status: r.status() };
  }

  // === 11.13 New token accepted ===
  {
    const r = await adminCtx.request.get(`${API}/api/scale-api/auth-check`, {
      headers: { 'x-scale-device-code': deviceCode, 'x-scale-api-token': newToken },
    });
    report.scenarios['11.13_new_token_accepted'] = { status: r.status() };
  }

  // === 11.14 List devices (admin) — shows sync log ===
  {
    const r = await adminCtx.request.get(`${API}/api/stores/${storeId}/scales`);
    const j = await r.json().catch(() => ({}));
    const arr = j.devices || j.scales || j.items || (Array.isArray(j) ? j : []);
    report.scenarios['11.14_list_devices'] = {
      status: r.status(),
      count: arr.length,
      sampleKeys: arr[0] ? Object.keys(arr[0]).slice(0, 15) : [],
      ackedVersionId: arr[0]?.lastAckedVersionId || arr[0]?.lastSyncedVersionId,
    };
  }

  await adminCtx.close();
  await browser.close();
  report.finishedAt = new Date().toISOString();
  writeReport(block, report);
  console.log('\n=== BLOCK 11 SUMMARY ===');
  console.log(JSON.stringify(report.scenarios, null, 2));
})();
