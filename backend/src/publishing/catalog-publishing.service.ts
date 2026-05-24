import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../logs/audit-log.service';
import type { RequestContext } from '../catalog/catalog.service';
import { CatalogPackageData, CatalogPackageService } from './catalog-package.service';
import { CatalogValidationService } from './catalog-validation.service';

export type PublishCatalogOptions = {
  /** Test-only hook used to verify database transaction rollback semantics. */
  failAfterVersionCreate?: boolean;
};

@Injectable()
export class CatalogPublishingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogService,
    private readonly catalogValidationService: CatalogValidationService,
    private readonly catalogPackageService: CatalogPackageService,
  ) {}

  async listCatalogVersions(storeId: string) {
    const normalizedStoreId = this.normalizeRequiredId(storeId);
    const currentCatalog = await this.prisma.storeCatalog.findFirst({
      where: { storeId: normalizedStoreId, status: 'active' },
      orderBy: { createdAt: 'asc' },
      select: {
        currentVersion: {
          select: {
            id: true,
            versionNumber: true,
            status: true,
            publishedAt: true,
            publishedByUserId: true,
            packageChecksum: true,
            publishedBy: { select: { fullName: true, email: true } },
          },
        },
      },
    });
    const versions = await this.prisma.catalogVersion.findMany({
      where: { storeId: normalizedStoreId },
      select: {
        id: true,
        versionNumber: true,
        status: true,
        publishedAt: true,
        publishedByUserId: true,
        packageChecksum: true,
        publishedBy: { select: { fullName: true, email: true } },
      },
      orderBy: [{ versionNumber: 'desc' }, { createdAt: 'desc' }],
    });

    const currentVersion = currentCatalog?.currentVersion ?? null;

    return {
      currentVersion: currentVersion
        ? {
            id: currentVersion.id,
            versionNumber: currentVersion.versionNumber,
            status: currentVersion.status,
            publishedAt: currentVersion.publishedAt,
            publishedBy: currentVersion.publishedBy?.fullName || currentVersion.publishedBy?.email || null,
            publishedByUserId: currentVersion.publishedByUserId,
            checksum: currentVersion.packageChecksum,
            packageChecksum: currentVersion.packageChecksum,
          }
        : null,
      versions: versions.map((version) => ({
        id: version.id,
        versionNumber: version.versionNumber,
        status: version.status,
        publishedAt: version.publishedAt,
        publishedBy: version.publishedBy?.fullName || version.publishedBy?.email || null,
        publishedByUserId: version.publishedByUserId,
        checksum: version.packageChecksum,
        packageChecksum: version.packageChecksum,
      })),
    };
  }

  async publishActiveCatalog(
    storeId: string,
    actorUser: Pick<AuthenticatedUser, 'id'> | undefined,
    context: RequestContext,
    options: PublishCatalogOptions = {},
  ) {
    const validation = await this.catalogValidationService.validateActiveCatalog(storeId);
    if (!validation.canPublish) {
      throw new BadRequestException({
        message: 'В каталоге есть блокирующие ошибки проверки, поэтому его нельзя опубликовать',
        validation,
      });
    }

    const draftPackage = await this.catalogPackageService.generateActiveCatalogPackage(storeId);
    const catalog = validation.catalog;
    const versionId = randomUUID();
    const publishedAt = new Date();

    let version;
    try {
      version = await this.prisma.$transaction(
        async (tx) => {
          const latest = await tx.catalogVersion.aggregate({
            where: { catalogId: catalog.id },
            _max: { versionNumber: true },
          });
          const versionNumber = (latest._max.versionNumber ?? 0) + 1;
          const packageDataWithVersion = this.withVersionMetadata(draftPackage.packageData, {
            id: versionId,
            versionNumber,
            publishedAt,
            checksum: null,
          });
          const packageChecksum = this.catalogPackageService.calculatePackageChecksum(packageDataWithVersion);
          const finalPackageData = this.withVersionMetadata(packageDataWithVersion, { checksum: packageChecksum });

          const createdVersion = await tx.catalogVersion.create({
            data: {
              id: versionId,
              catalogId: catalog.id,
              storeId: catalog.storeId,
              versionNumber,
              status: 'published',
              publishedByUserId: actorUser?.id,
              publishedAt,
              basedOnVersionId: catalog.currentVersionId,
              packageData: finalPackageData as unknown as Prisma.InputJsonValue,
              packageChecksum,
            },
          });

          if (options.failAfterVersionCreate) {
            throw new Error('Simulated publish failure after CatalogVersion creation');
          }

          await tx.storeCatalog.update({
            where: { id_storeId: { id: catalog.id, storeId: catalog.storeId } },
            data: { currentVersionId: createdVersion.id },
          });

          await this.auditLogs.create(tx, {
            data: {
              actorUserId: actorUser?.id,
              action: 'catalog_version.published',
              entityType: 'CatalogVersion',
              entityId: createdVersion.id,
              storeId: catalog.storeId,
              beforeData: { currentVersionId: catalog.currentVersionId },
              afterData: {
                currentVersionId: createdVersion.id,
                catalogId: catalog.id,
                versionNumber: createdVersion.versionNumber,
                packageChecksum: createdVersion.packageChecksum,
              },
              metadata: {
                validationSummary: validation.summary,
                warningCount: validation.warnings.length,
              },
              ipAddress: context.ipAddress,
              userAgent: context.userAgent,
            },
          });

          return createdVersion;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && (error.code === 'P2002' || error.code === 'P2034')
      ) {
        // Two concurrent publishes computed the same next versionNumber.
        // P2002 = unique-constraint violation on `[catalogId, versionNumber]`
        // (immediate, from `tx.catalogVersion.create`).
        // P2034 = PostgreSQL Serializable serialization_failure (surfaces at
        // COMMIT, after the callback returns). Either way the DB has rejected
        // the loser cleanly — only one CatalogVersion was actually created.
        // Convert to a 409 with a structured code so clients can refetch +
        // retry. Closes BUG-REG-070.
        throw new ConflictException({
          code: 'CATALOG_VERSION_RACE_CONFLICT',
          message: 'Кто-то уже опубликовал новую версию каталога. Обновите страницу и повторите.',
        });
      }
      throw error;
    }

    return {
      catalog: {
        id: catalog.id,
        storeId: catalog.storeId,
        previousVersionId: catalog.currentVersionId,
        currentVersionId: version.id,
      },
      version: {
        id: version.id,
        catalogId: version.catalogId,
        storeId: version.storeId,
        versionNumber: version.versionNumber,
        status: version.status,
        publishedByUserId: version.publishedByUserId,
        publishedAt: version.publishedAt,
        basedOnVersionId: version.basedOnVersionId,
        packageData: version.packageData,
        packageChecksum: version.packageChecksum,
      },
      validation,
    };
  }

  private normalizeRequiredId(id: string): string {
    const normalized = id?.trim();
    if (!normalized) {
      throw new BadRequestException('ID магазина обязателен');
    }
    return normalized;
  }

  private withVersionMetadata(
    packageData: CatalogPackageData,
    metadata: Partial<Omit<CatalogPackageData['version'], 'publishedAt'>> & { publishedAt?: string | Date | null },
  ): CatalogPackageData {
    const publishedAt = metadata.publishedAt instanceof Date ? metadata.publishedAt.toISOString() : (metadata.publishedAt ?? packageData.version.publishedAt);

    return {
      ...packageData,
      version: {
        ...packageData.version,
        ...metadata,
        publishedAt,
      },
    };
  }
}
