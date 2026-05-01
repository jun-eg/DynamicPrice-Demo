// Issue #9 受け入れ条件 e2e:
// - サンプルデータで recompute → /coefficients が新しい computedAt の値を返す
// - サンプル不足キーで fallback: true, value: "1.0000" が返る
// - ADMIN 以外で recompute は 403
// - AuditLog テーブルに COEFFICIENT_RECOMPUTE の行が増える
// PrismaService はインメモリのモックに差し替えて DB 非依存で実行する。

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthModule } from '../src/auth/auth.module.js';
import { CoefficientModule } from '../src/coefficients/coefficient.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const TEST_SECRET = 'e2e-coefficients-secret';

interface StoredCoefficient {
  type: 'SEASON' | 'DAY_OF_WEEK' | 'LEAD_TIME';
  key: string;
  value: { toString(): string };
  computedAt: Date;
  source: string | null;
}

interface StoredReservation {
  totalAmount: { toString(): string };
  nights: number;
  checkInDate: Date;
  bookedDate: Date;
  cancelDate: Date | null;
}

interface StoredAuditLog {
  userId: number;
  action: string;
  target: string | null;
  payload: unknown;
}

class FakePrisma {
  reservations: StoredReservation[] = [];
  coefficients: StoredCoefficient[] = [];
  auditLogs: StoredAuditLog[] = [];

  reservation = {
    findMany: vi.fn(async (args: { where: { cancelDate: null; checkInDate: { gte: Date } } }) => {
      const cutoff = args.where.checkInDate.gte;
      return this.reservations
        .filter((r) => r.cancelDate === null && r.checkInDate >= cutoff)
        .map((r) => ({
          totalAmount: r.totalAmount,
          nights: r.nights,
          checkInDate: r.checkInDate,
          bookedDate: r.bookedDate,
        }));
    }),
  };

  priceCoefficient = {
    findFirst: vi.fn(async () => {
      if (this.coefficients.length === 0) return null;
      const latest = this.coefficients
        .slice()
        .sort((a, b) => b.computedAt.getTime() - a.computedAt.getTime())[0]!;
      return { computedAt: latest.computedAt, source: latest.source };
    }),
    findMany: vi.fn(
      async (args: { where: { computedAt: Date; type?: StoredCoefficient['type'] } }) => {
        const filtered = this.coefficients.filter(
          (c) =>
            c.computedAt.getTime() === args.where.computedAt.getTime() &&
            (args.where.type === undefined || c.type === args.where.type),
        );
        return filtered
          .slice()
          .sort((a, b) => (a.type === b.type ? a.key.localeCompare(b.key) : a.type.localeCompare(b.type)))
          .map((c) => ({ type: c.type, key: c.key, value: c.value }));
      },
    ),
    createMany: vi.fn(async (args: { data: StoredCoefficient[] }) => {
      this.coefficients.push(...args.data);
      return { count: args.data.length };
    }),
  };

  auditLog = {
    create: vi.fn(async (args: { data: { userId: number; action: string; target?: string | null; payload?: unknown } }) => {
      const log: StoredAuditLog = {
        userId: args.data.userId,
        action: args.data.action,
        target: args.data.target ?? null,
        payload: args.data.payload ?? null,
      };
      this.auditLogs.push(log);
      return log;
    }),
  };

  $transaction = vi.fn(async <T,>(callback: (tx: FakePrisma) => Promise<T>): Promise<T> => {
    return callback(this);
  });
}

@Module({
  imports: [PrismaModule, AuthModule, CoefficientModule],
})
class CoefficientsTestModule {}

