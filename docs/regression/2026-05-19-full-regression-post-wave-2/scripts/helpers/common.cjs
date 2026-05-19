/**
 * Wave 3 full regression — shared helpers.
 * Resolves Playwright from /tmp/openclaw-pw/node_modules.
 */
process.env.NODE_PATH = '/tmp/openclaw-pw/node_modules';
require('module').Module._initPaths();

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FE = 'http://localhost:5173';
const API = 'http://localhost:3000';

const QA_ADMIN = { email: 'qa-admin@gmail.com', password: 'QaRegression123!' }; // gitleaks:allow — known QA test creds
const QA_OP    = { email: 'qa-operator@gmail.com', password: 'QaRegression123!' }; // gitleaks:allow — known QA test creds

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
  const r = await ctx.request.post(`${API}/api/auth/login`, {
    data: who,
    headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/json' },
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok(), status: r.status(), body: j, csrf };
}

async function uiState(page) {
  const url = page.url();
  let h1 = '';
  try { h1 = (await page.locator('h1').first().textContent({ timeout: 1500 })) || ''; } catch {}
  let body = '';
  try { body = (await page.locator('body').textContent({ timeout: 1500 })) || ''; } catch {}
  const bodyTrim = body.replace(/\s+/g, ' ').slice(0, 240);
  const onLogin = /Вход в систему|Войти|Login/i.test(body) && !/Дашборд|Главная|Магазины|Каталог|Пользователи/i.test(body);
  return { url, h1: h1.trim(), body: bodyTrim, onLogin };
}

async function uiLogin(page, who) {
  await page.goto(`${FE}/`, { waitUntil: 'domcontentloaded' });
  await sleep(400);
  await page.locator('input[type="email"], input[name="email"]').first().fill(who.email);
  await page.locator('input[type="password"]').first().fill(who.password);
  const respP = page.waitForResponse(r => r.url().includes('/api/auth/login') && (r.status() === 200 || r.status() === 401 || r.status() === 403), { timeout: 15000 }).catch(() => null);
  await page.locator('button[type="submit"]').first().click();
  const resp = await respP;
  await sleep(1200);
  return resp;
}

function writeReport(block, payload) {
  const p = ev(`${block}-report.json`);
  fs.writeFileSync(p, JSON.stringify(payload, null, 2));
  return p;
}

module.exports = {
  chromium, fs, path,
  FE, API, QA_ADMIN, QA_OP,
  EVI_ROOT, ev, shotPath, shot,
  sleep, ts, log,
  getCsrfRequest, apiLogin,
  uiState, uiLogin,
  writeReport,
};
