// NestJS エントリポイント。
// ルートの .env を読み込み、グローバルフィルタと CORS を設定して PORT で待ち受ける。

import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(moduleDir, '..', '..', '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { structuredLog } from './common/logger/structured-logger.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  app.useGlobalFilters(new AllExceptionsFilter());

  const corsOrigin = process.env.CORS_ORIGIN;
  if (corsOrigin) {
    app.enableCors({ origin: corsOrigin });
  }

  const port = Number(process.env.PORT ?? 8080);
  await app.listen(port);
  structuredLog('info', { msg: 'api started', port });
}

bootstrap().catch((err) => {
  structuredLog('error', {
    msg: 'bootstrap failed',
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
