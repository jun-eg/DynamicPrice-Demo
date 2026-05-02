// 管理者向け基準価格 (BasePrice) 操作サービス (04-api-contract.md §/admin/base-prices)
// - listAll(): RoomType / Plan / 既存 BasePrice をまとめて返す。組合せ表 UI でそのまま使える形。
// - upsert(): (RoomType, Plan) ごとに「最新の有効な 1 行」を更新または作成する
//             (履歴管理は試作段階では不採用: ADR-0011 / 03-data-model.md §BasePrice)。
// - 監査: BASE_PRICE_UPSERT を AuditLog に記録 (target=basePriceId, payload に変更前後の値)。

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AdminBasePriceRoomTypeView {
  id: number;
  code: string;
  name: string;
}

export interface AdminBasePricePlanView {
  id: number;
  name: string;
  mealType: string | null;
}

export interface AdminBasePriceItemView {
  id: number;
  roomTypeId: number;
  planId: number;
  amount: Decimal;
  priceMin: Decimal;
  priceMax: Decimal;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export interface AdminBasePricesListView {
  roomTypes: AdminBasePriceRoomTypeView[];
  plans: AdminBasePricePlanView[];
  items: AdminBasePriceItemView[];
}

export interface UpsertInput {
  roomTypeId: number;
  planId: number;
  amount: Decimal;
  priceMin: Decimal;
  priceMax: Decimal;
}

@Injectable()
export class BasePricesService {
  constructor(private readonly prisma: PrismaService) {}

  async listAll(): Promise<AdminBasePricesListView> {
    const [roomTypes, plans, basePrices] = await Promise.all([
      this.prisma.roomType.findMany({
        orderBy: { id: 'asc' },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.plan.findMany({
        orderBy: { id: 'asc' },
        select: { id: true, name: true, mealType: true },
      }),
      this.prisma.basePrice.findMany({
        orderBy: [{ roomTypeId: 'asc' }, { planId: 'asc' }, { effectiveFrom: 'desc' }],
        select: {
          id: true,
          roomTypeId: true,
          planId: true,
          amount: true,
          priceMin: true,
          priceMax: true,
          effectiveFrom: true,
          effectiveTo: true,
        },
      }),
    ]);

    return {
      roomTypes,
      plans,
      items: basePrices.map((b) => ({
        id: b.id,
        roomTypeId: b.roomTypeId,
        planId: b.planId,
        amount: new Decimal(b.amount.toString()),
        priceMin: new Decimal(b.priceMin.toString()),
        priceMax: new Decimal(b.priceMax.toString()),
        effectiveFrom: b.effectiveFrom,
        effectiveTo: b.effectiveTo,
      })),
    };
  }

  async upsert(
    actorId: number,
    input: UpsertInput,
    now: Date = new Date(),
  ): Promise<AdminBasePriceItemView> {
    const [roomType, plan] = await Promise.all([
      this.prisma.roomType.findUnique({ where: { id: input.roomTypeId }, select: { id: true } }),
      this.prisma.plan.findUnique({ where: { id: input.planId }, select: { id: true } }),
    ]);
    if (!roomType) {
      throw new HttpException(
        { error: { code: 'NOT_FOUND', message: 'RoomType not found' } },
        HttpStatus.NOT_FOUND,
      );
    }
    if (!plan) {
      throw new HttpException(
        { error: { code: 'NOT_FOUND', message: 'Plan not found' } },
        HttpStatus.NOT_FOUND,
      );
    }

    // 試作段階では (RoomType, Plan) ごとに「最新の effectiveFrom 行」を update する運用。
    // 履歴管理を入れる場合は ADR-0011 で示された方針に沿って別途設計する。
    const existing = await this.prisma.basePrice.findFirst({
      where: { roomTypeId: input.roomTypeId, planId: input.planId },
      orderBy: { effectiveFrom: 'desc' },
      select: {
        id: true,
        amount: true,
        priceMin: true,
        priceMax: true,
        effectiveFrom: true,
        effectiveTo: true,
      },
    });

    return this.prisma.$transaction(async (tx) => {
      let saved;
      if (existing) {
        saved = await tx.basePrice.update({
          where: { id: existing.id },
          data: {
            amount: input.amount.toFixed(2),
            priceMin: input.priceMin.toFixed(2),
            priceMax: input.priceMax.toFixed(2),
          },
          select: {
            id: true,
            roomTypeId: true,
            planId: true,
            amount: true,
            priceMin: true,
            priceMax: true,
            effectiveFrom: true,
            effectiveTo: true,
          },
        });
      } else {
        saved = await tx.basePrice.create({
          data: {
            roomTypeId: input.roomTypeId,
            planId: input.planId,
            amount: input.amount.toFixed(2),
            priceMin: input.priceMin.toFixed(2),
            priceMax: input.priceMax.toFixed(2),
            effectiveFrom: startOfUtcDay(now),
            effectiveTo: null,
          },
          select: {
            id: true,
            roomTypeId: true,
            planId: true,
            amount: true,
            priceMin: true,
            priceMax: true,
            effectiveFrom: true,
            effectiveTo: true,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'BASE_PRICE_UPSERT',
          target: String(saved.id),
          payload: {
            roomTypeId: input.roomTypeId,
            planId: input.planId,
            previous: existing
              ? {
                  amount: existing.amount.toString(),
                  priceMin: existing.priceMin.toString(),
                  priceMax: existing.priceMax.toString(),
                }
              : null,
            next: {
              amount: input.amount.toFixed(2),
              priceMin: input.priceMin.toFixed(2),
              priceMax: input.priceMax.toFixed(2),
            },
          },
        },
      });

      return {
        id: saved.id,
        roomTypeId: saved.roomTypeId,
        planId: saved.planId,
        amount: new Decimal(saved.amount.toString()),
        priceMin: new Decimal(saved.priceMin.toString()),
        priceMax: new Decimal(saved.priceMax.toString()),
        effectiveFrom: saved.effectiveFrom,
        effectiveTo: saved.effectiveTo,
      };
    });
  }
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
