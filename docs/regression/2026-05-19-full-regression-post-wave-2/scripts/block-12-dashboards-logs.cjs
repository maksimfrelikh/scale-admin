/**
 * BLOCK 12 — Dashboards + Logs (admin/operator dashboard, global/store logs, audit completeness).
 */
const H = require('./helpers/common.cjs');
const { chromium, FE, API, QA_ADMIN, QA_OP, sleep, log, uiState, shot, shotPath, writeReport, apiLogin } = H;

(async () => {
  const block = 'block-12';
  const report = { startedAt: new Date().toISOString(), scenarios: {} };
  const browser = await chromium.launch({ headless: true });

  // === Admin ===
  const adminCtx = await browser.newContext();
  const adminLogin = await apiLogin(adminCtx, QA_ADMIN);
  const adminCsrf = adminLogin.csrf;

  // === 12.1 Admin dashboard endpoint ===
  {
    const r = await adminCtx.request.get(`${API}/api/admin/dashboard`);
    const j = await r.json().catch(() => ({}));
    report.scenarios['12.1_admin_dashboard_api'] = {
      status: r.status(),
      keys: Object.keys(j).slice(0, 10),
      hasStoreCount: typeof j.totalStores === 'number' || typeof j.stores === 'object',
      hasScaleCount: typeof j.totalScales === 'number' || typeof j.scales === 'object',
      hasLatestVersions: Array.isArray(j.latestPublishedVersions) || Array.isArray(j.recentPublishes),
    };
  }

  // === 12.2 UI admin dashboard ===
  {
    const page = await adminCtx.newPage();
    await page.goto(`${FE}/`, { waitUntil: 'domcontentloaded' });
    await sleep(3000);
    const body = (await page.locator('body').textContent({ timeout: 2000 }).catch(() => '')) || '';
    await shot(page, shotPath(block, '12-2-admin-dashboard'));
    report.scenarios['12.2_ui_admin_dashboard'] = {
      url: page.url(),
      hasFleetOverview: /Fleet overview|Stores|Scales/i.test(body),
      hasLatestVersions: /Latest published versions|Published catalog/i.test(body),
      hasSyncErrors: /Latest sync errors|sync errors|Sync errors/i.test(body),
    };
    await page.close();
  }

  // === 12.3 Global logs (admin) ===
  {
    const r = await adminCtx.request.get(`${API}/api/logs/global?limit=10`);
    const j = await r.json().catch(() => ({}));
    const logs = j.auditLogs || j.logs || j.items || (Array.isArray(j) ? j : []);
    const actions = [...new Set(logs.map(l => l.action))].slice(0, 10);
    report.scenarios['12.3_global_logs'] = {
      status: r.status(),
      count: logs.length,
      sampleActions: actions,
      sampleKeys: logs[0] ? Object.keys(logs[0]).slice(0, 12) : [],
    };
  }

  // === 12.4 Global logs — filter by action ===
  {
    const r = await adminCtx.request.get(`${API}/api/logs/global?action=user.login.success&limit=5`);
    const j = await r.json().catch(() => ({}));
    const logs = j.auditLogs || j.logs || j.items || (Array.isArray(j) ? j : []);
    report.scenarios['12.4_global_logs_filter_action'] = {
      status: r.status(),
      count: logs.length,
      allMatch: logs.every(l => l.action === 'user.login.success'),
    };
  }

  // === 12.5 Global logs — filter by entityType ===
  {
    const r = await adminCtx.request.get(`${API}/api/logs/global?entityType=Store&limit=5`);
    const j = await r.json().catch(() => ({}));
    const logs = j.auditLogs || j.logs || j.items || (Array.isArray(j) ? j : []);
    report.scenarios['12.5_global_logs_filter_entity'] = {
      status: r.status(),
      count: logs.length,
      allMatch: logs.every(l => l.entityType === 'Store'),
    };
  }

  // === 12.6 Global logs — invalid limit ===
  {
    const r = await adminCtx.request.get(`${API}/api/logs/global?limit=99999`);
    report.scenarios['12.6_global_logs_invalid_limit'] = { status: r.status() };
  }

  // === 12.7 Store-specific logs — admin can read any ===
  {
    const sR = await adminCtx.request.get(`${API}/api/stores`);
    const sJ = await sR.json();
    const arr = sJ.stores || sJ.items || [];
    const someStore = arr.find(s => s.status === 'active');
    if (someStore) {
      const r = await adminCtx.request.get(`${API}/api/stores/${someStore.id}/logs?limit=10`);
      const j = await r.json().catch(() => ({}));
      const logs = j.auditLogs || j.logs || j.items || (Array.isArray(j) ? j : []);
      report.scenarios['12.7_store_logs_admin'] = { status: r.status(), count: logs.length, storeId: someStore.id };
    }
  }

  await adminCtx.close();

  // === 12.8 Operator dashboard UI ===
  const opCtx = await browser.newContext();
  await apiLogin(opCtx, QA_OP);
  {
    const page = await opCtx.newPage();
    await page.goto(`${FE}/`, { waitUntil: 'domcontentloaded' });
    await sleep(3000);
    const body = (await page.locator('body').textContent({ timeout: 2000 }).catch(() => '')) || '';
    await shot(page, shotPath(block, '12-8-operator-dashboard'));
    report.scenarios['12.8_ui_operator_dashboard'] = {
      url: page.url(),
      hasAssignedStores: /Operator|assigned stores|Assigned stores/i.test(body),
      hasFleetOverview: /Fleet overview/i.test(body), // operator should NOT see global fleet
    };
    await page.close();
  }

  // === 12.9 Operator forbidden from admin dashboard API ===
  {
    const r = await opCtx.request.get(`${API}/api/admin/dashboard`);
    report.scenarios['12.9_operator_admin_dashboard_forbidden'] = { status: r.status() };
  }

  // === 12.10 Operator forbidden from global logs ===
  {
    const r = await opCtx.request.get(`${API}/api/logs/global?limit=5`);
    report.scenarios['12.10_operator_global_logs_forbidden'] = { status: r.status() };
  }

  // === 12.11 Operator CAN read assigned-store logs ===
  {
    const sR = await opCtx.request.get(`${API}/api/stores`);
    const sJ = await sR.json();
    const arr = sJ.stores || sJ.items || [];
    if (arr.length > 0) {
      const r = await opCtx.request.get(`${API}/api/stores/${arr[0].id}/logs?limit=5`);
      const j = await r.json().catch(() => ({}));
      const logs = j.auditLogs || j.logs || j.items || (Array.isArray(j) ? j : []);
      report.scenarios['12.11_operator_assigned_store_logs'] = { status: r.status(), count: logs.length, storeId: arr[0].id };
    }
  }

  // === 12.12 Operator CANNOT read logs for unassigned store ===
  {
    // Use one of the Wave3 newly-created stores (operator doesn't have access)
    const adminCtx2 = await browser.newContext();
    await apiLogin(adminCtx2, QA_ADMIN);
    const sR = await adminCtx2.request.get(`${API}/api/stores`);
    const sJ = await sR.json();
    const arr = sJ.stores || sJ.items || [];
    const w3 = arr.find(s => s.code && s.code.startsWith('QA-W3-'));
    if (w3) {
      const r = await opCtx.request.get(`${API}/api/stores/${w3.id}/logs`);
      report.scenarios['12.12_operator_unassigned_store_logs_forbidden'] = { status: r.status(), targetStoreId: w3.id };
    }
    await adminCtx2.close();
  }

  await opCtx.close();
  await browser.close();
  report.finishedAt = new Date().toISOString();
  writeReport(block, report);
  console.log('\n=== BLOCK 12 SUMMARY ===');
  console.log(JSON.stringify(report.scenarios, null, 2));
})();
