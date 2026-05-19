const H = require('./helpers/common.cjs');
const { chromium, API, QA_ADMIN, apiLogin } = H;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  await apiLogin(ctx, QA_ADMIN);

  // No filter
  const r1 = await ctx.request.get(`${API}/api/logs/global?limit=20`);
  const j1 = await r1.json();
  const types = (j1.auditLogs || []).map(l => l.entityType);
  console.log('all entityTypes in first 20:', [...new Set(types)]);

  // Filter Store
  const r2 = await ctx.request.get(`${API}/api/logs/global?entityType=Store&limit=20`);
  const j2 = await r2.json();
  const filteredTypes = (j2.auditLogs || []).map(l => l.entityType);
  console.log('filtered entityTypes (?entityType=Store):', filteredTypes);
  console.log('all match?', filteredTypes.every(t => t === 'Store'));

  // Try exact match
  const r3 = await ctx.request.get(`${API}/api/logs/global?entityType=Store`);
  const j3 = await r3.json();
  console.log('plain Store filter sample:', (j3.auditLogs || []).slice(0, 3).map(l => ({ action: l.action, entityType: l.entityType })));

  // Try action filter
  const r4 = await ctx.request.get(`${API}/api/logs/global?action=auth.login_succeeded&limit=10`);
  const j4 = await r4.json();
  const actions = (j4.auditLogs || []).map(l => l.action);
  console.log('action=auth.login_succeeded:', [...new Set(actions)], 'count:', actions.length);

  await browser.close();
})();
