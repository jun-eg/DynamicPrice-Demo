// 統計 API (Issue #12 / 02-pricing-model.md §補助指標の定義) の集計純関数。
// - cancelDate IS NULL の絞り込み・期間範囲の絞り込みは呼び出し側 (DB クエリ) の責務
// - 連泊予約は丸ごと checkInDate の月に算入する (係数推定と同じ単純化、02-pricing-model.md)
// - 「売れた部屋夜数」は nights × roomCount で数える (issue #59)。1 行 = 1 室の暗黙前提を排除し、
//   複数室予約を分子に正しく反映する。
// - Decimal 桁制御を一元化するため Decimal -> 文字列の整形までこの層で行う (ADR-0006)

import { Decimal } from 'decimal.js';
import { LEAD_TIME_KEYS } from '../coefficients/keys.js';
import { leadTimeBin, type LeadTimeBin } from '../pricing/leadTimeBin.js';
import { daysInYearMonth, yearMonthOfDate } from './yearMonth.js';
import type { YearMonth } from '../api/stats.js';

export interface OccupancyReservation {
  nights: number;
  roomCount: number;
  checkInDate: Date;
}

export interface AdrReservation {
  nights: number;
  roomCount: number;
  totalAmount: Decimal;
  checkInDate: Date;
}

export interface LeadTimeReservation {
  checkInDate: Date;
  bookedDate: Date;
}

export interface OccupancyAggregateItem {
  yearMonth: YearMonth;
  occupancyRate: string;
  soldRoomNights: number;
  totalRoomNights: number;
}

export interface AdrAggregateItem {
  yearMonth: YearMonth;
  adr: string;
  totalRevenue: string;
  soldRoomNights: number;
}

export interface LeadTimeAggregateItem {
  bin: LeadTimeBin;
  count: number;
  share: string;
}

// 桁数:
// - rate / share は係数 (Decimal(6,4)) と揃えて 4 桁。
// - 金額は basePrice と揃えて 2 桁 (`Decimal(12,2)`)。
const RATIO_PRECISION = 4;
const MONEY_PRECISION = 2;
const ZERO_RATIO = new Decimal(0).toFixed(RATIO_PRECISION);
const ZERO_MONEY = new Decimal(0).toFixed(MONEY_PRECISION);

export function aggregateOccupancy(
  reservations: readonly OccupancyReservation[],
  totalInventory: number,
  months: readonly YearMonth[],
): OccupancyAggregateItem[] {
  const soldByMonth = sumSoldRoomNightsByMonth(reservations);

  return months.map((yearMonth) => {
    const sold = soldByMonth.get(yearMonth) ?? 0;
    const total = totalInventory * daysInYearMonth(yearMonth);
    const rate =
      total === 0
        ? ZERO_RATIO
        : new Decimal(sold)
            .div(total)
            .toDecimalPlaces(RATIO_PRECISION, Decimal.ROUND_HALF_EVEN)
            .toFixed(RATIO_PRECISION);
    return {
      yearMonth,
      occupancyRate: rate,
      soldRoomNights: sold,
      totalRoomNights: total,
    };
  });
}

export function aggregateAdr(
  reservations: readonly AdrReservation[],
  months: readonly YearMonth[],
): AdrAggregateItem[] {
  const byMonth = new Map<YearMonth, { soldRoomNights: number; revenue: Decimal }>();
  for (const r of reservations) {
    if (r.nights <= 0 || r.roomCount <= 0) continue;
    const ym = yearMonthOfDate(r.checkInDate);
    const cur = byMonth.get(ym) ?? { soldRoomNights: 0, revenue: new Decimal(0) };
    cur.soldRoomNights += r.nights * r.roomCount;
    cur.revenue = cur.revenue.add(r.totalAmount);
    byMonth.set(ym, cur);
  }

  return months.map((yearMonth) => {
    const cur = byMonth.get(yearMonth);
    if (!cur || cur.soldRoomNights === 0) {
      return {
        yearMonth,
        adr: ZERO_MONEY,
        totalRevenue: cur ? cur.revenue.toFixed(MONEY_PRECISION) : ZERO_MONEY,
        soldRoomNights: cur?.soldRoomNights ?? 0,
      };
    }
    const adr = cur.revenue
      .div(cur.soldRoomNights)
      .toDecimalPlaces(MONEY_PRECISION, Decimal.ROUND_HALF_EVEN)
      .toFixed(MONEY_PRECISION);
    return {
      yearMonth,
      adr,
      totalRevenue: cur.revenue.toFixed(MONEY_PRECISION),
      soldRoomNights: cur.soldRoomNights,
    };
  });
}

export function aggregateLeadTime(
  reservations: readonly LeadTimeReservation[],
): LeadTimeAggregateItem[] {
  const counts = new Map<LeadTimeBin, number>();
  for (const bin of LEAD_TIME_KEYS) counts.set(bin, 0);

  for (const r of reservations) {
    const bin = leadTimeBin(r.checkInDate, r.bookedDate);
    counts.set(bin, (counts.get(bin) ?? 0) + 1);
  }

  const total = reservations.length;
  return LEAD_TIME_KEYS.map((bin) => {
    const count = counts.get(bin) ?? 0;
    const share =
      total === 0
        ? ZERO_RATIO
        : new Decimal(count)
            .div(total)
            .toDecimalPlaces(RATIO_PRECISION, Decimal.ROUND_HALF_EVEN)
            .toFixed(RATIO_PRECISION);
    return { bin, count, share };
  });
}

function sumSoldRoomNightsByMonth(
  reservations: readonly OccupancyReservation[],
): Map<YearMonth, number> {
  const result = new Map<YearMonth, number>();
  for (const r of reservations) {
    if (r.nights <= 0 || r.roomCount <= 0) continue;
    const ym = yearMonthOfDate(r.checkInDate);
    result.set(ym, (result.get(ym) ?? 0) + r.nights * r.roomCount);
  }
  return result;
}
