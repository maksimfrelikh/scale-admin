# BLOCK-12 — Error/Loading + Long-session + Final sweep

- Date: 2026-05-17 (продолжение в 2026-05-18)
- Started: 2026-05-18 08:30 CEST
- Finished: 2026-05-18 08:55 CEST
- Environment: production https://maksimfrelikh.ru
- Accounts: qa-admin@***.invalid, qa-operator@***.invalid (см. AGENTS.md §2)
- Goals: empty/error/loading state coverage, long-session, cache, edge inputs, final evidence sanity sweep, SUMMARY

## Результаты по чек-листу

### A. Empty states

- [x] 1. Dashboard admin — ✅ captured (admin имеет stores; emptyDashboard для нового admin без stores N/A на production). `evidence/block-12/A1-dashboard-admin.png`
- [x] 2. Stores list с фильтром 0 — ⚠️ **Finding**: Stores list НЕ имеет search input. С 49 магазинами это UX-gap, не bug — занесено в SUMMARY как наблюдение. `evidence/block-12/A2-retry-stores-list.png`
- [x] 3. Products с фильтром 0 — ✅ pass. Empty message показан, spinner не залипает. `evidence/block-12/A3-retry-products-empty-filter.png`
- [x] 4. Store Detail нового магазина — ✅ pass на всех секциях (Catalog, Prices, Devices). Spinner не залипает, empty state корректный. `evidence/block-12/A4-store-empty-*`
- [x] 5. Global Logs с фильтром 0 — ✅ pass (фильтр применился, spinner не залипает). Nuance: фильтр через input blur не триггерит мгновенный refetch — нужна явная клавиша Enter / Refresh logs. Не bug, документировано. `evidence/block-12/A5-retry-logs-empty-filter.png`
- [x] 6. Scale Devices когда нет устройств — ✅ pass. `evidence/block-12/A6-scales-empty.png`

### B. Error states (DevTools blocking)

- [x] 7. Offline → login — ✅ pass. Не залипает spinner. `evidence/block-12/B7-offline-login-error.png`
- [x] 8. Offline после login → переход → ✅ pass. Не белый экран. `evidence/block-12/B8-offline-after-login.png`
- [x] 9. Block /api/stores → ✅ pass. После unroute → переход на Products работает. `evidence/block-12/B9-*.png`
- [x] 10. Backend 500 на mutation → ✅ pass (retry). Form data preserved (code+name), error message shown, кнопка active. `evidence/block-12/B10-retry-form-filled.png`, `B10-retry-after-500.png`

### C. Loading states (Slow 3G)

- [x] 11. Каждая страница из A — ✅ pass. Skeleton/spinner присутствует на early-load, исчезает при готовности. Изначальный fail был из-за слишком узкого селектора; retry с расширенным скаут-пулом (включая "Loading..." текст и [aria-busy]) подтвердил всё OK. `evidence/block-12/C11-retry-*.png`
- [x] 12. Mutation на slow 3G — ✅ pass. Submit button → 1 POST к /api/stores даже с тремя последовательными кликами (double-submit заблокирован). `evidence/block-12/C12-retry-*.png`
- [x] 13. Inline edit Prices на slow 3G — ✅ pass. Изменение применяется, восстановлено. `evidence/block-12/C13-retry-*.png`

### D. Long-session

- [x] 14. Polls отсутствуют — ✅ pass. 90с idle на overview = 0 API запросов. Подтверждает Block 5 sanity (там 30с). `evidence/block-12/D14-polling-90s.json`
- [x] 15. Через 60 мин действие → 401 + Login — ✅ pass (simulated via cookie clear). GET /api/stores → 401, нав → /login. `evidence/block-12/D15-after-session-clear-nav.png`. Сценарий BUG-UX-007 (Refresh после invalidate без navigate) — также pass: `D-bugux007-after-refresh-401.png`.

### E. Stale cache

- [x] 16. Hard refresh на Store Detail → ✅ свежие данные. `evidence/block-12/E16-*.png`
- [x] 17. Browser back после mutation → ✅ актуальные данные (визуальная проверка; см. также Block 5 для cross-tab cache nuances в BUG-REG-015/016). `evidence/block-12/E17-after-back.png`

### F. Edge inputs

- [x] 18. Магазин с длинным name (241 char) в Stores list — ✅ pass: name wraps на 5 строк, layout НЕ ломается, badge ACTIVE и actions visible. `evidence/block-12/F18-long-name-zoom.png`
- [x] 19. Категория с длинным name (170 char) в дереве — ✅ pass: name wraps, дерево цело. `evidence/block-12/F19-long-cat-tree.png`

### G. Final evidence sweep (CRITICAL)

- [x] 20. grep `QaReg***|qa-admin@***.invalid|qa-operator@***.invalid` — ❌ **FOUND** 6 plaintext password locations in untracked evidence/scripts. **Все санитизированы** в сессии. Git history clean. → **BUG-REG-034 (CRITICAL)**.
- [x] 21. grep `api[_-]?token|session[_-]?token|secret|bearer` — ❌ **FOUND** 3 plaintext apiTokens (43 chars each) в `evidence/block-06/api-report.json`. **Все санитизированы**. → **BUG-REG-034**.
- [x] 22. HAR sanitize — N/A. 0 HAR-файлов в evidence (использовался Playwright headless, не Chrome DevTools export).
- [x] 23. DevTools cookies/storage в скриншотах — N/A. Все 354 скриншота сняты Playwright без открытого DevTools panel.

### H. Verdict prep

- [x] 24. Таблица багов по severity → SUMMARY.md (critical 1 / high 6 / medium 14 / low 13 = 34 total).
- [x] 25. Top-3 → SUMMARY.md (REG-029, REG-014+017, REG-001+002).

### I. SUMMARY

- [x] 26. `docs/regression/2026-05-17/SUMMARY.md` — создан. Содержит scope, results, bugs, known-bugs status, verdict 🟡 yellow, top-3 + process recommendation.

## Notes

- Создано тестовых сущностей в этой сессии (residual data на production):
  - 1 store с длинным именем: `QA-B12LN-083420` ("QA Block12 Long Name X×220")
  - 1 store от C12 slow-3G теста: `QA-B12C-580001`
  - 1 store от B10 mutation 500 ретрая: НЕ создан (500 ответ заблокировал save) — данные осталиись в форме до Cancel
  - 1 category в FULL_STORE: `c23430b0-beca-4cb8-a34d-4102575b6df1` ("QA Block12 Long Cat C×170")
- Cleanup этих сущностей — на усмотрение manager (могу удалить отдельным шагом по запросу; archive безопаснее delete).
- Сессия завершена сразу после SUMMARY. Финальный heartbeat — в Telegram.
