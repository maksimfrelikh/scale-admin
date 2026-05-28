import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../logs/audit-log.service';
import { EmailService, type EmailLocale } from '../email/email.service';
import type { AppConfiguration } from '../config/app.config';
import { DUMMY_CREDENTIAL } from './dummy-credential';
import { hashPassword, verifyPassword } from './password.util';
import { createSessionToken, hashSessionToken } from './session-token.util';
import { createInviteToken, hashInviteToken } from './invite-token.util';
import { validateInviteEmail } from './email-validation.util';
import { createPasswordResetToken, hashPasswordResetToken } from './password-reset-token.util';
import type { AuthenticatedUser } from './auth.types';

type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

type UserCredentialForLogin = {
  failedLoginCount: number;
  lockedUntil: Date | null;
};

type CookieOptions = {
  httpOnly: boolean;
  sameSite: 'lax' | 'strict';
  secure: boolean;
  path: string;
  maxAge: number;
};

type CreateInviteInput = {
  email: string;
  role: string;
  expiresAt: string;
  fullName?: string;
  locale?: EmailLocale;
};

type AcceptInviteInput = {
  token: string;
  password: string;
  fullName?: string;
};

type ConfirmPasswordResetInput = {
  token: string;
  password: string;
};

@Injectable()
export class AuthService {
  private readonly appConfig: AppConfiguration;
  private readonly idleTimeoutMs: number;
  private readonly absoluteTimeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogService,
    configService: ConfigService,
    private readonly emails: EmailService,
  ) {
    this.appConfig = configService.getOrThrow<AppConfiguration>('app');
    this.idleTimeoutMs = this.appConfig.sessionIdleTimeoutMinutes * 60 * 1000;
    this.absoluteTimeoutMs = this.appConfig.sessionAbsoluteTimeoutDays * 24 * 60 * 60 * 1000;
  }

  getCookieName(): string {
    return this.appConfig.sessionCookieName;
  }

  getCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.appConfig.nodeEnv === 'production',
      path: '/',
      maxAge: this.absoluteTimeoutMs,
    };
  }

  getClearCookieOptions(): Omit<CookieOptions, 'maxAge'> {
    const { maxAge: _maxAge, ...options } = this.getCookieOptions();
    return options;
  }

  async login(email: string, password: string, context: RequestContext) {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail || typeof password !== 'string' || password.length === 0) {
      await this.logLoginAttempt(null, normalizedEmail, false, 'invalid_request', context);
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        emailNormalized: normalizedEmail,
        deletedAt: null,
      },
      include: {
        credential: true,
      },
    });

    if (!user || user.status !== 'active' || !user.credential) {
      // Burn the same pbkdf2 work as the existing-user path so response
      // latency does not leak account-existence (BUG-REG-068). Result is
      // ignored — this path always 401s.
      verifyPassword(password, DUMMY_CREDENTIAL);
      await this.logLoginAttempt(null, normalizedEmail, false, 'invalid_credentials', context);
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const now = new Date();
    if (user.credential.lockedUntil && user.credential.lockedUntil > now) {
      await this.logLoginAttempt(user.id, normalizedEmail, false, 'locked', context);
      this.throwLoginThrottled(user.credential.lockedUntil);
    }

    const passwordValid = verifyPassword(password, user.credential);
    if (!passwordValid) {
      await this.recordFailedLogin(user.id, user.credential, now);
      await this.logLoginAttempt(user.id, normalizedEmail, false, 'invalid_credentials', context);
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const sessionToken = createSessionToken();
    const sessionTokenHash = hashSessionToken(sessionToken);
    const expiresAt = new Date(now.getTime() + this.absoluteTimeoutMs);

    await this.prisma.$transaction(async (tx) => {
      await tx.userCredential.update({
        where: { userId: user.id },
        data: {
          failedLoginCount: 0,
          lastFailedLoginAt: null,
          lockedUntil: null,
        },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: now },
      });
      const session = await tx.userSession.create({
        data: {
          userId: user.id,
          sessionTokenHash,
          createdAt: now,
          lastUsedAt: now,
          expiresAt,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
      await this.auditLogs.create(tx, {
        data: {
          actorUserId: user.id,
          action: 'auth.login_succeeded',
          entityType: 'UserSession',
          entityId: session.id,
          afterData: {
            userId: user.id,
            expiresAt: expiresAt.toISOString(),
          },
          metadata: {
            emailNormalized: normalizedEmail,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    });

    return {
      sessionToken,
      cookieName: this.getCookieName(),
      cookieOptions: this.getCookieOptions(),
      user: this.toSafeUser(user),
      expiresAt,
    };
  }

  private async logLoginAttempt(
    actorUserId: string | null,
    emailNormalized: string,
    success: boolean,
    reason: string,
    context: RequestContext,
  ) {
    await this.auditLogs.create({
      data: {
        actorUserId,
        action: success ? 'auth.login_succeeded' : 'auth.login_failed',
        entityType: 'AuthLogin',
        entityId: actorUserId ?? null,
        afterData: {
          success,
        },
        metadata: {
          emailNormalized: emailNormalized || null,
          reason,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
  }

  async getCurrentSession(sessionToken: string | undefined) {
    if (!sessionToken) {
      throw new UnauthorizedException('Требуется авторизация');
    }

    const sessionTokenHash = hashSessionToken(sessionToken);
    const session = await this.prisma.userSession.findUnique({
      where: { sessionTokenHash },
      include: { user: true },
    });

    if (!session || session.revokedAt) {
      throw new UnauthorizedException('Требуется авторизация');
    }

    const now = new Date();
    if (session.expiresAt <= now) {
      await this.revokeSessionById(session.id, 'absolute_timeout');
      throw new UnauthorizedException('Требуется авторизация');
    }

    const lastUsedAt = session.lastUsedAt ?? session.createdAt;
    if (now.getTime() - lastUsedAt.getTime() > this.idleTimeoutMs) {
      await this.revokeSessionById(session.id, 'idle_timeout');
      throw new UnauthorizedException('Требуется авторизация');
    }

    if (session.user.deletedAt || session.user.status !== 'active') {
      await this.revokeSessionById(session.id, 'user_inactive');
      throw new UnauthorizedException('Требуется авторизация');
    }

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { lastUsedAt: now },
    });

    return {
      session: {
        id: session.id,
        createdAt: session.createdAt,
        lastUsedAt: now,
        expiresAt: session.expiresAt,
      },
      user: this.toSafeUser(session.user),
    };
  }

  async logout(sessionToken: string | undefined): Promise<boolean> {
    if (!sessionToken) {
      return false;
    }

    const sessionTokenHash = hashSessionToken(sessionToken);
    const session = await this.prisma.userSession.findUnique({ where: { sessionTokenHash } });
    if (!session || session.revokedAt) {
      return false;
    }

    await this.revokeSessionById(session.id, 'logout');
    return true;
  }

  async createInvite(input: CreateInviteInput, actorUserId: string | undefined, context: RequestContext) {
    const email = this.requireValidInviteEmail(input.email);
    const emailNormalized = this.normalizeEmail(email);
    const role = this.requireRole(input.role);
    const expiresAt = this.requireDate(input.expiresAt, 'expiresAt');
    const token = createInviteToken();
    const tokenHash = hashInviteToken(token);

    const existingUser = await this.prisma.user.findFirst({
      where: {
        emailNormalized,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    const invite = await this.prisma.$transaction(async (tx) => {
      const createdInvite = await tx.userInvite.create({
        data: {
          email,
          role,
          tokenHash,
          invitedByUserId: actorUserId,
          expiresAt,
        },
      });

      await this.auditLogs.create(tx, {
        data: {
          actorUserId,
          action: 'user_invite.created',
          entityType: 'UserInvite',
          entityId: createdInvite.id,
          afterData: {
            email,
            role,
            expiresAt: expiresAt.toISOString(),
          },
          metadata: {
            emailNormalized,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return createdInvite;
    });

    try {
      await this.emails.sendInviteEmail({
        to: invite.email,
        token,
        expiresAt: invite.expiresAt,
        locale: input.locale,
      });
    } catch {
      await this.deleteUndeliveredInvite(invite.id);
      throw new ServiceUnavailableException('Не удалось отправить письмо с приглашением. Повторите попытку позже.');
    }

    return {
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt.toISOString(),
        acceptedAt: invite.acceptedAt?.toISOString() ?? null,
        createdAt: invite.createdAt.toISOString(),
      },
      ...(this.appConfig.nodeEnv === 'production' ? {} : { token }),
    };
  }

  async acceptInvite(input: AcceptInviteInput, context: RequestContext) {
    const token = this.requireToken(input.token);
    const password = this.requirePassword(input.password);
    const tokenHash = hashInviteToken(token);
    const now = new Date();

    const invite = await this.prisma.userInvite.findUnique({ where: { tokenHash } });
    if (!invite) {
      throw new NotFoundException('Приглашение не найдено');
    }
    if (invite.acceptedAt) {
      throw new ConflictException('Приглашение уже принято');
    }
    if (invite.expiresAt <= now) {
      throw new BadRequestException('Срок действия приглашения истёк');
    }

    const emailNormalized = this.normalizeEmail(invite.email);
    const fullName = this.requireFullName(input.fullName, invite.email);
    const passwordData = hashPassword(password);

    const result = await this.prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findFirst({
        where: {
          emailNormalized,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (existingUser) {
        throw new ConflictException('Пользователь с таким email уже существует');
      }

      const acceptedInvite = await tx.userInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: now },
      });

      const user = await tx.user.create({
        data: {
          email: invite.email,
          emailNormalized,
          emailVerifiedAt: now,
          fullName,
          role: invite.role,
          status: 'active',
          createdByUserId: invite.invitedByUserId,
        },
      });

      await tx.userCredential.create({
        data: {
          userId: user.id,
          ...passwordData,
          passwordChangedAt: now,
        },
      });

      await this.auditLogs.create(tx, {
        data: {
          actorUserId: user.id,
          action: 'user_invite.accepted',
          entityType: 'UserInvite',
          entityId: acceptedInvite.id,
          afterData: {
            userId: user.id,
            email: user.email,
            role: user.role,
            acceptedAt: now.toISOString(),
          },
          metadata: {
            emailNormalized,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return { user, invite: acceptedInvite };
    });

    return {
      user: this.toSafeUser(result.user),
      invite: {
        id: result.invite.id,
        email: result.invite.email,
        role: result.invite.role,
        expiresAt: result.invite.expiresAt.toISOString(),
        acceptedAt: result.invite.acceptedAt?.toISOString() ?? null,
      },
    };
  }

  async requestPasswordReset(emailInput: string, context: RequestContext, locale?: EmailLocale) {
    const email = this.requireEmail(emailInput);
    const emailNormalized = this.normalizeEmail(email);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.appConfig.passwordResetTokenTtlMinutes * 60 * 1000);

    const user = await this.prisma.user.findFirst({
      where: {
        emailNormalized,
        deletedAt: null,
        status: 'active',
      },
      select: { id: true, email: true },
    });

    if (!user) {
      return {
        accepted: true,
        tokenExpiresAt: expiresAt.toISOString(),
      };
    }

    const token = createPasswordResetToken();
    const tokenHash = hashPasswordResetToken(token);
    const resetToken = await this.prisma.$transaction(async (tx) => {
      const createdToken = await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });

      await this.auditLogs.create(tx, {
        data: {
          actorUserId: user.id,
          action: 'password_reset.requested',
          entityType: 'PasswordResetToken',
          entityId: createdToken.id,
          afterData: {
            userId: user.id,
            expiresAt: expiresAt.toISOString(),
          },
          metadata: {
            emailNormalized,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return createdToken;
    });

    try {
      await this.emails.sendPasswordResetEmail({
        to: user.email,
        token,
        expiresAt: resetToken.expiresAt,
        locale,
      });
    } catch {
      await this.deleteUndeliveredPasswordResetToken(resetToken.id);
      throw new ServiceUnavailableException('Не удалось отправить письмо для сброса пароля. Повторите попытку позже.');
    }

    return {
      accepted: true,
      tokenExpiresAt: resetToken.expiresAt.toISOString(),
      ...(this.appConfig.nodeEnv === 'production' ? {} : { token }),
    };
  }

  async confirmPasswordReset(input: ConfirmPasswordResetInput, context: RequestContext) {
    const token = this.requirePasswordResetToken(input.token);
    const password = this.requirePassword(input.password);
    const tokenHash = hashPasswordResetToken(token);
    const now = new Date();

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!resetToken) {
      throw new BadRequestException('Ссылка для сброса пароля недействительна');
    }
    if (resetToken.usedAt) {
      throw new ConflictException('Эта ссылка для сброса пароля уже использована. Если доступ всё ещё нужен, запросите новую ссылку.');
    }
    if (resetToken.expiresAt <= now) {
      throw new BadRequestException('Срок действия ссылки для сброса пароля истёк');
    }
    if (resetToken.user.deletedAt || resetToken.user.status !== 'active') {
      throw new BadRequestException('Ссылка для сброса пароля недействительна');
    }

    const passwordData = hashPassword(password);

    await this.prisma.$transaction(async (tx) => {
      const useTokenResult = await tx.passwordResetToken.updateMany({
        where: {
          id: resetToken.id,
          usedAt: null,
        },
        data: { usedAt: now },
      });
      if (useTokenResult.count !== 1) {
        throw new ConflictException('Эта ссылка для сброса пароля уже использована. Если доступ всё ещё нужен, запросите новую ссылку.');
      }

      await tx.userCredential.update({
        where: { userId: resetToken.userId },
        data: {
          ...passwordData,
          passwordChangedAt: now,
          mustChangePassword: false,
          failedLoginCount: 0,
          lastFailedLoginAt: null,
          lockedUntil: null,
        },
      });

      await tx.userSession.updateMany({
        where: {
          userId: resetToken.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          revokedReason: 'password_reset',
        },
      });

      await this.auditLogs.create(tx, {
        data: {
          actorUserId: resetToken.userId,
          action: 'password_reset.completed',
          entityType: 'PasswordResetToken',
          entityId: resetToken.id,
          afterData: {
            userId: resetToken.userId,
            usedAt: now.toISOString(),
            sessionsRevoked: true,
          },
          metadata: {
            emailNormalized: resetToken.user.emailNormalized,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    });

    return {
      reset: true,
      passwordChangedAt: now.toISOString(),
      sessionsRevoked: true,
    };
  }

  async canAccessStore(userId: string, role: string, storeId: string): Promise<boolean> {
    if (role === 'admin') {
      return true;
    }

    if (role !== 'operator') {
      return false;
    }

    const activeAccess = await this.prisma.userStoreAccess.findFirst({
      where: {
        userId,
        storeId,
        revokedAt: null,
      },
      select: { id: true },
    });

    return Boolean(activeAccess);
  }

  async revokeUserSessions(userId: string, revokedReason = 'permission_changed'): Promise<number> {
    const result = await this.prisma.userSession.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedReason,
      },
    });

    return result.count;
  }

  private async recordFailedLogin(userId: string, credential: UserCredentialForLogin, now: Date): Promise<void> {
    const failedLoginCount = credential.failedLoginCount + 1;
    const shouldLock = failedLoginCount >= this.appConfig.authFailedLoginMaxAttempts;
    const lockedUntil = shouldLock
      ? new Date(now.getTime() + this.appConfig.authFailedLoginLockMinutes * 60 * 1000)
      : null;

    await this.prisma.userCredential.update({
      where: { userId },
      data: {
        failedLoginCount,
        lastFailedLoginAt: now,
        lockedUntil,
      },
    });

    if (lockedUntil) {
      this.throwLoginThrottled(lockedUntil);
    }
  }

  private throwLoginThrottled(lockedUntil: Date): never {
    const retryAfterSeconds = Math.max(Math.ceil((lockedUntil.getTime() - Date.now()) / 1000), 1);
    throw new HttpException(
      {
        message: 'Слишком много неудачных попыток входа. Повторите попытку позже.',
        error: 'Too Many Requests',
        code: 'LOGIN_TEMPORARILY_LOCKED',
        retryAfterSeconds,
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private async revokeSessionById(sessionId: string, revokedReason: string) {
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: {
        revokedAt: new Date(),
        revokedReason,
      },
    });
  }

  private async deleteUndeliveredInvite(inviteId: string) {
    await this.prisma.userInvite.deleteMany({
      where: {
        id: inviteId,
        acceptedAt: null,
      },
    });
  }

  private async deleteUndeliveredPasswordResetToken(resetTokenId: string) {
    await this.prisma.passwordResetToken.deleteMany({
      where: {
        id: resetTokenId,
        usedAt: null,
      },
    });
  }

  private requireEmail(email: string): string {
    const trimmedEmail = typeof email === 'string' ? email.trim() : '';
    const normalizedEmail = this.normalizeEmail(trimmedEmail);
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      throw new BadRequestException('Введите корректный email');
    }

    return trimmedEmail;
  }

  private requireValidInviteEmail(email: string): string {
    const trimmedEmail = typeof email === 'string' ? email.trim() : '';
    const result = validateInviteEmail(trimmedEmail);
    if (!result.valid) {
      throw new BadRequestException('Введите корректный email');
    }

    return trimmedEmail;
  }

  private requireRole(role: string): 'admin' | 'operator' {
    if (role === 'admin' || role === 'operator') {
      return role;
    }

    throw new BadRequestException('Роль должна быть admin или operator');
  }

  private requireDate(value: string, fieldName: string): Date {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${fieldName} должен быть корректной датой`);
    }

    return date;
  }

  private requireToken(token: string): string {
    const normalizedToken = typeof token === 'string' ? token.trim() : '';
    if (!normalizedToken) {
      throw new BadRequestException('Токен приглашения обязателен');
    }

    return normalizedToken;
  }

  private requirePasswordResetToken(token: string): string {
    const normalizedToken = typeof token === 'string' ? token.trim() : '';
    if (!normalizedToken) {
      throw new BadRequestException('Токен сброса пароля обязателен');
    }

    return normalizedToken;
  }

  private requirePassword(password: string): string {
    if (typeof password !== 'string' || password.length < 8) {
      throw new BadRequestException('Пароль должен содержать минимум 8 символов');
    }

    return password;
  }

  private requireFullName(fullName: string | undefined, email: string): string {
    const normalizedFullName = typeof fullName === 'string' ? fullName.trim() : '';
    if (normalizedFullName) {
      return normalizedFullName;
    }

    return email.split('@')[0]?.trim() || email;
  }

  private normalizeEmail(email: string): string {
    return typeof email === 'string' ? email.trim().toLowerCase() : '';
  }

  private toSafeUser(user: { id: string; email: string; fullName: string; role: string; status: string }): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role === 'admin' ? 'admin' : 'operator',
      status: user.status,
    };
  }
}
