/**
 * Wave 4 closure — staging helper.
 * Same shape as wave-2 common.cjs but pointed at https://staging.maksimfrelikh.ru.
 * Playwright resolves from /tmp/openclaw-pw/node_modules.
 */
process.env.NODE_PATH = '/tmp/openclaw-pw/node_modules';
require('module').Module._initPaths();

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Staging is same-origin: FE and API share the host.
const FE = 'https://staging.maksimfrelikh.ru';
const API = 'https://staging.maksimfrelikh.ru';

// gitleaks:allow — staging admin credentials.
// NOTE: brief specified qa-admin@gmail.com / QaRegression123! but staging
// does not have SEED_ADMIN_EMAIL/PASSWORD overrides in .env.staging, so only
// the seed defaults from backend/prisma/seed.js are present. Reported as
// side finding. We authenticate as the actually-seeded admin.
const QA_ADMIN = { email: 'admin@example.com', password: 'admin12345' }; // gitleaks:allow — known QA seed creds
const QA_OP    = { email: 'qa-operator@gmail.com', password: 'QaRegression123!' }; // gitleaks:allow — brief reference cred, not seeded on staging

const EVI_ROOT = path.resolve(__dirname, '..', '..', 'evidence');
fs.mkdirSync(EVI_ROOT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toISOString().slice(11, 23);
const log = (k, v) => console.log(`[${ts()}] ${k}`, typeof v === 'object' ? JSON.stringify(v).slice(0, 400) : v);

function ev(name) { return path.join(EVI_ROOT, name); }
function shotPath(block, name) { return ev(`${block}-${name}.png`); }
async function shot(page, p) { try { await page.screenshot({ path: p, fullPage: false }); } catch {} }

async function getCsrfRequest(ctx) {
  const r = await ctx.request.get(`${API}/api/auth/csrf`);
  const j = await r.json();
  return j.csrfToken;
}

async function apiLogin(ctx, who) {
  const csrf = await getCsrfRequest(ctx);
  const t0 = Date.now();
  const r = await ctx.request.post(`${API}/api/auth/login`, {
    data: who,
    headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok(), status: r.status(), body: j, csrf, elapsedMs: Date.now() - t0 };
}

function sanitizeBody(b) {
  if (b && typeof b === 'object') {
    const c = { ...b };
    if ('password' in c) c.password = '***';
    return c;
  }
  return b;
}

function sanitizeResp(body) {
  // best-effort: redact common token fields if backend ever returns one
  if (body && typeof body === 'object') {
    const c = { ...body };
    for (const k of ['token', 'accessToken', 'refreshToken', 'sessionToken']) {
      if (typeof c[k] === 'string' && c[k].length > 16) {
        c[k] = c[k].slice(0, 12) + '…' + c[k].slice(-4);
      }
    }
    return c;
  }
  return body;
}

function writeReport(name, payload) {
  const p = ev(`${name}.json`);
  fs.writeFileSync(p, JSON.stringify(payload, null, 2));
  return p;
}

module.exports = {
  chromium, fs, path,
  FE, API, QA_ADMIN, QA_OP,
  EVI_ROOT, ev, shotPath, shot,
  sleep, ts, log,
  getCsrfRequest, apiLogin,
  sanitizeBody, sanitizeResp,
  writeReport,
};
