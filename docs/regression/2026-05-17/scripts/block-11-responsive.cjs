/**
 * BLOCK-11 — Mobile / Responsive sweep.
 *
 * 8 pages × 5 viewports = 40 screenshots + DOM measurements.
 *
 * Pages:
 *   A login (unauth)        /login
 *   B overview admin        /            (admin authed)
 *   C overview operator     /            (operator authed)
 *   D stores list           /#stores     (admin)
 *   E store details         /#store:<id> (admin)
 *   F products              /#products   (admin)
 *   G users-access          /#users-access (admin)
 *   H global-logs           /#global-logs (admin)
 *
 * Viewports:
 *   v1366  laptop baseline   1366x768
 *   v1024  tablet landscape  1024x768
 *   v768   tablet portrait    768x1024
 *   v414   mobile large       414x896
 *   v375   mobile small       375x667
 *
 * Run:
 *   QA_PASSWORD='...' node docs/regression/2026-05-17/scripts/block-11-responsive.cjs
 *
 * Output:
 *   docs/regression/2026-05-17/evidence/block-11/<page>-<viewport>.png
 *   docs/regression/2026-05-17/evidence/block-11/report.json
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://maksimfrelikh.ru';
const EVI = path.resolve(__dirname, '..', 'evidence', 'block-11');
fs.mkdirSync(EVI, { recursive: true });

const QA_PASSWORD = process.env.QA_PASSWORD;
if (!QA_PASSWORD) throw new Error('Set QA_PASSWORD env (see AGENTS.md §2)');
const ADMIN    = { email: 'qa-admin@***.invalid',    password: QA_PASSWORD };
const OPERATOR = { email: 'qa-operator@***.invalid', password: QA_PASSWORD };

// Known store id from BLOCK-10 (UAT20260515P4195540, current published catalog v=2).
const STORE_ID = '1cf0f4ba-71a8-4a0d-b87d-8e5494baf263';

const VIEWPORTS = [
  { id: 'v1366', label: '1366x768 laptop',       w: 1366, h: 768  },
  { id: 'v1024', label: '1024x768 tablet land',  w: 1024, h: 768  },
  { id: 'v768',  label: '768x1024 tablet port',  w: 768,  h: 1024 },
  { id: 'v414',  label: '414x896 mobile L',      w: 414,  h: 896  },
  { id: 'v375',  label: '375x667 mobile S',      w: 375,  h: 667  },
];

const PAGES = [
  { id: 'A-login',     role: 'unauth',   hash: '',                 navTo: '/login' },
  { id: 'B-overview',  role: 'admin',    hash: '',                 navTo: '/'      },
  { id: 'C-overview',  role: 'operator', hash: '',                 navTo: '/'      },
  { id: 'D-stores',    role: 'admin',    hash: '#stores',          navTo: '/#stores'        },
  { id: 'E-store-det', role: 'admin',    hash: `#store:${STORE_ID}`, navTo: `/#store:${STORE_ID}` },
  { id: 'F-products',  role: 'admin',    hash: '#products',        navTo: '/#products'      },
  { id: 'G-users',     role: 'admin',    hash: '#users-access',    navTo: '/#users-access'  },
  { id: 'H-logs',      role: 'admin',    hash: '#global-logs',     navTo: '/#global-logs'   },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function loginUi(page, creds) {
  await page.goto(TARGET + '/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('input[type="email"], input[name="email"]').first().fill(creds.email);
  await page.locator('input[type="password"]').first().fill(creds.password);
  await Promise.all([
    page.waitForURL((url) => !url.toString().includes('/login') || url.toString().includes('#'), { timeout: 20000 }).catch(() => {}),
    page.locator('button[type="submit"]').first().click(),
  ]);
  await sleep(2500);
}

/**
 * Measure responsive metrics on the current page.
 * Runs in browser context.
 */
