/**
 * BLOCK 10 — Publishing: validation, packageData shape, RUB-only defence-in-depth, CatalogVersion immutability.
 */
const H = require('./helpers/common.cjs');
const { chromium, API, QA_ADMIN, sleep, log, writeReport, apiLogin } = H;

(async () => {
  const block = 'block-10';
  const report = { startedAt: new Date().toISOString(), scenarios: {} };
  const browser = await chromium.launch({ headless: true });

  const adminCtx = await browser.newContext();
  const adminLogin = await apiLogin(adminCtx, QA_ADMIN);
  const adminCsrf = adminLogin.csrf;
  log('admin login', adminLogin.status);

  // Setup full pipeline: store + cat + product (with price) + placement
  let storeId, catId, prodId;
  {
    const sR = await adminCtx.request.post(`${API}/api/stores`, {
      data: { code: `qa-w3-pub-${Date.now()}`, name: 'Wave3 Publishing Test', timezone: 'Europe/Moscow' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    storeId = (await sR.json()).store.id;

    const cR = await adminCtx.request.post(`${API}/api/stores/${storeId}/catalog/categories`, {
      data: { name: 'PubCat', status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const cJ = await cR.json();
    catId = cJ.id || cJ.category?.id;

    const plu = String(7900000000000n + BigInt(Math.floor(Math.random() * 1e9))).slice(0, 13);
    const pR = await adminCtx.request.post(`${API}/api/products`, {
      data: { defaultPluCode: plu, name: 'PubProd ' + Date.now(), shortName: 'PP', unit: 'g', status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const pJ = await pR.json();
    prodId = pJ.id || pJ.product?.id;

    await adminCtx.request.post(`${API}/api/stores/${storeId}/catalog/placements`, {
      data: { categoryId: catId, productId: prodId, status: 'active' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });

    report.scenarios['10.0_setup'] = { storeId, catId, prodId };
  }

  // === 10.1 Validation BEFORE setting price — should warn/fail (missing price) ===
  {
    const r = await adminCtx.request.post(`${API}/api/stores/${storeId}/publishing/catalog-validation`, {
      headers: { 'x-csrf-token': adminCsrf },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['10.1_validate_no_price'] = { status: r.status(), ok: j.ok || j.valid, issuesCount: (j.issues || j.errors || []).length, issuesSample: (j.issues || j.errors || []).slice(0, 3) };
  }

  // === 10.2 Set price (RUB) ===
  {
    const r = await adminCtx.request.put(`${API}/api/stores/${storeId}/prices`, {
      data: { productId: prodId, price: 49.99, currency: 'RUB' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    report.scenarios['10.2_set_price'] = { status: r.status() };
  }

  // === 10.3 Validation AFTER price ===
  {
    const r = await adminCtx.request.post(`${API}/api/stores/${storeId}/publishing/catalog-validation`, {
      headers: { 'x-csrf-token': adminCsrf },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['10.3_validate_after_price'] = { status: r.status(), ok: j.ok || j.valid, issuesCount: (j.issues || j.errors || []).length };
  }

  // === 10.4 Generate catalog-package (without publish) ===
  {
    const r = await adminCtx.request.post(`${API}/api/stores/${storeId}/publishing/catalog-package`, {
      headers: { 'x-csrf-token': adminCsrf },
    });
    const j = await r.json().catch(() => ({}));
    const productCurrencies = (j.packageData?.products || []).map(p => p.price?.currency).filter(Boolean);
    report.scenarios['10.4_generate_package'] = {
      status: r.status(),
      hasPackageData: !!j.packageData,
      catalogVersionId: j.packageData?.catalogVersionId || j.catalogVersionId,
      storeRef: j.packageData?.store?.code || j.packageData?.store?.id,
      productCount: (j.packageData?.products || []).length,
      categoryCount: (j.packageData?.categories || []).length,
      bannerCount: (j.packageData?.banners || []).length,
      uniqueCurrencies: [...new Set(productCurrencies)],
      onlyRUB: productCurrencies.every(c => c === 'RUB'),
    };
  }

  // === 10.5 Publish ===
  let publishedVersion;
  {
    const r = await adminCtx.request.post(`${API}/api/stores/${storeId}/publishing/catalog-publish`, {
      headers: { 'x-csrf-token': adminCsrf },
    });
    const j = await r.json().catch(() => ({}));
    publishedVersion = j.catalogVersion || j.version || j;
    report.scenarios['10.5_publish'] = {
      status: r.status(),
      catalogVersionId: publishedVersion?.id || publishedVersion?.catalogVersion?.id,
      versionNumber: publishedVersion?.versionNumber || publishedVersion?.catalogVersion?.versionNumber,
      hasPackageData: !!publishedVersion?.packageData || !!publishedVersion?.catalogVersion?.packageData,
    };
  }

  // === 10.6 List versions — should include the new one ===
  {
    const r = await adminCtx.request.get(`${API}/api/stores/${storeId}/publishing/catalog-versions`);
    const j = await r.json().catch(() => ({}));
    const versions = j.versions || j.catalogVersions || j.items || (Array.isArray(j) ? j : []);
    report.scenarios['10.6_list_versions'] = { status: r.status(), count: versions.length, latestVersion: versions[0]?.versionNumber };
  }

  // === 10.7 Publish AGAIN with no changes — should still succeed or be idempotent? ===
  {
    const r = await adminCtx.request.post(`${API}/api/stores/${storeId}/publishing/catalog-publish`, {
      headers: { 'x-csrf-token': adminCsrf },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['10.7_publish_again_no_change'] = {
      status: r.status(),
      versionNumber: j.catalogVersion?.versionNumber || j.versionNumber,
      msg: (j.message || '').slice(0, 100),
    };
  }

  // === 10.8 Change something, then publish ===
  {
    await adminCtx.request.put(`${API}/api/stores/${storeId}/prices`, {
      data: { productId: prodId, price: 55.55, currency: 'RUB' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const r = await adminCtx.request.post(`${API}/api/stores/${storeId}/publishing/catalog-publish`, {
      headers: { 'x-csrf-token': adminCsrf },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['10.8_publish_after_change'] = {
      status: r.status(),
      versionNumber: j.catalogVersion?.versionNumber || j.versionNumber,
    };
  }

  // === 10.9 Catalog versions list reflects the new publish ===
  {
    const r = await adminCtx.request.get(`${API}/api/stores/${storeId}/publishing/catalog-versions`);
    const j = await r.json().catch(() => ({}));
    const versions = j.versions || j.catalogVersions || j.items || (Array.isArray(j) ? j : []);
    report.scenarios['10.9_list_versions_after_change'] = { count: versions.length, versions: versions.map(v => v.versionNumber || v.id).slice(0, 5) };
  }

  // === 10.10 Validation with archived category (placement should fail) ===
  {
    // Archive PubCat (which contains our active placement)
    await adminCtx.request.patch(`${API}/api/stores/${storeId}/catalog/categories/${catId}`, {
      data: { status: 'archived' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    await sleep(300);
    const r = await adminCtx.request.post(`${API}/api/stores/${storeId}/publishing/catalog-validation`, {
      headers: { 'x-csrf-token': adminCsrf },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['10.10_validation_archived_cascade'] = {
      status: r.status(),
      ok: j.ok || j.valid,
      issuesCount: (j.issues || j.errors || []).length,
      issuesSample: (j.issues || j.errors || []).slice(0, 3),
    };
  }

  // === 10.11 Try to publish with invalid state — should fail or warn ===
  {
    const r = await adminCtx.request.post(`${API}/api/stores/${storeId}/publishing/catalog-publish`, {
      headers: { 'x-csrf-token': adminCsrf },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['10.11_publish_with_invalid'] = {
      status: r.status(),
      msg: (j.message || '').slice(0, 150),
    };
  }

  await adminCtx.close();
  await browser.close();
  report.finishedAt = new Date().toISOString();
  writeReport(block, report);
  console.log('\n=== BLOCK 10 SUMMARY ===');
  console.log(JSON.stringify(report.scenarios, null, 2));
})();
