const assert = require('node:assert/strict');
const { BadRequestException } = require('@nestjs/common');
const { PricesService } = require('../dist/prices/prices.service');
const { CatalogValidationService } = require('../dist/publishing/catalog-validation.service');
const { ALLOWED_CURRENCIES } = require('../dist/shared/currency');

const storeId = '11111111-1111-1111-1111-111111111111';
const catalogId = '22222222-2222-2222-2222-222222222222';
const productId = '33333333-3333-3333-3333-333333333333';
const placementId = '44444444-4444-4444-4444-444444444444';
const categoryId = '55555555-5555-5555-5555-555555555555';
const priceId = '66666666-6666-6666-6666-666666666666';
const userId = '77777777-7777-7777-7777-777777777777';

function pricesPrismaFor(currency) {
  return {
    storeCatalog: {
      findFirst: async () => ({ id: catalogId, storeId, name: 'Main', status: 'active' }),
    },
    catalogProductPlacement: {
      findFirst: async () => ({ id: placementId }),
    },
    $transaction: async (callback) => {
      const tx = {
        storeProductPrice: {
          findMany: async () => [],
          create: async ({ data }) => ({ id: priceId, ...data, createdAt: new Date(), updatedAt: new Date(), price: data.price }),
          update: async ({ data }) => ({ id: priceId, ...data, createdAt: new Date(), updatedAt: new Date(), price: data.price }),
          updateMany: async () => ({ count: 0 }),
        },
        auditLog: { create: async () => ({}) },
      };
      return callback(tx);
    },
  };
}

async function testRequireCurrencyRejectsNonRub() {
  const auditLogs = { create: async () => ({}) };
  const service = new PricesService(pricesPrismaFor('USD'), auditLogs);

  await assert.rejects(
    () => service.setStoreProductPrice(storeId, { productId, price: 10, currency: 'USD' }, userId, {}),
    (error) => {
      assert.ok(error instanceof BadRequestException, 'expected BadRequestException');
      const body = error.getResponse();
      assert.equal(body.message, 'Currency not supported');
      assert.equal(body.code, 'PRICE_CURRENCY_NOT_SUPPORTED');
      assert.deepEqual(body.allowedCurrencies, ALLOWED_CURRENCIES);
      assert.equal(body.received, 'USD');
      return true;
    },
  );
}

async function testRequireCurrencyAcceptsRub() {
  const auditLogs = { create: async () => ({}) };
  const service = new PricesService(pricesPrismaFor('RUB'), auditLogs);

  const result = await service.setStoreProductPrice(storeId, { productId, price: 10, currency: 'RUB' }, userId, {});
  assert.equal(result.price.currency, 'RUB');
}

async function testRequireCurrencyDefaultsToRub() {
  const auditLogs = { create: async () => ({}) };
  const service = new PricesService(pricesPrismaFor('RUB'), auditLogs);

  const result = await service.setStoreProductPrice(storeId, { productId, price: 10 }, userId, {});
  assert.equal(result.price.currency, 'RUB');
}

async function testRequireCurrencyRejectsEmpty() {
  const auditLogs = { create: async () => ({}) };
  const service = new PricesService(pricesPrismaFor('RUB'), auditLogs);

  await assert.rejects(
    () => service.setStoreProductPrice(storeId, { productId, price: 10, currency: '   ' }, userId, {}),
    (error) => {
      assert.ok(error instanceof BadRequestException);
      const body = error.getResponse();
      assert.equal(body.code, 'PRICE_CURRENCY_NOT_SUPPORTED');
      assert.equal(body.received, null);
      return true;
    },
  );
}

function validationPrismaFor(activePrice) {
  return {
    storeCatalog: {
      findFirst: async () => ({ id: catalogId, storeId, name: 'Main', status: 'active', currentVersionId: null }),
    },
    category: {
      findMany: async () => [
        { id: categoryId, catalogId, parentId: null, name: 'Bread', shortName: 'Bread', sortOrder: 1, status: 'active' },
      ],
    },
    catalogProductPlacement: {
      findMany: async () => [
        {
          id: placementId,
          catalogId,
          categoryId,
          productId,
          sortOrder: 1,
          status: 'active',
          category: { id: categoryId, catalogId, parentId: null, name: 'Bread', shortName: 'Bread', sortOrder: 1, status: 'active' },
          product: { id: productId, defaultPluCode: 'PLU100', name: 'Bagel', shortName: 'Bgl', status: 'active' },
        },
      ],
    },
    storeProductPrice: {
      findMany: async () => [activePrice],
    },
    advertisingBanner: {
      findMany: async () => [],
    },
    catalogVersion: {
      count: async () => 0,
    },
  };
}

async function testValidatePlacementsBlocksNonRub() {
  const service = new CatalogValidationService(validationPrismaFor({ id: priceId, productId, currency: 'USD' }));
  const result = await service.validateActiveCatalog(storeId);

  const currencyIssues = result.blockingErrors.filter((issue) => issue.code === 'PRICE_CURRENCY_NOT_SUPPORTED');
  assert.equal(currencyIssues.length, 1, `expected 1 currency blocking error, got ${result.blockingErrors.length}: ${JSON.stringify(result.blockingErrors)}`);
  const issue = currencyIssues[0];
  assert.equal(issue.entityType, 'StoreProductPrice');
  assert.equal(issue.entityId, priceId);
  assert.equal(issue.metadata.productId, productId);
  assert.equal(issue.metadata.currency, 'USD');
  assert.deepEqual(issue.metadata.allowedCurrencies, ALLOWED_CURRENCIES);
  assert.equal(result.canPublish, false);
}

async function testValidatePlacementsAllowsRub() {
  const service = new CatalogValidationService(validationPrismaFor({ id: priceId, productId, currency: 'RUB' }));
  const result = await service.validateActiveCatalog(storeId);

  const currencyIssues = result.blockingErrors.filter((issue) => issue.code === 'PRICE_CURRENCY_NOT_SUPPORTED');
  assert.equal(currencyIssues.length, 0, `expected no currency errors, got: ${JSON.stringify(currencyIssues)}`);
}

(async () => {
  await testRequireCurrencyRejectsNonRub();
  await testRequireCurrencyAcceptsRub();
  await testRequireCurrencyDefaultsToRub();
  await testRequireCurrencyRejectsEmpty();
  await testValidatePlacementsBlocksNonRub();
  await testValidatePlacementsAllowsRub();
  console.log('CURRENCY_WHITELIST_CHECK=PASS');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
