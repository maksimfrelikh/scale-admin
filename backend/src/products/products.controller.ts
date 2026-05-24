import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { getHeader } from '../auth/cookie.util';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequireRoles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionGuard } from '../auth/session.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { RussianParseUUIDPipe } from '../shared/uuid-param.pipe';
import { ProductsService } from './products.service';

type ProductBody = {
  defaultPluCode?: unknown;
  name?: unknown;
  shortName?: unknown;
  description?: unknown;
  imageUrl?: unknown;
  imageFileAssetId?: unknown;
  barcode?: unknown;
  sku?: unknown;
  unit?: unknown;
  status?: unknown;
};

type ProductQuery = {
  search?: string;
  status?: string;
  limit?: string;
  offset?: string;
  take?: string;
  skip?: string;
};

@Controller('products')
@UseGuards(SessionGuard, RolesGuard)
@RequireRoles('admin', 'operator')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  listProducts(@Query() query: ProductQuery) {
    return this.productsService.listProducts(query);
  }

  @Post()
  createProduct(@Body() body: ProductBody, @Req() request: any, @CurrentUser() user: AuthenticatedUser) {
    return this.productsService.createProduct(
      {
        defaultPluCode: String(body.defaultPluCode ?? ''),
        name: String(body.name ?? ''),
        shortName: String(body.shortName ?? ''),
        unit: String(body.unit ?? ''),
        status: String(body.status ?? ''),
        description: typeof body.description === 'string' ? body.description : undefined,
        imageUrl: typeof body.imageUrl === 'string' ? body.imageUrl : undefined,
        imageFileAssetId: typeof body.imageFileAssetId === 'string' ? body.imageFileAssetId : undefined,
        barcode: typeof body.barcode === 'string' ? body.barcode : undefined,
        sku: typeof body.sku === 'string' ? body.sku : undefined,
      },
      user.id,
      this.getRequestContext(request),
    );
  }

  @Get(':productId')
  getProduct(@Param('productId', RussianParseUUIDPipe) productId: string) {
    return this.productsService.getProduct(productId);
  }

  @Patch(':productId')
  updateProduct(
    @Param('productId', RussianParseUUIDPipe) productId: string,
    @Body() body: ProductBody,
    @Req() request: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.updateProduct(
      productId,
      {
        defaultPluCode: typeof body.defaultPluCode === 'string' ? body.defaultPluCode : undefined,
        name: typeof body.name === 'string' ? body.name : undefined,
        shortName: typeof body.shortName === 'string' ? body.shortName : undefined,
        unit: typeof body.unit === 'string' ? body.unit : undefined,
        status: typeof body.status === 'string' ? body.status : undefined,
        description: typeof body.description === 'string' ? body.description : undefined,
        imageUrl: typeof body.imageUrl === 'string' ? body.imageUrl : undefined,
        imageFileAssetId: typeof body.imageFileAssetId === 'string' ? body.imageFileAssetId : undefined,
        barcode: typeof body.barcode === 'string' ? body.barcode : undefined,
        sku: typeof body.sku === 'string' ? body.sku : undefined,
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
