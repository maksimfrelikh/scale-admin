/**
 * BLOCK-05 — Multi-tab / Cache consistency
 * Sections A, B, C, D, E. Single Chromium browser, single context, two pages.
 * Cleanup via direct API at the end.
 *
 * Usage: QA_PASSWORD='<password>' node block-05-multitab.cjs   # see AGENTS.md §2 for QA creds
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
const REPORT = path.join(EVI, 'report.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toISOString().slice(11, 23);

const report = {
  startedAt: new Date().toISOString(),
  sections: { A: {}, B: {}, C: {}, D: {}, E: {} },
  cleanup: {},
  events: [],
};
const note = (sec, key, val) => {
  report.sections[sec][key] = val;
  console.log(`[${ts()}] [${sec}] ${key} ${typeof val === 'object' ? JSON.stringify(val).slice(0, 300) : val}`);
};
const ev = (sec, msg) => {
  const e = { sec, t: ts(), msg };
  report.events.push(e);
  console.log(`[${ts()}] [${sec}] ${msg}`);
};

function attachRecorder(page, label) {
  const reqs = [];
  page.on('response', resp => {
    const url = resp.url();
    if (!/\/api\//.test(url)) return;
    const status = resp.status();
    reqs.push({ t: ts(), label, m: resp.request().method(), u: url.replace(TARGET, ''), s: status });
  });
  page.on('pageerror', e => reqs.push({ t: ts(), label, pageerror: e.message.slice(0, 200) }));
  return reqs;
}

async function csrfHeader(ctx) {
  const r = await ctx.request.get(`${TARGET}/api/auth/csrf`);
  const j = await r.json();
  return { 'x-csrf-token': j.csrfToken };
}

async function loginPage(page, who, label) {
  await page.goto(`${TARGET}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name="email"]').first().fill(who.email);
  await page.locator('input[type="password"]').first().fill(who.password);
  await page.locator('button[type="submit"]').first().click();
  // Wait for session to land
  await page.waitForResponse(r => r.url().includes('/api/auth/login') && r.status() === 200, { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  ev('LOG', `${label} login ${who.email} url=${page.url()}`);
}

async function logoutPage(page, label) {
  // Try UI logout: hash menu, then API direct as fallback
  const csrf = (await page.evaluate(() => document.cookie)).match(/scale_admin_csrf=([^;]+)/);
  const r = await page.evaluate(async (token) => {
    const res = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: token ? { 'x-csrf-token': token } : {},
    });
    return { status: res.status, ct: res.headers.get('content-type') };
  }, csrf ? csrf[1] : null);
  ev('LOG', `${label} logout fetch status=${r.status}`);
  return r;
}

async function shot(page, name) {
  const p = path.join(EVI, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false }).catch(() => {});
  return path.basename(p);
}

async function uiState(page) {
  const url = page.url();
  const title = await page.title().catch(() => '');
  const h1 = await page.locator('h1').first().textContent({ timeout: 1500 }).catch(() => '');
  const h2 = await page.locator('h2').first().textContent({ timeout: 1500 }).catch(() => '');
  const body = (await page.locator('body').textContent({ timeout: 2000 }).catch(() => '') || '').replace(/\s+/g, ' ').slice(0, 300);
  const onLogin = /\/login(?!#)/.test(url) || /Вход|Login|Email|Пароль|Password/i.test(body);
  return { url, title, h1: (h1 || '').trim(), h2: (h2 || '').trim(), body, onLogin };
}

async function pickStoreId(ctx) {
  const r = await ctx.request.get(`${TARGET}/api/stores`);
  const j = await r.json();
  const list = (j.stores || []).filter(s => s.status === 'active' && !/QA-MULTITAB|QA-RECON/.test(s.name));
  return list[0] && list[0].id;
}

async function clickIfExists(page, locator, label, sec) {
  const el = page.locator(locator).first();
  if (await el.count()) {
    try { await el.click({ timeout: 4000 }); ev(sec, `click ${label} ok`); return true; }
    catch (e) { ev(sec, `click ${label} fail ${e.message.slice(0, 100)}`); return false; }
  }
  ev(sec, `click ${label} not-found`);
  return false;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const A = await ctx.newPage();
  const B = await ctx.newPage();
  const aReq = attachRecorder(A, 'A');
  const bReq = attachRecorder(B, 'B');

  try {
    // -------- Bootstrap: both pages login admin
    await loginPage(A, ADMIN, 'A');
    await sleep(500);
    await B.goto(`${TARGET}/dashboard`, { waitUntil: 'domcontentloaded' });
    await sleep(1500);
    const sA0 = await uiState(A); const sB0 = await uiState(B);
    await shot(A, 'A0-after-login'); await shot(B, 'B0-after-login');
    note('A', 'A0_initial', { A: sA0, B: sB0 });

    // -------- Section E (snapshot 1: storage, IDB before any action)
    const storageA = await A.evaluate(() => ({
      local: Object.fromEntries(Object.keys(localStorage).map(k => [k, (localStorage.getItem(k) || '').slice(0, 200)])),
      session: Object.fromEntries(Object.keys(sessionStorage).map(k => [k, (sessionStorage.getItem(k) || '').slice(0, 200)])),
      cookieDomains: document.cookie ? document.cookie.split(';').map(s => s.split('=')[0].trim()).filter(Boolean) : [],
    }));
    const idbA = await A.evaluate(async () => {
      if (!indexedDB.databases) return { unsupported: true };
      try { const dbs = await indexedDB.databases(); return { dbs: dbs.map(d => ({ name: d.name, version: d.version })) }; }
      catch (e) { return { error: e.message }; }
    });
    note('E', 'E1_localStorage_admin', storageA.local);
    note('E', 'E2_sessionStorage_admin', storageA.session);
    note('E', 'E2b_cookieNames_admin', storageA.cookieDomains);
    note('E', 'E3_indexedDB_admin', idbA);

    // Install storage and BroadcastChannel listeners on Tab B BEFORE we trigger anything
    await B.evaluate(() => {
      window.__storageEvents = [];
      window.__bcEvents = [];
      window.addEventListener('storage', (e) => {
        window.__storageEvents.push({ t: Date.now(), key: e.key, newValue: (e.newValue || '').slice(0, 100), oldValue: (e.oldValue || '').slice(0, 100) });
      });
      const channels = ['auth', 'session', 'app', 'scale-admin', 'logout', 'rtk-query', 'cache'];
      window.__bcChannels = channels.map(n => {
        try {
          const bc = new BroadcastChannel(n);
          bc.onmessage = (e) => window.__bcEvents.push({ t: Date.now(), channel: n, data: String(JSON.stringify(e.data)).slice(0, 200) });
          return n;
        } catch { return null; }
      }).filter(Boolean);
    });
    ev('E', 'B page: listeners installed (storage + BroadcastChannel)');

    // -------- Section C: Stores list freshness
    ev('C', 'navigate both to #stores');
    await A.goto(`${TARGET}/#stores`, { waitUntil: 'domcontentloaded' });
    await B.goto(`${TARGET}/#stores`, { waitUntil: 'domcontentloaded' });
    await sleep(3000);
    const cBefore = await B.evaluate(() => document.body.innerText.includes('QA-MULTITAB-001'));
    note('C', 'C1_B_initial_has_QA-MULTITAB-001', cBefore);
    await shot(A, 'C1-A-stores'); await shot(B, 'C1-B-stores');

    // Create QA-MULTITAB-001 in Tab A via UI button click — fallback to API if not found
    const findBtn = async () => {
      const cands = [
        'button:has-text("Добавить магазин")', 'button:has-text("Create store")', 'button:has-text("Новый магазин")',
        'button:has-text("Добавить")', 'button:has-text("Add store")', 'button:has-text("Новый")',
        'a:has-text("Добавить магазин")', 'a:has-text("Новый магазин")',
      ];
      for (const c of cands) {
        const n = await A.locator(c).count();
        if (n) return c;
      }
      return null;
    };
    const btn = await findBtn();
    let storeCreatedId = null;
    if (btn) {
      ev('C', `Tab A: clicking create-store button: ${btn}`);
      await A.locator(btn).first().click({ timeout: 4000 }).catch(() => {});
      await sleep(1000);
      await shot(A, 'C2-A-store-modal');
      // Try to fill name/code in any visible form
      const nameLoc = A.locator('input[name="name"], input[placeholder*="Название"], input[placeholder*="имя"], input[placeholder*="name"]').first();
      const codeLoc = A.locator('input[name="code"], input[placeholder*="код"], input[placeholder*="Код"], input[placeholder*="code"]').first();
      const tzLoc = A.locator('select[name="timezone"], input[name="timezone"]').first();
      try { await nameLoc.fill('QA-MULTITAB-001', { timeout: 3000 }); } catch {}
      try { await codeLoc.fill('QAMTAB1', { timeout: 3000 }); } catch {}
      try { await tzLoc.fill('Europe/Moscow', { timeout: 2000 }); } catch {}
      await shot(A, 'C2-A-store-filled');
      const subm = A.locator('button[type="submit"], button:has-text("Создать"), button:has-text("Сохранить"), button:has-text("Save"), button:has-text("Create")').first();
      const before = (await A.evaluate(async () => {
        const r = await fetch('/api/stores', { credentials: 'include' });
        const j = await r.json();
        return j.stores ? j.stores.length : 0;
      }));
      await subm.click({ timeout: 4000 }).catch(() => {});
      await sleep(2500);
      const after = (await A.evaluate(async () => {
        const r = await fetch('/api/stores', { credentials: 'include' });
        const j = await r.json();
        const m = (j.stores || []).find(s => s.name === 'QA-MULTITAB-001');
        return { n: (j.stores || []).length, id: m && m.id };
      }));
      note('C', 'C2_via_UI', { before, after });
      storeCreatedId = after.id;
    }
    if (!storeCreatedId) {
      ev('C', 'UI create not detected — fallback: direct API create');
      const csrf = await csrfHeader(ctx);
      const created = await ctx.request.post(`${TARGET}/api/stores`, {
        headers: { 'Content-Type': 'application/json', ...csrf, 'Origin': TARGET },
        data: { name: 'QA-MULTITAB-001', code: 'QAMTAB1', timezone: 'Europe/Moscow' },
      });
      const j = await created.json();
      storeCreatedId = j.store && j.store.id;
      note('C', 'C2_via_API_fallback', { status: created.status(), id: storeCreatedId });
    }

    // Tab B: observe for 30s WITHOUT refresh
    const cPoll = [];
    for (let i = 0; i < 6; i++) {
      await sleep(5000);
      const seen = await B.evaluate(() => document.body.innerText.includes('QA-MULTITAB-001'));
      cPoll.push({ t: ts(), seenInB: seen });
    }
    note('C', 'C3_B_poll_30s_without_refresh', cPoll);
    await shot(B, 'C3-B-after-30s-no-refresh');

    // Tab B: hard refresh, sanity
    await B.reload({ waitUntil: 'domcontentloaded' });
    await sleep(2500);
    const cAfterReload = await B.evaluate(() => document.body.innerText.includes('QA-MULTITAB-001'));
    note('C', 'C4_B_after_reload_has_store', cAfterReload);
    await shot(B, 'C4-B-after-reload');

    // -------- Section D: Store Detail freshness
    const storeIdForD = await pickStoreId(ctx);
    ev('D', `store for detail: ${storeIdForD}`);
    if (!storeIdForD) {
      note('D', 'skip_no_store', true);
    } else {
      await A.goto(`${TARGET}/#store:${storeIdForD}`, { waitUntil: 'domcontentloaded' });
      await B.goto(`${TARGET}/#store:${storeIdForD}`, { waitUntil: 'domcontentloaded' });
      await sleep(3500);
      await shot(A, 'D1-A-store-detail'); await shot(B, 'D1-B-store-detail');

      // Try UI: click Catalog tab, then add category — fallback to API
      let categoryId = null;
      const catalogTab = A.locator('button:has-text("Каталог"), a:has-text("Каталог"), [role="tab"]:has-text("Каталог"), button:has-text("Catalog"), [role="tab"]:has-text("Catalog")').first();
      if (await catalogTab.count()) {
        await catalogTab.click({ timeout: 3000 }).catch(() => {});
        await sleep(1500);
      }
      await shot(A, 'D2-A-on-catalog-tab');
      const addCatBtn = A.locator('button:has-text("Добавить категорию"), button:has-text("Новая категория"), button:has-text("Категория"), button:has-text("Добавить"), button:has-text("Add category"), button:has-text("New category")').first();
      if (await addCatBtn.count()) {
        ev('D', 'Tab A: clicking add-category button');
        await addCatBtn.click({ timeout: 3000 }).catch(() => {});
        await sleep(1200);
        const nameInput = A.locator('input[name="name"], input[placeholder*="Название"], input[placeholder*="имя"], input[placeholder*="name"]').first();
        try { await nameInput.fill('QA-MTAB-CAT-001', { timeout: 3000 }); } catch {}
        await shot(A, 'D2-A-cat-modal');
        const submit = A.locator('button[type="submit"], button:has-text("Создать"), button:has-text("Сохранить"), button:has-text("Save"), button:has-text("Create")').first();
        await submit.click({ timeout: 4000 }).catch(() => {});
        await sleep(2500);
        const found = await A.evaluate(async (sid) => {
          const r = await fetch(`/api/stores/${sid}/catalog/categories`, { credentials: 'include' });
          if (!r.ok) return { status: r.status };
          const j = await r.json();
          const flat = JSON.stringify(j);
          const m = flat.match(/"id":"([0-9a-f-]{36})"[^}]*?"name":"QA-MTAB-CAT-001"/);
          return { status: r.status, id: m && m[1] };
        }, storeIdForD);
        note('D', 'D2_via_UI', found);
        categoryId = found.id;
      }
      if (!categoryId) {
        ev('D', 'UI category create not detected — fallback: direct API create');
        const csrf = await csrfHeader(ctx);
        const r = await ctx.request.post(`${TARGET}/api/stores/${storeIdForD}/catalog/categories`, {
          headers: { 'Content-Type': 'application/json', ...csrf, 'Origin': TARGET },
          data: { name: 'QA-MTAB-CAT-001' },
        });
        const j = await r.json();
        categoryId = j && (j.id || (j.category && j.category.id));
        note('D', 'D2_via_API_fallback', { status: r.status(), id: categoryId, raw: JSON.stringify(j).slice(0, 200) });
      }

      // Tab B: observe 30s without refresh
      const dPoll = [];
      for (let i = 0; i < 6; i++) {
        await sleep(5000);
        const seen = await B.evaluate(() => document.body.innerText.includes('QA-MTAB-CAT-001'));
        dPoll.push({ t: ts(), seenInB: seen });
      }
      note('D', 'D3_B_poll_30s_without_refresh', dPoll);
      await shot(B, 'D3-B-after-30s-no-refresh');

      // Tab B refresh sanity
      await B.reload({ waitUntil: 'domcontentloaded' });
      await sleep(3000);
      const dAfter = await B.evaluate(() => document.body.innerText.includes('QA-MTAB-CAT-001'));
      note('D', 'D4_B_after_reload_has_category', dAfter);
      await shot(B, 'D4-B-after-reload');

      report.cleanup.categoryId = categoryId;
      report.cleanup.storeIdForD = storeIdForD;
    }

    // -------- Section A: Logout broadcast (with E4/E5 listeners already on B)
    // Ensure A has fresh nav: go to dashboard
    await A.goto(`${TARGET}/#stores`, { waitUntil: 'domcontentloaded' });
    await sleep(1500);
    const aBeforeLogout = await uiState(A); const bBeforeLogout = await uiState(B);
    note('A', 'A1_pre_logout', { A: aBeforeLogout, B: bBeforeLogout });

    ev('A', 'Tab A: logout');
    const logoutRes = await logoutPage(A, 'A');
    note('A', 'A2_logout_status', logoutRes);
    await shot(A, 'A2-A-after-logout');

    // Wait up to 60s, polling Tab B every 5s — does it transition to logged-out state?
    const aPoll = [];
    for (let i = 0; i < 12; i++) {
      await sleep(5000);
      const st = await uiState(B);
      const sess = await B.evaluate(async () => {
        try { const r = await fetch('/api/auth/session', { credentials: 'include' }); return { status: r.status }; } catch (e) { return { error: e.message }; }
      });
      aPoll.push({ t: ts(), bUrl: st.url, bOnLogin: st.onLogin, bH1: st.h1, sess });
    }
    note('A', 'A2_B_poll_60s', aPoll);
    await shot(B, 'A2-B-after-60s');

    // Capture storage/BC events captured by Tab B during the logout window
    const captured = await B.evaluate(() => ({
      storageEvents: window.__storageEvents || [],
      bcEvents: window.__bcEvents || [],
      bcChannels: window.__bcChannels || [],
    }));
    note('E', 'E4_storage_events_during_logout', captured.storageEvents);
    note('E', 'E5_broadcast_channel_events_during_logout', captured.bcEvents);
    note('E', 'E5b_bc_channels_subscribed', captured.bcChannels);

    // A3: Tab B click Stores link → expect 401 → /login
    ev('A', 'Tab B: click Stores nav after Tab A logged out');
    const before3 = page => uiState(page);
    const navResp = [];
    B.on('response', r => { if (r.url().includes('/api/')) navResp.push({ t: ts(), m: r.request().method(), u: r.url().replace(TARGET, ''), s: r.status() }); });
    const storesLink = B.locator('a[href*="#stores"], a:has-text("Магазины"), a:has-text("Stores")').first();
    if (await storesLink.count()) {
      await storesLink.click({ timeout: 4000 }).catch(() => {});
    } else {
      await B.goto(`${TARGET}/#stores`, { waitUntil: 'domcontentloaded' });
    }
    await sleep(3000);
    const a3State = await uiState(B);
    note('A', 'A3_B_after_stores_click', { state: a3State, recentApi: navResp.slice(-8) });
    await shot(B, 'A3-B-after-stores-click');

    // A4: Tab B try state-changing create-product on first store
    const csrfB = await B.evaluate(() => (document.cookie.match(/scale_admin_csrf=([^;]+)/) || [])[1] || null);
    const createProductRes = await B.evaluate(async (token) => {
      try {
        const r = await fetch('/api/products', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...(token ? { 'x-csrf-token': token } : {}) },
          body: JSON.stringify({ name: 'QA-MTAB-PROD-NOAUTH', sku: 'QAMTABNOAUTH' }),
        });
        const body = await r.text();
        return { status: r.status, body: body.slice(0, 300) };
      } catch (e) { return { error: e.message }; }
    }, csrfB);
    note('A', 'A4_B_state_change_after_A_logout', { csrfPresent: !!csrfB, ...createProductRes });
    await shot(B, 'A4-B-after-state-change-attempt');

    // -------- Section B: Multi-role session swap
    // First, login admin in A again (fresh)
    await loginPage(A, ADMIN, 'A');
    await A.goto(`${TARGET}/#stores`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    const a0 = await uiState(A);
    note('B', 'B0_A_relogin_admin', a0);
    await shot(A, 'B0-A-admin-dashboard');

    // B logs in operator (this overwrites the cookie because same context)
    await loginPage(B, OPER, 'B');
    await B.goto(`${TARGET}/#stores`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    const b0 = await uiState(B);
    note('B', 'B1_B_logged_operator', b0);
    await shot(B, 'B1-B-operator-dashboard');

    // Verify backend now sees operator session
    const sessAfter = await ctx.request.get(`${TARGET}/api/auth/session`).then(r => r.json()).catch(() => null);
    note('B', 'B1b_backend_session_after_oper_login', sessAfter && sessAfter.user ? { role: sessAfter.user.role, email: sessAfter.user.email } : sessAfter);

    // Now poll Tab A for 30s — does it detect the role swap?
    const bPoll = [];
    for (let i = 0; i < 6; i++) {
      await sleep(5000);
      const st = await uiState(A);
      const navItems = await A.evaluate(() => {
        return Array.from(document.querySelectorAll('nav a, aside a, header a'))
          .map(a => (a.textContent || '').replace(/\s+/g, ' ').trim())
          .filter(t => t && t.length < 40)
          .slice(0, 12);
      });
      const seesAdminOnlyLinks = navItems.some(t => /Users|Пользователи|Logs|Логи|Доступ/i.test(t));
      const sess = await A.evaluate(async () => {
        try { const r = await fetch('/api/auth/session', { credentials: 'include' }); return r.ok ? await r.json() : { status: r.status }; } catch (e) { return { error: e.message }; }
      });
      bPoll.push({ t: ts(), url: st.url, h1: st.h1, navItems: navItems.slice(0, 8), seesAdminOnly: seesAdminOnlyLinks, sessRole: sess && sess.user && sess.user.role });
    }
    note('B', 'B2_A_poll_30s_after_role_swap', bPoll);
    await shot(A, 'B2-A-after-role-swap-30s');

    // Click an admin-only nav item in Tab A — expect 401/403 or fallback
    const adminLink = A.locator('a[href*="#users-access"], a[href*="#global-logs"], a:has-text("Пользователи"), a:has-text("Доступ"), a:has-text("Users"), a:has-text("Logs")').first();
    const apiSeen = [];
    A.on('response', r => { if (r.url().includes('/api/')) apiSeen.push({ t: ts(), s: r.status(), u: r.url().replace(TARGET, '') }); });
    if (await adminLink.count()) {
      await adminLink.click({ timeout: 3000 }).catch(() => {});
    } else {
      await A.goto(`${TARGET}/#users-access`, { waitUntil: 'domcontentloaded' });
    }
    await sleep(2500);
    const a2state = await uiState(A);
    note('B', 'B3_A_click_admin_link_after_swap', { state: a2state, api: apiSeen.slice(-8) });
    await shot(A, 'B3-A-after-admin-link-click');

  } catch (e) {
    report.fatal = e.message;
    console.error('FATAL', e);
  } finally {
    report.endedAt = new Date().toISOString();
    report.aRequests = aReq.slice(-30);
    report.bRequests = bReq.slice(-30);
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    console.log(`Report: ${REPORT}`);
    await browser.close();
  }

  // ------- Cleanup via fresh admin session
  const apiCtx = await pwRequest.newContext();
  try {
    const r1 = await apiCtx.get(`${TARGET}/api/auth/csrf`);
    const j1 = await r1.json();
    const csrf = j1.csrfToken;
    await apiCtx.post(`${TARGET}/api/auth/login`, {
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf, 'Origin': TARGET },
      data: { email: ADMIN.email, password: ADMIN.password },
    });
    const csrf2 = (await (await apiCtx.get(`${TARGET}/api/auth/csrf`)).json()).csrfToken;

    // C cleanup: find QA-MULTITAB-001 and PATCH status=archived
    const stores = await (await apiCtx.get(`${TARGET}/api/stores`)).json();
    const qa = (stores.stores || []).find(s => s.name === 'QA-MULTITAB-001');
    if (qa) {
      const preVerify = await (await apiCtx.get(`${TARGET}/api/stores/${qa.id}`)).json();
      report.cleanup.storeQa = { id: qa.id, preStatus: preVerify.store && preVerify.store.status };
      const patched = await apiCtx.patch(`${TARGET}/api/stores/${qa.id}`, {
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf2, 'Origin': TARGET },
        data: { status: 'archived' },
      });
      const postVerify = await (await apiCtx.get(`${TARGET}/api/stores/${qa.id}`)).json();
      report.cleanup.storeQa.patchStatus = patched.status();
      report.cleanup.storeQa.postStatus = postVerify.store && postVerify.store.status;
    } else {
      report.cleanup.storeQa = { notFound: true };
    }

    // D cleanup: archive category
    if (report.cleanup.categoryId && report.cleanup.storeIdForD) {
      const sid = report.cleanup.storeIdForD; const cid = report.cleanup.categoryId;
      // Pre-verify category exists
      const list = await (await apiCtx.get(`${TARGET}/api/stores/${sid}/catalog/categories`)).json();
      const flat = JSON.stringify(list);
      const preExists = flat.includes(`"id":"${cid}"`);
      report.cleanup.category = { id: cid, preExists };
      const patched = await apiCtx.patch(`${TARGET}/api/stores/${sid}/catalog/categories/${cid}`, {
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf2, 'Origin': TARGET },
        data: { status: 'archived' },
      });
      const postList = await (await apiCtx.get(`${TARGET}/api/stores/${sid}/catalog/categories`)).json();
      const postFlat = JSON.stringify(postList);
      report.cleanup.category.patchStatus = patched.status();
      report.cleanup.category.postFlatHas = postFlat.includes(`"id":"${cid}"`);
      report.cleanup.category.postStatusInBody = (postFlat.match(new RegExp(`"id":"${cid}"[^}]*"status":"([^"]+)"`)) || [])[1] || null;
    } else {
      report.cleanup.category = { skipped: 'no id' };
    }
  } catch (e) {
    report.cleanup.error = e.message;
  } finally {
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    await apiCtx.dispose();
    console.log('Cleanup done.');
  }
}

main().catch(e => { console.error('TOP', e); process.exit(1); });
