const H = require('./helpers/common.cjs');
const { chromium, API, QA_ADMIN, apiLogin } = H;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  await apiLogin(ctx, QA_ADMIN);

  // Without filter
  const r = await ctx.request.get(`${API}/api/logs/global?limit=10`);
  const j = await r.json().catch(() => ({}));
  console.log('top-level keys:', Object.keys(j));
  console.log('full payload (truncated):', JSON.stringify(j).slice(0, 1500));

  await browser.close();
})();
