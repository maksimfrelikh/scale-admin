/**
 * BLOCK 9 — File uploads: validation, size limits, MIME enforcement, XSS protection.
 * Endpoint: POST /api/files/images (multipart, field "file")
 */
const H = require('./helpers/common.cjs');
const { chromium, API, QA_ADMIN, QA_OP, sleep, log, writeReport, apiLogin, getCsrfRequest } = H;
const path = require('path');
const fs = require('fs');

// Magic-byte signatures
// PNG: 89 50 4E 47 0D 0A 1A 0A + IHDR ...
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// 1x1 transparent PNG (minimal, valid)
const MIN_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQYV2NgAAIAAAUAAeImBZsAAAAASUVORK5CYII=', 'base64');
// 1x1 JPEG (minimal JPG magic + EOI)
const JPEG_FFE0 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);
// WEBP: RIFF????WEBP
const WEBP_HEADER = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x1a, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 ', 'ascii'),
  Buffer.from([0x0e, 0x00, 0x00, 0x00]),
  Buffer.alloc(14, 0x00),
]);
// Fake GIF
const GIF_HEADER = Buffer.from('GIF89a', 'ascii');
// HTML
const HTML_PAYLOAD = Buffer.from('<html><script>alert(1)</script></html>', 'utf-8');
// SVG (XML-based image — should also be rejected since not in allow list)
const SVG_PAYLOAD = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'utf-8');

async function postMultipart(ctx, csrf, fieldName, fileName, content, mimeType) {
  // Playwright APIRequest supports multipart via `multipart` option
  return ctx.request.post(`${API}/api/files/images`, {
    multipart: {
      [fieldName]: { name: fileName, mimeType, buffer: content },
    },
    headers: { 'x-csrf-token': csrf, Origin: 'http://localhost:5173' },
  });
}

