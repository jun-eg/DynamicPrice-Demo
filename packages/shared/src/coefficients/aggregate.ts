// 係数推定の純関数 (ADR-0007 §各係数の式)。
// - 1泊単価 = totalAmount / nights
// - 各係数 = avg(1泊単価 | キー) / avg(1泊単価, 全期間)
// - サンプル数 < MIN_SAMPLE_SIZE は value=1.0, fallback=true
// 期間フィルタ・キャンセル除外は呼び出し側 (DB クエリ) の責務。

import { Decimal } from 'decimal.js';
import type { CoefficientType } from '../api/common.js';
import { leadTimeBin } from '../pricing/leadTimeBin.js';
import {
  DAY_OF_WEEK_KEYS,
  LEAD_TIME_KEYS,
  MIN_SAMPLE_SIZE,
  SEASON_KEYS,
  dayOfWeekKeyOf,
  seasonKeyOf,
} from './keys.js';

export interface CoefficientInput {
  totalAmount: Decimal;
  nights: number;
  checkInDate: Date;
  bookedDate: Date;
}

export interface AggregatedCoefficient {
  type: CoefficientType;
  key: string;
  // PriceCoefficient.value は Decimal(6, 4) で保存される (03-data-model.md)。
  value: Decimal;
  sampleSize: number;
  fallback: boolean;
}

export interface AggregateOptions {
  minSampleSize?: number;
}

const VALUE_PRECISION = 4;
const FALLBACK_VALUE = new Decimal('1.0000');

export function aggregateCoefficients(
  reservations: readonly CoefficientInput[],
  options: AggregateOptions = {},
): AggregatedCoefficient[] {
  const minSampleSize = options.minSampleSize ?? MIN_SAMPLE_SIZE;

  // nights<=0 は 1泊単価が計算できないので除外する (データ不正の防御)。
  const indexed = reservations
    .filter((r) => r.nights > 0)
    .map((r) => ({
      unitPrice: r.totalAmount.div(r.nights),
      season: seasonKeyOf(r.checkInDate),
      dayOfWeek: dayOfWeekKeyOf(r.checkInDate),
      leadTime: leadTimeBin(r.checkInDate, r.bookedDate),
    }));

  const overallAvg = average(indexed.map((i) => i.unitPrice));

  const results: AggregatedCoefficient[] = [];

  for (const key of SEASON_KEYS) {
    const subset = indexed.filter((i) => i.season === key).map((i) => i.unitPrice);
    results.push(buildCoefficient('SEASON', key, subset, overallAvg, minSampleSize));
  }
  for (const key of DAY_OF_WEEK_KEYS) {
    const subset = indexed.filter((i) => i.dayOfWeek === key).map((i) => i.unitPrice);
    results.push(buildCoefficient('DAY_OF_WEEK', key, subset, overallAvg, minSampleSize));
  }
  for (const key of LEAD_TIME_KEYS) {
    const subset = indexed.filter((i) => i.leadTime === key).map((i) => i.unitPrice);
    results.push(buildCoefficient('LEAD_TIME', key, subset, overallAvg, minSampleSize));
  }

  return results;
}

function buildCoefficient(
  type: CoefficientType,
  key: string,
  subset: readonly Decimal[],
  overallAvg: Decimal | null,
  minSampleSize: number,
): AggregatedCoefficient {
  const sampleSize = subset.length;

  if (sampleSize < minSampleSize || overallAvg === null || overallAvg.isZero()) {
    return { type, key, value: FALLBACK_VALUE, sampleSize, fallback: true };
  }

  const groupAvg = average(subset);
  // groupAvg は subset.length>=minSampleSize なので非 null。
  const value = groupAvg!.div(overallAvg).toDecimalPlaces(VALUE_PRECISION, Decimal.ROUND_HALF_EVEN);
  return { type, key, value, sampleSize, fallback: false };
}

function average(values: readonly Decimal[]): Decimal | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc.add(v), new Decimal(0));
  return sum.div(values.length);
}
