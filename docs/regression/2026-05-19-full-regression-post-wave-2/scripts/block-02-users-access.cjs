/**
 * BLOCK 2 — Users & Access.
 * Coverage:
 *  - Admin lists users
 *  - Invite create (valid + invalid emails per RFC 5321 / BUG-REG-020)
 *  - Invite revoke / restore (if endpoints exist; soft delete)
 *  - Password reset: request (BUG-REG-025 — static notice only in MVP, but ensure endpoint responds correctly)
 *  - Operator forbidden from admin user mgmt
 */
const H = require('./helpers/common.cjs');
const { chromium, FE, API, QA_ADMIN, QA_OP, sleep, log, uiState, uiLogin, shot, shotPath, writeReport, getCsrfRequest, apiLogin } = H;

(async () => {
  const block = 'block-02';
  const report = { startedAt: new Date().toISOString(), scenarios: {} };
  const browser = await chromium.launch({ headless: true });

  // === Admin context ===
  const adminCtx = await browser.newContext();
  const adminLogin = await apiLogin(adminCtx, QA_ADMIN);
  const adminCsrf = adminLogin.csrf;
  log('admin login', adminLogin.status);

  // === 2.1 Admin GET /users — full list ===
  {
    const r = await adminCtx.request.get(`${API}/api/users`);
    const j = await r.json().catch(() => ({}));
    const list = j.users || j.items || (Array.isArray(j) ? j : []);
    report.scenarios['2.1_admin_lists_users'] = {
      status: r.status(),
      count: list.length,
      sampleRoles: [...new Set(list.map(u => u.role).filter(Boolean))],
      hasQaAdmin: list.some(u => u.email === 'qa-admin@gmail.com'),
      hasQaOperator: list.some(u => u.email === 'qa-operator@gmail.com'),
    };
  }

  // === 2.2 Admin GET /users/:id — own profile ===
  {
    const sessR = await adminCtx.request.get(`${API}/api/auth/session`);
    const sess = await sessR.json();
    const myId = sess.user?.id;
    const r = await adminCtx.request.get(`${API}/api/users/${myId}`);
    const j = await r.json().catch(() => ({}));
    report.scenarios['2.2_admin_user_detail'] = { status: r.status(), email: j?.email || j?.user?.email };
  }

  // === 2.3 Invite create — valid email ===
  let inviteToken = null;
  let inviteId = null;
  let inviteEmail = `qa-regtest-${Date.now()}@example.com`;
  {
    const r = await adminCtx.request.post(`${API}/api/auth/invites`, {
      data: { email: inviteEmail, role: 'operator', fullName: 'Reg Test User' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    inviteToken = j.token || j.inviteToken || j.invite?.token;
    inviteId = j.id || j.inviteId || j.invite?.id;
    report.scenarios['2.3_invite_create_valid'] = { status: r.status(), email: inviteEmail, hasToken: !!inviteToken, inviteId };
  }

  // === 2.4 Invite create — invalid emails (BUG-REG-020 RFC 5321 enforcement) ===
  {
    const cases = [
      { label: 'empty', email: '' },
      { label: 'no_at', email: 'bademail' },
      { label: 'two_at', email: 'a@b@c.com' },
      { label: 'space', email: 'has space@example.com' },
      { label: 'too_long_local', email: 'a'.repeat(65) + '@example.com' }, // RFC 5321 local part max 64
      { label: 'too_long_domain', email: 'x@' + 'a'.repeat(64) + '.com' },
      { label: 'unicode', email: 'тест@пример.рф' },
      { label: 'trailing_dot', email: 'user@example.com.' },
      { label: 'leading_dot', email: '.user@example.com' },
      { label: 'consecutive_dots', email: 'us..er@example.com' },
    ];
    const results = [];
    for (const c of cases) {
      const r = await adminCtx.request.post(`${API}/api/auth/invites`, {
        data: { email: c.email, role: 'operator', fullName: 'X' },
        headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
      });
      const j = await r.json().catch(() => ({}));
      results.push({ ...c, status: r.status(), msg: (j.message || '').slice(0, 100) });
    }
    report.scenarios['2.4_invite_invalid_emails'] = results;
  }

  // === 2.5 Invites list (admin) — ensure our created invite shows ===
  {
    const r = await adminCtx.request.get(`${API}/api/auth/invites`);
    const j = await r.json().catch(() => ({}));
    const list = j.invites || j.items || (Array.isArray(j) ? j : []);
    const found = list.find(i => i.email === inviteEmail);
    report.scenarios['2.5_invites_list'] = { status: r.status(), count: list.length, foundCreated: !!found, foundStatus: found?.status };
  }

  // === 2.6 Invite revoke ===
  if (inviteId) {
    const r = await adminCtx.request.delete(`${API}/api/auth/invites/${inviteId}`, {
      headers: { 'x-csrf-token': adminCsrf },
    });
    const list2R = await adminCtx.request.get(`${API}/api/auth/invites`);
    const list2 = await list2R.json().catch(() => ({}));
    const arr2 = list2.invites || list2.items || (Array.isArray(list2) ? list2 : []);
    const after = arr2.find(i => i.email === inviteEmail);
    report.scenarios['2.6_invite_revoke'] = { status: r.status(), revokedStatus: after?.status, body: after };
  } else {
    report.scenarios['2.6_invite_revoke'] = { skipped: 'no inviteId' };
  }

  // === 2.7 Password-reset request — should always 200/204 (no email enumeration) ===
  {
    const r1 = await adminCtx.request.post(`${API}/api/auth/password-reset/request`, {
      data: { email: 'qa-admin@gmail.com' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const r2 = await adminCtx.request.post(`${API}/api/auth/password-reset/request`, {
      data: { email: 'never-existed-' + Date.now() + '@example.com' },
      headers: { 'x-csrf-token': adminCsrf, 'Content-Type': 'application/json' },
    });
    const j1 = await r1.json().catch(() => ({}));
    const j2 = await r2.json().catch(() => ({}));
    report.scenarios['2.7_password_reset_request'] = {
      existingUser: { status: r1.status(), body: j1 },
      nonExistentUser: { status: r2.status(), body: j2 },
      sameResponse: r1.status() === r2.status() && JSON.stringify(j1) === JSON.stringify(j2),
    };
  }

  // === 2.8 Password reset UI — static notice (MVP) ===
  {
    const page = await adminCtx.newPage();
    await page.goto(`${FE}/password-reset`, { waitUntil: 'domcontentloaded' });
    await sleep(2000);
    const body = (await page.locator('body').textContent({ timeout: 2000 }).catch(() => '')) || '';
    await shot(page, shotPath(block, '2-8-password-reset-notice'));
    report.scenarios['2.8_password_reset_static_notice'] = {
      url: page.url(),
      hasNoticeKeyword: /Обратитесь к администратору|admin|сброс/i.test(body),
      bodySnippet: body.replace(/\s+/g, ' ').slice(0, 200),
    };
    await page.close();
  }

  await adminCtx.close();

  // Wait to clear rate-limit before operator login
  await sleep(2000);

  // === 2.9 Operator forbidden from /users mgmt endpoints ===
  const opCtx = await browser.newContext();
  const opLogin = await apiLogin(opCtx, QA_OP);
  const opCsrf = opLogin.csrf;
  {
    const list = await opCtx.request.get(`${API}/api/users`);
    const inviteList = await opCtx.request.get(`${API}/api/auth/invites`);
    const createInvite = await opCtx.request.post(`${API}/api/auth/invites`, {
      data: { email: 'should-fail@example.com', role: 'operator' },
      headers: { 'x-csrf-token': opCsrf, 'Content-Type': 'application/json' },
    });
    report.scenarios['2.9_operator_forbidden_endpoints'] = {
      list_users: list.status(),
      list_invites: inviteList.status(),
      create_invite: createInvite.status(),
    };
  }

  // === 2.10 UI — operator does NOT see "Users & Access" nav link ===
  {
    const page = await opCtx.newPage();
    await page.goto(`${FE}/`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    const body = (await page.locator('body').textContent({ timeout: 2000 }).catch(() => '')) || '';
    const hasUsersLink = /Users\s*&\s*Access|Пользователи/i.test(body);
    await shot(page, shotPath(block, '2-10-operator-no-users-nav'));
    report.scenarios['2.10_operator_no_users_nav'] = { hasUsersLinkInBody: hasUsersLink };
    await page.close();
  }

  await opCtx.close();
  await browser.close();
  report.finishedAt = new Date().toISOString();
  writeReport(block, report);
  console.log('\n=== BLOCK 2 SUMMARY ===');
  console.log(JSON.stringify(report.scenarios, null, 2));
})();
