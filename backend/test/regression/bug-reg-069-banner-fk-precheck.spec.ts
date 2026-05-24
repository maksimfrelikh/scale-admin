import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';

// AdvertisingService is @Injectable() with parameter properties — node's
// TypeScript strip-only runner cannot parse it, so we import the compiled
// class from dist/. Run `npm run build` before this spec.
import { AdvertisingService } from '../../dist/advertising/advertising.service.js';

// BUG-REG-069 — POST/PATCH advertising banner with a syntactically-valid but
// nonexistent imageFileAssetId fell through Prisma P2003 FK constraint to a
// generic 500 "Internal server error". FIX 1 (FK precheck half) calls
// prisma.fileAsset.findUnique() in advertising.service before the write and
// throws BadRequestException(code=FILE_ASSET_NOT_FOUND) when missing.
const ACTOR_ID = '00000000-0000-4000-8000-000000000099';
const STORE_ID = '11111111-1111-4111-8111-111111111111';
const REAL_FILE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOGUS_FILE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type SeedFileAsset = { id: string };

function createMockPrisma(seedFileAssets: SeedFileAsset[]) {
  const state = {
    banners: [] as any[],
    fileAssets: [...seedFileAssets],
    auditLogs: [] as any[],
    fileAssetLookups: [] as string[],
  };

  const advertisingBannerRoot = {
    findFirst: async ({ where }: any) =>
      state.banners.find((b) => b.id === where.id && b.storeId === where.storeId) ?? null,
  };

  function makeTx() {
    return {
      advertisingBanner: {
        create: async ({ data }: any) => {
          const banner = {
            id: 'banner-' + (state.banners.length + 1),
            createdAt: new Date(),
            updatedAt: new Date(),
            sortOrder: 0,
            ...data,
          };
          state.banners.push(banner);
          return banner;
        },
        update: async ({ where, data }: any) => {
          const banner = state.banners.find((b) => b.id === where.id);
          if (!banner) throw new Error(`banner ${where.id} not found in mock`);
          Object.assign(banner, data, { updatedAt: new Date() });
          return banner;
        },
      },
      auditLog: {
        create: async ({ data }: any) => {
          state.auditLogs.push(data);
          return { id: 'audit-' + state.auditLogs.length, ...data };
        },
      },
    };
  }

  return {
    state,
    prisma: {
      fileAsset: {
        findUnique: async ({ where }: any) => {
          state.fileAssetLookups.push(where.id);
          return state.fileAssets.find((fa) => fa.id === where.id) ?? null;
        },
      },
      advertisingBanner: advertisingBannerRoot,
      $transaction: async (cb: any) => cb(makeTx()),
    },
  };
}

function makeAuditLogs() {
  return {
    create: async (clientOrArgs: any, maybeArgs?: any) => {
      const args = maybeArgs ?? clientOrArgs;
      const client = maybeArgs ? clientOrArgs : null;
      if (client) {
        return client.auditLog.create(args);
      }
      return { id: 'audit-x', ...args.data };
    },
  };
}

