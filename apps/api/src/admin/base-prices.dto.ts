// PUT /admin/base-prices のリクエストバリデーション (04-api-contract.md §/admin/base-prices)
// 失敗時は 400 VALIDATION_ERROR を返す。amount/priceMin/priceMax は Decimal 文字列で受ける。

import { HttpException, HttpStatus } from '@nestjs/common';
import { Decimal } from 'decimal.js';

// 価格に上限を設ける根拠: ADR-0008 のクランプ範囲設計と整合。
// 試作段階では 1 万倍以上の桁ズレを早期に弾くだけで十分なので、極端に大きな値だけ拒否する。
const PRICE_MAX = new Decimal('100000000');

export interface RawBasePriceUpsertBody {
  roomTypeId?: unknown;
  planId?: unknown;
  amount?: unknown;
  priceMin?: unknown;
  priceMax?: unknown;
}

export interface ParsedBasePriceUpsertBody {
  roomTypeId: number;
  planId: number;
  amount: Decimal;
  priceMin: Decimal;
  priceMax: Decimal;
}

export function parseBasePriceUpsertBody(raw: RawBasePriceUpsertBody): ParsedBasePriceUpsertBody {
  const roomTypeId = parsePositiveInt(raw.roomTypeId, 'roomTypeId');
  const planId = parsePositiveInt(raw.planId, 'planId');
  const amount = parsePrice(raw.amount, 'amount');
  const priceMin = parsePrice(raw.priceMin, 'priceMin');
  const priceMax = parsePrice(raw.priceMax, 'priceMax');

  if (priceMin.greaterThan(priceMax)) {
    throw validationError('priceMin must be <= priceMax');
  }

  return { roomTypeId, planId, amount, priceMin, priceMax };
}

function parsePositiveInt(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw validationError(`${name} must be a positive integer`);
  }
  return value;
}

function parsePrice(value: unknown, name: string): Decimal {
  if (typeof value !== 'string' || value.trim() === '') {
    throw validationError(`${name} must be a decimal string`);
  }
  let dec: Decimal;
  try {
    dec = new Decimal(value);
  } catch {
    throw validationError(`${name} must be a decimal string`);
  }
  if (!dec.isFinite()) {
    throw validationError(`${name} must be a finite decimal`);
  }
  if (dec.lessThan(0)) {
    throw validationError(`${name} must be >= 0`);
  }
  if (dec.greaterThan(PRICE_MAX)) {
    throw validationError(`${name} must be <= ${PRICE_MAX.toString()}`);
  }
  return dec;
}

function validationError(message: string): HttpException {
  return new HttpException(
    { error: { code: 'VALIDATION_ERROR', message } },
    HttpStatus.BAD_REQUEST,
  );
}
