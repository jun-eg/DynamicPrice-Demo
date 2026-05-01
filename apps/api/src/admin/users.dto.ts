// PATCH /admin/users/:id のリクエスト・パスバリデーション (Issue #13 / 04-api-contract.md §/admin/users/:id)
// 失敗時は 400 VALIDATION_ERROR を返す。

import { HttpException, HttpStatus } from '@nestjs/common';
import type { UserStatus } from '@app/shared';

const ALLOWED_STATUSES: readonly UserStatus[] = ['ACTIVE', 'DISABLED'];

export interface RawUserUpdateBody {
  status?: unknown;
}

export function parseUserUpdateBody(raw: RawUserUpdateBody): { status: UserStatus } {
  if (typeof raw.status !== 'string' || !(ALLOWED_STATUSES as readonly string[]).includes(raw.status)) {
    throw validationError(`status must be one of ${ALLOWED_STATUSES.join(', ')}`);
  }
  return { status: raw.status as UserStatus };
}

export function parseUserId(raw: string): number {
  if (!/^\d+$/.test(raw)) {
    throw validationError('id must be a positive integer');
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw validationError('id must be a positive integer');
  }
  return n;
}

function validationError(message: string): HttpException {
  return new HttpException(
    { error: { code: 'VALIDATION_ERROR', message } },
    HttpStatus.BAD_REQUEST,
  );
}
