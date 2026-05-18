import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PriceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../logs/audit-log.service';
import { ALLOWED_CURRENCIES, AllowedCurrency } from '../shared/currency';

export type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

export type ListStorePricesInput = {
  search?: string;
  categoryId?: string;
  missingPrice?: string;
};

export type SetStoreProductPriceInput = {
  productId: string;
  price: number;
  currency?: string;
};

type ActiveCatalogRecord = {
  id: string;
  storeId: string;
  name: string;
  status: string;
};

type StoreProductPriceRecord = {
  id: string;
  storeId: string;
  productId: string;
  price: Prisma.Decimal;
  currency: string;
  status: PriceStatus;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class PricesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogService,
  ) {}

  async listStorePrices(storeId: string, input: ListStorePricesInput) {
    const catalog = await this.findActiveCatalog(storeId);
    const search = this.normalizeOptionalString(input.search)?.toLowerCase();
    const categoryId = this.normalizeOptionalId(input.categoryId);
    const missingPrice = this.parseOptionalBoolean(input.missingPrice, 'missingPrice');

    if (categoryId) {
      await this.ensureActiveCategoryInCatalog(catalog.id, categoryId);
    }

    const placements = await this.prisma.catalogProductPlacement.findMany({
      where: {
        catalogId: catalog.id,
        status: 'active',
        ...(categoryId ? { categoryId } : {}),
        product: { status: 'active' },
        category: { status: 'active' },
      },
      include: {
        product: {
          select: {
            id: true,
            defaultPluCode: true,
            name: true,
            shortName: true,
            barcode: true,
            sku: true,
            unit: true,
            status: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            shortName: true,
            status: true,
          },
        },
      },
      orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    const productIds = [...new Set(placements.map((placement) => placement.productId))];
    const activePrices = await this.prisma.storeProductPrice.findMany({
      where: {
        storeId: catalog.storeId,
        productId: { in: productIds },
        status: 'active',
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
    const priceByProductId = new Map<string, StoreProductPriceRecord>();
    for (const price of activePrices) {
      if (!priceByProductId.has(price.productId)) {
        priceByProductId.set(price.productId, price);
      }
    }

    const items = placements
      .map((placement) => {
        const price = priceByProductId.get(placement.productId) ?? null;
        return {
          placement: {
            id: placement.id,
            catalogId: placement.catalogId,
            categoryId: placement.categoryId,
            productId: placement.productId,
            sortOrder: placement.sortOrder,
            status: placement.status,
          },
          product: placement.product,
          category: placement.category,
          currentPrice: price ? this.toPriceResponse(price) : null,
          missingPrice: !price,
        };
      })
      .filter((item) => {
        if (missingPrice !== undefined && item.missingPrice !== missingPrice) {
          return false;
        }
        if (!search) {
          return true;
        }
        const haystack = [
          item.product.name,
          item.product.shortName,
          item.product.defaultPluCode,
          item.product.sku,
          item.product.barcode,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(search);
      });

    return {
      catalog: this.toCatalogResponse(catalog),
      prices: items,
    };
  }

  async setStoreProductPrice(
    storeId: string,
    input: SetStoreProductPriceInput,
    actorUserId: string,
    context: RequestContext,
  ) {
    const catalog = await this.findActiveCatalog(storeId);
    const productId = this.normalizeRequiredId(input.productId, 'Product id is required');
    const price = this.requirePrice(input.price);
    const currency = this.requireCurrency(input.currency ?? 'RUB');

    await this.ensureActivePlacedProduct(catalog.id, productId);

    const result = await this.prisma.$transaction(async (tx) => {
      const activePrices = await tx.storeProductPrice.findMany({
        where: { storeId: catalog.storeId, productId, status: 'active' },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      });
      const beforeData = activePrices.map((activePrice) => this.toPriceAuditData(activePrice));
      const primary = activePrices[0];

      const saved = primary
        ? await tx.storeProductPrice.update({
            where: { id: primary.id },
            data: { price, currency, status: 'active' },
          })
        : await tx.storeProductPrice.create({
            data: { storeId: catalog.storeId, productId, price, currency, status: 'active' },
          });

      const duplicateIds = activePrices.slice(1).map((activePrice) => activePrice.id);
      if (duplicateIds.length > 0) {
        await tx.storeProductPrice.updateMany({ where: { id: { in: duplicateIds } }, data: { status: 'archived' } });
      }

      await this.auditLogs.create(tx, {
        data: {
          actorUserId,
          action: primary ? 'price.updated' : 'price.created',
          entityType: 'StoreProductPrice',
          entityId: saved.id,
          storeId: catalog.storeId,
          beforeData,
          afterData: this.toPriceAuditData(saved),
          metadata: {
            catalogId: catalog.id,
            productId,
            archivedDuplicateActivePriceIds: duplicateIds,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return saved;
    });

    return { price: this.toPriceResponse(result) };
  }

  private async findActiveCatalog(storeId: string): Promise<ActiveCatalogRecord> {
    const normalizedStoreId = this.normalizeRequiredId(storeId, 'Store id is required');
    const catalog = await this.prisma.storeCatalog.findFirst({
      where: { storeId: normalizedStoreId, status: 'active' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, storeId: true, name: true, status: true },
    });

    if (!catalog) {
      throw new NotFoundException('Active store catalog not found');
    }

    return catalog;
  }

  private async ensureActiveCategoryInCatalog(catalogId: string, categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { catalogId_id: { catalogId, id: categoryId } },
      select: { id: true, status: true },
    });
    if (!category || category.status !== 'active') {
      throw new BadRequestException('Active category not found in active catalog');
    }
  }

  private async ensureActivePlacedProduct(catalogId: string, productId: string) {
    const placement = await this.prisma.catalogProductPlacement.findFirst({
      where: {
        catalogId,
        productId,
        status: 'active',
        product: { status: 'active' },
        category: { status: 'active' },
      },
      select: { id: true },
    });

    if (!placement) {
      throw new BadRequestException('Product must be active and placed in the active catalog before setting a price');
    }
  }

  private requirePrice(price: number): Prisma.Decimal {
    const value = typeof price === 'number' ? price : Number(price);
    if (!Number.isFinite(value) || value <= 0) {
      throw new BadRequestException('Price must be greater than 0');
    }

    return new Prisma.Decimal(value.toFixed(2));
  }

  private requireCurrency(currency: string): string {
    const normalized = typeof currency === 'string' ? currency.trim().toUpperCase() : '';
    if (!ALLOWED_CURRENCIES.includes(normalized as AllowedCurrency)) {
      throw new BadRequestException({
        message: 'Currency not supported',
        code: 'PRICE_CURRENCY_NOT_SUPPORTED',
        allowedCurrencies: ALLOWED_CURRENCIES,
        received: normalized || null,
      });
    }

    return normalized;
  }

  private parseOptionalBoolean(value: string | undefined, fieldName: string): boolean | undefined {
    if (value === undefined || value === '') {
      return undefined;
    }
    const normalizedValue = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalizedValue)) {
      return true;
    }
    if (['false', '0', 'no'].includes(normalizedValue)) {
      return false;
    }

    throw new BadRequestException(`${fieldName} must be true or false`);
  }

  private normalizeOptionalString(value: string | undefined): string | undefined {
    const normalizedValue = typeof value === 'string' ? value.trim() : '';
    return normalizedValue || undefined;
  }

  private normalizeOptionalId(value: string | undefined): string | undefined {
    const normalizedValue = typeof value === 'string' ? value.trim() : '';
    return normalizedValue || undefined;
  }

  private normalizeRequiredId(value: string, message: string): string {
    const normalizedValue = typeof value === 'string' ? value.trim() : '';
    if (!normalizedValue) {
      throw new BadRequestException(message);
    }

    return normalizedValue;
  }

  private toCatalogResponse(catalog: ActiveCatalogRecord) {
    return {
      id: catalog.id,
      storeId: catalog.storeId,
      name: catalog.name,
      status: catalog.status,
    };
  }

  private toPriceResponse(price: StoreProductPriceRecord) {
    return {
      id: price.id,
      storeId: price.storeId,
      productId: price.productId,
      price: price.price.toString(),
      currency: price.currency,
      status: price.status,
      createdAt: price.createdAt.toISOString(),
      updatedAt: price.updatedAt.toISOString(),
    };
  }

  private toPriceAuditData(price: StoreProductPriceRecord) {
    return {
      id: price.id,
      storeId: price.storeId,
      productId: price.productId,
      price: price.price.toString(),
      currency: price.currency,
      status: price.status,
    };
  }
}
