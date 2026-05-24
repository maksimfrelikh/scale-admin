import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequireRoles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionGuard } from '../auth/session.guard';
import { RequireStoreAccess } from '../auth/store-access.decorator';
import { StoreAccessGuard } from '../auth/store-access.guard';
import { getHeader } from '../auth/cookie.util';
import type { AuthenticatedUser } from '../auth/auth.types';
import { RussianParseUUIDPipe } from '../shared/uuid-param.pipe';
import { ScalesService } from './scales.service';

type RegisterDeviceBody = {
  deviceCode?: unknown;
  name?: unknown;
  model?: unknown;
  status?: unknown;
};

type UpdateDeviceStatusBody = {
  status?: unknown;
};

@Controller()
@UseGuards(SessionGuard, RolesGuard, StoreAccessGuard)
export class ScalesController {
  constructor(private readonly scalesService: ScalesService) {}

  @Get('stores/:storeId/scales')
  @RequireRoles('admin', 'operator')
  @RequireStoreAccess('storeId', 'params')
  listStoreDevices(@Param('storeId', RussianParseUUIDPipe) storeId: string) {
    return this.scalesService.listStoreDevices(storeId);
  }

  @Post('stores/:storeId/scales')
  @RequireRoles('admin')
  registerDevice(
    @Param('storeId', RussianParseUUIDPipe) storeId: string,
    @Body() body: RegisterDeviceBody,
    @Req() request: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.scalesService.registerDevice(
      storeId,
      {
        deviceCode: String(body.deviceCode ?? ''),
        name: String(body.name ?? ''),
        model: typeof body.model === 'string' ? body.model : undefined,
        status: typeof body.status === 'string' ? body.status : undefined,
      },
      user.id,
      this.getRequestContext(request),
    );
  }

  @Patch('scales/:deviceId/status')
  @RequireRoles('admin')
  updateDeviceStatus(
    @Param('deviceId', RussianParseUUIDPipe) deviceId: string,
    @Body() body: UpdateDeviceStatusBody,
    @Req() request: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.scalesService.updateDeviceStatus(
      deviceId,
      { status: String(body.status ?? '') },
      user.id,
      this.getRequestContext(request),
    );
  }

  @Post('scales/:deviceId/regenerate-token')
  @RequireRoles('admin')
  regenerateApiToken(@Param('deviceId', RussianParseUUIDPipe) deviceId: string, @Req() request: any, @CurrentUser() user: AuthenticatedUser) {
    return this.scalesService.regenerateApiToken(deviceId, user.id, this.getRequestContext(request));
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
