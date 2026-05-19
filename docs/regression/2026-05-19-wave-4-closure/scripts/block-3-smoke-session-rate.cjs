/**
 * Wave 4 closure — Block 3: smoke probe + Wave-1 regression guard on
 * /api/auth/session polling rate.
 *
 * Smoke (HTTP through nginx, follow redirects, persist cookies):
 *   1) CSRF + login as admin
 *   2) GET /api/health
 *   3) GET / (dashboard renders)
 *   4) GET /api/stores -> capture first storeId
 *   5) GET /api/stores/:id (store detail)
 *   6) GET /api/advertising/banners?storeId=:id
 *   7) GET /api/auth/csrf again (still 200)
 *
 * Session-rate guard:
 *   Open the dashboard in headless Chromium and watch network for 2 minutes.
 *   Count requests to /api/auth/session. PASS if sustained < 2 req/min.
 */
const H = require('./helpers/staging.cjs');
const { chromium, FE, API, QA_ADMIN, apiLogin, getCsrfRequest, sleep, log, writeReport, ev } = H;

(async () => {
  const T0 = Date.now();
  const scenarios = [];
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();

  // S1 — login
  log('block-3.s1', 'admin login');
  const t1 = Date.now();
  const login = await apiLogin(ctx, QA_ADMIN);
  scenarios.push({
    id: 'smoke-1-login',
    desc: 'POST /api/auth/login (admin)',
    request: { method: 'POST', url: `${API}/api/auth/login`, body: { email: QA_ADMIN.email, password: '***' } },
    response: { status: login.status, body: JSON.stringify(login.body).slice(0, 400) },
    expected: 'HTTP 200, session cookie set',
    elapsedMs: Date.now() - t1,
    pass: login.status === 200 && !!login.body?.user?.id,
  });
  if (login.status !== 200) {
    console.error('login failed', login.status, login.body);
    process.exit(2);
  }

  // S2 — /api/health
  {
    const t0 = Date.now();
    const r = await ctx.request.get(`${API}/api/health`);
    const text = (await r.text()).slice(0, 400);
    scenarios.push({
      id: 'smoke-2-health',
      desc: 'GET /api/health',
      request: { method: 'GET', url: `${API}/api/health` },
      response: { status: r.status(), body: text },
      expected: 'HTTP 200',
      elapsedMs: Date.now() - t0,
      pass: r.status() === 200,
    });
  }

  // S3 — dashboard (FE) — Vite SPA, asserts shell + bundle ref
  {
    const t0 = Date.now();
    const r = await ctx.request.get(`${FE}/`);
    const text = (await r.text()).slice(0, 600);
    scenarios.push({
      id: 'smoke-3-dashboard',
      desc: 'GET / (Vite SPA shell)',
      request: { method: 'GET', url: `${FE}/` },
      response: { status: r.status(), body: text },
      expected: 'HTTP 200, SPA shell with /assets/index-*.js + #root',
      elapsedMs: Date.now() - t0,
      pass: r.status() === 200 && /<title>Scale Admin<\/title>/.test(text) && /\/assets\/index-[^"]+\.js/.test(text) && /id="root"/.test(text),
    });
  }

  // S4 — list stores
  let firstStoreId = null;
  {
    const t0 = Date.now();
    const r = await ctx.request.get(`${API}/api/stores`);
    const j = await r.json().catch(() => ({}));
    firstStoreId = j.stores?.[0]?.id || null;
    scenarios.push({
      id: 'smoke-4-stores',
      desc: 'GET /api/stores',
      request: { method: 'GET', url: `${API}/api/stores` },
      response: { status: r.status(), body: JSON.stringify(j).slice(0, 400) },
      expected: 'HTTP 200 with stores[]',
      elapsedMs: Date.now() - t0,
      pass: r.status() === 200 && Array.isArray(j.stores),
      firstStoreId,
    });
  }

  // S5 — store detail (only if we have an id)
  if (firstStoreId) {
    const t0 = Date.now();
    const r = await ctx.request.get(`${API}/api/stores/${firstStoreId}`);
    const j = await r.json().catch(() => ({}));
    scenarios.push({
      id: 'smoke-5-store-detail',
      desc: `GET /api/stores/${firstStoreId}`,
      request: { method: 'GET', url: `${API}/api/stores/${firstStoreId}` },
      response: { status: r.status(), body: JSON.stringify(j).slice(0, 400) },
      expected: 'HTTP 200',
      elapsedMs: Date.now() - t0,
      pass: r.status() === 200 && !!(j.store?.id || j.id),
    });
  }

  // S6 — list banners for that store (canonical nested route)
  // NB: brief listed flat /api/advertising/banners?storeId=… but actual route
  // is nested under stores per advertising.controller.ts:31. Logged as side
  // finding in SUMMARY.md.
  if (firstStoreId) {
    const t0 = Date.now();
    const url = `${API}/api/stores/${firstStoreId}/advertising/banners`;
    const r = await ctx.request.get(url);
    const j = await r.json().catch(() => ({}));
    scenarios.push({
      id: 'smoke-6-banners-list',
      desc: `GET /api/stores/${firstStoreId}/advertising/banners`,
      request: { method: 'GET', url },
      response: { status: r.status(), body: JSON.stringify(j).slice(0, 400) },
      expected: 'HTTP 200 with banners[]',
      elapsedMs: Date.now() - t0,
      pass: r.status() === 200 && Array.isArray(j.banners),
    });
  }

  // S7 — fresh CSRF still 200
  {
    const t0 = Date.now();
    const r = await ctx.request.get(`${API}/api/auth/csrf`);
    const j = await r.json().catch(() => ({}));
    scenarios.push({
      id: 'smoke-7-csrf',
      desc: 'GET /api/auth/csrf',
      request: { method: 'GET', url: `${API}/api/auth/csrf` },
      response: { status: r.status(), body: JSON.stringify(j).slice(0, 200) },
      expected: 'HTTP 200 with csrfToken',
      elapsedMs: Date.now() - t0,
      pass: r.status() === 200 && typeof j.csrfToken === 'string' && j.csrfToken.length > 8,
    });
  }

  // Session-rate guard: open dashboard, count /api/auth/session calls over 2 minutes
  log('block-3.rate', 'opening page, monitoring /api/auth/session for 120s');
  const page = await ctx.newPage();
  const sessionHits = [];
  page.on('request', req => {
    const u = req.url();
    if (u.includes('/api/auth/session')) {
      sessionHits.push({ t: Date.now(), method: req.method(), url: u });
    }
  });
  const rateWindowStart = Date.now();
  await page.goto(`${FE}/`, { waitUntil: 'domcontentloaded' });
  // Wait the full 2-minute window
  const WINDOW_MS = 120_000;
  while (Date.now() - rateWindowStart < WINDOW_MS) {
    await sleep(2_000);
  }
  const elapsedMin = (Date.now() - rateWindowStart) / 60_000;
  const ratePerMin = sessionHits.length / elapsedMin;
  log('block-3.rate', `sessionHits=${sessionHits.length} over ${elapsedMin.toFixed(2)} min → ${ratePerMin.toFixed(2)}/min`);

  const ratePass = ratePerMin < 2.0;
  scenarios.push({
    id: 'rate-1-session-poll',
    desc: '/api/auth/session call rate over 2-minute window on dashboard',
    request: { method: 'OBSERVE', url: `${FE}/ → /api/auth/session` },
    response: {
      status: 'OK',
      body: JSON.stringify({ sessionHits: sessionHits.length, windowMinutes: +elapsedMin.toFixed(2), ratePerMin: +ratePerMin.toFixed(2) }),
    },
    expected: 'sustained < 2 calls/min (Wave 1 regression guard)',
    elapsedMs: Date.now() - rateWindowStart,
    pass: ratePass,
    sessionHits,
  });

  // Also dump the session-rate hit log to its own file for evidence
  require('fs').writeFileSync(ev('session-rate.json'), JSON.stringify({
    windowMinutes: +elapsedMin.toFixed(2),
    sessionHitsCount: sessionHits.length,
    ratePerMin: +ratePerMin.toFixed(2),
    sampleHits: sessionHits.slice(0, 10),
    rawHits: sessionHits,
  }, null, 2));

  // dashboard screenshot for evidence
  try { await page.screenshot({ path: ev('block-3-dashboard.png'), fullPage: false }); } catch {}

  const passed = scenarios.filter(s => s.pass).length;
  const total = scenarios.length;
  const allMs = scenarios.map(s => s.elapsedMs).sort((a, b) => a - b);
  const median = allMs.length ? allMs[Math.floor(allMs.length / 2)] : 0;

  writeReport('block-3-smoke-report', {
    block: 'Smoke+SessionRate',
    verdict: passed === total ? 'PASS' : 'FAIL',
    passed,
    total,
    medianMs: median,
    totalElapsedMs: Date.now() - T0,
    firstStoreId,
    sessionRate: { windowMinutes: +elapsedMin.toFixed(2), sessionHits: sessionHits.length, ratePerMin: +ratePerMin.toFixed(2), pass: ratePass },
    scenarios,
  });

  log('block-3.done', `${passed}/${total} passed, median ${median}ms`);
  await browser.close();
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(3); });
