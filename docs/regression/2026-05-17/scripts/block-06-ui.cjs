/**
 * BLOCK-06 — UI battery (v2) for forms A, B, C, D, F, G, H + E probe.
 * Verifies UI-level behaviour:
 *  - Empty submit fires HTTP or is blocked client-side?
 *  - Inline error rendering after 400.
 *  - Double-submit at UI level (rapid 2 clicks).
 *  - Slow 3G loading state on submit.
 *  - Offline → clear error vs stuck spinner.
 *  - Cancel/dismiss behaviour.
 *  - XSS render in lists for entities saved with <script> payload.
 *  - Price inline: ESC / Enter / click outside / Save All / bad values.
 *  - Banner upload: actual two-step UI→API flow (POST /api/files/images then POST banners).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://maksimfrelikh.ru';
const QA_PASSWORD = process.env.QA_PASSWORD || (() => { throw new Error('Set QA_PASSWORD'); })();
const ADMIN = { email: 'qa-admin@***.invalid', password: QA_PASSWORD };
const OPER_STORE = 'e73ba6bd-abb9-4596-9289-cca474fb2ec1';
const EVI = path.resolve(__dirname, '..', 'evidence', 'block-06');
fs.mkdirSync(EVI, { recursive: true });
const REPORT = path.join(EVI, 'ui-report.json');

const TS = Date.now();
const TAG = `REG6UI-${TS}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toISOString().slice(11, 23);
const out = { startedAt: new Date().toISOString(), tag: TAG, created: [] };
const log = (k, v) => { console.log(`[${ts()}] ${k}`, typeof v === 'object' ? JSON.stringify(v).slice(0, 280) : v); };

async function shot(page, name) {
  const p = path.join(EVI, `ui-${name}.png`);
  await page.screenshot({ path: p, fullPage: false }).catch(() => {});
  return path.basename(p);
}

async function login(page, who) {
  await page.goto(`${TARGET}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().fill(who.email);
  await page.locator('input[type="password"]').first().fill(who.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForResponse(r => r.url().includes('/api/auth/login') && r.status() === 200, { timeout: 15000 }).catch(() => {});
  await sleep(1500);
}

function startReqRec(page, filter = () => true) {
  const reqs = [];
  const onReq = async (req) => {
    if (!filter(req)) return;
    let body = null;
    try {
      const post = req.postDataBuffer();
      body = post ? post.toString('utf8').slice(0, 800) : null;
    } catch (e) {}
    reqs.push({ at: Date.now(), method: req.method(), url: req.url(), body });
  };
  page.on('request', onReq);
  return { reqs, stop: () => page.off('request', onReq) };
}

function trapAlerts(page) {
  const dialogs = [];
  page.on('dialog', async (d) => {
    dialogs.push({ type: d.type(), message: d.message(), at: Date.now() });
    try { await d.dismiss(); } catch (e) {}
  });
  return { dialogs };
}

async function pageText(page) {
  return (await page.locator('body').textContent({ timeout: 1500 }).catch(() => '') || '').replace(/\s+/g, ' ');
}

async function main() {
  const br = await chromium.launch({ headless: true });
  const ctx = await br.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const alertsTrap = trapAlerts(page);
  await login(page, ADMIN);

  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable').catch(() => {});

  // ============================================================
  // A. Store create — empty submit, slow, double-click, dismiss
  // ============================================================
  out.A = {};
  // 1. empty submit
  await page.goto(`${TARGET}/dashboard#store-create`, { waitUntil: 'domcontentloaded' });
  await sleep(2000);
  // clear all 4 inputs
  for (const ph of ['STORE-002', 'Central Store', 'City, street', 'Europe/Moscow']) {
    await page.locator(`input[placeholder="${ph}"]`).first().fill('').catch(() => {});
  }
  let rec = startReqRec(page, r => /\/api\/stores($|\?)/.test(r.url()) && r.method() === 'POST');
  await page.locator('button[type="submit"]:has-text("Save store")').first().click().catch(() => {});
  await sleep(2500);
  out.A.empty_submit = {
    httpFired: rec.reqs.length,
    requests: rec.reqs,
    inlineErrors: (await pageText(page)).match(/[A-ZА-Я][^.\n]*(?:required|обязательно|invalid|valid|must be|too long|too short)[^.\n]{0,60}/g)?.slice(0, 6) || [],
    urlAfter: page.url(),
    screenshot: await shot(page, 'A-empty-submit'),
  };
  rec.stop();

  // 2. whitespace-only submit
  await page.goto(`${TARGET}/dashboard#store-create`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await page.locator('input[placeholder="STORE-002"]').first().fill('   ');
  await page.locator('input[placeholder="Central Store"]').first().fill('   ');
  await page.locator('input[placeholder="City, street"]').first().fill('   ');
  rec = startReqRec(page, r => /\/api\/stores($|\?)/.test(r.url()) && r.method() === 'POST');
  await page.locator('button[type="submit"]:has-text("Save store")').first().click().catch(() => {});
  await sleep(2500);
  out.A.whitespace_submit = {
    httpFired: rec.reqs.length,
    bodySent: rec.reqs[0]?.body?.slice(0, 200),
    inlineErrors: (await pageText(page)).match(/[A-ZА-Я][^.\n]*(?:required|обязательно|invalid|valid|must be|too long|too short)[^.\n]{0,60}/g)?.slice(0, 6) || [],
    screenshot: await shot(page, 'A-whitespace-submit'),
  };
  rec.stop();

  // 3. unicode + XSS — fill and submit, capture redirect / saved state and check render in list
  await page.goto(`${TARGET}/dashboard#store-create`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  const xssCode = `XSSUI-${TAG}`;
  await page.locator('input[placeholder="STORE-002"]').first().fill(xssCode);
  await page.locator('input[placeholder="Central Store"]').first().fill('<script>window.__xss_a=1</script>'+`Block6 XSS ${TS}`);
  await page.locator('input[placeholder="City, street"]').first().fill('<img src=x onerror=window.__xss_b=1>');
  await page.locator('input[placeholder="Europe/Moscow"]').first().fill('Europe/Amsterdam');
  rec = startReqRec(page, r => /\/api\/stores/.test(r.url()) && r.method() === 'POST');
  await page.locator('button[type="submit"]:has-text("Save store")').first().click().catch(() => {});
  await sleep(3000);
  out.A.xss_submit = { httpFired: rec.reqs.length, bodySent: rec.reqs[0]?.body?.slice(0, 250), urlAfter: page.url() };
  rec.stop();
  // navigate to stores list and check XSS rendering
  await page.goto(`${TARGET}/dashboard#stores`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  out.A.xss_in_list = await page.evaluate((code) => {
    const html = document.body.innerHTML;
    const text = document.body.innerText || '';
    const hasLiteralScriptTagInHTML = /<script>window\.__xss_a=1<\/script>/.test(html);
    const renderedAsText = text.includes('<script>window.__xss_a=1</script>');
    const xssGlobalFired = !!window.__xss_a || !!window.__xss_b;
    // also check if image error fired
    const imgTagInjected = !!document.querySelector('img[src="x"]');
    return { hasLiteralScriptTagInHTML, renderedAsText, xssGlobalFired, imgTagInjected, present: text.includes(code) };
  }, xssCode);
  // record store id by GET endpoints later via API; for cleanup, mark by code
  out.created.push({ kind: 'store', code: xssCode });
  await shot(page, 'A-xss-list');

  // 4. Slow 3G
  await page.goto(`${TARGET}/dashboard#store-create`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: 50 * 1024 / 8, uploadThroughput: 25 * 1024 / 8, latency: 2000 });
  await page.locator('input[placeholder="STORE-002"]').first().fill(`SLO-${TAG}`);
  await page.locator('input[placeholder="Central Store"]').first().fill('slow');
  await page.locator('input[placeholder="City, street"]').first().fill('-');
  rec = startReqRec(page, r => /\/api\/stores/.test(r.url()) && r.method() === 'POST');
  const slowBtn = page.locator('button[type="submit"]:has-text("Save store")').first();
  await slowBtn.click();
  await sleep(500); // capture in-flight state
  out.A.slow_state = {
    btnDisabledMidFlight: await slowBtn.evaluate(el => el.disabled).catch(() => null),
    btnText: await slowBtn.textContent().catch(() => ''),
    spinnerVisible: await page.locator('[role="status"], .spinner, [aria-busy="true"]').count(),
  };
  await page.waitForResponse(r => /\/api\/stores/.test(r.url()) && r.request().method() === 'POST', { timeout: 30000 }).catch(() => {});
  await sleep(1500);
  out.A.slow_result = { posted: rec.reqs.length, finalUrl: page.url() };
  rec.stop();
  await cdp.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0 });
  out.created.push({ kind: 'store', code: `SLO-${TAG}` });

  // 5. Double-click submit
  await page.goto(`${TARGET}/dashboard#store-create`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  const dblCode = `DBL-${TAG}`;
  await page.locator('input[placeholder="STORE-002"]').first().fill(dblCode);
  await page.locator('input[placeholder="Central Store"]').first().fill('dbl');
  await page.locator('input[placeholder="City, street"]').first().fill('-');
  rec = startReqRec(page, r => /\/api\/stores/.test(r.url()) && r.method() === 'POST');
  const dblBtn = page.locator('button[type="submit"]:has-text("Save store")').first();
  await Promise.all([
    dblBtn.click({ noWaitAfter: true }).catch(() => {}),
    dblBtn.click({ noWaitAfter: true, timeout: 1000 }).catch(() => {}),
    dblBtn.click({ noWaitAfter: true, timeout: 1000 }).catch(() => {}),
  ]);
  await sleep(3500);
  out.A.double_click = { posted: rec.reqs.length, requests: rec.reqs.map(r => ({ method: r.method, body: (r.body || '').slice(0, 100) })) };
  rec.stop();
  out.created.push({ kind: 'store', code: dblCode });

  // 6. Cancel / dismiss
  await page.goto(`${TARGET}/dashboard#store-create`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await page.locator('input[placeholder="STORE-002"]').first().fill(`DROP-${TAG}`);
  await page.locator('input[placeholder="Central Store"]').first().fill('would lose');
  const cancelBtn = page.locator('button:has-text("Cancel")').first();
  out.A.cancel_button = { count: await cancelBtn.count() };
  if (await cancelBtn.count()) {
    await cancelBtn.click();
    await sleep(1500);
    out.A.cancel_result = { urlAfter: page.url() };
  }
  // navigate away mid-fill
  await page.goto(`${TARGET}/dashboard#store-create`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await page.locator('input[placeholder="STORE-002"]').first().fill(`NAV-${TAG}`);
  await page.locator('nav a, header button:has-text("Products"), button:has-text("Products")').first().click().catch(() => {});
  await sleep(1500);
  // come back: form should be empty
  await page.goto(`${TARGET}/dashboard#store-create`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  out.A.dismiss_after_nav = {
    codeField: await page.locator('input[placeholder="STORE-002"]').first().inputValue().catch(() => ''),
    nameField: await page.locator('input[placeholder="Central Store"]').first().inputValue().catch(() => ''),
  };

  // ============================================================
  // B. Product create — empty submit, XSS render, double-click
  // ============================================================
  out.B = {};
  await page.goto(`${TARGET}/dashboard#product-create`, { waitUntil: 'domcontentloaded' });
  await sleep(2000);
  // empty
  for (const ph of ['1001', 'Bananas']) {
    await page.locator(`input[placeholder="${ph}"]`).first().fill('').catch(() => {});
    await page.locator(`input[placeholder="${ph}"]`).nth(1).fill('').catch(() => {});
  }
  rec = startReqRec(page, r => /\/api\/products/.test(r.url()) && r.method() === 'POST');
  await page.locator('button[type="submit"]:has-text("Save product")').first().click().catch(() => {});
  await sleep(2500);
  out.B.empty_submit = {
    httpFired: rec.reqs.length,
    bodySent: rec.reqs[0]?.body?.slice(0, 200),
    inlineErrors: (await pageText(page)).match(/[A-ZА-Я][^.\n]*(?:required|обязательно|invalid|valid|must be|too long|too short)[^.\n]{0,60}/g)?.slice(0, 6) || [],
    screenshot: await shot(page, 'B-empty-submit'),
  };
  rec.stop();

  // XSS save
  await page.goto(`${TARGET}/dashboard#product-create`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  const pluXss = `9${String(TS).slice(-7)}`; // unique
  await page.locator('input[placeholder="1001"]').first().fill(pluXss);
  await page.locator('input[placeholder="Bananas"]').first().fill('<script>window.__xss_b1=1</script>'+'BProd '+TS);
  await page.locator('input[placeholder="Bananas"]').nth(1).fill('<img src=x onerror=window.__xss_b2=1>');
  // imageUrl: javascript: payload
  const imgUrlField = page.locator('input[placeholder="Optional image URL"]').first();
  if (await imgUrlField.count()) await imgUrlField.fill('javascript:window.__xss_b3=1');
  rec = startReqRec(page, r => /\/api\/products/.test(r.url()) && r.method() === 'POST');
  await page.locator('button[type="submit"]:has-text("Save product")').first().click().catch(() => {});
  await sleep(3500);
  out.B.xss_submit = { httpFired: rec.reqs.length, urlAfter: page.url(), bodySent: rec.reqs[0]?.body?.slice(0, 250) };
  rec.stop();
  out.created.push({ kind: 'product', plu: pluXss });

  await page.goto(`${TARGET}/dashboard#products`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  out.B.xss_in_list = await page.evaluate((plu) => {
    const html = document.body.innerHTML;
    const text = document.body.innerText || '';
    return {
      hasLiteralScriptTag: /<script>window\.__xss_b1=1<\/script>/.test(html),
      renderedAsText: text.includes('<script>window.__xss_b1=1</script>'),
      hasOnerrorImg: !!document.querySelector('img[onerror]'),
      xssFired: !!window.__xss_b1 || !!window.__xss_b2 || !!window.__xss_b3,
      pluPresent: text.includes(plu),
    };
  }, pluXss);
  await shot(page, 'B-xss-list');

  // Open product detail for XSS render: try to click a row's Edit -> #product-edit?id=...
  // Find Edit button next to the XSS product (by PLU). Most rows just say "Edit".
  // We'll find by row text matching PLU
  const editRowIdx = await page.evaluate((plu) => {
    const rows = Array.from(document.querySelectorAll('tr'));
    const idx = rows.findIndex(r => (r.textContent || '').includes(plu));
    return idx;
  }, pluXss);
  if (editRowIdx > -1) {
    const editBtn = page.locator('tr').nth(editRowIdx).locator('button:has-text("Edit")').first();
    if (await editBtn.count()) {
      await editBtn.click().catch(() => {});
      await sleep(2500);
      out.B.xss_in_edit_page = await page.evaluate(() => {
        return {
          urlAfter: location.href,
          xssFired: !!window.__xss_b1 || !!window.__xss_b2 || !!window.__xss_b3,
          imageTagInjected: !!document.querySelector('img[onerror]'),
          imageUrlInputValue: (document.querySelector('input[placeholder="Optional image URL"]') || {}).value,
          imgPreviewSrc: (Array.from(document.querySelectorAll('img')).find(i => /javascript/.test(i.src || ''))?.src) || null,
        };
      });
      await shot(page, 'B-xss-edit-page');
    }
  }

  // ============================================================
  // D. Invite — empty / bad email / valid bypass
  // ============================================================
  out.D = {};
  await page.goto(`${TARGET}/dashboard#users-access`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const inviteEmail = page.locator('input[type="email"][placeholder*="operator"]').first();
  await inviteEmail.fill('');
  rec = startReqRec(page, r => /\/api\/auth\/invites/.test(r.url()) && r.method() === 'POST');
  await page.locator('button[type="submit"]:has-text("Create invite")').first().click().catch(() => {});
  await sleep(2500);
  out.D.empty_submit = {
    httpFired: rec.reqs.length,
    bodySent: rec.reqs[0]?.body?.slice(0, 250),
    inlineErrors: (await pageText(page)).match(/[A-ZА-Я][^.\n]*(?:required|обязательно|invalid|valid|must be|expir)[^.\n]{0,60}/g)?.slice(0, 6) || [],
    screenshot: await shot(page, 'D-empty-submit'),
  };
  rec.stop();

  // bad email "abc"
  await inviteEmail.fill('abc');
  rec = startReqRec(page, r => /\/api\/auth\/invites/.test(r.url()) && r.method() === 'POST');
  await page.locator('button[type="submit"]:has-text("Create invite")').first().click().catch(() => {});
  await sleep(2500);
  out.D.bad_email_abc = {
    httpFired: rec.reqs.length,
    bodySent: rec.reqs[0]?.body?.slice(0, 250),
    inlineErrors: (await pageText(page)).match(/[A-ZА-Я][^.\n]*(?:required|valid|invalid|please)[^.\n]{0,60}/g)?.slice(0, 6) || [],
  };
  rec.stop();

  // bad email "a@b" — this was 201 from API; check UI behavior
  await inviteEmail.fill('a@b');
  rec = startReqRec(page, r => /\/api\/auth\/invites/.test(r.url()) && r.method() === 'POST');
  await page.locator('button[type="submit"]:has-text("Create invite")').first().click().catch(() => {});
  await sleep(2500);
  out.D.bad_email_a_at_b = {
    httpFired: rec.reqs.length,
    bodySent: rec.reqs[0]?.body?.slice(0, 250),
    afterText: (await pageText(page)).slice(0, 600),
  };
  rec.stop();

  // ============================================================
  // Store detail forms: C, F, G, H
  // ============================================================
  await page.goto(`${TARGET}/dashboard#store:${OPER_STORE}`, { waitUntil: 'domcontentloaded' });
  await sleep(3500);
  await shot(page, 'store-detail');

  // C. Category — empty submit
  out.C = {};
  await page.locator('input[placeholder="Bakery"]').first().fill('');
  await page.locator('input[placeholder="Optional display name"]').first().fill('').catch(() => {});
  rec = startReqRec(page, r => /catalog\/categories/.test(r.url()) && r.method() === 'POST');
  await page.locator('button[type="submit"]:has-text("Create root category")').first().click().catch(() => {});
  await sleep(2500);
  out.C.empty_submit = {
    httpFired: rec.reqs.length,
    bodySent: rec.reqs[0]?.body?.slice(0, 250),
    inlineErrors: (await pageText(page)).match(/[A-ZА-Я][^.\n]*(?:required|обязательно|invalid|valid|must be)[^.\n]{0,60}/g)?.slice(0, 6) || [],
    screenshot: await shot(page, 'C-empty-submit'),
  };
  rec.stop();

  // C. XSS render: read the catalog tree for any literal <script> rendered
  out.C.xss_in_tree = await page.evaluate(() => {
    const text = document.body.innerText || '';
    return {
      renderedAsText: text.includes('<script>alert(1)</script>'),
      hasInjectedScript: !!document.querySelector('script:not([src])'),
    };
  });

  // F. Scale register — empty submit
  out.F = {};
  await page.locator('input[placeholder="SCALE-001"]').first().fill('');
  await page.locator('input[placeholder="Front counter scale"]').first().fill('');
  rec = startReqRec(page, r => /\/scales/.test(r.url()) && r.method() === 'POST');
  await page.locator('button[type="submit"]:has-text("Register device")').first().click().catch(() => {});
  await sleep(2500);
  out.F.empty_submit = {
    httpFired: rec.reqs.length,
    bodySent: rec.reqs[0]?.body?.slice(0, 250),
    inlineErrors: (await pageText(page)).match(/[A-ZА-Я][^.\n]*(?:required|обязательно|invalid|valid|must be)[^.\n]{0,60}/g)?.slice(0, 6) || [],
    screenshot: await shot(page, 'F-empty-submit'),
  };
  rec.stop();

  // G. Banner upload — discover 2-step flow + bad mime / oversize / 0-byte
  out.G = {};
  const tmpDir = path.join(EVI, 'test-assets');
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpPng = path.join(tmpDir, 'tiny.png');
  fs.writeFileSync(tmpPng, Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8cf000300010101003e2c000000000049454e44ae426082', 'hex'));
  const tmpGif = path.join(tmpDir, 'tiny.gif');
  fs.writeFileSync(tmpGif, Buffer.concat([Buffer.from('GIF89a', 'utf8'), Buffer.alloc(60, 0)]));
  const tmpSvg = path.join(tmpDir, 'tiny.svg');
  fs.writeFileSync(tmpSvg, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10" fill="red"/></svg>'));
  const tmpTxt = path.join(tmpDir, 'tiny.txt');
  fs.writeFileSync(tmpTxt, 'hello world');
  const tmpZero = path.join(tmpDir, 'zero.png');
  fs.writeFileSync(tmpZero, Buffer.alloc(0));
  const tmpBig = path.join(tmpDir, 'big.png');
  fs.writeFileSync(tmpBig, Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(2 * 1024 * 1024 + 100, 0x41)]));
  const tmpExe = path.join(tmpDir, 'bad.exe');
  fs.writeFileSync(tmpExe, Buffer.from('MZ' + '\x00'.repeat(40)));
  const tmpFakePng = path.join(tmpDir, 'fake.jpg'); // .jpg extension but PNG bytes
  fs.writeFileSync(tmpFakePng, Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8cf000300010101003e2c000000000049454e44ae426082', 'hex'));

  // Find banner input
  const bannerInputs = await page.locator('input[type="file"]').all();
  let bannerInput = null;
  for (const f of bannerInputs) {
    const label = await f.evaluate(el => {
      const id = el.id; if (id) { const lbl = document.querySelector(`label[for="${id}"]`); if (lbl) return lbl.textContent || ''; }
      const lbl = el.closest('label'); return lbl ? lbl.textContent || '' : '';
    }).catch(() => '');
    if (/banner/i.test(label)) { bannerInput = f; break; }
  }
  if (!bannerInput) bannerInput = bannerInputs[0];

  async function tryFile(label, p) {
    const local = startReqRec(page, r => /\/api\//.test(r.url()) && r.method() !== 'GET');
    const errBefore = (await pageText(page)).match(/[Ee]rror[^.]{0,80}/g)?.length || 0;
    try { await bannerInput.setInputFiles(p); } catch (e) { return { setFileError: e.message }; }
    await sleep(3500);
    const errAfter = (await pageText(page)).match(/[Ee]rror[^.]{0,80}/g)?.length || 0;
    const newErr = (await pageText(page)).match(/[Ee]rror[^.]{0,80}/g)?.slice(-3) || [];
    const reqs = local.reqs.map(r => ({ method: r.method, url: r.url, len: r.body?.length || 0 }));
    local.stop();
    return { reqs, newErrLines: newErr, errCountDelta: errAfter - errBefore };
  }

  out.G.png = await tryFile('png', tmpPng);
  await shot(page, 'G-png-after');
  out.G.gif = await tryFile('gif', tmpGif);
  await shot(page, 'G-gif-after');
  out.G.svg = await tryFile('svg', tmpSvg);
  await shot(page, 'G-svg-after');
  out.G.txt = await tryFile('txt', tmpTxt);
  await shot(page, 'G-txt-after');
  out.G.zero = await tryFile('zero', tmpZero);
  await shot(page, 'G-zero-after');
  out.G.big = await tryFile('big', tmpBig);
  await shot(page, 'G-big-after');
  out.G.exe = await tryFile('exe', tmpExe);
  await shot(page, 'G-exe-after');
  out.G.fakeJpg = await tryFile('fakeJpg', tmpFakePng);
  await shot(page, 'G-fakeJpg-after');

  // H. Price inline — ESC, Enter, click outside, bad values, Save All double-submit
  out.H = {};
  await page.goto(`${TARGET}/dashboard#store:${OPER_STORE}`, { waitUntil: 'domcontentloaded' });
  await sleep(3500);
  const priceInputs = await page.locator('input[type="number"][placeholder="0.00"]').all();
  out.H.priceInputCount = priceInputs.length;
  if (priceInputs[0]) {
    const inp = priceInputs[0];
    const initialVal = await inp.inputValue();
    out.H.initialValue = initialVal;

    // ESC
    await inp.focus(); await inp.fill('77.77'); await page.keyboard.press('Escape'); await sleep(800);
    out.H.escape = { after: await inp.inputValue() };

    // Enter -> save
    await inp.focus(); await inp.fill('66.66');
    rec = startReqRec(page, r => /prices/.test(r.url()) && r.method() !== 'GET');
    await page.keyboard.press('Enter'); await sleep(2500);
    out.H.enter = {
      httpFired: rec.reqs.length,
      requests: rec.reqs.map(r => ({ method: r.method, url: r.url, body: (r.body || '').slice(0, 200) })),
      after: await inp.inputValue(),
    };
    rec.stop();

    // Click outside
    await inp.focus(); await inp.fill('55.55');
    rec = startReqRec(page, r => /prices/.test(r.url()) && r.method() !== 'GET');
    await page.locator('h2, h1').first().click().catch(() => {});
    await sleep(2000);
    out.H.click_outside = { httpFired: rec.reqs.length, after: await inp.inputValue() };
    rec.stop();

    // bad values via setInputValue (bypass Playwright fill type=number constraint)
    out.H.bad_values = {};
    for (const val of ['-1', '0', '0.001', '0.01', '999999999999', '1e10', '12.345', 'abc', '<script>alert(1)</script>', "'; DROP--", '   ']) {
      rec = startReqRec(page, r => /prices/.test(r.url()) && r.method() !== 'GET');
      try {
        await inp.focus();
        await inp.evaluate((el, v) => { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }, '');
        await page.keyboard.type(val, { delay: 5 }); // use keyboard.type to bypass type=number fill restriction
      } catch (e) {
        out.H.bad_values[val.slice(0, 20)] = { typeError: e.message };
        rec.stop();
        continue;
      }
      await page.keyboard.press('Enter');
      await sleep(1800);
      out.H.bad_values[val.slice(0, 20)] = {
        sent: rec.reqs.map(r => ({ method: r.method, url: r.url, body: (r.body || '').slice(0, 200) })),
        valueAfter: await inp.inputValue().catch(() => ''),
        validity: await inp.evaluate(el => ({ valid: el.validity.valid, badInput: el.validity.badInput, rangeUnderflow: el.validity.rangeUnderflow, rangeOverflow: el.validity.rangeOverflow, stepMismatch: el.validity.stepMismatch })),
      };
      rec.stop();
    }

    // Save All double-click
    await inp.focus(); await inp.evaluate(el => el.value = ''); await page.keyboard.type('11.11');
    const saveBtn = page.locator('button[type="submit"]:has-text("Save")').last();
    if (await saveBtn.count() && !(await saveBtn.evaluate(el => el.disabled))) {
      rec = startReqRec(page, r => /prices/.test(r.url()) && r.method() !== 'GET');
      await Promise.all([
        saveBtn.click({ noWaitAfter: true }).catch(() => {}),
        saveBtn.click({ noWaitAfter: true, timeout: 1000 }).catch(() => {}),
      ]);
      await sleep(3500);
      out.H.save_double = {
        httpFired: rec.reqs.length,
        requests: rec.reqs.map(r => ({ method: r.method, url: r.url, body: (r.body || '').slice(0, 200) })),
      };
      rec.stop();
    } else {
      out.H.save_double = { saveBtnDisabled: true };
    }

    // restore initial
    if (initialVal !== '' && initialVal !== null) {
      await inp.focus(); await inp.evaluate(el => el.value = ''); await page.keyboard.type(initialVal);
      await page.keyboard.press('Enter'); await sleep(1500);
    } else {
      // clear so we don't leave a price on a previously unpriced placement
      await inp.focus(); await inp.evaluate(el => el.value = ''); await inp.evaluate(el => el.dispatchEvent(new Event('input', { bubbles: true })));
    }
    out.H.restored = { final: await inp.inputValue() };
  }

  // ============================================================
  // Offline behavior — store create while offline
  // ============================================================
  out.offline = {};
  await page.goto(`${TARGET}/dashboard#store-create`, { waitUntil: 'domcontentloaded' });
  await sleep(2000);
  await cdp.send('Network.emulateNetworkConditions', { offline: true, downloadThroughput: 0, uploadThroughput: 0, latency: 0 });
  await page.locator('input[placeholder="STORE-002"]').first().fill(`OFF-${TAG}`);
  await page.locator('input[placeholder="Central Store"]').first().fill('off');
  rec = startReqRec(page, r => /\/api\/stores/.test(r.url()) && r.method() === 'POST');
  const offBtn = page.locator('button[type="submit"]:has-text("Save store")').first();
  await offBtn.click().catch(() => {});
  await sleep(4500);
  out.offline.A_store = {
    httpFired: rec.reqs.length,
    btnDisabled: await offBtn.evaluate(el => el.disabled).catch(() => null),
    bodySnippet: (await pageText(page)).slice(0, 400),
    errorLikeLines: (await pageText(page)).match(/[Nn]etwork|[Oo]ffline|[Ff]ailed|[Tt]imeout|[Tt]ry again|[Oo]шиб|[Сс]еть/g)?.slice(0, 5) || [],
    screenshot: await shot(page, 'offline-A'),
  };
  rec.stop();
  await cdp.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0 });

  // ============================================================
  // E. Password reset — UI absence confirmation
  // ============================================================
  out.E = {};
  const e2 = await ctx.newPage();
  await e2.goto(`${TARGET}/login`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  out.E.forgotTextOnLogin = (await e2.locator('body').textContent({ timeout: 1500 }).catch(() => '') || '').match(/forgot|reset|восстанов|сброс|пароль/gi) || [];
  out.E.linksOnLogin = await e2.evaluate(() => Array.from(document.querySelectorAll('a')).map(a => ({ text: (a.textContent || '').trim(), href: a.getAttribute('href') })));
  out.E.screenshot = await shot(e2, 'E-login-page');

  // Capture final alert state
  out.alerts_captured = alertsTrap.dialogs;

  await br.close();
  out.endedAt = new Date().toISOString();
  fs.writeFileSync(REPORT, JSON.stringify(out, null, 2));
  console.log('Report saved:', REPORT);
}

main().catch(e => {
  out.fatal = e.message + '\n' + (e.stack || '');
  fs.writeFileSync(REPORT, JSON.stringify(out, null, 2));
  console.error(e);
  process.exit(1);
});
