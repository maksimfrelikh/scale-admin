# BUG-REG-067 — Wave 1 brief specifies QA credentials that do not exist on staging

**Status:** OPEN
**Severity:** medium (process/QA blocker; not a code defect on its own)
**Area:** regression brief authoring / staging fixtures
**Found during:** REGRESSION-2026-05-24 Wave 1 Manager dispatch (2026-05-24 ~12:55 GMT+2)

## Summary
Wave 1 brief (`docs/regression/2026-05-24/blocks/BLOCK-01-auth.md`, lines 35-38) instructs Tester to authenticate using:
- `qa-admin@gmail.com` / `QaRegression123!`
- `qa-operator@gmail.com` / `QaRegression123!`

Neither account exists on staging. The seed (`backend/prisma/seed.js:16-17,147-208`) provisions only `qa-admin@example.com` / `qa-admin12345`, and no operator-role user has ever been seeded. Wave 5 closure SUMMARY (2026-05-20, "Lessons learned" §3) already flagged that an `OPERATOR_SEED_ON_STARTUP=true` toggle was needed, but it has not landed.

## Reproduction
```bash
curl -sS -c /tmp/jar -o /tmp/csrf.json https://staging.maksimfrelikh.ru/api/auth/csrf
TOKEN=$(jq -r .csrfToken /tmp/csrf.json)
curl -sS -b /tmp/jar -H "x-csrf-token: $TOKEN" -H "Content-Type: application/json" \
  -X POST https://staging.maksimfrelikh.ru/api/auth/login \
  --data-binary '{"email":"qa-admin@gmail.com","password":"QaRegression123!"}'
# → 401 {"message":"Неверный email или пароль","error":"Unauthorized","statusCode":401}
```

`GET /api/users` (as logged-in seeded admin) lists exactly: `qorxoes@gmail.com (admin)`, `frelikhmax@gmail.com (admin)`, `qa-admin@example.com (admin)`, `admin@example.com (admin)`. No `qa-admin@gmail.com`, no `qa-operator@gmail.com`, no operator role.

## Impact
- Wave 1 cannot be executed verbatim against the brief.
- Manager substituted `qa-admin@example.com` for admin-side tests and code-review + Wave 5 reuse-policy for operator-side tests. See `docs/regression/2026-05-24/evidence/BLOCK-01/_DEVIATION-credentials.md` for the full substitution map.

## Hypothesis paths
- **(a)** Brief was authored against a planned credential set that was never provisioned. Fix: update the brief to reference the seeded accounts, or out-of-band provision the brief-named accounts before each wave.
- **(b)** Brief was carried over from a prior plan that assumed an operator seed would land. Fix: land `OPERATOR_SEED_ON_STARTUP=true` per Wave 5 lesson §3 + Wave 5 SUMMARY.md "Lessons learned" bullet 3.
- **(c)** Two-doc drift between the brief and `backend/prisma/seed.js`. Fix: pull both files through a regression-brief lint at Lead-dispatch time.

## Acceptance criteria for closure
- Either (i) the brief points at credentials that authenticate against staging on a fresh restage, or (ii) the seed provisions `qa-admin@gmail.com` + `qa-operator@gmail.com` with the brief-stated password, or (iii) Manager AGENTS.md §2 documents the canonical staging accounts explicitly and the brief stops referencing other names.

## Out of scope
- Production credentials. Prod must continue to refuse any QA seed.
