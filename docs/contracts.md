# API contracts — intentional behaviors and design decisions

This file documents API contracts that are **intentional** — design decisions, not bugs. The motivating concern is that several Wave 5 regression stubs were authored against a phantom `AGENTS.md` structure (numbered sections like §6.2, §6.A.email-validation) that does not exist in the repo's `AGENTS.md` file. Pointing those stubs here, instead of at non-existent anchors, gives future agents and contractors a single discoverable home for "yes this is on purpose" answers.

Each section names the originating bug stub for traceability.

## Banner soft-delete contract (per BUG-REG-059)

**Banners have no `DELETE` endpoint by design.** Removal is **soft-delete only**, performed by setting `status: "archived"`.

**Canonical archive route:**

```
PATCH /api/stores/:storeId/advertising/banners/:bannerId/status
Body: { "status": "archived" }
```

The generic update endpoint `PATCH /api/stores/:storeId/advertising/banners/:bannerId` also accepts a `status` field and will perform the archive transition; the dedicated `/status` subroute is preferred for archive operations because it expresses intent and validates only the status transition.

**Implementing controller:** `backend/src/advertising/advertising.controller.ts` — see the `@Patch(':bannerId/status') changeBannerStatus(...)` handler (~line 111) which delegates to `AdvertisingService.changeBannerStatus`.

**Rationale:**

- Preserves audit history for archived banners.
- Supports recovery (an archived banner can be un-archived by transitioning `status` back).
- Avoids cascading FK pain on any reference to the banner row.

**Out of scope (this contract):**

Adding a real `DELETE` endpoint would be a separate PRD decision; it would need cascade rules for FK references, an audit-log entry (action family per [[BUG-REG-056]]), and a FE confirmation dialog distinct from the "archive" action. None of that is in scope here — this section documents the soft-delete-only contract as it stands.

**Cross-references:** [[BUG-REG-059]] originating side finding (Wave 5 closure SUMMARY #5). [[BUG-REG-046]] has a real `DELETE` endpoint for invites; that is an intentionally different contract — invites are not the model for banners.

## Email validation trim-then-validate contract (per BUG-REG-061)

**Invite-email validation trims leading/trailing whitespace before applying the RFC 5322 dot-atom-text regex.** Consequence: leading or trailing whitespace in an email field is **silently accepted** (and stored trimmed). `" a@b.com"` and `"a@b.com "` both pass validation.

**Implementing util:** `backend/src/auth/email-validation.util.ts:16` — `const trimmed = email.trim();` runs before any of the local-part or domain checks (see `validateInviteEmail`).

**Spec coverage:** `backend/src/auth/email-validation.util.spec.ts` already exercises this behavior — predates Wave 5 and was introduced alongside the original RFC-5322 validator stub ([[BUG-REG-039]]).

**Rationale:**

- Friendlier invite UX — admins frequently paste emails copied with stray whitespace; rejecting those would surface as false-positive validation errors.
- Predates Wave 5 — this is the documented behavior of the validator as shipped, not a regression. The Wave 5 closure brief expected whitespace inputs to reject; that brief assumption was the gap, not the code.

**Implications for regression briefs and tests:**

Reject expectations for email validation must apply to inputs that fail **after trim**. A brief that says "leading-space email must reject" is incorrect against the implemented contract — the input is normalized to its trimmed form before validation, so it passes if the trimmed string is a valid RFC-5322 dot-atom-text email.

**Out of scope (this contract):**

A behavior change — tightening the validator to reject leading/trailing whitespace explicitly — would require a PRD decision. It would break the existing user-friendly normalization and could surface as a regression for any user/admin who has historically pasted emails with stray whitespace. Filing as future-work if/when that PRD decision is taken.

**Cross-references:** [[BUG-REG-061]] originating side finding (Wave 5 closure SUMMARY #7). [[BUG-REG-039]] — original email-validator stub; trim-then-validate contract origin.

