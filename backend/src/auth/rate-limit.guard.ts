import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { I18nService } from 'nestjs-i18n';
import { RATE_LIMIT_METADATA, RateLimitRequirement } from './rate-limit.decorator';
import { RateLimitService } from './rate-limit.service';
import { getHeader } from './cookie.util';
import { getRequestLocale } from '../i18n/coerce-locale';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
    private readonly i18n: I18nService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requirement = this.reflector.getAllAndOverride<RateLimitRequirement>(RATE_LIMIT_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requirement) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      ip?: string;
      socket?: { remoteAddress?: string };
      headers?: Record<string, string | string[] | undefined>;
      body?: { email?: unknown; token?: unknown };
    }>();

    const key = this.getRateLimitKey(request, requirement.bucket);
    const result = this.rateLimitService.check(
      requirement.bucket,
      key,
      requirement.maxAttempts,
      requirement.windowSeconds,
    );

    if (!result.allowed) {
      const lang = getRequestLocale(request.headers);
      throw new HttpException(
        {
          message: this.i18n.t('errors.auth.rateLimitExceeded', { lang }),
          error: 'Too Many Requests',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfterSeconds: result.retryAfterSeconds,
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
        },
        HttpStatus.TOO_MANY_REQUESTS,
        { description: 'Rate limit exceeded' },
      );
    }

    return true;
  }

  private getRateLimitKey(
    request: {
      ip?: string;
      socket?: { remoteAddress?: string };
      headers?: Record<string, string | string[] | undefined>;
      body?: { email?: unknown; token?: unknown };
    },
    bucket: string,
  ): string {
    const ipAddress = this.getRequestIp(request) ?? 'unknown-ip';
    if (bucket === 'login') {
      const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : 'unknown-email';
      return `${ipAddress}:${email}`;
    }

    return ipAddress;
  }

  private getRequestIp(request: {
    ip?: string;
    socket?: { remoteAddress?: string };
    headers?: Record<string, string | string[] | undefined>;
  }): string | undefined {
    const forwardedFor = getHeader(request, 'x-forwarded-for');
    if (forwardedFor) {
      return forwardedFor.split(',')[0]?.trim();
    }

    return request.ip ?? request.socket?.remoteAddress;
  }
}
