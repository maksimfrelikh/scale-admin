import { Body, Controller, Get, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { getHeader } from '../auth/cookie.util';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequireRoles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionGuard } from '../auth/session.guard';
import { RequireStoreAccess } from '../auth/store-access.decorator';
import { StoreAccessGuard } from '../auth/store-access.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { RussianParseUUIDPipe } from '../shared/uuid-param.pipe';
import { PricesService } from './prices.service';

type ListPricesQuery = {
  search?: string;
  categoryId?: string;
  missingPrice?: string;
  limit?: string;
  offset?: string;
};

type SetPriceBody = {
  productId?: unknown;
  price?: unknown;
  currency?: unknown;
};

@Controller('stores/:storeId/prices')
@UseGuards(SessionGuard, RolesGuard, StoreAccessGuard)
@RequireRoles('admin', 'operator')
@RequireStoreAccess('storeId', 'params')
export class PricesController {
  constructor(private readonly pricesService: PricesService) {}

  @Get()
  listStorePrices(@Param('storeId', RussianParseUUIDPipe) storeId: string, @Query() query: ListPricesQuery) {
    return this.pricesService.listStorePrices(storeId, {
      search: query.search,
      categoryId: query.categoryId,
      missingPrice: query.missingPrice,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get('categories')
  listStorePriceCategories(@Param('storeId', RussianParseUUIDPipe) storeId: string) {
    return this.pricesService.listStorePriceCategories(storeId);
  }

  @Put()
  setStoreProductPrice(
    @Param('storeId', RussianParseUUIDPipe) storeId: string,
    @Body() body: SetPriceBody,
    @Req() request: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pricesService.setStoreProductPrice(
      storeId,
      {
        productId: String(body.productId ?? ''),
        price: typeof body.price === 'number' ? body.price : Number(body.price),
        currency: typeof body.currency === 'string' ? body.currency : undefined,
      },
      user.id,
      this.getRequestContext(request),
    );
  }

  @Put(':productId')
  setStoreProductPriceByParam(
    @Param('storeId', RussianParseUUIDPipe) storeId: string,
    @Param('productId', RussianParseUUIDPipe) productId: string,
    @Body() body: SetPriceBody,
    @Req() request: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pricesService.setStoreProductPrice(
      storeId,
      {
        productId,
        price: typeof body.price === 'number' ? body.price : Number(body.price),
        currency: typeof body.currency === 'string' ? body.currency : undefined,
      },
      user.id,
      this.getRequestContext(request),
    );
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
