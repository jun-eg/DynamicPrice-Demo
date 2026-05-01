// Issue #11 受け入れ条件 e2e:
// - サンプルデータで期待した形のレスポンスが返る (200)
// - 金額・係数はすべて文字列 (ADR-0006)
// - clampReason が MIN / MAX / null で返る
// - BasePrice.priceMin / priceMax を実際に参照してクランプしている (ハードコードでない)
// - AuditLog.PRICE_VIEW が 1 リクエスト 1 件記録される
// - バリデーション失敗で 400 VALIDATION_ERROR (ISO 形式 / dateFrom > dateTo / 期間上限超過)
// - 401 (JWT 無し)
// PrismaService はインメモリのモックに差し替えて DB 非依存で実行する。

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthModule } from '../src/auth/auth.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RecommendationsModule } from '../src/recommendations/recommendations.module.js';
import { MAX_RANGE_DAYS } from '../src/recommendations/recommendations.dto.js';

const TEST_SECRET = 'e2e-recommendations-secret';

interface StoredCoefficient {
  type: 'SEASON' | 'DAY_OF_WEEK' | 'LEAD_TIME';
  key: string;
  value: { toString(): string };
  computedAt: Date;
}

interface StoredBasePrice {
  roomTypeId: number;
  planId: number;
  amount: { toString(): string };
  priceMin: { toString(): string };
  priceMax: { toString(): string };
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

interface StoredAuditLog {
  userId: number;
  action: string;
  target: string | null;
  payload: unknown;
}

type CoefficientFindManyArgs = { where: { computedAt: Date } };
type BasePriceFindManyArgs = {
  where: {
    roomTypeId?: number;
    planId?: number;
    effectiveFrom: { lte: Date };
    OR: Array<{ effectiveTo: null } | { effectiveTo: { gte: Date } }>;
  };
};

class FakePrisma {
  coefficients: StoredCoefficient[] = [];
  basePrices: StoredBasePrice[] = [];
  auditLogs: StoredAuditLog[] = [];

  priceCoefficient = {
    findFirst: vi.fn(async () => {
      if (this.coefficients.length === 0) return null;
      const latest = this.coefficients
        .slice()
        .sort((a, b) => b.computedAt.getTime() - a.computedAt.getTime())[0]!;
      return { computedAt: latest.computedAt };
    }),
    findMany: vi.fn(async (args: CoefficientFindManyArgs) => {
      return this.coefficients
        .filter((c) => c.computedAt.getTime() === args.where.computedAt.getTime())
        .map((c) => ({ type: c.type, key: c.key, value: c.value }));
    }),
  };

  basePrice = {
    findMany: vi.fn(async (args: BasePriceFindManyArgs) => {
      const w = args.where;
      return this.basePrices
        .filter((b) => (w.roomTypeId === undefined ? true : b.roomTypeId === w.roomTypeId))
        .filter((b) => (w.planId === undefined ? true : b.planId === w.planId))
        .filter((b) => b.effectiveFrom.getTime() <= w.effectiveFrom.lte.getTime())
        .filter((b) => {
          // OR: effectiveTo IS NULL OR effectiveTo >= dateFrom
          const dateFromConstraint = w.OR.find(
            (c): c is { effectiveTo: { gte: Date } } =>
              c.effectiveTo !== null && typeof c.effectiveTo === 'object',
          );
          const dateFrom = dateFromConstraint?.effectiveTo.gte ?? new Date(0);
          return b.effectiveTo === null || b.effectiveTo.getTime() >= dateFrom.getTime();
        })
        .map((b) => ({
          roomTypeId: b.roomTypeId,
          planId: b.planId,
          amount: b.amount,
          priceMin: b.priceMin,
          priceMax: b.priceMax,
          effectiveFrom: b.effectiveFrom,
          effectiveTo: b.effectiveTo,
        }));
    }),
  };

