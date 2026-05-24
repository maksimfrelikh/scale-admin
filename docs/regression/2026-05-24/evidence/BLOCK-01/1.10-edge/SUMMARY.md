# §1.10 Edge cases — findings

## Empty / malformed input
- POST /api/auth/login with `{}` (no email/password) → 401 generic "Неверный email или пароль". No 500. ✅
  (Strictly the brief expected 400; same alignment note as §1.2 — login intentionally collapses validation errors into the generic 401 to avoid enumeration. Not a regression.)
- POST /api/auth/login with empty-string email or empty-string password → 401 generic.

## Max-length input
- 256-char local part email → 401 (lookup miss, no 500). Graceful.
- 1024-char password → 401 (lookup proceeds then bcrypt/pbkdf2 rejects). Server did not error; processed in ~165ms (same shape as normal wrong-pw). Graceful.

## Unicode / Russian / emoji
- `тестовый@почта.рф` → 401, no 500. Graceful.
- `emoji-😀-test@example.test` → 401, no 500. Graceful.

## XSS smoke in invite fullName
- POST /api/auth/invites with `fullName: "<script>alert(1)</script>"` → 201. Invite row created.
- Response body contains: `{invite: {id, email, role, expiresAt, acceptedAt, createdAt}}` — **fullName field is NOT echoed** back in the invite-create response. Grep for `<script>` in response body: 0 occurrences. ✅
- DOM-rendering check on `/accept-invite?token=…` is deferred (needs browser). The frontend would need to render fullName at invite-accept time AFTER a valid token; in this run the invite was cancelled before acceptance, so the fullName never reached a User row.
- Code surface: stored as raw string; on later `GET /api/users` the fullName would be returned as JSON-escaped (no HTML rendering server-side). HTML rendering happens in React, which by default escapes interpolations — XSS would require an unsafe `dangerouslySetInnerHTML`. Code review here is non-exhaustive; live DOM grep is the proper next step.

## Multi-tab / back-forward / refresh
- Multi-tab login (cookie jar A + cookie jar B): both produce distinct session IDs for the same user; both succeed independently. ✅ (Captured in §1.1.)
- Same-tab logout invalidation: logout (cookie jar A) revokes the session → `/api/auth/session` with the same cookie → 401. ✅ (Captured in §1.1.)
- Browser-back to a cached authenticated page after logout: the cached HTML may render, but any API call (`/api/auth/session` or RTK Query) returns 401 — SPA must redirect on 401. Cache-Control headers on /api/auth/session/login response: `Cache-Control: no-cache` (captured in §1.9 accept-invite headers shows nginx returns `Cache-Control: no-cache` for SPA shell too). The browser-back stale-render risk depends on SPA store hydration; requires browser tool to verify end-to-end. Deferred.
- Network throttling / offline: would test SPA UX (no stuck spinner, no token leak in retry). Deferred — browser tool needed.

## Russian-localization (0% English leakage)
- All auth error `message` fields observed in this block are Russian: "Неверный email или пароль", "Требуется авторизация", "Сессия формы истекла…", "Слишком много неудачных попыток входа…", "Приглашение не найдено", "Ссылка для сброса пароля недействительна". ✅
- Latin word "email" appears inside Russian messages (e.g. "Неверный email или пароль"). Per the brief's "Latin-only technical tokens (PLU, SKU, HTTP, API, …) are OK and expected" clause, "email" is a borrowed technical token in common Russian business usage. Acceptable.
- **Framework-default 404 messages leak English:** "Cannot DELETE /api/auth/invites/…", "Cannot GET /api/auth/invites", "Cannot GET /api/auth/password-reset/request". These come from NestJS's default 404 handler, NOT from app-level user-facing error messages. They surface only on direct probe of nonexistent routes; the SPA does not hit these in normal flow.
- Verdict on localization: PASS for user-facing flows. Side finding (non-blocking) — the framework default 404 message could be customized to a Russian string for defense-in-depth; not a regression and not in Wave 5 closure scope. Will list under "Side findings" in the run log rather than file a bug.

## Throwaway artifacts
1 XSS-probe invite created (`xss-probe-…@example.test`) and cancelled via DELETE /api/users/invites/:id (200 `{cancelled:true}`).

## Verdict
PASS for everything in scope of this Manager-inline run. Browser-dependent edge cases (DOM-XSS rendering, browser-back stale-render, offline UX) are deferred — needs Tester §3 browser tool. None are regressions; all expected to work per code review.
