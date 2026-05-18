/**
 * BLOCK-06 — Cleanup: archive any leftover test entities (stores, products) by tag.
 */
const { request: pwRequest } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://maksimfrelikh.ru';
const QA_PASSWORD = process.env.QA_PASSWORD || (() => { throw new Error('Set QA_PASSWORD'); })();
const ADMIN = { email: 'qa-admin@***.invalid', password: QA_PASSWORD };
const EVI = path.resolve(__dirname, '..', 'evidence', 'block-06');
const REPORT = path.join(EVI, 'cleanup.json');

async function newCtx() {
  const ctx = await pwRequest.newContext({ baseURL: TARGET });
  const csrf1 = await ctx.get('/api/auth/csrf');
  const token = (await csrf1.json()).csrfToken;
  await ctx.post('/api/auth/login', { headers: { 'content-type': 'application/json', 'x-csrf-token': token }, data: ADMIN });
  const csrf2 = await ctx.get('/api/auth/csrf');
  return { ctx, csrf: (await csrf2.json()).csrfToken };
}

async function main() {
  const c = await newCtx();
  const out = { stores: [], products: [] };

  const sres = await c.ctx.get('/api/stores');
  const sj = await sres.json();
  const stores = sj.stores || sj.items || sj.data || [];
  for (const s of stores) {
    if (s.status !== 'archived' && /REG6[A-Z0-9]*-|^STORE-REG6-|^DUP-REG6-|^DS-REG6-|^DBL-REG6|^SLO-REG6|^XSSUI-REG6|^OFF-REG6|^EMPT-N-REG6|^TZ-REG6|^EF-REG6|^IS-REG6|^X-REG6|^S-REG6|^C-REG6|^U-REG6|^DROP-REG6|^NAV-REG6/.test(s.code)) {
      const r = await c.ctx.patch(`/api/stores/${s.id}`, {
        headers: { 'x-csrf-token': c.csrf, 'content-type': 'application/json' },
        data: { status: 'archived' },
      });
      out.stores.push({ code: s.code, id: s.id, status: r.status() });
    }
  }

  const pres = await c.ctx.get('/api/products');
  const pj = await pres.json();
  const products = pj.products || pj.items || pj.data || [];
  for (const p of products) {
    const name = p.name || '';
    if (p.status !== 'archived' && (/^Block6 Prod REG6|BProd 1779|^(oper-attempt|dup|doubleProd|dupA|dupB)$/.test(name) || /<script>window\.__xss_b1/.test(name))) {
      const r = await c.ctx.patch(`/api/products/${p.id}`, {
        headers: { 'x-csrf-token': c.csrf, 'content-type': 'application/json' },
        data: { status: 'archived' },
      });
      out.products.push({ name: name.slice(0, 50), id: p.id, status: r.status() });
    }
  }

  await c.ctx.dispose();
  fs.writeFileSync(REPORT, JSON.stringify(out, null, 2));
  console.log(`Archived: ${out.stores.length} stores, ${out.products.length} products`);
  for (const s of out.stores) console.log('  S', s.code, '→', s.status);
  for (const p of out.products) console.log('  P', p.name, '→', p.status);
}

main().catch(e => { console.error(e); process.exit(1); });
