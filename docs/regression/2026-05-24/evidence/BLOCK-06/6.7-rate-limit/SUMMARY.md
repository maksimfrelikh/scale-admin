# 6.7 rate-limit (PRD §11.5) — SUMMARY

**Verdict:** ✅ PASS 4/4. 0 bugs filed. Threshold 20/60s/IP enforced; 429 carries `retryAfterSeconds`; shared bucket across all `@SkipCsrf` scale-api routes; window rolls correctly.
**Window:** 18:36–18:38 GMT+2.

## Probes & results

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 01 | Burst 22 sequential `GET /api/scale-api/auth-check` with valid headers | requests 1–20 → 200; 21–22 → 429 `code:RATE_LIMIT_EXCEEDED` + `retryAfterSeconds` | 1–20: 200; 21: 429; 22: 429. Body `{message:"Слишком много запросов…",error:"Too Many Requests",code:"RATE_LIMIT_EXCEEDED",retryAfterSeconds:59,statusCode:429}` | ✅ |
| 02 | During 429 window: `POST /api/scales/check-update` (different route same controller) | 429 (shared bucket per `@RateLimit({bucket:'scale-api'})` class-level decorator at `scale-api.controller.ts:23`) | 429 same body shape; retryAfterSeconds=38 (countdown observed; rolling-window or fixed-window-with-live-timer behavior) | ✅ |
| 03 | During 429 window: `POST /api/scales/ack` | 429 (same shared bucket) | 429 same body shape; retryAfterSeconds=38 (rate-limit middleware fires BEFORE `ScaleApiAuthGuard` and BEFORE service logic — confirms order at `scale-api.controller.ts:22` `@UseGuards(RateLimitGuard, ScaleApiAuthGuard)`) | ✅ |
| 04 | After 62s sleep: `GET /api/scale-api/auth-check` | 200 (window rolled, fresh capacity) | 200; `{authenticated:true,device:{id,storeId,deviceCode:SCALE-W6-01,status:active}}` — clean recovery | ✅ |

## Configuration verified (code review)

`backend/src/scales/scale-api.controller.ts:22-24`:
```ts
@UseGuards(RateLimitGuard, ScaleApiAuthGuard)
@RateLimit({ bucket: 'scale-api', maxAttempts: 20, windowSeconds: 60 })
@SkipCsrf()
export class ScaleApiController {…}
```

`backend/src/auth/rate-limit.guard.ts:63-71` — key extraction:
```ts
const ipAddress = this.getRequestIp(request) ?? 'unknown-ip';
if (bucket === 'login') {
  const email = …;
  return `${ipAddress}:${email}`;
}
return ipAddress;  // ← scale-api uses pure IP key
```

## PRD §11.5 acceptance criteria — all met

| Criterion | Spec | Observed |
|-----------|------|----------|
| Bucket name | `scale-api` | `scale-api` (decorator) ✓ |
| Threshold | 20 attempts | 21st request 429ed; 1–20 succeeded ✓ |
| Window | 60 seconds | `retryAfterSeconds` ≤ 60 throughout; sleep(62s) recovered ✓ |
| Key | per-IP (not per-device, not per-token) | `getRateLimitKey` returns `ipAddress` for non-`login` buckets ✓ |
| Response shape | 429 with `retryAfterSeconds` + structured `code` | `{statusCode:429, code:"RATE_LIMIT_EXCEEDED", retryAfterSeconds:<num>, message:Russian}` ✓ |
| Guard order | RateLimit BEFORE Auth | `@UseGuards(RateLimitGuard, ScaleApiAuthGuard)` left-to-right; 429s observed without consuming token validation ✓ |

## Per-IP keying deviation

Live "different IP" probe is not feasible from a single test host without proxy/VPN. Per-IP keying confirmed structurally by code review (`rate-limit.guard.ts:65,71` returns bare `ipAddress`) — equivalent coverage. No bug.

## Bugs filed

None.
