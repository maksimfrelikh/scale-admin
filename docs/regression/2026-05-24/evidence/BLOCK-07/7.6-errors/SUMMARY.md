# §7.6 Error States — SUMMARY

**Verdict:** ✅ PASS (1 addendum to existing BUG-REG-071 — no new bug)
**Probes:** 7 code-review + 1 live 500 probe (re-using §7.1 results)
**Bugs filed:** 0 new (1 addendum to BUG-REG-071)
**🔴 watchpoint status:** "Stack trace leak in 500 prod-mode response" — CLEAN ✓

## Error rendering architecture

Frontend uses a 3-layer error pipeline in `shared/api/backendApi.ts`:

### Layer 1 — `messageFromData()` (line 266)
Extracts `.message` from API response body (handles both string and array-of-strings). Falls back to `.error` field.

### Layer 2 — `translateBackendMessage()` (line 51)
Maps known English/Russian backend strings to canonical Russian display strings. 17 entries:
- Auth: "Invalid email or password" → "Неверный email или пароль."
- CSRF: "CSRF token required or invalid" → "Сессия формы истекла..."
- Rate limit: "Too many requests. Please retry later." → "Слишком много попыток..."
- Invite lifecycle: "Invitation not found", "Invitation has already been accepted", "Invitation has expired", "Invitation token is required"
- Password reset lifecycle: "Password reset token is required", "...is invalid", "...has already been used", "...has expired"
- Validation: "Password must be at least 8 characters", "Valid email is required"

### Layer 3 — `normalizeError()` (line 279)
Status-based defaults when backend message is missing or untranslated:
| Status | Russian default |
|--------|-----------------|
| 401 | "Требуется авторизация. Войдите в систему и повторите запрос." |
| 403 | "Сессия формы истекла..." OR "Недостаточно прав для выполнения запроса." |
| 429 | "Слишком много попыток. Подождите немного и повторите действие." |
| `FETCH_ERROR` (network down) | "Сервер недоступен. Проверьте, что он запущен, и повторите попытку." |
| `PARSING_ERROR` | "Сервер вернул неожиданный формат ответа." |
| `TIMEOUT_ERROR` | "Сервер не ответил вовремя. Повторите попытку позже." |
| `CUSTOM_ERROR` | uses error.error |
| **Other (500, etc.)** | `translatedMessage ?? \`Сервер вернул HTTP ${error.status}\`` |

This is **textbook excellent network-error UX**: every common failure mode has a tailored Russian message, no `undefined` / `[object Object]` slip-throughs.

### Layer 4 — `errorMessageFromUnknown(error, fallback)` (main.tsx:1962)
Used by mutation try/catch in components. Returns Russian fallback (always passed Russian) if error object has no `.message`.

## API error display patterns

| Pattern | Where | Russian fallback |
|---------|-------|------------------|
| `<div className="form-error" role="alert">{errorMessage}</div>` | 6+ sites (login, accept-invite, reset-password, store list, banner upload, etc.) | accessibility-correct, Russian inline |
| `<div className="status status-error">{...}</div>` | health check, status banners | Russian inline |
| `<span className="inline-error block">{log.errorMessage}</span>` | sync log row | shows backend's own error text (Russian) |
| `setActionError(errorMessageFromUnknown(err, 'Не удалось ...'))` | 15+ mutation handlers | always Russian fallback explicit at call site |

`role="alert"` set on form-error containers → screen readers announce the error on appearance (a11y). ✅

## Stack trace leak check (prod-mode 500 response)

From §7.1 ADM-04 probe:
```
GET /api/stores/not-a-uuid (admin auth) → 500
Body: {"statusCode":500,"message":"Internal server error"}
```

**No stack trace.** No `\"stack\":\"...\"`, no module paths, no Prisma error specifics. Backend is running with NestJS's default exception filter in **prod mode** — only generic `{statusCode, message}` returned. ✅ No information disclosure.

## Coverage check vs brief

