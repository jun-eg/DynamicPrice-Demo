// api 呼び出し用の HS256 JWT を発行する。
// 根拠: ADR-0006 §認証 / 04-api-contract.md §認証
// Auth.js のセッション JWT (デフォルトで JWE) は api 側 (jsonwebtoken HS256) と
// 互換が無いので、api 行きの Bearer は必ずこのヘルパを介して発行する。

import jwt from 'jsonwebtoken';
import type { Role } from '@app/shared';

const DEFAULT_EXPIRES_IN_SEC = 8 * 60 * 60; // 8h (ADR-0006)

export interface ApiTokenSubject {
  id: number;
  email: string;
  role: Role;
}

export function issueApiToken(subject: ApiTokenSubject): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is not configured');
  }
  return jwt.sign(
    { sub: subject.id, email: subject.email, role: subject.role },
    secret,
    { expiresIn: DEFAULT_EXPIRES_IN_SEC },
  );
}
