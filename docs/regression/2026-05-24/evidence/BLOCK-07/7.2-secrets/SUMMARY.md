# §7.2 Secret-Leak Consolidated Audit — SUMMARY

**Verdict:** ✅ PASS (after in-flight remediation)
**Patterns:** 12 strict + 5 bonus = 17 patterns swept across `docs/regression/2026-05-24/` (entire workspace).
**Strict-pattern hits after remediation:** **0 unredacted** (R6, R6b Netscape, R7, R7b, R8, R9, R10, R11, Bearer — all confirmed zero).
**🔴 watchpoint status:** Triggered (7 unredacted session tokens in BLOCK-03 .raw files) → **remediated in-flight** within Wave 7 §7.2: (1) confirmed all 7 sessions already invalidated, (2) defense-in-depth block→unblock on owner user, (3) in-place sed-redact, (4) extended `redact.sh` with Netscape-format pattern.

## What was found and remediated

### Finding 1 — 7 unredacted operator sessions in `BLOCK-03/*.raw` (FIXED)

**Files (now redacted):**
- `evidence/BLOCK-03/3.3-users-access/{18,23,27}-relogin-*.raw`
- `evidence/BLOCK-03/3.6-me-regression/13-relogin.raw`
- `evidence/BLOCK-03/3.7-cross-entity/{02-relogin-grant,05-relogin-after-archive}.raw`
- `evidence/BLOCK-03/3.8-error-consistency/02-relogin-final-probe.raw`

**Owner user (all 7):** operator `unit-cusp-slam@duck.com` (id `da5fc991-346c-4fef-9a0a-026b8c362b7a`)

**Session validity check (before redact):**
- Sessions were captured 2026-05-24 12:15–12:30 GMT (~8h before audit), with 14-day Max-Age.
- **Direct probe with leaked token → 401** before any remediation action. Likely revoked as a natural side-effect of W3's own block/revoke test flow (each `*-after-block`, `*-after-revoke`, `*-after-archive` scenario calls block/revoke which triggers `authService.revokeUserSessions(user.id, ...)` at `users.service.ts:113`).
- Defense-in-depth: admin PATCH `/api/users/da5fc991.../block` then `/unblock` to force-revoke. **All 7 tokens confirmed 401** after block (block invalidates via `revokeUserSessions`).
- Operator restored to status=`active` via unblock.

**Remediation in-place:**
- `sed -E -i 's/(scale_admin[A-Za-z0-9_]*session=)[A-Za-z0-9_\-]+/\1SESSION_VALUE_REDACTED/g'` applied to all 7 files.
- Post-remediation re-grep: 0 unredacted hits across `docs/regression/2026-05-24/` ✓

### Finding 2 — Cookie jars in BLOCK-07 own evidence (PREVENTED)

Live cookie jars created during §7.1 probes (`admin/`, `operator/`, `anon/` cookies.txt in Netscape format) were carrying still-active session tokens for the running wave.

**Action:** Moved to `/tmp/w7r-{admin,operator,anon}-cookies.txt` (chmod 600) **outside evidence dir** — same pattern as W6 `/tmp/scale-token-w6.txt`. Scripts in §7.3+ reference the `/tmp` paths.

### Bonus — `redact.sh` extension (Wave 7)

`scripts/redact.sh` previously handled HTTP `Set-Cookie:` header format. Netscape `cookies.txt` tab-separated rows were not matched. Added 2 lines:

```bash
-e $'s/(scale_admin[A-Za-z0-9_]*session\t)[A-Za-z0-9_\\-]+$/\\1SESSION_VALUE_REDACTED/g' \
-e $'s/(scale_admin[A-Za-z0-9_]*csrf\t)[A-Za-z0-9_\\-]+$/\\1CSRF_VALUE_REDACTED/g' \
```

Verified by piping `/tmp/w7r-admin-cookies.txt` through extended redactor → both cookie values redacted correctly.

## Patterns swept and triage outcomes

| # | Pattern | Hits before remediation | Triage | Hits after |
|---|---------|------------------------|--------|------------|
| R1 | `12345678` (qorxoes test admin pw) | 11 | **Intentional** — documented test admin password in 5 block plans + BUG-REG-071 + brief itself + AGENTS.md. Not a leak (provided by Maksim). | 11 (intentional) |
| R2 | `admin12345` (seed default admin pw) | 6 | **Intentional** — published in `backend/prisma/seed.js:12` as `DEFAULT_ADMIN_PASSWORD`. Documentation of seed setup. | 6 (intentional) |
| R3 | `qa-admin12345` (seed QA admin pw) | 4 | **Intentional** — published in `backend/prisma/seed.js:17` as `DEFAULT_QA_ADMIN_PASSWORD`. Documentation of `_DEVIATION-credentials.md` + BUG-REG-067. | 4 (intentional) |
| R4 | `QaRegression` (brief credential — non-existent user) | 8 | **Not a real credential** — password documented in BUG-REG-067 for user `qa-admin@gmail.com` that does NOT exist on staging. The bug report IS that the user doesn't exist. | 8 (no real credential) |
| R5 | `scale-token-w6` (path ref) | 8 | **Path reference only** — all hits are `/tmp/scale-token-w6.txt` file path, not the token value. Token file deleted in §6.8 cleanup. | 8 (path refs) |
| R6 | `Set-Cookie: scale_admin*_session=...` raw | **7** | **🔴 LEAK** — operator unit-cusp-slam sessions in BLOCK-03 .raw files. Confirmed all 401 before remediation; force-revoked + redacted. | **0** ✓ |
| R6b | Netscape tab-separated session | 0 | None outside BLOCK-07 own jars (those moved to /tmp). | **0** ✓ |
| R7 | `scale_admin*_csrf=...` raw HTTP form | 0 | — | **0** ✓ |
| R7b | Netscape tab-separated csrf | 0 | None outside BLOCK-07 own jars. | **0** ✓ |
| R8 | `x-csrf-token: <raw>` header | 0 | — | **0** ✓ |
| R9 | `"apiToken":"<raw>"` JSON | 0 | All API tokens redacted at write-time via redact.sh pipeline in W6. | **0** ✓ |
| R10 | `x-scale-api-token: <raw>` header | 0 | All redacted via redact.sh. | **0** ✓ |
| R11 | invite/reset `"token":"<raw>"` JSON | 0 | All redacted via redact.sh. | **0** ✓ |
| R12 | `"password":"<value>"` JSON | 2 | Both are intentional bug-repro examples (BUG-REG-067 = non-existent user, BUG-REG-071 = documented qorxoes pw). | 2 (intentional) |
| Bonus R13 | `cookies.txt` files | 3 (BLOCK-07 only) | Moved to /tmp (Finding 2). | 0 in evidence ✓ |
| Bonus R14 | Netscape session tab-sep | 0 outside BLOCK-07 | — | 0 ✓ |
| Bonus R15 | Netscape csrf tab-sep | 0 outside BLOCK-07 | — | 0 ✓ |
| Bonus R16 | `SESSION=...`, `TOKEN=...` bash assignment | 0 | — | 0 ✓ |
| Bonus R17 | `Bearer <token>` | 0 | App is cookie-based, no Bearer auth. | 0 ✓ |

