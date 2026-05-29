import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type ScaleSyncStatus } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../logs/audit-log.service';
import { createScaleApiToken, hashScaleApiToken, verifyScaleApiTokenHash } from './scale-token.util';

export type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

export type CreateScaleDeviceInput = {
  deviceCode: string;
  name: string;
  model?: string;
  status?: string;
};

export type UpdateScaleDeviceStatusInput = {
  status: string;
};

export type ScaleAckInput = {
  versionId?: string;
  status?: string;
  errorMessage?: string;
};

export type ScaleApiAuthResult =
  | {
      authenticated: true;
      device: {
        id: string;
        storeId: string;
        deviceCode: string;
        status: string;
      };
    }
  | { authenticated: false };

type ScaleDeviceRecord = {
  id: string;
  storeId: string;
  deviceCode: string;
  apiTokenHash: string;
  name: string;
  model: string | null;
  status: string;
  lastSeenAt: Date | null;
  lastSyncAt: Date | null;
  currentCatalogVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  syncLogs?: Array<{
    status: ScaleSyncStatus;
    errorMessage: string | null;
    requestedVersionId: string | null;
    deliveredVersionId: string | null;
    createdAt: Date;
  }>;
};

@Injectable()
export class ScalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogService = new AuditLogService(prisma),
    private readonly i18n: I18nService,
  ) {}

  async listStoreDevices(storeId: string) {
    const store = await this.findStoreById(storeId);
    const devices = await this.prisma.scaleDevice.findMany({
      where: { storeId: store.id },
      include: {
        syncLogs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            status: true,
            errorMessage: true,
            requestedVersionId: true,
            deliveredVersionId: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ status: 'asc' }, { deviceCode: 'asc' }],
    });

    return {
      devices: devices.map((device) => this.toDeviceResponse(device)),
    };
  }

  async registerDevice(storeId: string, input: CreateScaleDeviceInput, actorUserId: string, context: RequestContext) {
    const store = await this.findStoreById(storeId);
    const deviceCode = this.requireDeviceCode(input.deviceCode);
    const name = this.requireName(input.name);
    const model = this.normalizeOptionalString(input.model);
    const status = this.requireDeviceStatus(input.status ?? 'active');

    const apiToken = createScaleApiToken();
    const apiTokenHash = hashScaleApiToken(apiToken);

    try {
      const device = await this.prisma.$transaction(async (tx) => {
        const created = await tx.scaleDevice.create({
          data: {
            storeId: store.id,
            deviceCode,
            apiTokenHash,
            name,
            model,
            status,
          },
        });

        await this.auditLogs.create(tx, {
          data: {
            actorUserId,
            action: 'scale_device.created',
            entityType: 'ScaleDevice',
            entityId: created.id,
            storeId: store.id,
            afterData: {
              storeId: store.id,
              deviceCode: created.deviceCode,
              name: created.name,
              model: created.model,
              status: created.status,
              apiTokenIssued: true,
            },
            metadata: {
              storeCode: store.code,
              tokenIssued: true,
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        return created;
      });

      return {
        device: this.toDeviceResponse(device),
        apiToken,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(this.i18n.t('errors.scales.deviceCodeAlreadyExists'));
      }

      throw error;
    }
  }

  async updateDeviceStatus(deviceId: string, input: UpdateScaleDeviceStatusInput, actorUserId: string, context: RequestContext) {
    const device = await this.findDeviceById(deviceId);
    const status = this.requireDeviceStatus(input.status);

    if (device.status === status) {
      return { device: this.toDeviceResponse(device), changed: false };
    }

    const updatedDevice = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.scaleDevice.update({
        where: { id: device.id },
        data: { status },
      });

      await this.auditLogs.create(tx, {
        data: {
          actorUserId,
          action: 'scale_device.status_changed',
          entityType: 'ScaleDevice',
          entityId: device.id,
          storeId: device.storeId,
          beforeData: { status: device.status },
          afterData: { status: updated.status },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return updated;
    });

    return { device: this.toDeviceResponse(updatedDevice), changed: true };
  }

  async regenerateApiToken(deviceId: string, actorUserId: string, context: RequestContext) {
    const device = await this.findDeviceById(deviceId);
    const apiToken = createScaleApiToken();
    const apiTokenHash = hashScaleApiToken(apiToken);

    const updatedDevice = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.scaleDevice.update({
        where: { id: device.id },
        data: { apiTokenHash },
      });

      await this.auditLogs.create(tx, {
        data: {
          actorUserId,
          action: 'scale_device.api_token_regenerated',
          entityType: 'ScaleDevice',
          entityId: device.id,
          storeId: device.storeId,
          beforeData: { tokenRotated: true },
          afterData: { tokenIssued: true },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return updated;
    });

    return {
      device: this.toDeviceResponse(updatedDevice),
      apiToken,
    };
  }

  async authenticateScaleApiRequest(deviceCode: string, apiToken: string, context: RequestContext): Promise<ScaleApiAuthResult> {
    const normalizedDeviceCode = typeof deviceCode === 'string' ? deviceCode.trim().toUpperCase() : '';
    const submittedToken = typeof apiToken === 'string' ? apiToken : '';

    if (!normalizedDeviceCode || !submittedToken) {
      await this.writeScaleAuthFailureLog(null, null, 'missing_credentials', context);
      return { authenticated: false };
    }

    const device = await this.prisma.scaleDevice.findUnique({ where: { deviceCode: normalizedDeviceCode } });
    if (!device) {
      await this.writeScaleAuthFailureLog(null, null, 'invalid_credentials', context);
      return { authenticated: false };
    }

    if (!verifyScaleApiTokenHash(submittedToken, device.apiTokenHash)) {
      await this.writeScaleAuthFailureLog(device.id, device.storeId, 'invalid_credentials', context);
      return { authenticated: false };
    }

    if (device.status !== 'active') {
      await this.writeScaleAuthFailureLog(device.id, device.storeId, `device_${device.status}`, context);
      throw new ForbiddenException({
        message: this.i18n.t('errors.scales.deviceNotActive', { lang: 'ru' }),
        error: 'Forbidden',
        code: 'SCALE_DEVICE_NOT_ACTIVE',
        statusCode: 403,
      });
    }

    await this.prisma.scaleDevice.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date() },
    });

    return {
      authenticated: true,
      device: {
        id: device.id,
        storeId: device.storeId,
        deviceCode: device.deviceCode,
        status: device.status,
      },
    };
  }

  getScaleApiAuthCheck(device: { id: string; storeId: string; deviceCode: string; status: string }) {
    return {
      authenticated: true,
      device: {
        id: device.id,
        storeId: device.storeId,
        deviceCode: device.deviceCode,
        status: device.status,
      },
    };
  }

  async checkScaleUpdate(device: { id: string; storeId: string }, currentCatalogVersionId: string | undefined, context: RequestContext) {
    const normalizedRequestedVersionId = this.normalizeOptionalUuid(currentCatalogVersionId, 'currentCatalogVersionId');
    const now = new Date();

    const activeCatalog = await this.prisma.storeCatalog.findFirst({
      where: { storeId: device.storeId, status: 'active' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        currentVersionId: true,
        currentVersion: {
          select: {
            id: true,
            versionNumber: true,
            packageChecksum: true,
            packageData: true,
          },
        },
      },
    });

    if (!activeCatalog) {
      throw new NotFoundException(this.i18n.t('errors.catalog.activeCatalogNotFound'));
    }

    let requestedVersionId: string | null = normalizedRequestedVersionId;
    let unknownRequestedVersionMessage: string | null = null;
    if (requestedVersionId !== null) {
      const existingVersion = await this.prisma.catalogVersion.findUnique({
        where: { id: requestedVersionId },
        select: { id: true },
      });
      if (!existingVersion) {
        unknownRequestedVersionMessage = `Неизвестная версия каталога в requestedVersionId: ${requestedVersionId}`;
        requestedVersionId = null;
      }
    }

    const currentVersion = activeCatalog.currentVersion;
    const currentVersionId = activeCatalog.currentVersionId;
    const hasUpdate = Boolean(currentVersionId && requestedVersionId !== currentVersionId);
    const deliveryVersion = hasUpdate ? currentVersion : null;
    if (hasUpdate && !deliveryVersion) {
      throw new NotFoundException(this.i18n.t('errors.scales.currentCatalogVersionNotFound'));
    }

    const logStatus: ScaleSyncStatus = hasUpdate ? 'package_delivered' : 'no_update';

    await this.prisma.$transaction(async (tx) => {
      await tx.scaleDevice.update({
        where: { id: device.id },
        data: { lastSeenAt: now },
      });

      await tx.scaleSyncLog.create({
        data: {
          scaleDeviceId: device.id,
          storeId: device.storeId,
          requestedVersionId,
          deliveredVersionId: hasUpdate ? currentVersionId : null,
          status: logStatus,
          errorMessage: unknownRequestedVersionMessage,
          requestIp: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    });

    if (!hasUpdate) {
      return {
        hasUpdate: false,
        currentVersionId,
      };
    }

    if (!deliveryVersion) {
      throw new NotFoundException(this.i18n.t('errors.scales.currentCatalogVersionNotFound'));
    }

    return {
      hasUpdate: true,
      versionId: deliveryVersion.id,
      versionNumber: deliveryVersion.versionNumber,
      packageChecksum: deliveryVersion.packageChecksum,
      packageData: deliveryVersion.packageData,
    };
  }

  async acknowledgeScaleCatalogVersion(device: { id: string; storeId: string }, input: ScaleAckInput, context: RequestContext) {
    const versionId = this.requireUuid(input.versionId, 'versionId');
    const status = this.requireAckStatus(input.status);
    const errorMessage = status === 'error' ? this.normalizeErrorMessage(input.errorMessage) : null;
    const now = new Date();

    const catalogVersion = await this.prisma.catalogVersion.findFirst({
      where: { id: versionId, storeId: device.storeId },
      select: { id: true, versionNumber: true, packageChecksum: true },
    });
    if (!catalogVersion) {
      throw new NotFoundException(this.i18n.t('errors.scales.catalogVersionNotFound'));
    }

    await this.prisma.$transaction(async (tx) => {
      if (status === 'success') {
        await tx.scaleDevice.update({
          where: { id: device.id },
          data: {
            currentCatalogVersionId: catalogVersion.id,
            lastSyncAt: now,
          },
        });
      }

      await tx.scaleSyncLog.create({
        data: {
          scaleDeviceId: device.id,
          storeId: device.storeId,
          requestedVersionId: null,
          deliveredVersionId: catalogVersion.id,
          status: status === 'success' ? 'ack_received' : 'error',
          errorMessage,
          requestIp: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      if (status === 'success') {
        await this.auditLogs.create(tx, {
          data: {
            actorUserId: null,
            action: 'scale_device.catalog_version_acknowledged',
            entityType: 'ScaleDevice',
            entityId: device.id,
            storeId: device.storeId,
            afterData: {
              currentCatalogVersionId: catalogVersion.id,
              lastSyncAt: now.toISOString(),
            },
            metadata: {
              versionId: catalogVersion.id,
              versionNumber: catalogVersion.versionNumber,
              packageChecksum: catalogVersion.packageChecksum,
              ackStatus: 'success',
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });
      }
    });

    return {
      acknowledged: true,
      status,
      versionId: catalogVersion.id,
      lastSyncAt: status === 'success' ? now.toISOString() : null,
    };
  }

  private async writeScaleAuthFailureLog(
    scaleDeviceId: string | null,
    storeId: string | null,
    reason: 'missing_credentials' | 'invalid_credentials' | string,
    context: RequestContext,
  ) {
    await this.prisma.scaleSyncLog.create({
      data: {
        scaleDeviceId,
        storeId,
        status: 'auth_failed',
        errorMessage: reason,
        requestIp: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
  }

  private async findStoreById(storeId: string) {
    if (!storeId) {
      throw new BadRequestException(this.i18n.t('errors.stores.storeIdRequired'));
    }

    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store || store.status === 'archived') {
      throw new NotFoundException(this.i18n.t('errors.stores.storeNotFound'));
    }

    return store;
  }

  private async findDeviceById(deviceId: string): Promise<ScaleDeviceRecord> {
    if (!deviceId) {
      throw new BadRequestException(this.i18n.t('errors.scales.deviceIdRequired'));
    }

    const device = await this.prisma.scaleDevice.findUnique({ where: { id: deviceId } });
    if (!device) {
      throw new NotFoundException(this.i18n.t('errors.scales.deviceNotFound'));
    }

    return device;
  }

  private requireDeviceCode(deviceCode: string): string {
    const normalizedCode = typeof deviceCode === 'string' ? deviceCode.trim().toUpperCase() : '';
    if (!normalizedCode || normalizedCode.length > 128) {
      throw new BadRequestException(this.i18n.t('errors.scales.deviceCodeTooLongOrEmpty'));
    }

    return normalizedCode;
  }

  private requireName(name: string): string {
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    if (!normalizedName || normalizedName.length > 255) {
      throw new BadRequestException(this.i18n.t('errors.scales.deviceNameTooLongOrEmpty'));
    }

    return normalizedName;
  }

  private requireDeviceStatus(status: string): 'active' | 'inactive' | 'blocked' | 'archived' {
    if (status === 'active' || status === 'inactive' || status === 'blocked' || status === 'archived') {
      return status;
    }

    throw new BadRequestException(this.i18n.t('errors.scales.invalidStatus'));
  }

  private normalizeOptionalUuid(value: string | undefined, fieldName: string): string | null {
    const normalizedValue = typeof value === 'string' ? value.trim() : '';
    if (!normalizedValue) {
      return null;
    }

    return this.requireUuid(normalizedValue, fieldName);
  }

  private requireUuid(value: string | undefined, fieldName: string): string {
    const normalizedValue = typeof value === 'string' ? value.trim() : '';
    if (!normalizedValue) {
      throw new BadRequestException(this.i18n.t('errors.scales.fieldRequired', { args: { field: fieldName } }));
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedValue)) {
      throw new BadRequestException(this.i18n.t('errors.scales.fieldMustBeUuid', { args: { field: fieldName } }));
    }

    return normalizedValue;
  }

  private requireAckStatus(status: string | undefined): 'success' | 'error' {
    if (status === 'success' || status === 'error') {
      return status;
    }

    throw new BadRequestException(this.i18n.t('errors.scales.invalidAckStatus', { lang: 'ru' }));
  }

  private normalizeErrorMessage(errorMessage: string | undefined): string | null {
    const normalizedValue = typeof errorMessage === 'string' ? errorMessage.trim() : '';
    if (!normalizedValue) {
      return null;
    }

    return normalizedValue
      .replace(/(apiToken\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]')
      .replace(/(api_token\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]')
      .slice(0, 1000);
  }

  private normalizeOptionalString(value: string | undefined): string | null {
    const normalizedValue = typeof value === 'string' ? value.trim() : '';
    return normalizedValue || null;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private toDeviceResponse(device: ScaleDeviceRecord) {
    const latestSyncLog = device.syncLogs?.[0] ?? null;
    const hasSyncError = latestSyncLog?.status === 'error' || latestSyncLog?.status === 'auth_failed';

    return {
      id: device.id,
      storeId: device.storeId,
      deviceCode: device.deviceCode,
      name: device.name,
      model: device.model,
      status: device.status,
      lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
      lastSyncAt: device.lastSyncAt?.toISOString() ?? null,
      currentCatalogVersionId: device.currentCatalogVersionId,
      lastSyncStatus: latestSyncLog?.status ?? null,
      lastSyncError: hasSyncError
        ? {
            status: latestSyncLog.status,
            message: latestSyncLog.errorMessage,
            requestedVersionId: latestSyncLog.requestedVersionId,
            deliveredVersionId: latestSyncLog.deliveredVersionId,
            createdAt: latestSyncLog.createdAt.toISOString(),
          }
        : null,
      createdAt: device.createdAt.toISOString(),
      updatedAt: device.updatedAt.toISOString(),
    };
  }
}
