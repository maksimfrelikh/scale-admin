const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { BadRequestException } = require('@nestjs/common');
const { CatalogPackageService } = require('../dist/publishing/catalog-package.service');
const { CatalogPublishingService } = require('../dist/publishing/catalog-publishing.service');

const storeId = '11111111-1111-1111-1111-111111111111';
const catalogId = '22222222-2222-2222-2222-222222222222';
const user = { id: '33333333-3333-3333-3333-333333333333' };
const basePackageData = {
  version: { id: null, versionNumber: null, publishedAt: null, checksum: null },
  store: { id: storeId, code: 'S01', name: 'Store 01' },
  catalog: { id: catalogId, name: 'Main catalog' },
  categories: [
    { id: 'cat-1', name: 'Fruit', shortName: 'Fruit', sortOrder: 1, items: [{ productId: 'p1', plu: '100', name: 'Apple', shortName: 'Apple', description: null, imageUrl: null, barcode: null, sku: null, unit: 'piece', price: 10, currency: 'RUB', sortOrder: 1 }], children: [] },
  ],
  advertising: { rotationMode: 'loop', banners: [] },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMockPrisma(seed = {}) {
  const state = {
    currentVersionId: seed.currentVersionId ?? 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    versions: clone(seed.versions ?? [
      { id: 'v1', catalogId, storeId, versionNumber: 1, packageChecksum: 'old-1' },
      { id: 'v2', catalogId, storeId, versionNumber: 2, packageChecksum: 'old-2' },
    ]),
    auditLogs: [],
  };

  const tx = {
    catalogVersion: {
      aggregate: async ({ where }) => ({
        _max: {
          versionNumber: Math.max(0, ...state.versions.filter((version) => version.catalogId === where.catalogId).map((version) => version.versionNumber)),
        },
      }),
      create: async ({ data }) => {
        assert(!state.versions.some((version) => version.catalogId === data.catalogId && version.versionNumber === data.versionNumber), 'versionNumber must be unique in catalog');
        const version = { ...data, createdAt: new Date() };
        state.versions.push(version);
        return version;
      },
    },
    storeCatalog: {
      update: async ({ where, data }) => {
        assert.equal(where.id_storeId.id, catalogId);
        assert.equal(where.id_storeId.storeId, storeId);
        state.currentVersionId = data.currentVersionId;
        return { id: catalogId, storeId, currentVersionId: state.currentVersionId };
      },
    },
    auditLog: {
      create: async ({ data }) => {
        state.auditLogs.push(data);
        return { id: `audit-${state.auditLogs.length}`, ...data };
      },
    },
  };

  return {
    state,
    $transaction: async (callback) => {
      const snapshot = clone({ currentVersionId: state.currentVersionId, versions: state.versions, auditLogs: state.auditLogs });
      try {
        return await callback(tx);
      } catch (error) {
        state.currentVersionId = snapshot.currentVersionId;
        state.versions = snapshot.versions;
        state.auditLogs = snapshot.auditLogs;
        throw error;
      }
    },
  };
}

const i18nStub = { t: (key) => key };

function createService({ validation, packageData = basePackageData, prisma = createMockPrisma() } = {}) {
  const packageService = new CatalogPackageService({}, {}, i18nStub);
  const auditLogs = {
    create: async (clientOrArgs, maybeArgs) => {
      const client = maybeArgs ? clientOrArgs : prisma;
      const args = maybeArgs ?? clientOrArgs;
      return client.auditLog.create(args);
    },
  };
  const validationService = {
    calls: 0,
    validateActiveCatalog: async () => {
      validationService.calls += 1;
      return validation ?? {
        catalog: { id: catalogId, storeId, name: 'Main catalog', status: 'active', currentVersionId: prisma.state.currentVersionId },
        canPublish: true,
        blockingErrors: [],
        warnings: [],
        summary: { categoryCount: 1, activePlacementCount: 1, activeBannerCount: 0, catalogVersionCount: prisma.state.versions.length },
      };
    },
  };
  const packageFacade = {
    calls: 0,
    calculatePackageChecksum: packageService.calculatePackageChecksum.bind(packageService),
    generateActiveCatalogPackage: async () => {
      packageFacade.calls += 1;
      return { packageData: clone(packageData), packageChecksum: 'draft-checksum' };
    },
  };
  return { service: new CatalogPublishingService(prisma, auditLogs, validationService, packageFacade, i18nStub), prisma, validationService, packageFacade };
}

async function testValidPublish() {
  const { service, prisma, packageFacade } = createService();
  const result = await service.publishActiveCatalog(storeId, user, { ipAddress: '127.0.0.1', userAgent: 'check' });

  assert.equal(packageFacade.calls, 1);
  assert.equal(result.version.versionNumber, 3);
  assert.equal(prisma.state.currentVersionId, result.version.id);
  assert.equal(result.catalog.previousVersionId, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  assert.equal(result.catalog.currentVersionId, result.version.id);
  assert.equal(result.version.basedOnVersionId, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  assert.equal(typeof result.version.packageChecksum, 'string');
  assert.match(result.version.packageChecksum, /^[a-f0-9]{64}$/);
  assert.equal(result.version.packageData.version.id, result.version.id);
  assert.equal(result.version.packageData.version.versionNumber, 3);
  assert.equal(result.version.packageData.version.checksum, result.version.packageChecksum);
  assert.ok(result.version.packageData.version.publishedAt);
  assert.equal(prisma.state.auditLogs.length, 1);
  assert.equal(prisma.state.auditLogs[0].action, 'catalog_version.published');
  assert.equal(prisma.state.auditLogs[0].entityId, result.version.id);
}

async function testBlockingValidationCreatesNoVersion() {
  const prisma = createMockPrisma();
  const validation = {
    catalog: { id: catalogId, storeId, name: 'Main catalog', status: 'active', currentVersionId: prisma.state.currentVersionId },
    canPublish: false,
    blockingErrors: [{ code: 'ACTIVE_PLACEMENT_PRICE_MISSING', message: 'Missing price' }],
    warnings: [],
    summary: { categoryCount: 1, activePlacementCount: 1, activeBannerCount: 0, catalogVersionCount: prisma.state.versions.length },
  };
  const { service, packageFacade } = createService({ validation, prisma });

  await assert.rejects(
    () => service.publishActiveCatalog(storeId, user, {}),
    (error) => error instanceof BadRequestException && error.getResponse().validation.blockingErrors.length === 1,
  );
  assert.equal(packageFacade.calls, 0);
  assert.equal(prisma.state.versions.length, 2);
  assert.equal(prisma.state.currentVersionId, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  assert.equal(prisma.state.auditLogs.length, 0);
}

async function testRollbackAfterVersionCreate() {
  const prisma = createMockPrisma();
  const { service } = createService({ prisma });

  await assert.rejects(
    () => service.publishActiveCatalog(storeId, user, {}, { failAfterVersionCreate: true }),
    /Simulated publish failure/,
  );
  assert.equal(prisma.state.versions.length, 2, 'CatalogVersion create must roll back');
  assert.equal(prisma.state.currentVersionId, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'currentVersionId must remain unchanged');
  assert.equal(prisma.state.auditLogs.length, 0, 'AuditLog must roll back');
}

function testNoCatalogVersionMutationApi() {
  const controller = fs.readFileSync(path.join(__dirname, '../src/publishing/publishing.controller.ts'), 'utf8');
  assert(!controller.includes('@Patch('), 'publishing controller must not expose PATCH endpoints for CatalogVersion');
  assert(!controller.includes('@Delete('), 'publishing controller must not expose DELETE endpoints for CatalogVersion');
  assert(!/catalog-version[^\n]*(update|delete|patch)/i.test(controller), 'no update/delete CatalogVersion API should be present');
}

(async () => {
  await testValidPublish();
  await testBlockingValidationCreatesNoVersion();
  await testRollbackAfterVersionCreate();
  testNoCatalogVersionMutationApi();
  console.log('PUBLISHING_ATOMIC_CHECK=PASS');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
