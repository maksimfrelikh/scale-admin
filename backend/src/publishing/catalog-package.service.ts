import { createHash } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../logs/audit-log.service';
import { ALLOWED_CURRENCIES, AllowedCurrency } from '../shared/currency';

type ActiveCatalogForPackage = {
  id: string;
  storeId: string;
  name: string;
  currentVersionId: string | null;
  store: {
    id: string;
    code: string;
    name: string;
  };
};

type PackageCategoryRecord = {
  id: string;
  parentId: string | null;
  name: string;
  shortName: string;
  sortOrder: number;
};

type PackagePlacementRecord = {
  id: string;
  categoryId: string;
  productId: string;
  sortOrder: number;
  product: {
    id: string;
    defaultPluCode: string;
    name: string;
    shortName: string;
    description: string | null;
    imageUrl: string | null;
    barcode: string | null;
    sku: string | null;
    unit: string;
  };
};

type PackagePriceRecord = {
  id: string;
  productId: string;
  price: Prisma.Decimal;
  currency: string;
};

type PackageBannerRecord = {
  id: string;
  imageUrl: string;
  sortOrder: number;
};

export type CatalogPackageItem = {
  productId: string;
  plu: string;
  name: string;
  shortName: string;
  description: string | null;
  imageUrl: string | null;
  barcode: string | null;
  sku: string | null;
  unit: string;
  price: number;
  currency: string;
  sortOrder: number;
};

export type CatalogPackageCategory = {
  id: string;
  name: string;
  shortName: string;
  sortOrder: number;
  items: CatalogPackageItem[];
  children: CatalogPackageCategory[];
};

export type CatalogPackageData = {
  version: {
    id: string | null;
    versionNumber: number | null;
    publishedAt: string | null;
    checksum: string | null;
  };
  store: {
    id: string;
    code: string;
    name: string;
  };
  catalog: {
    id: string;
    name: string;
  };
  categories: CatalogPackageCategory[];
  advertising: {
    rotationMode: 'loop';
    banners: Array<{
      id: string;
      imageUrl: string;
      sortOrder: number;
    }>;
  };
};

