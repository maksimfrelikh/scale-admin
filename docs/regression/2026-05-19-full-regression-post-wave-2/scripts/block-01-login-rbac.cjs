/**
 * BLOCK 1 — Login / session / RBAC + Cross-tab MODE_A.
 * Login-bucket aware: max 5 per (IP,email) per 60s — share contexts.
 */
const H = require('./helpers/common.cjs');
const { chromium, FE, API, QA_ADMIN, QA_OP, sleep, log, uiState, uiLogin, shot, shotPath, writeReport, getCsrfRequest, apiLogin } = H;

(async () => {
  const block = 'block-01';
  const report = { startedAt: new Date().toISOString(), scenarios: {} };
  const browser = await chromium.launch({ headless: true });

  // === 1.1 Login form rendering ===
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${FE}/login`, { waitUntil: 'domcontentloaded' });
    await sleep(600);
    const hasEmail = await page.locator('input[type="email"], input[name="email"]').count();
    const hasPass = await page.locator('input[type="password"]').count();
    const hasSubmit = await page.locator('button[type="submit"]').count();
    report.scenarios['1.1_login_form'] = { hasEmail, hasPass, hasSubmit };
    await shot(page, shotPath(block, '1-1-login-form'));
    await ctx.close();
  }

  // === 1.2 Login w/o CSRF → 403 ===
  {
    const ctx = await browser.newContext();
    const r = await ctx.request.post(`${API}/api/auth/login`, { data: { email: 'noop@example.com', password: 'noop' } });
    const j = await r.json().catch(() => ({}));
    report.scenarios['1.2_csrf_required'] = { status: r.status(), code: j.code };
    await ctx.close();
  }

  // === 1.3 Login WRONG password → 401 (use NEW email to avoid rate-limit) ===
  {
    const ctx = await browser.newContext();
    const r = await apiLogin(ctx, { email: 'nonexistent-' + Date.now() + '@example.com', password: 'WRONGwrong' });
    report.scenarios['1.3_invalid_password'] = { status: r.status, body: r.body };
    await ctx.close();
  }

  // === 1.4 qa-admin login (UI flow) + RBAC + session check + me + logout via SAME ctx ===
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const resp = await uiLogin(page, QA_ADMIN);
    await sleep(1800);
    const state = await uiState(page);
    const cookies = await ctx.cookies();
    const session = cookies.find(c => c.name === 'scale_admin_session');
    report.scenarios['1.4_admin_ui_login'] = {
      loginResp: resp ? { status: resp.status(), ok: resp.ok() } : null,
      state: { url: state.url, h1: state.h1, onLogin: state.onLogin },
      hasSession: !!session,
      sessionAttrs: session ? { httpOnly: session.httpOnly, sameSite: session.sameSite, secure: session.secure, path: session.path } : null,
    };
    await shot(page, shotPath(block, '1-4-admin-after-login'));

    // RBAC: admin GET /users
    const usersResp = await ctx.request.get(`${API}/api/users`);
    let payload = null; try { payload = await usersResp.json(); } catch {}
    report.scenarios['1.5_rbac_admin_users'] = { status: usersResp.status(), count: Array.isArray(payload?.users) ? payload.users.length : (Array.isArray(payload) ? payload.length : null) };

    // /auth/session
    const sessResp = await ctx.request.get(`${API}/api/auth/session`);
    const sessJson = await sessResp.json().catch(() => ({}));
    report.scenarios['1.6_auth_session_admin'] = { status: sessResp.status(), email: sessJson?.user?.email, role: sessJson?.user?.role };

    // logout
    const csrf = await getCsrfRequest(ctx);
    const logoutResp = await ctx.request.post(`${API}/api/auth/logout`, { headers: { 'x-csrf-token': csrf } });
    const sessAfter = await ctx.request.get(`${API}/api/auth/session`);
    report.scenarios['1.7_logout_invalidates'] = { logoutStatus: logoutResp.status(), sessionAfter: sessAfter.status() };

    await ctx.close();
  }

  // === 1.8 qa-operator login + RBAC operator-on-/users → expect 403 ===
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const resp = await uiLogin(page, QA_OP);
    await sleep(1800);
    const state = await uiState(page);
    report.scenarios['1.8_operator_ui_login'] = {
      loginResp: resp ? { status: resp.status() } : null,
      state: { url: state.url, h1: state.h1, onLogin: state.onLogin },
    };
    await shot(page, shotPath(block, '1-8-operator-after-login'));

    const usersResp = await ctx.request.get(`${API}/api/users`);
    report.scenarios['1.9_rbac_operator_users_forbidden'] = { status: usersResp.status() };

    const sessResp = await ctx.request.get(`${API}/api/auth/session`);
    const sj = await sessResp.json().catch(() => ({}));
    report.scenarios['1.10_auth_session_operator'] = { status: sessResp.status(), email: sj?.user?.email, role: sj?.user?.role };

    await ctx.close();
  }

  // === 1.11 Wait for rate-limit window to expire before MODE_A test ===
  // qa-admin used 1 login (1.4). qa-operator used 1 login (1.8). admin-bucket fresh.
  // Sleep 30s as a safety margin (also lets in-memory bucket roll over since check resets at window expiry).
  log('1.11', 'sleeping 65s to let rate-limit window clear for MODE_A test');
  await sleep(65000);

  // === 1.12 MODE_A: cross-tab logout — EXPECTED-OFF post BUG-REG-014/017 revert ===
  {
    const ctx = await browser.newContext();
    const tabA = await ctx.newPage();
    const tabB = await ctx.newPage();
    const sessionCalls = [];
    const onReq = (r) => { if (r.url().includes('/api/auth/session') || r.url().includes('/api/auth/me')) sessionCalls.push({ t: Date.now(), url: r.url() }); };
    tabA.on('request', onReq); tabB.on('request', onReq);

    const respLogin = await uiLogin(tabA, QA_ADMIN);
    await sleep(1800);
    const stateA = await uiState(tabA);
    log('1.12 tabA after login', { url: stateA.url, h1: stateA.h1, loginStatus: respLogin?.status() });

    await tabB.goto(`${FE}/`, { waitUntil: 'domcontentloaded' });
    await sleep(4000);
    const stateBpre = await uiState(tabB);
    log('1.12 tabB pre', { url: stateBpre.url, h1: stateBpre.h1, onLogin: stateBpre.onLogin });

    const csrf = await getCsrfRequest(ctx);
    const logoutR = await tabA.evaluate(async ({ api, csrf }) => {
      const r = await fetch(`${api}/api/auth/logout`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf } });
      return { status: r.status };
    }, { api: API, csrf });
    log('1.12 logout from tabA', logoutR);

    const callsAtLogout = sessionCalls.length;
    const t0 = Date.now();
    let propagated = false;
    while (Date.now() - t0 < 30000) {
      const s = await uiState(tabB);
      if (s.onLogin) { propagated = true; break; }
      await sleep(2500);
    }
    const stateBpost = await uiState(tabB);
    const callsAfter = sessionCalls.length;
    const elapsedMs = Date.now() - t0;
    const callRatePerMin = ((callsAfter - callsAtLogout) / Math.max(elapsedMs / 1000, 1)) * 60;

    report.scenarios['1.12_mode_a_cross_tab_logout'] = {
      stateBpre: { url: stateBpre.url, h1: stateBpre.h1, onLogin: stateBpre.onLogin },
      stateBpost: { url: stateBpost.url, h1: stateBpost.h1, onLogin: stateBpost.onLogin },
      propagatedWithin30s: propagated,
      expectedOff_postRevert: !propagated,
      sessionCallsBefore: callsAtLogout,
      sessionCallsAfter: callsAfter,
      sessionCallsRate_perMinute_during30s: Math.round(callRatePerMin * 10) / 10,
      loopRisk_gt2perMin: callRatePerMin > 2,
    };
    await shot(tabB, shotPath(block, '1-12-tabB-30s-post-logout'));
    await ctx.close();
  }

  // === 1.13 Visit protected route unauthenticated → /login redirect ===
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${FE}/stores`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    const state = await uiState(page);
    report.scenarios['1.13_unauth_redirect'] = { url: page.url(), onLogin: state.onLogin, h1: state.h1 };
    await ctx.close();
  }

  await browser.close();
  report.finishedAt = new Date().toISOString();
  writeReport(block, report);
  console.log('\n=== BLOCK 1 SUMMARY ===');
  console.log(JSON.stringify(report.scenarios, null, 2));
})();
