import { BadRequestException, Controller, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { getHeader } from '../auth/cookie.util';
import { CurrentUser } from '../auth/current-user.decorator';
import { RateLimit } from '../auth/rate-limit.decorator';
import { RateLimitGuard } from '../auth/rate-limit.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionGuard } from '../auth/session.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { FilesService } from './files.service';

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;

type UploadedMultipartFile = {
  originalname?: string;
  buffer?: Buffer;
  size?: number;
};

@Controller('files')
@UseGuards(SessionGuard, RolesGuard, RateLimitGuard)
@RequireRoles('admin', 'operator')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('images')
  @RateLimit({ bucket: 'upload' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
    }),
  )
  uploadImage(
    @UploadedFile() file: UploadedMultipartFile | undefined,
    @Req() request: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException('Файл изображения обязателен');
    }

    return this.filesService.uploadImage(file, user.id, this.getRequestContext(request));
  }

  private getRequestContext(request: any) {
    return {
      ipAddress: this.getRequestIp(request),
      userAgent: getHeader(request, 'user-agent'),
    };
  }

  private getRequestIp(request: any): string | undefined {
    const forwardedFor = getHeader(request, 'x-forwarded-for');
    if (forwardedFor) {
      return forwardedFor.split(',')[0]?.trim();
    }

    return request.ip ?? request.socket?.remoteAddress;
  }
}
