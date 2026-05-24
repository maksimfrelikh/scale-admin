import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { RequireRoles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionGuard } from '../auth/session.guard';
import { RequireStoreAccess } from '../auth/store-access.decorator';
import { StoreAccessGuard } from '../auth/store-access.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { RussianParseUUIDPipe } from '../shared/uuid-param.pipe';
import { StoresService } from './stores.service';

type CreateStoreBody = {
  code?: unknown;
  name?: unknown;
  address?: unknown;
  timezone?: unknown;
  status?: unknown;
};

type UpdateStoreBody = Partial<CreateStoreBody>;

@Controller('stores')
@UseGuards(SessionGuard, RolesGuard, StoreAccessGuard)
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Get()
  @RequireRoles('admin', 'operator')
  listVisibleStores(@CurrentUser() user: AuthenticatedUser) {
    return this.storesService.listVisibleStores(user);
  }

  @Post()
  @RequireRoles('admin')
  createStore(@Body() body: CreateStoreBody, @Req() request: any, @CurrentUser() user: AuthenticatedUser) {
    return this.storesService.createStore(
      {
        code: String(body.code ?? ''),
        name: String(body.name ?? ''),
        address: typeof body.address === 'string' ? body.address : undefined,
        timezone: typeof body.timezone === 'string' ? body.timezone : undefined,
        status: typeof body.status === 'string' ? body.status : undefined,
      },
      user.id,
      this.getRequestContext(request),
    );
  }

  @Get('admin-check')
  @RequireRoles('admin')
  getAdminCheck(@CurrentUser() user: AuthenticatedUser) {
    return {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  @Get(':storeId')
  @RequireRoles('admin', 'operator')
  @RequireStoreAccess('storeId', 'params')
  getStore(@Param('storeId', RussianParseUUIDPipe) storeId: string) {
    return this.storesService.getStore(storeId);
  }

  @Get(':storeId/details')
  @RequireRoles('admin', 'operator')
  @RequireStoreAccess('storeId', 'params')
  getStoreDetails(@Param('storeId', RussianParseUUIDPipe) storeId: string) {
    return this.storesService.getStoreDetails(storeId);
  }

  @Patch(':storeId')
  @RequireRoles('admin')
  updateStore(@Param('storeId', RussianParseUUIDPipe) storeId: string, @Body() body: UpdateStoreBody, @Req() request: any, @CurrentUser() user: AuthenticatedUser) {
    return this.storesService.updateStore(
      storeId,
      {
        code: typeof body.code === 'string' ? body.code : undefined,
        name: typeof body.name === 'string' ? body.name : undefined,
        address: typeof body.address === 'string' ? body.address : undefined,
        timezone: typeof body.timezone === 'string' ? body.timezone : undefined,
        status: typeof body.status === 'string' ? body.status : undefined,
      },
      user.id,
      this.getRequestContext(request),
    );
  }

  @Get(':storeId/access-check')
  @RequireRoles('admin', 'operator')
  @RequireStoreAccess('storeId', 'params')
  getStoreAccessCheck(@Param('storeId', RussianParseUUIDPipe) storeId: string, @CurrentUser() user: AuthenticatedUser) {
    return {
      ok: true,
      storeId,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  private getRequestContext(request: any) {
    return {
      ipAddress: this.getRequestIp(request),
      userAgent: this.getHeader(request, 'user-agent'),
    };
  }

  private getRequestIp(request: any): string | undefined {
    const forwardedFor = this.getHeader(request, 'x-forwarded-for');
    if (forwardedFor) {
      return forwardedFor.split(',')[0]?.trim();
    }

    return request.ip ?? request.socket?.remoteAddress;
  }

  private getHeader(request: any, name: string): string | undefined {
    const header = request.headers?.[name];
    if (Array.isArray(header)) {
      return header.join(', ');
    }

    return typeof header === 'string' ? header : undefined;
  }
}
