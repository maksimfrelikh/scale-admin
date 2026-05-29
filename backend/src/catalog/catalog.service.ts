import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CategoryStatus, PlacementStatus, Prisma, ProductStatus } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../logs/audit-log.service';
import { CascadeArchiveService, type CascadeSummary } from '../shared/cascade-archive.service';

export type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

export type CreateCategoryInput = {
  name: string;
  shortName?: string;
  parentId?: string;
  sortOrder?: number;
  status?: string;
};

export type UpdateCategoryInput = {
  name?: string;
  shortName?: string;
  parentId?: string | null;
  sortOrder?: number;
  status?: string;
};

export type ReorderCategoriesInput = {
  parentId?: string | null;
  categoryIds: string[];
};

export type ListCategoryTreeInput = {
  status?: string;
};

export type ListPlacementsInput = {
  categoryId?: string;
  status?: string;
};

export type CreatePlacementInput = {
  categoryId: string;
  productId: string;
  sortOrder?: number;
  status?: string;
};

export type UpdatePlacementInput = {
  categoryId?: string;
  sortOrder?: number;
  status?: string;
};

export type MovePlacementInput = {
  categoryId: string;
  sortOrder?: number;
};

export type ReorderPlacementsInput = {
  categoryId: string;
  placementIds: string[];
};

type ActiveCatalogRecord = {
  id: string;
  storeId: string;
  name: string;
  status: string;
};

type CategoryRecord = {
  id: string;
  catalogId: string;
  parentId: string | null;
  name: string;
  shortName: string;
  sortOrder: number;
  status: CategoryStatus;
  createdAt: Date;
  updatedAt: Date;
};

type ProductRecord = {
  id: string;
  defaultPluCode: string;
  name: string;
  shortName: string;
  status: ProductStatus;
};

type PlacementRecord = {
  id: string;
  catalogId: string;
  categoryId: string;
  productId: string;
  sortOrder: number;
  status: PlacementStatus;
  createdAt: Date;
  updatedAt: Date;
  category?: {
    id: string;
    name: string;
    shortName: string;
    status: CategoryStatus;
  };
  product?: ProductRecord;
};

type CategoryTreeNode = ReturnType<CatalogService['toCategoryResponse']> & { children: CategoryTreeNode[] };

