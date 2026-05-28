import { Module } from '@nestjs/common';
import { join } from 'path';
import { HeaderResolver, I18nJsonLoader, I18nModule } from 'nestjs-i18n';
import { AdvertisingModule } from './advertising/advertising.module';
import { AppConfigModule } from './config/config.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { EmailModule } from './email/email.module';
import { FilesModule } from './files/files.module';
import { HealthController } from './health.controller';
import { LogsModule } from './logs/logs.module';
import { MetricsModule } from './metrics/metrics.module';
import { PricesModule } from './prices/prices.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { PublishingModule } from './publishing/publishing.module';
import { ScalesModule } from './scales/scales.module';
import { SharedModule } from './shared/shared.module';
import { StoresModule } from './stores/stores.module';
import { UsersModule } from './users/users.module';
import { VersionController } from './version.controller';

@Module({
  imports: [
    AppConfigModule,
    I18nModule.forRoot({
      fallbackLanguage: 'ru',
      loader: I18nJsonLoader,
      loaderOptions: {
        path: join(__dirname, '/i18n/'),
        watch: false,
      },
      resolvers: [new HeaderResolver(['x-locale'])],
    }),
    PrismaModule,
    SharedModule,
    AuthModule,
    UsersModule,
    StoresModule,
    ProductsModule,
    CatalogModule,
    DashboardModule,
    PricesModule,
    AdvertisingModule,
    PublishingModule,
    ScalesModule,
    LogsModule,
    FilesModule,
    EmailModule,
    MetricsModule,
  ],
  controllers: [HealthController, VersionController],
})
export class AppModule {}
