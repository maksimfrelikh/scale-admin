import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import type { AppConfiguration } from './config/app.config';
import { buildStartupBanner } from './config/startup-banner';
import type { EnvironmentVariables } from './config/environment.validation';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  const appConfig = configService.getOrThrow<AppConfiguration>('app');

  app.enableCors({
    origin: appConfig.frontendOrigin,
    credentials: true,
  });
  app.useStaticAssets(process.env.FILE_UPLOAD_DIR || join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });
  app.setGlobalPrefix('api');

  await app.listen(appConfig.port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  const env: EnvironmentVariables = {
    NODE_ENV: appConfig.nodeEnv as EnvironmentVariables['NODE_ENV'],
    PORT: appConfig.port,
    DATABASE_URL: appConfig.databaseUrl,
    FRONTEND_ORIGIN: appConfig.frontendOrigin,
    SESSION_COOKIE_NAME: appConfig.sessionCookieName,
    SESSION_IDLE_TIMEOUT_MINUTES: appConfig.sessionIdleTimeoutMinutes,
    SESSION_ABSOLUTE_TIMEOUT_DAYS: appConfig.sessionAbsoluteTimeoutDays,
    CSRF_COOKIE_NAME: appConfig.csrfCookieName,
    CSRF_HEADER_NAME: appConfig.csrfHeaderName,
    AUTH_RATE_LIMIT_WINDOW_SECONDS: appConfig.authRateLimitWindowSeconds,
    AUTH_LOGIN_RATE_LIMIT_MAX: appConfig.authLoginRateLimitMax,
    AUTH_ACTION_RATE_LIMIT_MAX: appConfig.authActionRateLimitMax,
    AUTH_FAILED_LOGIN_MAX_ATTEMPTS: appConfig.authFailedLoginMaxAttempts,
    AUTH_FAILED_LOGIN_LOCK_MINUTES: appConfig.authFailedLoginLockMinutes,
    PASSWORD_RESET_TOKEN_TTL_MINUTES: appConfig.passwordResetTokenTtlMinutes,
  };
  for (const line of buildStartupBanner(env)) {
    logger.log(line);
  }
}

bootstrap();
