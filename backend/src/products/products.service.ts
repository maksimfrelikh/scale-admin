import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../logs/audit-log.service';
import { CascadeArchiveService, type CascadeSummary } from '../shared/cascade-archive.service';
import { buildMeta, parseLimit, parseOffset } from '../shared/pagination';

export type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

export type CreateProductInput = {
  defaultPluCode: string;
  name: string;
  shortName: string;
  unit: string;
  status: string;
  description?: string;
  imageUrl?: string;
  imageFileAssetId?: string;
  barcode?: string;
  sku?: string;
};

export type UpdateProductInput = Partial<CreateProductInput>;

export type ListProductsInput = {
  search?: string;
  status?: string;
  limit?: string;
  offset?: string;
  take?: string;
  skip?: string;
};

type ProductRecord = {
  id: string;
  defaultPluCode: string;
  name: string;
  shortName: string;
  description: string | null;
  imageUrl: string | null;
  imageFileAssetId: string | null;
  barcode: string | null;
  sku: string | null;
  unit: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogService,
    private readonly cascadeArchive: CascadeArchiveService,
    private readonly i18n: I18nService,
  ) {}

  async listProducts(input: ListProductsInput) {
    const search = this.normalizeOptionalString(input.search);
    const status = input.status ? this.requireProductStatus(input.status) : undefined;
    const limit = parseLimit(input.limit ?? input.take);
    const offset = parseOffset(input.offset ?? input.skip);

    const where: Prisma.ProductWhereInput = {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { shortName: { contains: search, mode: 'insensitive' } },
              { defaultPluCode: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
              { barcode: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: [{ name: 'asc' }, { defaultPluCode: 'asc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: products.map((product) => this.toProductResponse(product, 0)),
      meta: buildMeta(total, limit, offset),
    };
  }

  async getProduct(productId: string) {
    const product = await this.findProductById(productId);
    const activePlacementCount = await this.countActivePlacements(product.id);
    return { product: this.toProductResponse(product, activePlacementCount) };
  }

  async createProduct(input: CreateProductInput, actorUserId: string, context: RequestContext) {
    const data: Prisma.ProductCreateInput = {
      defaultPluCode: this.requireDefaultPluCode(input.defaultPluCode),
      name: this.requireName(input.name),
      shortName: this.requireShortName(input.shortName),
      unit: this.requireProductUnit(input.unit),
      status: this.requireProductStatus(input.status),
      description: this.normalizeOptionalString(input.description),
      imageUrl: this.normalizeOptionalString(input.imageUrl),
      imageFileAsset: input.imageFileAssetId
        ? {
            connect: { id: input.imageFileAssetId },
          }
        : undefined,
      barcode: this.normalizeOptionalString(input.barcode),
      sku: this.normalizeOptionalString(input.sku),
    };

    try {
      const product = await this.prisma.$transaction(async (tx) => {
        const created = await tx.product.create({ data });
        await this.auditLogs.create(tx, {
          data: {
            actorUserId,
            action: 'product.created',
            entityType: 'Product',
            entityId: created.id,
            afterData: this.toProductAuditData(created),
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });
        return created;
      });

      return { product: this.toProductResponse(product, 0) };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(this.i18n.t('errors.products.productPluAlreadyExists'));
      }

      throw error;
    }
  }

  async updateProduct(productId: string, input: UpdateProductInput, actorUserId: string, context: RequestContext) {
    const product = await this.findProductById(productId);
    const data: Prisma.ProductUpdateInput = {};

    if (input.defaultPluCode !== undefined) {
      data.defaultPluCode = this.requireDefaultPluCode(input.defaultPluCode);
    }
    if (input.name !== undefined) {
      data.name = this.requireName(input.name);
    }
    if (input.shortName !== undefined) {
      data.shortName = this.requireShortName(input.shortName);
    }
    if (input.description !== undefined) {
      data.description = this.normalizeOptionalString(input.description);
    }
    if (input.imageUrl !== undefined) {
      data.imageUrl = this.normalizeOptionalString(input.imageUrl);
    }
    if (input.imageFileAssetId !== undefined) {
      data.imageFileAsset = input.imageFileAssetId ? { connect: { id: input.imageFileAssetId } } : { disconnect: true };
    }
    if (input.barcode !== undefined) {
      data.barcode = this.normalizeOptionalString(input.barcode);
    }
    if (input.sku !== undefined) {
      data.sku = this.normalizeOptionalString(input.sku);
    }
    if (input.unit !== undefined) {
      data.unit = this.requireProductUnit(input.unit);
    }
    if (input.status !== undefined) {
      data.status = this.requireProductStatus(input.status);
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException(this.i18n.t('errors.products.noFieldsToUpdate'));
    }

    const activePlacementCount = await this.countActivePlacements(product.id);
    const warning = activePlacementCount > 0 ? this.getUsedProductWarning(activePlacementCount) : null;
    const isCascadeArchive = data.status === 'archived' && product.status !== 'archived';

    try {
      const { updated: updatedProduct, cascadeSummary } = await this.prisma.$transaction(
        async (tx) => {
          const updatedRow = await tx.product.update({
            where: { id: product.id },
            data,
          });

          let summary: CascadeSummary | null = null;
          if (isCascadeArchive) {
            summary = await this.cascadeArchive.cascadeProductArchive(tx, product.id, actorUserId, context);
          }

          await this.auditLogs.create(tx, {
            data: {
              actorUserId,
              action: isCascadeArchive ? 'product.archived' : 'product.updated',
              entityType: 'Product',
              entityId: product.id,
              beforeData: this.toProductAuditData(product),
              afterData: this.toProductAuditData(updatedRow),
              metadata:
                warning || summary
                  ? {
                      ...(warning ? { warning } : {}),
                      ...(summary
                        ? {
                            cascade: {
                              correlationId: summary.correlationId,
                              counts: {
                                placements: summary.placements.length,
                                prices: summary.prices.length,
                              },
                            },
                          }
                        : {}),
                    }
                  : undefined,
              ipAddress: context.ipAddress,
              userAgent: context.userAgent,
            },
          });

          return { updated: updatedRow, cascadeSummary: summary };
        },
        isCascadeArchive
          ? { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
          : undefined,
      );

      const finalActivePlacementCount = isCascadeArchive ? 0 : activePlacementCount;
      return {
        product: this.toProductResponse(updatedProduct, finalActivePlacementCount),
        warning,
        cascade: cascadeSummary,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(this.i18n.t('errors.products.productPluAlreadyExists'));
      }

      throw error;
    }
  }

  private async findProductById(productId: string): Promise<ProductRecord> {
    if (!productId) {
      throw new BadRequestException(this.i18n.t('errors.products.productIdRequired'));
    }

    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException(this.i18n.t('errors.products.productNotFound'));
    }

    return product;
  }

  private countActivePlacements(productId: string): Promise<number> {
    return this.prisma.catalogProductPlacement.count({
      where: {
        productId,
        status: 'active',
      },
    });
  }

  private requireDefaultPluCode(defaultPluCode: string): string {
    const normalizedValue = typeof defaultPluCode === 'string' ? defaultPluCode.trim().toUpperCase() : '';
    if (!normalizedValue || normalizedValue.length > 64) {
      throw new BadRequestException(this.i18n.t('errors.products.pluCodeTooLongOrEmpty'));
    }

    return normalizedValue;
  }

  private requireName(name: string): string {
    const normalizedValue = typeof name === 'string' ? name.trim() : '';
    if (!normalizedValue || normalizedValue.length > 255) {
      throw new BadRequestException(this.i18n.t('errors.products.nameTooLongOrEmpty'));
    }

    return normalizedValue;
  }

  private requireShortName(shortName: string): string {
    const normalizedValue = typeof shortName === 'string' ? shortName.trim() : '';
    if (!normalizedValue || normalizedValue.length > 128) {
      throw new BadRequestException(this.i18n.t('errors.products.shortNameTooLongOrEmpty'));
    }

    return normalizedValue;
  }

  private requireProductUnit(unit: string): 'kg' | 'g' | 'piece' {
    if (unit === 'kg' || unit === 'g' || unit === 'piece') {
      return unit;
    }

    throw new BadRequestException(this.i18n.t('errors.products.invalidUnit'));
  }

  private requireProductStatus(status: string): 'active' | 'inactive' | 'archived' {
    if (status === 'active' || status === 'inactive' || status === 'archived') {
      return status;
    }

    throw new BadRequestException(this.i18n.t('errors.products.invalidStatus'));
  }

  private normalizeOptionalString(value: string | undefined): string | null {
    const normalizedValue = typeof value === 'string' ? value.trim() : '';
    return normalizedValue || null;
  }

  private getUsedProductWarning(activePlacementCount: number) {
    return {
      code: 'PRODUCT_USED_IN_ACTIVE_CATALOG_PLACEMENTS',
      message: 'Товар используется в активных размещениях каталога; изменение может повлиять на потребителей каталога.',
      activePlacementCount,
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private toProductResponse(product: ProductRecord, activePlacementCount: number) {
    return {
      id: product.id,
      defaultPluCode: product.defaultPluCode,
      name: product.name,
      shortName: product.shortName,
      description: product.description,
      imageUrl: product.imageUrl,
      imageFileAssetId: product.imageFileAssetId,
      barcode: product.barcode,
      sku: product.sku,
      unit: product.unit,
      status: product.status,
      unavailableForNewActivePlacements: product.status === 'archived',
      activePlacementCount,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  private toProductAuditData(product: ProductRecord) {
    return {
      defaultPluCode: product.defaultPluCode,
      name: product.name,
      shortName: product.shortName,
      description: product.description,
      imageUrl: product.imageUrl,
      imageFileAssetId: product.imageFileAssetId,
      barcode: product.barcode,
      sku: product.sku,
      unit: product.unit,
      status: product.status,
    };
  }
}
