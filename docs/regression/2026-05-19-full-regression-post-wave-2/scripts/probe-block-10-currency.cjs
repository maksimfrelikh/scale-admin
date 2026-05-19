const H = require('./helpers/common.cjs');
const { chromium, API, QA_ADMIN, apiLogin } = H;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const ar = await apiLogin(ctx, QA_ADMIN);
  const csrf = ar.csrf;

  // Fresh setup
  const sR = await ctx.request.post(`${API}/api/stores`, {
    data: { code: `qa-w3-pubprobe-${Date.now()}`, name: 'PubProbe', timezone: 'Europe/Moscow' },
    headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
  });
  const storeId = (await sR.json()).store.id;

  const cR = await ctx.request.post(`${API}/api/stores/${storeId}/catalog/categories`, {
    data: { name: 'CCC', status: 'active' },
    headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
  });
  const cj = await cR.json();
  const catId = cj.id || cj.category?.id;

  const plu = String(8100000000000n + BigInt(Math.floor(Math.random() * 1e9))).slice(0, 13);
  const pR = await ctx.request.post(`${API}/api/products`, {
    data: { defaultPluCode: plu, name: 'CP ' + Date.now(), shortName: 'CP', unit: 'g', status: 'active' },
    headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
  });
  const pj = await pR.json();
  const prodId = pj.id || pj.product?.id;

  await ctx.request.post(`${API}/api/stores/${storeId}/catalog/placements`, {
    data: { categoryId: catId, productId: prodId, status: 'active' },
    headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
  });

  await ctx.request.put(`${API}/api/stores/${storeId}/prices`, {
    data: { productId: prodId, price: 123.45, currency: 'RUB' },
    headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
  });

  // Publish
  const pubR = await ctx.request.post(`${API}/api/stores/${storeId}/publishing/catalog-publish`, { headers: { 'x-csrf-token': csrf } });
  const pubJ = await pubR.json();
  console.log('publish keys:', Object.keys(pubJ));
  console.log('catalogVersion top-level keys:', pubJ.catalogVersion ? Object.keys(pubJ.catalogVersion) : 'none');
  const packData = pubJ.catalogVersion?.packageData || pubJ.packageData;
  if (packData) {
    console.log('packageData keys:', Object.keys(packData));
    console.log('packageData.categories[0]:', JSON.stringify(packData.categories?.[0] || {}, null, 2).slice(0, 1500));
  }

  // Find currency mentions deep
  const fullJson = JSON.stringify(pubJ);
  console.log('--- currency occurrences ---');
  const m = fullJson.match(/"currency"\s*:\s*"[A-Z]{3}"/g);
  console.log('currency fields:', m);

  // Immutability test — try to mutate version
  const versionId = pubJ.catalogVersion?.id;
  if (versionId) {
    const patchR = await ctx.request.patch(`${API}/api/stores/${storeId}/publishing/catalog-versions/${versionId}`, {
      data: { versionNumber: 999 },
      headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
    });
    console.log('PATCH version attempt:', patchR.status());
  }

  await browser.close();
})();
