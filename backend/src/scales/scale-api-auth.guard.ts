import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { getHeader } from '../auth/cookie.util';
import { ScalesService, type RequestContext } from './scales.service';

export type AuthenticatedScaleDevice = {
  id: string;
  storeId: string;
  deviceCode: string;
  status: string;
};

@Injectable()
export class ScaleApiAuthGuard implements CanActivate {
  constructor(private readonly scalesService: ScalesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      ip?: string;
      socket?: { remoteAddress?: string };
      headers?: Record<string, string | string[] | undefined>;
      body?: { deviceCode?: unknown; apiToken?: unknown };
      scaleDevice?: AuthenticatedScaleDevice;
    }>();

    const deviceCode = this.readCredential(request, 'deviceCode', 'x-scale-device-code');
    const apiToken = this.readCredential(request, 'apiToken', 'x-scale-api-token');

    const result = await this.scalesService.authenticateScaleApiRequest(deviceCode, apiToken, this.getRequestContext(request));
    if (!result.authenticated) {
      throw new UnauthorizedException({
        message: 'Авторизация Scale API не выполнена',
        error: 'Unauthorized',
        code: 'SCALE_API_AUTH_FAILED',
        statusCode: 401,
      });
    }

    request.scaleDevice = result.device;
    return true;
  }

  private readCredential(
    request: {
      headers?: Record<string, string | string[] | undefined>;
      body?: Record<string, unknown>;
    },
    fieldName: 'deviceCode' | 'apiToken',
    headerName: string,
  ): string {
    const bodyValue = request.body?.[fieldName];
    if (typeof bodyValue === 'string') {
      return bodyValue;
    }

    const headerValue = getHeader(request, headerName);
    if (headerValue) {
      return headerValue;
    }

    return '';
  }

  private getRequestContext(request: {
    ip?: string;
    socket?: { remoteAddress?: string };
    headers?: Record<string, string | string[] | undefined>;
  }): RequestContext {
    const forwardedFor = getHeader(request, 'x-forwarded-for');
    return {
      ipAddress: forwardedFor?.split(',')[0]?.trim() || request.ip || request.socket?.remoteAddress,
      userAgent: getHeader(request, 'user-agent'),
    };
  }
}
