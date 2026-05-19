/**
 * Probe BUG-REG-020 edge cases — supply expiresAt and observe invite creation.
 */
const H = require('./helpers/common.cjs');
const { chromium, API, QA_ADMIN, apiLogin, log } = H;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const adminCtx = await browser.newContext();
  const adminLogin = await apiLogin(adminCtx, QA_ADMIN);
  const adminCsrf = adminLogin.csrf;
  console.log('admin login:', adminLogin.status);

  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const cases = [
    { label: 'baseline_valid', email: `probe-valid-${Date.now()}@example.com` },
    { label: 'two_at', email: `a@b@c-${Date.now()}.com` },
    { label: 'space', email: `has space-${Date.now()}@example.com` },
    { label: 'leading_dot', email: `.user-${Date.now()}@example.com` },
    { label: 'consecutive_dots', email: `us..er-${Date.now()}@example.com` },
    { label: 'trailing_dot_local', email: `user.-${Date.now()}@example.com` },
    { label: 'tab_char', email: `tab\tuser-${Date.now()}@example.com` },
    { label: 'newline', email: `bad\nuser-${Date.now()}@example.com` },
    { label: 'comma', email: `a,b-${Date.now()}@example.com` },
  ];

  const results = [];
  for (const c of cases) {
    const r = await adminCtx.request.post(`${API}/api/auth/invites`, {
      data: { email: c.email, role: 'operator', fullName: 'X', expiresAt },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    results.push({
      label: c.label,
      email: c.email,
      status: r.status(),
      inviteId: j.id || j.invite?.id,
      msg: (j.message || '').slice(0, 100),
    });
    console.log(JSON.stringify(results[results.length - 1]));
  }

  await browser.close();
})();
