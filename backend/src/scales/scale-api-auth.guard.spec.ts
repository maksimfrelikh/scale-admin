import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UnauthorizedException } from '@nestjs/common';

import { ScaleApiAuthGuard } from '../../dist/scales/scale-api-auth.guard.js';

function executionContext(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  };
}

describe('ScaleApiAuthGuard — credential sources (BUG-REG-041)', () => {
  it('accepts Scale API credentials from headers', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const device = {
      id: '22222222-2222-4222-8222-222222222222',
      storeId: '11111111-1111-4111-8111-111111111111',
      deviceCode: 'SCALE-001',
      status: 'active',
    };
    const guard = new ScaleApiAuthGuard({
      authenticateScaleApiRequest: async (deviceCode: string, apiToken: string, context: Record<string, unknown>) => {
        calls.push({ deviceCode, apiToken, context });
        return deviceCode === 'SCALE-001' && apiToken === 'secret-token'
          ? { authenticated: true, device }
          : { authenticated: false };
      },
    }, { t: (key: string) => key } as never);
    const request: Record<string, unknown> = {
      headers: {
        'x-scale-device-code': 'SCALE-001',
        'x-scale-api-token': 'secret-token',
        'x-forwarded-for': '203.0.113.10, 127.0.0.1',
        'user-agent': 'scale-guard-spec',
      },
      ip: '127.0.0.1',
    };

    assert.equal(await guard.canActivate(executionContext(request) as never), true);
    assert.deepEqual(request.scaleDevice, device);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].deviceCode, 'SCALE-001');
    assert.equal(calls[0].apiToken, 'secret-token');
    assert.deepEqual(calls[0].context, {
      ipAddress: '203.0.113.10',
      userAgent: 'scale-guard-spec',
    });
  });

  it('ignores Scale API credentials in query strings', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const guard = new ScaleApiAuthGuard({
      authenticateScaleApiRequest: async (deviceCode: string, apiToken: string, context: Record<string, unknown>) => {
        calls.push({ deviceCode, apiToken, context });
        return { authenticated: false };
      },
    }, { t: (key: string) => key } as never);
    const request = {
      headers: {},
      query: {
        deviceCode: 'SCALE-001',
        apiToken: 'secret-token',
      },
      ip: '127.0.0.1',
    };

    await assert.rejects(
      () => guard.canActivate(executionContext(request) as never),
      (error) => error instanceof UnauthorizedException && error.response?.code === 'SCALE_API_AUTH_FAILED',
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].deviceCode, '');
    assert.equal(calls[0].apiToken, '');
    assert.equal(JSON.stringify(request).includes('secret-token'), true, 'fixture still models a query-string token');
    assert.equal(request.scaleDevice, undefined);
  });
});
