const H = require('./helpers/common.cjs');
const { chromium, API, QA_ADMIN, apiLogin } = H;
const { randomUUID } = require('crypto');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const ar = await apiLogin(ctx, QA_ADMIN);
  const csrf = ar.csrf;

  // Find existing Wave3 scale store
  const sR = await ctx.request.get(`${API}/api/stores`);
  const sJ = await sR.json();
  const arr = sJ.stores || sJ.items || [];
  const w3 = arr.find(s => s.code && s.code.startsWith('QA-W3-SC-'));
  console.log('using store:', w3?.id);

  // Get device from store
  const dR = await ctx.request.get(`${API}/api/stores/${w3.id}/scales`);
  const dJ = await dR.json();
  const devices = dJ.devices || dJ.scales || [];
  const d = devices[0];
  console.log('device:', d?.id, 'token has-shape:', d?.apiToken ? 'yes' : 'no');

  // Existing device — but we don't have plaintext apiToken. Need to regenerate.
  const regenR = await ctx.request.post(`${API}/api/scales/${d.id}/regenerate-token`, { headers: { 'x-csrf-token': csrf } });
  const regenJ = await regenR.json();
  const apiToken = regenJ.apiToken || regenJ.device?.apiToken;
  console.log('regen token:', apiToken?.slice(0, 8) + '...');

  // Test 1: random NEW valid UUID (definitely not in DB)
  const ghostUuid = randomUUID();
  console.log('---- Test ghost UUID (well-formed, not in DB) ----');
  console.log('ghost UUID:', ghostUuid);
  const r1 = await ctx.request.post(`${API}/api/scales/check-update`, {
    data: { currentCatalogVersionId: ghostUuid },
    headers: { 'x-scale-device-code': d.deviceCode, 'x-scale-api-token': apiToken, 'Content-Type': 'application/json' },
  });
  const j1 = await r1.json().catch(() => ({}));
  console.log('status:', r1.status());
  console.log('body:', JSON.stringify(j1).slice(0, 500));

  // Test 2: a real version ID from another store (cross-store contamination)
  const versionsR = await ctx.request.get(`${API}/api/stores/${w3.id}/publishing/catalog-versions`);
  const versionsJ = await versionsR.json();
  const versions = versionsJ.versions || versionsJ.catalogVersions || [];
  console.log('this store versions:', versions.map(v => v.id));

  await browser.close();
})();