@Injectable()
export class CatalogPackageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogService,
  ) {}

  async generateActiveCatalogPackage(storeId: string) {
    const catalog = await this.findActiveCatalog(storeId);

    const [categories, placements, activePrices, banners] = await Promise.all([
      this.prisma.category.findMany({
        where: { catalogId: catalog.id, status: 'active' },
        select: { id: true, parentId: true, name: true, shortName: true, sortOrder: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.catalogProductPlacement.findMany({
        where: {
          catalogId: catalog.id,
          status: 'active',
          category: { status: 'active' },
          product: { status: 'active' },
        },
        select: {
          id: true,
          categoryId: true,
          productId: true,
          sortOrder: true,
          product: {
            select: {
              id: true,
              defaultPluCode: true,
              name: true,
              shortName: true,
              description: true,
              imageUrl: true,
              barcode: true,
              sku: true,
              unit: true,
            },
          },
        },
        orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.storeProductPrice.findMany({
        where: { storeId: catalog.storeId, status: 'active', price: { gt: new Prisma.Decimal(0) } },
        select: { id: true, productId: true, price: true, currency: true },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.advertisingBanner.findMany({
        where: { storeId: catalog.storeId, status: 'active' },
        select: { id: true, imageUrl: true, sortOrder: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const packageData = await this.buildPackageData(catalog, categories, placements, activePrices, banners);
    const packageChecksum = this.calculatePackageChecksum(packageData);

    return { packageData, packageChecksum };
  }

  calculatePackageChecksum(packageData: CatalogPackageData): string {
    return createHash('sha256').update(stableStringify(packageData)).digest('hex');
  }

  private async findActiveCatalog(storeId: string): Promise<ActiveCatalogForPackage> {
    const normalizedStoreId = this.normalizeRequiredId(storeId);
    const catalog = await this.prisma.storeCatalog.findFirst({
      where: { storeId: normalizedStoreId, status: 'active' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        storeId: true,
        name: true,
        currentVersionId: true,
        store: { select: { id: true, code: true, name: true } },
      },
    });

    if (!catalog) {
      throw new NotFoundException('Active store catalog not found');
    }

    return catalog;
  }

  private async buildPackageData(
    catalog: ActiveCatalogForPackage,
    categories: PackageCategoryRecord[],
    placements: PackagePlacementRecord[],
    activePrices: PackagePriceRecord[],
    banners: PackageBannerRecord[],
  ): Promise<CatalogPackageData> {
    const priceByProductId = new Map<string, PackagePriceRecord>();
    for (const price of activePrices) {
      if (!priceByProductId.has(price.productId)) {
        priceByProductId.set(price.productId, price);
      }
    }

    const itemsByCategoryId = new Map<string, CatalogPackageItem[]>();
    for (const placement of placements) {
      const price = priceByProductId.get(placement.productId);
      if (!price) {
        continue;
      }

      if (!ALLOWED_CURRENCIES.includes(price.currency as AllowedCurrency)) {
        await this.auditLogs.create({
          data: {
            actorUserId: null,
            action: 'catalog.publish_invariant_violation',
            entityType: 'StoreProductPrice',
            entityId: price.id,
            storeId: catalog.storeId,
            metadata: {
              invariant: 'currency_whitelist',
              storeId: catalog.storeId,
              productId: price.productId,
              receivedCurrency: price.currency,
              allowedCurrencies: ALLOWED_CURRENCIES,
            },
          },
        });
        throw new Error(
          `Internal: price ${price.productId} has unsupported currency ${price.currency} (expected RUB)`,
        );
      }

      const item: CatalogPackageItem = {
        productId: placement.product.id,
        plu: placement.product.defaultPluCode,
        name: placement.product.name,
        shortName: placement.product.shortName,
        description: placement.product.description,
        imageUrl: placement.product.imageUrl,
        barcode: placement.product.barcode,
        sku: placement.product.sku,
        unit: placement.product.unit,
        price: price.price.toNumber(),
        currency: price.currency,
        sortOrder: placement.sortOrder,
      };

      const categoryItems = itemsByCategoryId.get(placement.categoryId) ?? [];
      categoryItems.push(item);
      itemsByCategoryId.set(placement.categoryId, categoryItems);
    }

    for (const categoryItems of itemsByCategoryId.values()) {
      categoryItems.sort(compareItems);
    }

    return {
      version: {
        id: null,
        versionNumber: null,
        publishedAt: null,
        checksum: null,
      },
      store: {
        id: catalog.store.id,
        code: catalog.store.code,
        name: catalog.store.name,
      },
      catalog: {
        id: catalog.id,
        name: catalog.name,
      },
      categories: this.buildCategoryTree(categories, itemsByCategoryId),
      advertising: {
        rotationMode: 'loop',
        banners: [...banners].sort(compareBanners).map((banner) => ({
          id: banner.id,
          imageUrl: banner.imageUrl,
          sortOrder: banner.sortOrder,
        })),
      },
    };
  }

  private buildCategoryTree(
    categories: PackageCategoryRecord[],
    itemsByCategoryId: Map<string, CatalogPackageItem[]>,
  ): CatalogPackageCategory[] {
    const activeCategoryIds = new Set(categories.map((category) => category.id));
    const childrenByParentId = new Map<string | null, PackageCategoryRecord[]>();

    for (const category of categories) {
      const parentKey = category.parentId && activeCategoryIds.has(category.parentId) ? category.parentId : null;
      const siblings = childrenByParentId.get(parentKey) ?? [];
      siblings.push(category);
      childrenByParentId.set(parentKey, siblings);
    }

    for (const siblings of childrenByParentId.values()) {
      siblings.sort(compareCategories);
    }

    const toNode = (category: PackageCategoryRecord): CatalogPackageCategory => ({
      id: category.id,
      name: category.name,
      shortName: category.shortName,
      sortOrder: category.sortOrder,
      items: itemsByCategoryId.get(category.id) ?? [],
      children: (childrenByParentId.get(category.id) ?? []).map(toNode),
    });

    return (childrenByParentId.get(null) ?? []).map(toNode);
  }

  private normalizeRequiredId(value: string): string {
    const normalizedValue = typeof value === 'string' ? value.trim() : '';
    if (!normalizedValue) {
      throw new NotFoundException('Active store catalog not found');
    }
    return normalizedValue;
  }
}

function compareCategories(left: PackageCategoryRecord, right: PackageCategoryRecord) {
  return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

function compareItems(left: CatalogPackageItem, right: CatalogPackageItem) {
  return (
    left.sortOrder - right.sortOrder ||
    left.shortName.localeCompare(right.shortName) ||
    left.name.localeCompare(right.name) ||
    left.plu.localeCompare(right.plu) ||
    left.productId.localeCompare(right.productId)
  );
}

function compareBanners(left: PackageBannerRecord, right: PackageBannerRecord) {
  return left.sortOrder - right.sortOrder || left.id.localeCompare(right.id);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}
