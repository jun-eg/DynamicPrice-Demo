// リクエストロガー (04-api-contract.md §ロギング)
// - リクエストごとに UUIDv4 で requestId を発行
// - X-Request-Id レスポンスヘッダで返す
// - レスポンス完了時に { requestId, method, path, status, latencyMs } を JSON で出力

import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { structuredLog } from '../logger/structured-logger.js';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      structuredLog('info', {
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        latencyMs: Math.round(latencyMs * 100) / 100,
      });
    });

    next();
  }
}
