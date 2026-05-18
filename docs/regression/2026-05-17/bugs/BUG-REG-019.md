# BUG-REG-019: Product imageUrl принимает javascript: URL и рендерится в `<img src>` на edit page

- Severity: medium
- Area: api / forms
- Role: admin + operator (operator может создавать products)
- Environment: production https://maksimfrelikh.ru
- Browser/viewport: Chromium 1366x900 (Playwright)
- Found: 2026-05-17 23:08
- Related known: —

## Шаги воспроизведения

1. Авторизоваться admin-ом.
2. `/dashboard#product-create`.
3. Заполнить PLU, Name, Short name валидно.
4. В поле **Image URL** ввести: `javascript:window.__xss_b3=1`.
5. Save product → product создан (201).
6. Открыть `/dashboard#products`, найти созданный товар, нажать **Edit**.

## Ожидаемое

Любой из:
- Backend отклоняет `javascript:` URL: `400 "Image URL must use http or https scheme"`.
- UI отклоняет `javascript:` локально и не отправляет.
- Если значение попало в БД (legacy), preview-рендер обязан фильтровать схему и не подставлять в `src`.

## Фактическое

- POST /api/products → 201 с body содержащим `"imageUrl":"javascript:window.__xss_b3=1"` — backend принимает.
- На странице edit (`/dashboard#product-edit:<id>`) DOM содержит `<img src="javascript:window.__xss_b3=1">` (см. `xss_in_edit_page.imgPreviewSrc`).
- Современный Chromium не исполняет `javascript:` в `<img src>`, поэтому **здесь** payload тихий, но:
  - Значение сохранено в БД и реплицируется во все рендеры product image.
  - Любой будущий компонент, который делает `<a href={imageUrl}>` или открывает картинку в новом окне через `window.open(imageUrl)`, **исполнит** payload.
  - Это defense-in-depth дыра: input должен фильтроваться один раз на сервере, а не полагаться на «вдруг браузер защитит».

## Network / Console

```
POST /api/products
  body: {"defaultPluCode":"92781437","name":"<script>...","shortName":"<img ...>","imageUrl":"javascript:window.__xss_b3=1","unit":"kg","status":"active"}
  → 201 Created
```

## Evidence

- `evidence/block-06/ui-report.json` → `B.xss_submit`, `B.xss_in_edit_page`
- `evidence/block-06/ui-B-xss-list.png`
- `evidence/block-06/ui-B-xss-edit-page.png`

## Hypothesis

В POST/PATCH /api/products imageUrl валидируется только на длину, не на схему. Достаточно whitelist схем (`http:`, `https:`, `data:image/...` если поддерживается) на серверной стороне и на рендер-компонентах (`new URL(imageUrl).protocol`).
