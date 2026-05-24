import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequireRoles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionGuard } from '../auth/session.guard';
import { getHeader } from '../auth/cookie.util';
import type { AuthenticatedUser } from '../auth/auth.types';
import { RussianParseUUIDPipe } from '../shared/uuid-param.pipe';
import { ReservedKeywordUserIdPipe } from './reserved-keyword.pipe';
import { UsersService } from './users.service';

type ChangeRoleBody = {
  role?: unknown;
};

type GrantStoreAccessBody = {
  storeId?: unknown;
};

@Controller('users')
@UseGuards(SessionGuard, RolesGuard)
@RequireRoles('admin')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  listUsers(@Query('includeDeleted') includeDeleted?: string) {
    return this.usersService.listUsers(includeDeleted === 'true');
  }

  @Get(':userId')
  getUser(@Param('userId', ReservedKeywordUserIdPipe, RussianParseUUIDPipe) userId: string) {
    return this.usersService.getUser(userId);
  }

  @Patch(':userId/role')
  changeRole(
    @Param('userId', ReservedKeywordUserIdPipe, RussianParseUUIDPipe) userId: string,
    @Body() body: ChangeRoleBody,
    @Req() request: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.changeRole(userId, String(body.role ?? ''), actor.id, this.getRequestContext(request));
  }

  @Patch(':userId/block')
  blockUser(
    @Param('userId', ReservedKeywordUserIdPipe, RussianParseUUIDPipe) userId: string,
    @Req() request: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.blockUser(userId, actor.id, this.getRequestContext(request));
  }

  @Patch(':userId/unblock')
  unblockUser(
    @Param('userId', ReservedKeywordUserIdPipe, RussianParseUUIDPipe) userId: string,
    @Req() request: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.unblockUser(userId, actor.id, this.getRequestContext(request));
  }

  @Get(':userId/store-accesses')
  listStoreAccesses(@Param('userId', ReservedKeywordUserIdPipe, RussianParseUUIDPipe) userId: string) {
    return this.usersService.listStoreAccesses(userId);
  }

  @Post(':userId/store-accesses')
  grantStoreAccess(
    @Param('userId', ReservedKeywordUserIdPipe, RussianParseUUIDPipe) userId: string,
    @Body() body: GrantStoreAccessBody,
    @Req() request: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.grantStoreAccess(userId, String(body.storeId ?? ''), actor.id, this.getRequestContext(request));
  }

  @Delete(':userId/store-accesses/:storeId')
  revokeStoreAccess(
    @Param('userId', ReservedKeywordUserIdPipe, RussianParseUUIDPipe) userId: string,
    @Param('storeId', RussianParseUUIDPipe) storeId: string,
    @Req() request: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.revokeStoreAccess(userId, storeId, actor.id, this.getRequestContext(request));
  }

  @Delete('invites/:inviteId')
  cancelInvite(@Param('inviteId', RussianParseUUIDPipe) inviteId: string, @Req() request: any, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.cancelInvite(inviteId, actor.id, this.getRequestContext(request));
  }

  @Delete(':userId')
  softDeleteUser(
    @Param('userId', ReservedKeywordUserIdPipe, RussianParseUUIDPipe) userId: string,
    @Req() request: any,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.softDeleteUser(userId, actor.id, this.getRequestContext(request));
  }

  private getRequestContext(request: any) {
    return {
      ipAddress: this.getRequestIp(request),
      userAgent: getHeader(request, 'user-agent'),
    };
  }

  private getRequestIp(request: any): string | undefined {
    const forwardedFor = getHeader(request, 'x-forwarded-for');
    if (forwardedFor) {
      return forwardedFor.split(',')[0]?.trim();
    }

    return request.ip ?? request.socket?.remoteAddress;
  }
}
