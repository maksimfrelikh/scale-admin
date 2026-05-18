/**
 * BLOCK-06 — API validation battery for forms A, B, C, D, F, G, H + password reset (E) probe.
 * Strategy: hit the backend directly to verify what each form's submit endpoint rejects.
 * UI-only checks (empty submit blocked, dismiss, ESC/Enter) live in block-06-ui.cjs.
 *
 * Cleanup: every created entity is archived at the end via PATCH status=archived
 * (no DELETE is available for most). Created entity IDs are tracked in `created`.
 */
const { chromium, request: pwRequest } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://maksimfrelikh.ru';
const QA_PASSWORD = process.env.QA_PASSWORD || (() => { throw new Error('Set QA_PASSWORD'); })();
const ADMIN = { email: 'qa-admin@***.invalid', password: QA_PASSWORD };
const OPER  = { email: 'qa-operator@***.invalid', password: QA_PASSWORD };
const OPER_STORE = 'e73ba6bd-abb9-4596-9289-cca474fb2ec1';
const EVI = path.resolve(__dirname, '..', 'evidence', 'block-06');
fs.mkdirSync(EVI, { recursive: true });
const REPORT = path.join(EVI, 'api-report.json');

const TS = Date.now();
const TAG = `REG6-${TS}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toISOString().slice(11, 23);
const out = {
  startedAt: new Date().toISOString(), tag: TAG,
  passwordReset: {}, A: {}, B: {}, C: {}, D: {}, F: {}, G: {}, H: {},
  duplicates: {}, doubleSubmit: {}, created: { stores: [], products: [], categories: [], scales: [], banners: [], prices: [] },
  cleanup: {},
};
const log = (k, v) => { console.log(`[${ts()}] ${k}`, typeof v === 'object' ? JSON.stringify(v).slice(0, 300) : v); };

async function newCtx(who) {
  const ctx = await pwRequest.newContext({ baseURL: TARGET });
  const csrf1 = await ctx.get('/api/auth/csrf');
  const csrfBody = await csrf1.json();
  const token = csrfBody.csrfToken;
  const login = await ctx.post('/api/auth/login', {
    headers: { 'content-type': 'application/json', 'x-csrf-token': token },
    data: who,
  });
  if (login.status() !== 200) throw new Error(`Login failed for ${who.email}: ${login.status()} ${await login.text()}`);
  // refresh CSRF after login (new session cookie => new CSRF cookie)
  const csrf2 = await ctx.get('/api/auth/csrf');
  const token2 = (await csrf2.json()).csrfToken;
  return { ctx, csrf: token2 };
}

async function call(ctx, method, urlPath, { body, multipart, headers } = {}) {
  const opts = { headers: { ...(headers || {}) } };
  if (body !== undefined) {
    opts.headers['content-type'] = 'application/json';
    opts.data = body;
  } else if (multipart !== undefined) {
    opts.multipart = multipart;
  }
  const res = await ctx[method.toLowerCase()](urlPath, opts);
  const status = res.status();
  let text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) {}
  return { status, json, text: text.slice(0, 1500) };
}

async function callCsrf(ctxObj, method, urlPath, opts = {}) {
  const headers = { 'x-csrf-token': ctxObj.csrf, ...(opts.headers || {}) };
  return call(ctxObj.ctx, method, urlPath, { ...opts, headers });
}

function idOf(json) {
  if (!json) return null;
  if (json.id) return json.id;
  for (const k of ['store', 'product', 'category', 'scale', 'banner', 'price', 'invite', 'user']) {
    if (json[k]?.id) return json[k].id;
  }
  return null;
}

// ------- payload generators --------
const LONG1000 = 'A'.repeat(1000);
const UNICODE = 'Тест 🍎 你好 ä β';
const XSS = '<script>alert(1)</script>';
const SQLISH = "'; DROP TABLE users;--";
const WHITESPACE = '   \t   ';
const CTRL = 'Line1\nLine2\r\nLine3\tTab';

async function main() {
  log('start', { tag: TAG });

  // ===== E. Password reset probe (no UI form found in recon; probe APIs) =====
  const probe = await pwRequest.newContext({ baseURL: TARGET });
  // typical paths
  for (const ep of [
    '/api/auth/password-reset', '/api/auth/forgot-password', '/api/auth/reset-password',
    '/api/auth/forgot', '/api/auth/reset', '/api/auth/password/request', '/api/users/password-reset',
  ]) {
    const r = await probe.post(ep, { data: { email: ADMIN.email } }).catch(e => ({ status: () => -1, text: async () => e.message }));
    out.passwordReset[ep] = { status: r.status(), text: (await r.text()).slice(0, 240) };
  }
  await probe.dispose();
  log('password reset probe', Object.entries(out.passwordReset).map(([k, v]) => `${k}=${v.status}`).join(' '));

  // ===== ADMIN session =====
  const admin = await newCtx(ADMIN);
  log('admin csrf', admin.csrf.slice(0, 20));

  // -- pre-cleanup: archive any leftover REG6-* stores/products from previous broken run
  const preStores = await call(admin.ctx, 'GET', '/api/stores');
  const preList = preStores.json?.stores || preStores.json?.items || preStores.json?.data || [];
  out.preCleanup = { stores: [], products: [] };
  for (const s of preList.filter(s => /^STORE-REG6-|^[A-Z]+-REG6-|^DUP-REG6-|^DS-REG6-/.test(s.code) && s.status !== 'archived')) {
    const r = await callCsrf(admin, 'PATCH', `/api/stores/${s.id}`, { body: { status: 'archived' } });
    out.preCleanup.stores.push({ code: s.code, id: s.id, status: r.status });
  }
  const preProds = await call(admin.ctx, 'GET', '/api/products');
  const prePList = preProds.json?.products || preProds.json?.items || preProds.json?.data || [];
  for (const p of prePList.filter(p => /^Block6 Prod REG6-/.test(p.name || '') || /^(oper-attempt|dup|doubleProd)$/.test(p.name || '')).filter(p => p.status !== 'archived')) {
    const r = await callCsrf(admin, 'PATCH', `/api/products/${p.id}`, { body: { status: 'archived' } });
    out.preCleanup.products.push({ name: p.name, id: p.id, status: r.status });
  }
  log('preCleanup', { stores: out.preCleanup.stores.length, products: out.preCleanup.products.length });

  // Sample existing data needed for tests
  const stores = await call(admin.ctx, 'GET', '/api/stores');
  const storeList = Array.isArray(stores.json) ? stores.json : (stores.json?.items || stores.json?.data || stores.json?.stores || []);
  out.preflight = { adminStoreCount: storeList.length, getStoresShapeKeys: stores.json && typeof stores.json === 'object' && !Array.isArray(stores.json) ? Object.keys(stores.json) : null };
  const existingStore = storeList.find(s => s.id === OPER_STORE) || storeList[0];

  // create a fresh test store as the working playground for store-scoped forms (avoid touching the operator-assigned store mainCatalog)
  const seedStore = await callCsrf(admin, 'POST', '/api/stores', { body: {
    code: `STORE-${TAG}`, name: `QA Block6 Seed ${TAG}`, address: 'QA test', timezone: 'Europe/Amsterdam', status: 'active',
  }});
  log('seed store create', { status: seedStore.status, id: (idOf(seedStore.json)) });
  if (seedStore.status === 201 && idOf(seedStore.json)) {
    out.created.stores.push(idOf(seedStore.json));
  }
  const SEED = (idOf(seedStore.json));
  // also grab seed mainCatalog if present
  let SEED_CATALOG = null;
  if (SEED) {
    const detail = await call(admin.ctx, 'GET', `/api/stores/${SEED}`);
    SEED_CATALOG = detail.json?.mainCatalog?.id || detail.json?.mainCatalogId || null;
    out.preflight.seedMainCatalog = SEED_CATALOG;
  }

  // ============================================================
  // FORM A. Store create/edit  (POST /api/stores, PATCH /api/stores/:id)
  // ============================================================
  out.A.cases = [];
  const Acases = [
    ['empty', {}],
    ['missing_code',          { name: `n-${TAG}`, address: 'a', timezone: 'Europe/Amsterdam', status: 'active' }],
    ['missing_name',          { code: `EMPT-N-${TAG}` }],
    ['empty_strings',         { code: '', name: '', address: '', timezone: '', status: '' }],
    ['whitespace_required',   { code: WHITESPACE, name: WHITESPACE, address: WHITESPACE, timezone: 'Europe/Amsterdam', status: 'active' }],
    ['long_1000',             { code: 'L'+'X'.repeat(999), name: LONG1000, address: LONG1000, timezone: 'Europe/Amsterdam', status: 'active' }],
    ['unicode',               { code: `U-${TAG}`, name: `Магазин ${UNICODE}`, address: UNICODE, timezone: 'Europe/Amsterdam', status: 'active' }],
    ['xss_payload',           { code: `X-${TAG}`, name: XSS,  address: XSS,  timezone: 'Europe/Amsterdam', status: 'active' }],
    ['sql_payload',           { code: `S-${TAG}`, name: SQLISH, address: SQLISH, timezone: 'Europe/Amsterdam', status: 'active' }],
    ['ctrl_chars',            { code: `C-${TAG}`, name: CTRL, address: CTRL, timezone: 'Europe/Amsterdam', status: 'active' }],
    ['invalid_status',        { code: `IS-${TAG}`, name: 'n', address: 'a', timezone: 'Europe/Amsterdam', status: 'bogus' }],
    ['invalid_timezone',      { code: `TZ-${TAG}`, name: 'n', address: 'a', timezone: 'Mars/Olympus', status: 'active' }],
    ['extra_fields_unknown',  { code: `EF-${TAG}`, name: 'n', address: 'a', timezone: 'Europe/Amsterdam', status: 'active', evilField: '<x>' }],
  ];
  for (const [label, body] of Acases) {
    const r = await callCsrf(admin, 'POST', '/api/stores', { body });
    out.A.cases.push({ label, sent: body, status: r.status, response: r.json || r.text });
    if (r.status === 201 && idOf(r.json)) out.created.stores.push(idOf(r.json));
  }

  // edit: pick the seed store
  if (SEED) {
    out.A.edit = [];
    const edits = [
      ['empty_patch', {}],
      ['name_blank',        { name: '' }],
      ['name_whitespace',   { name: WHITESPACE }],
      ['name_long_1000',    { name: LONG1000 }],
      ['name_xss',          { name: XSS }],
      ['name_unicode',      { name: UNICODE }],
      ['status_bogus',      { status: 'pending' }],
      ['code_blank',        { code: '' }],
      ['code_change_dup',   { code: 'STORE-002' }],   // attempt duplicate code on existing canonical store
    ];
    for (const [label, body] of edits) {
      const r = await callCsrf(admin, 'PATCH', `/api/stores/${SEED}`, { body });
      out.A.edit.push({ label, sent: body, status: r.status, response: r.json || r.text });
    }
    // verify final state of seed store after edits
    const finalSeed = await call(admin.ctx, 'GET', `/api/stores/${SEED}`);
    out.A.finalSeedStore = finalSeed.json;
  }

  // Duplicate code (unique constraint) — create twice with same code
  const dupCode = `DUP-${TAG}`;
  const dupA = await callCsrf(admin, 'POST', '/api/stores', { body: { code: dupCode, name: 'dupA', address: '-', timezone: 'Europe/Amsterdam', status: 'active' } });
  const dupB = await callCsrf(admin, 'POST', '/api/stores', { body: { code: dupCode, name: 'dupB', address: '-', timezone: 'Europe/Amsterdam', status: 'active' } });
  out.duplicates.storeCode = { first: { status: dupA.status, id: idOf(dupA.json) }, second: { status: dupB.status, response: dupB.json || dupB.text } };
  if (idOf(dupA.json)) out.created.stores.push(idOf(dupA.json));
  if (idOf(dupB.json)) out.created.stores.push(idOf(dupB.json));

  // ============================================================
  // FORM B. Product create/edit  (POST /api/products, PATCH /api/products/:id)
  // ============================================================
  out.B.cases = [];
  const goodB = (over) => ({
    defaultPluCode: `9${String(TS).slice(-5)}1`,
    name: `Block6 Prod ${TAG}`, shortName: `B6-${TAG}`, unit: 'kg', status: 'active',
    ...over,
  });
  const Bcases = [
    ['empty', {}],
    ['missing_plu',     { name: 'n', shortName: 's', unit: 'kg', status: 'active' }],
    ['missing_name',    { defaultPluCode: '991000', shortName: 's', unit: 'kg', status: 'active' }],
    ['missing_short',   { defaultPluCode: '991001', name: 'n', unit: 'kg', status: 'active' }],
    ['empty_strings',   { defaultPluCode: '', name: '', shortName: '', unit: '', status: '' }],
    ['whitespace_req',  { defaultPluCode: WHITESPACE, name: WHITESPACE, shortName: WHITESPACE, unit: 'kg', status: 'active' }],
    ['long_1000',       goodB({ defaultPluCode: '991002', name: LONG1000, shortName: LONG1000 })],
    ['unicode',         goodB({ defaultPluCode: '991003', name: UNICODE, shortName: UNICODE })],
    ['xss',             goodB({ defaultPluCode: '991004', name: XSS, shortName: XSS })],
    ['sql',             goodB({ defaultPluCode: '991005', name: SQLISH, shortName: SQLISH })],
    ['unit_bogus',      goodB({ defaultPluCode: '991006', unit: 'tons' })],
    ['status_bogus',    goodB({ defaultPluCode: '991007', status: 'pending' })],
    ['plu_nonnumeric',  goodB({ defaultPluCode: 'abcdef' })],
    ['plu_negative',    goodB({ defaultPluCode: '-1' })],
    ['plu_zero',        goodB({ defaultPluCode: '0' })],
    ['plu_huge_1e10',   goodB({ defaultPluCode: '10000000000' })],
    ['plu_decimal',     goodB({ defaultPluCode: '0.001' })],
    ['imageUrl_xss',    goodB({ defaultPluCode: '991008', imageUrl: 'javascript:alert(1)' })],
    ['description_html',goodB({ defaultPluCode: '991009', description: `<img src=x onerror=alert(1)>` })],
  ];
  for (const [label, body] of Bcases) {
    const r = await callCsrf(admin, 'POST', '/api/products', { body });
    out.B.cases.push({ label, sent: body, status: r.status, response: r.json || r.text });
    if (r.status === 201 && idOf(r.json)) out.created.products.push(idOf(r.json));
  }

  // Duplicate defaultPluCode (unique check)
  const dupPlu = `9${String(TS).slice(-5)}9`;
  const pA = await callCsrf(admin, 'POST', '/api/products', { body: goodB({ defaultPluCode: dupPlu, name: 'dupA' }) });
  const pB = await callCsrf(admin, 'POST', '/api/products', { body: goodB({ defaultPluCode: dupPlu, name: 'dupB' }) });
  out.duplicates.productPlu = { first: { status: pA.status, id: idOf(pA.json) }, second: { status: pB.status, response: pB.json || pB.text } };
  if (idOf(pA.json)) out.created.products.push(idOf(pA.json));
  if (idOf(pB.json)) out.created.products.push(idOf(pB.json));

  // OPERATOR cannot create product? check
  const oper = await newCtx(OPER).catch(e => ({ err: e.message }));
  if (oper.ctx) {
    const operProd = await callCsrf(oper, 'POST', '/api/products', { body: goodB({ defaultPluCode: '991099', name: 'oper-attempt' }) });
    out.B.operatorCreate = { status: operProd.status, response: operProd.json || operProd.text };
  }

  // ============================================================
  // FORM C. Category create root  (POST /api/stores/:id/catalog/categories)
  // ============================================================
  out.C.cases = [];
  if (SEED) {
    const Cgood = (over) => ({ name: `B6Cat-${TAG}`, shortName: `B6C-${TAG}`, status: 'active', ...over });
    const Ccases = [
      ['empty', {}],
      ['missing_name',     { shortName: 's', status: 'active' }],
      ['empty_strings',    { name: '', shortName: '', status: '' }],
      ['whitespace_req',   { name: WHITESPACE, shortName: WHITESPACE, status: 'active' }],
      ['long_1000',        Cgood({ name: LONG1000, shortName: LONG1000 })],
      ['unicode',          Cgood({ name: UNICODE, shortName: UNICODE })],
      ['xss',              Cgood({ name: XSS, shortName: XSS })],
      ['sql',              Cgood({ name: SQLISH, shortName: SQLISH })],
      ['ctrl',             Cgood({ name: CTRL, shortName: CTRL })],
      ['status_bogus',     Cgood({ status: 'draft' })],
    ];
    for (const [label, body] of Ccases) {
      const r = await callCsrf(admin, 'POST', `/api/stores/${SEED}/catalog/categories`, { body });
      out.C.cases.push({ label, sent: body, status: r.status, response: r.json || r.text });
      if (r.status === 201 && idOf(r.json)) out.created.categories.push({ id: idOf(r.json), storeId: SEED });
    }

    // duplicate root category — names? probably allowed. Try same name twice
    const dupName = `DupCat-${TAG}`;
    const cA = await callCsrf(admin, 'POST', `/api/stores/${SEED}/catalog/categories`, { body: { name: dupName, shortName: dupName, status: 'active' } });
    const cB = await callCsrf(admin, 'POST', `/api/stores/${SEED}/catalog/categories`, { body: { name: dupName, shortName: dupName, status: 'active' } });
    out.duplicates.categoryName = { first: { status: cA.status, id: idOf(cA.json) }, second: { status: cB.status, response: cB.json || cB.text } };
    if (idOf(cA.json)) out.created.categories.push({ id: idOf(cA.json), storeId: SEED });
    if (idOf(cB.json)) out.created.categories.push({ id: idOf(cB.json), storeId: SEED });
  }

  // ============================================================
  // FORM D. Invite (POST /api/auth/invites)
  // ============================================================
  out.D.cases = [];
  // role: 'operator' or 'admin'. expiresAt is required (discovered from prior 400).
  const exp = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
  const expPast = new Date(Date.now() - 86400 * 1000).toISOString();
  const Dgood = (over) => ({ email: `qa-invite-${TS}-x@example.test`, role: 'operator', expiresAt: exp, ...over });
  const Dcases = [
    ['empty', {}],
    ['missing_email',     { role: 'operator', expiresAt: exp }],
    ['empty_email',       { email: '', role: 'operator', expiresAt: exp }],
    ['whitespace_email',  { email: WHITESPACE, role: 'operator', expiresAt: exp }],
    ['missing_expiresAt', { email: `qa-noexp-${TS}@example.test`, role: 'operator' }],
    ['missing_role',      { email: `qa-norole-${TS}@example.test`, expiresAt: exp }],
    ['bad_email_abc',     Dgood({ email: 'abc' })],
    ['bad_email_a@',      Dgood({ email: 'a@' })],
    ['bad_email_@b.c',    Dgood({ email: '@b.c' })],
    ['bad_email_a@b',     Dgood({ email: 'a@b' })],
    ['bad_email_traildot',Dgood({ email: 'a@b.c.' })],
    ['valid_email_min',   Dgood({ email: `qa-min-${TS}@x.io` })],
    ['unicode_email',     Dgood({ email: `qa-test-${TS}+тест@example.test` })],
    ['xss_email_local',   Dgood({ email: `qa+<script>alert(1)</script>@example.test` })],
    ['sql_email',         Dgood({ email: `qa+${SQLISH}@example.test` })],
    ['long_local_1000',   Dgood({ email: `qa-${'a'.repeat(1000)}@example.test` })],
    ['role_bogus',        Dgood({ email: `qa-bogus-${TS}@example.test`, role: 'superadmin' })],
    ['role_admin',        Dgood({ email: `qa-adminrole-${TS}@example.test`, role: 'admin' })],
    ['expires_past',      Dgood({ email: `qa-past-${TS}@example.test`, expiresAt: expPast })],
    ['expires_bogus',     Dgood({ email: `qa-bogusexp-${TS}@example.test`, expiresAt: 'tomorrow' })],
    ['duplicate_existing_admin', Dgood({ email: ADMIN.email })],
    ['duplicate_existing_operator', Dgood({ email: OPER.email })],
  ];
  for (const [label, body] of Dcases) {
    const r = await callCsrf(admin, 'POST', '/api/auth/invites', { body });
    out.D.cases.push({ label, sent: body, status: r.status, response: r.json || r.text });
  }

  // duplicate invite (same email twice) — may be allowed if no GET/DELETE per BUG-REG-009
  const dupEmail = `qa-dup-${TS}@example.test`;
  const dA = await callCsrf(admin, 'POST', '/api/auth/invites', { body: { email: dupEmail, role: 'operator', expiresAt: exp } });
  const dB = await callCsrf(admin, 'POST', '/api/auth/invites', { body: { email: dupEmail, role: 'operator', expiresAt: exp } });
  out.duplicates.inviteEmail = { first: { status: dA.status, response: dA.json || dA.text }, second: { status: dB.status, response: dB.json || dB.text } };

  // Operator (not authorized) tries invite
  if (oper.ctx) {
    const operInvite = await callCsrf(oper, 'POST', '/api/auth/invites', { body: { email: `qa-deny-${TS}@example.test`, role: 'operator', expiresAt: exp } });
    out.D.operatorTry = { status: operInvite.status, response: operInvite.json || operInvite.text };
  }

  // ============================================================
  // FORM F. Scale device register  (POST /api/stores/:id/scales)
  // ============================================================
  out.F.cases = [];
  if (SEED) {
    const Fgood = (over) => ({ deviceCode: `SCD-${TS}-x`, name: `B6 Scale ${TS}`, model: 'CAS', ...over });
    const Fcases = [
      ['empty', {}],
      ['missing_code',     { name: 'n' }],
      ['missing_name',     { deviceCode: `nc-${TS}` }],
      ['empty_strings',    { deviceCode: '', name: '', model: '' }],
      ['whitespace_req',   { deviceCode: WHITESPACE, name: WHITESPACE, model: WHITESPACE }],
      ['long_1000',        Fgood({ deviceCode: `LC-${TS}`, name: LONG1000, model: LONG1000 })],
      ['unicode',          Fgood({ deviceCode: `UC-${TS}`, name: UNICODE, model: UNICODE })],
      ['xss',              Fgood({ deviceCode: `XC-${TS}`, name: XSS, model: XSS })],
      ['sql',              Fgood({ deviceCode: `SQ-${TS}`, name: SQLISH, model: SQLISH })],
    ];
    for (const [label, body] of Fcases) {
      const r = await callCsrf(admin, 'POST', `/api/stores/${SEED}/scales`, { body });
      out.F.cases.push({ label, sent: body, status: r.status, response: r.json || r.text });
      if (r.status === 201 && idOf(r.json)) out.created.scales.push({ id: idOf(r.json), storeId: SEED });
    }
    // duplicate scale code
    const dupSC = `DSC-${TS}`;
    const sA = await callCsrf(admin, 'POST', `/api/stores/${SEED}/scales`, { body: { deviceCode: dupSC, name: 'sa', model: 'm' } });
    const sB = await callCsrf(admin, 'POST', `/api/stores/${SEED}/scales`, { body: { deviceCode: dupSC, name: 'sb', model: 'm' } });
    out.duplicates.scaleDeviceCode = { first: { status: sA.status, id: idOf(sA.json) }, second: { status: sB.status, response: sB.json || sB.text } };
    if (idOf(sA.json)) out.created.scales.push({ id: idOf(sA.json), storeId: SEED });
    if (idOf(sB.json)) out.created.scales.push({ id: idOf(sB.json), storeId: SEED });
  }

  // ============================================================
  // FORM G. Banner upload (POST /api/stores/:id/advertising/banners — multipart with file)
  // discovery: try a no-body POST first to learn schema
  // ============================================================
  if (SEED) {
    // create a real banner first
    // We need: file + categoryId + productId(?) + status. Use a small valid PNG.
    const tinyPng = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8cf000300010101003e2c000000000049454e44ae426082', 'hex');
    const txt = Buffer.from('hello world', 'utf8');
    const fakePng = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('not real png content')]); // claimed jpg actually
    // Use a category we created in C if any — first one available
    const catA = out.created.categories[0]?.id;

    // discovery POST with empty
    const emptyG = await admin.ctx.post(`/api/stores/${SEED}/advertising/banners`, { headers: { 'x-csrf-token': admin.csrf } });
    out.G.empty = { status: emptyG.status(), text: (await emptyG.text()).slice(0, 600) };

    // multipart with no file
    const noFile = await admin.ctx.post(`/api/stores/${SEED}/advertising/banners`, {
      headers: { 'x-csrf-token': admin.csrf },
      multipart: { name: `B6Banner ${TAG}` },
    });
    out.G.no_file = { status: noFile.status(), text: (await noFile.text()).slice(0, 600) };

    // happy(ish): real png + categoryId
    if (catA) {
      const good = await admin.ctx.post(`/api/stores/${SEED}/advertising/banners`, {
        headers: { 'x-csrf-token': admin.csrf },
        multipart: {
          file: { name: 'banner.png', mimeType: 'image/png', buffer: tinyPng },
          name: `B6Banner ${TAG}`, status: 'active', categoryId: catA,
        },
      });
      out.G.png_with_cat = { status: good.status(), text: (await good.text()).slice(0, 600) };
      if (good.status() === 201) {
        try { const j = JSON.parse(await good.text()); if (j?.id) out.created.banners.push({ id: j.id, storeId: SEED }); } catch (e) {}
      }
    }

    // bad mime gif
    const badGif = await admin.ctx.post(`/api/stores/${SEED}/advertising/banners`, {
      headers: { 'x-csrf-token': admin.csrf },
      multipart: {
        file: { name: 'banner.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a' + '\x00'.repeat(40)) },
        name: `B6Banner GIF ${TAG}`, status: 'active', categoryId: catA || '',
      },
    });
    out.G.gif_mime = { status: badGif.status(), text: (await badGif.text()).slice(0, 600) };

    // svg
    const svg = await admin.ctx.post(`/api/stores/${SEED}/advertising/banners`, {
      headers: { 'x-csrf-token': admin.csrf },
      multipart: {
        file: { name: 'banner.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') },
        name: `B6Banner SVG ${TAG}`, status: 'active', categoryId: catA || '',
      },
    });
    out.G.svg_mime = { status: svg.status(), text: (await svg.text()).slice(0, 600) };

    // text/plain pretending image
    const tx = await admin.ctx.post(`/api/stores/${SEED}/advertising/banners`, {
      headers: { 'x-csrf-token': admin.csrf },
      multipart: {
        file: { name: 'banner.txt', mimeType: 'text/plain', buffer: txt },
        name: `B6Banner TXT ${TAG}`, status: 'active', categoryId: catA || '',
      },
    });
    out.G.txt_mime = { status: tx.status(), text: (await tx.text()).slice(0, 600) };

    // 0-byte
    const zero = await admin.ctx.post(`/api/stores/${SEED}/advertising/banners`, {
      headers: { 'x-csrf-token': admin.csrf },
      multipart: {
        file: { name: 'zero.png', mimeType: 'image/png', buffer: Buffer.alloc(0) },
        name: `B6Banner Zero ${TAG}`, status: 'active', categoryId: catA || '',
      },
    });
    out.G.zero_byte = { status: zero.status(), text: (await zero.text()).slice(0, 600) };

    // 2.1 MB png (over typical limit)
    const big = Buffer.concat([tinyPng, Buffer.alloc(2 * 1024 * 1024 + 100, 0x42)]);
    const bigPost = await admin.ctx.post(`/api/stores/${SEED}/advertising/banners`, {
      headers: { 'x-csrf-token': admin.csrf },
      multipart: {
        file: { name: 'big.png', mimeType: 'image/png', buffer: big },
        name: `B6Banner Big ${TAG}`, status: 'active', categoryId: catA || '',
      },
    });
    out.G.big_2_1MB = { status: bigPost.status(), size: big.length, text: (await bigPost.text()).slice(0, 600) };

    // jpg name but png content
    const mismatch = await admin.ctx.post(`/api/stores/${SEED}/advertising/banners`, {
      headers: { 'x-csrf-token': admin.csrf },
      multipart: {
        file: { name: 'banner.jpg', mimeType: 'image/jpeg', buffer: tinyPng /* actually PNG bytes */ },
        name: `B6Banner Mismatch ${TAG}`, status: 'active', categoryId: catA || '',
      },
    });
    out.G.mime_jpg_actually_png = { status: mismatch.status(), text: (await mismatch.text()).slice(0, 600) };

    // executable extension
    const exe = await admin.ctx.post(`/api/stores/${SEED}/advertising/banners`, {
      headers: { 'x-csrf-token': admin.csrf },
      multipart: {
        file: { name: 'banner.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ' + '\x00'.repeat(40)) },
        name: `B6Banner Exe ${TAG}`, status: 'active', categoryId: catA || '',
      },
    });
    out.G.exe_mime = { status: exe.status(), text: (await exe.text()).slice(0, 600) };
  }

  // ============================================================
  // FORM H. Price inline edit (PATCH /api/stores/:id/prices/:id)
  // ============================================================
  if (SEED) {
    // need at least one product placed in a category in seed store to have a price row
    // simpler: discover price rows on operator's existing store (admin can access)
    const opPrices = await call(admin.ctx, 'GET', `/api/stores/${OPER_STORE}/prices`);
    const priceList = Array.isArray(opPrices.json) ? opPrices.json : (opPrices.json?.items || opPrices.json?.data || opPrices.json?.prices || opPrices.json?.rows || []);
    out.H.priceShape = priceList.slice(0, 2);
    out.H.priceWrapper = !Array.isArray(opPrices.json) && opPrices.json ? Object.keys(opPrices.json) : null;
    // First take a snapshot of an existing price row, then PATCH with bad values
    const priceRow = priceList[0];
    if (priceRow && priceRow.id) {
      const oldVal = priceRow.price ?? priceRow.value ?? priceRow.amount;
      out.H.target = { id: priceRow.id, oldVal };
      const Hcases = [
        ['empty_body',    {}],
        ['null_price',    { price: null }],
        ['empty_string',  { price: '' }],
        ['whitespace',    { price: '   ' }],
        ['negative',      { price: -1 }],
        ['zero',          { price: 0 }],
        ['tiny',          { price: 0.001 }],
        ['huge_1e10',     { price: 10000000000 }],
        ['non_numeric',   { price: 'abc' }],
        ['xss',           { price: XSS }],
        ['sql',           { price: SQLISH }],
        ['array',         { price: [1, 2] }],
        ['object',        { price: { v: 1 } }],
        ['boolean',       { price: true }],
        ['scientific',    { price: '1e2' }],
        ['precision_3',   { price: 12.345 }],
      ];
      out.H.cases = [];
      for (const [label, body] of Hcases) {
        const r = await callCsrf(admin, 'PATCH', `/api/stores/${OPER_STORE}/prices/${priceRow.id}`, { body });
        out.H.cases.push({ label, sent: body, status: r.status, response: r.json || r.text });
      }
      // Restore original
      if (oldVal !== undefined && oldVal !== null) {
        const restore = await callCsrf(admin, 'PATCH', `/api/stores/${OPER_STORE}/prices/${priceRow.id}`, { body: { price: Number(oldVal) } });
        out.H.restore = { status: restore.status, response: restore.json || restore.text };
      }
    }
  }

  // ============================================================
  // Double-submit (server idempotency): same store POST twice nearly simultaneously
  // ============================================================
  const dsCode = `DS-${TAG}`;
  const dsBody = { code: dsCode, name: 'double submit', address: '-', timezone: 'Europe/Amsterdam', status: 'active' };
  const [dr1, dr2] = await Promise.all([
    callCsrf(admin, 'POST', '/api/stores', { body: dsBody }),
    callCsrf(admin, 'POST', '/api/stores', { body: dsBody }),
  ]);
  out.doubleSubmit.store = { first: { status: dr1.status, id: idOf(dr1.json) }, second: { status: dr2.status, id: idOf(dr2.json), response: dr2.json || dr2.text } };
  if (idOf(dr1.json)) out.created.stores.push(idOf(dr1.json));
  if (idOf(dr2.json)) out.created.stores.push(idOf(dr2.json));

  const dsPlu = `9${String(TS).slice(-5)}8`;
  const dsProd = goodB({ defaultPluCode: dsPlu, name: 'doubleProd' });
  const [pp1, pp2] = await Promise.all([
    callCsrf(admin, 'POST', '/api/products', { body: dsProd }),
    callCsrf(admin, 'POST', '/api/products', { body: dsProd }),
  ]);
  out.doubleSubmit.product = { first: { status: pp1.status, id: idOf(pp1.json) }, second: { status: pp2.status, id: idOf(pp2.json), response: pp2.json || pp2.text } };
  if (idOf(pp1.json)) out.created.products.push(idOf(pp1.json));
  if (idOf(pp2.json)) out.created.products.push(idOf(pp2.json));

  // ============================================================
  // Cleanup: archive everything we created
  // ============================================================
  out.cleanup.scales = [];
  for (const s of out.created.scales) {
    const r = await callCsrf(admin, 'PATCH', `/api/stores/${s.storeId}/scales/${s.id}`, { body: { status: 'archived' } }).catch(e => ({ status: -1, text: e.message }));
    out.cleanup.scales.push({ id: s.id, status: r.status });
  }
  out.cleanup.banners = [];
  for (const b of out.created.banners) {
    const r = await callCsrf(admin, 'PATCH', `/api/stores/${b.storeId}/advertising/banners/${b.id}`, { body: { status: 'archived' } }).catch(e => ({ status: -1, text: e.message }));
    out.cleanup.banners.push({ id: b.id, status: r.status });
  }
  out.cleanup.categories = [];
  for (const c of out.created.categories) {
    const r = await callCsrf(admin, 'PATCH', `/api/stores/${c.storeId}/catalog/categories/${c.id}`, { body: { status: 'archived' } }).catch(e => ({ status: -1, text: e.message }));
    out.cleanup.categories.push({ id: c.id, status: r.status });
  }
  out.cleanup.products = [];
  for (const id of out.created.products) {
    const r = await callCsrf(admin, 'PATCH', `/api/products/${id}`, { body: { status: 'archived' } }).catch(e => ({ status: -1, text: e.message }));
    out.cleanup.products.push({ id, status: r.status });
  }
  out.cleanup.stores = [];
  for (const id of out.created.stores) {
    const r = await callCsrf(admin, 'PATCH', `/api/stores/${id}`, { body: { status: 'archived' } }).catch(e => ({ status: -1, text: e.message }));
    out.cleanup.stores.push({ id, status: r.status });
  }

  if (oper.ctx) await oper.ctx.dispose();
  await admin.ctx.dispose();
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
