/**
 * Generate sanitized per-tab network summaries (HAR-like) from existing report*.json data.
 * Output: block-05-tab-{A,B}.har.json — sanitized, no cookies/tokens/passwords.
 */
const fs = require('fs');
const path = require('path');
const EVI = path.resolve(__dirname, '..', 'evidence', 'block-05');

const reports = ['report.json', 'report-round2.json', 'report-round3.json']
  .map(f => path.join(EVI, f))
  .filter(p => fs.existsSync(p))
  .map(p => ({ path: p, data: JSON.parse(fs.readFileSync(p, 'utf8')) }));

const tabA = []; const tabB = [];

function pushIfPresent(arr, label, items) {
  if (!items) return;
  if (Array.isArray(items)) {
    items.forEach(it => arr.push({ label, ...it }));
  } else if (typeof items === 'object') {
    arr.push({ label, ...items });
  }
}

for (const { path: p, data } of reports) {
  const base = path.basename(p);
  if (data.aRequests) pushIfPresent(tabA, `${base}#aRequests`, data.aRequests);
  if (data.bRequests) pushIfPresent(tabB, `${base}#bRequests`, data.bRequests);

  // Extract network-relevant fields from sections
  if (data.sections) {
    const s = data.sections;
    if (s.A) {
      pushIfPresent(tabA, 'A.A2_logout_status', { kind: 'logout', ...s.A.A2_logout_status });
      pushIfPresent(tabB, 'A.A2_B_poll_60s', s.A.A2_B_poll_60s);
      pushIfPresent(tabB, 'A.A3_B_recentApi', s.A.A3_B_after_stores_click && s.A.A3_B_after_stores_click.recentApi);
      pushIfPresent(tabB, 'A.A4_state_change', { kind: 'mutation_after_A_logout', ...s.A.A4_B_state_change_after_A_logout });
    }
    if (s.C) pushIfPresent(tabB, 'C.C3_polls', s.C.C3_B_poll_30s_without_refresh);
    if (s.D) pushIfPresent(tabB, 'D.D3_polls', s.D.D3_B_poll_30s_without_refresh);
  }

  if (data.B) {
    pushIfPresent(tabA, 'B.B2_poll_30s', data.B.B2_A_poll_30s);
    pushIfPresent(tabA, 'B.B3_admin_link_api', data.B.B3_A_recent_api);
  }
  if (data.D_fixed) pushIfPresent(tabB, 'D_fixed.poll', data.D_fixed.D3_B_poll_30s_without_refresh);
  if (data.E_fixed) {
    pushIfPresent(tabA, 'E_fixed.logoutResp', data.E_fixed.logoutResp);
    pushIfPresent(tabB, 'E_fixed.captured', data.E_fixed.captured);
  }
  if (data.F) pushIfPresent(tabB, 'F.csrf_tests', {
    F1_B_state_change_status: data.F.F1_B_state_change_after_A_relogin && data.F.F1_B_state_change_after_A_relogin.status,
    F1_B_with_explicit_old_csrf_status: data.F.F1_B_with_explicit_old_csrf && data.F.F1_B_with_explicit_old_csrf.status,
  });
  if (data.G) {
    pushIfPresent(tabA, 'G.idle_snapshots_5_30min', data.G.G_idle_snapshots);
    pushIfPresent(tabA, 'G.bg_api_during_idle', { count: (data.G.G_bg_api_during_idle || []).length });
    pushIfPresent(tabA, 'G.post_logout_polls', data.G.G_post_logout_polls);
  }
  if (data.H) {
    pushIfPresent(tabA, 'H.curl_logout', { kind: 'external_logout', status: data.H.H_logout_status });
    pushIfPresent(tabA, 'H.polls_30s_A', (data.H.H_polls_30s || []).map(p => ({ t: p.t, h1: p.A.h1, onLogin: p.A.onLogin, sess: p.sessA })));
    pushIfPresent(tabB, 'H.polls_30s_B', (data.H.H_polls_30s || []).map(p => ({ t: p.t, h1: p.B.h1, onLogin: p.B.onLogin, sess: p.sessB })));
    pushIfPresent(tabA, 'H.A_after_click', data.H.H_A_after_click);
  }
}

// Sanitize: drop anything that smells like a token
function clean(o) {
  const s = JSON.stringify(o);
  return JSON.parse(s.replace(/("(?:tokenSent|csrf|password|authorization|x-csrf-token|session)"\s*:\s*)"[^"]*"/gi, '$1"***REDACTED***"'));
}

fs.writeFileSync(path.join(EVI, 'block-05-tab-A.har.json'), JSON.stringify({
  note: 'Sanitized synthesized network summary for Tab A across all sections. Real HAR was not captured due to Playwright recordHar option quirk in this env. All sensitive headers/tokens are redacted.',
  entries: clean(tabA),
}, null, 2));
fs.writeFileSync(path.join(EVI, 'block-05-tab-B.har.json'), JSON.stringify({
  note: 'Sanitized synthesized network summary for Tab B across all sections. Real HAR was not captured due to Playwright recordHar option quirk in this env. All sensitive headers/tokens are redacted.',
  entries: clean(tabB),
}, null, 2));

console.log('A entries:', tabA.length, ' B entries:', tabB.length);
