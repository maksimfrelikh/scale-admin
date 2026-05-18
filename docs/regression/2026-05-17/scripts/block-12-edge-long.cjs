/**
 * BLOCK-12 F18/F19 — long-name screenshots zoomed.
 * D14/D15 — long session simulation (cookie clear) + brief polling check.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://maksimfrelikh.ru';
const EVI = path.resolve(__dirname, '..', 'evidence', 'block-12');
const QA_PASSWORD = process.env.QA_PASSWORD;
if (!QA_PASSWORD) throw new Error('Set QA_PASSWORD env');
const ADMIN = { email: 'qa-admin@***.invalid', password: QA_PASSWORD };
const FULL_STORE_ID = '1cf0f4ba-71a8-4a0d-b87d-8e5494baf263';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const report = { startedAt: new Date().toISOString(), steps: [] };
function log(step, status, detail) {
  const line = { step, status, detail, ts: new Date().toISOString() };
  report.steps.push(line);
  console.log(`[${status}] ${step}${detail ? ' — ' + JSON.stringify(detail) : ''}`);
}
async function loginUi(page, creds) {
  await page.goto(TARGET + '/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name="email"]').first().fill(creds.email);
  await page.locator('input[type="password"]').first().fill(creds.password);
  await Promise.all([
    page.waitForURL((url) => !url.toString().includes('/login') || url.toString().includes('#'), { timeout: 20000 }).catch(() => {}),
    page.locator('button[type="submit"]').first().click(),
  ]);
  await sleep(2500);
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(EVI, `${name}.png`), fullPage: true });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const page = await ctx.newPage();

  try {
    await loginUi(page, ADMIN);
    log('login', 'pass');

    // F18: locate long-name store and screenshot the row
    await page.goto(TARGET + '/#stores', { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    // Locate the row containing "QA Block12 Long Name"
    const row = page.locator('text=/QA Block12 Long Name/').first();
    if (await row.count() > 0) {
      await row.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(500);
      await shot(page, 'F18-long-name-row');
      // Element-level bounding box screenshot
      const box = await row.boundingBox().catch(() => null);
      if (box) {
        await page.screenshot({ path: path.join(EVI, 'F18-long-name-zoom.png'), clip: { x: 0, y: Math.max(0, box.y - 80), width: 1366, height: Math.min(400, box.height + 200) }, fullPage: false });
      }
      const overflow = await page.evaluate(() => {
        // detect horizontal overflow on body
        const html = document.documentElement;
        return { scrollW: Math.max(html.scrollWidth, document.body.scrollWidth), clientW: html.clientWidth };
      });
      log('F18-long-name-row', overflow.scrollW > overflow.clientW + 2 ? 'fail-horizontal-overflow' : 'pass', overflow);
    } else {
      log('F18-long-name-row', 'skip-not-found', {});
    }

    // F19: long-name category tree
    await page.goto(TARGET + `/#store:${FULL_STORE_ID}`, { waitUntil: 'domcontentloaded' });
    await sleep(3000);
    const catRow = page.locator('text=/QA Block12 Long Cat/').first();
    if (await catRow.count() > 0) {
      await catRow.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(500);
      await shot(page, 'F19-long-cat-tree');
      const box = await catRow.boundingBox().catch(() => null);
      if (box) {
        await page.screenshot({ path: path.join(EVI, 'F19-long-cat-zoom.png'), clip: { x: 0, y: Math.max(0, box.y - 60), width: 1366, height: Math.min(500, box.height + 250) }, fullPage: false });
      }
      const overflow = await page.evaluate(() => {
        const html = document.documentElement;
        return { scrollW: Math.max(html.scrollWidth, document.body.scrollWidth), clientW: html.clientWidth };
      });
      log('F19-long-cat-row', overflow.scrollW > overflow.clientW + 2 ? 'fail-horizontal-overflow' : 'pass', overflow);
    } else {
      log('F19-long-cat-row', 'skip-not-found', {});
    }

    // D14: polling check — record API calls over 90 seconds while idle on overview
    await page.goto(TARGET + '/', { waitUntil: 'domcontentloaded' });
    await sleep(2000);
    const calls = [];
    const handler = (req) => {
      if (/\/api\//.test(req.url())) calls.push({ ts: Date.now(), url: req.url(), method: req.method() });
    };
    page.on('request', handler);
    const start = Date.now();
    console.log('D14: monitoring polls for 90s...');
    await sleep(90000);
    page.off('request', handler);
    const elapsed = (Date.now() - start) / 1000;
    const grouped = {};
    for (const c of calls) {
      const key = c.method + ' ' + c.url.replace(/\?.*/, '').replace(/^https?:\/\/[^/]+/, '');
      grouped[key] = (grouped[key] || 0) + 1;
    }
    fs.writeFileSync(path.join(EVI, 'D14-polling-90s.json'), JSON.stringify({ elapsed, totalCalls: calls.length, grouped, sample: calls.slice(0, 20) }, null, 2));
    log('D14-no-polling-90s', calls.length === 0 ? 'pass' : (calls.length < 3 ? 'pass-low-traffic' : 'fail-polling-detected'), { elapsed, totalCalls: calls.length, distinctEndpoints: Object.keys(grouped).length });

    // D15: simulate expired session — clear session cookie, attempt action, expect 401 → /login
    const cookiesBefore = await ctx.cookies();
    const sessionCookieNames = cookiesBefore.filter(c => /session/i.test(c.name)).map(c => c.name);
    await ctx.clearCookies({ name: 'scale_admin_session' }).catch(async () => {
      // Fallback: clear all cookies
      for (const c of cookiesBefore) {
        if (/session/i.test(c.name)) {
          await ctx.clearCookies({ name: c.name }).catch(() => {});
        }
      }
    });
    // Verify session cookie gone
    const cookiesAfter = await ctx.cookies();
    const stillSession = cookiesAfter.find(c => c.name === 'scale_admin_session');
    let action401 = false;
    let landedOnLogin = false;
    let actionResp = null;
    // Trigger an API action
    actionResp = await page.evaluate(async () => {
      const r = await fetch('/api/stores', { credentials: 'include' });
      return { status: r.status, ok: r.ok };
    });
    action401 = actionResp.status === 401;
    // Try to navigate via UI
    await page.goto(TARGET + '/#stores', { waitUntil: 'domcontentloaded' });
    await sleep(3500);
    await shot(page, 'D15-after-session-clear-nav');
    const finalUrl = page.url();
    landedOnLogin = /\/login/.test(finalUrl) || /Sign in|вход|Email|пароль/.test(await page.evaluate(() => document.body.innerText.slice(0, 500)));
    log('D15-expired-session', action401 ? 'pass' : 'fail-no-401', { sessionCookieClearedSuccessfully: !stillSession, action401, actionStatus: actionResp.status, landedOnLogin, finalUrl, sessionCookieNames });

  } catch (e) {
    log('script-error', 'fail', { message: e.message, stack: e.stack.slice(0, 600) });
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(EVI, 'report-edge-long.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})();
