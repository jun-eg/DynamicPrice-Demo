// Issue #13 受け入れ条件 e2e:
// - MEMBER で叩くと 403 (admin/invitations, admin/users 共通)
// - 同メアドの未消化・未失効な招待で 409 + 規定の error 形式
// - 各操作で AuditLog の対応行が増える (USER_INVITE / USER_DISABLE / USER_ENABLE)
// - 200 / 401 / 403 / 409 を網羅
// PrismaService はインメモリのモックに差し替えて DB 非依存で実行する。

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AdminModule } from '../src/admin/admin.module.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const TEST_SECRET = 'e2e-admin-secret';

interface StoredUser {
  id: number;
  email: string;
  name: string | null;
  role: 'ADMIN' | 'MEMBER';
  status: 'ACTIVE' | 'DISABLED';
  lastLoginAt: Date | null;
}

interface StoredInvitation {
  id: number;
  email: string;
  role: 'ADMIN' | 'MEMBER';
  invitedById: number;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

interface StoredAuditLog {
  userId: number;
  action: string;
  target: string | null;
  payload: unknown;
}

interface StoredRoomType {
  id: number;
  code: string;
  name: string;
}

interface StoredPlan {
  id: number;
  name: string;
  mealType: string | null;
}

interface StoredBasePrice {
  id: number;
  roomTypeId: number;
  planId: number;
  amount: string;
  priceMin: string;
  priceMax: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

class FakePrisma {
  users: StoredUser[] = [];
  invitations: StoredInvitation[] = [];
  auditLogs: StoredAuditLog[] = [];
  roomTypes: StoredRoomType[] = [];
  plans: StoredPlan[] = [];
  basePrices: StoredBasePrice[] = [];
  private nextInvitationId = 1;
  private nextBasePriceId = 1;

