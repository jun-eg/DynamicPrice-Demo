// GET /healthz — 死活 + DB 接続確認 (04-api-contract.md §/healthz)

import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import type { HealthzResponse } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { structuredLog } from '../common/logger/structured-logger.js';

@Controller('healthz')
export class HealthzController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<HealthzResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'ok' };
    } catch (err) {
      structuredLog('error', {
        msg: 'healthz db check failed',
        error: err instanceof Error ? err.message : String(err),
      });
      throw new HttpException(
        { error: { code: 'DB_UNAVAILABLE', message: 'Database is not reachable' } },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
