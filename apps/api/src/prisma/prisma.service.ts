// Prisma 接続を NestJS のライフサイクルに紐づける。
// 起動時 $connect / 終了時 $disconnect で接続プールを管理する。
// 起動時に DB が落ちていても api は立ち上げ、/healthz が 503 を返せるようにする。

import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { structuredLog } from '../common/logger/structured-logger.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch (err) {
      structuredLog('error', {
        msg: 'prisma initial connect failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
