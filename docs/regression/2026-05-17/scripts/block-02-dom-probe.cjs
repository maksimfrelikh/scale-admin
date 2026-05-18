/** DOM structure probe after admin login + operator login. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://maksimfrelikh.ru';
// QA credentials are sourced from AGENTS.md §2 via env to avoid embedding in committed files.
const QA_PASSWORD = process.env.QA_PASSWORD || (() => { throw new Error('Set QA_PASSWORD env (see AGENTS.md §2)'); })();
const ADMIN = { email: 'qa-admin@***.invalid', password: QA_PASSWORD };
const OPER  = { email: 'qa-operator@***.invalid', password: QA_PASSWORD };
const EVI = path.resolve(__dirname, '..', 'evidence');
const OUT = path.resolve(EVI, 'block-02-dom-probe.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function login(page, creds) {
  await page.goto(`${TARGET}/`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.locator('input[type="email"]').first().fill(creds.email);
  await page.locator('input[type="password"]').first().fill(creds.password);
  await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/auth/login'), { timeout: 10000 }),
    page.locator('button[type="submit"]').first().click(),
  ]);
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await sleep(1500);
}

async function snapshot(page, label) {
  await page.screenshot({ path: path.join(EVI, `dom-probe-${label}.png`), fullPage: true });
  return await page.evaluate(() => {
    const visibleText = [];
    document.querySelectorAll('a, button').forEach(el => {
      const s = window.getComputedStyle(el);
      if (s.display !== 'none' && s.visibility !== 'hidden') {
        const txt = (el.innerText || el.textContent || '').trim();
        const href = el.getAttribute('href') || '';
        if (txt && txt.length < 120) visibleText.push({ tag: el.tagName.toLowerCase(), text: txt, href });
      }
    });
    return {
      title: document.title,
      url: location.href,
      bodyClasses: document.body.className,
      h1: Array.from(document.querySelectorAll('h1,h2')).map(h => h.innerText.trim()),
      anchors: visibleText,
      hasNavTag: document.querySelectorAll('nav').length,
      hasAsideTag: document.querySelectorAll('aside').length,
      hasHeaderTag: document.querySelectorAll('header').length,
      navRoleCount: document.querySelectorAll('[role="navigation"]').length,
    };
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const out = {};
  try {
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await login(page, ADMIN);
      out.adminDashboard = await snapshot(page, 'admin-dashboard');
      await ctx.close();
    }
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await login(page, OPER);
      out.operatorDashboard = await snapshot(page, 'operator-dashboard');
      // Operator direct /users
      await page.goto(`${TARGET}/users`, { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(1500);
      out.operatorUsersDirect = await snapshot(page, 'operator-users-direct');
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('Saved', OUT);
  // Print short summary
  for (const k of Object.keys(out)) {
    const v = out[k];
    console.log(`\n--- ${k} ---`);
    console.log(`url: ${v.url}`);
    console.log(`h1/h2: ${JSON.stringify(v.h1)}`);
    console.log(`navTag=${v.hasNavTag} aside=${v.hasAsideTag} header=${v.hasHeaderTag} role=nav=${v.navRoleCount}`);
    console.log(`anchors (first 25):`);
    for (const a of (v.anchors || []).slice(0, 25)) {
      console.log(`  [${a.tag}] "${a.text}"${a.href ? ' -> '+a.href : ''}`);
    }
  }
})();
