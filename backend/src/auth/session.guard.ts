import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';
import { getCookie } from './cookie.util';
import type { AuthenticatedRequest } from './auth.types';
import { getRequestLocale } from '../i18n/coerce-locale';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const sessionToken = getCookie(request, this.authService.getCookieName());
    const lang = getRequestLocale(request.headers);
    const currentSession = await this.authService.getCurrentSession(sessionToken, lang);

    request.user = currentSession.user;
    request.session = currentSession.session;

    return true;
  }
}
