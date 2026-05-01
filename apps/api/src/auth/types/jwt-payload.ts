// JWT クレーム定義 (ADR-0006 §認証 / 04-api-contract.md §認証)
// `sub` は文字列で受けつつ、req.user.id は number に正規化する。

import type { Role } from '@app/shared';

export interface JwtPayload {
  sub: string | number;
  email: string;
  role: Role;
  exp?: number;
  iat?: number;
}

export interface AuthenticatedUser {
  id: number;
  email: string;
  role: Role;
}
