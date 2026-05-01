// 認証関連モジュール (ADR-0006)
// グローバルに JwtAuthGuard → RolesGuard の順で適用する。
// APP_GUARD は登録順に評価されるため、先に認証→次にロール認可の流れになる。

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';

@Module({
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
