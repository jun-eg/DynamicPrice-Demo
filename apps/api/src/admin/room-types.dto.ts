// PATCH /admin/room-types/:id のリクエスト・パスバリデーション (issue #59 §D / 04-api-contract.md)
// 失敗時は 400 VALIDATION_ERROR を返す。

import { HttpException, HttpStatus } from '@nestjs/common';

// inventoryCount の上限。試作段階では 10000 で十分。
// 大きすぎると稼働率の分母を一時的に肥大化させて意味のない指標になるため上限を設ける。
const INVENTORY_COUNT_MAX = 10000;

export interface RawRoomTypeUpdateBody {
  inventoryCount?: unknown;
}

export function parseRoomTypeUpdateBody(raw: RawRoomTypeUpdateBody): { inventoryCount: number } {
  if (typeof raw.inventoryCount !== 'number' || !Number.isInteger(raw.inventoryCount)) {
    throw validationError('inventoryCount must be an integer');
  }
  if (raw.inventoryCount < 0) {
    throw validationError('inventoryCount must be >= 0');
  }
  if (raw.inventoryCount > INVENTORY_COUNT_MAX) {
    throw validationError(`inventoryCount must be <= ${INVENTORY_COUNT_MAX}`);
  }
  return { inventoryCount: raw.inventoryCount };
}

export function parseRoomTypeId(raw: string): number {
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
