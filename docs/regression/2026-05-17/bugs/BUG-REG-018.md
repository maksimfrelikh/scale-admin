# BUG-REG-018: Store create/edit принимает невалидный timezone ("Mars/Olympus") без валидации

- Severity: medium
- Area: api
- Role: admin
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: curl / Playwright
- Found: 2026-05-17 23:05
- Related known: —

## Шаги воспроизведения

1. Авторизоваться admin-ом, получить CSRF, отправить:
   ```
   POST /api/stores
   {"code":"TZ-REG6","name":"x","address":"a","timezone":"Mars/Olympus","status":"active"}
   ```
2. Альтернативно через UI: открыть `/dashboard#store-create`, заполнить поле Timezone значением `Mars/Olympus`, нажать **Save store**.

## Ожидаемое

Любой из:
- 400 с понятным сообщением: "Invalid timezone" / "Timezone must be a valid IANA zone".
- UI inline error на поле Timezone.

## Фактическое

- `POST /api/stores` → **201 Created**.
- Store сохранён с `timezone: "Mars/Olympus"`.
- Никакой backend-валидации формата зоны нет — принимается любая строка.

Пример response:
```json
{"store":{"id":"10d15929-9189-41e4-ba49-597894a4911b","code":"TZ-REG6-1779051975052","name":"n","timezone":"Mars/Olympus","status":"active",...}}
```

## Impact

- Все store-scoped планировщики/cron/timestamp-форматтеры, которые делают `Intl.DateTimeFormat(..., {timeZone: store.timezone})`, упадут на runtime с RangeError.
- Audit log / publishing windows опираются на timezone — некорректное значение может сломать логику публикации.
- Operator/admin не видит ошибку при попытке заведения магазина в малом регионе с опечаткой ("Europe/Mocsow" вместо "Europe/Moscow") — данные тихо записываются.

## Evidence

- `evidence/block-06/api-report.json` → `A.cases[?label=invalid_timezone]`
- `scripts/block-06-api.cjs`

## Hypothesis

Backend схема store позволяет timezone: any non-empty string. Не вызывается `Intl.supportedValuesOf('timeZone').includes(value)` или эквивалент. Достаточно добавить enum-check на серверной валидации.
