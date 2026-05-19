const H = require('./helpers/common.cjs');
const { chromium, API, QA_ADMIN, apiLogin } = H;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const ar = await apiLogin(ctx, QA_ADMIN);
  const csrf = ar.csrf;
  console.log('login:', ar.status);

  const code = `qa-w3-pl-${Date.now()}`;
  console.log('creating store code:', code);
  const sR = await ctx.request.post(`${API}/api/stores`, {
    data: { code, name: 'Wave3 Placements Test', timezone: 'Europe/Moscow' },
    headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
  });
  console.log('store create status:', sR.status());
  const sJ = await sR.json().catch(() => ({}));
  console.log('store create body:', JSON.stringify(sJ).slice(0, 300));

  if (sJ.id) {
    const cR = await ctx.request.post(`${API}/api/stores/${sJ.id}/catalog/categories`, {
      data: { name: 'CatA', status: 'active' },
      headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
    });
    console.log('cat create status:', cR.status());
    const cJ = await cR.json().catch(() => ({}));
    console.log('cat create body:', JSON.stringify(cJ).slice(0, 300));
  }

  await browser.close();
})();