describe('BUG-REG-069 — advertising banner imageFileAssetId FK precheck', () => {
  describe('createBanner', () => {
    it('rejects bogus imageFileAssetId with 400 FILE_ASSET_NOT_FOUND and does NOT touch the DB write path', async () => {
      const { prisma, state } = createMockPrisma([{ id: REAL_FILE }]);
      const service = new AdvertisingService(prisma as any, makeAuditLogs() as any);

      await assert.rejects(
        () =>
          service.createBanner(
            STORE_ID,
            {
              imageUrl: 'https://example.com/x.png',
              imageFileAssetId: BOGUS_FILE,
            },
            ACTOR_ID,
            {},
          ),
        (err: unknown) => {
          assert.ok(err instanceof BadRequestException, `expected BadRequestException, got ${err}`);
          const body = (err as BadRequestException).getResponse() as { code?: string; message?: string };
          assert.equal(body.code, 'FILE_ASSET_NOT_FOUND');
          assert.match(body.message ?? '', /imageFileAssetId.*отсутствующий файл/);
          return true;
        },
      );

      // FK precheck ran (prisma.fileAsset.findUnique called once with the bogus id)…
      assert.deepEqual(state.fileAssetLookups, [BOGUS_FILE]);
      // …and the create path was never reached (no banner row, no audit log).
      assert.equal(state.banners.length, 0);
      assert.equal(state.auditLogs.length, 0);
    });

    it('accepts a valid imageFileAssetId (FK present) and creates the banner', async () => {
      const { prisma, state } = createMockPrisma([{ id: REAL_FILE }]);
      const service = new AdvertisingService(prisma as any, makeAuditLogs() as any);

      const { banner } = await service.createBanner(
        STORE_ID,
        {
          imageUrl: 'https://example.com/x.png',
          imageFileAssetId: REAL_FILE,
        },
        ACTOR_ID,
        {},
      );

      assert.equal(banner.storeId, STORE_ID);
      assert.equal(banner.imageFileAssetId, REAL_FILE);
      assert.deepEqual(state.fileAssetLookups, [REAL_FILE]);
      assert.equal(state.banners.length, 1);
      assert.equal(state.auditLogs.length, 1);
    });

    it('skips the FK precheck when imageFileAssetId is omitted (no DB lookup)', async () => {
      const { prisma, state } = createMockPrisma([]);
      const service = new AdvertisingService(prisma as any, makeAuditLogs() as any);

      const { banner } = await service.createBanner(
        STORE_ID,
        { imageUrl: 'https://example.com/y.png' },
        ACTOR_ID,
        {},
      );

      assert.equal(banner.imageFileAssetId, null);
      assert.equal(state.fileAssetLookups.length, 0);
      assert.equal(state.banners.length, 1);
    });
  });

  describe('updateBanner (parity with createBanner)', () => {
    it('rejects bogus imageFileAssetId with 400 FILE_ASSET_NOT_FOUND on update too', async () => {
      const { prisma, state } = createMockPrisma([{ id: REAL_FILE }]);
      const service = new AdvertisingService(prisma as any, makeAuditLogs() as any);

      // Seed an existing banner so findBanner() (which runs before precheck) succeeds.
      const created = await service.createBanner(
        STORE_ID,
        { imageUrl: 'https://example.com/x.png', imageFileAssetId: REAL_FILE },
        ACTOR_ID,
        {},
      );

      // Reset lookups so we measure just the update path.
      state.fileAssetLookups.length = 0;

      await assert.rejects(
        () =>
          service.updateBanner(
            STORE_ID,
            created.banner.id,
            { imageFileAssetId: BOGUS_FILE },
            ACTOR_ID,
            {},
          ),
        (err: unknown) => {
          assert.ok(err instanceof BadRequestException);
          const body = (err as BadRequestException).getResponse() as { code?: string };
          assert.equal(body.code, 'FILE_ASSET_NOT_FOUND');
          return true;
        },
      );

      assert.deepEqual(state.fileAssetLookups, [BOGUS_FILE]);
      // The existing banner's imageFileAssetId is unchanged.
      assert.equal(state.banners[0].imageFileAssetId, REAL_FILE);
    });

    it('does NOT run the FK precheck when imageFileAssetId is not part of the update payload', async () => {
      const { prisma, state } = createMockPrisma([{ id: REAL_FILE }]);
      const service = new AdvertisingService(prisma as any, makeAuditLogs() as any);

      const created = await service.createBanner(
        STORE_ID,
        { imageUrl: 'https://example.com/x.png', imageFileAssetId: REAL_FILE },
        ACTOR_ID,
        {},
      );

      state.fileAssetLookups.length = 0;

      await service.updateBanner(
        STORE_ID,
        created.banner.id,
        { sortOrder: 5 },
        ACTOR_ID,
        {},
      );

      assert.equal(state.fileAssetLookups.length, 0);
    });

    it('clearing imageFileAssetId to null skips the FK lookup', async () => {
      const { prisma, state } = createMockPrisma([{ id: REAL_FILE }]);
      const service = new AdvertisingService(prisma as any, makeAuditLogs() as any);

      const created = await service.createBanner(
        STORE_ID,
        { imageUrl: 'https://example.com/x.png', imageFileAssetId: REAL_FILE },
        ACTOR_ID,
        {},
      );

      state.fileAssetLookups.length = 0;

      await service.updateBanner(
        STORE_ID,
        created.banner.id,
        { imageFileAssetId: null },
        ACTOR_ID,
        {},
      );

      assert.equal(state.fileAssetLookups.length, 0);
      assert.equal(state.banners[0].imageFileAssetId, null);
    });
  });
});
