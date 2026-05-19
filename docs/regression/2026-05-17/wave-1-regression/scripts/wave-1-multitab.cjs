/**
 * Wave 1 verify — BUG-REG-014 (cross-tab logout) + BUG-REG-017 (cross-tab role switch).
 * Target: local docker stack at http://localhost:5173 (frontend) + http://localhost:3000 (api).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FE = 'http://localhost:5173';
const API = 'http://localhost:3000';
const ADMIN = { email: 'admin@example.com', password: 'admin12345' };
const OPERATOR = { email: 'qa-operator@example.com', password: 'admin12345' };
const EVI = path.resolve(__dirname, '..', 'evidence');
fs.mkdirSync(EVI, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toISOString().slice(11, 23);
const log = (k, v) => console.log(`[${ts()}] ${k}`, typeof v === 'object' ? JSON.stringify(v).slice(0, 300) : v);

async function uiState(page) {
  const url = page.url();
  let h1 = '';
  try { h1 = (await page.locator('h1').first().textContent({ timeout: 1500 })) || ''; } catch {}
  let body = '';
  try { body = (await page.locator('body').textContent({ timeout: 1500 })) || ''; } catch {}
  const bodyTrim = body.replace(/\s+/g, ' ').slice(0, 200);
  const onLogin = /Вход в систему|Login|Войти/i.test(body) && !/Добро пожаловать/i.test(body);
  return { url, h1: h1.trim(), body: bodyTrim, onLogin };
}

async function shot(page, name) {
  const p = path.join(EVI, `${name}.png`);
  try { await page.screenshot({ path: p }); } catch {}
}

async function getCsrf(ctx) {
  const r = await ctx.request.get(`${API}/api/auth/csrf`);
  const j = await r.json();
  return j.csrfToken;
}

async function uiLogin(page, who) {
  await page.goto(`${FE}/`, { waitUntil: 'domcontentloaded' });
  await sleep(500);
  await page.locator('input[type="email"], input[name="email"]').first().fill(who.email);
  await page.locator('input[type="password"]').first().fill(who.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForResponse(r => r.url().includes('/api/auth/login') && r.status() === 200, { timeout: 15000 }).catch(() => {});
  await sleep(2000);
}

(async () => {
  const report = { startedAt: new Date().toISOString(), A: {}, B: {} };
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ baseURL: FE, ignoreHTTPSErrors: true });

  // === BUG-REG-014: logout in tab A → tab B reflects within 30s ===
  log('SCENARIO_A', 'BUG-REG-014 logout-broadcast');
  const tabA = await ctx.newPage();
  await uiLogin(tabA, ADMIN);
  const stateA0 = await uiState(tabA);
  log('A0 tabA after admin login', stateA0);
  report.A.A0_tabA_after_login = stateA0;

  const tabB = await ctx.newPage();
  await tabB.goto(`${FE}/`, { waitUntil: 'domcontentloaded' });
  await sleep(3000);
  const stateB0 = await uiState(tabB);
  log('A0 tabB initial', stateB0);
  report.A.A0_tabB_initial = stateB0;
  await shot(tabA, 'A-tabA-after-login');
  await shot(tabB, 'A-tabB-initial');

  // Tab A: logout via UI
  const csrf = await getCsrf(ctx);
  await tabA.evaluate(async ({ api, csrf }) => {
    await fetch(`${api}/api/auth/logout`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
    });
  }, { api: API, csrf });
  log('A1', 'logout posted from tabA');
  // BroadcastChannel is synchronous-ish; give it 1.5s
  await sleep(1500);
  const stateAlogout = await uiState(tabA);
  const stateB1 = await uiState(tabB);
  log('A1 tabA after logout', stateAlogout);
  log('A1 tabB after 1.5s', stateB1);
  report.A.A1_tabA_after_logout = stateAlogout;
  report.A.A1_tabB_after_15s_short = stateB1;

  // Poll B for ≤30s to detect login screen
  const start = Date.now();
  let detectedAtMs = null;
  while (Date.now() - start < 30000) {
    const s = await uiState(tabB);
    if (s.onLogin) { detectedAtMs = Date.now() - start; break; }
    await sleep(1000);
  }
  const stateB30 = await uiState(tabB);
  log('A2 tabB detection', { detectedAtMs, stateB30 });
  report.A.A2_tabB_detected_at_ms = detectedAtMs;
  report.A.A2_tabB_final = stateB30;
  await shot(tabB, 'A-tabB-after-logout-broadcast');

  await tabA.close();
  await tabB.close();

  // === BUG-REG-017: cross-tab role switch ===
  log('SCENARIO_B', 'BUG-REG-017 cross-tab role-switch');
  const ctxB = await browser.newContext({ baseURL: FE, ignoreHTTPSErrors: true });
  const t1 = await ctxB.newPage();
  await uiLogin(t1, ADMIN);
  const st1_0 = await uiState(t1);
  log('B0 tab1 admin', st1_0);
  report.B.B0_tab1_admin = st1_0;
  await shot(t1, 'B-tab1-admin');

  // From a second tab, direct POST /api/auth/login as operator (overwrites session cookie)
  const t2 = await ctxB.newPage();
  await t2.goto(`${FE}/`, { waitUntil: 'domcontentloaded' });
  const csrfB = await getCsrf(ctxB);
  const loginResp = await t2.evaluate(async ({ api, op, csrf }) => {
    const r = await fetch(`${api}/api/auth/login`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
      body: JSON.stringify({ email: op.email, password: op.password }),
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, { api: API, op: OPERATOR, csrf: csrfB });
  log('B1 operator login from tab2', loginResp);
  report.B.B1_operator_login_status = loginResp.status;
  if (loginResp.status !== 200) {
    log('B1 operator login failed, scenario B aborted', loginResp);
  } else {
    // t1 must reflect the role change within 30s
    const startB = Date.now();
    let detectedB = null;
    while (Date.now() - startB < 30000) {
      const s = await uiState(t1);
      // Either tab1 now shows operator UI (no admin-only nav) OR shows login.
      const txt = (s.body || '').toLowerCase();
      const stillAdmin = txt.includes('users & access') || txt.includes('global logs');
      if (s.onLogin || !stillAdmin) { detectedB = Date.now() - startB; break; }
      await sleep(1000);
    }
    const final = await uiState(t1);
    log('B2 tab1 detection', { detectedB, final });
    report.B.B2_tab1_detected_at_ms = detectedB;
    report.B.B2_tab1_final = final;
    await shot(t1, 'B-tab1-after-operator-login');
  }

  await ctx.close();
  await ctxB.close();
  await browser.close();

  fs.writeFileSync(path.join(EVI, 'multitab-report.json'), JSON.stringify(report, null, 2));
  log('DONE', 'multitab-report.json written');
})().catch(e => { console.error(e); process.exit(1); });
