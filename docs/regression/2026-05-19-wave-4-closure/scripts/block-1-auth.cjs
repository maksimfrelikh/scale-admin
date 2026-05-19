/**
 * Wave 4 closure — Block 1: Auth + Invite email validation (BUG-REG-039).
 * Target: https://staging.maksimfrelikh.ru
 */
const H = require('./helpers/staging.cjs');
const { chromium, FE, API, QA_ADMIN, apiLogin, getCsrfRequest, sanitizeBody, sanitizeResp, shot, ev, writeReport, sleep, log } = H;

(async () => {
  const T0 = Date.now();
  const scenarios = [];
  let inviteAuxPassMs = [];

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: false });
  const page = await ctx.newPage();

  // Scenario 1a — API login
  log('block-1.s1a', 'POST /api/auth/login');
  const loginStart = Date.now();
  const login = await apiLogin(ctx, QA_ADMIN);
  scenarios.push({
    id: 'auth-1a-login-api',
    desc: 'POST /api/auth/login (admin)',
    request: { method: 'POST', url: `${API}/api/auth/login`, body: sanitizeBody({ email: QA_ADMIN.email, password: '***' }) },
    response: { status: login.status, body: JSON.stringify(sanitizeResp(login.body)).slice(0, 400) },
    expected: 'HTTP 200, JSON success, cookie set',
    elapsedMs: login.elapsedMs,
    pass: login.status === 200 && (login.body?.user || login.body?.success || login.body?.id || login.body?.userId),
  });

  if (login.status !== 200) {
    log('block-1.fatal', `login failed status=${login.status}`);
    writeReport('block-1-auth-report', { partial: true, scenarios });
    await browser.close();
    process.exit(2);
  }

  // Scenario 1b — UI loads dashboard with session
  log('block-1.s1b', 'GET / with session');
  const dashStart = Date.now();
  await page.goto(`${FE}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(1500);
  const url = page.url();
  let bodyTxt = '';
  try { bodyTxt = (await page.locator('body').textContent({ timeout: 2000 })) || ''; } catch {}
  const bodyTrim = bodyTxt.replace(/\s+/g, ' ').slice(0, 400);
  await shot(page, ev('block-1-dashboard.png'));
  const onLogin = /Вход в систему|Войти|Login/i.test(bodyTxt) && !/Дашборд|Магазины|Каталог|Stores|Dashboard|Admin dashboard|Пользователи/i.test(bodyTxt);
  const sawDashboardCue = /Дашборд|Stores|Магазины|Dashboard|Admin dashboard|Каталог|Пользователи/i.test(bodyTxt);
  scenarios.push({
    id: 'auth-1b-dashboard',
    desc: 'GET / loads dashboard with session',
    request: { method: 'GET', url: `${FE}/` },
    response: { status: 200, body: bodyTrim },
    expected: 'dashboard renders (not on login)',
    elapsedMs: Date.now() - dashStart,
    pass: !onLogin && sawDashboardCue,
    finalUrl: url,
  });

  // CSRF token rotates per GET — fetch a fresh one AFTER the page navigated
  // (page nav can also rotate the cookie). This must immediately precede the invite POSTs.
  const adminCsrf = await getCsrfRequest(ctx);

  // Invite test cases
  const tnow = Date.now();
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

  const validCases = [
    { id: 'auth-2a-valid-plain', email: `wave4-valid-${tnow}@example.com` },
    { id: 'auth-2b-valid-tag', email: `wave4-tag+${tnow}@example.com` },
    { id: 'auth-2c-valid-dot', email: `wave4.name-${tnow}@example.com` },
  ];

  const rejectCases = [
    { id: 'auth-3a-multi-at', email: `wave4-a@b@c-${tnow}.com` },
    { id: 'auth-3b-multi-at-phish', email: `wave4-admin@evil-${tnow}.com@trusted.com` },
    { id: 'auth-3c-space-local', email: `wave4 has space-${tnow}@example.com` },
    { id: 'auth-3d-leading-dot', email: `.wave4-leading-${tnow}@example.com` },
    { id: 'auth-3e-trailing-dot', email: `wave4-trailing-${tnow}.@example.com` },
    { id: 'auth-3f-consecutive-dots', email: `wave4..dotty-${tnow}@example.com` },
  ];

  const extraCases = [
    { id: 'auth-4a-tab', email: `wave4\there-${tnow}@example.com` },
    { id: 'auth-4b-idn', email: `wave4-idn-${tnow}@пример.рф` },
    { id: 'auth-4c-empty', email: `` },
  ];

  async function inviteCase(c, expectStatus) {
    const t0 = Date.now();
    const reqBody = { email: c.email, role: 'operator', fullName: 'Wave4 QA', expiresAt };
    const r = await ctx.request.post(`${API}/api/auth/invites`, {
      data: reqBody,
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const text = await r.text();
    let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
    const respExcerpt = (typeof text === 'string' ? text : JSON.stringify(text)).slice(0, 400);
    const elapsed = Date.now() - t0;

    let pass;
    if (expectStatus === 201) {
      pass = r.status() === 201 || r.status() === 200;
    } else {
      const msg = (parsed && typeof parsed === 'object' && (parsed.message || parsed.error)) ? String(parsed.message || parsed.error) : respExcerpt;
      pass = r.status() === 400 && /valid email|email is required/i.test(msg);
    }

    return {
      id: c.id,
      desc: `POST /api/auth/invites email=${JSON.stringify(c.email)}`,
      request: { method: 'POST', url: `${API}/api/auth/invites`, body: { email: c.email, role: 'operator', fullName: 'Wave4 QA', expiresAt } },
      response: { status: r.status(), body: respExcerpt },
      expected: `HTTP ${expectStatus}${expectStatus === 400 ? ' with valid email error' : ''}`,
      elapsedMs: elapsed,
      pass,
      inviteId: parsed?.id || parsed?.invite?.id || null,
    };
  }

  log('block-1.s2', 'valid invite cases');
  for (const c of validCases) {
    const s = await inviteCase(c, 201);
    scenarios.push(s);
    inviteAuxPassMs.push(s.elapsedMs);
    log(s.id, `${s.response.status} pass=${s.pass}`);
  }

  log('block-1.s3', 'reject invite cases');
  for (const c of rejectCases) {
    const s = await inviteCase(c, 400);
    scenarios.push(s);
    inviteAuxPassMs.push(s.elapsedMs);
    log(s.id, `${s.response.status} pass=${s.pass}`);
  }

  log('block-1.s4', 'extra reject cases');
  for (const c of extraCases) {
    const s = await inviteCase(c, 400);
    scenarios.push(s);
    inviteAuxPassMs.push(s.elapsedMs);
    log(s.id, `${s.response.status} pass=${s.pass}`);
  }

  const totalElapsed = Date.now() - T0;
  const passed = scenarios.filter(s => s.pass).length;
  const total = scenarios.length;
  const allMs = scenarios.map(s => s.elapsedMs).sort((a, b) => a - b);
  const median = allMs.length ? allMs[Math.floor(allMs.length / 2)] : 0;

  writeReport('block-1-auth-report', { block: 'Auth', verdict: passed === total ? 'PASS' : 'FAIL', passed, total, medianMs: median, totalElapsedMs: totalElapsed, scenarios });
  log('block-1.done', `${passed}/${total} passed, median ${median}ms`);

  await browser.close();
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(3); });
