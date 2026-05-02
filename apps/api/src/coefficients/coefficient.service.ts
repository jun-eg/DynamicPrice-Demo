// 係数推定サービス (Issue #9 / ADR-0007 / 04-api-contract.md §/coefficients §/admin/coefficients/recompute)
// - recompute(): 直近 24ヶ月の成立予約から 24 行の係数を一括 INSERT し、AuditLog に記録する
// - findLatest(type?): 最新 computedAt の係数一覧を sampleSize / fallback 付きで返す

import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import {
  COEFFICIENT_SOURCE_V1,
  MIN_SAMPLE_SIZE,
  aggregateCoefficients,
  dayOfWeekKeyOf,
  leadTimeBin,
  seasonKeyOf,
  type AggregatedCoefficient,
  type CoefficientInput,
  type CoefficientType,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service.js';

const RECOMPUTE_WINDOW_MONTHS = 24;

export interface RecomputeResult {
  computedAt: Date;
  source: string;
  rowsCreated: number;
  totalSampleSize: number;
}

export interface SaveResult {
  computedAt: Date;
  source: string;
  rowsCreated: number;
}

export interface LatestCoefficientItem {
  type: CoefficientType;
  key: string;
  value: string;
  sampleSize: number;
  fallback: boolean;
}

export interface LatestCoefficients {
  computedAt: Date;
  source: string;
  items: LatestCoefficientItem[];
}

@Injectable()
export class CoefficientService {
  constructor(private readonly prisma: PrismaService) {}

  async recompute(actorId: number, now: Date = new Date()): Promise<RecomputeResult> {
    const cutoff = subMonthsUTC(now, RECOMPUTE_WINDOW_MONTHS);

    const reservations = await this.prisma.reservation.findMany({
      where: {
        cancelDate: null,
        checkInDate: { gte: cutoff },
      },
      select: {
        totalAmount: true,
        nights: true,
        roomCount: true,
        checkInDate: true,
        bookedDate: true,
      },
    });

    const inputs: CoefficientInput[] = reservations.map((r) => ({
      totalAmount: new Decimal(r.totalAmount.toString()),
      nights: r.nights,
      roomCount: r.roomCount,
      checkInDate: r.checkInDate,
      bookedDate: r.bookedDate,
    }));

    const aggregated = aggregateCoefficients(inputs);
    const computedAt = now;

    // 24 行を 1 トランザクションで INSERT し、続けて AuditLog を残す。
    // どちらか一方だけ書かれる中間状態を避けるため $transaction で括る。
    const created = await this.prisma.$transaction(async (tx) => {
      const result = await tx.priceCoefficient.createMany({
        data: aggregated.map((a) => ({
          type: a.type,
          key: a.key,
          value: a.value.toFixed(4),
          computedAt,
          source: COEFFICIENT_SOURCE_V1,
        })),
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'COEFFICIENT_RECOMPUTE',
          payload: {
            source: COEFFICIENT_SOURCE_V1,
            computedAt: computedAt.toISOString(),
            rowsCreated: result.count,
            sampleSize: inputs.length,
          },
        },
      });
      return result.count;
    });

    return {
      computedAt,
      source: COEFFICIENT_SOURCE_V1,
      rowsCreated: created,
      totalSampleSize: inputs.length,
    };
  }

  async save(
    actorId: number,
    items: Array<{ type: CoefficientType; key: string; value: string }>,
  ): Promise<SaveResult> {
    const computedAt = new Date();
    const source = 'manual';

    const created = await this.prisma.$transaction(async (tx) => {
      const result = await tx.priceCoefficient.createMany({
        data: items.map((item) => ({
          type: item.type,
          key: item.key,
          value: new Decimal(item.value).toFixed(4),
          computedAt,
          source,
        })),
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'COEFFICIENT_MANUAL_SAVE',
          payload: {
            source,
            computedAt: computedAt.toISOString(),
            rowsCreated: result.count,
          },
        },
      });
      return result.count;
    });

    return { computedAt, source, rowsCreated: created };
  }

  async findLatest(
    filter?: CoefficientType,
    now: Date = new Date(),
  ): Promise<LatestCoefficients | null> {
    const latest = await this.prisma.priceCoefficient.findFirst({
      orderBy: { computedAt: 'desc' },
      select: { computedAt: true, source: true },
    });
    if (!latest) return null;

    const rows = await this.prisma.priceCoefficient.findMany({
      where: {
        computedAt: latest.computedAt,
        ...(filter ? { type: filter } : {}),
      },
      orderBy: [{ type: 'asc' }, { key: 'asc' }],
      select: { type: true, key: true, value: true },
    });

    // sampleSize は PriceCoefficient テーブルに保存されていないので
    // 直近 24ヶ月の Reservation を再集計して埋める (ADR-0007 と同じ抽出条件)。
    const sampleSizeMap = await this.computeSampleSizeMap(now);

    const items: LatestCoefficientItem[] = rows.map((r) => {
      const sampleSize = sampleSizeMap.get(makeKey(r.type, r.key)) ?? 0;
      return {
        type: r.type,
        key: r.key,
        value: new Decimal(r.value.toString()).toFixed(4),
        sampleSize,
        fallback: sampleSize < MIN_SAMPLE_SIZE,
      };
    });

    return {
      computedAt: latest.computedAt,
      source: latest.source ?? COEFFICIENT_SOURCE_V1,
      items,
    };
  }

  private async computeSampleSizeMap(now: Date): Promise<Map<string, number>> {
    const cutoff = subMonthsUTC(now, RECOMPUTE_WINDOW_MONTHS);
    const reservations = await this.prisma.reservation.findMany({
      where: { cancelDate: null, checkInDate: { gte: cutoff } },
      select: { nights: true, checkInDate: true, bookedDate: true },
    });

    const map = new Map<string, number>();
    for (const r of reservations) {
      if (r.nights <= 0) continue;
      increment(map, makeKey('SEASON', seasonKeyOf(r.checkInDate)));
      increment(map, makeKey('DAY_OF_WEEK', dayOfWeekKeyOf(r.checkInDate)));
      increment(map, makeKey('LEAD_TIME', leadTimeBin(r.checkInDate, r.bookedDate)));
    }
    return map;
  }
}

// テスト等で純関数を再利用しやすいよう export しておく (apps/api 内でのみ使用)。
export function aggregatedToInsertRows(
  aggregated: readonly AggregatedCoefficient[],
  computedAt: Date,
): Array<{ type: CoefficientType; key: string; value: string; computedAt: Date; source: string }> {
  return aggregated.map((a) => ({
    type: a.type,
    key: a.key,
    value: a.value.toFixed(4),
    computedAt,
    source: COEFFICIENT_SOURCE_V1,
  }));
}

function subMonthsUTC(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() - months);
  return result;
}

function makeKey(type: CoefficientType, key: string): string {
  return `${type}|${key}`;
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}
