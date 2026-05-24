import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';

import { RussianParseUUIDPipe } from '../../src/shared/uuid-param.pipe.ts';

// BUG-REG-071 — non-UUID `:id` / `:storeId` / `:productId` etc. path params
// fell through Prisma's value parser to Nest's default 500 "Internal server
// error". FIX 1 (UUID half) applies RussianParseUUIDPipe at controller level
// for every UUID path param so the pipe rejects bad input with a localized
// 400 before service code runs. These specs pin the pipe contract.
describe('BUG-REG-071 — RussianParseUUIDPipe rejects non-UUID, accepts v4', () => {
  const meta = { type: 'param' as const, metatype: String, data: 'storeId' };

  describe('rejects non-UUID input with BadRequestException("Некорректный идентификатор")', () => {
    const REJECT_CASES = [
      'not-a-uuid',
      'not-uuid',
      'foo',
      '',
      '123',
      'me',
      'current',
      'aaa-bbb-ccc-ddd-eee',
      '00000000-0000-0000-0000-00000000000', // 31 hex (one short)
      '00000000-0000-0000-0000-0000000000000', // 33 hex (one long)
      '00000000-0000-0000-0000-000000000000', // nil — valid shape but not v4
      'gggggggg-gggg-4ggg-8ggg-gggggggggggg', // non-hex chars in v4 shape
      '00000000-0000-1000-8000-000000000000', // v1 — pipe is locked to v4
    ];

    for (const value of REJECT_CASES) {
      it(`rejects ${JSON.stringify(value)}`, async () => {
        await assert.rejects(
          () => RussianParseUUIDPipe.transform(value, meta),
          (err: unknown) => {
            assert.ok(err instanceof BadRequestException, `expected BadRequestException, got ${err}`);
            assert.equal((err as BadRequestException).getStatus(), 400);
            // BadRequestException('string') wraps the string into
            // {message, error: 'Bad Request', statusCode: 400}.
            const body = (err as BadRequestException).getResponse() as {
              message?: string;
              error?: string;
              statusCode?: number;
            };
            assert.equal(body.message, 'Некорректный идентификатор');
            assert.equal(body.error, 'Bad Request');
            assert.equal(body.statusCode, 400);
            return true;
          },
        );
      });
    }
  });

  describe('accepts well-formed v4 UUIDs (production shape from Prisma @default(uuid()))', () => {
    const ACCEPT_CASES = [
      '00000000-0000-4000-8000-000000000000',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'ffffffff-ffff-4fff-bfff-ffffffffffff',
      '12345678-1234-4567-8901-123456789abc',
    ];

    for (const value of ACCEPT_CASES) {
      it(`accepts ${value}`, async () => {
        const result = await RussianParseUUIDPipe.transform(value, meta);
        assert.equal(result, value);
      });
    }
  });
});
