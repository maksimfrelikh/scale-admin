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
import { CatalogService } from './catalog.service';

export type CategoryBody = {
  name?: unknown;
  shortName?: unknown;
  parentId?: unknown;
  sortOrder?: unknown;
  status?: unknown;
};

type ReorderCategoriesBody = {
  parentId?: unknown;
  categoryIds?: unknown;
};

type PlacementBody = {
  categoryId?: unknown;
  productId?: unknown;
  sortOrder?: unknown;
  status?: unknown;
};

type PlacementQuery = {
  categoryId?: string;
  status?: string;
};

type CategoryQuery = {
  status?: string;
};

type ReorderPlacementsBody = {
  categoryId?: unknown;
  placementIds?: unknown;
};

@Controller('stores/:storeId/catalog')
@UseGuards(SessionGuard, RolesGuard, StoreAccessGuard)
@RequireRoles('admin', 'operator')
@RequireStoreAccess('storeId', 'params')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('categories')
  listCategoryTree(@Param('storeId', RussianParseUUIDPipe) storeId: string, @Query() query: CategoryQuery) {
    return this.catalogService.listCategoryTree(storeId, { status: query.status });
  }

  @Post('categories')
  createCategory(
    @Param('storeId', RussianParseUUIDPipe) storeId: string,
    @Body() body: CategoryBody,
    @Req() request: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.catalogService.createCategory(
      storeId,
      {
        name: String(body.name ?? ''),
        shortName: typeof body.shortName === 'string' ? body.shortName : undefined,
        parentId: this.optionalString(body.parentId),
        sortOrder: this.optionalNumber(body.sortOrder),
        status: typeof body.status === 'string' ? body.status : undefined,
      },
      user.id,
      this.getRequestContext(request),
    );
  }

  @Patch('categories/:categoryId')
  updateCategory(
    @Param('storeId', RussianParseUUIDPipe) storeId: string,
    @Param('categoryId', RussianParseUUIDPipe) categoryId: string,
    @Body() body: CategoryBody,
    @Req() request: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.catalogService.updateCategory(
      storeId,
      categoryId,
      {
        name: typeof body.name === 'string' ? body.name : undefined,
        shortName: typeof body.shortName === 'string' ? body.shortName : undefined,
        parentId: body.parentId === null ? null : this.optionalString(body.parentId),
        sortOrder: this.optionalNumber(body.sortOrder),
        status: typeof body.status === 'string' ? body.status : undefined,
      },
      user.id,
      this.getRequestContext(request),
    );
  }

  @Post('categories/reorder')
  reorderCategories(
    @Param('storeId', RussianParseUUIDPipe) storeId: string,
    @Body() body: ReorderCategoriesBody,
    @Req() request: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.catalogService.reorderCategories(
      storeId,
      {
        parentId: body.parentId === null ? null : this.optionalString(body.parentId),
        categoryIds: Array.isArray(body.categoryIds) ? body.categoryIds.map((value) => String(value)) : [],
      },
      user.id,
      this.getRequestContext(request),
    );
  }


  @Get('placements')
  listPlacements(@Param('storeId', RussianParseUUIDPipe) storeId: string, @Query() query: PlacementQuery) {
    return this.catalogService.listPlacements(storeId, {
      categoryId: query.categoryId,
      status: query.status,
    });
  }

  @Post('placements')
  createPlacement(
    @Param('storeId', RussianParseUUIDPipe) storeId: string,
    @Body() body: PlacementBody,
    @Req() request: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.catalogService.createPlacement(
      storeId,
      {
        categoryId: String(body.categoryId ?? ''),
        productId: String(body.productId ?? ''),
        sortOrder: this.optionalNumber(body.sortOrder),
        status: typeof body.status === 'string' ? body.status : undefined,
      },
      user.id,
      this.getRequestContext(request),
    );
  }

  @Post('placements/reorder')
  reorderPlacements(
    @Param('storeId', RussianParseUUIDPipe) storeId: string,
    @Body() body: ReorderPlacementsBody,
    @Req() request: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.catalogService.reorderPlacements(
      storeId,
      {
        categoryId: String(body.categoryId ?? ''),
        placementIds: Array.isArray(body.placementIds) ? body.placementIds.map((value) => String(value)) : [],
      },
      user.id,
      this.getRequestContext(request),
    );
  }

  @Get('placements/:placementId')
  getPlacement(@Param('storeId', RussianParseUUIDPipe) storeId: string, @Param('placementId', RussianParseUUIDPipe) placementId: string) {
    return this.catalogService.getPlacement(storeId, placementId);
  }

  @Patch('placements/:placementId')
  updatePlacement(
    @Param('storeId', RussianParseUUIDPipe) storeId: string,
    @Param('placementId', RussianParseUUIDPipe) placementId: string,
    @Body() body: PlacementBody,
    @Req() request: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.catalogService.updatePlacement(
      storeId,
      placementId,
      {
        categoryId: typeof body.categoryId === 'string' ? body.categoryId : undefined,
        sortOrder: this.optionalNumber(body.sortOrder),
        status: typeof body.status === 'string' ? body.status : undefined,
      },
      user.id,
      this.getRequestContext(request),
    );
  }

  @Post('placements/:placementId/move')
  movePlacement(
    @Param('storeId', RussianParseUUIDPipe) storeId: string,
    @Param('placementId', RussianParseUUIDPipe) placementId: string,
    @Body() body: PlacementBody,
    @Req() request: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.catalogService.movePlacement(
      storeId,
      placementId,
      {
        categoryId: String(body.categoryId ?? ''),
        sortOrder: this.optionalNumber(body.sortOrder),
      },
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
