import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { RequireRoles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionGuard } from '../auth/session.guard';
import { RequireStoreAccess } from '../auth/store-access.decorator';
import { StoreAccessGuard } from '../auth/store-access.guard';
import { RussianParseUUIDPipe } from '../shared/uuid-param.pipe';
import { LogsService } from './logs.service';

type LogsQuery = {
  storeId?: string;
  entityType?: string;
  action?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: string;
  offset?: string;
};

@Controller()
@UseGuards(SessionGuard, RolesGuard, StoreAccessGuard)
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get('logs/global')
  @RequireRoles('admin')
  listGlobalLogs(@Query() query: LogsQuery) {
    return this.logsService.listGlobalLogs(this.normalizeQuery(query));
  }

  @Get('stores/:storeId/logs')
  @RequireRoles('admin', 'operator')
  @RequireStoreAccess('storeId', 'params')
  listStoreLogs(@Param('storeId', RussianParseUUIDPipe) storeId: string, @Query() query: LogsQuery) {
    return this.logsService.listStoreLogs(storeId, this.normalizeQuery(query));
  }

  private normalizeQuery(query: LogsQuery): LogsQuery {
    return {
      storeId: this.clean(query.storeId),
      entityType: this.clean(query.entityType),
      action: this.clean(query.action),
      status: this.clean(query.status),
      dateFrom: this.clean(query.dateFrom),
      dateTo: this.clean(query.dateTo),
      limit: this.clean(query.limit),
      offset: this.clean(query.offset),
    };
  }

  private clean(value: string | undefined) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
}
