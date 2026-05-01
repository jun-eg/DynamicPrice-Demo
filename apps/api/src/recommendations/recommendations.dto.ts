// GET /recommendations のクエリパース・バリデーション (Issue #11)
// 04-api-contract.md §/recommendations / VALIDATION_ERROR は 400 として返す。
// テストしやすくするため純関数として切り出す (Service には Date / number で渡す)。

import { HttpException, HttpStatus } from '@nestjs/common';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Issue #11: 期間上限の例として 92 日。半期(180日)/月次レビュー(31日) のどちらにも余裕がある幅。
export const MAX_RANGE_DAYS = 92;

export interface ParsedRecommendationsQuery {
  dateFrom: Date;
  dateTo: Date;
  roomTypeId?: number;
  planId?: number;
}

export interface RawRecommendationsQuery {
  dateFrom?: unknown;
  dateTo?: unknown;
  roomTypeId?: unknown;
  planId?: unknown;
}

export function parseRecommendationsQuery(
  raw: RawRecommendationsQuery,
): ParsedRecommendationsQuery {
  const dateFrom = parseIsoDate(raw.dateFrom, 'dateFrom');
  const dateTo = parseIsoDate(raw.dateTo, 'dateTo');

  if (dateFrom.getTime() > dateTo.getTime()) {
    throw validationError('dateFrom must be <= dateTo');
  }

  const days = Math.floor((dateTo.getTime() - dateFrom.getTime()) / MS_PER_DAY) + 1;
  if (days > MAX_RANGE_DAYS) {
    throw validationError(`Range must be <= ${MAX_RANGE_DAYS} days (got ${days})`);
  }

  const roomTypeId = parseOptionalPositiveInt(raw.roomTypeId, 'roomTypeId');
  const planId = parseOptionalPositiveInt(raw.planId, 'planId');

  return { dateFrom, dateTo, roomTypeId, planId };
}

function parseIsoDate(value: unknown, name: string): Date {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) {
    throw validationError(`${name} must be ISO date (YYYY-MM-DD)`);
  }
  const [yearStr, monthStr, dayStr] = value.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const date = new Date(Date.UTC(year, month - 1, day));
  // 2026-02-30 のような不正日付を弾く。new Date は黙って繰り上げるのでフィールド一致で確認する。
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw validationError(`${name} is not a valid date`);
  }
  return date;
}

function parseOptionalPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined || value === '') return undefined;
  const str = typeof value === 'string' ? value : String(value);
  if (!/^\d+$/.test(str)) {
    throw validationError(`${name} must be a positive integer`);
  }
  const n = Number(str);
  if (!Number.isInteger(n) || n <= 0) {
    throw validationError(`${name} must be a positive integer`);
  }
  return n;
}

function validationError(message: string): HttpException {
  return new HttpException(
    { error: { code: 'VALIDATION_ERROR', message } },
    HttpStatus.BAD_REQUEST,
  );
}
