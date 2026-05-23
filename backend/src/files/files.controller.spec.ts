import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';

import { RateLimitGuard } from '../../dist/auth/rate-limit.guard.js';
import { RATE_LIMIT_METADATA } from '../../dist/auth/rate-limit.decorator.js';
import { FilesController } from '../../dist/files/files.controller.js';

describe('FilesController — upload rate limiting (BUG-REG-041)', () => {
  it('marks image upload with the upload rate-limit bucket', () => {
    const rateLimit = Reflect.getMetadata(RATE_LIMIT_METADATA, FilesController.prototype.uploadImage);
    assert.deepEqual(rateLimit, { bucket: 'upload' });
  });

  it('applies RateLimitGuard to file uploads', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, FilesController) ?? [];
    assert.ok(guards.includes(RateLimitGuard), 'FilesController must include RateLimitGuard');
  });
});