  user = {
    findMany: vi.fn(async () => {
      return this.users
        .slice()
        .sort((a, b) => a.id - b.id)
        .map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          status: u.status,
          lastLoginAt: u.lastLoginAt,
        }));
    }),
    findUnique: vi.fn(async (args: { where: { id: number } }) => {
      const found = this.users.find((u) => u.id === args.where.id);
      if (!found) return null;
      return { id: found.id, status: found.status };
    }),
    update: vi.fn(
      async (args: {
        where: { id: number };
        data: { status: 'ACTIVE' | 'DISABLED' };
      }) => {
        const target = this.users.find((u) => u.id === args.where.id);
        if (!target) throw new Error('user not found');
        target.status = args.data.status;
        return {
          id: target.id,
          email: target.email,
          name: target.name,
          role: target.role,
          status: target.status,
          lastLoginAt: target.lastLoginAt,
        };
      },
    ),
  };

  invitation = {
    findFirst: vi.fn(
      async (args: {
        where: { email: string; usedAt: null; expiresAt: { gt: Date } };
      }) => {
        const found = this.invitations.find(
          (i) =>
            i.email === args.where.email &&
            i.usedAt === null &&
            i.expiresAt.getTime() > args.where.expiresAt.gt.getTime(),
        );
        return found ? { id: found.id } : null;
      },
    ),
    findMany: vi.fn(
      async (args: {
        where: { usedAt: null; expiresAt: { gt: Date } };
      }) => {
        return this.invitations
          .filter(
            (i) =>
              i.usedAt === null && i.expiresAt.getTime() > args.where.expiresAt.gt.getTime(),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map((i) => ({
            id: i.id,
            email: i.email,
            role: i.role,
            expiresAt: i.expiresAt,
            createdAt: i.createdAt,
            invitedBy:
              this.users.find((u) => u.id === i.invitedById) != null
                ? { email: this.users.find((u) => u.id === i.invitedById)!.email }
                : null,
          }));
      },
    ),
    create: vi.fn(
      async (args: {
        data: {
          email: string;
          role: 'ADMIN' | 'MEMBER';
          invitedById: number;
          expiresAt: Date;
        };
      }) => {
        const row: StoredInvitation = {
          id: this.nextInvitationId++,
          email: args.data.email,
          role: args.data.role,
          invitedById: args.data.invitedById,
          expiresAt: args.data.expiresAt,
          usedAt: null,
          createdAt: new Date(),
        };
        this.invitations.push(row);
        return {
          id: row.id,
          email: row.email,
          role: row.role,
          expiresAt: row.expiresAt,
        };
      },
    ),
  };

  auditLog = {
    create: vi.fn(
      async (args: {
        data: {
          userId: number;
          action: string;
          target?: string | null;
          payload?: unknown;
        };
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

  roomType = {
    findMany: vi.fn(async () => this.roomTypes.slice().sort((a, b) => a.id - b.id)),
    findUnique: vi.fn(async (args: { where: { id: number } }) => {
      const found = this.roomTypes.find((r) => r.id === args.where.id);
      return found ? { id: found.id } : null;
    }),
  };

  plan = {
    findMany: vi.fn(async () => this.plans.slice().sort((a, b) => a.id - b.id)),
    findUnique: vi.fn(async (args: { where: { id: number } }) => {
      const found = this.plans.find((p) => p.id === args.where.id);
      return found ? { id: found.id } : null;
    }),
  };

  basePrice = {
    findMany: vi.fn(async () => {
      return this.basePrices
        .slice()
        .sort(
          (a, b) =>
            a.roomTypeId - b.roomTypeId ||
            a.planId - b.planId ||
            b.effectiveFrom.getTime() - a.effectiveFrom.getTime(),
        )
        .map((b) => ({ ...b }));
    }),
    findFirst: vi.fn(
      async (args: { where: { roomTypeId: number; planId: number } }) => {
        const matched = this.basePrices
          .filter(
            (b) =>
              b.roomTypeId === args.where.roomTypeId && b.planId === args.where.planId,
          )
          .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
        return matched[0] ? { ...matched[0] } : null;
      },
    ),
    update: vi.fn(
      async (args: {
        where: { id: number };
        data: { amount: string; priceMin: string; priceMax: string };
      }) => {
        const target = this.basePrices.find((b) => b.id === args.where.id);
        if (!target) throw new Error('basePrice not found');
        target.amount = args.data.amount;
        target.priceMin = args.data.priceMin;
        target.priceMax = args.data.priceMax;
        return { ...target };
      },
    ),
    create: vi.fn(
      async (args: {
        data: {
          roomTypeId: number;
          planId: number;
          amount: string;
          priceMin: string;
          priceMax: string;
          effectiveFrom: Date;
          effectiveTo: Date | null;
        };
      }) => {
        const row: StoredBasePrice = { id: this.nextBasePriceId++, ...args.data };
        this.basePrices.push(row);
        return { ...row };
      },
    ),
  };

  $transaction = vi.fn(async <T,>(callback: (tx: FakePrisma) => Promise<T>): Promise<T> => {
    return callback(this);
  });
}

@Module({
  imports: [PrismaModule, AuthModule, AdminModule],
})
class AdminTestModule {}

describe('Admin (e2e)', () => {
  let app: INestApplication;
  let server: App;
  let fakePrisma: FakePrisma;

  beforeAll(async () => {
    process.env.AUTH_SECRET = TEST_SECRET;
    fakePrisma = new FakePrisma();
    const moduleRef = await Test.createTestingModule({ imports: [AdminTestModule] })
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
    fakePrisma.users = [
      {
        id: 1,
        email: 'admin@example.com',
        name: 'Admin',
        role: 'ADMIN',
        status: 'ACTIVE',
        lastLoginAt: new Date('2026-04-29T08:00:00Z'),
      },
      {
        id: 2,
        email: 'member@example.com',
        name: 'Member',
        role: 'MEMBER',
        status: 'ACTIVE',
        lastLoginAt: null,
      },
    ];
    fakePrisma.invitations = [];
    fakePrisma.auditLogs = [];
    fakePrisma.roomTypes = [];
    fakePrisma.plans = [];
    fakePrisma.basePrices = [];
  });

  const adminToken = () =>
    jwt.sign({ sub: 1, email: 'admin@example.com', role: 'ADMIN' }, TEST_SECRET, {
      expiresIn: 60 * 60,
    });
  const memberToken = () =>
    jwt.sign({ sub: 2, email: 'member@example.com', role: 'MEMBER' }, TEST_SECRET, {
      expiresIn: 60 * 60,
    });

  // -- 401 ----------------------------------------------------------------
  it('JWT 無しで POST /admin/invitations は 401 UNAUTHENTICATED', async () => {
    const res = await request(server)
      .post('/admin/invitations')
      .send({ email: 'new@example.com', role: 'MEMBER' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('JWT 無しで GET /admin/users は 401 UNAUTHENTICATED', async () => {
    const res = await request(server).get('/admin/users');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('JWT 無しで PATCH /admin/users/:id は 401 UNAUTHENTICATED', async () => {
    const res = await request(server).patch('/admin/users/2').send({ status: 'DISABLED' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  // -- 403 ----------------------------------------------------------------
  it('MEMBER で POST /admin/invitations は 403 FORBIDDEN', async () => {
    const res = await request(server)
      .post('/admin/invitations')
      .set('Authorization', `Bearer ${memberToken()}`)
      .send({ email: 'new@example.com', role: 'MEMBER' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('MEMBER で GET /admin/users は 403 FORBIDDEN', async () => {
    const res = await request(server)
      .get('/admin/users')
      .set('Authorization', `Bearer ${memberToken()}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('MEMBER で PATCH /admin/users/:id は 403 FORBIDDEN', async () => {
    const res = await request(server)
      .patch('/admin/users/2')
      .set('Authorization', `Bearer ${memberToken()}`)
      .send({ status: 'DISABLED' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  // -- POST /admin/invitations -------------------------------------------
  it('ADMIN で招待発行すると 201 + AuditLog USER_INVITE が増える', async () => {
    const res = await request(server)
      .post('/admin/invitations')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ email: 'new@example.com', role: 'MEMBER' });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe('new@example.com');
    expect(res.body.role).toBe('MEMBER');
    expect(typeof res.body.id).toBe('number');
    expect(typeof res.body.expiresAt).toBe('string');
    // expiresAt = now + 7 days を概算で検証 (発行から数秒以内)
    const expiresAtMs = new Date(res.body.expiresAt).getTime();
    const expectedMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(expiresAtMs - expectedMs)).toBeLessThan(60 * 1000);

    expect(fakePrisma.invitations).toHaveLength(1);
    const audit = fakePrisma.auditLogs.find((l) => l.action === 'USER_INVITE');
    expect(audit).toBeDefined();
    expect(audit!.userId).toBe(1);
    expect(audit!.target).toBe('new@example.com');
  });

  it('未消化・未失効な招待が同メアドで存在すると 409 CONFLICT', async () => {
    fakePrisma.invitations.push({
      id: 99,
      email: 'dup@example.com',
      role: 'MEMBER',
      invitedById: 1,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      usedAt: null,
      createdAt: new Date(),
    });

    const res = await request(server)
      .post('/admin/invitations')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ email: 'dup@example.com', role: 'MEMBER' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { code: 'CONFLICT', message: expect.any(String) },
    });
    // AuditLog は記録されない (重複は新規発行とみなさない)
    expect(fakePrisma.auditLogs.some((l) => l.action === 'USER_INVITE')).toBe(false);
  });

  it('期限切れの同メアド招待がある場合は 201 で再発行できる', async () => {
    fakePrisma.invitations.push({
      id: 99,
      email: 'expired@example.com',
      role: 'MEMBER',
      invitedById: 1,
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      usedAt: null,
      createdAt: new Date(),
    });

    const res = await request(server)
      .post('/admin/invitations')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ email: 'expired@example.com', role: 'MEMBER' });

    expect(res.status).toBe(201);
    expect(fakePrisma.auditLogs.some((l) => l.action === 'USER_INVITE')).toBe(true);
  });

  // -- GET /admin/invitations --------------------------------------------
  it('ADMIN で GET /admin/invitations は未消化・未失効のみを新しい順で返す', async () => {
    const now = Date.now();
    fakePrisma.invitations.push(
      {
        id: 1,
        email: 'pending@example.com',
        role: 'MEMBER',
        invitedById: 1,
        expiresAt: new Date(now + 24 * 60 * 60 * 1000),
        usedAt: null,
        createdAt: new Date(now - 60_000),
      },
      {
        id: 2,
        email: 'used@example.com',
        role: 'MEMBER',
        invitedById: 1,
        expiresAt: new Date(now + 24 * 60 * 60 * 1000),
        usedAt: new Date(now - 30_000),
        createdAt: new Date(now - 30_000),
      },
      {
        id: 3,
        email: 'expired@example.com',
        role: 'MEMBER',
        invitedById: 1,
        expiresAt: new Date(now - 24 * 60 * 60 * 1000),
        usedAt: null,
        createdAt: new Date(now - 90_000),
      },
      {
        id: 4,
        email: 'newer-pending@example.com',
        role: 'ADMIN',
        invitedById: 1,
        expiresAt: new Date(now + 24 * 60 * 60 * 1000),
        usedAt: null,
        createdAt: new Date(now - 10_000),
      },
    );

    const res = await request(server)
      .get('/admin/invitations')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    // createdAt 降順: newer-pending (createdAt -10s) → pending (createdAt -60s)
    expect(res.body.items[0].email).toBe('newer-pending@example.com');
    expect(res.body.items[1].email).toBe('pending@example.com');
    expect(res.body.items[0].invitedByEmail).toBe('admin@example.com');
  });

  it('MEMBER で GET /admin/invitations は 403 FORBIDDEN', async () => {
    const res = await request(server)
      .get('/admin/invitations')
      .set('Authorization', `Bearer ${memberToken()}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('email/role が不正なら 400 VALIDATION_ERROR', async () => {
    const badEmail = await request(server)
      .post('/admin/invitations')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ email: 'not-an-email', role: 'MEMBER' });
    expect(badEmail.status).toBe(400);
    expect(badEmail.body.error.code).toBe('VALIDATION_ERROR');

    const badRole = await request(server)
      .post('/admin/invitations')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ email: 'ok@example.com', role: 'OWNER' });
    expect(badRole.status).toBe(400);
    expect(badRole.body.error.code).toBe('VALIDATION_ERROR');
  });

  // -- GET /admin/users ---------------------------------------------------
  it('ADMIN で GET /admin/users は 200 + 04-api-contract 形式', async () => {
    const res = await request(server)
      .get('/admin/users')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items).toHaveLength(2);
    const admin = res.body.items[0];
    expect(admin).toEqual({
      id: 1,
      email: 'admin@example.com',
      name: 'Admin',
      role: 'ADMIN',
      status: 'ACTIVE',
      lastLoginAt: '2026-04-29T08:00:00.000Z',
    });
    const member = res.body.items[1];
    expect(member.lastLoginAt).toBeNull();
  });

  // -- PATCH /admin/users/:id --------------------------------------------
  it('ADMIN で DISABLED に更新すると 200 + AuditLog USER_DISABLE が増える', async () => {
    const res = await request(server)
      .patch('/admin/users/2')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ status: 'DISABLED' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(2);
    expect(res.body.status).toBe('DISABLED');

    // 物理削除されていない (一覧で件数が減らない)
    const list = await request(server)
      .get('/admin/users')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(list.body.items).toHaveLength(2);

    const audit = fakePrisma.auditLogs.find((l) => l.action === 'USER_DISABLE');
    expect(audit).toBeDefined();
    expect(audit!.userId).toBe(1);
    expect(audit!.target).toBe('2');
  });

  it('ADMIN で ACTIVE に戻すと 200 + AuditLog USER_ENABLE が増える', async () => {
    fakePrisma.users[1]!.status = 'DISABLED';
    const res = await request(server)
      .patch('/admin/users/2')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ status: 'ACTIVE' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACTIVE');

    const audit = fakePrisma.auditLogs.find((l) => l.action === 'USER_ENABLE');
    expect(audit).toBeDefined();
    expect(audit!.target).toBe('2');
  });

  it('存在しない user は 404 NOT_FOUND', async () => {
    const res = await request(server)
      .patch('/admin/users/9999')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ status: 'DISABLED' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('status が不正なら 400 VALIDATION_ERROR', async () => {
    const res = await request(server)
      .patch('/admin/users/2')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ status: 'BOGUS' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('id が不正なら 400 VALIDATION_ERROR', async () => {
    const res = await request(server)
      .patch('/admin/users/abc')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ status: 'DISABLED' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // -- /admin/base-prices ----------------------------------------------------
  describe('GET/PUT /admin/base-prices', () => {
    beforeEach(() => {
      fakePrisma.roomTypes = [
        { id: 1, code: 'Asakusa', name: 'Asakusa' },
        { id: 2, code: 'Sugi', name: 'Sugi' },
      ];
      fakePrisma.plans = [
        { id: 10, name: '一泊二食', mealType: 'B+D' },
        { id: 11, name: '素泊まり', mealType: null },
      ];
    });

    it('MEMBER で GET /admin/base-prices は 403 FORBIDDEN', async () => {
      const res = await request(server)
        .get('/admin/base-prices')
        .set('Authorization', `Bearer ${memberToken()}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('ADMIN で GET /admin/base-prices は roomTypes / plans / items を返す', async () => {
      fakePrisma.basePrices.push({
        id: 1,
        roomTypeId: 1,
        planId: 10,
        amount: '20000.00',
        priceMin: '14000.00',
        priceMax: '26000.00',
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        effectiveTo: null,
      });
      const res = await request(server)
        .get('/admin/base-prices')
        .set('Authorization', `Bearer ${adminToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.roomTypes).toHaveLength(2);
      expect(res.body.plans).toHaveLength(2);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toEqual({
        id: 1,
        roomTypeId: 1,
        planId: 10,
        amount: '20000.00',
        priceMin: '14000.00',
        priceMax: '26000.00',
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
      });
    });

    it('ADMIN で PUT /admin/base-prices は新規作成 + AuditLog BASE_PRICE_UPSERT', async () => {
      const res = await request(server)
        .put('/admin/base-prices')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          roomTypeId: 1,
          planId: 10,
          amount: '20000',
          priceMin: '14000',
          priceMax: '26000',
        });
      expect(res.status).toBe(200);
      expect(res.body.amount).toBe('20000.00');
      expect(res.body.priceMin).toBe('14000.00');
      expect(res.body.priceMax).toBe('26000.00');
      expect(res.body.effectiveTo).toBeNull();
      expect(fakePrisma.basePrices).toHaveLength(1);
      const audit = fakePrisma.auditLogs.find((l) => l.action === 'BASE_PRICE_UPSERT');
      expect(audit).toBeDefined();
      expect(audit!.target).toBe(String(fakePrisma.basePrices[0]!.id));
    });

    it('既存 (RoomType, Plan) を再保存すると update され、行は増えない', async () => {
      fakePrisma.basePrices.push({
        id: 5,
        roomTypeId: 1,
        planId: 10,
        amount: '20000.00',
        priceMin: '14000.00',
        priceMax: '26000.00',
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        effectiveTo: null,
      });
      const res = await request(server)
        .put('/admin/base-prices')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          roomTypeId: 1,
          planId: 10,
          amount: '21000',
          priceMin: '15000',
          priceMax: '27000',
        });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(5);
      expect(res.body.amount).toBe('21000.00');
      expect(fakePrisma.basePrices).toHaveLength(1);
    });

    it('priceMin > priceMax なら 400 VALIDATION_ERROR', async () => {
      const res = await request(server)
        .put('/admin/base-prices')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          roomTypeId: 1,
          planId: 10,
          amount: '20000',
          priceMin: '30000',
          priceMax: '25000',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('存在しない RoomType は 404 NOT_FOUND', async () => {
      const res = await request(server)
        .put('/admin/base-prices')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          roomTypeId: 999,
          planId: 10,
          amount: '20000',
          priceMin: '14000',
          priceMax: '26000',
        });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
