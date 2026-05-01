// Issue #12 受け入れ条件 e2e:
// - 3 エンドポイントとも MEMBER 以上で 200
// - 数値はすべて文字列 (ADR-0006)
// - 月跨ぎ予約は checkInDate の月にまとめて算入 (02-pricing-model.md)
// - cancelDate IS NULL の予約のみが対象
// - バリデーション失敗で 400 VALIDATION_ERROR (YYYY-MM 形式 / from > to / 期間上限超過)
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
import { StatsModule } from '../src/stats/stats.module.js';
import { MAX_RANGE_MONTHS } from '../src/stats/stats.dto.js';

const TEST_SECRET = 'e2e-stats-secret';

interface StoredReservation {
  nights: number;
  totalAmount: { toString(): string };
  checkInDate: Date;
  bookedDate: Date;
  cancelDate: Date | null;
}

interface ReservationFindManyArgs {
  where: {
    cancelDate: null;
    checkInDate: { gte: Date; lt: Date };
  };
  select: {
    nights?: true;
    totalAmount?: true;
    checkInDate?: true;
    bookedDate?: true;
  };
}

class FakePrisma {
  reservations: StoredReservation[] = [];
  inventoryCounts: number[] = [];

  reservation = {
    findMany: vi.fn(async (args: ReservationFindManyArgs) => {
      const { gte, lt } = args.where.checkInDate;
      const sel = args.select;
      return this.reservations
        .filter((r) => r.cancelDate === null)
        .filter(
          (r) => r.checkInDate.getTime() >= gte.getTime() && r.checkInDate.getTime() < lt.getTime(),
        )
        .map((r) => {
          const out: Record<string, unknown> = {};
          if (sel.nights) out.nights = r.nights;
          if (sel.totalAmount) out.totalAmount = r.totalAmount;
          if (sel.checkInDate) out.checkInDate = r.checkInDate;
          if (sel.bookedDate) out.bookedDate = r.bookedDate;
          return out;
        });
    }),
  };

  roomType = {
    findMany: vi.fn(async () => {
      return this.inventoryCounts.map((n) => ({ inventoryCount: n }));
    }),
  };
}

@Module({
  imports: [PrismaModule, AuthModule, StatsModule],
})
class StatsTestModule {}

