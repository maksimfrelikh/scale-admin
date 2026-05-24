import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { getHeader } from '../auth/cookie.util';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequireRoles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionGuard } from '../auth/session.guard';
import { RequireStoreAccess } from '../auth/store-access.decorator';
import { StoreAccessGuard } from '../auth/store-access.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { RussianParseUUIDPipe } from '../shared/uuid-param.pipe';
import { AdvertisingService } from './advertising.service';

type ListBannersQuery = {
  status?: string;
  limit?: string;
  offset?: string;
};

type BannerBody = {
  imageUrl?: unknown;
  imageFileAssetId?: unknown;
  status?: unknown;
  sortOrder?: unknown;
};

type ChangeStatusBody = {
  status?: unknown;
};

type ReorderBannersBody = {
  bannerIds?: unknown;
};

@Controller('stores/:storeId/advertising/banners')
@UseGuards(SessionGuard, RolesGuard, StoreAccessGuard)
@RequireRoles('admin', 'operator')
@RequireStoreAccess('storeId', 'params')
export class AdvertisingController {
  constructor(private readonly advertisingService: AdvertisingService) {}

  @Get()
  listBanners(@Param('storeId', RussianParseUUIDPipe) storeId: string, @Query() query: ListBannersQuery) {
    return this.advertisingService.listBanners(storeId, {
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Post()
  createBanner(
    @Param('storeId', RussianParseUUIDPipe) storeId: string,
    @Body() body: BannerBody,
    @Req() request: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.advertisingService.createBanner(
      storeId,
      {
        imageUrl: String(body.imageUrl ?? ''),
        imageFileAssetId: this.optionalString(body.imageFileAssetId),
        status: typeof body.status === 'string' ? body.status : undefined,
        sortOrder: this.optionalNumber(body.sortOrder),
      },
      user.id,
      this.getRequestContext(request),
    );
  }

  @Post('reorder')
  reorderBanners(
    @Param('storeId', RussianParseUUIDPipe) storeId: string,
    @Body() body: ReorderBannersBody,
    @Req() request: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.advertisingService.reorderBanners(
      storeId,
      { bannerIds: Array.isArray(body.bannerIds) ? body.bannerIds.map((value) => String(value)) : [] },
      user.id,
      this.getRequestContext(request),
    );
  }

  @Get(':bannerId')
  getBanner(@Param('storeId', RussianParseUUIDPipe) storeId: string, @Param('bannerId', RussianParseUUIDPipe) bannerId: string) {
    return this.advertisingService.getBanner(storeId, bannerId);
  }

  @Patch(':bannerId')
  updateBanner(
    @Param('storeId', RussianParseUUIDPipe) storeId: string,
    @Param('bannerId', RussianParseUUIDPipe) bannerId: string,
    @Body() body: BannerBody,
    @Req() request: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.advertisingService.updateBanner(
      storeId,
      bannerId,
      {
        imageUrl: typeof body.imageUrl === 'string' ? body.imageUrl : undefined,
        imageFileAssetId: body.imageFileAssetId === null ? null : this.optionalString(body.imageFileAssetId),
        status: typeof body.status === 'string' ? body.status : undefined,
        sortOrder: this.optionalNumber(body.sortOrder),
      },
      user.id,
      this.getRequestContext(request),
    );
  }

  @Patch(':bannerId/status')
  changeBannerStatus(
    @Param('storeId', RussianParseUUIDPipe) storeId: string,
    @Param('bannerId', RussianParseUUIDPipe) bannerId: string,
    @Body() body: ChangeStatusBody,
    @Req() request: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.advertisingService.changeBannerStatus(
      storeId,
      bannerId,
      { status: String(body.status ?? '') },
      user.id,
      this.getRequestContext(request),
    );
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private optionalNumber(value: unknown): number | undefined {
    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string' && value.trim() !== '') {
      return Number(value);
    }

    return undefined;
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