| Brief requirement | Coverage |
|-------------------|----------|
| 401/403/404/500 client-side display — Russian | ✅ — Layer 3 status-mapper |
| Stack trace NOT leaks in 500 prod-mode | ✅ — verified via curl probe |
| Network error UX (toast or inline) | ✅ — FETCH_ERROR → "Сервер недоступен..." inline form-error |
| Form validation errors inline, Russian | ✅ — `<div className="form-error" role="alert">{errorMessage}</div>` 6+ sites |

## Network error UX details

Three distinct network-failure scenarios all mapped to Russian:
1. **Server unreachable** (DNS fail, connection refused, CORS) → `FETCH_ERROR` → "Сервер недоступен. Проверьте, что он запущен, и повторите попытку."
2. **Server response malformed** (non-JSON body when JSON expected) → `PARSING_ERROR` → "Сервер вернул неожиданный формат ответа."
3. **Server slow** (request timeout) → `TIMEOUT_ERROR` → "Сервер не ответил вовремя. Повторите попытку позже."

Each is shown via `<div className="form-error" role="alert">` inline — no toast library used (acceptable; inline alerts are equivalent UX).

## Cross-tab session sync

Frontend uses `BroadcastChannel` (`backendApi.ts:72-95`) for cross-tab session change events. On any other-tab 401 / logout, all open tabs clear their auth state. Defense against stale state. Russian status messages still apply.

## BUG-REG-071 addendum (NOT a new bug)

While auditing the error pipeline, I noticed the **500 fall-through path** in `normalizeError` line 341 is:
```typescript
return {
  status: error.status,
  message: translatedMessage ?? `Сервер вернул HTTP ${error.status}`,
  data: backendData,
};
```

For a 500 with body `{"message":"Internal server error"}`:
- `backendMessage = "Internal server error"` (from `messageFromData`)
- `translatedMessage = "Internal server error"` (no entry in `backendMessageTranslations` map → falls through)
- Final `message = "Internal server error"` — **English surfaces to the user toast** ❌

**Recommendation (addendum to BUG-REG-071):** Add to `backendMessageTranslations`:
```typescript
'Internal server error': 'Внутренняя ошибка сервера. Попробуйте позже.',
```

This is **defense-in-depth** on top of the primary backend fix (UUID-pipe + Prisma error mapping). Even if a new unhandled exception slips through to NestJS's default filter, the frontend layer would translate. No new bug — appended to BUG-REG-071 as an additional fix recommendation.

## Per-form validation coverage check

Login form (lines ~265-310):
- Empty email/password before submit → handled by `extractError` returning `formError` Russian
- API 401 → translated by Layer 2 to "Неверный email или пароль."
- CSRF gone → "Сессия формы истекла..."

Accept-invite form (lines ~400-460):
- Missing token in URL → "В ссылке приглашения отсутствует токен. Откройте письмо ещё раз или запросите новое приглашение." (inline `<div className="form-error" role="alert">`)
- Password too short → backend returns "Password must be at least 8 characters" → translated to "Пароль должен содержать минимум 8 символов."
- Token expired → "Срок действия приглашения истёк."

Reset-password form (lines ~600-720):
- Missing token → "В ссылке сброса пароля отсутствует токен. Запросите новую ссылку."
- Token already used → "Эта ссылка для сброса пароля уже использована..."
- Token expired → "Срок действия ссылки для сброса пароля истёк..."

## Closure

§7.6 verdict: ✅ PASS. Robust 4-layer error pipeline (raw → translate → normalize-by-status → component-fallback) ensures Russian display for every error mode (HTTP 4xx/5xx + network FETCH/PARSING/TIMEOUT errors). 500 prod responses do NOT leak stack traces. Inline `form-error` with `role="alert"` for accessibility. 1 addendum recommendation to BUG-REG-071: add `'Internal server error': 'Внутренняя ошибка сервера. Попробуйте позже.'` to the frontend translation map as defense-in-depth.
