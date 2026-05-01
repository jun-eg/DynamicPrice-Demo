// GET /stats/* (Issue #12) のクエリパース。`from` / `to` は YYYY-MM (04-api-contract.md)。
// recommendations.dto.ts と同様、純関数として切り出してテストしやすくする。

import { HttpException, HttpStatus } from '@nestjs/common';
import { isYearMonth, parseYearMonth } from '@app/shared';
import type { YearMonth } from '@app/shared';

// 02-pricing-model.md の係数推定窓 (24 ヶ月) を上限の目安にする。
// /recommendations の MAX_RANGE_DAYS と同じく「画面で扱う期間 + 多少の余裕」を持たせる。
export const MAX_RANGE_MONTHS = 24;

export interface ParsedStatsRangeQuery {
  from: YearMonth;
  to: YearMonth;
}

export interface RawStatsRangeQuery {
  from?: unknown;
  to?: unknown;
}

export function parseStatsRangeQuery(raw: RawStatsRangeQuery): ParsedStatsRangeQuery {
  const from = parseYearMonthQuery(raw.from, 'from');
  const to = parseYearMonthQuery(raw.to, 'to');

  const fromIdx = monthIndex(from);
  const toIdx = monthIndex(to);
  if (fromIdx > toIdx) {
    throw validationError('from must be <= to');
  }

  const months = toIdx - fromIdx + 1;
  if (months > MAX_RANGE_MONTHS) {
    throw validationError(`Range must be <= ${MAX_RANGE_MONTHS} months (got ${months})`);
  }

  return { from, to };
}

function parseYearMonthQuery(value: unknown, name: string): YearMonth {
  if (typeof value !== 'string' || !isYearMonth(value)) {
    throw validationError(`${name} must be YYYY-MM`);
  }
  return value;
}

function monthIndex(value: YearMonth): number {
  const { year, month } = parseYearMonth(value);
  return year * 12 + (month - 1);
}

function validationError(message: string): HttpException {
  return new HttpException(
    { error: { code: 'VALIDATION_ERROR', message } },
    HttpStatus.BAD_REQUEST,
  );
}
