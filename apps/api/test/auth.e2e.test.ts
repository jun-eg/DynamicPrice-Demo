// 認証ガード e2e (Issue #8 受け入れ条件)
// - JWT 無しで保護エンドポイントは 401 + 規定の error 形式
// - MEMBER ロールで ADMIN エンドポイントは 403
// - /healthz は JWT 無しで 200
// テスト用に最小ダミーコントローラを定義し、グローバルガード越しの挙動を検証する。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Controller, Get, type INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthModule } from '../src/auth/auth.module.js';
import { Public } from '../src/auth/decorators/public.decorator.js';
import { Roles } from '../src/auth/decorators/roles.decorator.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';

const TEST_SECRET = 'e2e-test-secret-do-not-use-in-prod';

@Controller('healthz')
class TestHealthzController {
  @Public()
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}

@Controller('recommendations')
class TestRecommendationsController {
  @Get()
  list(): { ok: true } {
    return { ok: true };
  }
}

@Controller('admin/users')
class TestAdminController {
  @Roles('ADMIN')
  @Get()
  list(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  imports: [AuthModule],
  controllers: [TestHealthzController, TestRecommendationsController, TestAdminController],
})
class E2eTestModule {}

describe('Auth guard (e2e)', () => {
  let app: INestApplication;
  let server: App;

  beforeAll(async () => {
    process.env.AUTH_SECRET = TEST_SECRET;
    const moduleRef = await Test.createTestingModule({ imports: [E2eTestModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer() as App;
  });

  afterAll(async () => {
    await app.close();
  });

  it('JWT 無しで /recommendations を叩くと 401 + 規定の error 形式', async () => {
    const res = await request(server).get('/recommendations');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: expect.any(String) },
    });
  });

  it('不正な JWT は 401', async () => {
    const res = await request(server)
      .get('/recommendations')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('MEMBER で ADMIN エンドポイントは 403', async () => {
    const token = jwt.sign(
      { sub: 1, email: 'member@example.com', role: 'MEMBER' },
      TEST_SECRET,
      { expiresIn: 60 * 60 },
    );
    const res = await request(server)
      .get('/admin/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: { code: 'FORBIDDEN', message: expect.any(String) },
    });
  });

  it('ADMIN で ADMIN エンドポイントは 200', async () => {
    const token = jwt.sign(
      { sub: 1, email: 'admin@example.com', role: 'ADMIN' },
      TEST_SECRET,
      { expiresIn: 60 * 60 },
    );
    const res = await request(server)
      .get('/admin/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('MEMBER で MEMBER 以上エンドポイントは 200', async () => {
    const token = jwt.sign(
      { sub: 1, email: 'member@example.com', role: 'MEMBER' },
      TEST_SECRET,
      { expiresIn: 60 * 60 },
    );
    const res = await request(server)
      .get('/recommendations')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('/healthz は JWT 無しで 200', async () => {
    const res = await request(server).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