## Strict-pattern final consolidated grep

```
=== R6 raw session cookies ===                   0
=== R6b Netscape-format tab-sep sessions ===     0
=== R7 raw csrf cookies ===                      0
=== R7b Netscape-format tab-sep csrf ===         0
=== R8 'x-csrf-token: ' raw ===                  0
=== R9 apiToken JSON non-redacted ===            0
=== R10 x-scale-api-token header non-redacted == 0
=== R11 invite/reset token JSON non-redacted === 0
=== Bearer-style tokens ===                      0
```

Full output saved at `final-strict-grep.txt`.

## Why no bug filed

The leak is now remediated and the tokens were already revoked at audit time (by W3's natural flow). The gap is **process-shaped, not code-shaped**: BLOCK-03 saved `.raw` files without piping through `redact.sh`, while BLOCK-01 and BLOCK-02 (which used `.headers` files with redaction) did the right thing. No code fix needed — just discipline in evidence-write pipeline. `redact.sh` is now extended to handle Netscape format as defense-in-depth.

If filing were required, it would be **info-level** (audit-policy lessons learned), not bug-tracker material. Documented here as a process-quality lesson for future waves: every wave-evidence file should be either piped through `redact.sh` OR demonstrably free of credentials before disk write.

## Closure

§7.2 verdict: ✅ PASS. 1 live-credential leak found (7 already-revoked operator sessions in BLOCK-03), immediately remediated (block→unblock + in-place sed). `redact.sh` extended with Netscape pattern. Consolidated re-grep shows **0 unredacted live credentials** across the entire regression workspace (intentional documented test passwords excluded per their public visibility in `seed.js` + brief).

## §7.2 addendum — wave-closure re-sweep (3rd remediation pass)

A final wave-closure secret-grep (during Wave 7 close-out) caught **3 unredacted CSRF tokens** in `evidence/BLOCK-07/7.1-i18n/{admin,operator,anon}/csrf.json` that were saved raw (not piped through `redact.sh`). The strict-pattern sweep above missed them because §7.2's Netscape/HTTP-form patterns targeted cookie shapes, not bare JSON `csrfToken` response bodies — even though `redact.sh` itself already had the `"csrfToken":"…"` → `CSRF_TOKEN_REDACTED` substitution since W6.

**Risk assessment:** Practically unusable in isolation — matching session cookies were held in `/tmp/w7r-{admin,operator,anon}-cookies.txt` (outside evidence per Finding 2) and the operator session cookie was force-revoked by the block→unblock at audit time. CSRF token alone without session cookie = no exploit path.

**Remediation (in-place sed via redact.sh pipeline, same pattern as Finding 1):**

```
for f in evidence/BLOCK-07/7.1-i18n/{admin,operator,anon}/{,07-}csrf.json; do
  bash scripts/redact.sh < "$f" > "$f.tmp" && mv "$f.tmp" "$f"
done
```

**Post-remediation re-verification:**
```
grep -rE 'csrfToken[^A-Z]*:[ ]*"[A-Za-z0-9_\-]{16,}"' evidence/ | grep -v REDACTED
→ 0 unredacted hits ✓
```

**Process lesson:** any evidence file (`.json`, `.raw`, `.txt`) MUST be piped through `redact.sh` at write-time. Wave 7 §7.1 admin/operator/anon csrf.json files were captured via direct `curl -o`, bypassing the redactor. Same root cause as Finding 1's BLOCK-03 `.raw` files. Mitigation already in place: redact.sh handles `"csrfToken"` substitution — just need to USE it consistently. Recommended cron-style verifier: every wave-close `find evidence/ -newer _startprobe -type f | xargs grep -lE 'csrfToken[^A-Z]*:[ ]*"[A-Za-z0-9_\-]{16,}"'` as a final gate.

§7.2 final verdict remains: ✅ PASS. **Cumulative live-credential leaks found and remediated: 10** (7 BLOCK-03 sessions + 3 BLOCK-07 CSRF tokens). All practically unusable at remediation time; all redacted; redactor scripts unchanged-but-now-disciplined.
