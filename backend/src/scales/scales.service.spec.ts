import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// ScalesService and AuditLogService use @Injectable() + parameter properties
// that node's TypeScript strip-only test runner cannot parse, so we import
// the compiled classes from dist/. Same approach as backend/test/*.js check
// scripts.
import { ScalesService } from '../../dist/scales/scales.service.js';
import { AuditLogService } from '../../dist/logs/audit-log.service.js';

describe('ScalesService — BUG-REG-063 (constructor auditLogs default)', () => {
  it('constructs without an explicit auditLogs arg and exposes a working AuditLogService', () => {
    const prisma = {} as never;
    const service = new ScalesService(prisma);
    const auditLogs = (service as unknown as { auditLogs: unknown }).auditLogs;
    assert.ok(
      auditLogs instanceof AuditLogService,
      'auditLogs must default to an AuditLogService instance so that ' +
        'this.auditLogs.create(...) inside acknowledgeScaleCatalogVersion ' +
        'does not throw "Cannot read properties of undefined (reading \'create\')" ' +
        '(dist/scales/scales.service.js:322 pre-fix throw site).',
    );
  });

  it('uses the injected auditLogs when both constructor args are provided (DI path unchanged)', () => {
    const prisma = {} as never;
    const injected = new AuditLogService(prisma);
    const service = new ScalesService(prisma, injected);
    const auditLogs = (service as unknown as { auditLogs: unknown }).auditLogs;
    assert.equal(
      auditLogs,
      injected,
      'NestJS DI passes both args; the default must not override the injected instance.',
    );
  });

  it('acknowledgeScaleCatalogVersion writes an audit log row when constructed with prisma only', async () => {
    const versionId = '33333333-3333-4333-8333-333333333333';
    const deviceId = '22222222-2222-4222-8222-222222222222';
    const storeId = '11111111-1111-4111-8111-111111111111';
    const state = {
      device: { id: deviceId, storeId, currentCatalogVersionId: null, lastSyncAt: null },
      logs: [] as Array<Record<string, unknown>>,
      auditLogs: [] as Array<Record<string, unknown>>,
    };
    const prisma = {
      catalogVersion: {
        findFirst: async () => ({ id: versionId, versionNumber: 8, packageChecksum: 'checksum' }),
      },
      $transaction: async (cb: (tx: Record<string, unknown>) => Promise<unknown>) =>
        cb({
          scaleDevice: {
            update: async ({ data }: { data: Record<string, unknown> }) => {
              Object.assign(state.device, data);
              return state.device;
            },
          },
          scaleSyncLog: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              state.logs.push(data);
              return data;
            },
          },
          auditLog: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              state.auditLogs.push(data);
              return data;
            },
          },
        }),
    } as never;

    const service = new ScalesService(prisma);
    const result = await service.acknowledgeScaleCatalogVersion(
      { id: deviceId, storeId },
      { versionId, status: 'success' },
      { ipAddress: '127.0.0.1', userAgent: 'spec' },
    );

    assert.equal(result.acknowledged, true);
    assert.equal(state.auditLogs.length, 1, 'success ACK must write exactly one audit log row');
    assert.equal(state.auditLogs[0].action, 'scale_device.catalog_version_acknowledged');
  });
});
