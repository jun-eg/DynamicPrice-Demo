// 推奨価格マトリックス算出サービス (Issue #11 / 04-api-contract.md §/recommendations / 02-pricing-model.md MVP 式)
// - 期間 × roomType × plan で、対象 BasePrice の effectiveFrom/To に該当する行のみを生成
// - 最新 PriceCoefficient (同一 computedAt) を使い rawPrice を計算
// - BasePrice.priceMin/priceMax で clamp し、reason を付与 (ADR-0008)
// - 1 リクエストにつき AuditLog.PRICE_VIEW を 1 件記録

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import {
  type ClampReason,
  type RecommendationItem,
  type RecommendationsResponse,
  clampPrice,
  computeRawPrice,
  dayOfWeekKeyOf,
  leadTimeBin,
  seasonKeyOf,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ParsedRecommendationsQuery } from './recommendations.dto.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const FALLBACK_VALUE = new Decimal('1.0000');

interface BasePriceRow {
  roomTypeId: number;
  planId: number;
  amount: Decimal;
  priceMin: Decimal;
  priceMax: Decimal;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

interface CoefficientLookup {
  computedAt: Date;
  byType: {
    SEASON: Map<string, Decimal>;
    DAY_OF_WEEK: Map<string, Decimal>;
    LEAD_TIME: Map<string, Decimal>;
  };
}

@Injectable()
export class RecommendationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: ParsedRecommendationsQuery,
    actorId: number,
    now: Date = new Date(),
  ): Promise<RecommendationsResponse> {
    const coefficients = await this.loadLatestCoefficients();
    if (!coefficients) {
      throw new HttpException(
        { error: { code: 'NOT_FOUND', message: 'No coefficients have been computed yet' } },
        HttpStatus.NOT_FOUND,
      );
    }

    const basePrices = await this.loadBasePrices(query);

    const items = buildItems(query, basePrices, coefficients, now);

    // 1 リクエスト = 1 PRICE_VIEW (Issue #11 受け入れ条件)
    await this.prisma.auditLog.create({
      data: {
        userId: actorId,
        action: 'PRICE_VIEW',
        payload: {
          dateFrom: formatIsoDate(query.dateFrom),
          dateTo: formatIsoDate(query.dateTo),
          roomTypeId: query.roomTypeId ?? null,
          planId: query.planId ?? null,
          itemCount: items.length,
        },
      },
    });

    return {
      computedAt: coefficients.computedAt.toISOString(),
      items,
    };
  }

  private async loadLatestCoefficients(): Promise<CoefficientLookup | null> {
    const latest = await this.prisma.priceCoefficient.findFirst({
      orderBy: { computedAt: 'desc' },
      select: { computedAt: true },
    });
    if (!latest) return null;

    const rows = await this.prisma.priceCoefficient.findMany({
      where: { computedAt: latest.computedAt },
      select: { type: true, key: true, value: true },
    });

    const byType: CoefficientLookup['byType'] = {
      SEASON: new Map(),
      DAY_OF_WEEK: new Map(),
      LEAD_TIME: new Map(),
    };
    for (const r of rows) {
      const value = new Decimal(r.value.toString());
      switch (r.type) {
        case 'SEASON':
          byType.SEASON.set(r.key, value);
          break;
        case 'DAY_OF_WEEK':
          byType.DAY_OF_WEEK.set(r.key, value);
          break;
        case 'LEAD_TIME':
          byType.LEAD_TIME.set(r.key, value);
          break;
      }
    }
    return { computedAt: latest.computedAt, byType };
  }

  private async loadBasePrices(query: ParsedRecommendationsQuery): Promise<BasePriceRow[]> {
    // 期間と重なる BasePrice のみ取得 (effectiveFrom <= dateTo, effectiveTo IS NULL OR effectiveTo >= dateFrom)
    const rows = await this.prisma.basePrice.findMany({
      where: {
        ...(query.roomTypeId !== undefined ? { roomTypeId: query.roomTypeId } : {}),
        ...(query.planId !== undefined ? { planId: query.planId } : {}),
        effectiveFrom: { lte: query.dateTo },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: query.dateFrom } }],
      },
      select: {
        roomTypeId: true,
        planId: true,
        amount: true,
        priceMin: true,
        priceMax: true,
        effectiveFrom: true,
        effectiveTo: true,
      },
    });

    return rows.map((r) => ({
      roomTypeId: r.roomTypeId,
      planId: r.planId,
      amount: new Decimal(r.amount.toString()),
      priceMin: new Decimal(r.priceMin.toString()),
      priceMax: new Decimal(r.priceMax.toString()),
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
    }));
  }
}

function buildItems(
  query: ParsedRecommendationsQuery,
  basePrices: readonly BasePriceRow[],
  coefficients: CoefficientLookup,
  now: Date,
): RecommendationItem[] {
  const items: RecommendationItem[] = [];

  for (const date of dateRangeUTC(query.dateFrom, query.dateTo)) {
    const season = lookupCoefficient(coefficients.byType.SEASON, seasonKeyOf(date));
    const dayOfWeek = lookupCoefficient(coefficients.byType.DAY_OF_WEEK, dayOfWeekKeyOf(date));
    const leadTime = lookupCoefficient(coefficients.byType.LEAD_TIME, leadTimeBin(date, now));

    for (const bp of basePrices) {
      if (!isEffectiveOn(bp, date)) continue;

      const raw = computeRawPrice(bp.amount, season, dayOfWeek, leadTime).toDecimalPlaces(
        2,
        Decimal.ROUND_HALF_EVEN,
      );
      const clamp = clampPrice(raw, bp.priceMin, bp.priceMax);

      items.push({
        date: formatIsoDate(date),
        roomTypeId: bp.roomTypeId,
        planId: bp.planId,
        basePrice: bp.amount.toFixed(2),
        coefficients: {
          season: season.toFixed(4),
          dayOfWeek: dayOfWeek.toFixed(4),
          leadTime: leadTime.toFixed(4),
        },
        rawPrice: raw.toFixed(2),
        clampedPrice: clamp.value.toFixed(2),
        clampReason: clamp.reason satisfies ClampReason,
      });
    }
  }

  return items;
}

function lookupCoefficient(map: Map<string, Decimal>, key: string): Decimal {
  // 係数推定 (Issue #9) では 24 行が常に生成されるため通常は欠損しない。
  // 念のため欠損は 1.0 (= 効かない) で防御する。
  return map.get(key) ?? FALLBACK_VALUE;
}

function isEffectiveOn(bp: BasePriceRow, date: Date): boolean {
  const t = date.getTime();
  if (bp.effectiveFrom.getTime() > t) return false;
  if (bp.effectiveTo !== null && bp.effectiveTo.getTime() < t) return false;
  return true;
}

function* dateRangeUTC(from: Date, to: Date): IterableIterator<Date> {
  for (let t = from.getTime(); t <= to.getTime(); t += MS_PER_DAY) {
    yield new Date(t);
  }
}

function formatIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
