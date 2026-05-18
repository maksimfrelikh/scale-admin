/**
 * BLOCK-06 G — Direct /api/files/images probing.
 * Verify whether server accepts: zero-byte, gif, svg, txt, exe, large, mime-mismatch.
 * Also test full banner-creation chain.
 */
const { chromium, request: pwRequest } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://maksimfrelikh.ru';
const QA_PASSWORD = process.env.QA_PASSWORD || (() => { throw new Error('Set QA_PASSWORD'); })();
const ADMIN = { email: 'qa-admin@***.invalid', password: QA_PASSWORD };
const OPER_STORE = 'e73ba6bd-abb9-4596-9289-cca474fb2ec1';
const EVI = path.resolve(__dirname, '..', 'evidence', 'block-06');
const REPORT = path.join(EVI, 'G-upload-report.json');
const out = {};

async function newCtx() {
  const ctx = await pwRequest.newContext({ baseURL: TARGET });
  const csrf1 = await ctx.get('/api/auth/csrf');
  const token = (await csrf1.json()).csrfToken;
  await ctx.post('/api/auth/login', { headers: { 'content-type': 'application/json', 'x-csrf-token': token }, data: ADMIN });
  const csrf2 = await ctx.get('/api/auth/csrf');
  return { ctx, csrf: (await csrf2.json()).csrfToken };
}

async function uploadProbe(c, name, buf, mime) {
  const r = await c.ctx.post('/api/files/images', {
    headers: { 'x-csrf-token': c.csrf },
    multipart: { file: { name, mimeType: mime, buffer: buf } },
  });
  let body = await r.text();
  let parsed = null;
  try { parsed = JSON.parse(body); } catch (e) {}
  return { status: r.status(), bodyText: body.slice(0, 400), parsed };
}

async function main() {
  const c = await newCtx();
  const tinyPng = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8cf000300010101003e2c000000000049454e44ae426082', 'hex');
  const gifBuf = Buffer.concat([Buffer.from('GIF89a', 'utf8'), Buffer.alloc(60, 0)]);
  const svgBuf = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10" fill="red"/></svg>');
  const txtBuf = Buffer.from('hello world');
  const zero = Buffer.alloc(0);
  const big = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(2 * 1024 * 1024 + 100, 0x41)]);
  const exe = Buffer.from('MZ' + '\x00'.repeat(40));

  out.png_normal = await uploadProbe(c, 'good.png', tinyPng, 'image/png');
  out.gif_mime = await uploadProbe(c, 'bad.gif', gifBuf, 'image/gif');
  out.svg_mime = await uploadProbe(c, 'bad.svg', svgBuf, 'image/svg+xml');
  out.txt_mime = await uploadProbe(c, 'bad.txt', txtBuf, 'text/plain');
  out.zero_png = await uploadProbe(c, 'zero.png', zero, 'image/png');
  out.exe_mime = await uploadProbe(c, 'bad.exe', exe, 'application/octet-stream');
  out.big_png = await uploadProbe(c, 'big.png', big, 'image/png');
  out.jpg_mime_actually_png = await uploadProbe(c, 'fake.jpg', tinyPng, 'image/jpeg');
  out.png_mime_actually_jpg_bytes = await uploadProbe(c, 'fake.png', exe, 'image/png');

  // also probe: claim image/png but send svg bytes
  out.png_mime_svg_bytes = await uploadProbe(c, 'evil.png', svgBuf, 'image/png');

  // Test full chain: if png_normal returned an id/url, then create a banner using that
  if (out.png_normal.parsed) {
    const imageUrl = out.png_normal.parsed.url || out.png_normal.parsed.imageUrl || out.png_normal.parsed.path;
    out.png_normal_keys = Object.keys(out.png_normal.parsed);
    if (imageUrl) {
      // try posting banner
      const banner = await c.ctx.post(`/api/stores/${OPER_STORE}/advertising/banners`, {
        headers: { 'x-csrf-token': c.csrf, 'content-type': 'application/json' },
        data: { imageUrl, status: 'active', name: 'B6 G probe' },
      });
      out.banner_create = { status: banner.status(), body: (await banner.text()).slice(0, 500) };
    }
  }

  await c.ctx.dispose();
  fs.writeFileSync(REPORT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2).slice(0, 4000));
}

main().catch(e => { console.error(e); process.exit(1); });
