// GET /stats/{occupancy,adr,lead-time} (Issue #12 / 04-api-contract.md §/stats/*)
// MEMBER 以上で参照可能。AuthModule のグローバルガード越しに動作するため、ロール指定だけ行う。

import { Controller, Get, Query } from '@nestjs/common';
import type { StatsAdrResponse, StatsLeadTimeResponse, StatsOccupancyResponse } from '@app/shared';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { parseStatsRangeQuery, type RawStatsRangeQuery } from './stats.dto.js';
import { StatsService } from './stats.service.js';

@Controller('stats')
export class StatsController {
  constructor(private readonly service: StatsService) {}

  @Roles('ADMIN', 'MEMBER')
  @Get('occupancy')
  async occupancy(@Query() query: RawStatsRangeQuery): Promise<StatsOccupancyResponse> {
    const parsed = parseStatsRangeQuery(query);
    const items = await this.service.occupancy(parsed);
    return { items };
  }

  @Roles('ADMIN', 'MEMBER')
  @Get('adr')
  async adr(@Query() query: RawStatsRangeQuery): Promise<StatsAdrResponse> {
    const parsed = parseStatsRangeQuery(query);
    const items = await this.service.adr(parsed);
    return { items };
  }

  @Roles('ADMIN', 'MEMBER')
  @Get('lead-time')
  async leadTime(@Query() query: RawStatsRangeQuery): Promise<StatsLeadTimeResponse> {
    const parsed = parseStatsRangeQuery(query);
    const items = await this.service.leadTime(parsed);
    return { items };
  }
}
