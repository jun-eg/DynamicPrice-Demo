// GET /stats/* (Issue #12) のクエリパース。`from` / `to` は YYYY-MM (04-api-contract.md)。
// recommendations.dto.ts と同様、純関数として切り出してテストしやすくする。

import { HttpException, HttpStatus } from '@nestjs/common';
import { isYearMonth, parseYearMonth } from '@app/shared';
import type { YearMonth } from '@app/shared';

export interface ParsedStatsRangeQuery {
  from: YearMonth;
  to: YearMonth;
}

export interface RawStatsRangeQuery {
  from?: unknown;
  to?: unknown;
}

export const MAX_RANGE_MONTHS = 24;

export function parseStatsRangeQuery(raw: RawStatsRangeQuery): ParsedStatsRangeQuery {
  const from = parseYearMonthQuery(raw.from, 'from');
  const to = parseYearMonthQuery(raw.to, 'to');

  if (monthIndex(from) > monthIndex(to)) {
    throw validationError('from must be <= to');
  }

  if (monthIndex(to) - monthIndex(from) >= MAX_RANGE_MONTHS) {
    throw validationError(`Range must be <= ${MAX_RANGE_MONTHS} months`);
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
