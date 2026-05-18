/**
 * BLOCK-05 — Round 2: re-test sections that needed adjustments.
 *  E_fixed: install storage/BroadcastChannel listeners AFTER any navigation, then trigger A logout.
 *  D_fixed: use a freshly created store (active mainCatalog) and create category in it.
 *  B: multi-role session swap — uses direct API to overwrite session cookie in shared context.
 */
const { chromium, request: pwRequest } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://maksimfrelikh.ru';
const QA_PASSWORD = process.env.QA_PASSWORD || (() => { throw new Error('Set QA_PASSWORD'); })();
const ADMIN = { email: 'qa-admin@***.invalid', password: QA_PASSWORD };
const OPER  = { email: 'qa-operator@***.invalid', password: QA_PASSWORD };
const EVI = path.resolve(__dirname, '..', 'evidence', 'block-05');
fs.mkdirSync(EVI, { recursive: true });
const REPORT = path.join(EVI, 'report-round2.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toISOString().slice(11, 23);
const out = { startedAt: new Date().toISOString(), E_fixed: {}, D_fixed: {}, B: {}, cleanup: {} };
const log = (k, v) => { console.log(`[${ts()}] ${k}`, typeof v === 'object' ? JSON.stringify(v).slice(0, 400) : v); };

async function uiState(page) {
  const url = page.url();
  const h1 = await page.locator('h1').first().textContent({ timeout: 2000 }).catch(() => '');
  const h2 = await page.locator('h2').first().textContent({ timeout: 1500 }).catch(() => '');
  const body = (await page.locator('body').textContent({ timeout: 2000 }).catch(() => '') || '').replace(/\s+/g, ' ').slice(0, 250);
  const onLogin = /\/login(?!#)/.test(url) || /Вход в систему|Login/i.test(body);
  return { url, h1: (h1 || '').trim(), h2: (h2 || '').trim(), body, onLogin };
}

async function csrfHeader(ctx) {
  const r = await ctx.request.get(`${TARGET}/api/auth/csrf`);
  const j = await r.json();
  return { 'x-csrf-token': j.csrfToken };
}

async function shot(page, name) {
  const p = path.join(EVI, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false }).catch(() => {});
  return path.basename(p);
}

async function loginPageUI(page, who, label) {
  await page.goto(`${TARGET}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name="email"]').first().fill(who.email);
  await page.locator('input[type="password"]').first().fill(who.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForResponse(r => r.url().includes('/api/auth/login') && r.status() === 200, { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  log(`${label} UI login as ${who.email}`, { url: page.url() });
}

async function main() {
  // -------- E_fixed: clean run, listeners installed AFTER both pages settle
  const browser1 = await chromium.launch({ headless: true });
  const ctx1 = await browser1.newContext({ viewport: { width: 1366, height: 768 } });
  const A1 = await ctx1.newPage();
  const B1 = await ctx1.newPage();
  try {
    await loginPageUI(A1, ADMIN, 'A1');
    await B1.goto(`${TARGET}/dashboard`, { waitUntil: 'domcontentloaded' });
    await sleep(2000);
    // Install listeners NOW (after dashboard loaded), then DO NOT navigate B1 again
    await B1.evaluate(() => {
      window.__storageEvents = [];
      window.__bcEvents = [];
      window.__bcChannels = [];
      window.addEventListener('storage', (e) => {
        window.__storageEvents.push({ t: Date.now(), key: e.key, newValue: (e.newValue || '').slice(0, 100), oldValue: (e.oldValue || '').slice(0, 100) });
      });
      const channels = ['auth', 'session', 'app', 'scale-admin', 'logout', 'rtk-query', 'cache', 'main'];
      channels.forEach(n => {
        try {
          const bc = new BroadcastChannel(n);
          bc.onmessage = (e) => window.__bcEvents.push({ t: Date.now(), channel: n, data: String(JSON.stringify(e.data)).slice(0, 200) });
          window.__bcChannels.push(n);
        } catch (err) { window.__bcChannels.push({ n, err: err.message }); }
      });
    });
    log('E_fixed: B1 listeners installed', { check: await B1.evaluate(() => window.__bcChannels) });

    // Trigger logout in A1 (POST /api/auth/logout from A1's context)
    const logoutResp = await A1.evaluate(async () => {
      const csrf = (document.cookie.match(/scale_admin_csrf=([^;]+)/) || [])[1];
      const r = await fetch('/api/auth/logout', {
        method: 'POST', credentials: 'include',
        headers: csrf ? { 'x-csrf-token': csrf } : {},
      });
      return { status: r.status };
    });
    log('E_fixed: A1 logout', logoutResp);
    await sleep(30000);
    const captured = await B1.evaluate(() => ({
      storage: window.__storageEvents || [],
      bc: window.__bcEvents || [],
      channels: window.__bcChannels || [],
    }));
    out.E_fixed = { logoutResp, captured };
    log('E_fixed: captured', captured);
    await shot(B1, 'E_fixed-B-after-logout');
  } catch (e) {
    out.E_fixed.error = e.message;
    console.error('E_fixed', e);
  } finally {
    await browser1.close();
  }

  // -------- D_fixed: create fresh store via API, navigate two tabs to it, create category in A
  const apiCtx = await pwRequest.newContext();
  let freshStoreId = null, categoryId = null;
  try {
    const csrf1 = (await (await apiCtx.get(`${TARGET}/api/auth/csrf`)).json()).csrfToken;
    await apiCtx.post(`${TARGET}/api/auth/login`, {
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf1, 'Origin': TARGET },
      data: { email: ADMIN.email, password: ADMIN.password },
    });
    const csrf2 = (await (await apiCtx.get(`${TARGET}/api/auth/csrf`)).json()).csrfToken;
    const r = await apiCtx.post(`${TARGET}/api/stores`, {
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf2, 'Origin': TARGET },
      data: { name: 'QA-MTAB-D-001', code: 'QAMTABD1', timezone: 'Europe/Moscow' },
    });
    const j = await r.json();
    freshStoreId = j.store.id;
    log('D_fixed: fresh store created', { id: freshStoreId, mainCatalog: j.mainCatalog && j.mainCatalog.id });
  } catch (e) {
    out.D_fixed.error = `pre-create ${e.message}`;
  } finally {
    await apiCtx.dispose();
  }

  const browser2 = await chromium.launch({ headless: true });
  const ctx2 = await browser2.newContext({ viewport: { width: 1366, height: 768 } });
  const A2 = await ctx2.newPage();
  const B2 = await ctx2.newPage();
  try {
    await loginPageUI(A2, ADMIN, 'A2');
    await A2.goto(`${TARGET}/#store:${freshStoreId}`, { waitUntil: 'domcontentloaded' });
    await B2.goto(`${TARGET}/#store:${freshStoreId}`, { waitUntil: 'domcontentloaded' });
    await sleep(3500);
    await shot(A2, 'D_fixed-A-store-detail'); await shot(B2, 'D_fixed-B-store-detail');
    const before = await B2.evaluate(() => document.body.innerText.includes('QA-MTAB-CAT-001'));
    out.D_fixed.before_in_B = before;

    // Create category via direct API call from inside A2's browser
    const createResp = await A2.evaluate(async (sid) => {
      const csrf = (document.cookie.match(/scale_admin_csrf=([^;]+)/) || [])[1];
      const r = await fetch(`/api/stores/${sid}/catalog/categories`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ name: 'QA-MTAB-CAT-001' }),
      });
      const j = await r.json().catch(() => null);
      return { status: r.status, j };
    }, freshStoreId);
    log('D_fixed: category create', createResp);
    if (createResp.j) categoryId = createResp.j.id || (createResp.j.category && createResp.j.category.id);
    out.D_fixed.create = createResp;
    out.D_fixed.categoryId = categoryId;

    const dPoll = [];
    for (let i = 0; i < 6; i++) {
      await sleep(5000);
      const seen = await B2.evaluate(() => document.body.innerText.includes('QA-MTAB-CAT-001'));
      dPoll.push({ t: ts(), seenInB: seen });
    }
    out.D_fixed.D3_B_poll_30s_without_refresh = dPoll;
    await shot(B2, 'D_fixed-B-after-30s');

    await B2.reload({ waitUntil: 'domcontentloaded' });
    await sleep(3000);
    out.D_fixed.D4_B_after_reload_has_category = await B2.evaluate(() => document.body.innerText.includes('QA-MTAB-CAT-001'));
    await shot(B2, 'D_fixed-B-after-reload');

    // -------- B: multi-role session swap (reuse same context, overwrite cookie via direct API)
    // Tab A is currently admin on store detail. Now Tab B login operator via POST.
    await B2.goto(`${TARGET}/#stores`, { waitUntil: 'domcontentloaded' });
    await sleep(2000);
    const csrfHere = (await (await ctx2.request.get(`${TARGET}/api/auth/csrf`)).json()).csrfToken;
    const operLogin = await ctx2.request.post(`${TARGET}/api/auth/login`, {
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfHere, 'Origin': TARGET },
      data: { email: OPER.email, password: OPER.password },
    });
    out.B.B1_operator_login_status = operLogin.status();
    log('B: operator login via API', { status: operLogin.status() });
    const sessAfter = await ctx2.request.get(`${TARGET}/api/auth/session`);
    const sessJ = await sessAfter.json();
    out.B.B1b_server_session_after = sessJ.user ? { role: sessJ.user.role, email: sessJ.user.email } : sessJ;
    log('B: server session after swap', out.B.B1b_server_session_after);

    // B2 reload to render operator view
    await B2.reload({ waitUntil: 'domcontentloaded' });
    await sleep(2500);
    out.B.B1c_B_after_reload = await uiState(B2);
    await shot(B2, 'B-B-operator-view');

    // Poll Tab A for 30s — Tab A is admin UI but server thinks operator
    const bPoll = [];
    for (let i = 0; i < 6; i++) {
      await sleep(5000);
      const st = await uiState(A2);
      const navItems = await A2.evaluate(() =>
        Array.from(document.querySelectorAll('nav a, aside a, header a, [role="navigation"] a, button[type="button"]'))
          .map(a => (a.textContent || '').replace(/\s+/g, ' ').trim())
          .filter(t => t && t.length < 40).slice(0, 14)
      );
      const sess = await A2.evaluate(async () => {
        try { const r = await fetch('/api/auth/session', { credentials: 'include' });
          return r.ok ? (await r.json()) : { status: r.status };
        } catch (e) { return { error: e.message }; }
      });
      const sessRole = sess && sess.user && sess.user.role;
      bPoll.push({ t: ts(), aUrl: st.url, aH1: st.h1, navItems, sessRole });
    }
    out.B.B2_A_poll_30s = bPoll;
    await shot(A2, 'B-A-after-30s-no-action');

    // Click an admin-only link to force a check
    const apiSeenOnA = [];
    A2.on('response', r => { if (r.url().includes('/api/')) apiSeenOnA.push({ t: ts(), s: r.status(), u: r.url().replace(TARGET, ''), m: r.request().method() }); });
    const adminLink = A2.locator('a[href*="#users-access"], a:has-text("Users"), a:has-text("Пользователи"), a:has-text("Доступ")').first();
    if (await adminLink.count()) await adminLink.click({ timeout: 4000 }).catch(() => {});
    else await A2.goto(`${TARGET}/#users-access`, { waitUntil: 'domcontentloaded' });
    await sleep(3000);
    out.B.B3_A_admin_link_state = await uiState(A2);
    out.B.B3_A_recent_api = apiSeenOnA.slice(-8);
    await shot(A2, 'B-A-after-admin-link');

  } catch (e) {
    out.B.error = e.message;
    console.error('B', e);
  } finally {
    await browser2.close();
  }

  // ------- Cleanup: archive fresh store and category
  const cleanCtx = await pwRequest.newContext();
  try {
    const cs1 = (await (await cleanCtx.get(`${TARGET}/api/auth/csrf`)).json()).csrfToken;
    await cleanCtx.post(`${TARGET}/api/auth/login`, {
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': cs1, 'Origin': TARGET },
      data: { email: ADMIN.email, password: ADMIN.password },
    });
    const cs2 = (await (await cleanCtx.get(`${TARGET}/api/auth/csrf`)).json()).csrfToken;
    if (categoryId && freshStoreId) {
      const listPre = await (await cleanCtx.get(`${TARGET}/api/stores/${freshStoreId}/catalog/categories`)).json();
      out.cleanup.category_pre = JSON.stringify(listPre).includes(`"id":"${categoryId}"`);
      const p = await cleanCtx.patch(`${TARGET}/api/stores/${freshStoreId}/catalog/categories/${categoryId}`, {
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': cs2, 'Origin': TARGET },
        data: { status: 'archived' },
      });
      const listPost = await (await cleanCtx.get(`${TARGET}/api/stores/${freshStoreId}/catalog/categories`)).json();
      const flat = JSON.stringify(listPost);
      out.cleanup.category = {
        id: categoryId,
        patchStatus: p.status(),
        post_status: (flat.match(new RegExp(`"id":"${categoryId}"[^}]*"status":"([^"]+)"`)) || [])[1] || null,
        post_present: flat.includes(`"id":"${categoryId}"`),
      };
    }
    if (freshStoreId) {
      const sPre = await (await cleanCtx.get(`${TARGET}/api/stores/${freshStoreId}`)).json();
      const p2 = await cleanCtx.patch(`${TARGET}/api/stores/${freshStoreId}`, {
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': cs2, 'Origin': TARGET },
        data: { status: 'archived' },
      });
      const sPost = await (await cleanCtx.get(`${TARGET}/api/stores/${freshStoreId}`)).json();
      out.cleanup.store = {
        id: freshStoreId,
        preStatus: sPre.store && sPre.store.status,
        patchStatus: p2.status(),
        postStatus: sPost.store && sPost.store.status,
      };
    }
  } catch (e) {
    out.cleanup.error = e.message;
  } finally {
    await cleanCtx.dispose();
  }

  out.endedAt = new Date().toISOString();
  fs.writeFileSync(REPORT, JSON.stringify(out, null, 2));
  console.log(`Report: ${REPORT}`);
}

main().catch(e => { console.error('TOP', e); process.exit(1); });
