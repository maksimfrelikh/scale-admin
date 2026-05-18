const assert = require('node:assert/strict');
const { BadRequestException } = require('@nestjs/common');
const { CatalogService } = require('../dist/catalog/catalog.service');

const storeId = '11111111-1111-1111-1111-111111111111';
const catalogId = '22222222-2222-2222-2222-222222222222';

const parentCategoryId = 'aaaaaaaa-0000-0000-0000-000000000001';
const childCategoryId = 'aaaaaaaa-0000-0000-0000-000000000002';
const activeCategoryId = 'aaaaaaaa-0000-0000-0000-000000000003';
const archivedCategoryId = 'aaaaaaaa-0000-0000-0000-000000000004';

const productActiveId = 'bbbbbbbb-0000-0000-0000-000000000001';
const productArchivedId = 'bbbbbbbb-0000-0000-0000-000000000002';

const placementActiveOnArchivedProductId = 'cccccccc-0000-0000-0000-000000000001';
const placementArchivedId = 'cccccccc-0000-0000-0000-000000000002';

const now = new Date('2026-05-18T00:00:00.000Z');

function buildCatalog() {
  return { id: catalogId, storeId, name: 'Main', status: 'active' };
}

function makeAuditLogs() {
  return { create: async () => ({}) };
}

