// GET /stats/* (Issue #12 / 02-pricing-model.md §補助指標の定義) のデータ取得層。
// - cancelDate IS NULL & checkInDate ベースの月集計 (連泊は丸ごと checkInDate の月)
// - 集計ロジックは @app/shared/stats の純関数に委譲する (テストはそちらで担保)
// - Decimal/桁整形は純関数側で済んでいる

import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import {
  aggregateAdr,
  aggregateLeadTime,
  aggregateOccupancy,
  enumerateYearMonths,
  parseYearMonth,
  type AdrAggregateItem,
  type LeadTimeAggregateItem,
  type OccupancyAggregateItem,
  type YearMonth,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ParsedStatsRangeQuery } from './stats.dto.js';

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async occupancy(query: ParsedStatsRangeQuery): Promise<OccupancyAggregateItem[]> {
    const months = enumerateYearMonths(query.from, query.to);
    const [reservations, totalInventory] = await Promise.all([
      this.findReservationsByCheckIn(query, {
        nights: true,
        roomCount: true,
        checkInDate: true,
      }),
      this.totalInventory(),
    ]);
    return aggregateOccupancy(
      reservations.map((r) => ({
        nights: r.nights,
        roomCount: r.roomCount,
        checkInDate: r.checkInDate,
      })),
      totalInventory,
      months,
    );
  }

  async adr(query: ParsedStatsRangeQuery): Promise<AdrAggregateItem[]> {
    const months = enumerateYearMonths(query.from, query.to);
    const reservations = await this.findReservationsByCheckIn(query, {
      nights: true,
      roomCount: true,
      totalAmount: true,
      checkInDate: true,
    });
    return aggregateAdr(
      reservations.map((r) => ({
        nights: r.nights,
        roomCount: r.roomCount,
        totalAmount: new Decimal(r.totalAmount.toString()),
        checkInDate: r.checkInDate,
      })),
      months,
    );
  }

  async leadTime(query: ParsedStatsRangeQuery): Promise<LeadTimeAggregateItem[]> {
    const reservations = await this.findReservationsByCheckIn(query, {
      checkInDate: true,
      bookedDate: true,
    });
    return aggregateLeadTime(
      reservations.map((r) => ({
        checkInDate: r.checkInDate,
        bookedDate: r.bookedDate,
      })),
    );
  }

  // checkInDate が [from 月初, to の翌月初) かつ cancelDate IS NULL な予約を取得する。
  // Postgres `date` 列を UTC 0:00 で比較する (係数推定 / recommendations と同じ方針)。
  private async findReservationsByCheckIn<S extends ReservationSelect>(
    query: ParsedStatsRangeQuery,
    select: S,
  ): Promise<ReservationRow<S>[]> {
    const { gte, lt } = monthBounds(query.from, query.to);
    return (await this.prisma.reservation.findMany({
      where: {
        cancelDate: null,
        checkInDate: { gte, lt },
      },
      select,
    })) as ReservationRow<S>[];
  }

  private async totalInventory(): Promise<number> {
    const rows = await this.prisma.roomType.findMany({ select: { inventoryCount: true } });
    let total = 0;
    for (const r of rows) total += r.inventoryCount;
    return total;
  }
}

// recommendations.service と同じく Prisma の select 型を局所化するための補助。
// Decimal / Date は Prisma がそれぞれ Prisma.Decimal / Date で返す。
interface ReservationSelect {
  nights?: true;
  roomCount?: true;
  totalAmount?: true;
  checkInDate?: true;
  bookedDate?: true;
}

type ReservationRow<S extends ReservationSelect> = (S['nights'] extends true
  ? { nights: number }
  : Record<string, never>) &
  (S['roomCount'] extends true ? { roomCount: number } : Record<string, never>) &
  (S['totalAmount'] extends true
    ? { totalAmount: { toString(): string } }
    : Record<string, never>) &
  (S['checkInDate'] extends true ? { checkInDate: Date } : Record<string, never>) &
  (S['bookedDate'] extends true ? { bookedDate: Date } : Record<string, never>);

function monthBounds(from: YearMonth, to: YearMonth): { gte: Date; lt: Date } {
  const start = parseYearMonth(from);
  const end = parseYearMonth(to);
  const gte = new Date(Date.UTC(start.year, start.month - 1, 1));
  // to の翌月 1 日 (排他) で範囲を切る。月またぎや 12 月→翌年は Date.UTC が繰り上げを行う。
  const lt = new Date(Date.UTC(end.year, end.month, 1));
  return { gte, lt };
}
