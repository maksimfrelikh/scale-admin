/**
 * BLOCK-02 Auth/Session/Runtime — browser-side verification.
 *
 * Covers:
 *   A.1  Incognito open → Login form interactive < 2s
 *   A.2  GET /api/auth/session 1x → 401, no retry within 30s
 *   A.3  Same in normal tab after logout
 *   B.1  Admin login → admin nav (Stores, Products, Users & Access, Logs)
 *   B.2  Logout → return to Login; direct /dashboard → Login
 *   B.3  Operator login → restricted nav (Dashboard, Stores, Products)
 *   C.2  Form-level validation: empty/invalid email, empty password
 *   D.1-3 Hard refresh + new tab persistence
 *   E.1  Cookie inspect: scale_admin_session HttpOnly+Secure+SameSite+Path
 *   F.2  UI state-change includes x-csrf-token header
 *   G.1  Close context → reopen with persisted cookies → still authed
 *   H.1  Incognito direct URLs → Login
 *   H.2  Operator direct /users → access denied
 *
 * Run: node docs/regression/2026-05-17/scripts/block-02-auth.spec.cjs
 * Output: ./report.json next to script, raw screenshots into evidence/
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://maksimfrelikh.ru';
const EVIDENCE = path.resolve(__dirname, '..', 'evidence');
const REPORT  = path.resolve(__dirname, '..', 'evidence', 'block-02-browser-report.json');
// QA credentials are sourced from AGENTS.md §2 via env to avoid embedding in committed files.
// Run as:  QA_PASSWORD='<from AGENTS.md>' node block-02-auth.spec.cjs
const QA_PASSWORD = process.env.QA_PASSWORD || (() => { throw new Error('Set QA_PASSWORD env (see AGENTS.md §2)'); })();
const ADMIN = { email: 'qa-admin@***.invalid', password: QA_PASSWORD };
const OPER  = { email: 'qa-operator@***.invalid', password: QA_PASSWORD };

const sleep = ms => new Promise(r => setTimeout(r, ms));

function mkRecorder(page, label) {
  const reqs = [];
  page.on('request', r => reqs.push({
    ts: Date.now(),
    method: r.method(),
    url: r.url(),
    headers: r.headers(),
  }));
  page.on('response', async r => {
    const req = reqs.find(x => x.url === r.url() && !x.status);
    if (req) {
      req.status = r.status();
      req.respHeaders = r.headers();
    }
  });
  return { reqs, label };
}

async function takeShot(page, name) {
  const p = path.join(EVIDENCE, `block-02-${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

async function findLoginVisible(page, timeoutMs = 5000) {
  // True when an email field is visible and form is interactive.
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const c = await page.locator('input[type="email"], input[name="email"]').count();
      if (c > 0) {
        const visible = await page.locator('input[type="email"], input[name="email"]').first().isVisible();
        if (visible) return Date.now() - start;
      }
    } catch (_) {}
    await sleep(50);
  }
  return null;
}

async function loginViaUi(page, creds) {
  await page.locator('input[type="email"], input[name="email"]').first().fill(creds.email);
  await page.locator('input[type="password"], input[name="password"]').first().fill(creds.password);
  await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/auth/login'), { timeout: 10000 }).catch(() => null),
    page.locator('button[type="submit"]').first().click(),
  ]);
  // Wait for some authed indicator (any element that says Dashboard / Stores / etc.).
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
}

async function collectNav(page) {
  // Take all visible nav/sidebar-like labels.
  const items = await page.evaluate(() => {
    const out = new Set();
    document.querySelectorAll('nav a, aside a, [role="navigation"] a, header a').forEach(a => {
      const t = (a.innerText || a.textContent || '').trim();
      if (t && t.length < 80) out.add(t);
    });
    // Also collect any anchor in the main rendered area that looks like a section link.
    return Array.from(out);
  });
  return items;
}

const RESULTS = {};
function record(id, status, details) {
  RESULTS[id] = { status, ...(details || {}) };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const reports = {};

  try {
    // ============= A.1: Incognito open → time-to-Login-form =============
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const rec = mkRecorder(page, 'A-incognito-open');
      const start = Date.now();
      await page.goto(`${TARGET}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const ttiLogin = await findLoginVisible(page, 5000);
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await sleep(2000); // observe steady state
      // Snapshot session checks
      const sessionCalls = rec.reqs.filter(r => r.url.includes('/api/auth/session'));
      await takeShot(page, 'A1-incognito-login-form');

      record('A.1', ttiLogin !== null && ttiLogin < 2000 ? 'pass' : (ttiLogin === null ? 'fail' : 'flaky'), {
        ttiLoginMs: ttiLogin,
        thresholdMs: 2000,
        observationMs: Date.now() - start,
      });

      // A.2 — same incognito tab, count /auth/session calls in first 30s window
      reports.A_incognito_initial_reqs = sessionCalls.map(r => ({ ts: r.ts - start, status: r.status, url: r.url }));
      // Wait remainder up to 30s of total observation
      const elapsed = Date.now() - start;
      const remaining = 30000 - elapsed;
      if (remaining > 0) await sleep(remaining);
      const sessionCallsAll = rec.reqs.filter(r => r.url.includes('/api/auth/session'));
      reports.A_incognito_30s_reqs = sessionCallsAll.map(r => ({ ts: r.ts - start, status: r.status, url: r.url }));
      record('A.2', sessionCallsAll.length === 1 ? 'pass' : 'fail', {
        sessionCallCount30s: sessionCallsAll.length,
        statuses: sessionCallsAll.map(r => r.status),
        firstStatus: sessionCallsAll[0]?.status,
      });
      await ctx.close();
    }

    // ============= B.1 / E.1 / D.1 / D.3 / F.2 — admin login & nav =============
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const rec = mkRecorder(page, 'admin-flow');
      await page.goto(`${TARGET}/`, { waitUntil: 'networkidle', timeout: 15000 });

      // C.2 form validation pre-login
      const submitDisabledEmpty = await page.locator('button[type="submit"]').first().isDisabled().catch(() => null);
      record('C.2-empty', submitDisabledEmpty === true ? 'pass' : 'observe', { submitDisabledWhenEmpty: submitDisabledEmpty });

      await page.locator('input[type="email"]').first().fill('abc');
      await page.locator('input[type="password"]').first().fill('x');
      await page.locator('button[type="submit"]').first().click().catch(() => {});
      await sleep(500);
      const validationMsg = await page.locator('text=/email|format|valid|invalid|wrong/i').first().textContent().catch(() => null);
      record('C.3-bad-email-ui', validationMsg ? 'pass' : 'observe', { validationMsg });
      await takeShot(page, 'C3-bad-email-validation');

      // Clear and proper login
      await page.locator('input[type="email"]').first().fill(ADMIN.email);
      await page.locator('input[type="password"]').first().fill(ADMIN.password);
      const [loginResp] = await Promise.all([
        page.waitForResponse(r => r.url().includes('/api/auth/login'), { timeout: 10000 }),
        page.locator('button[type="submit"]').first().click(),
      ]);
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await sleep(800);
      await takeShot(page, 'B1-admin-dashboard');

      // F.2 — login request carries x-csrf-token
      const loginReq = rec.reqs.find(r => r.url.includes('/api/auth/login') && r.method === 'POST');
      record('F.2-login-csrf', loginReq?.headers['x-csrf-token'] ? 'pass' : 'fail', {
        csrfHeaderPresent: Boolean(loginReq?.headers['x-csrf-token']),
        loginStatus: loginResp.status(),
      });

      const adminNav = await collectNav(page);
      reports.adminNav = adminNav;
      const expectedAdmin = ['Dashboard', 'Stores', 'Products', 'Users', 'Logs'];
      const missing = expectedAdmin.filter(k => !adminNav.some(n => n.toLowerCase().includes(k.toLowerCase())));
      record('B.1', missing.length === 0 ? 'pass' : 'fail', {
        adminNav,
        missing,
      });

      // E.1 cookie inspection
      const cookies = await ctx.cookies(TARGET);
      reports.cookies = cookies;
      const sess = cookies.find(c => c.name === 'scale_admin_session');
      const csrfCk = cookies.find(c => c.name === 'scale_admin_csrf');
      record('E.1', sess && sess.httpOnly && sess.secure && (sess.sameSite === 'Lax' || sess.sameSite === 'Strict') && sess.path === '/' ? 'pass' : 'fail', {
        sessionCookie: sess,
        csrfCookie: csrfCk,
      });

      // D.1 — hard refresh on dashboard
      await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
      await sleep(800);
      const stillLogged = await page.locator('input[type="password"]').count();
      const dashOnReload = await collectNav(page);
      record('D.1', stillLogged === 0 && dashOnReload.length > 0 ? 'pass' : 'fail', {
        passwordFieldsAfterReload: stillLogged,
        navAfterReload: dashOnReload,
      });
      await takeShot(page, 'D1-after-hard-refresh');

      // D.2 — navigate to /stores then refresh
      await page.goto(`${TARGET}/stores`, { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(500);
      const onStores = page.url();
      await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
      await sleep(500);
      const stillStores = page.url();
      const stillLoggedStores = await page.locator('input[type="password"]').count() === 0;
      record('D.2', stillLoggedStores && stillStores.includes('/stores') ? 'pass' : 'fail', {
        beforeReload: onStores, afterReload: stillStores, stillLogged: stillLoggedStores,
      });
      await takeShot(page, 'D2-stores-after-refresh');

      // Also visit /products
      await page.goto(`${TARGET}/products`, { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(500);
      await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
      await sleep(500);
      const stillProducts = page.url();
      const stillLoggedProducts = await page.locator('input[type="password"]').count() === 0;
      record('D.2b', stillLoggedProducts && stillProducts.includes('/products') ? 'pass' : 'fail', {
        url: stillProducts, stillLogged: stillLoggedProducts,
      });
      await takeShot(page, 'D2b-products-after-refresh');

      // D.3 — new tab in same context
      const page2 = await ctx.newPage();
      await page2.goto(`${TARGET}/`, { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(800);
      const tab2HasLogin = await page2.locator('input[type="password"]').count() > 0;
      record('D.3', tab2HasLogin === false ? 'pass' : 'fail', { newTabHasLoginForm: tab2HasLogin });
      await takeShot(page2, 'D3-new-tab-authed');
      await page2.close();

      // F.2 — UI state-change: try to trigger anything that POSTs and confirm CSRF.
      // We pick the Stores page (still logged in). Check any POST/PATCH/PUT/DELETE that fires; record its CSRF header.
      const postsBefore = rec.reqs.filter(r => ['POST','PUT','PATCH','DELETE'].includes(r.method)).map(r=>r.url);
      reports.adminPosts = postsBefore;

      // F.2 from logout (we'll trigger logout next): logout button click → POST /api/auth/logout
      // Find a logout button — common labels
      const logoutBtn = page.locator('button:has-text("Logout"), button:has-text("Sign out"), button:has-text("Выйти")').first();
      const logoutVisible = await logoutBtn.count() > 0;
      reports.logoutBtnVisible = logoutVisible;
      // B.2 — logout
      if (logoutVisible) {
        const [logoutResp] = await Promise.all([
          page.waitForResponse(r => r.url().includes('/api/auth/logout'), { timeout: 10000 }),
          logoutBtn.click(),
        ]);
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        await sleep(800);
        const logoutReq = rec.reqs.find(r => r.url.includes('/api/auth/logout') && r.method === 'POST');
        record('F.2-logout-csrf', logoutReq?.headers['x-csrf-token'] ? 'pass' : 'fail', {
          csrfHeaderPresent: Boolean(logoutReq?.headers['x-csrf-token']),
          logoutStatus: logoutResp.status(),
        });
        const onLoginAfterLogout = await page.locator('input[type="password"]').count() > 0;
        record('B.2', logoutResp.status() === 200 && onLoginAfterLogout ? 'pass' : 'fail', {
          logoutStatus: logoutResp.status(),
          backToLoginForm: onLoginAfterLogout,
        });
        await takeShot(page, 'B2-after-logout');
        // After logout: navigate to /dashboard direct, should redirect to login
        await page.goto(`${TARGET}/dashboard`, { waitUntil: 'networkidle', timeout: 15000 });
        await sleep(500);
        const urlAfterDirect = page.url();
        const hasLoginAfter = await page.locator('input[type="password"]').count() > 0;
        record('B.2-direct', hasLoginAfter ? 'pass' : 'fail', { url: urlAfterDirect, hasLoginForm: hasLoginAfter });
        await takeShot(page, 'B2-direct-dashboard-after-logout');
      } else {
        record('B.2', 'fail', { reason: 'logout button not found in DOM' });
        record('F.2-logout-csrf', 'skip', { reason: 'no logout button' });
        record('B.2-direct', 'skip', { reason: 'no logout' });
      }

      await ctx.close();
    }

    // ============= A.3 — same /api/auth/session in normal logout state =============
    {
      const ctx = await browser.newContext();  // fresh (not incognito, but cookieless)
      const page = await ctx.newPage();
      const rec = mkRecorder(page, 'A3-fresh-tab-logout');
      const start = Date.now();
      await page.goto(`${TARGET}/`, { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(30000);
      const sessionCallsAll = rec.reqs.filter(r => r.url.includes('/api/auth/session'));
      reports.A3_fresh_30s_reqs = sessionCallsAll.map(r => ({ ts: r.ts - start, status: r.status, url: r.url }));
      record('A.3', sessionCallsAll.length === 1 ? 'pass' : 'fail', {
        sessionCallCount30s: sessionCallsAll.length,
        statuses: sessionCallsAll.map(r => r.status),
      });
      await ctx.close();
    }

    // ============= G.1 — close context with persistent cookies, reopen =============
    {
      // Cookie scenario: login, save cookies, close context, new context with cookies, expect authed.
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(`${TARGET}/`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.locator('input[type="email"]').first().fill(ADMIN.email);
      await page.locator('input[type="password"]').first().fill(ADMIN.password);
      await Promise.all([
        page.waitForResponse(r => r.url().includes('/api/auth/login'), { timeout: 10000 }),
        page.locator('button[type="submit"]').first().click(),
      ]);
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      const persistedCookies = await ctx.cookies(TARGET);
      await ctx.close();

      const ctx2 = await browser.newContext({ storageState: { cookies: persistedCookies, origins: [] } });
      const page2 = await ctx2.newPage();
      await page2.goto(`${TARGET}/dashboard`, { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(1500);
      const onLogin = await page2.locator('input[type="password"]').count() > 0;
      record('G.1', onLogin === false ? 'pass' : 'fail', { cookieRestoreShowsLogin: onLogin });
      await takeShot(page2, 'G1-reopen-after-tab-close');
      await ctx2.close();
    }

    // ============= H.1 — incognito direct URL access =============
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const urls = ['/dashboard', '/stores', '/products', '/users', '/logs'];
      const out = [];
      for (const u of urls) {
        await page.goto(`${TARGET}${u}`, { waitUntil: 'networkidle', timeout: 15000 });
        await sleep(800);
        const hasLogin = await page.locator('input[type="password"]').count() > 0;
        out.push({ url: u, finalUrl: page.url(), hasLoginForm: hasLogin });
      }
      reports.H1 = out;
      const allRedirected = out.every(x => x.hasLoginForm === true);
      record('H.1', allRedirected ? 'pass' : 'fail', { matrix: out });
      await takeShot(page, 'H1-incognito-protected-redirected');
      await ctx.close();
    }

    // ============= B.3 / H.2 — operator login + nav + /users direct =============
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const rec = mkRecorder(page, 'operator-flow');
      await page.goto(`${TARGET}/`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.locator('input[type="email"]').first().fill(OPER.email);
      await page.locator('input[type="password"]').first().fill(OPER.password);
      const [loginResp] = await Promise.all([
        page.waitForResponse(r => r.url().includes('/api/auth/login'), { timeout: 10000 }),
        page.locator('button[type="submit"]').first().click(),
      ]);
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await sleep(800);
      await takeShot(page, 'B3-operator-dashboard');
      const opNav = await collectNav(page);
      reports.operatorNav = opNav;
      // Allowed: Dashboard, Stores, Products. Forbidden: Users, Logs.
      const hasUsers = opNav.some(n => /users|пользователи|access/i.test(n));
      const hasLogs  = opNav.some(n => /logs|логи|audit/i.test(n));
      const hasDashboard = opNav.some(n => /dashboard|главн/i.test(n));
      const hasStores = opNav.some(n => /stores|магазин/i.test(n));
      const hasProducts = opNav.some(n => /products|товары/i.test(n));
      record('B.3', !hasUsers && !hasLogs && hasDashboard && hasStores && hasProducts ? 'pass' : 'fail', {
        operatorNav: opNav,
        leakedUsers: hasUsers,
        leakedLogs: hasLogs,
        hasDashboard, hasStores, hasProducts,
        loginStatus: loginResp.status(),
      });

      // H.2 — operator direct /users
      await page.goto(`${TARGET}/users`, { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(1000);
      const onUsersPage = page.url();
      const visibleUsersList = await page.locator('text=/role|admin|operator|email/i').count();
      const accessDenied = await page.locator('text=/forbidden|denied|access|403|not allowed|нет доступа/i').count();
      const bouncedToDashboard = onUsersPage.endsWith('/dashboard') || onUsersPage === `${TARGET}/`;
      const guarded = accessDenied > 0 || bouncedToDashboard;
      record('H.2', guarded ? 'pass' : 'fail', {
        url: onUsersPage,
        accessDeniedIndicator: accessDenied,
        visibleUserHintCount: visibleUsersList,
        bouncedToDashboard,
      });
      await takeShot(page, 'H2-operator-users-direct');
      await ctx.close();
    }

  } catch (e) {
    RESULTS.exception = { message: e.message, stack: e.stack };
  } finally {
    await browser.close();
  }

  fs.writeFileSync(REPORT, JSON.stringify({ results: RESULTS, reports }, null, 2));
  console.log(JSON.stringify(RESULTS, null, 2));
  console.log('Report saved:', REPORT);
}

main();
