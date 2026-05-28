import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CsrfService } from './csrf.service';
import { CurrentUser } from './current-user.decorator';
import { RateLimit } from './rate-limit.decorator';
import { RateLimitGuard } from './rate-limit.guard';
import { RequireRoles } from './roles.decorator';
import { RolesGuard } from './roles.guard';
import { SessionGuard } from './session.guard';
import { getCookie, getHeader } from './cookie.util';
import type { AuthenticatedUser } from './auth.types';

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

type CreateInviteBody = {
  email?: unknown;
  role?: unknown;
  expiresAt?: unknown;
  fullName?: unknown;
  locale?: unknown;
};

type AcceptInviteBody = {
  token?: unknown;
  password?: unknown;
  fullName?: unknown;
};

type RequestPasswordResetBody = {
  email?: unknown;
  locale?: unknown;
};

function coerceEmailLocale(value: unknown): 'ru' | 'en' {
  return value === 'en' ? 'en' : 'ru';
}

type ConfirmPasswordResetBody = {
  token?: unknown;
  password?: unknown;
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly csrfService: CsrfService,
  ) {}

  @Get('csrf')
  getCsrfToken(@Res({ passthrough: true }) response: any) {
    const csrfToken = this.csrfService.issueToken();
    response.cookie(this.csrfService.getCookieName(), csrfToken, this.csrfService.getCookieOptions());

    return {
      csrfToken,
      headerName: this.csrfService.getHeaderName(),
    };
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit({ bucket: 'login' })
  async login(@Body() body: LoginBody, @Req() request: any, @Res({ passthrough: true }) response: any) {
    const result = await this.authService.login(String(body.email ?? ''), String(body.password ?? ''), {
      ipAddress: this.getRequestIp(request),
      userAgent: this.getHeader(request, 'user-agent'),
    });

    response.cookie(result.cookieName, result.sessionToken, result.cookieOptions);

    return {
      user: result.user,
      expiresAt: result.expiresAt.toISOString(),
    };
  }

  @Post('invites')
  @HttpCode(201)
  @UseGuards(SessionGuard, RolesGuard)
  @RequireRoles('admin')
  async createInvite(@Body() body: CreateInviteBody, @Req() request: any, @CurrentUser() user: AuthenticatedUser) {
    return this.authService.createInvite(
      {
        email: String(body.email ?? ''),
        role: String(body.role ?? ''),
        expiresAt: String(body.expiresAt ?? ''),
        fullName: typeof body.fullName === 'string' ? body.fullName : undefined,
        locale: coerceEmailLocale(body.locale),
      },
      user.id,
      {
        ipAddress: this.getRequestIp(request),
        userAgent: this.getHeader(request, 'user-agent'),
      },
    );
  }

  @Post('invites/accept')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit({ bucket: 'invite-accept' })
  async acceptInvite(@Body() body: AcceptInviteBody, @Req() request: any) {
    return this.authService.acceptInvite(
      {
        token: String(body.token ?? ''),
        password: String(body.password ?? ''),
        fullName: typeof body.fullName === 'string' ? body.fullName : undefined,
      },
      {
        ipAddress: this.getRequestIp(request),
        userAgent: this.getHeader(request, 'user-agent'),
      },
    );
  }

  @Post('password-reset/request')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit({ bucket: 'password-reset' })
  async requestPasswordReset(@Body() body: RequestPasswordResetBody, @Req() request: any) {
    return this.authService.requestPasswordReset(
      String(body.email ?? ''),
      {
        ipAddress: this.getRequestIp(request),
        userAgent: this.getHeader(request, 'user-agent'),
      },
      coerceEmailLocale(body.locale),
    );
  }

  @Post('password-reset/confirm')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit({ bucket: 'password-reset' })
  async confirmPasswordReset(@Body() body: ConfirmPasswordResetBody, @Req() request: any) {
    return this.authService.confirmPasswordReset(
      {
        token: String(body.token ?? ''),
        password: String(body.password ?? ''),
      },
      {
        ipAddress: this.getRequestIp(request),
        userAgent: this.getHeader(request, 'user-agent'),
      },
    );
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() request: any, @Res({ passthrough: true }) response: any) {
    const cookieName = this.authService.getCookieName();
    const sessionToken = this.getCookie(request, cookieName);
    const revoked = await this.authService.logout(sessionToken);

    response.clearCookie(cookieName, this.authService.getClearCookieOptions());

    return { revoked };
  }

  @Get('session')
  async getSession(@Req() request: any) {
    const sessionToken = this.getCookie(request, this.authService.getCookieName());
    return this.authService.getCurrentSession(sessionToken);
  }

  private getRequestIp(request: any): string | undefined {
    const forwardedFor = this.getHeader(request, 'x-forwarded-for');
    if (forwardedFor) {
      return forwardedFor.split(',')[0]?.trim();
    }

    return request.ip ?? request.socket?.remoteAddress;
  }

  private getHeader(request: any, name: string): string | undefined {
    return getHeader(request, name);
  }

  private getCookie(request: any, cookieName: string): string | undefined {
    return getCookie(request, cookieName);
  }
}
