import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BannerStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../logs/audit-log.service';
import { buildMeta, parseLimit, parseOffset } from '../shared/pagination';
import { validateBannerImageUrl } from './image-url.util';

export type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

export type ListBannersInput = {
  status?: string;
  limit?: string;
  offset?: string;
};

export type CreateBannerInput = {
  imageUrl: string;
  imageFileAssetId?: string;
  status?: string;
  sortOrder?: number;
};

export type UpdateBannerInput = {
  imageUrl?: string;
  imageFileAssetId?: string | null;
  status?: string;
  sortOrder?: number;
};

export type ChangeBannerStatusInput = {
  status: string;
};

export type ReorderBannersInput = {
  bannerIds: string[];
};

type BannerRecord = {
  id: string;
  storeId: string;
  imageUrl: string;
  imageFileAssetId: string | null;
  status: BannerStatus;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class AdvertisingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogService,
  ) {}

  async listBanners(storeId: string, input: ListBannersInput = {}) {
    const status = input.status ? this.requireBannerStatus(input.status) : undefined;
    const limit = parseLimit(input.limit);
    const offset = parseOffset(input.offset);
    const where: Prisma.AdvertisingBannerWhereInput = { storeId, ...(status ? { status } : {}) };

    const [banners, total] = await Promise.all([
      this.prisma.advertisingBanner.findMany({
        where,
        orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        skip: offset,
        take: limit,
      }),
      this.prisma.advertisingBanner.count({ where }),
    ]);

    return {
      data: banners.map((banner) => this.toBannerResponse(banner)),
      meta: buildMeta(total, limit, offset),
    };
  }

  async getBanner(storeId: string, bannerId: string) {
    const banner = await this.findBanner(storeId, bannerId);
    return { banner: this.toBannerResponse(banner) };
  }

  async createBanner(storeId: string, input: CreateBannerInput, actorUserId: string, context: RequestContext) {
    const data: Prisma.AdvertisingBannerUncheckedCreateInput = {
      storeId,
      imageUrl: this.requireImageUrl(input.imageUrl),
      imageFileAssetId: this.normalizeOptionalId(input.imageFileAssetId) ?? null,
      status: this.requireBannerStatus(input.status ?? 'active'),
      sortOrder: this.requireSortOrder(input.sortOrder ?? 0),
    };

    await this.assertFileAssetExists(data.imageFileAssetId);

    const created = await this.prisma.$transaction(async (tx) => {
      const banner = await tx.advertisingBanner.create({ data });
      await this.auditLogs.create(tx, {
        data: {
          actorUserId,
          action: 'advertising_banner.created',
          entityType: 'AdvertisingBanner',
          entityId: banner.id,
          storeId,
          afterData: this.toBannerAuditData(banner),
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
      return banner;
    });

    return { banner: this.toBannerResponse(created) };
  }

  async updateBanner(
    storeId: string,
    bannerId: string,
    input: UpdateBannerInput,
    actorUserId: string,
    context: RequestContext,
  ) {
    const existing = await this.findBanner(storeId, bannerId);
    const data: Prisma.AdvertisingBannerUncheckedUpdateInput = {};
    let action = 'advertising_banner.updated';

    if (input.imageUrl !== undefined) {
      data.imageUrl = this.requireImageUrl(input.imageUrl);
    }
    if (input.imageFileAssetId !== undefined) {
      data.imageFileAssetId = input.imageFileAssetId === null ? null : this.normalizeOptionalId(input.imageFileAssetId);
      await this.assertFileAssetExists(data.imageFileAssetId ?? null);
    }
    if (input.status !== undefined) {
      data.status = this.requireBannerStatus(input.status);
      action = data.status === 'archived' ? 'advertising_banner.archived' : 'advertising_banner.status_changed';
    }
    if (input.sortOrder !== undefined) {
      data.sortOrder = this.requireSortOrder(input.sortOrder);
      action = 'advertising_banner.reordered';
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Укажите хотя бы одно поле баннера');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const banner = await tx.advertisingBanner.update({ where: { id: existing.id }, data });
      await this.auditLogs.create(tx, {
        data: {
          actorUserId,
          action,
          entityType: 'AdvertisingBanner',
          entityId: banner.id,
          storeId,
          beforeData: this.toBannerAuditData(existing),
          afterData: this.toBannerAuditData(banner),
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
      return banner;
    });

    return { banner: this.toBannerResponse(updated) };
  }

  async changeBannerStatus(
    storeId: string,
    bannerId: string,
    input: ChangeBannerStatusInput,
    actorUserId: string,
    context: RequestContext,
  ) {
    return this.updateBanner(storeId, bannerId, { status: input.status }, actorUserId, context);
  }

  async reorderBanners(storeId: string, input: ReorderBannersInput, actorUserId: string, context: RequestContext) {
    if (!Array.isArray(input.bannerIds) || input.bannerIds.length === 0) {
      throw new BadRequestException('bannerIds должен содержать хотя бы один ID баннера');
    }

    const bannerIds = input.bannerIds.map((id) => this.requireId(id, 'ID баннера обязателен'));
    if (new Set(bannerIds).size !== bannerIds.length) {
      throw new BadRequestException('bannerIds не должен содержать дубликаты');
    }

    const existing = await this.prisma.advertisingBanner.findMany({
      where: { storeId, id: { in: bannerIds } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (existing.length !== bannerIds.length) {
      throw new NotFoundException('Один или несколько баннеров не найдены для магазина');
    }

    const beforeById = new Map(existing.map((banner) => [banner.id, banner]));
    const updated = await this.prisma.$transaction(async (tx) => {
      const banners: BannerRecord[] = [];
      for (const [index, bannerId] of bannerIds.entries()) {
        const banner = await tx.advertisingBanner.update({
          where: { id: bannerId },
          data: { sortOrder: index },
        });
        banners.push(banner);
      }
      await this.auditLogs.create(tx, {
        data: {
          actorUserId,
          action: 'advertising_banner.reordered',
          entityType: 'AdvertisingBanner',
          entityId: null,
          storeId,
          beforeData: existing.map((banner) => this.toBannerAuditData(banner)),
          afterData: banners.map((banner) => this.toBannerAuditData(banner)),
          metadata: { bannerIds },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
      return banners.map((banner) => ({ ...banner, status: beforeById.get(banner.id)?.status ?? banner.status }));
    });

    return { banners: updated.map((banner) => this.toBannerResponse(banner)) };
  }

  private async assertFileAssetExists(imageFileAssetId: string | null | undefined): Promise<void> {
    if (!imageFileAssetId) {
      return;
    }
    const exists = await this.prisma.fileAsset.findUnique({
      where: { id: imageFileAssetId },
      select: { id: true },
    });
    if (!exists) {
      throw new BadRequestException({
        code: 'FILE_ASSET_NOT_FOUND',
        message: 'imageFileAssetId ссылается на отсутствующий файл',
      });
    }
  }

  private async findBanner(storeId: string, bannerId: string): Promise<BannerRecord> {
    const id = this.requireId(bannerId, 'ID баннера обязателен');
    const banner = await this.prisma.advertisingBanner.findFirst({ where: { id, storeId } });
    if (!banner) {
      throw new NotFoundException('Баннер не найден для магазина');
    }
    return banner;
  }

  private requireImageUrl(value: string): string {
    const result = validateBannerImageUrl(value);
    if (!result.valid) {
      throw new BadRequestException(result.reason);
    }
    return result.value;
  }

  private requireBannerStatus(status: string): BannerStatus {
    if (!Object.values(BannerStatus).includes(status as BannerStatus)) {
      throw new BadRequestException('Статус баннера не поддерживается');
    }
    return status as BannerStatus;
  }

  private requireSortOrder(sortOrder: number): number {
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      throw new BadRequestException('sortOrder должен быть неотрицательным целым числом');
    }
    return sortOrder;
  }

  private requireId(value: string, message: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(message);
    }
    return value.trim();
  }

  private normalizeOptionalId(value: string | undefined): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private toBannerResponse(banner: BannerRecord) {
    return {
      id: banner.id,
      storeId: banner.storeId,
      imageUrl: banner.imageUrl,
      imageFileAssetId: banner.imageFileAssetId,
      status: banner.status,
      sortOrder: banner.sortOrder,
      createdAt: banner.createdAt,
      updatedAt: banner.updatedAt,
    };
  }

  private toBannerAuditData(banner: BannerRecord) {
    return {
      id: banner.id,
      storeId: banner.storeId,
      imageUrl: banner.imageUrl,
      imageFileAssetId: banner.imageFileAssetId,
      status: banner.status,
      sortOrder: banner.sortOrder,
    };
  }
}
