// BUG-REG-046 — DELETE /api/users/invites/:inviteId
// Verifies UsersService.cancelInvite: success path, missing-invite 404,
// already-accepted 409, audit log content + redaction.

const assert = require('node:assert/strict');
const { BadRequestException, ConflictException, NotFoundException } = require('@nestjs/common');
const { UsersService } = require('../dist/users/users.service');
const { AuditLogService } = require('../dist/logs/audit-log.service');

const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const INVITE_ID = '11111111-1111-4111-8111-111111111111';

function buildSetup(initialInvite) {
  const auditCreated = [];
  let inviteRow = initialInvite ? { ...initialInvite } : null;

  const prisma = {
    userInvite: {
      findUnique: async ({ where }) => {
        if (inviteRow && inviteRow.id === where.id) return inviteRow;
        return null;
      },
    },
    auditLog: {
      create: async ({ data }) => {
        auditCreated.push(data);
        return { id: 'audit-id', ...data };
      },
    },
    $transaction: async (callback) => {
      const tx = {
        userInvite: {
          delete: async ({ where }) => {
            if (!inviteRow || inviteRow.id !== where.id) {
              throw new Error('record not found');
            }
            const deleted = inviteRow;
            inviteRow = null;
            return deleted;
          },
        },
        auditLog: prisma.auditLog,
      };
      return callback(tx);
    },
  };

  const auditLogs = new AuditLogService(prisma);
  const authService = {};
  const service = new UsersService(prisma, authService, auditLogs);

  return { service, auditCreated, getInviteRow: () => inviteRow };
}

function makeInvite(overrides = {}) {
  return {
    id: INVITE_ID,
    email: 'cancel-target@example.test',
    role: 'operator',
    tokenHash: 'hash-XYZ',
    invitedByUserId: ACTOR_ID,
    expiresAt: new Date('2026-12-31T20:00:00.000Z'),
    acceptedAt: null,
    createdAt: new Date('2026-05-20T09:00:00.000Z'),
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

async function testHappyPath() {
  const { service, auditCreated, getInviteRow } = buildSetup(makeInvite());

  const result = await service.cancelInvite(INVITE_ID, ACTOR_ID, {
    ipAddress: '127.0.0.1',
    userAgent: 'jest-test',
  });

  assert.deepEqual(result, { inviteId: INVITE_ID, cancelled: true });
  assert.equal(getInviteRow(), null, 'invite row should be hard-deleted');

  assert.equal(auditCreated.length, 1, 'one audit log row created');
  const audit = auditCreated[0];
  assert.equal(audit.action, 'user_invite.cancelled');
  assert.equal(audit.entityType, 'UserInvite');
  assert.equal(audit.entityId, INVITE_ID);
  assert.equal(audit.actorUserId, ACTOR_ID);
  assert.equal(audit.ipAddress, '127.0.0.1');
  assert.equal(audit.userAgent, 'jest-test');

  // metadata per PRD: { inviteId, targetEmail, cancelledByUserId }
  assert.deepEqual(audit.metadata, {
    inviteId: INVITE_ID,
    targetEmail: 'cancel-target@example.test',
    cancelledByUserId: ACTOR_ID,
  });

  // beforeData captures snapshot; tokenHash MUST be absent (redacted out of beforeData input)
  assert.ok(audit.beforeData);
  assert.equal(audit.beforeData.email, 'cancel-target@example.test');
  assert.equal(audit.beforeData.role, 'operator');
  assert.ok(typeof audit.beforeData.expiresAt === 'string');
  assert.ok(!('tokenHash' in audit.beforeData), 'tokenHash must never leak into audit beforeData');
}

async function testMissingInvite() {
  const { service } = buildSetup(null);
  await expectThrows(
    () =>
      service.cancelInvite('33333333-3333-4333-8333-333333333333', ACTOR_ID, {
        ipAddress: '127.0.0.1',
        userAgent: 'jest-test',
      }),
    NotFoundException,
  );
}

async function testEmptyInviteId() {
  const { service } = buildSetup(makeInvite());
  await expectThrows(
    () =>
      service.cancelInvite('', ACTOR_ID, {
        ipAddress: '127.0.0.1',
        userAgent: 'jest-test',
      }),
    BadRequestException,
  );
}

async function testAlreadyAccepted() {
  const { service, getInviteRow } = buildSetup(
    makeInvite({ acceptedAt: new Date('2026-05-01T00:00:00.000Z') }),
  );

  await expectThrows(
    () =>
      service.cancelInvite(INVITE_ID, ACTOR_ID, {
        ipAddress: '127.0.0.1',
        userAgent: 'jest-test',
      }),
    ConflictException,
  );
  assert.ok(getInviteRow(), 'accepted invite must not be deleted');
}

(async () => {
  await testHappyPath();
  console.log('  ✓ happy path: delete + audit row + PRD metadata shape');
  await testMissingInvite();
  console.log('  ✓ missing invite → 404 NotFoundException');
  await testEmptyInviteId();
  console.log('  ✓ empty invite id → 400 BadRequestException');
  await testAlreadyAccepted();
  console.log('  ✓ accepted invite → 409 ConflictException, row preserved');
  console.log('users-invite-cancel-check: OK');
})().catch((err) => {
  console.error('users-invite-cancel-check: FAIL');
  console.error(err);
  process.exit(1);
});
