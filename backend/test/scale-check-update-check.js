const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ScalesService } = require('../dist/scales/scales.service');

const storeId = '11111111-1111-4111-8111-111111111111';
const deviceId = '22222222-2222-4222-8222-222222222222';
const currentVersionId = '33333333-3333-4333-8333-333333333333';
const oldVersionId = '44444444-4444-4444-8444-444444444444';
const unknownVersionId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const publishedPackageData = {
  version: { id: currentVersionId, versionNumber: 7, checksum: 'published-checksum' },
  products: [{ plu: '100', name: 'Published apple' }],
};
const workingChanges = { products: [{ plu: '999', name: 'UNPUBLISHED DRAFT' }] };

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMockPrisma() {
  const state = {
    devices: [{ id: deviceId, storeId, lastSeenAt: null, lastSyncAt: null }],
    logs: [],
    activeCatalog: {
      id: '55555555-5555-4555-8555-555555555555',
      storeId,
      status: 'active',
      currentVersionId,
      currentVersion: {
        id: currentVersionId,
        versionNumber: 7,
        packageChecksum: 'published-checksum',
        packageData: clone(publishedPackageData),
      },
    },
    catalogVersions: [{ id: currentVersionId }, { id: oldVersionId }],
    workingChanges: clone(workingChanges),
  };

  const tx = {
    scaleDevice: {
      update: async ({ where, data }) => {
        const device = state.devices.find((item) => item.id === where.id);
        assert.ok(device, 'device must exist');
        Object.assign(device, data);
        return { ...device };
      },
    },
    scaleSyncLog: {
      create: async ({ data }) => {
        const log = { id: `log-${state.logs.length + 1}`, ...data, createdAt: new Date() };
        state.logs.push(log);
        return log;
      },
    },
  };

  return {
    state,
    storeCatalog: {
      findFirst: async ({ where, orderBy, select }) => {
        assert.deepEqual(where, { storeId, status: 'active' });
        assert.deepEqual(orderBy, { createdAt: 'asc' });
        assert.ok(select.currentVersion.select.packageData, 'published CatalogVersion.packageData must be selected');
        return clone(state.activeCatalog);
      },
    },
    catalogVersion: {
      findUnique: async ({ where, select }) => {
        assert.ok(where && typeof where.id === 'string', 'catalogVersion.findUnique must filter by id');
        assert.deepEqual(select, { id: true }, 'pre-check must only select id');
        const found = state.catalogVersions.find((item) => item.id === where.id);
        return found ? { id: found.id } : null;
      },
    },
    $transaction: async (callback) => callback(tx),
  };
}

async function testUpdateAvailableDeliversPublishedPackageAndLogs() {
  const prisma = createMockPrisma();
  const service = new ScalesService(prisma);
  const result = await service.checkScaleUpdate(
    { id: deviceId, storeId },
    oldVersionId,
    { ipAddress: '127.0.0.1', userAgent: 'scale-test' },
  );

  assert.equal(result.hasUpdate, true);
  assert.equal(result.versionId, currentVersionId);
  assert.equal(result.versionNumber, 7);
  assert.equal(result.packageChecksum, 'published-checksum');
  assert.deepEqual(result.packageData, publishedPackageData);
  assert.equal(JSON.stringify(result.packageData).includes('UNPUBLISHED DRAFT'), false, 'working changes must not leak');
  assert.ok(prisma.state.devices[0].lastSeenAt instanceof Date, 'lastSeenAt must be updated');
  assert.equal(prisma.state.devices[0].lastSyncAt, null, 'check-update must not ACK/update lastSyncAt');
  assert.equal(prisma.state.logs.length, 1);
  assert.equal(prisma.state.logs[0].status, 'package_delivered');
  assert.equal(prisma.state.logs[0].requestedVersionId, oldVersionId);
  assert.equal(prisma.state.logs[0].deliveredVersionId, currentVersionId);
  assert.equal(prisma.state.logs[0].requestIp, '127.0.0.1');
  assert.equal(prisma.state.logs[0].userAgent, 'scale-test');
  assert.equal(JSON.stringify(prisma.state.logs).includes('apiToken'), false, 'logs must not include apiToken');
}

async function testNoUpdateLogsNoUpdate() {
  const prisma = createMockPrisma();
  const service = new ScalesService(prisma);
  const result = await service.checkScaleUpdate({ id: deviceId, storeId }, currentVersionId, {});

  assert.deepEqual(result, { hasUpdate: false, currentVersionId });
  assert.ok(prisma.state.devices[0].lastSeenAt instanceof Date, 'lastSeenAt must be updated');
  assert.equal(prisma.state.logs.length, 1);
  assert.equal(prisma.state.logs[0].status, 'no_update');
  assert.equal(prisma.state.logs[0].requestedVersionId, currentVersionId);
  assert.equal(prisma.state.logs[0].deliveredVersionId, null);
}

function testPublicRouteIsExposedAtRequiredPath() {
  const controller = fs.readFileSync(path.join(__dirname, '../src/scales/scale-api.controller.ts'), 'utf8');
  assert(controller.includes("@Post('scales/check-update')"), 'POST /api/scales/check-update must be exposed');
}

async function testUnknownRequestedVersionIdTreatedAsStale() {
  const prisma = createMockPrisma();
  const service = new ScalesService(prisma);
  const result = await service.checkScaleUpdate(
    { id: deviceId, storeId },
    unknownVersionId,
    { ipAddress: '127.0.0.1', userAgent: 'scale-test' },
  );

  assert.equal(result.hasUpdate, true, 'unknown requestedVersionId must be treated as stale (hasUpdate=true)');
  assert.equal(result.versionId, currentVersionId);
  assert.deepEqual(result.packageData, publishedPackageData, 'must deliver published packageData');
  assert.ok(prisma.state.devices[0].lastSeenAt instanceof Date, 'lastSeenAt must be updated');
  assert.equal(prisma.state.logs.length, 1, 'audit row must be written, not lost to rollback');
  const log = prisma.state.logs[0];
  assert.equal(log.status, 'package_delivered');
  assert.equal(log.requestedVersionId, null, 'unknown id must be nulled to avoid FK violation');
  assert.equal(log.deliveredVersionId, currentVersionId);
  assert.ok(typeof log.errorMessage === 'string' && log.errorMessage.includes(unknownVersionId),
    'errorMessage must preserve the original unknown UUID');
  assert.ok(log.errorMessage.startsWith('unknown requestedVersionId:'),
    'errorMessage must use the agreed prefix');
}

(async () => {
  await testUpdateAvailableDeliversPublishedPackageAndLogs();
  await testNoUpdateLogsNoUpdate();
  await testUnknownRequestedVersionIdTreatedAsStale();
  testPublicRouteIsExposedAtRequiredPath();
  console.log('SCALE_CHECK_UPDATE_CHECK=PASS');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