async function measure(page, viewport) {
  return await page.evaluate((vp) => {
    const html = document.documentElement;
    const body = document.body;
    const docScrollW = Math.max(html.scrollWidth, body.scrollWidth);
    const docScrollH = Math.max(html.scrollHeight, body.scrollHeight);
    const docClientW = html.clientWidth;
    const horizontalOverflow = docScrollW > vp + 2;

    // Find overflowing descendants (right edge > viewport + 2px).
    const overflowers = [];
    const all = document.querySelectorAll('body *');
    const limit = 25;
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.right > vp + 2 && r.width > 4) {
        const cls = typeof el.className === 'string' ? el.className.slice(0, 100) : '';
        const id = el.id || '';
        const path = (() => {
          let cur = el; const parts = []; let depth = 0;
          while (cur && cur !== document.body && depth < 5) {
            const name = cur.tagName.toLowerCase();
            const c = (typeof cur.className === 'string' && cur.className) ? '.' + cur.className.split(' ').filter(Boolean).slice(0, 2).join('.') : '';
            const i = cur.id ? '#' + cur.id : '';
            parts.unshift(name + i + c);
            cur = cur.parentElement; depth++;
          }
          return parts.join(' > ');
        })();
        overflowers.push({
          tag: el.tagName,
          id, cls,
          width: Math.round(r.width),
          right: Math.round(r.right),
          scrollWidth: el.scrollWidth,
          path: path.slice(0, 280),
        });
        if (overflowers.length >= limit) break;
      }
    }

    // Tap target audit (clickables with min dim < 44).
    const tapSmall = [];
    if (vp < 600) {
      const clickables = document.querySelectorAll('button, a[href], [role="button"], input[type="submit"]');
      for (const el of clickables) {
        const r = el.getBoundingClientRect();
        if (r.width < 1 && r.height < 1) continue;
        if (r.width < 44 || r.height < 44) {
          tapSmall.push({
            tag: el.tagName,
            text: (el.textContent || '').slice(0, 40).replace(/\s+/g, ' ').trim(),
            w: Math.round(r.width),
            h: Math.round(r.height),
          });
          if (tapSmall.length >= 20) break;
        }
      }
    }

    // Hamburger / drawer / nav-toggle presence (heuristic).
    const hamburger = (() => {
      const candidates = document.querySelectorAll('button, [role="button"]');
      for (const el of candidates) {
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        const t = (el.textContent || '').toLowerCase();
        const cls = (typeof el.className === 'string' ? el.className : '').toLowerCase();
        if (/menu|nav|hamburger|drawer|burger|navigation/.test(aria) ||
            /^(menu|☰|≡)$/.test(t.trim()) ||
            /menu|hamburger|drawer|burger|navtoggle|nav-toggle/.test(cls)) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            return { tag: el.tagName, aria, text: t.slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) };
          }
        }
      }
      return null;
    })();

    // Nav links visible (for sanity).
    const navLinks = Array.from(document.querySelectorAll('nav a, aside a, [class*="sidebar"] a, [class*="Sidebar"] a, header a'))
      .map(a => ({ text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40), href: a.getAttribute('href') || '' }))
      .filter(x => x.text && x.href)
      .slice(0, 12);

    // Visible body text snippet (first heading).
    const h1 = (document.querySelector('h1')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const h2 = (document.querySelector('h2')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);

    return {
      docScrollW,
      docScrollH,
      docClientW,
      viewport: vp,
      horizontalOverflow,
      overflowDelta: docScrollW - vp,
      overflowers: overflowers.slice(0, 12),
      tapSmall,
      hamburger,
      navLinks,
      h1, h2,
    };
  }, viewport);
}

async function runOne(browser, viewport, pageDef) {
  const ctx = await browser.newContext({
    viewport: { width: viewport.w, height: viewport.h },
    deviceScaleFactor: 1,
    isMobile: viewport.w <= 768,
    hasTouch: viewport.w <= 768,
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const networkFailures = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 240));
  });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message.slice(0, 240)));
  page.on('response', (r) => {
    if (r.status() >= 400) networkFailures.push({ url: r.url(), status: r.status() });
  });

  const result = {
    page: pageDef.id,
    viewport: viewport.id,
    role: pageDef.role,
    url_target: TARGET + pageDef.navTo,
  };

  try {
    if (pageDef.role !== 'unauth') {
      const creds = pageDef.role === 'admin' ? ADMIN : OPERATOR;
      await loginUi(page, creds);
      if (pageDef.navTo && pageDef.navTo !== '/') {
        await page.goto(TARGET + pageDef.navTo, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(2500);
      } else {
        // Already on dashboard root.
        await sleep(1500);
      }
    } else {
      await page.goto(TARGET + pageDef.navTo, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(1500);
    }

    // Scroll to bottom (forces lazy content / extends document for fullPage screenshot accuracy).
    try {
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let total = 0;
          const step = 400;
          const t = setInterval(() => {
            window.scrollBy(0, step);
            total += step;
            if (total > 6000 || (window.innerHeight + window.scrollY) >= document.body.scrollHeight - 10) {
              clearInterval(t);
              resolve(undefined);
            }
          }, 80);
        });
      });
      await sleep(800);
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(400);
    } catch (_) {}

    const m = await measure(page, viewport.w);
    result.metrics = m;
    result.url_actual = page.url();

    const shot = path.join(EVI, `${pageDef.id}-${viewport.id}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    result.screenshot = path.relative(path.resolve(EVI, '..', '..'), shot);
  } catch (e) {
    result.error = e.message;
  } finally {
    result.consoleErrors = consoleErrors.slice(0, 8);
    result.networkFailures = networkFailures.slice(0, 8);
    await ctx.close().catch(() => {});
  }
  return result;
}

(async () => {
  console.log(`[block-11] start ${new Date().toISOString()}`);
  const browser = await chromium.launch({ headless: true });
  const all = [];

  for (const vp of VIEWPORTS) {
    for (const p of PAGES) {
      const t0 = Date.now();
      const r = await runOne(browser, vp, p);
      const ms = Date.now() - t0;
      const ov = r.metrics ? `dw=${r.metrics.docScrollW} ${r.metrics.horizontalOverflow ? 'OVERFLOW' : 'ok'}` : (r.error ? 'ERR ' + r.error.slice(0, 80) : '?');
      console.log(`[block-11] ${vp.id} ${p.id.padEnd(11)} ${ms}ms  ${ov}`);
      all.push(r);
    }
  }

  await browser.close();
  const report = {
    generatedAt: new Date().toISOString(),
    target: TARGET,
    viewports: VIEWPORTS,
    pages: PAGES,
    results: all,
  };
  const rp = path.join(EVI, 'report.json');
  fs.writeFileSync(rp, JSON.stringify(report, null, 2));
  console.log(`[block-11] done. Report: ${rp}`);
})().catch((e) => { console.error('[block-11] FATAL', e); process.exit(1); });
