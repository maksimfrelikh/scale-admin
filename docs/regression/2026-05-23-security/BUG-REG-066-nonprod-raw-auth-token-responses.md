# BUG-REG-066 — Remove non-production raw invite/reset token responses

Status: implemented in branch bug-reg-066-remove-raw-auth-token-responses; validation passed

## Finding

Production `POST /api/auth/invites` and `POST /api/auth/password-reset/request` responses omit raw tokens, but non-production responses can still include raw invite/reset tokens after email delivery succeeds. This conflicts with a strict reading of "no invite/reset tokens in API responses."

## Why deferred

The current non-production behavior exists to support local/manual verification when `EMAIL_PROVIDER=disabled` performs no real delivery. Removing the raw token response without a replacement would make local invite and reset flows harder to test and could break existing QA scripts.

## Expected follow-up

- Decide the replacement verification path: local SMTP/test mailbox, explicit test-only harness, or DB-seeded one-time test tokens.
- Remove raw `token` fields from invite and password-reset API responses in every environment.
- Update frontend types, local docs, and regression scripts that assume non-production raw-token responses.
- Add a regression check that response keys never include raw invite/reset token fields.

## Implementation notes

- Replacement verification path: backend tests use an explicit test-only email-service harness that captures the outgoing one-time token before delivery; manual end-to-end verification should use a real email provider/test mailbox rather than an API response token.
- Raw `token` fields are removed from invite and password-reset API responses in every environment.
- Frontend types already model the tokenless response shape.
- Regression coverage: `backend/src/auth/auth.service.spec.ts` asserts invite/password-reset responses never include raw auth token fields while the email delivery path still receives the generated token.

## Verification

- `git diff --check` passed.
- `npm --prefix backend run build` passed.
- `node --test --experimental-strip-types 'src/**/*.spec.ts'` passed: 120 tests, 0 failures.
- `npm --prefix frontend run build` passed.
