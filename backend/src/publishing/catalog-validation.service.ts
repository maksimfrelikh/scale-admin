import { Injectable, NotFoundException } from '@nestjs/common';
import { BannerStatus, CategoryStatus, PlacementStatus, Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ALLOWED_CURRENCIES, AllowedCurrency } from '../shared/currency';

export type CatalogValidationSeverity = 'blocking_error' | 'warning';

export type CatalogValidationIssue = {
  code: string;
  message: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

type ActiveCatalogRecord = {
  id: string;
  storeId: string;
  name: string;
  status: string;
  currentVersionId: string | null;
};

type CategoryRecord = {
  id: string;
  catalogId: string;
  parentId: string | null;
  name: string;
  shortName: string;
  sortOrder: number;
  status: CategoryStatus;
};

type ActivePlacementRecord = {
  id: string;
  catalogId: string;
  categoryId: string;
  productId: string;
  sortOrder: number;
  status: PlacementStatus;
  category: CategoryRecord | null;
  product: {
    id: string;
    defaultPluCode: string;
    name: string;
    shortName: string;
    status: ProductStatus;
  } | null;
};

type ActiveBannerRecord = {
  id: string;
  storeId: string;
  imageUrl: string;
  imageFileAssetId: string | null;
  status: BannerStatus;
  sortOrder: number;
  imageFileAsset?: { id: string } | null;
};

@Injectable()
export class CatalogValidationService {
  constructor(private readonly prisma: PrismaService) {}

  async validateActiveCatalog(storeId: string) {
    const catalog = await this.findActiveCatalog(storeId);
    const blockingErrors: CatalogValidationIssue[] = [];
    const warnings: CatalogValidationIssue[] = [];

    const [categories, activePlacements, activePrices, activeBanners, versionCount] = await Promise.all([
      this.prisma.category.findMany({
        where: { catalogId: catalog.id },
        select: { id: true, catalogId: true, parentId: true, name: true, shortName: true, sortOrder: true, status: true },
        orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.catalogProductPlacement.findMany({
        where: { catalogId: catalog.id, status: 'active' },
        select: {
          id: true,
          catalogId: true,
          categoryId: true,
          productId: true,
          sortOrder: true,
          status: true,
          category: { select: { id: true, catalogId: true, parentId: true, name: true, shortName: true, sortOrder: true, status: true } },
          product: { select: { id: true, defaultPluCode: true, name: true, shortName: true, status: true } },
        },
        orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }],
      }),
      this.prisma.storeProductPrice.findMany({
        where: { storeId: catalog.storeId, status: 'active', price: { gt: new Prisma.Decimal(0) } },
        select: { id: true, productId: true, currency: true },
      }),
      this.prisma.advertisingBanner.findMany({
        where: { storeId: catalog.storeId, status: 'active' },
        select: {
          id: true,
          storeId: true,
          imageUrl: true,
          imageFileAssetId: true,
          status: true,
          sortOrder: true,
          imageFileAsset: { select: { id: true } },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.catalogVersion.count({ where: { catalogId: catalog.id, storeId: catalog.storeId } }),
    ]);

    this.validateCategories(catalog, categories, blockingErrors);
    this.validatePlacements(catalog, activePlacements, activePrices, blockingErrors);
    this.validateActiveBanners(activeBanners, blockingErrors, warnings);

    if (categories.length === 0 || activePlacements.length === 0) {
      warnings.push({
        code: 'EMPTY_CATALOG',
        message: 'Active catalog has no categories or no active product placements.',
        entityType: 'StoreCatalog',
        entityId: catalog.id,
        metadata: { categoryCount: categories.length, activePlacementCount: activePlacements.length },
      });
    }

    return {
      catalog: {
        id: catalog.id,
        storeId: catalog.storeId,
        name: catalog.name,
        status: catalog.status,
        currentVersionId: catalog.currentVersionId,
      },
      canPublish: blockingErrors.length === 0,
      blockingErrors,
      warnings,
      summary: {
        categoryCount: categories.length,
        activePlacementCount: activePlacements.length,
        activeBannerCount: activeBanners.length,
        catalogVersionCount: versionCount,
      },
    };
  }

  private async findActiveCatalog(storeId: string): Promise<ActiveCatalogRecord> {
    const normalizedStoreId = this.normalizeRequiredId(storeId);
    const catalog = await this.prisma.storeCatalog.findFirst({
      where: { storeId: normalizedStoreId, status: 'active' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, storeId: true, name: true, status: true, currentVersionId: true },
    });

    if (!catalog) {
      throw new NotFoundException('Active store catalog not found');
    }

    return catalog;
  }

  private validateCategories(catalog: ActiveCatalogRecord, categories: CategoryRecord[], blockingErrors: CatalogValidationIssue[]) {
    const byId = new Map(categories.map((category) => [category.id, category]));

    for (const category of categories) {
      if (!category.name?.trim() || !category.shortName?.trim()) {
        blockingErrors.push({
          code: 'CATEGORY_REQUIRED_FIELDS_MISSING',
          message: 'Category name and shortName are required before publishing.',
          entityType: 'Category',
          entityId: category.id,
        });
      }
      if (!Number.isInteger(category.sortOrder) || category.sortOrder < 0) {
        blockingErrors.push({
          code: 'CATEGORY_INVALID_SORT_ORDER',
          message: 'Category sortOrder must be a non-negative integer.',
          entityType: 'Category',
          entityId: category.id,
          metadata: { sortOrder: category.sortOrder },
        });
      }
      if (category.catalogId !== catalog.id) {
        blockingErrors.push({
          code: 'CATEGORY_OUTSIDE_ACTIVE_CATALOG',
          message: 'Category belongs outside the active catalog.',
          entityType: 'Category',
          entityId: category.id,
          metadata: { categoryCatalogId: category.catalogId, activeCatalogId: catalog.id },
        });
      }
      if (category.parentId && !byId.has(category.parentId)) {
        blockingErrors.push({
          code: 'CATEGORY_PARENT_OUTSIDE_CATALOG',
          message: 'Category parent does not exist in the same active catalog.',
          entityType: 'Category',
          entityId: category.id,
          metadata: { parentId: category.parentId },
        });
      }
    }

    for (const category of categories) {
      const seen = new Set<string>();
      let current: CategoryRecord | undefined = category;
      while (current?.parentId) {
        if (seen.has(current.id)) {
          blockingErrors.push({
            code: 'CATEGORY_TREE_CYCLE',
            message: 'Category tree contains a cycle.',
            entityType: 'Category',
            entityId: category.id,
          });
          break;
        }
        seen.add(current.id);
        current = byId.get(current.parentId);
      }
    }
  }

  private validatePlacements(
    catalog: ActiveCatalogRecord,
    placements: ActivePlacementRecord[],
    activePrices: { id: string; productId: string; currency: string }[],
    blockingErrors: CatalogValidationIssue[],
  ) {
    const pricedProductIds = new Set(activePrices.map((price) => price.productId));
    const priceByProductId = new Map<string, { id: string; productId: string; currency: string }>();
    for (const price of activePrices) {
      if (!priceByProductId.has(price.productId)) {
        priceByProductId.set(price.productId, price);
      }
    }
    const placementsByPlu = new Map<string, ActivePlacementRecord[]>();

    for (const placement of placements) {
      if (placement.catalogId !== catalog.id) {
        blockingErrors.push({
          code: 'PLACEMENT_OUTSIDE_ACTIVE_CATALOG',
          message: 'Active placement belongs outside the active catalog.',
          entityType: 'CatalogProductPlacement',
          entityId: placement.id,
        });
      }

      if (!placement.category) {
        blockingErrors.push({
          code: 'PLACEMENT_CATEGORY_MISSING',
          message: 'Active placement references a missing category.',
          entityType: 'CatalogProductPlacement',
          entityId: placement.id,
          metadata: { categoryId: placement.categoryId },
        });
      } else if (placement.category.status !== 'active') {
        blockingErrors.push({
          code: 'ACTIVE_PLACEMENT_IN_INACTIVE_CATEGORY',
          message: 'Active placement is assigned to an inactive or archived category.',
          entityType: 'CatalogProductPlacement',
          entityId: placement.id,
          metadata: { categoryId: placement.categoryId, categoryStatus: placement.category.status },
        });
      }

      if (!placement.product) {
        blockingErrors.push({
          code: 'PLACEMENT_PRODUCT_MISSING',
          message: 'Active placement references a missing product.',
          entityType: 'CatalogProductPlacement',
          entityId: placement.id,
          metadata: { productId: placement.productId },
        });
        continue;
      }

      if (placement.product.status !== 'active') {
        blockingErrors.push({
          code: 'ACTIVE_PLACEMENT_HAS_INACTIVE_PRODUCT',
          message: 'Active placement references an inactive or archived product.',
          entityType: 'CatalogProductPlacement',
          entityId: placement.id,
          metadata: { productId: placement.productId, productStatus: placement.product.status },
        });
      }
      if (!placement.product.shortName?.trim() || !placement.product.defaultPluCode?.trim()) {
        blockingErrors.push({
          code: 'PRODUCT_REQUIRED_FIELDS_MISSING',
          message: 'Product shortName and defaultPluCode are required before publishing.',
          entityType: 'Product',
          entityId: placement.product.id,
          metadata: { placementId: placement.id },
        });
      }
      if (!pricedProductIds.has(placement.productId)) {
        blockingErrors.push({
          code: 'ACTIVE_PLACEMENT_PRICE_MISSING',
          message: 'Active placement product does not have an active positive price for the store.',
          entityType: 'CatalogProductPlacement',
          entityId: placement.id,
          metadata: { productId: placement.productId, storeId: catalog.storeId },
        });
      } else {
        const price = priceByProductId.get(placement.productId);
        if (price && !ALLOWED_CURRENCIES.includes(price.currency as AllowedCurrency)) {
          blockingErrors.push({
            code: 'PRICE_CURRENCY_NOT_SUPPORTED',
            message: 'Active placement price uses an unsupported currency.',
            entityType: 'StoreProductPrice',
            entityId: price.id,
            metadata: {
              productId: price.productId,
              currency: price.currency,
              allowedCurrencies: ALLOWED_CURRENCIES,
            },
          });
        }
      }

      const plu = placement.product.defaultPluCode?.trim();
      if (plu) {
        const duplicates = placementsByPlu.get(plu) ?? [];
        duplicates.push(placement);
        placementsByPlu.set(plu, duplicates);
      }
    }

    for (const [defaultPluCode, duplicatePlacements] of placementsByPlu.entries()) {
      if (duplicatePlacements.length > 1) {
        blockingErrors.push({
          code: 'DUPLICATE_DEFAULT_PLU_CODE',
          message: 'Active package candidates contain duplicate defaultPluCode values.',
          entityType: 'Product',
          metadata: {
            defaultPluCode,
            placementIds: duplicatePlacements.map((placement) => placement.id),
            productIds: duplicatePlacements.map((placement) => placement.productId),
          },
        });
      }
    }
  }

  private validateActiveBanners(
    activeBanners: ActiveBannerRecord[],
    blockingErrors: CatalogValidationIssue[],
    warnings: CatalogValidationIssue[],
  ) {
    if (activeBanners.length === 0) {
      warnings.push({
        code: 'NO_ACTIVE_ADVERTISING_BANNERS',
        message: 'Catalog has no active advertising banners; publishing can continue without ads.',
        entityType: 'AdvertisingBanner',
      });
      return;
    }

    for (const banner of activeBanners) {
      if (!banner.imageUrl?.trim()) {
        blockingErrors.push({
          code: 'ACTIVE_BANNER_IMAGE_URL_MISSING',
          message: 'Active advertising banner must have an imageUrl.',
          entityType: 'AdvertisingBanner',
          entityId: banner.id,
        });
      }
      if (!Number.isInteger(banner.sortOrder) || banner.sortOrder < 0) {
        blockingErrors.push({
          code: 'ACTIVE_BANNER_INVALID_SORT_ORDER',
          message: 'Active advertising banner sortOrder must be a non-negative integer.',
          entityType: 'AdvertisingBanner',
          entityId: banner.id,
          metadata: { sortOrder: banner.sortOrder },
        });
      }
      if (banner.status !== 'active') {
        blockingErrors.push({
          code: 'ACTIVE_BANNER_BAD_STATUS',
          message: 'Only active banners should be included in the active banner set.',
          entityType: 'AdvertisingBanner',
          entityId: banner.id,
          metadata: { status: banner.status },
        });
      }
      if (banner.imageFileAssetId && !banner.imageFileAsset) {
        blockingErrors.push({
          code: 'ACTIVE_BANNER_FILE_REFERENCE_MISSING',
          message: 'Active advertising banner references a missing file asset.',
          entityType: 'AdvertisingBanner',
          entityId: banner.id,
          metadata: { imageFileAssetId: banner.imageFileAssetId },
        });
      }
    }
  }

  private normalizeRequiredId(value: string): string {
    const normalizedValue = typeof value === 'string' ? value.trim() : '';
    if (!normalizedValue) {
      throw new NotFoundException('Active store catalog not found');
    }
    return normalizedValue;
  }
}
