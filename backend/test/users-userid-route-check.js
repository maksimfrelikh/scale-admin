// BUG-REG-058 — GET /api/users/:userId edge-case coverage
//
// Verifies:
//   1. UsersService.getUser('me')                    → NotFoundException
//      (controller pipe converts this to BadRequest before reaching service,
//       but the service must remain robust even if called directly.)
//   2. UsersService.getUser(<non-uuid-string>)       → NotFoundException
//      (non-UUID short-circuits before Prisma; prevents 500 leak.)
//   3. UsersService.getUser(<valid-uuid-not-exist>)  → NotFoundException
//      (Prisma returns null → wrapped as 404, existing behavior preserved.)
//   4. UsersService.getUser(<real-uuid>)             → success
//      (admin lookup path unchanged.)
//   5. ReservedKeywordUserIdPipe.transform('me')     → BadRequestException
//      (controller-layer rejection with /api/auth/session signpost.)
//   6. ReservedKeywordUserIdPipe.transform(<uuid>)   → pass-through.

const assert = require('node:assert/strict');
const { BadRequestException, NotFoundException } = require('@nestjs/common');
const { UsersService } = require('../dist/users/users.service');
const { ReservedKeywordUserIdPipe } = require('../dist/users/reserved-keyword.pipe');
const { AuditLogService } = require('../dist/logs/audit-log.service');

const REAL_USER_ID = 'a3bb189e-8bf9-4888-9912-ace4e6543002';

function buildSetup({ existingUser = null, prismaThrowOnFindFirst = null } = {}) {
  let findFirstCalls = 0;
  const prisma = {
    user: {
      findFirst: async ({ where }) => {
        findFirstCalls += 1;
        if (prismaThrowOnFindFirst) {
          throw prismaThrowOnFindFirst;
        }
        if (existingUser && existingUser.id === where.id) {
          return existingUser;
        }
        return null;
      },
    },
    auditLog: {
      create: async () => ({ id: 'audit-id' }),
    },
    $transaction: async (cb) => cb(prisma),
  };

  const auditLogs = new AuditLogService(prisma);
  const authService = {};
  const service = new UsersService(prisma, authService, auditLogs);

  return { service, findFirstCalls: () => findFirstCalls };
}

function makeUser(overrides = {}) {
  const now = new Date('2026-05-20T10:00:00.000Z');
  return {
    id: REAL_USER_ID,
    email: 'real-admin@example.test',
    emailNormalized: 'real-admin@example.test',
    fullName: 'Real Admin',
    role: 'admin',
    status: 'active',
    emailVerifiedAt: now,
    lastLoginAt: now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

async function expectThrows(fn, ctor) {
  try {
    await fn();
  } catch (err) {
    assert.ok(err instanceof ctor, `expected ${ctor.name}, got ${err.constructor.name}: ${err.message}`);
    return err;
  }
  throw new Error(`expected ${ctor.name} to be thrown`);
}

async function testGetUserMeShortCircuits() {
  // Service must NOT call Prisma with the literal string 'me' — short-circuits to 404.
  const { service, findFirstCalls } = buildSetup();
  await expectThrows(() => service.getUser('me'), NotFoundException);
  assert.equal(findFirstCalls(), 0, "Prisma must not be invoked for non-UUID 'me'");
}

async function testGetUserNonUuidStringShortCircuits() {
  const { service, findFirstCalls } = buildSetup();
  await expectThrows(() => service.getUser('alice'), NotFoundException);
  await expectThrows(() => service.getUser('not-a-uuid'), NotFoundException);
  assert.equal(findFirstCalls(), 0, 'Prisma must not be invoked for non-UUID inputs');
}

async function testGetUserValidUuidNotFound() {
  // Valid UUID format that does not exist in DB → Prisma returns null → 404.
  const { service, findFirstCalls } = buildSetup();
  const RANDOM_UUID = '11111111-2222-3333-4444-555555555555';
  await expectThrows(() => service.getUser(RANDOM_UUID), NotFoundException);
  assert.equal(findFirstCalls(), 1, 'Prisma must be queried for a UUID-shaped id');
}

async function testGetUserRealUuidSucceeds() {
  const { service } = buildSetup({ existingUser: makeUser() });
  const result = await service.getUser(REAL_USER_ID);
  assert.equal(result.user.id, REAL_USER_ID);
  assert.equal(result.user.email, 'real-admin@example.test');
  assert.equal(result.user.role, 'admin');
}

function testPipeRejectsReservedKeyword() {
  const pipe = new ReservedKeywordUserIdPipe();
  for (const keyword of ['me', 'ME', 'Me', 'current', 'self']) {
    let threw = false;
    try {
      pipe.transform(keyword);
    } catch (err) {
      threw = true;
      assert.ok(err instanceof BadRequestException, `expected BadRequestException for ${keyword}`);
      const response = err.getResponse();
      const message = typeof response === 'string' ? response : response.message;
      assert.match(message, /\/api\/auth\/session/, `error must signpost /api/auth/session (got: ${message})`);
    }
    assert.ok(threw, `pipe must reject reserved keyword ${keyword}`);
  }
}

function testPipePassesThroughLegitimateIds() {
  const pipe = new ReservedKeywordUserIdPipe();
  for (const id of [
    REAL_USER_ID,
    '00000000-0000-0000-0000-000000000000',
    'A3BB189E-8BF9-4888-9912-ACE4E6543002',
  ]) {
    assert.equal(pipe.transform(id), id);
  }
}

(async () => {
  await testGetUserMeShortCircuits();
  console.log("  ✓ getUser('me') → NotFoundException without Prisma call (AC-1 backstop)");
  await testGetUserNonUuidStringShortCircuits();
  console.log('  ✓ getUser(<non-uuid>) → NotFoundException without Prisma call (AC-2)');
  await testGetUserValidUuidNotFound();
  console.log('  ✓ getUser(<valid-uuid-not-exist>) → NotFoundException via Prisma null (AC-2)');
  await testGetUserRealUuidSucceeds();
  console.log('  ✓ getUser(<real-uuid>) → 200 with safe user payload (AC-3)');
  testPipeRejectsReservedKeyword();
  console.log('  ✓ ReservedKeywordUserIdPipe rejects me/current/self → 400 with /api/auth/session signpost (AC-1)');
  testPipePassesThroughLegitimateIds();
  console.log('  ✓ ReservedKeywordUserIdPipe passes UUID-shaped ids through unchanged');
  console.log('users-userid-route-check: OK');
})().catch((err) => {
  console.error('users-userid-route-check: FAIL');
  console.error(err);
  process.exit(1);
});
