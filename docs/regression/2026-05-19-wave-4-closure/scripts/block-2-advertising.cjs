/**
 * Wave 4 closure — Block 2: Advertising banner imageUrl validation (BUG-REG-040).
 * Target: https://staging.maksimfrelikh.ru
 * Route: POST/PATCH /api/stores/:storeId/advertising/banners
 */
const H = require('./helpers/staging.cjs');
const { chromium, API, QA_ADMIN, apiLogin, getCsrfRequest, sanitizeResp, writeReport, log, sleep } = H;

(async () => {
  const T0 = Date.now();
  const scenarios = [];

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();

  log('block-2.login', 'admin login');
  const login = await apiLogin(ctx, QA_ADMIN);
  if (login.status !== 200) {
    console.error('login failed', login.status, login.body);
    process.exit(2);
  }

  // List stores, pick first
  const storesR = await ctx.request.get(`${API}/api/stores`);
  const storesJ = await storesR.json();
  const storeId = storesJ.stores?.[0]?.id;
  if (!storeId) {
    console.error('no store available'); process.exit(2);
  }
  log('block-2.store', storeId);

  // refresh CSRF *immediately* before each mutating request to handle rotation
  async function csrfNow() { return await getCsrfRequest(ctx); }

  async function createBanner(label, imageUrl, expectStatus) {
    const csrf = await csrfNow();
    const t0 = Date.now();
    const r = await ctx.request.post(`${API}/api/stores/${storeId}/advertising/banners`, {
      data: { imageUrl, status: 'active', sortOrder: 0 },
      headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
    });
    const text = await r.text();
    let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
    const respExcerpt = text.slice(0, 400);
    const elapsed = Date.now() - t0;

    let pass;
    if (expectStatus === 201) {
      pass = r.status() === 201 && parsed?.banner?.id;
    } else {
      const msg = (parsed && typeof parsed === 'object' && (parsed.message || parsed.error)) ? String(parsed.message || parsed.error) : respExcerpt;
      pass = r.status() === 400 && /imageUrl.*valid http\(s\) URL|imageUrl is required/i.test(msg);
    }

    return {
      id: label,
      desc: `POST banner imageUrl=${JSON.stringify(imageUrl)}`,
      request: { method: 'POST', url: `${API}/api/stores/${storeId}/advertising/banners`, body: { imageUrl, status: 'active', sortOrder: 0 } },
      response: { status: r.status(), body: respExcerpt },
      expected: `HTTP ${expectStatus}${expectStatus === 400 ? ' with imageUrl validation error' : ''}`,
      elapsedMs: elapsed,
      pass,
      bannerId: parsed?.banner?.id || null,
    };
  }

  async function patchBanner(label, bannerId, imageUrl, expectStatus) {
    const csrf = await csrfNow();
    const t0 = Date.now();
    const r = await ctx.request.patch(`${API}/api/stores/${storeId}/advertising/banners/${bannerId}`, {
      data: { imageUrl },
      headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
    });
    const text = await r.text();
    let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
    const respExcerpt = text.slice(0, 400);
    const elapsed = Date.now() - t0;

    let pass;
    if (expectStatus === 200) {
      pass = r.status() === 200 && parsed?.banner?.imageUrl === imageUrl;
    } else {
      const msg = (parsed && typeof parsed === 'object' && (parsed.message || parsed.error)) ? String(parsed.message || parsed.error) : respExcerpt;
      pass = r.status() === 400 && /imageUrl.*valid http\(s\) URL|imageUrl is required/i.test(msg);
    }

    return {
      id: label,
      desc: `PATCH banner ${bannerId.slice(0, 8)}… imageUrl=${JSON.stringify(imageUrl)}`,
      request: { method: 'PATCH', url: `${API}/api/stores/${storeId}/advertising/banners/${bannerId}`, body: { imageUrl } },
      response: { status: r.status(), body: respExcerpt },
      expected: `HTTP ${expectStatus}${expectStatus === 400 ? ' with imageUrl validation error' : ''}`,
      elapsedMs: elapsed,
      pass,
    };
  }

  // S1 — create valid (will be our PATCH target later)
  log('block-2.s1', 'create valid banner');
  const s1 = await createBanner('adv-1-create-valid', 'https://example.com/banner.png', 201);
  scenarios.push(s1);
  const validBannerId = s1.bannerId;
  log('s1', `${s1.response.status} pass=${s1.pass} id=${validBannerId}`);

  // S2 — javascript: scheme
  log('block-2.s2', 'create with javascript: scheme');
  scenarios.push(await createBanner('adv-2-create-javascript', 'javascript:alert(1)', 400));

  // S3 — data: URI
  log('block-2.s3', 'create with data: URI');
  scenarios.push(await createBanner('adv-3-create-data', 'data:image/png;base64,iVBORw0KGgo...', 400));

  // S4 — not-a-url
  log('block-2.s4', 'create with not-a-url');
  scenarios.push(await createBanner('adv-4-create-not-url', 'not-a-url', 400));

  // S5 — ftp://
  log('block-2.s5', 'create with ftp://');
  scenarios.push(await createBanner('adv-5-create-ftp', 'ftp://example.com/x.png', 400));

  // S6 — PATCH with invalid (parity)
  if (validBannerId) {
    log('block-2.s6a', 'patch with javascript:');
    scenarios.push(await patchBanner('adv-6a-patch-javascript', validBannerId, 'javascript:alert(1)', 400));
    log('block-2.s6b', 'patch with data:');
    scenarios.push(await patchBanner('adv-6b-patch-data', validBannerId, 'data:image/png;base64,xxx', 400));
    log('block-2.s6c', 'patch with not-a-url');
    scenarios.push(await patchBanner('adv-6c-patch-not-url', validBannerId, 'not-a-url', 400));
    log('block-2.s6d', 'patch with ftp://');
    scenarios.push(await patchBanner('adv-6d-patch-ftp', validBannerId, 'ftp://example.com/x.png', 400));

    // S7 — PATCH with valid
    log('block-2.s7', 'patch with valid URL');
    scenarios.push(await patchBanner('adv-7-patch-valid', validBannerId, 'https://example.com/banner2.png', 200));

    // Cleanup — archive the banner via status change
    log('block-2.cleanup', 'archive banner');
    const csrf = await csrfNow();
    const archR = await ctx.request.patch(`${API}/api/stores/${storeId}/advertising/banners/${validBannerId}/status`, {
      data: { status: 'archived' },
      headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
    });
    log('cleanup status', archR.status());
  } else {
    log('block-2.skip-patch', 'no valid banner id — skipping PATCH scenarios');
  }

  const passed = scenarios.filter(s => s.pass).length;
  const total = scenarios.length;
  const allMs = scenarios.map(s => s.elapsedMs).sort((a, b) => a - b);
  const median = allMs.length ? allMs[Math.floor(allMs.length / 2)] : 0;

  writeReport('block-2-advertising-report', {
    block: 'Advertising',
    verdict: passed === total ? 'PASS' : 'FAIL',
    passed,
    total,
    medianMs: median,
    totalElapsedMs: Date.now() - T0,
    storeId,
    createdBannerId: validBannerId,
    cleanupAttempted: true,
    scenarios,
  });

  log('block-2.done', `${passed}/${total} passed, median ${median}ms`);
  await browser.close();
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(3); });
