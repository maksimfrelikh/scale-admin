const H = require('./helpers/common.cjs');
const { chromium, API, QA_ADMIN, apiLogin } = H;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const ar = await apiLogin(ctx, QA_ADMIN);
  const csrf = ar.csrf;

  // Find one of the existing Wave3 publishing stores
  const sR = await ctx.request.get(`${API}/api/stores`);
  const sJ = await sR.json();
  const arr = sJ.stores || sJ.items || [];
  const w3 = arr.find(s => s.code && s.code.startsWith('QA-W3-PUB-'));
  console.log('using store:', w3?.id, w3?.code);

  // Validation
  const vR = await ctx.request.post(`${API}/api/stores/${w3.id}/publishing/catalog-validation`, { headers: { 'x-csrf-token': csrf } });
  const vJ = await vR.json();
  console.log('validation:', JSON.stringify(vJ).slice(0, 800));

  // Package
  const pR = await ctx.request.post(`${API}/api/stores/${w3.id}/publishing/catalog-package`, { headers: { 'x-csrf-token': csrf } });
  const pJ = await pR.json();
  console.log('package top-level keys:', Object.keys(pJ));
  console.log('package data:', JSON.stringify(pJ).slice(0, 2000));

  await browser.close();
})();
