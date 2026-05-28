import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { I18nService } from 'nestjs-i18n';
import { AUTH_ROLES_METADATA } from './roles.decorator';
import type { AuthenticatedRequest, UserRole } from './auth.types';
import { getRequestLocale } from '../i18n/coerce-locale';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly i18n: I18nService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(AUTH_ROLES_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user || !requiredRoles.includes(request.user.role)) {
      const lang = getRequestLocale(request.headers);
      throw new ForbiddenException(this.i18n.t('errors.auth.insufficientPermissions', { lang }));
    }

    return true;
  }
}
