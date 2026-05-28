import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { I18nService } from 'nestjs-i18n';
import { getCookie, getHeader } from './cookie.util';
import { CsrfService } from './csrf.service';
import { SKIP_CSRF_METADATA } from './skip-csrf.decorator';
import { getRequestLocale } from '../i18n/coerce-locale';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly csrfService: CsrfService,
    private readonly reflector: Reflector,
    private readonly i18n: I18nService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const skipCsrf = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_METADATA, [context.getHandler(), context.getClass()]);
    if (skipCsrf) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ method?: string; headers?: Record<string, string | string[] | undefined> }>();
    const method = request.method?.toUpperCase() ?? 'GET';
    if (safeMethods.has(method)) {
      return true;
    }

    const cookieToken = getCookie(request, this.csrfService.getCookieName());
    const headerToken = getHeader(request, this.csrfService.getHeaderName());
    if (!this.csrfService.tokensMatch(cookieToken, headerToken)) {
      const lang = getRequestLocale(request.headers);
      throw new ForbiddenException({
        message: this.i18n.t('errors.auth.csrfTokenInvalid', { lang }),
        error: 'Forbidden',
        code: 'CSRF_TOKEN_INVALID',
        statusCode: 403,
      });
    }

    return true;
  }
}
