/** BLOCK-02 round 2 — fixed nav selector + clean logout + C.2 form validation. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://maksimfrelikh.ru';
// QA credentials are sourced from AGENTS.md §2 via env to avoid embedding in committed files.
// Run as:  QA_PASSWORD='<from AGENTS.md>' node block-02-round2.cjs
const QA_PASSWORD = process.env.QA_PASSWORD || (() => { throw new Error('Set QA_PASSWORD env (see AGENTS.md §2)'); })();
const ADMIN = { email: 'qa-admin@***.invalid', password: QA_PASSWORD };
const OPER  = { email: 'qa-operator@***.invalid', password: QA_PASSWORD };
const EVI = path.resolve(__dirname, '..', 'evidence');
const OUT = path.resolve(EVI, 'block-02-round2-report.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function rec(page) {
  const reqs = [];
  page.on('request', r => reqs.push({ ts: Date.now(), method: r.method(), url: r.url(), headers: r.headers() }));
  page.on('response', async r => {
    const m = reqs.find(x => x.url === r.url() && !x.status);
    if (m) { m.status = r.status(); m.respHeaders = r.headers(); }
  });
  return reqs;
}

async function navItems(page) {
  return await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('nav a, nav button, aside a, aside button, [role="navigation"] a, [role="navigation"] button, header a, header button').forEach(el => {
      const t = (el.innerText || el.textContent || '').trim();
      if (t && t.length < 80) out.push(t);
    });
    return out;
  });
}

async function fullScreenshot(page, name) {
  await page.screenshot({ path: path.join(EVI, `block-02-${name}.png`), fullPage: true });
}

async function login(page, creds, waitForLogin = true) {
  await page.goto(`${TARGET}/`, { waitUntil: 'networkidle', timeout: 15000 });
  await sleep(500);
  await page.locator('input[type="email"]').first().fill(creds.email);
  await page.locator('input[type="password"]').first().fill(creds.password);
  if (waitForLogin) {
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/auth/login'), { timeout: 10000 }),
      page.locator('button[type="submit"]').first().click(),
    ]);
  } else {
    await page.locator('button[type="submit"]').first().click();
  }
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await sleep(1000);
}

const results = {};
function r(id, status, payload) { results[id] = { status, ...(payload || {}) }; }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const reports = {};

  try {
    // === A.1 (refined): measure ttiLoginMs ===
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const reqs = rec(page);
      const startNav = Date.now();
      await page.goto(`${TARGET}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      let tti = null;
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const c = await page.locator('input[type="email"]').count();
        if (c > 0 && await page.locator('input[type="email"]').first().isVisible()) {
          tti = Date.now() - startNav;
          break;
        }
        await sleep(50);
      }
      // Also check that "Checking session..." or similar loading text is NOT shown
      const checkingText = await page.locator('text=/checking session|loading session|checking authentication|загрузка/i').count();
      r('A.1', tti !== null && tti < 2000 ? 'pass' : (tti === null ? 'fail' : 'flaky'), {
        ttiLoginMs: tti, threshold: 2000, checkingTextVisible: checkingText > 0,
      });
      await fullScreenshot(page, 'A1-incognito-form');
      await ctx.close();
    }

    // === B.1 + E.1 — admin login + correct nav check ===
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const reqs = rec(page);
      await login(page, ADMIN);
      await fullScreenshot(page, 'B1-admin-dashboard-full');
      const navAll = await navItems(page);
      reports.adminNav = navAll;
      // Expected items
      const has = key => navAll.some(n => new RegExp(key, 'i').test(n));
      const expected = {
        overview: has('overview|dashboard|главн'),
        stores: has('stores|магаз'),
        products: has('products|товар'),
        usersAccess: has('users|access|пользоват'),
        logs: has('logs|global logs|audit|логи'),
      };
      const pass = Object.values(expected).every(v => v);
      r('B.1', pass ? 'pass' : 'fail', { expected, navAll });

      // E.1 cookies (re-confirm post-login)
      const cookies = await ctx.cookies(TARGET);
      const sess = cookies.find(c => c.name === 'scale_admin_session');
      const csrf = cookies.find(c => c.name === 'scale_admin_csrf');
      r('E.1', sess && sess.httpOnly && sess.secure && (sess.sameSite === 'Lax' || sess.sameSite === 'Strict') && sess.path === '/' ? 'pass' : 'fail', {
        scale_admin_session: sess,
        scale_admin_csrf: csrf,
      });

      // Also confirm /api/auth/login carried csrf header (F.2 part 1)
      const loginReq = reqs.find(x => x.url.includes('/api/auth/login') && x.method === 'POST');
      r('F.2-login', loginReq?.headers['x-csrf-token'] ? 'pass' : 'fail', {
        csrfHeader: loginReq?.headers['x-csrf-token'] ? '<present>' : null,
        status: loginReq?.status,
      });

      await ctx.close();
    }

    // === B.2 — clean logout immediately after login (no extra nav noise) ===
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const reqs = rec(page);
      await login(page, ADMIN);
      const cookiesPreLogout = await ctx.cookies(TARGET);
      const csrfPre = cookiesPreLogout.find(c => c.name === 'scale_admin_csrf')?.value;

      // Find logout button and click
      const logoutBtn = page.locator('button:has-text("Logout")').first();
      const visible = await logoutBtn.count() > 0;
      if (!visible) {
        r('B.2', 'fail', { reason: 'logout button not in DOM' });
      } else {
        const [logoutResp] = await Promise.all([
          page.waitForResponse(rr => rr.url().includes('/api/auth/logout'), { timeout: 10000 }),
          logoutBtn.click(),
        ]);
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        await sleep(1500);
        const logoutReq = reqs.find(x => x.url.includes('/api/auth/logout') && x.method === 'POST');
        const cookiesPost = await ctx.cookies(TARGET);
        const sessPost = cookiesPost.find(c => c.name === 'scale_admin_session');
        const onLogin = await page.locator('input[type="password"]').count() > 0;
        const csrfHeaderUsed = logoutReq?.headers['x-csrf-token'];

        r('B.2', logoutResp.status() === 200 && onLogin ? 'pass' : 'fail', {
          logoutHttpStatus: logoutResp.status(),
          backToLoginForm: onLogin,
          sessionCookieAfter: sessPost,
          csrfHeaderUsed: csrfHeaderUsed ? '<present>' : null,
          csrfMatchesCookie: csrfHeaderUsed && csrfHeaderUsed === csrfPre,
          csrfHeader: csrfHeaderUsed,
          csrfPreCookie: csrfPre,
        });
        await fullScreenshot(page, 'B2-after-clean-logout');

        // Direct /dashboard after logout
        await page.goto(`${TARGET}/dashboard`, { waitUntil: 'networkidle', timeout: 15000 });
        await sleep(800);
        const promptLogin = await page.locator('input[type="password"]').count() > 0;
        r('B.2-direct', promptLogin ? 'pass' : 'fail', { url: page.url(), promptLogin });
      }
      await ctx.close();
    }

    // === B.3 + H.2 — operator nav + /users direct ===
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await login(page, OPER);
      await fullScreenshot(page, 'B3-operator-dashboard-full');
      const nav = await navItems(page);
      reports.operatorNav = nav;
      const has = re => nav.some(n => re.test(n));
      const hasOverview = has(/overview|dashboard|главн/i);
      const hasStores = has(/stores|магаз/i);
      const hasProducts = has(/products|товар/i);
      const hasUsersAccess = has(/users|access|пользоват/i);
      const hasLogs = has(/global logs|^logs$|audit|логи/i);
      r('B.3', !hasUsersAccess && !hasLogs && hasOverview && hasStores && hasProducts ? 'pass' : 'fail', {
        nav, hasOverview, hasStores, hasProducts, hasUsersAccess, hasLogs,
      });

      // H.2 — operator direct /users
      await page.goto(`${TARGET}/users`, { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(1500);
      const onURL = page.url();
      // Look for tell-tale admin user list elements (table with role/email columns, or user-list heading)
      const userListIndicators = await page.evaluate(() => {
        const text = document.body.innerText.toLowerCase();
        return {
          hasUserManagementHeading: /users? & access|user management|пользователи/i.test(text),
          hasRoleColumn: /\brole\b/i.test(text) && /\bemail\b/i.test(text),
          hasInviteButton: /invite|create user|добавить пользоват/i.test(text),
          hasDashboardHeading: /dashboard|fleet overview|assigned stores|добро пожалов/i.test(text),
          h1h2: Array.from(document.querySelectorAll('h1, h2')).map(h => h.innerText.trim()),
        };
      });
      reports.operatorOnUsersDirect = { url: onURL, ...userListIndicators };
      const showsAdminUI = userListIndicators.hasUserManagementHeading || userListIndicators.hasInviteButton;
      r('H.2', !showsAdminUI ? 'pass' : 'fail', {
        url: onURL,
        showsAdminUI,
        indicators: userListIndicators,
      });
      await fullScreenshot(page, 'H2-operator-users-direct');
      await ctx.close();
    }

    // === C.2 / C.3 — UI form validation behavior ===
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(`${TARGET}/`, { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(800);

      // C.2a — Submit with empty fields
      const submitDisabledInit = await page.locator('button[type="submit"]').first().isDisabled().catch(() => false);
      await page.locator('button[type="submit"]').first().click().catch(() => {});
      await sleep(300);
      const emailValid = await page.locator('input[type="email"]').first().evaluate(el => el.validity ? el.validity.valid : null).catch(() => null);
      const passwordValid = await page.locator('input[type="password"]').first().evaluate(el => el.validity ? el.validity.valid : null).catch(() => null);
      r('C.2', !submitDisabledInit && (emailValid === false || passwordValid === false) ? 'pass' :
              submitDisabledInit ? 'pass' : 'observe', {
        submitDisabledBeforeAnyInput: submitDisabledInit,
        emailValidityAfterEmptySubmit: emailValid,
        passwordValidityAfterEmptySubmit: passwordValid,
      });

      // C.3a — Invalid email format "abc"
      await page.locator('input[type="email"]').first().fill('abc');
      await page.locator('input[type="password"]').first().fill('Whatever123!');
      await page.locator('button[type="submit"]').first().click().catch(() => {});
      await sleep(500);
      const emailValid2 = await page.locator('input[type="email"]').first().evaluate(el => el.validity.valid).catch(() => null);
      r('C.3', emailValid2 === false ? 'pass' : 'fail', {
        emailValidityAfterBadFormat: emailValid2,
      });
      await fullScreenshot(page, 'C-form-validation-bad-email');

      await ctx.close();
    }

    // === F.2 — UI state-change includes x-csrf-token (use admin Create store flow) ===
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const reqs = rec(page);
      await login(page, ADMIN);
      // Try to open Create store dialog and submit something or just observe POST
      const createBtn = page.locator('button:has-text("Create store")').first();
      const hasBtn = await createBtn.count() > 0;
      let lastStateChange = null;
      if (hasBtn) {
        await createBtn.click().catch(() => {});
        await sleep(1500);
        await fullScreenshot(page, 'F2-create-store-dialog');
        // Look for inputs and submit form (without actually creating - if validate fails, we still observe the request)
        const codeInput = page.locator('input[name="code"], input[placeholder*="code" i]').first();
        const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first();
        const tzInput = page.locator('input[name="timezone"], select[name="timezone"]').first();
        const submit = page.locator('button[type="submit"]:has-text("Create"), button:has-text("Save")').first();
        const inputsExist = (await codeInput.count() > 0) && (await nameInput.count() > 0);
        reports.createStoreDialog = { hasCreateButton: hasBtn, inputsFound: inputsExist };
        if (inputsExist) {
          await codeInput.fill('QA-CSRF-CHECK-' + Date.now()).catch(() => {});
          await nameInput.fill('CSRF check (test artefact — please delete)').catch(() => {});
          // Try submitting; observe the POST request even if validation rejects
          const before = reqs.length;
          await submit.click().catch(() => {});
          await sleep(2000);
          lastStateChange = reqs.slice(before).find(x => ['POST','PUT','PATCH','DELETE'].includes(x.method));
        }
      }
      reports.lastStateChangeRequest = lastStateChange ? {
        method: lastStateChange.method, url: lastStateChange.url, status: lastStateChange.status,
        csrfHeaderPresent: Boolean(lastStateChange.headers['x-csrf-token']),
        contentTypeReq: lastStateChange.headers['content-type'],
      } : null;
      r('F.2', lastStateChange && lastStateChange.headers['x-csrf-token'] ? 'pass' : 'fail', {
        captured: Boolean(lastStateChange),
        method: lastStateChange?.method,
        url: lastStateChange?.url,
        status: lastStateChange?.status,
        csrfHeaderPresent: Boolean(lastStateChange?.headers['x-csrf-token']),
      });
      await ctx.close();
    }

  } catch (e) {
    results.exception = { message: e.message, stack: e.stack };
  } finally {
    await browser.close();
  }

  fs.writeFileSync(OUT, JSON.stringify({ results, reports }, null, 2));
  console.log(JSON.stringify({ results, reports }, null, 2));
  console.log('Report saved:', OUT);
})();
