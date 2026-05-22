import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../logs/audit-log.service';
import { CascadeArchiveService, type CascadeSummary } from '../shared/cascade-archive.service';
import type { AuthenticatedUser } from '../auth/auth.types';

export type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

export type CreateStoreInput = {
  code: string;
  name: string;
  address?: string;
  timezone?: string;
  status?: string;
};

export type UpdateStoreInput = Partial<CreateStoreInput>;

type StoreRecord = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  timezone: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogService,
    private readonly cascadeArchive: CascadeArchiveService,
  ) {}

  async listVisibleStores(user: AuthenticatedUser) {
    const stores = await this.prisma.store.findMany({
      where:
        user.role === 'admin'
          ? { status: { not: 'archived' } }
          : {
              status: { not: 'archived' },
              userAccesses: {
                some: {
                  userId: user.id,
                  revokedAt: null,
                },
              },
            },
      orderBy: [{ name: 'asc' }, { code: 'asc' }],
    });

    return {
      stores: stores.map((store) => this.toStoreResponse(store)),
    };
  }

  async getStore(storeId: string) {
    const store = await this.findStoreById(storeId);
    return { store: this.toStoreResponse(store) };
  }

  async getStoreDetails(storeId: string) {
    const store = await this.findStoreById(storeId);
    const [activeCatalog, catalogCount, scaleDeviceCount, activeScaleDeviceCount, recentSyncLogs] = await Promise.all([
      this.prisma.storeCatalog.findFirst({
        where: {
          storeId: store.id,
          status: 'active',
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.storeCatalog.count({ where: { storeId: store.id } }),
      this.prisma.scaleDevice.count({ where: { storeId: store.id } }),
      this.prisma.scaleDevice.count({ where: { storeId: store.id, status: 'active' } }),
      this.prisma.scaleSyncLog.findMany({
        where: { storeId: store.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          status: true,
          errorMessage: true,
          requestedVersionId: true,
          deliveredVersionId: true,
          createdAt: true,
        },
      }),
    ]);

    if (!activeCatalog) {
      throw new NotFoundException('Активный каталог магазина не найден');
    }

    return {
      store: this.toStoreResponse(store),
      activeCatalog: {
        id: activeCatalog.id,
        storeId: activeCatalog.storeId,
        name: activeCatalog.name,
        status: activeCatalog.status,
        currentVersionId: activeCatalog.currentVersionId,
        createdAt: activeCatalog.createdAt.toISOString(),
        updatedAt: activeCatalog.updatedAt.toISOString(),
      },
      overview: {
        catalogCount,
        activeCatalogId: activeCatalog.id,
        currentVersionId: activeCatalog.currentVersionId,
        scaleDeviceCount,
        activeScaleDeviceCount,
        recentSyncLogCount: recentSyncLogs.length,
      },
      scales: {
        total: scaleDeviceCount,
        active: activeScaleDeviceCount,
      },
      syncLogs: {
        recent: recentSyncLogs.map((log) => ({
          id: log.id,
          status: log.status,
          errorMessage: log.errorMessage,
          requestedVersionId: log.requestedVersionId,
          deliveredVersionId: log.deliveredVersionId,
          createdAt: log.createdAt.toISOString(),
        })),
      },
    };
  }

  async createStore(input: CreateStoreInput, actorUserId: string, context: RequestContext) {
    const code = this.requireCode(input.code);
    const name = this.requireName(input.name);
    const address = this.normalizeOptionalString(input.address);
    const timezone = this.requireTimezone(input.timezone);
    const status = this.requireStoreStatus(input.status ?? 'active');

    const existingStore = await this.prisma.store.findUnique({ where: { code }, select: { id: true } });
    if (existingStore) {
      throw new ConflictException('Магазин с таким кодом уже существует');
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const store = await tx.store.create({
          data: {
            code,
            name,
            address,
            timezone,
            status,
          },
        });

        const catalog =
          status === 'active'
            ? await tx.storeCatalog.create({
                data: {
                  storeId: store.id,
                  name: 'Основной каталог',
                  status: 'active',
                },
              })
            : null;

        await this.auditLogs.create(tx, {
          data: {
            actorUserId,
            action: 'store.created',
            entityType: 'Store',
            entityId: store.id,
            storeId: store.id,
            afterData: {
              code: store.code,
              name: store.name,
              address: store.address,
              timezone: store.timezone,
              status: store.status,
              mainCatalogId: catalog?.id ?? null,
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        return { store, catalog };
      });

      return {
        store: this.toStoreResponse(result.store),
        mainCatalog: result.catalog
          ? {
              id: result.catalog.id,
              storeId: result.catalog.storeId,
              name: result.catalog.name,
              status: result.catalog.status,
              currentVersionId: result.catalog.currentVersionId,
              createdAt: result.catalog.createdAt.toISOString(),
              updatedAt: result.catalog.updatedAt.toISOString(),
            }
          : null,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Магазин с таким кодом уже существует');
      }

      throw error;
    }
  }

  async updateStore(storeId: string, input: UpdateStoreInput, actorUserId: string, context: RequestContext) {
    const store = await this.findStoreById(storeId);
    const data: Prisma.StoreUpdateInput = {};

    if (input.code !== undefined) {
      data.code = this.requireCode(input.code);
    }
    if (input.name !== undefined) {
      data.name = this.requireName(input.name);
    }
    if (input.address !== undefined) {
      data.address = this.normalizeOptionalString(input.address);
    }
    if (input.timezone !== undefined) {
      data.timezone = this.requireTimezone(input.timezone);
    }
    if (input.status !== undefined) {
      data.status = this.requireStoreStatus(input.status);
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Укажите хотя бы одно поле магазина');
    }

    const isCascadeArchive = data.status === 'archived' && store.status !== 'archived';

    try {
      const { updated, cascadeSummary } = await this.prisma.$transaction(
        async (tx) => {
          const updatedRow = await tx.store.update({
            where: { id: store.id },
            data,
          });

          let summary: CascadeSummary | null = null;
          if (isCascadeArchive) {
            summary = await this.cascadeArchive.cascadeStoreArchive(tx, store.id, actorUserId, context);
          }

          await this.auditLogs.create(tx, {
            data: {
              actorUserId,
              action: isCascadeArchive ? 'store.archived' : 'store.updated',
              entityType: 'Store',
              entityId: store.id,
              storeId: store.id,
              beforeData: this.toStoreAuditData(store),
              afterData: this.toStoreAuditData(updatedRow),
              metadata: summary
                ? {
                    cascade: {
                      correlationId: summary.correlationId,
                      counts: {
                        categories: summary.categories.length,
                        placements: summary.placements.length,
                        prices: summary.prices.length,
                        banners: summary.banners.length,
                        scaleDevices: summary.scaleDevices.length,
                      },
                    },
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

      return { store: this.toStoreResponse(updated), cascade: cascadeSummary };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Магазин с таким кодом уже существует');
      }

      throw error;
    }
  }

  private async findStoreById(storeId: string): Promise<StoreRecord> {
    if (!storeId) {
      throw new BadRequestException('ID магазина обязателен');
    }

    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      throw new NotFoundException('Магазин не найден');
    }

    return store;
  }

  private requireCode(code: string): string {
    const normalizedCode = typeof code === 'string' ? code.trim().toUpperCase() : '';
    if (!normalizedCode || normalizedCode.length > 64) {
      throw new BadRequestException('Код магазина обязателен и должен быть не длиннее 64 символов');
    }

    return normalizedCode;
  }

  private requireName(name: string): string {
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    if (!normalizedName || normalizedName.length > 255) {
      throw new BadRequestException('Название магазина обязательно и должно быть не длиннее 255 символов');
    }

    return normalizedName;
  }

  private requireTimezone(timezone: string | undefined): string {
    const normalizedTimezone = typeof timezone === 'string' && timezone.trim() ? timezone.trim() : 'Europe/Moscow';
    if (normalizedTimezone.length > 128) {
      throw new BadRequestException('Часовой пояс магазина должен быть не длиннее 128 символов');
    }

    return normalizedTimezone;
  }

  private requireStoreStatus(status: string): 'active' | 'inactive' | 'archived' {
    if (status === 'active' || status === 'inactive' || status === 'archived') {
      return status;
    }

    throw new BadRequestException('Статус магазина должен быть active, inactive или archived');
  }

  private normalizeOptionalString(value: string | undefined): string | null {
    const normalizedValue = typeof value === 'string' ? value.trim() : '';
    return normalizedValue || null;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private toStoreResponse(store: StoreRecord) {
    return {
      id: store.id,
      code: store.code,
      name: store.name,
      address: store.address,
      timezone: store.timezone,
      status: store.status,
      createdAt: store.createdAt.toISOString(),
      updatedAt: store.updatedAt.toISOString(),
    };
  }

  private toStoreAuditData(store: StoreRecord) {
    return {
      code: store.code,
      name: store.name,
      address: store.address,
      timezone: store.timezone,
      status: store.status,
    };
  }
}