  auditLog = {
    create: vi.fn(
      async (args: {
        data: { userId: number; action: string; target?: string | null; payload?: unknown };
      }) => {
        const log: StoredAuditLog = {
          userId: args.data.userId,
          action: args.data.action,
          target: args.data.target ?? null,
          payload: args.data.payload ?? null,
        };
        this.auditLogs.push(log);
        return log;
      },
    ),
  };
}

@Module({
  imports: [PrismaModule, AuthModule, RecommendationsModule],
})
class RecommendationsTestModule {}

describe('Recommendations (e2e)', () => {
  let app: INestApplication;
  let server: App;
  let fakePrisma: FakePrisma;

  beforeAll(async () => {
    process.env.AUTH_SECRET = TEST_SECRET;
    fakePrisma = new FakePrisma();
    const moduleRef = await Test.createTestingModule({ imports: [RecommendationsTestModule] })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer() as App;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    fakePrisma.coefficients = [];
    fakePrisma.basePrices = [];
    fakePrisma.auditLogs = [];
  });

  const memberToken = () =>
    jwt.sign({ sub: 7, email: 'member@example.com', role: 'MEMBER' }, TEST_SECRET, {
      expiresIn: 60 * 60,
    });

  // 24 行(係数)を seed する。SEASON_KEYS=1..12, DAY_OF_WEEK=MON..SUN, LEAD_TIME=0-3..31+。
  const seedCoefficients = (
    computedAt: Date,
    overrides: Partial<Record<string, string>> = {},
  ): void => {
    const ALL: Array<Pick<StoredCoefficient, 'type' | 'key'>> = [
      ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map(
        (k) => ({ type: 'SEASON' as const, key: k }),
      ),
      ...['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(
        (k) => ({ type: 'DAY_OF_WEEK' as const, key: k }),
      ),
      ...['0-3', '4-7', '8-14', '15-30', '31+'].map(
        (k) => ({ type: 'LEAD_TIME' as const, key: k }),
      ),
    ];
    fakePrisma.coefficients = ALL.map(({ type, key }) => ({
      type,
      key,
      value: overrides[`${type}|${key}`] ?? '1.0000',
      computedAt,
    }));
  };

  it('JWT 無しで GET /recommendations は 401', async () => {
    const res = await request(server).get(
      '/recommendations?dateFrom=2026-05-01&dateTo=2026-05-03',
    );
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('係数が未計算の状態だと 404 NOT_FOUND', async () => {
    fakePrisma.basePrices = [
      {
        roomTypeId: 1,
        planId: 1,
        amount: '20000',
        priceMin: '14000',
        priceMax: '26000',
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        effectiveTo: null,
      },
    ];
    const res = await request(server)
      .get('/recommendations?dateFrom=2026-05-01&dateTo=2026-05-03')
      .set('Authorization', `Bearer ${memberToken()}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('dateFrom が ISO 形式でないと 400 VALIDATION_ERROR', async () => {
    const res = await request(server)
      .get('/recommendations?dateFrom=2026/05/01&dateTo=2026-05-03')
      .set('Authorization', `Bearer ${memberToken()}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('dateFrom > dateTo は 400 VALIDATION_ERROR', async () => {
    const res = await request(server)
      .get('/recommendations?dateFrom=2026-05-10&dateTo=2026-05-01')
      .set('Authorization', `Bearer ${memberToken()}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it(`期間上限 ${MAX_RANGE_DAYS} 日を超えると 400 VALIDATION_ERROR`, async () => {
    // dateFrom + MAX_RANGE_DAYS 日 = ちょうど上限超過
    const from = new Date(Date.UTC(2026, 0, 1));
    const to = new Date(from.getTime() + MAX_RANGE_DAYS * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
        d.getUTCDate(),
      ).padStart(2, '0')}`;
    const res = await request(server)
      .get(`/recommendations?dateFrom=${fmt(from)}&dateTo=${fmt(to)}`)
      .set('Authorization', `Bearer ${memberToken()}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('roomTypeId が非整数だと 400 VALIDATION_ERROR', async () => {
    const res = await request(server)
      .get('/recommendations?dateFrom=2026-05-01&dateTo=2026-05-03&roomTypeId=abc')
      .set('Authorization', `Bearer ${memberToken()}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('正常系: 係数 1.0 / クランプ範囲内なら rawPrice = basePrice、clampReason = null', async () => {
    const computedAt = new Date('2026-04-30T12:00:00Z');
    seedCoefficients(computedAt);
    fakePrisma.basePrices = [
      {
        roomTypeId: 1,
        planId: 1,
        amount: '20000',
        priceMin: '14000',
        priceMax: '26000',
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        effectiveTo: null,
      },
    ];

    const res = await request(server)
      .get('/recommendations?dateFrom=2026-05-01&dateTo=2026-05-03')
      .set('Authorization', `Bearer ${memberToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.computedAt).toBe(computedAt.toISOString());
    expect(res.body.items).toHaveLength(3); // 3 日分

    const first = res.body.items[0];
    expect(first.date).toBe('2026-05-01');
    expect(first.roomTypeId).toBe(1);
    expect(first.planId).toBe(1);
    // ADR-0006: 文字列で送る
    expect(typeof first.basePrice).toBe('string');
    expect(typeof first.coefficients.season).toBe('string');
    expect(typeof first.coefficients.dayOfWeek).toBe('string');
    expect(typeof first.coefficients.leadTime).toBe('string');
    expect(typeof first.rawPrice).toBe('string');
    expect(typeof first.clampedPrice).toBe('string');
    expect(first.basePrice).toBe('20000.00');
    expect(first.coefficients.season).toBe('1.0000');
    expect(first.rawPrice).toBe('20000.00');
    expect(first.clampedPrice).toBe('20000.00');
    expect(first.clampReason).toBe(null);
  });

  it('係数が高いと clampReason=MAX、低いと clampReason=MIN になる (priceMin/priceMax を実参照)', async () => {
    const computedAt = new Date('2026-04-30T12:00:00Z');
    // 5 月の SEASON 係数を 2.0、6 月を 0.1 に。日付ごとに違う結果を確かめる。
    seedCoefficients(computedAt, {
      'SEASON|5': '2.0000',
      'SEASON|6': '0.1000',
    });
    fakePrisma.basePrices = [
      {
        roomTypeId: 1,
        planId: 1,
        amount: '20000',
        priceMin: '14000',
        priceMax: '26000',
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        effectiveTo: null,
      },
    ];

    const res = await request(server)
      .get('/recommendations?dateFrom=2026-05-15&dateTo=2026-06-15')
      .set('Authorization', `Bearer ${memberToken()}`);
    expect(res.status).toBe(200);

    const may = res.body.items.find((i: { date: string }) => i.date === '2026-05-15');
    // raw = 20000 * 2.0 = 40000 → clamped to 26000 (MAX)
    expect(may.rawPrice).toBe('40000.00');
    expect(may.clampedPrice).toBe('26000.00');
    expect(may.clampReason).toBe('MAX');

    const june = res.body.items.find((i: { date: string }) => i.date === '2026-06-15');
    // raw = 20000 * 0.1 = 2000 → clamped to 14000 (MIN)
    expect(june.rawPrice).toBe('2000.00');
    expect(june.clampedPrice).toBe('14000.00');
    expect(june.clampReason).toBe('MIN');
  });

  it('roomTypeId / planId フィルタが効く', async () => {
    seedCoefficients(new Date('2026-04-30T12:00:00Z'));
    fakePrisma.basePrices = [
      {
        roomTypeId: 1,
        planId: 1,
        amount: '20000',
        priceMin: '14000',
        priceMax: '26000',
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        effectiveTo: null,
      },
      {
        roomTypeId: 2,
        planId: 1,
        amount: '30000',
        priceMin: '21000',
        priceMax: '39000',
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        effectiveTo: null,
      },
    ];

    const res = await request(server)
      .get('/recommendations?dateFrom=2026-05-01&dateTo=2026-05-01&roomTypeId=2')
      .set('Authorization', `Bearer ${memberToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].roomTypeId).toBe(2);
  });

  it('BasePrice.effectiveFrom/To の範囲外の日付は除外される', async () => {
    seedCoefficients(new Date('2026-04-30T12:00:00Z'));
    fakePrisma.basePrices = [
      {
        roomTypeId: 1,
        planId: 1,
        amount: '20000',
        priceMin: '14000',
        priceMax: '26000',
        effectiveFrom: new Date('2026-05-02T00:00:00Z'),
        effectiveTo: new Date('2026-05-04T00:00:00Z'),
      },
    ];

    const res = await request(server)
      .get('/recommendations?dateFrom=2026-05-01&dateTo=2026-05-05')
      .set('Authorization', `Bearer ${memberToken()}`);
    expect(res.status).toBe(200);
    // 5/2, 5/3, 5/4 のみ該当
    expect(res.body.items).toHaveLength(3);
    expect(res.body.items.map((i: { date: string }) => i.date)).toEqual([
      '2026-05-02',
      '2026-05-03',
      '2026-05-04',
    ]);
  });

  it('1 リクエストに対して AuditLog.PRICE_VIEW が 1 件記録される', async () => {
    seedCoefficients(new Date('2026-04-30T12:00:00Z'));
    fakePrisma.basePrices = [
      {
        roomTypeId: 1,
        planId: 1,
        amount: '20000',
        priceMin: '14000',
        priceMax: '26000',
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        effectiveTo: null,
      },
    ];

    const res = await request(server)
      .get('/recommendations?dateFrom=2026-05-01&dateTo=2026-05-03&roomTypeId=1&planId=1')
      .set('Authorization', `Bearer ${memberToken()}`);
    expect(res.status).toBe(200);

    const priceViews = fakePrisma.auditLogs.filter((l) => l.action === 'PRICE_VIEW');
    expect(priceViews).toHaveLength(1);
    expect(priceViews[0]!.userId).toBe(7);
    const payload = priceViews[0]!.payload as {
      dateFrom: string;
      dateTo: string;
      roomTypeId: number | null;
      planId: number | null;
    };
    expect(payload.dateFrom).toBe('2026-05-01');
    expect(payload.dateTo).toBe('2026-05-03');
    expect(payload.roomTypeId).toBe(1);
    expect(payload.planId).toBe(1);
  });
});