(async () => {
  const block = 'block-09';
  const report = { startedAt: new Date().toISOString(), scenarios: {} };
  const browser = await H.chromium.launch({ headless: true });

  const adminCtx = await browser.newContext();
  const adminLogin = await apiLogin(adminCtx, QA_ADMIN);
  const adminCsrf = adminLogin.csrf;

  // === 9.1 Happy path — PNG (magic + ext match) ===
  {
    const r = await postMultipart(adminCtx, adminCsrf, 'file', 'test.png', MIN_PNG, 'image/png');
    const j = await r.json().catch(() => ({}));
    report.scenarios['9.1_upload_png'] = { status: r.status(), mimeType: j.fileAsset?.mimeType, publicUrl: j.fileAsset?.publicUrl, size: j.fileAsset?.sizeBytes };
  }

  // === 9.2 Happy path — JPEG ===
  {
    const r = await postMultipart(adminCtx, adminCsrf, 'file', 'test.jpg', JPEG_FFE0, 'image/jpeg');
    const j = await r.json().catch(() => ({}));
    report.scenarios['9.2_upload_jpeg'] = { status: r.status(), mimeType: j.fileAsset?.mimeType };
  }

  // === 9.3 Extension mismatch — .png file with JPEG magic ===
  {
    const r = await postMultipart(adminCtx, adminCsrf, 'file', 'fake.png', JPEG_FFE0, 'image/png');
    const j = await r.json().catch(() => ({}));
    report.scenarios['9.3_ext_mismatch'] = { status: r.status(), msg: (j.message || '').slice(0, 100) };
  }

  // === 9.4 Disallowed extension — .gif (even with GIF magic) ===
  {
    const r = await postMultipart(adminCtx, adminCsrf, 'file', 'test.gif', GIF_HEADER, 'image/gif');
    const j = await r.json().catch(() => ({}));
    report.scenarios['9.4_gif_rejected'] = { status: r.status(), msg: (j.message || '').slice(0, 100) };
  }

  // === 9.5 SVG with XSS payload — should be rejected ===
  {
    const r = await postMultipart(adminCtx, adminCsrf, 'file', 'xss.svg', SVG_PAYLOAD, 'image/svg+xml');
    const j = await r.json().catch(() => ({}));
    report.scenarios['9.5_svg_xss_rejected'] = { status: r.status(), msg: (j.message || '').slice(0, 100) };
  }

  // === 9.6 HTML masquerading as .png ===
  {
    const r = await postMultipart(adminCtx, adminCsrf, 'file', 'shell.png', HTML_PAYLOAD, 'image/png');
    const j = await r.json().catch(() => ({}));
    report.scenarios['9.6_html_as_png'] = { status: r.status(), msg: (j.message || '').slice(0, 100) };
  }

  // === 9.7 No extension ===
  {
    const r = await postMultipart(adminCtx, adminCsrf, 'file', 'noext', MIN_PNG, 'image/png');
    const j = await r.json().catch(() => ({}));
    report.scenarios['9.7_no_extension'] = { status: r.status(), msg: (j.message || '').slice(0, 100) };
  }

  // === 9.8 Empty file ===
  {
    const r = await postMultipart(adminCtx, adminCsrf, 'file', 'empty.png', Buffer.alloc(0), 'image/png');
    const j = await r.json().catch(() => ({}));
    report.scenarios['9.8_empty'] = { status: r.status(), msg: (j.message || '').slice(0, 100) };
  }

  // === 9.9 Oversize (>2MB) ===
  {
    const big = Buffer.concat([PNG_HEADER, Buffer.alloc(2 * 1024 * 1024 + 10, 0)]);
    const r = await postMultipart(adminCtx, adminCsrf, 'file', 'big.png', big, 'image/png');
    const j = await r.json().catch(() => ({}));
    report.scenarios['9.9_oversize'] = { status: r.status(), msg: (j.message || '').slice(0, 100) };
  }

  // === 9.10 Filename traversal attempt ===
  {
    const r = await postMultipart(adminCtx, adminCsrf, 'file', '../../etc/passwd.png', MIN_PNG, 'image/png');
    const j = await r.json().catch(() => ({}));
    report.scenarios['9.10_traversal'] = { status: r.status(), publicUrl: j.fileAsset?.publicUrl, msg: (j.message || '').slice(0, 100) };
  }

  // === 9.11 No file field ===
  {
    const r = await adminCtx.request.post(`${API}/api/files/images`, {
      multipart: { other: { name: 'x', mimeType: 'text/plain', buffer: Buffer.from('x') } },
      headers: { 'x-csrf-token': adminCsrf, Origin: 'http://localhost:5173' },
    });
    const j = await r.json().catch(() => ({}));
    report.scenarios['9.11_no_file_field'] = { status: r.status(), msg: (j.message || '').slice(0, 100) };
  }

  // === 9.12 Unicode filename ===
  {
    const r = await postMultipart(adminCtx, adminCsrf, 'file', 'тест-файл.png', MIN_PNG, 'image/png');
    const j = await r.json().catch(() => ({}));
    report.scenarios['9.12_unicode_filename'] = { status: r.status(), publicUrl: j.fileAsset?.publicUrl };
  }

  await adminCtx.close();

  // === 9.13 Operator can upload ===
  const opCtx = await browser.newContext();
  const opLogin = await apiLogin(opCtx, QA_OP);
  const opCsrf = opLogin.csrf;
  {
    const r = await postMultipart(opCtx, opCsrf, 'file', 'op-test.png', MIN_PNG, 'image/png');
    const j = await r.json().catch(() => ({}));
    report.scenarios['9.13_operator_upload'] = { status: r.status(), mimeType: j.fileAsset?.mimeType };
  }
  await opCtx.close();

  // === 9.14 Without auth (no session) → 401 ===
  {
    const noauth = await browser.newContext();
    const csrfR = await noauth.request.get(`${API}/api/auth/csrf`);
    const csrfJ = await csrfR.json();
    const r = await postMultipart(noauth, csrfJ.csrfToken, 'file', 'noauth.png', MIN_PNG, 'image/png');
    const j = await r.json().catch(() => ({}));
    report.scenarios['9.14_unauth_rejected'] = { status: r.status(), msg: (j.message || '').slice(0, 100) };
    await noauth.close();
  }

  await browser.close();
  report.finishedAt = new Date().toISOString();
  writeReport(block, report);
  console.log('\n=== BLOCK 9 SUMMARY ===');
  console.log(JSON.stringify(report.scenarios, null, 2));
})();
