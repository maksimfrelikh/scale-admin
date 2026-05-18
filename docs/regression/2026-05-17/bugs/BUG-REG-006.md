# BUG-REG-006: Login форма не блокирует submit с пустыми полями (нет клиентской валидации required)

- Severity: low
- Area: auth
- Role: unauth
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: Chromium 1920x1080 (Playwright)
- Found: 2026-05-17 21:05
- Related known: —

## Шаги воспроизведения

1. Открыть https://maksimfrelikh.ru/ в incognito.
2. Не вводить ничего в поля Email и Password.
3. Нажать кнопку Sign in / Login.

## Ожидаемое

Один из:
- Кнопка submit disabled пока поля пустые
- Submit запускает клиентскую валидацию: оба поля помечаются как required, появляются inline ошибки "Email is required" / "Password is required"
- HTTP запрос на `/api/auth/login` НЕ отправляется

## Фактическое

- Кнопка submit активна (`disabled === false`) при пустых полях.
- При клике форма успешно сабмитится: уходит POST /api/auth/login с `{"email":"","password":""}` (видно в Network).
- Backend возвращает 401 "Invalid email or password" — тот же ответ, что на неверные креды.
- Только тогда UI показывает ошибку.

Playwright-проверка `input.validity.valid` после клика на submit при пустых полях:
```
emailValidityAfterEmptySubmit: true
passwordValidityAfterEmptySubmit: true
```
Это значит у input нет атрибута `required`, поэтому браузер не блокирует.

## Impact

- UX: лишний round-trip на сервер для очевидной локальной валидации
- При нестабильной сети пустой submit запускает рейт-лимит (BUG-REG-005 после 1 неверной попытки): пользователь случайно тратит свой лимит
- Не уязвимость, не блокирует флоу, но UX отстаёт от ожиданий MVP-уровня

## Network / Console

```
POST /api/auth/login  -> 401
{"message":"Invalid email or password","error":"Unauthorized","statusCode":401}
```

## Evidence

- evidence/block-02-round2-report.json → `results["C.2"]`
- evidence/block-02-C-form-validation-bad-email.png

## Hypothesis (опционально)

Достаточно добавить `required` на `<input type="email">` и `<input type="password">`, либо проверить состояние формы в onSubmit handler-е и не вызывать API. Поведение для невалидного формата (BUG-REG-006 не воспроизводится для C.3 — `type="email"` работает) уже работает корректно — пустые значения попадают в edge case.