describe('Stats (e2e)', () => {
  let app: INestApplication;
  let server: App;
  let fakePrisma: FakePrisma;

  beforeAll(async () => {
    process.env.AUTH_SECRET = TEST_SECRET;
    fakePrisma = new FakePrisma();
    const moduleRef = await Test.createTestingModule({ imports: [StatsTestModule] })
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
    fakePrisma.reservations = [];
    fakePrisma.inventoryCounts = [];
  });

  const memberToken = () =>
    jwt.sign({ sub: 7, email: 'member@example.com', role: 'MEMBER' }, TEST_SECRET, {
      expiresIn: 60 * 60,
    });

  const date = (iso: string) => new Date(`${iso}T00:00:00Z`);

  describe('共通: 認証 / バリデーション', () => {
    it('JWT 無しで GET /stats/occupancy は 401', async () => {
      const res = await request(server).get('/stats/occupancy?from=2026-01&to=2026-03');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('JWT 無しで GET /stats/adr は 401', async () => {
      const res = await request(server).get('/stats/adr?from=2026-01&to=2026-03');
      expect(res.status).toBe(401);
    });

    it('JWT 無しで GET /stats/lead-time は 401', async () => {
      const res = await request(server).get('/stats/lead-time?from=2026-01&to=2026-03');
      expect(res.status).toBe(401);
    });

    it('from が YYYY-MM 形式でないと 400 VALIDATION_ERROR', async () => {
      const res = await request(server)
        .get('/stats/occupancy?from=2026/01&to=2026-03')
        .set('Authorization', `Bearer ${memberToken()}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('from > to は 400 VALIDATION_ERROR', async () => {
      const res = await request(server)
        .get('/stats/occupancy?from=2026-06&to=2026-01')
        .set('Authorization', `Bearer ${memberToken()}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it(`期間上限 ${MAX_RANGE_MONTHS} ヶ月を超えると 400 VALIDATION_ERROR`, async () => {
      // 2024-01 .. 2026-01 = 25 ヶ月
      const res = await request(server)
        .get('/stats/occupancy?from=2024-01&to=2026-01')
        .set('Authorization', `Bearer ${memberToken()}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /stats/occupancy', () => {
    it('200: 期間内の月を順に返し、稼働率は文字列', async () => {
      // inventory 合計 10、5 月 (31 日) に 1 泊 + 3 連泊 = 4 泊、6 月は 0 泊。
      fakePrisma.inventoryCounts = [4, 6];
      fakePrisma.reservations = [
        {
          nights: 1,
          totalAmount: '10000',
          checkInDate: date('2026-05-01'),
          bookedDate: date('2026-04-25'),
          cancelDate: null,
        },
        {
          nights: 3,
          totalAmount: '60000',
          // 5 月末チェックインの 3 連泊 → 5 月にまるごと算入 (02-pricing-model.md)
          checkInDate: date('2026-05-31'),
          bookedDate: date('2026-05-01'),
          cancelDate: null,
        },
      ];

      const res = await request(server)
        .get('/stats/occupancy?from=2026-05&to=2026-06')
        .set('Authorization', `Bearer ${memberToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);

      const may = res.body.items.find((i: { yearMonth: string }) => i.yearMonth === '2026-05');
      expect(may.soldRoomNights).toBe(4);
      expect(may.totalRoomNights).toBe(10 * 31);
      // 4 / 310 = 0.01290... → ROUND_HALF_EVEN で 0.0129
      expect(may.occupancyRate).toBe('0.0129');
      expect(typeof may.occupancyRate).toBe('string');

      const june = res.body.items.find((i: { yearMonth: string }) => i.yearMonth === '2026-06');
      expect(june.soldRoomNights).toBe(0);
      expect(june.totalRoomNights).toBe(10 * 30);
      expect(june.occupancyRate).toBe('0.0000');
    });

    it('cancelDate IS NULL の予約だけを集計対象とする', async () => {
      fakePrisma.inventoryCounts = [10];
      fakePrisma.reservations = [
        {
          nights: 2,
          totalAmount: '20000',
          checkInDate: date('2026-05-10'),
          bookedDate: date('2026-05-01'),
          cancelDate: null,
        },
        {
          nights: 5,
          totalAmount: '50000',
          checkInDate: date('2026-05-20'),
          bookedDate: date('2026-05-01'),
          cancelDate: date('2026-05-15'), // キャンセル → 除外
        },
      ];

      const res = await request(server)
        .get('/stats/occupancy?from=2026-05&to=2026-05')
        .set('Authorization', `Bearer ${memberToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.items[0].soldRoomNights).toBe(2);
    });
  });

  describe('GET /stats/adr', () => {
    it('200: 月別 ADR と totalRevenue が文字列で返る', async () => {
      fakePrisma.inventoryCounts = [10];
      fakePrisma.reservations = [
        {
          nights: 1,
          totalAmount: '20000',
          checkInDate: date('2026-05-01'),
          bookedDate: date('2026-04-25'),
          cancelDate: null,
        },
        {
          nights: 3,
          totalAmount: '60000',
          checkInDate: date('2026-05-31'),
          bookedDate: date('2026-05-01'),
          cancelDate: null,
        },
        {
          nights: 2,
          totalAmount: '30000',
          checkInDate: date('2026-06-15'),
          bookedDate: date('2026-06-01'),
          cancelDate: null,
        },
      ];

      const res = await request(server)
        .get('/stats/adr?from=2026-05&to=2026-06')
        .set('Authorization', `Bearer ${memberToken()}`);
      expect(res.status).toBe(200);

      const may = res.body.items.find((i: { yearMonth: string }) => i.yearMonth === '2026-05');
      // 5 月: 80000 / 4 = 20000.00、連泊は丸ごと checkInDate の月に算入 (02-pricing-model.md)
      expect(may.totalRevenue).toBe('80000.00');
      expect(may.soldRoomNights).toBe(4);
      expect(may.adr).toBe('20000.00');
      expect(typeof may.adr).toBe('string');
      expect(typeof may.totalRevenue).toBe('string');

      const june = res.body.items.find((i: { yearMonth: string }) => i.yearMonth === '2026-06');
      expect(june.adr).toBe('15000.00');
      expect(june.totalRevenue).toBe('30000.00');
    });
  });

  describe('GET /stats/lead-time', () => {
    it('200: 5 ビン全て返り、share は文字列、count は数値', async () => {
      // 0-3: 1 件 / 4-7: 2 件 / 8-14: 1 件 (合計 4 件)
      fakePrisma.inventoryCounts = [10];
      fakePrisma.reservations = [
        {
          nights: 1,
          totalAmount: '10000',
          checkInDate: date('2026-05-02'),
          bookedDate: date('2026-05-01'), // 1 → 0-3
          cancelDate: null,
        },
        {
          nights: 1,
          totalAmount: '10000',
          checkInDate: date('2026-05-05'),
          bookedDate: date('2026-05-01'), // 4 → 4-7
          cancelDate: null,
        },
        {
          nights: 1,
          totalAmount: '10000',
          checkInDate: date('2026-05-08'),
          bookedDate: date('2026-05-01'), // 7 → 4-7
          cancelDate: null,
        },
        {
          nights: 1,
          totalAmount: '10000',
          checkInDate: date('2026-05-15'),
          bookedDate: date('2026-05-01'), // 14 → 8-14
          cancelDate: null,
        },
      ];

      const res = await request(server)
        .get('/stats/lead-time?from=2026-05&to=2026-05')
        .set('Authorization', `Bearer ${memberToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(5);

      const map = Object.fromEntries(
        res.body.items.map((i: { bin: string; count: number; share: string }) => [
          i.bin,
          { count: i.count, share: i.share },
        ]),
      );
      expect(map['0-3']).toEqual({ count: 1, share: '0.2500' });
      expect(map['4-7']).toEqual({ count: 2, share: '0.5000' });
      expect(map['8-14']).toEqual({ count: 1, share: '0.2500' });
      expect(map['15-30']).toEqual({ count: 0, share: '0.0000' });
      expect(map['31+']).toEqual({ count: 0, share: '0.0000' });
    });
  });
});