const MAX_CATEGORY_DEPTH = 3;

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogService,
    private readonly cascadeArchive: CascadeArchiveService,
    private readonly i18n: I18nService,
  ) {}

  async listCategoryTree(storeId: string, input: ListCategoryTreeInput = {}) {
    const catalog = await this.findActiveCatalog(storeId);
    const status = input.status ? this.requireCategoryStatus(input.status) : undefined;
    const categories = await this.prisma.category.findMany({
      where: {
        catalogId: catalog.id,
        ...(status ? { status } : {}),
      },
      orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });

    return {
      catalog: this.toCatalogResponse(catalog),
      categories: this.buildCategoryTree(categories),
    };
  }

  async createCategory(storeId: string, input: CreateCategoryInput, actorUserId: string, context: RequestContext) {
    const catalog = await this.findActiveCatalog(storeId);
    const parentId = this.normalizeOptionalId(input.parentId);
    const parent = parentId ? await this.findCategoryInCatalog(catalog.id, parentId, this.i18n.t('errors.catalog.parentCategoryNotFound')) : null;
    const depth = parent ? (await this.getCategoryDepth(catalog.id, parent.id)) + 1 : 1;
    if (depth > MAX_CATEGORY_DEPTH) {
      throw new BadRequestException(this.i18n.t('errors.catalog.maxCategoryDepthExceeded', { args: { max: MAX_CATEGORY_DEPTH } }));
    }

    const data: Prisma.CategoryUncheckedCreateInput = {
      catalogId: catalog.id,
      parentId: parent?.id ?? null,
      name: this.requireName(input.name),
      shortName: this.requireShortName(input.shortName ?? input.name),
      sortOrder: this.requireSortOrder(input.sortOrder ?? 0),
      status: this.requireCategoryStatus(input.status ?? 'active'),
    };

    const created = await this.prisma.$transaction(async (tx) => {
      const category = await tx.category.create({ data });
      await this.auditLogs.create(tx, {
        data: {
          actorUserId,
          action: 'category.created',
          entityType: 'Category',
          entityId: category.id,
          storeId: catalog.storeId,
          afterData: this.toCategoryAuditData(category),
          metadata: {
            catalogId: catalog.id,
            canAcceptActivePlacements: this.canAcceptActivePlacements(category),
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
      return category;
    });

    return { category: this.toCategoryResponse(created) };
  }

  async updateCategory(
    storeId: string,
    categoryId: string,
    input: UpdateCategoryInput,
    actorUserId: string,
    context: RequestContext,
  ) {
    const catalog = await this.findActiveCatalog(storeId);
    const category = await this.findCategoryInCatalog(catalog.id, categoryId, this.i18n.t('errors.catalog.categoryNotFound'));
    const data: Prisma.CategoryUncheckedUpdateInput = {};
    let action = 'category.updated';

    if (input.name !== undefined) {
      data.name = this.requireName(input.name);
    }
    if (input.shortName !== undefined) {
      data.shortName = this.requireShortName(input.shortName);
    }
    if (input.sortOrder !== undefined) {
      data.sortOrder = this.requireSortOrder(input.sortOrder);
      action = 'category.reordered';
    }
    if (input.status !== undefined) {
      data.status = this.requireCategoryStatus(input.status);
      action = data.status === 'archived' ? 'category.archived' : 'category.status_changed';
    }
    if (input.parentId !== undefined) {
      const nextParentId = this.normalizeOptionalId(input.parentId);
      if (nextParentId === category.id) {
        throw new BadRequestException(this.i18n.t('errors.catalog.categoryCannotBeOwnParent'));
      }
      if (nextParentId) {
        const parent = await this.findCategoryInCatalog(catalog.id, nextParentId, this.i18n.t('errors.catalog.parentCategoryNotFound'));
        const isDescendant = await this.isDescendant(catalog.id, parent.id, category.id);
        if (isDescendant) {
          throw new BadRequestException(this.i18n.t('errors.catalog.parentChangeCreatesCycle'));
        }
        const subtreeDepth = await this.getSubtreeDepth(catalog.id, category.id);
        const parentDepth = await this.getCategoryDepth(catalog.id, parent.id);
        if (parentDepth + subtreeDepth > MAX_CATEGORY_DEPTH) {
          throw new BadRequestException(this.i18n.t('errors.catalog.maxCategoryDepthExceeded', { args: { max: MAX_CATEGORY_DEPTH } }));
        }
      } else {
        const subtreeDepth = await this.getSubtreeDepth(catalog.id, category.id);
        if (subtreeDepth > MAX_CATEGORY_DEPTH) {
          throw new BadRequestException(this.i18n.t('errors.catalog.maxCategoryDepthExceeded', { args: { max: MAX_CATEGORY_DEPTH } }));
        }
      }
      data.parentId = nextParentId;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException(this.i18n.t('errors.catalog.noCategoryFieldsToUpdate'));
    }

    const isCascadeArchive = data.status === 'archived' && category.status !== 'archived';

    const { updated, cascadeSummary } = await this.prisma.$transaction(
      async (tx) => {
        const result = await tx.category.update({ where: { catalogId_id: { catalogId: catalog.id, id: category.id } }, data });

        let summary: CascadeSummary | null = null;
        if (isCascadeArchive) {
          summary = await this.cascadeArchive.cascadeCategoryArchive(
            tx,
            catalog.id,
            category.id,
            catalog.storeId,
            actorUserId,
            context,
          );
        }

        await this.auditLogs.create(tx, {
          data: {
            actorUserId,
            action,
            entityType: 'Category',
            entityId: category.id,
            storeId: catalog.storeId,
            beforeData: this.toCategoryAuditData(category),
            afterData: this.toCategoryAuditData(result),
            metadata: {
              catalogId: catalog.id,
              canAcceptActivePlacements: this.canAcceptActivePlacements(result),
              ...(summary
                ? {
                    cascade: {
                      correlationId: summary.correlationId,
                      counts: {
                        categories: summary.categories.length,
                        placements: summary.placements.length,
                      },
                    },
                  }
                : {}),
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });
        return { updated: result, cascadeSummary: summary };
      },
      isCascadeArchive
        ? { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        : undefined,
    );

    return { category: this.toCategoryResponse(updated), cascade: cascadeSummary };
  }

  async reorderCategories(storeId: string, input: ReorderCategoriesInput, actorUserId: string, context: RequestContext) {
    const catalog = await this.findActiveCatalog(storeId);
    const parentId = this.normalizeOptionalId(input.parentId);
    const categoryIds = input.categoryIds.map((id) => this.normalizeRequiredId(id, this.i18n.t('errors.catalog.categoryIdRequired')));
    if (categoryIds.length === 0) {
      throw new BadRequestException(this.i18n.t('errors.catalog.categoryIdsCannotBeEmpty'));
    }
    if (new Set(categoryIds).size !== categoryIds.length) {
      throw new BadRequestException(this.i18n.t('errors.catalog.categoryIdsCannotContainDuplicates'));
    }

    if (parentId) {
      await this.findCategoryInCatalog(catalog.id, parentId, this.i18n.t('errors.catalog.parentCategoryNotFound'));
    }

    const categories = await this.prisma.category.findMany({
      where: {
        catalogId: catalog.id,
        parentId: parentId ?? null,
        id: { in: categoryIds },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    if (categories.length !== categoryIds.length) {
      throw new BadRequestException(this.i18n.t('errors.catalog.categoriesMustShareCatalogAndLevel'));
    }

    const beforeData = categories.map((category) => this.toCategoryAuditData(category));
    const orderById = new Map(categoryIds.map((id, index) => [id, index]));

    const updatedCategories = await this.prisma.$transaction(async (tx) => {
      await Promise.all(
        categoryIds.map((id, index) =>
          tx.category.update({
            where: { catalogId_id: { catalogId: catalog.id, id } },
            data: { sortOrder: index },
          }),
        ),
      );

      const updated = await tx.category.findMany({
        where: { catalogId: catalog.id, parentId: parentId ?? null, id: { in: categoryIds } },
      });
      updated.sort((a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0));

      await this.auditLogs.create(tx, {
        data: {
          actorUserId,
          action: 'category.reordered',
          entityType: 'Category',
          entityId: parentId,
          storeId: catalog.storeId,
          beforeData,
          afterData: updated.map((category) => this.toCategoryAuditData(category)),
          metadata: { catalogId: catalog.id, parentId, categoryIds },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return updated;
    });

    return { categories: updatedCategories.map((category) => this.toCategoryResponse(category)) };
  }


  async listPlacements(storeId: string, input: ListPlacementsInput) {
    const catalog = await this.findActiveCatalog(storeId);
    const categoryId = this.normalizeOptionalId(input.categoryId);
    const status = input.status ? this.requirePlacementStatus(input.status) : undefined;

    if (categoryId) {
      await this.findCategoryInCatalog(catalog.id, categoryId, this.i18n.t('errors.catalog.categoryNotFound'));
    }

    const placements = await this.prisma.catalogProductPlacement.findMany({
      where: {
        catalogId: catalog.id,
        ...(categoryId ? { categoryId } : {}),
        ...(status ? { status } : {}),
        ...(status === 'active'
          ? { product: { status: 'active' }, category: { status: 'active' } }
          : {}),
      },
      include: {
        category: { select: { id: true, name: true, shortName: true, status: true } },
        product: { select: { id: true, defaultPluCode: true, name: true, shortName: true, status: true } },
      },
      orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      catalog: this.toCatalogResponse(catalog),
      placements: placements.map((placement) => this.toPlacementResponse(placement)),
    };
  }

  async createPlacement(storeId: string, input: CreatePlacementInput, actorUserId: string, context: RequestContext) {
    const catalog = await this.findActiveCatalog(storeId);
    const category = await this.findCategoryInCatalog(catalog.id, input.categoryId, this.i18n.t('errors.catalog.categoryNotFound'));
    const product = await this.findProductById(input.productId);
    const status = this.requirePlacementStatus(input.status ?? 'active');
    this.assertActivePlacementAllowed(status, category, product);

    const existingActivePlacement =
      status === 'active' ? await this.findActivePlacementForProduct(catalog.id, product.id) : null;
    if (existingActivePlacement) {
      throw new ConflictException({
        message: this.i18n.t('errors.catalog.activePlacementExistsCreate'),
        code: 'ACTIVE_PLACEMENT_EXISTS',
        moveRequired: true,
        existingPlacement: this.toPlacementResponse(existingActivePlacement),
      });
    }

    const data: Prisma.CatalogProductPlacementUncheckedCreateInput = {
      catalogId: catalog.id,
      categoryId: category.id,
      productId: product.id,
      sortOrder: this.requireSortOrder(input.sortOrder ?? 0),
      status,
    };

    const placement = await this.prisma.$transaction(async (tx) => {
      const created = await tx.catalogProductPlacement.create({ data });
      await this.auditLogs.create(tx, {
        data: {
          actorUserId,
          action: 'placement.created',
          entityType: 'CatalogProductPlacement',
          entityId: created.id,
          storeId: catalog.storeId,
          afterData: this.toPlacementAuditData(created),
          metadata: { catalogId: catalog.id, categoryId: category.id, productId: product.id },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
      return created;
    });

    return { placement: this.toPlacementResponse(placement) };
  }

  async getPlacement(storeId: string, placementId: string) {
    const catalog = await this.findActiveCatalog(storeId);
    const placement = await this.findPlacementInCatalog(catalog.id, placementId);
    return { placement: this.toPlacementResponse(placement) };
  }

  async updatePlacement(
    storeId: string,
    placementId: string,
    input: UpdatePlacementInput,
    actorUserId: string,
    context: RequestContext,
  ) {
    const catalog = await this.findActiveCatalog(storeId);
    const placement = await this.findPlacementInCatalog(catalog.id, placementId);
    const data: Prisma.CatalogProductPlacementUncheckedUpdateInput = {};
    let action = 'placement.updated';

    const nextStatus = input.status ? this.requirePlacementStatus(input.status) : placement.status;
    let nextCategory = placement.category ?? (await this.findCategoryInCatalog(catalog.id, placement.categoryId, this.i18n.t('errors.catalog.categoryNotFound')));
    const product = placement.product ?? (await this.findProductById(placement.productId));

    if (input.categoryId !== undefined) {
      nextCategory = await this.findCategoryInCatalog(catalog.id, input.categoryId, this.i18n.t('errors.catalog.categoryNotFound'));
      data.categoryId = nextCategory.id;
      action = 'placement.moved';
    }
    if (input.sortOrder !== undefined) {
      data.sortOrder = this.requireSortOrder(input.sortOrder);
      if (action === 'placement.updated') {
        action = 'placement.reordered';
      }
    }
    if (input.status !== undefined) {
      data.status = nextStatus;
      action = nextStatus === 'archived' ? 'placement.archived' : 'placement.status_changed';
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException(this.i18n.t('errors.catalog.noPlacementFieldsToUpdate'));
    }

    this.assertActivePlacementAllowed(nextStatus, nextCategory, product);
    if (nextStatus === 'active') {
      const existingActivePlacement = await this.findActivePlacementForProduct(catalog.id, product.id, placement.id);
      if (existingActivePlacement) {
        throw new ConflictException({
          message: this.i18n.t('errors.catalog.activePlacementExistsUpdate'),
          code: 'ACTIVE_PLACEMENT_EXISTS',
          moveRequired: true,
          existingPlacement: this.toPlacementResponse(existingActivePlacement),
        });
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.catalogProductPlacement.update({ where: { id: placement.id }, data });
      await this.auditLogs.create(tx, {
        data: {
          actorUserId,
          action,
          entityType: 'CatalogProductPlacement',
          entityId: placement.id,
          storeId: catalog.storeId,
          beforeData: this.toPlacementAuditData(placement),
          afterData: this.toPlacementAuditData(result),
          metadata: { catalogId: catalog.id, productId: placement.productId },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
      return result;
    });

    return { placement: this.toPlacementResponse(updated) };
  }

  async movePlacement(
    storeId: string,
    placementId: string,
    input: MovePlacementInput,
    actorUserId: string,
    context: RequestContext,
  ) {
    return this.updatePlacement(storeId, placementId, { categoryId: input.categoryId, sortOrder: input.sortOrder }, actorUserId, context);
  }

  async reorderPlacements(storeId: string, input: ReorderPlacementsInput, actorUserId: string, context: RequestContext) {
    const catalog = await this.findActiveCatalog(storeId);
    const category = await this.findCategoryInCatalog(catalog.id, input.categoryId, this.i18n.t('errors.catalog.categoryNotFound'));
    const placementIds = input.placementIds.map((id) => this.normalizeRequiredId(id, this.i18n.t('errors.catalog.placementIdRequired')));
    if (placementIds.length === 0) {
      throw new BadRequestException(this.i18n.t('errors.catalog.placementIdsCannotBeEmpty'));
    }
    if (new Set(placementIds).size !== placementIds.length) {
      throw new BadRequestException(this.i18n.t('errors.catalog.placementIdsCannotContainDuplicates'));
    }

    const placements = await this.prisma.catalogProductPlacement.findMany({
      where: { catalogId: catalog.id, categoryId: category.id, id: { in: placementIds } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (placements.length !== placementIds.length) {
      throw new BadRequestException(this.i18n.t('errors.catalog.placementsMustShareCatalogAndCategory'));
    }

    const beforeData = placements.map((placement) => this.toPlacementAuditData(placement));
    const orderById = new Map(placementIds.map((id, index) => [id, index]));

    const updatedPlacements = await this.prisma.$transaction(async (tx) => {
      await Promise.all(
        placementIds.map((id, index) =>
          tx.catalogProductPlacement.update({
            where: { id },
            data: { sortOrder: index },
          }),
        ),
      );

      const updated = await tx.catalogProductPlacement.findMany({
        where: { catalogId: catalog.id, categoryId: category.id, id: { in: placementIds } },
      });
      updated.sort((a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0));

      await this.auditLogs.create(tx, {
        data: {
          actorUserId,
          action: 'placement.reordered',
          entityType: 'CatalogProductPlacement',
          entityId: category.id,
          storeId: catalog.storeId,
          beforeData,
          afterData: updated.map((placement) => this.toPlacementAuditData(placement)),
          metadata: { catalogId: catalog.id, categoryId: category.id, placementIds },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return updated;
    });

    return { placements: updatedPlacements.map((placement) => this.toPlacementResponse(placement)) };
  }

  private async findActiveCatalog(storeId: string): Promise<ActiveCatalogRecord> {
    const normalizedStoreId = this.normalizeRequiredId(storeId, this.i18n.t('errors.catalog.storeIdRequired'));
    const catalog = await this.prisma.storeCatalog.findFirst({
      where: { storeId: normalizedStoreId, status: 'active' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, storeId: true, name: true, status: true },
    });

    if (!catalog) {
      throw new NotFoundException(this.i18n.t('errors.catalog.activeCatalogNotFound'));
    }

    return catalog;
  }

  private async findCategoryInCatalog(catalogId: string, categoryId: string, message: string): Promise<CategoryRecord> {
    const normalizedCategoryId = this.normalizeRequiredId(categoryId, this.i18n.t('errors.catalog.categoryIdRequired'));
    const category = await this.prisma.category.findUnique({
      where: { catalogId_id: { catalogId, id: normalizedCategoryId } },
    });

    if (!category) {
      throw new BadRequestException(message);
    }

    return category;
  }

  private async getCategoryDepth(catalogId: string, categoryId: string): Promise<number> {
    let depth = 0;
    let currentId: string | null = categoryId;
    const seen = new Set<string>();

    while (currentId) {
      if (seen.has(currentId)) {
        throw new BadRequestException(this.i18n.t('errors.catalog.categoryCycleDetected'));
      }
      seen.add(currentId);
      const category: { id: string; parentId: string | null } | null = await this.prisma.category.findUnique({
        where: { catalogId_id: { catalogId, id: currentId } },
        select: { id: true, parentId: true },
      });
      if (!category) {
        throw new BadRequestException(this.i18n.t('errors.catalog.categoryNotFound'));
      }
      depth += 1;
      currentId = category.parentId;
    }

    return depth;
  }

  private async getSubtreeDepth(catalogId: string, categoryId: string): Promise<number> {
    const categories = await this.prisma.category.findMany({ where: { catalogId }, select: { id: true, parentId: true } });
    const childrenByParent = new Map<string, string[]>();
    for (const category of categories) {
      if (!category.parentId) {
        continue;
      }
      const children = childrenByParent.get(category.parentId) ?? [];
      children.push(category.id);
      childrenByParent.set(category.parentId, children);
    }

    const walk = (id: string, seen: Set<string>): number => {
      if (seen.has(id)) {
        throw new BadRequestException(this.i18n.t('errors.catalog.categoryCycleDetected'));
      }
      seen.add(id);
      const children = childrenByParent.get(id) ?? [];
      if (children.length === 0) {
        return 1;
      }

      return 1 + Math.max(...children.map((childId) => walk(childId, new Set(seen))));
    };

    return walk(categoryId, new Set<string>());
  }

  private async isDescendant(catalogId: string, possibleDescendantId: string, ancestorId: string): Promise<boolean> {
    let currentId: string | null = possibleDescendantId;
    const seen = new Set<string>();

    while (currentId) {
      if (currentId === ancestorId) {
        return true;
      }
      if (seen.has(currentId)) {
        throw new BadRequestException(this.i18n.t('errors.catalog.categoryCycleDetected'));
      }
      seen.add(currentId);
      const category: { parentId: string | null } | null = await this.prisma.category.findUnique({
        where: { catalogId_id: { catalogId, id: currentId } },
        select: { parentId: true },
      });
      currentId = category?.parentId ?? null;
    }

    return false;
  }


  private async findProductById(productId: string): Promise<ProductRecord> {
    const normalizedProductId = this.normalizeRequiredId(productId, this.i18n.t('errors.catalog.productIdRequired'));
    const product = await this.prisma.product.findUnique({
      where: { id: normalizedProductId },
      select: { id: true, defaultPluCode: true, name: true, shortName: true, status: true },
    });

    if (!product) {
      throw new BadRequestException(this.i18n.t('errors.catalog.productNotFound'));
    }

    return product;
  }

  private async findPlacementInCatalog(catalogId: string, placementId: string): Promise<PlacementRecord> {
    const normalizedPlacementId = this.normalizeRequiredId(placementId, this.i18n.t('errors.catalog.placementIdRequired'));
    const placement = await this.prisma.catalogProductPlacement.findFirst({
      where: { id: normalizedPlacementId, catalogId },
      include: {
        category: { select: { id: true, name: true, shortName: true, status: true } },
        product: { select: { id: true, defaultPluCode: true, name: true, shortName: true, status: true } },
      },
    });

    if (!placement) {
      throw new NotFoundException(this.i18n.t('errors.catalog.placementNotFound'));
    }

    return placement;
  }

  private findActivePlacementForProduct(catalogId: string, productId: string, excludePlacementId?: string): Promise<PlacementRecord | null> {
    return this.prisma.catalogProductPlacement.findFirst({
      where: {
        catalogId,
        productId,
        status: 'active',
        ...(excludePlacementId ? { id: { not: excludePlacementId } } : {}),
      },
      include: {
        category: { select: { id: true, name: true, shortName: true, status: true } },
        product: { select: { id: true, defaultPluCode: true, name: true, shortName: true, status: true } },
      },
    });
  }

  private assertActivePlacementAllowed(status: PlacementStatus, category: { status: CategoryStatus }, product: { status: ProductStatus }) {
    if (status !== 'active') {
      return;
    }
    if (product.status !== 'active') {
      throw new BadRequestException(this.i18n.t('errors.catalog.activePlacementProductMustBeActive'));
    }
    if (category.status !== 'active') {
      throw new BadRequestException(this.i18n.t('errors.catalog.activePlacementCategoryMustBeActive'));
    }
  }

  private buildCategoryTree(categories: CategoryRecord[]): CategoryTreeNode[] {
    const nodes = new Map<string, CategoryTreeNode>();
    for (const category of categories) {
      nodes.set(category.id, { ...this.toCategoryResponse(category), children: [] });
    }

    const roots: CategoryTreeNode[] = [];
    for (const category of categories) {
      const node = nodes.get(category.id)!;
      if (category.parentId && nodes.has(category.parentId)) {
        nodes.get(category.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    const sortTree = (items: CategoryTreeNode[]) => {
      items.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      for (const item of items) {
        sortTree(item.children);
      }
    };
    sortTree(roots);

    return roots;
  }

  private requireName(name: string): string {
    const normalizedValue = typeof name === 'string' ? name.trim() : '';
    if (!normalizedValue || normalizedValue.length > 255) {
      throw new BadRequestException(this.i18n.t('errors.catalog.categoryNameTooLongOrEmpty'));
    }

    return normalizedValue;
  }

  private requireShortName(shortName: string): string {
    const normalizedValue = typeof shortName === 'string' ? shortName.trim() : '';
    if (!normalizedValue || normalizedValue.length > 128) {
      throw new BadRequestException(this.i18n.t('errors.catalog.categoryShortNameTooLongOrEmpty'));
    }

    return normalizedValue;
  }

  private requireSortOrder(sortOrder: number): number {
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 1_000_000) {
      throw new BadRequestException(this.i18n.t('errors.catalog.invalidSortOrder'));
    }

    return sortOrder;
  }

  private requireCategoryStatus(status: string): CategoryStatus {
    const normalizedValue = typeof status === 'string' ? status.trim().toLowerCase() : '';
    if (!['active', 'inactive', 'archived'].includes(normalizedValue)) {
      throw new BadRequestException(this.i18n.t('errors.catalog.invalidCategoryStatus'));
    }

    return normalizedValue as CategoryStatus;
  }

  private requirePlacementStatus(status: string): PlacementStatus {
    const normalizedValue = typeof status === 'string' ? status.trim().toLowerCase() : '';
    if (!['active', 'inactive', 'archived'].includes(normalizedValue)) {
      throw new BadRequestException(this.i18n.t('errors.catalog.invalidPlacementStatus'));
    }

    return normalizedValue as PlacementStatus;
  }

  private normalizeOptionalId(value: string | null | undefined): string | null {
    if (value === null) {
      return null;
    }

    const normalizedValue = typeof value === 'string' ? value.trim() : '';
    return normalizedValue || null;
  }

  private normalizeRequiredId(value: string, message: string): string {
    const normalizedValue = typeof value === 'string' ? value.trim() : '';
    if (!normalizedValue) {
      throw new BadRequestException(message);
    }

    return normalizedValue;
  }

  private canAcceptActivePlacements(category: { status: CategoryStatus }): boolean {
    return category.status === 'active';
  }

  private toCatalogResponse(catalog: ActiveCatalogRecord) {
    return {
      id: catalog.id,
      storeId: catalog.storeId,
      name: catalog.name,
      status: catalog.status,
    };
  }

  private toCategoryResponse(category: CategoryRecord) {
    return {
      id: category.id,
      catalogId: category.catalogId,
      parentId: category.parentId,
      name: category.name,
      shortName: category.shortName,
      sortOrder: category.sortOrder,
      status: category.status,
      canAcceptActivePlacements: this.canAcceptActivePlacements(category),
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    };
  }

  private toCategoryAuditData(category: CategoryRecord) {
    return {
      id: category.id,
      catalogId: category.catalogId,
      parentId: category.parentId,
      name: category.name,
      shortName: category.shortName,
      sortOrder: category.sortOrder,
      status: category.status,
      canAcceptActivePlacements: this.canAcceptActivePlacements(category),
    };
  }

  private toPlacementResponse(placement: PlacementRecord) {
    return {
      id: placement.id,
      catalogId: placement.catalogId,
      categoryId: placement.categoryId,
      productId: placement.productId,
      sortOrder: placement.sortOrder,
      status: placement.status,
      category: placement.category
        ? {
            id: placement.category.id,
            name: placement.category.name,
            shortName: placement.category.shortName,
            status: placement.category.status,
          }
        : undefined,
      product: placement.product
        ? {
            id: placement.product.id,
            defaultPluCode: placement.product.defaultPluCode,
            name: placement.product.name,
            shortName: placement.product.shortName,
            status: placement.product.status,
          }
        : undefined,
      createdAt: placement.createdAt.toISOString(),
      updatedAt: placement.updatedAt.toISOString(),
    };
  }

  private toPlacementAuditData(placement: PlacementRecord) {
    return {
      id: placement.id,
      catalogId: placement.catalogId,
      categoryId: placement.categoryId,
      productId: placement.productId,
      sortOrder: placement.sortOrder,
      status: placement.status,
    };
  }
}
