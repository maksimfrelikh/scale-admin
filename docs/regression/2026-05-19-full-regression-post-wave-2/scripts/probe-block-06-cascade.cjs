const H = require('./helpers/common.cjs');
const { chromium, API, QA_ADMIN, apiLogin } = H;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const ar = await apiLogin(ctx, QA_ADMIN);
  const csrf = ar.csrf;

  // Setup mini scenario
  const sR = await ctx.request.post(`${API}/api/stores`, {
    data: { code: `qa-w3-cp-${Date.now()}`, name: 'CascadeProbe', timezone: 'Europe/Moscow' },
    headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
  });
  const storeId = (await sR.json()).store.id;
  console.log('store:', storeId);

  const cA = await ctx.request.post(`${API}/api/stores/${storeId}/catalog/categories`, {
    data: { name: 'CatA', status: 'active' }, headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
  });
  const cAj = await cA.json();
  const catId = cAj.id || cAj.category?.id;
  console.log('cat:', catId);

  const plu = String(7500000000000n + BigInt(Math.floor(Math.random() * 1e9))).slice(0, 13);
  const p = await ctx.request.post(`${API}/api/products`, {
    data: { defaultPluCode: plu, name: 'CascadeProbeP', shortName: 'C', unit: 'g', status: 'active' },
    headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
  });
  const pj = await p.json();
  const pid = pj.id || pj.product?.id;
  console.log('product:', pid);

  // Create placement
  await ctx.request.post(`${API}/api/stores/${storeId}/catalog/placements`, {
    data: { categoryId: catId, productId: pid, status: 'active' },
    headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
  });

  // Pre-archive: list active
  const beforeActive = await ctx.request.get(`${API}/api/stores/${storeId}/catalog/placements?categoryId=${catId}&status=active`);
  const beforeJ = await beforeActive.json();
  console.log('pre-archive active count:', (beforeJ.placements || beforeJ.items || []).length);

  // Archive category
  await ctx.request.patch(`${API}/api/stores/${storeId}/catalog/categories/${catId}`, {
    data: { status: 'archived' },
    headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
  });

  // Post-archive: list active, list archived
  const afterActive = await ctx.request.get(`${API}/api/stores/${storeId}/catalog/placements?categoryId=${catId}&status=active`);
  const afterArchived = await ctx.request.get(`${API}/api/stores/${storeId}/catalog/placements?categoryId=${catId}&status=archived`);
  const aJ = await afterActive.json();
  const arJ = await afterArchived.json();
  console.log('post-archive active count:', (aJ.placements || aJ.items || []).length);
  console.log('post-archive archived count:', (arJ.placements || arJ.items || []).length);

  await browser.close();
})();
