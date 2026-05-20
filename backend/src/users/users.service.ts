import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../logs/audit-log.service';
import { AuthService } from '../auth/auth.service';
import { isUuid } from './uuid.util';

export type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

export type UserRoleInput = 'admin' | 'operator';

type SafeUserRecord = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly auditLogs: AuditLogService,
  ) {}

  async listUsers(includeDeleted = false) {
    const users = await this.prisma.user.findMany({
      where: includeDeleted ? undefined : { deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { emailNormalized: 'asc' }],
    });

    return {
      users: users.map((user) => this.toSafeUser(user)),
    };
  }

  async getUser(userId: string) {
    const user = await this.findUserById(userId, true);
    return { user: this.toSafeUser(user) };
  }

  async changeRole(userId: string, roleInput: string, actorUserId: string, context: RequestContext) {
    const role = this.requireRole(roleInput);
    const user = await this.findUserById(userId, false);
    if (user.role === role) {
      return { user: this.toSafeUser(user), changed: false };
    }

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { role },
      });

      await this.auditLogs.create(tx, {
        data: {
          actorUserId,
          action: 'user.role_changed',
          entityType: 'User',
          entityId: user.id,
          beforeData: { role: user.role },
          afterData: { role: updated.role },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return updated;
    });

    await this.authService.revokeUserSessions(user.id, 'role_changed');

    return { user: this.toSafeUser(updatedUser), changed: true };
  }

  async blockUser(userId: string, actorUserId: string, context: RequestContext) {
    const user = await this.findUserById(userId, false);
    if (user.status === 'blocked') {
      return { user: this.toSafeUser(user), changed: false };
    }

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { status: 'blocked' },
      });

      await this.auditLogs.create(tx, {
        data: {
          actorUserId,
          action: 'user.blocked',
          entityType: 'User',
          entityId: user.id,
          beforeData: { status: user.status },
          afterData: { status: updated.status },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return updated;
    });

    await this.authService.revokeUserSessions(user.id, 'user_blocked');

    return { user: this.toSafeUser(updatedUser), changed: true };
  }

  async unblockUser(userId: string, actorUserId: string, context: RequestContext) {
    const user = await this.findUserById(userId, false);
    if (user.status === 'active') {
      return { user: this.toSafeUser(user), changed: false };
    }

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { status: 'active' },
      });

      await this.auditLogs.create(tx, {
        data: {
          actorUserId,
          action: 'user.unblocked',
          entityType: 'User',
          entityId: user.id,
          beforeData: { status: user.status },
          afterData: { status: updated.status },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return updated;
    });

    return { user: this.toSafeUser(updatedUser), changed: true };
  }

  async listStoreAccesses(userId: string) {
    await this.findUserById(userId, true);
    const accesses = await this.prisma.userStoreAccess.findMany({
      where: { userId },
      include: { store: true, grantedBy: true },
      orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }],
    });

    return {
      storeAccesses: accesses.map((access) => this.toStoreAccess(access)),
    };
  }

  async grantStoreAccess(userId: string, storeId: string, actorUserId: string, context: RequestContext) {
    const user = await this.findUserById(userId, false);
    if (user.role !== 'operator') {
      throw new BadRequestException('Store access can only be granted to operator users');
    }

    const store = await this.findStoreById(storeId);
    const existingAccess = await this.prisma.userStoreAccess.findFirst({
      where: {
        userId,
        storeId,
        revokedAt: null,
      },
      include: { store: true, grantedBy: true },
    });

    if (existingAccess) {
      return {
        storeAccess: this.toStoreAccess(existingAccess),
        granted: false,
        duplicateActiveAccess: true,
      };
    }

    const access = await this.prisma.$transaction(async (tx) => {
      const createdAccess = await tx.userStoreAccess.create({
        data: {
          userId,
          storeId,
          grantedByUserId: actorUserId,
        },
        include: { store: true, grantedBy: true },
      });

      await this.auditLogs.create(tx, {
        data: {
          actorUserId,
          action: 'user_store_access.granted',
          entityType: 'UserStoreAccess',
          entityId: createdAccess.id,
          storeId,
          afterData: {
            userId,
            storeId,
            grantedByUserId: actorUserId,
          },
          metadata: {
            userEmail: user.email,
            storeCode: store.code,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return createdAccess;
    });

    await this.authService.revokeUserSessions(userId, 'store_access_changed');

    return {
      storeAccess: this.toStoreAccess(access),
      granted: true,
      duplicateActiveAccess: false,
    };
  }

  async revokeStoreAccess(userId: string, storeId: string, actorUserId: string, context: RequestContext) {
    const user = await this.findUserById(userId, false);
    if (user.role !== 'operator') {
      throw new BadRequestException('Store access can only be revoked from operator users');
    }

    const store = await this.findStoreById(storeId);
    const existingAccess = await this.prisma.userStoreAccess.findFirst({
      where: {
        userId,
        storeId,
        revokedAt: null,
      },
      include: { store: true, grantedBy: true },
    });

    if (!existingAccess) {
      throw new NotFoundException('Active store access not found');
    }

    const now = new Date();
    const access = await this.prisma.$transaction(async (tx) => {
      const revokedAccess = await tx.userStoreAccess.update({
        where: { id: existingAccess.id },
        data: { revokedAt: now },
        include: { store: true, grantedBy: true },
      });

      await this.auditLogs.create(tx, {
        data: {
          actorUserId,
          action: 'user_store_access.revoked',
          entityType: 'UserStoreAccess',
          entityId: existingAccess.id,
          storeId,
          beforeData: {
            userId,
            storeId,
            revokedAt: existingAccess.revokedAt?.toISOString() ?? null,
          },
          afterData: {
            userId,
            storeId,
            revokedAt: now.toISOString(),
          },
          metadata: {
            userEmail: user.email,
            storeCode: store.code,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return revokedAccess;
    });

    await this.authService.revokeUserSessions(userId, 'store_access_changed');

    return {
      storeAccess: this.toStoreAccess(access),
      revoked: true,
    };
  }

  async cancelInvite(inviteId: string, actorUserId: string, context: RequestContext) {
    if (!inviteId) {
      throw new BadRequestException('Invite id is required');
    }

    const invite = await this.prisma.userInvite.findUnique({ where: { id: inviteId } });
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }
    if (invite.acceptedAt) {
      throw new ConflictException('Accepted invites cannot be cancelled');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userInvite.delete({ where: { id: invite.id } });

      await this.auditLogs.create(tx, {
        data: {
          actorUserId,
          action: 'user.invite.cancelled',
          entityType: 'UserInvite',
          entityId: invite.id,
          beforeData: {
            email: invite.email,
            role: invite.role,
            expiresAt: invite.expiresAt.toISOString(),
            invitedByUserId: invite.invitedByUserId,
            createdAt: invite.createdAt.toISOString(),
          },
          metadata: {
            inviteId: invite.id,
            targetEmail: invite.email,
            cancelledByUserId: actorUserId,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    });

    return {
      inviteId: invite.id,
      cancelled: true,
    };
  }

  async softDeleteUser(userId: string, actorUserId: string, context: RequestContext) {
    if (userId === actorUserId) {
      throw new ConflictException('Admins cannot delete their own user');
    }

    const user = await this.findUserById(userId, false);
    const now = new Date();

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { deletedAt: now },
      });

      await this.auditLogs.create(tx, {
        data: {
          actorUserId,
          action: 'user.soft_deleted',
          entityType: 'User',
          entityId: user.id,
          beforeData: { deletedAt: user.deletedAt?.toISOString() ?? null },
          afterData: { deletedAt: now.toISOString() },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return updated;
    });

    await this.authService.revokeUserSessions(user.id, 'user_deleted');

    return { user: this.toSafeUser(updatedUser), deleted: true };
  }

  private async findStoreById(storeId: string) {
    if (!storeId) {
      throw new BadRequestException('Store id is required');
    }

    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store || store.status === 'archived') {
      throw new NotFoundException('Store not found');
    }

    return store;
  }

  private async findUserById(userId: string, includeDeleted: boolean): Promise<SafeUserRecord> {
    if (!userId) {
      throw new BadRequestException('User id is required');
    }

    // User.id is a UUID column; a non-UUID string would otherwise raise an
    // unhandled Prisma validation error → 500. Short-circuit to 404.
    if (!isUuid(userId)) {
      throw new NotFoundException('User not found');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private requireRole(role: string): UserRoleInput {
    if (role === 'admin' || role === 'operator') {
      return role;
    }

    throw new BadRequestException('Role must be admin or operator');
  }

  private toSafeUser(user: SafeUserRecord) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      deletedAt: user.deletedAt?.toISOString() ?? null,
    };
  }

  private toStoreAccess(access: {
    id: string;
    userId: string;
    storeId: string;
    grantedByUserId: string | null;
    createdAt: Date;
    revokedAt: Date | null;
    store: { id: string; code: string; name: string; status: string };
    grantedBy: { id: string; email: string; fullName: string } | null;
  }) {
    return {
      id: access.id,
      userId: access.userId,
      storeId: access.storeId,
      grantedByUserId: access.grantedByUserId,
      createdAt: access.createdAt.toISOString(),
      revokedAt: access.revokedAt?.toISOString() ?? null,
      store: {
        id: access.store.id,
        code: access.store.code,
        name: access.store.name,
        status: access.store.status,
      },
      grantedBy: access.grantedBy
        ? {
            id: access.grantedBy.id,
            email: access.grantedBy.email,
            fullName: access.grantedBy.fullName,
          }
        : null,
    };
  }
}
