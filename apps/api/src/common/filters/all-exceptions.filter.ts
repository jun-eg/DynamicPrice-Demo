// 共通エラーフィルタ (04-api-contract.md §エラーレスポンス)
// すべての例外を { error: { code, message } } 形式に整形して返す。

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiError, ApiErrorCode } from '@app/shared';
import { structuredLog } from '../logger/structured-logger.js';

const defaultCodeByStatus: Record<number, ApiErrorCode> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'DB_UNAVAILABLE',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const httpCtx = host.switchToHttp();
    const response = httpCtx.getResponse<Response>();
    const request = httpCtx.getRequest<{ requestId?: string }>();
    const { status, body } = toApiError(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      structuredLog('error', {
        requestId: request.requestId,
        msg: 'request failed',
        status,
        code: body.error.code,
        exception: serializeException(exception),
      });
    }

    response.status(status).json(body);
  }
}

function toApiError(exception: unknown): { status: number; body: ApiError } {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const raw = exception.getResponse();
    if (isApiError(raw)) {
      return { status, body: raw };
    }
    const message = typeof raw === 'string' ? raw : exception.message;
    const code = defaultCodeByStatus[status] ?? 'INTERNAL_ERROR';
    return { status, body: { error: { code, message } } };
  }
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
  };
}

function isApiError(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return false;
  }
  const inner = (value as { error: unknown }).error;
  return (
    typeof inner === 'object' &&
    inner !== null &&
    'code' in inner &&
    'message' in inner &&
    typeof (inner as { code: unknown }).code === 'string' &&
    typeof (inner as { message: unknown }).message === 'string'
  );
}

function serializeException(exception: unknown): unknown {
  if (exception instanceof Error) {
    return { name: exception.name, message: exception.message, stack: exception.stack };
  }
  return String(exception);
}
