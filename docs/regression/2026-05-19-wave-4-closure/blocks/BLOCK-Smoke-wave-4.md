# BLOCK Smoke: NOT RUN

Skipped per brief FAIL-FAST policy after Block 2 tripped the
"PATCH with invalid `javascript:` URL returning 200 → STOP, return FAIL (security regression)" trigger.

Per brief: "On FAIL: write the failing block's markdown, write report.json with everything captured so far, commit, then return FAIL verdict with the failing block + raw response excerpt + your hypothesis on cause."

Smoke was scheduled to cover:
1. Re-login as admin and load `/`
2. Navigate to stores list
3. **Wave 1 tripwire**: 90-second `page.on('request')` observation window measuring `/api/auth/session` poll rate; abort if > 2 calls/min sustained.

Note Block 1 already executed a successful UI login and dashboard render (`evidence/block-1-dashboard.png`) — that subset of smoke is therefore observed implicitly as a side-effect of Block 1 scenario `auth-1b-dashboard`, which PASSED (1733 ms). The Wave-1 session-rate tripwire was NOT exercised — defer to next run after staging is rebuilt.

## What would have been measured (deferred)

- `/api/auth/session` calls per minute over 90 s dashboard-idle window
- Dashboard render after `/stores` navigation