function categoryRecord(overrides = {}) {
  return {
    id: 'cat-id',
    catalogId,
    parentId: null,
    name: 'Default',
    shortName: 'Def',
    sortOrder: 0,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function placementRecord(overrides = {}) {
  return {
    id: 'pl-id',
    catalogId,
    categoryId: activeCategoryId,
    productId: productActiveId,
    sortOrder: 0,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    category: { id: activeCategoryId, name: 'Active Cat', shortName: 'AC', status: 'active' },
    product: { id: productActiveId, defaultPluCode: 'PLU001', name: 'Active Product', shortName: 'AP', status: 'active' },
    ...overrides,
  };
}

function categoriesPrismaFromList(rows) {
  return {
    storeCatalog: { findFirst: async () => buildCatalog() },
    category: {
      findMany: async ({ where }) => {
        let result = rows.filter((row) => row.catalogId === where.catalogId);
        if (where.status !== undefined) {
          result = result.filter((row) => row.status === where.status);
        }
        return result.slice().sort((a, b) => {
          const ap = a.parentId ?? '';
          const bp = b.parentId ?? '';
          if (ap !== bp) {
            return ap.localeCompare(bp);
          }
          if (a.sortOrder !== b.sortOrder) {
            return a.sortOrder - b.sortOrder;
          }
          return a.name.localeCompare(b.name);
        });
      },
    },
  };
}

function placementsPrismaFromList(rows) {
  return {
    storeCatalog: { findFirst: async () => buildCatalog() },
    catalogProductPlacement: {
      findMany: async ({ where }) => {
        let result = rows.filter((row) => row.catalogId === where.catalogId);
        if (where.status !== undefined) {
          result = result.filter((row) => row.status === where.status);
        }
        if (where.categoryId !== undefined) {
          result = result.filter((row) => row.categoryId === where.categoryId);
        }
        if (where.product && where.product.status !== undefined) {
          result = result.filter((row) => row.product && row.product.status === where.product.status);
        }
        if (where.category && where.category.status !== undefined) {
          result = result.filter((row) => row.category && row.category.status === where.category.status);
        }
        return result;
      },
    },
  };
}

async function placementsTransitiveLeakActive() {
  const rows = [
    placementRecord({
      id: placementActiveOnArchivedProductId,
      status: 'active',
      productId: productArchivedId,
      product: { id: productArchivedId, defaultPluCode: 'PLU002', name: 'Archived Product', shortName: 'AR', status: 'archived' },
    }),
  ];
  const service = new CatalogService(placementsPrismaFromList(rows), makeAuditLogs());
  const result = await service.listPlacements(storeId, { status: 'active' });
  assert.equal(
    result.placements.length,
    0,
    `placements-transitive-leak-active: expected 0 placements, got ${result.placements.length}`,
  );
}

async function placementsArchivedNoTransitive() {
  const rows = [
    placementRecord({
      id: placementArchivedId,
      status: 'archived',
    }),
  ];
  const service = new CatalogService(placementsPrismaFromList(rows), makeAuditLogs());
  const result = await service.listPlacements(storeId, { status: 'archived' });
  assert.equal(
    result.placements.length,
    1,
    `placements-archived-no-transitive: expected 1 placement (transitive must NOT apply to archived), got ${result.placements.length}`,
  );
}

async function categoriesOrphanPromotionActive() {
  const rows = [
    categoryRecord({ id: parentCategoryId, parentId: null, name: 'Parent (archived)', status: 'archived', sortOrder: 0 }),
    categoryRecord({ id: childCategoryId, parentId: parentCategoryId, name: 'Child (active)', status: 'active', sortOrder: 0 }),
  ];
  const service = new CatalogService(categoriesPrismaFromList(rows), makeAuditLogs());
  const result = await service.listCategoryTree(storeId, { status: 'active' });
  assert.equal(
    result.categories.length,
    1,
    `categories-orphan-promotion-active: expected 1 root, got ${result.categories.length}`,
  );
  assert.equal(
    result.categories[0].id,
    childCategoryId,
    `categories-orphan-promotion-active: expected child promoted to root, got ${result.categories[0].id}`,
  );
}

async function categoriesFilterIgnoredPreFixNowApplied() {
  const rows = [
    categoryRecord({ id: activeCategoryId, name: 'Active', status: 'active', sortOrder: 0 }),
    categoryRecord({ id: archivedCategoryId, name: 'Archived', status: 'archived', sortOrder: 1 }),
  ];
  const service = new CatalogService(categoriesPrismaFromList(rows), makeAuditLogs());
  const result = await service.listCategoryTree(storeId, { status: 'active' });
  assert.equal(
    result.categories.length,
    1,
    `categories-filter-ignored-pre-fix-now-applied: expected 1 category, got ${result.categories.length}`,
  );
  assert.equal(
    result.categories[0].id,
    activeCategoryId,
    `categories-filter-ignored-pre-fix-now-applied: expected active category, got ${result.categories[0].id}`,
  );
}

async function negativeInvalidStatusCategories() {
  const rows = [categoryRecord({ id: activeCategoryId, name: 'Active', status: 'active' })];
  const service = new CatalogService(categoriesPrismaFromList(rows), makeAuditLogs());
  await assert.rejects(
    () => service.listCategoryTree(storeId, { status: 'invalid' }),
    (error) => {
      assert.ok(
        error instanceof BadRequestException,
        `negative-invalid-status-categories: expected BadRequestException, got ${error && error.constructor && error.constructor.name}`,
      );
      return true;
    },
    'negative-invalid-status-categories: expected listCategoryTree to throw on invalid status',
  );
}

async function negativeInvalidStatusPlacements() {
  const service = new CatalogService(placementsPrismaFromList([]), makeAuditLogs());
  await assert.rejects(
    () => service.listPlacements(storeId, { status: 'invalid' }),
    (error) => {
      assert.ok(
        error instanceof BadRequestException,
        `negative-invalid-status-placements: expected BadRequestException, got ${error && error.constructor && error.constructor.name}`,
      );
      return true;
    },
    'negative-invalid-status-placements: expected listPlacements to throw on invalid status',
  );
}

const fixtures = [
  ['placements-transitive-leak-active', placementsTransitiveLeakActive],
  ['placements-archived-no-transitive', placementsArchivedNoTransitive],
  ['categories-orphan-promotion-active', categoriesOrphanPromotionActive],
  ['categories-filter-ignored-pre-fix-now-applied', categoriesFilterIgnoredPreFixNowApplied],
  ['negative-invalid-status-categories', negativeInvalidStatusCategories],
  ['negative-invalid-status-placements', negativeInvalidStatusPlacements],
];

(async () => {
  let passed = 0;
  let failed = 0;
  for (const [name, fn] of fixtures) {
    try {
      await fn();
      console.log(`PASS  ${name}`);
      passed += 1;
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      console.log(`FAIL  ${name}: ${message}`);
      failed += 1;
    }
  }
  console.log('');
  console.log(`${passed}/${fixtures.length} passed, ${failed} failed`);
  console.log(failed === 0 ? 'CATALOG_STATUS_FILTER_CHECK=PASS' : 'CATALOG_STATUS_FILTER_CHECK=FAIL');
  process.exit(failed === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
