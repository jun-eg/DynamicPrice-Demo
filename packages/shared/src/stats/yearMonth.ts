// 月単位指標 (occupancy / adr / lead-time) で共通利用する YearMonth 型ユーティリティ。
// 02-pricing-model.md §補助指標の定義 / 04-api-contract.md §/stats/* の `YYYY-MM` を扱う。
// Postgres `date` 列は時刻を持たないため、月境界判定は UTC ベースで行う (係数推定と同じ方針)。

import type { YearMonth } from '../api/stats.js';

const YEAR_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isYearMonth(value: string): value is YearMonth {
  return YEAR_MONTH_RE.test(value);
}

export function parseYearMonth(value: string): { year: number; month: number } {
  if (!isYearMonth(value)) {
    throw new Error(`Invalid YearMonth: ${value}`);
  }
  const [yearStr, monthStr] = value.split('-');
  return { year: Number(yearStr), month: Number(monthStr) };
}

export function formatYearMonth(year: number, month: number): YearMonth {
  return `${year}-${String(month).padStart(2, '0')}` as YearMonth;
}

// from..to の YearMonth を昇順で列挙する (両端含む)。from > to なら空配列。
export function enumerateYearMonths(from: YearMonth, to: YearMonth): YearMonth[] {
  const start = parseYearMonth(from);
  const end = parseYearMonth(to);
  const startIndex = start.year * 12 + (start.month - 1);
  const endIndex = end.year * 12 + (end.month - 1);
  if (startIndex > endIndex) return [];

  const result: YearMonth[] = [];
  for (let i = startIndex; i <= endIndex; i++) {
    const year = Math.floor(i / 12);
    const month = (i % 12) + 1;
    result.push(formatYearMonth(year, month));
  }
  return result;
}

export function daysInYearMonth(value: YearMonth): number {
  const { year, month } = parseYearMonth(value);
  // Date.UTC(year, month, 0) は「月-1 月の末日」= 当該月の日数を返す。
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function yearMonthOfDate(date: Date): YearMonth {
  return formatYearMonth(date.getUTCFullYear(), date.getUTCMonth() + 1);
}
