// 係数推定の定数群 (ADR-0007 / 04-api-contract.md §/coefficients)
// recompute と GET /coefficients の両方で同じ定義を共有するため shared に置く。

import type { LeadTimeBin } from '../pricing/leadTimeBin.js';

export const COEFFICIENT_SOURCE_V1 = 'unit_price_avg_v1';

// ADR-0007: サンプル数 30 件未満は係数 = 1.0 にフォールバック。
export const MIN_SAMPLE_SIZE = 30;

export const SEASON_KEYS = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
] as const;

// Issue #9: DAY_OF_WEEK の key は MON..SUN。
export const DAY_OF_WEEK_KEYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

// LeadTimeBin と一致させる (pricing/leadTimeBin.ts)。
export const LEAD_TIME_KEYS: readonly LeadTimeBin[] = ['0-3', '4-7', '8-14', '15-30', '31+'];

// Date.getUTCDay() の戻り値 (0=Sun..6=Sat) を MON..SUN に対応付ける。
const DAY_OF_WEEK_BY_UTC_INDEX = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

export type SeasonKey = (typeof SEASON_KEYS)[number];
export type DayOfWeekKey = (typeof DAY_OF_WEEK_KEYS)[number];

export function seasonKeyOf(date: Date): SeasonKey {
  // Postgres `date` は時刻を持たないため UTC ベースで月を取り出す。
  const month = date.getUTCMonth() + 1;
  return String(month) as SeasonKey;
}

export function dayOfWeekKeyOf(date: Date): DayOfWeekKey {
  return DAY_OF_WEEK_BY_UTC_INDEX[date.getUTCDay()] as DayOfWeekKey;
}
