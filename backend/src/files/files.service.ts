import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { extname, join, relative } from 'path';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../logs/audit-log.service';

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;
const IMAGE_UPLOAD_PUBLIC_PREFIX = '/uploads/images';
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

type UploadedMultipartFile = {
  originalname?: string;
  buffer?: Buffer;
  size?: number;
};

export type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

type DetectedImageType = {
  extension: 'jpg' | 'png' | 'webp';
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
};

@Injectable()
export class FilesService {
  private readonly imageUploadDirectory: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogService,
    private readonly i18n: I18nService,
  ) {
    const uploadRoot = process.env.FILE_UPLOAD_DIR || join(process.cwd(), 'uploads');
    this.imageUploadDirectory = join(uploadRoot, 'images');
  }

  async uploadImage(file: UploadedMultipartFile | undefined, actorUserId: string, context: RequestContext) {
    if (!file?.buffer || file.buffer.length === 0) {
      throw new BadRequestException(this.i18n.t('errors.files.imageFileRequired'));
    }

    const buffer = file.buffer;

    if (buffer.length > MAX_IMAGE_SIZE_BYTES || (file.size !== undefined && file.size > MAX_IMAGE_SIZE_BYTES)) {
      throw new BadRequestException(this.i18n.t('errors.files.imageTooLarge'));
    }

    const originalFilename = this.requireOriginalFilename(file.originalname);
    const uploadedExtension = this.getAllowedExtension(originalFilename);
    const detectedType = this.detectImageType(buffer);

    if (!detectedType) {
      throw new BadRequestException(this.i18n.t('errors.files.unsupportedImageType'));
    }

    if (!this.extensionMatchesType(uploadedExtension, detectedType)) {
      throw new BadRequestException(this.i18n.t('errors.files.extensionMismatch'));
    }

    await mkdir(this.imageUploadDirectory, { recursive: true });

    const storedFilename = `${randomUUID()}.${detectedType.extension}`;
    const storagePath = join(this.imageUploadDirectory, storedFilename);
    const publicUrl = `${IMAGE_UPLOAD_PUBLIC_PREFIX}/${storedFilename}`;
    let fileWritten = false;

    try {
      await writeFile(storagePath, buffer, { flag: 'wx' });
      fileWritten = true;

      const asset = await this.prisma.$transaction(async (tx) => {
        const created = await tx.fileAsset.create({
          data: {
            originalFileName: originalFilename,
            storagePath: this.toPortableStoragePath(storagePath),
            publicUrl,
            mimeType: detectedType.mimeType,
            sizeBytes: BigInt(buffer.length),
            uploadedByUserId: actorUserId,
          },
        });

        await this.auditLogs.create(tx, {
          data: {
            actorUserId,
            action: 'file.uploaded',
            entityType: 'FileAsset',
            entityId: created.id,
            afterData: {
              id: created.id,
              originalFileName: created.originalFileName,
              storedFilename,
              publicUrl: created.publicUrl,
              mimeType: created.mimeType,
              sizeBytes: Number(created.sizeBytes),
            },
            metadata: {
              uploadKind: 'image',
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        return created;
      });

      return {
        fileAsset: {
          id: asset.id,
          originalFileName: asset.originalFileName,
          storedFilename,
          storagePath: asset.storagePath,
          publicUrl: asset.publicUrl,
          mimeType: asset.mimeType,
          sizeBytes: Number(asset.sizeBytes),
          uploadedByUserId: asset.uploadedByUserId,
          createdAt: asset.createdAt,
        },
      };
    } catch (error) {
      if (fileWritten) {
        await unlink(storagePath).catch(() => undefined);
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException(this.i18n.t('errors.files.uploadFailed'));
    }
  }

  private requireOriginalFilename(originalFilename: string | undefined): string {
    const normalized = typeof originalFilename === 'string' ? originalFilename.trim() : '';
    if (!normalized || normalized.length > 255) {
      throw new BadRequestException(this.i18n.t('errors.files.filenameTooLongOrEmpty'));
    }

    return normalized;
  }

  private getAllowedExtension(filename: string): string {
    const extension = extname(filename).slice(1).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      throw new BadRequestException(this.i18n.t('errors.files.unsupportedImageExtension'));
    }

    return extension;
  }

  private detectImageType(buffer: Buffer): DetectedImageType | null {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { extension: 'jpg', mimeType: 'image/jpeg' };
    }

    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return { extension: 'png', mimeType: 'image/png' };
    }

    if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return { extension: 'webp', mimeType: 'image/webp' };
    }

    return null;
  }

  private extensionMatchesType(extension: string, detectedType: DetectedImageType): boolean {
    if (detectedType.extension === 'jpg') {
      return extension === 'jpg' || extension === 'jpeg';
    }

    return extension === detectedType.extension;
  }

  private toPortableStoragePath(storagePath: string): string {
    return relative(process.cwd(), storagePath).split('\\').join('/');
  }
}
