const H = require('./helpers/common.cjs');
const { chromium, FE, API, QA_ADMIN, sleep, uiLogin, uiState } = H;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const tabA = await ctx.newPage();
  await uiLogin(tabA, QA_ADMIN);
  await sleep(1500);
  const sA = await uiState(tabA);
  console.log('tabA after login:', sA.url, sA.h1);
  const cookiesAfter = await ctx.cookies();
  console.log('cookies after login (count):', cookiesAfter.length);
  cookiesAfter.forEach(c => console.log(' -', c.name, 'domain=', c.domain, 'secure=', c.secure, 'httpOnly=', c.httpOnly, 'sameSite=', c.sameSite));

  const tabB = await ctx.newPage();
  await tabB.goto(`${FE}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const sB = await uiState(tabB);
  console.log('tabB after open /:', sB.url, sB.h1, 'onLogin=', sB.onLogin);

  // Direct API call from tabB context
  const meResp = await ctx.request.get(`${API}/api/auth/session`);
  console.log('session resp status:', meResp.status());
  const j = await meResp.json().catch(() => ({}));
  console.log('session body:', JSON.stringify(j).slice(0, 200));

  await browser.close();
})();
