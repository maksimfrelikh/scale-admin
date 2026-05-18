-- BUG-REG-029 + BUG-REG-027: backfill non-RUB rows + enforce single-RUB whitelist (contract §5).

-- 1. Snapshot non-RUB rows into AuditLog before mutation.
INSERT INTO audit_logs (id, action, "entityType", "entityId", "storeId", "beforeData", "afterData", metadata, "createdAt")
SELECT
  gen_random_uuid(),
  'price.currency_backfilled',
  'StoreProductPrice',
  id,
  "storeId",
  jsonb_build_object('currency', currency, 'price', price, 'status', status),
  jsonb_build_object('currency', 'RUB', 'price', price, 'status', status),
  jsonb_build_object('migration', 'bug-reg-029-currency-enum-backfill', 'productId', "productId"),
  NOW()
FROM store_product_prices
WHERE currency != 'RUB';

-- 2. Backfill non-RUB rows to RUB.
UPDATE store_product_prices SET currency = 'RUB', "updatedAt" = NOW() WHERE currency != 'RUB';

-- 3. Gate D: DB-layer whitelist (named constraint for clean drop/recreate when the enum grows).
ALTER TABLE store_product_prices
  ADD CONSTRAINT store_product_prices_currency_allowed
  CHECK (currency IN ('RUB'));
