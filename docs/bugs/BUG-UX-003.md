# BUG-UX-003 — Multi-tab navigation can make logout fail with stale CSRF state

## Title
Multi-tab navigation can make logout fail with stale CSRF state

## Severity
High

## Area
Frontend auth/session runtime, CSRF token handling, multi-tab navigation, logout recovery

## Environment
- Production: `https://maksimfrelikh.ru`
- Browser automation: Chromium headless via Playwright Docker image
- Date: 2026-05-16
- Roles tested: admin QA account, operator QA account
- Credentials, passwords, tokens, and secret values were not stored in this report.

## Preconditions
1. User is authenticated.
2. At least two tabs share the same browser session.

## Steps to reproduce
1. Log in to the SPA.
2. In tab 1, open `https://maksimfrelikh.ru/#stores`.
3. In tab 2, open another protected route such as `https://maksimfrelikh.ru/#products`.
4. Return to tab 1.
5. Click `Logout`.
6. Observe the logout network response and UI state.

## Expected result
Logout should work reliably from any tab in the authenticated session:
- `POST /api/auth/logout` succeeds;
- all tabs should transition to or recover toward unauthenticated state;
- stale per-tab CSRF state should be refreshed automatically if needed;
- user should not remain on a protected dashboard after clicking logout.

## Actual result
After opening a second tab and returning to the first tab:
- `POST /api/auth/logout` returned `403`.
- The SPA remained on the protected route `#stores`.
- Dashboard content remained visible.
- Inline alert displayed: `Сессия формы истекла. Обновите страницу и повторите действие.`
- Manual refresh/retry is required.

The broader navigation run reproduced the same failure for both admin and operator after multi-tab route opening.

## Evidence
Sanitized evidence file:
- `docs/evidence/navigation-regression-2026-05-16.json`

Focused reproduction result:
- Tab 1 route before logout: `#stores`
- Tab 2 route opened: `#products`
- Tab 1 logout response: `403`
- Tab 1 post-click state: still dashboard on `#stores`, protected nav visible, stale authenticated header visible.

## User impact
High impact:
- A user can be unable to log out from a tab after normal multi-tab navigation.
- This creates a shared-device/session safety concern and undermines trust in logout.
- The required workaround is not obvious to normal users.

## Workaround
Refresh the tab and retry logout, or close all tabs and reopen the app. This is not acceptable as primary logout behavior.

## Suggested fix direction
- Make CSRF token handling robust across tabs.
- Before logout, refetch CSRF if the request fails with CSRF-related `403`, then retry once.
- Consider making logout idempotent and not dependent on stale tab-local CSRF state if server policy allows.
- Broadcast auth/session changes between tabs and clear protected UI when logout succeeds elsewhere.

## Status
Confirmed on production for admin/operator navigation session on 2026-05-16; focused admin multi-tab reproduction also confirmed `403` logout failure.
