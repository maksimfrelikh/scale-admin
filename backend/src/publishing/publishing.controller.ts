import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { getHeader } from '../auth/cookie.util';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { RequireRoles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionGuard } from '../auth/session.guard';
import { RequireStoreAccess } from '../auth/store-access.decorator';
import { StoreAccessGuard } from '../auth/store-access.guard';
import { RussianParseUUIDPipe } from '../shared/uuid-param.pipe';
import { CatalogPackageService } from './catalog-package.service';
import { CatalogPublishingService } from './catalog-publishing.service';
import { CatalogValidationService } from './catalog-validation.service';

@Controller('stores/:storeId/publishing')
@UseGuards(SessionGuard, RolesGuard, StoreAccessGuard)
@RequireRoles('admin', 'operator')
@RequireStoreAccess('storeId', 'params')
export class PublishingController {
  constructor(
    private readonly catalogValidationService: CatalogValidationService,
    private readonly catalogPackageService: CatalogPackageService,
    private readonly catalogPublishingService: CatalogPublishingService,
  ) {}

  @Post('catalog-validation')
  validateActiveCatalog(@Param('storeId', RussianParseUUIDPipe) storeId: string) {
    return this.catalogValidationService.validateActiveCatalog(storeId);
  }

  @Get('catalog-validation')
  getActiveCatalogValidation(@Param('storeId', RussianParseUUIDPipe) storeId: string) {
    return this.catalogValidationService.validateActiveCatalog(storeId);
  }

  @Post('catalog-package')
  generateActiveCatalogPackage(@Param('storeId', RussianParseUUIDPipe) storeId: string) {
    return this.catalogPackageService.generateActiveCatalogPackage(storeId);
  }

  @Get('catalog-package')
  getActiveCatalogPackage(@Param('storeId', RussianParseUUIDPipe) storeId: string) {
    return this.catalogPackageService.generateActiveCatalogPackage(storeId);
  }

  @Get('catalog-versions')
  listCatalogVersions(@Param('storeId', RussianParseUUIDPipe) storeId: string) {
    return this.catalogPublishingService.listCatalogVersions(storeId);
  }

  @Post('catalog-publish')
  publishActiveCatalog(
    @Param('storeId', RussianParseUUIDPipe) storeId: string,
    @Req() request: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.catalogPublishingService.publishActiveCatalog(storeId, user, {
      ipAddress: this.getRequestIp(request),
      userAgent: getHeader(request, 'user-agent'),
    });
  }

  private getRequestIp(request: any): string | undefined {
    const forwardedFor = getHeader(request, 'x-forwarded-for');
    if (forwardedFor) {
      return forwardedFor.split(',')[0]?.trim();
    }

    return request.ip ?? request.socket?.remoteAddress;
  }
}
