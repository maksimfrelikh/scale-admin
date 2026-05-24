import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// CatalogPublishingService is @Injectable() with parameter properties — node's
// strip-only runner cannot parse it, so we import the compiled class from
// dist/. Run `npm run build` before this spec.
import { CatalogPublishingService } from '../../dist/publishing/catalog-publishing.service.js';

// BUG-REG-070 — two concurrent POST /api/stores/:storeId/publishing/catalog-publish
// requests for the same store: one wins (201), the loser previously returned
// 500 "Internal server error". DB atomicity was intact (the unique
// constraint on [catalogId, versionNumber] rejected the loser's INSERT),
// but the Prisma error (P2002 unique-violation, or P2034 Serializable
// serialization_failure at COMMIT) bubbled through Nest's default exception
// filter. FIX 3 wraps the $transaction call and converts both P2002 and
// P2034 to ConflictException({code:'CATALOG_VERSION_RACE_CONFLICT'}).
const STORE_ID = '11111111-1111-4111-8111-111111111111';
const CATALOG_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR = { id: '33333333-3333-4333-8333-333333333333' };

function makePrismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(`mock ${code}`, {
    code,
    clientVersion: '6.0.0-mock',
  });
}

function makeValidationService() {
  return {
    validateActiveCatalog: async () => ({
      catalog: {
        id: CATALOG_ID,
        storeId: STORE_ID,
        name: 'Main catalog',
        status: 'active',
        currentVersionId: null,
      },
      canPublish: true,
      blockingErrors: [],
      warnings: [],
      summary: { categoryCount: 0, activePlacementCount: 0, activeBannerCount: 0, catalogVersionCount: 0 },
    }),
  };
}

function makePackageService() {
  return {
    generateActiveCatalogPackage: async () => ({
      packageData: {
        version: { id: null, versionNumber: null, publishedAt: null, checksum: null },
        store: { id: STORE_ID, code: 'S01', name: 'Store 01' },
        catalog: { id: CATALOG_ID, name: 'Main catalog' },
        categories: [],
        advertising: { rotationMode: 'loop', banners: [] },
      },
      packageChecksum: 'draft-checksum',
    }),
    calculatePackageChecksum: () => 'a'.repeat(64),
  };
}

function makeAuditLogs() {
  return { create: async () => ({ id: 'audit-mock' }) };
}

describe('BUG-REG-070 — Prisma P2002 / P2034 → ConflictException CATALOG_VERSION_RACE_CONFLICT', () => {
  for (const code of ['P2002', 'P2034']) {
    it(`converts Prisma ${code} surfaced from $transaction to a 409 with the race-conflict code`, async () => {
      const prisma = {
        $transaction: async () => {
          throw makePrismaError(code);
        },
      };
      const service = new CatalogPublishingService(
        prisma as any,
        makeAuditLogs() as any,
        makeValidationService() as any,
        makePackageService() as any,
      );

      await assert.rejects(
        () => service.publishActiveCatalog(STORE_ID, ACTOR, { ipAddress: '127.0.0.1', userAgent: 'spec' }),
        (err: unknown) => {
          assert.ok(err instanceof ConflictException, `expected ConflictException, got ${(err as Error)?.constructor?.name}`);
          const body = (err as ConflictException).getResponse() as { code?: string; message?: string };
          assert.equal(body.code, 'CATALOG_VERSION_RACE_CONFLICT');
          assert.match(body.message ?? '', /уже опубликовал/);
          return true;
        },
      );
    });
  }

  it('also converts P2002 thrown from inside the transaction callback (immediate unique-constraint violation)', async () => {
    const prisma = {
      $transaction: async (cb: any) => {
        const tx = {
          catalogVersion: {
            aggregate: async () => ({ _max: { versionNumber: 4 } }),
            create: async () => {
              throw makePrismaError('P2002');
            },
          },
          storeCatalog: { update: async () => ({}) },
          auditLog: { create: async () => ({ id: 'a' }) },
        };
        return cb(tx);
      },
    };
    const service = new CatalogPublishingService(
      prisma as any,
      makeAuditLogs() as any,
      makeValidationService() as any,
      makePackageService() as any,
    );

    await assert.rejects(
      () => service.publishActiveCatalog(STORE_ID, ACTOR, {}),
      (err: unknown) => {
        assert.ok(err instanceof ConflictException);
        const body = (err as ConflictException).getResponse() as { code?: string };
        assert.equal(body.code, 'CATALOG_VERSION_RACE_CONFLICT');
        return true;
      },
    );
  });

  it('lets non-race Prisma errors bubble untouched (no false-positive 409 conversion)', async () => {
    const prisma = {
      $transaction: async () => {
        throw makePrismaError('P9999');
      },
    };
    const service = new CatalogPublishingService(
      prisma as any,
      makeAuditLogs() as any,
      makeValidationService() as any,
      makePackageService() as any,
    );

    await assert.rejects(
      () => service.publishActiveCatalog(STORE_ID, ACTOR, {}),
      (err: unknown) => {
        assert.ok(err instanceof Prisma.PrismaClientKnownRequestError, `expected Prisma error to propagate, got ${err}`);
        assert.equal((err as Prisma.PrismaClientKnownRequestError).code, 'P9999');
        return true;
      },
    );
  });

  it('lets non-Prisma errors bubble untouched (e.g., a domain Error inside the callback)', async () => {
    const prisma = {
      $transaction: async () => {
        throw new Error('Simulated publish failure after CatalogVersion creation');
      },
    };
    const service = new CatalogPublishingService(
      prisma as any,
      makeAuditLogs() as any,
      makeValidationService() as any,
      makePackageService() as any,
    );

    await assert.rejects(
      () => service.publishActiveCatalog(STORE_ID, ACTOR, {}),
      /Simulated publish failure/,
    );
  });
});