describe('Coefficients (e2e)', () => {
  let app: INestApplication;
  let server: App;
  let fakePrisma: FakePrisma;

  beforeAll(async () => {
    process.env.AUTH_SECRET = TEST_SECRET;
    fakePrisma = new FakePrisma();
    const moduleRef = await Test.createTestingModule({ imports: [CoefficientsTestModule] })
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
    fakePrisma.coefficients = [];
    fakePrisma.auditLogs = [];
  });

  const adminToken = () =>
    jwt.sign({ sub: 1, email: 'admin@example.com', role: 'ADMIN' }, TEST_SECRET, {
      expiresIn: 60 * 60,
    });
  const memberToken = () =>
    jwt.sign({ sub: 2, email: 'member@example.com', role: 'MEMBER' }, TEST_SECRET, {
      expiresIn: 60 * 60,
    });

  it('JWT 無しで GET /coefficients は 401', async () => {
    const res = await request(server).get('/coefficients');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('係数が未計算で GET /coefficients は 404 NOT_FOUND', async () => {
    const res = await request(server)
      .get('/coefficients')
      .set('Authorization', `Bearer ${memberToken()}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('MEMBER で POST /admin/coefficients/recompute は 403', async () => {
    const res = await request(server)
      .post('/admin/coefficients/recompute')
      .set('Authorization', `Bearer ${memberToken()}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('ADMIN で recompute すると 24 行を作成し AuditLog COEFFICIENT_RECOMPUTE が増える', async () => {
    const res = await request(server)
      .post('/admin/coefficients/recompute')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('unit_price_avg_v1');
    expect(res.body.rowsCreated).toBe(24);
    expect(typeof res.body.computedAt).toBe('string');

    expect(fakePrisma.coefficients).toHaveLength(24);
    expect(fakePrisma.auditLogs.some((log) => log.action === 'COEFFICIENT_RECOMPUTE')).toBe(true);
    const audit = fakePrisma.auditLogs.find((log) => log.action === 'COEFFICIENT_RECOMPUTE')!;
    expect(audit.userId).toBe(1);
  });

  it('recompute → GET /coefficients が同じ computedAt の値を返す', async () => {
    // 5 月のサンプルが 30 件以上、それ以外は不足するように仕込む。
    fakePrisma.reservations = Array.from({ length: 35 }, () => ({
      totalAmount: '20000',
      nights: 1,
      checkInDate: new Date('2026-05-15T00:00:00Z'),
      bookedDate: new Date('2026-04-15T00:00:00Z'),
      cancelDate: null,
    }));

    const recompute = await request(server)
      .post('/admin/coefficients/recompute')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(recompute.status).toBe(200);
    const computedAt = recompute.body.computedAt;

    const list = await request(server)
      .get('/coefficients')
      .set('Authorization', `Bearer ${memberToken()}`);
    expect(list.status).toBe(200);
    expect(list.body.computedAt).toBe(computedAt);
    expect(list.body.source).toBe('unit_price_avg_v1');
    expect(list.body.items).toHaveLength(24);

    // 5 月の SEASON は値計算済み (fallback=false)、サンプル不足の他月は fallback=true / "1.0000"
    const may = list.body.items.find(
      (i: { type: string; key: string }) => i.type === 'SEASON' && i.key === '5',
    );
    expect(may.fallback).toBe(false);
    expect(may.sampleSize).toBe(35);

    const december = list.body.items.find(
      (i: { type: string; key: string }) => i.type === 'SEASON' && i.key === '12',
    );
    expect(december.fallback).toBe(true);
    expect(december.value).toBe('1.0000');
    expect(december.sampleSize).toBe(0);
  });

  it('GET /coefficients?type=SEASON で type フィルタが効く', async () => {
    fakePrisma.reservations = Array.from({ length: 5 }, () => ({
      totalAmount: '20000',
      nights: 1,
      checkInDate: new Date('2026-05-15T00:00:00Z'),
      bookedDate: new Date('2026-04-15T00:00:00Z'),
      cancelDate: null,
    }));
    await request(server)
      .post('/admin/coefficients/recompute')
      .set('Authorization', `Bearer ${adminToken()}`);

    const list = await request(server)
      .get('/coefficients?type=SEASON')
      .set('Authorization', `Bearer ${memberToken()}`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(12);
    for (const i of list.body.items) {
      expect(i.type).toBe('SEASON');
    }
  });

  it('GET /coefficients?type=invalid は 400 VALIDATION_ERROR', async () => {
    fakePrisma.reservations = [
      {
        totalAmount: '20000',
        nights: 1,
        checkInDate: new Date('2026-05-15T00:00:00Z'),
        bookedDate: new Date('2026-04-15T00:00:00Z'),
        cancelDate: null,
      },
    ];
    await request(server)
      .post('/admin/coefficients/recompute')
      .set('Authorization', `Bearer ${adminToken()}`);

    const list = await request(server)
      .get('/coefficients?type=BOGUS')
      .set('Authorization', `Bearer ${memberToken()}`);
    expect(list.status).toBe(400);
    expect(list.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('cancelDate が立っている予約はサンプルから除外される', async () => {
    // cancel 済 100 件 + 成立 5 件 (5 月)。係数推定では成立のみが対象。
    fakePrisma.reservations = [
      ...Array.from({ length: 100 }, () => ({
        totalAmount: '99999',
        nights: 1,
        checkInDate: new Date('2026-05-15T00:00:00Z'),
        bookedDate: new Date('2026-04-15T00:00:00Z'),
        cancelDate: new Date('2026-04-20T00:00:00Z'),
      })),
      ...Array.from({ length: 5 }, () => ({
        totalAmount: '20000',
        nights: 1,
        checkInDate: new Date('2026-05-15T00:00:00Z'),
        bookedDate: new Date('2026-04-15T00:00:00Z'),
        cancelDate: null,
      })),
    ];

    await request(server)
      .post('/admin/coefficients/recompute')
      .set('Authorization', `Bearer ${adminToken()}`);

    const list = await request(server)
      .get('/coefficients?type=SEASON')
      .set('Authorization', `Bearer ${memberToken()}`);
    const may = list.body.items.find(
      (i: { type: string; key: string }) => i.type === 'SEASON' && i.key === '5',
    );
    expect(may.sampleSize).toBe(5);
    expect(may.fallback).toBe(true);
    expect(may.value).toBe('1.0000');
  });
});
