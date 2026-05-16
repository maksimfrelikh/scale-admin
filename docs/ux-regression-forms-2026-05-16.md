# UX Regression — Forms and Validation — 2026-05-16

## Scope
Focused frontend UX/runtime regression testing for forms and validation behavior only on production:

- Target: `https://maksimfrelikh.ru`
- Roles tested: Admin and Operator
- Covered: validation messages, required fields, invalid values, duplicate submit/loading state, save/cancel behavior, stale state after errors, dialog cancel behavior, form reset after success, inline edit behavior, backend validation errors in UI, safe simulated network failure display.
- Explicitly not covered: publishing, scale API behavior, full business happy paths beyond reaching forms.

No credentials, passwords, tokens, or secrets are included in this report or evidence.

## Result
**FAIL for tested scope** due to one confirmed Medium UX/runtime validation bug.

Summary from evidence:

- PASS: 31 checks
- FAIL: 1 check
- BLOCKED: 2 checks
- OBSERVED: 1 role-behavior observation
- Confirmed bugs: 1

Primary evidence: `docs/evidence/forms-regression-2026-05-16.json`

## Confirmed bugs

| Bug | Severity | Area | Summary |
|---|---:|---|---|
| `docs/bugs/BUG-UX-001.md` | Medium | Stores / create form | Store create form accepts invalid timezone and persists the store instead of showing validation. |

## Coverage and observations

### Login form
- Required email/password validation displayed correctly.
- HTML5 invalid email validation blocked submit.

### Stores
- Create form required-field validation displayed correctly.
- Duplicate store code backend validation displayed in UI and retained form state.
- Cancel returned to stores list.
- Edit form required-field validation displayed correctly and stayed on edit form.
- Edit cancel returned to store details and discarded invalid input.
- Duplicate-submit/loading state: during a safely simulated network failure, Save became disabled, only one POST was intercepted, and the UI showed a backend-unavailable error.
- **Bug:** invalid timezone was accepted and persisted. See `BUG-UX-001`.

### Products
- Create form required-field validation displayed correctly.
- Invalid GIF image upload was rejected client-side.
- Successful create returned to products list.
- Duplicate PLU backend validation displayed in UI and retained form state.
- Cancel returned to products list.
- Edit form required-field validation displayed correctly and stayed on edit form.
- Refresh recovered product edit form from unsaved invalid/stale state by reloading saved product data.

### Users / invites
- Invite email required validation displayed correctly.
- HTML5 invalid email validation blocked submit.
- Successful invite reset fields.
- Production invite success message did not expose an invite token.

### Catalog categories / placements
- Root category required-name validation displayed correctly.
- Category create reset the root form and showed success notice.
- Placement submit remained disabled until category and product were selected.
- Category archive confirmation dialog was observed; dismissing it kept the edit form open without saving.

### Scale devices
- Required device code/name validation displayed correctly.
- Successful device registration reset fields and showed one-time token notice; token was not captured in evidence.
- Duplicate device code backend validation displayed in UI and retained form state.

### Banners
- Unsupported banner file upload was rejected client-side with an inline error.

### Prices
- Inline price form coverage was **blocked** for the newly created QA store because no placed products/prices were available without expanding into broader catalog-placement/business flow coverage.

### Operator role
- Operator login reached dashboard.
- Operator could not access admin store-create form; route showed assigned stores instead.
- Operator assigned-store detail form coverage was **blocked** because the operator QA account had no visible assigned stores during this run.
- Operator products page create/edit availability was recorded as an observation only; no role expectation was asserted in this forms-focused pass.

## Network/console notes
Expected/induced network observations in evidence include:

- 401 session checks before/after login/logout.
- 409 responses for deliberate duplicate store/product/scale-device submissions.
- One simulated failed store-create request for network failure UX validation.

These were part of the test design unless tied to the confirmed bug above.

## Final assessment
Forms/validation UX is mostly functioning for the tested admin flows, including required fields, duplicate backend errors, loading/disabled state, cancel/reset behavior, and safe network failure messaging.

However, the invalid timezone acceptance is a real production validation gap, so the tested scope is **FAIL** until `BUG-UX-001` is fixed or explicitly accepted.
