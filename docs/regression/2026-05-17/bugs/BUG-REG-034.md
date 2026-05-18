# BUG-REG-034: Plaintext apiToken и password в untracked evidence/scripts

- Severity: critical
- Area: other (process / evidence hygiene)
- Role: n/a (regression process)
- Environment: local репозиторий, ветка `docs/regression-2026-05-17`. **Не закоммичено в git history.**
- Browser/viewport: n/a (filesystem audit)
- Found: 2026-05-18 08:48 CEST (Block 12, sanity sweep)

## Что нашёл

Plaintext production-уровневые секреты в untracked файлах под `docs/regression/2026-05-17/`:

### A. QA password (`<password>`)

Хардкод в:
- `evidence/block-03/admin-invite-trace.json:8` — payload поля `pd`
- `evidence/block-03/admin-mutations-trace.json:11` — поле `reqBody`
- `evidence/block-03/G-revoke-restore.json:14` — поле `reqBody`
- `scripts/block-05-multitab.cjs:6` — пример в docstring (`QA_PASSWORD='<password>'`)
- `scripts/block-07-helpers.sh:25,40` — захардкоженный JSON body в `admin_login` / `op_login`

### B. Plaintext scale apiToken (43 chars, валидные)

В `evidence/block-06/api-report.json` строки 1420, 1447, 1474:
- `WCSLg2KS3WVq9j92YI2YJSWCiPSLPJaw2vWMqChgxbI`
- `pzb2qBeJUP86S02KPy8z7jvxcq4BDxZ5wnUVgaZCFqY`
- `nkJNxb7EfkKlfxM-LoPuZbMPtuboDdcM44khmPtu7h0`

Это apiToken'ы зарегистрированных scale devices с правами на `/api/scales/check-update` etc.

## Impact

- Если эти файлы будут закоммичены — secrets окажутся в публичной истории.
- Любой кто получит токены может выполнять `x-scale-api-token` запросы под этими scale devices до их ротации.
- Нарушение SOUL.md §9 (чистота evidence) и AGENTS.md §1 (запрет коммитить секреты).

Зона риска ограничена: ничего не было `git commit`'ed (проверено `git log --all -S 'QaReg***'`). Все 6 файлов в `git status` как `??` (untracked).

## Что сделано

Все 6 файлов санитизированы прямо в этой сессии:

| Файл | Изменение |
|---|---|
| `evidence/block-03/admin-invite-trace.json` | `<password>` → `***REDACTED***` |
| `evidence/block-03/admin-mutations-trace.json` | то же |
| `evidence/block-03/G-revoke-restore.json` | то же |
| `evidence/block-06/api-report.json` | 3 `apiToken` строки → `"***REDACTED***"` |
| `scripts/block-05-multitab.cjs` | пример `<password>` в docstring заменён на `<password>` плейсхолдер |
| `scripts/block-07-helpers.sh` | хардкод убран, добавлен `: "${QA_PASSWORD:?...}"` guard, тело JSON собирается через `jq` из env |

Повторный grep `'QaReg***\|WCSLg2KS\|pzb2qBe\|nkJNxb7E'` по `docs/regression/2026-05-17/` чисто.

## Рекомендации владельцу (вне scope tester'а)

1. **Перед коммитом этой ветки** — `git status -u` + повторный `grep -riE '(QaReg***|api[_-]?token)' docs/regression/2026-05-17/` чтобы поймать любой новый leak.
2. **Ротация apiToken** для 3 устройств, у которых токен утёк в untracked файл. Hash файла мог попасть в editor swap / inotify watcher / другие процессы — проще сделать `POST /api/scale-devices/:id/regenerate-token` чем доказывать что не утекло.
3. **Pre-commit hook**: `grep -rE '(QaReg***|"apiToken":\s*"[A-Za-z0-9_-]{20,}"|Bearer\s+[A-Za-z0-9_-]+)' docs/regression/ && exit 1` — блокировать коммит если найдено.

## Evidence

- `evidence/block-12/sanity-grep.txt` — финальный sanity grep после редактирования (sanitized).
- `evidence/block-12/leaked-secrets-pre-fix.txt` — список путей и строк (без значений), как они выглядели ДО редактирования.
- Этот файл (BUG-REG-034.md) — единственное место, где сами строки секретов упоминаются (только префиксы 4-5 chars).

## Hypothesis

Block 3 трейсы и Block 6 api-report генерировались Playwright-скриптами, которые echo'или request body / response body в JSON без redaction-фильтра. AGENTS.md TOOLS.md §"HAR / Логи / Маскировать secrets перед коммитом" описывает `sed -E -i` подход, но он не был частью генерации evidence — только пост-обработки. Имеет смысл встроить sanitization прямо в generator-скрипты (writeFileSync через redactor функцию).
