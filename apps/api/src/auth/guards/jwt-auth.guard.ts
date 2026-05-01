// JwtAuthGuard (ADR-0006 §認証 / 04-api-contract.md §認証)
// - `Authorization: Bearer <JWT>` を AUTH_SECRET で検証する
// - `@Public()` のついたエンドポイントは素通し
// - 失敗時は 401 UNAUTHENTICATED を投げ、AllExceptionsFilter が共通形式に整形する

import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import jwt, { type JwtPayload as RawJwtPayload } from 'jsonwebtoken';
import type { Request } from 'express';
import type { Role } from '@app/shared';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { AuthenticatedUser, JwtPayload } from '../types/jwt-payload.js';

const ALLOWED_ROLES: readonly Role[] = ['ADMIN', 'MEMBER'];

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw unauthenticated('Missing bearer token');
    }

    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      // 設定漏れ。401 ではなく 500 にしてオペレータに気付かせる。
      throw new HttpException(
        { error: { code: 'INTERNAL_ERROR', message: 'AUTH_SECRET is not configured' } },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    let decoded: RawJwtPayload | string;
    try {
      decoded = jwt.verify(token, secret);
    } catch {
      throw unauthenticated('Invalid or expired token');
    }

    const user = toAuthenticatedUser(decoded);
    if (!user) {
      throw unauthenticated('Invalid token claims');
    }

    request.user = user;
    return true;
  }
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

function toAuthenticatedUser(decoded: RawJwtPayload | string): AuthenticatedUser | null {
  if (typeof decoded !== 'object' || decoded === null) return null;
  const payload = decoded as JwtPayload;

  const idNum = typeof payload.sub === 'number' ? payload.sub : Number(payload.sub);
  if (!Number.isInteger(idNum) || idNum <= 0) return null;
  if (typeof payload.email !== 'string' || payload.email.length === 0) return null;
  if (!ALLOWED_ROLES.includes(payload.role)) return null;

  return { id: idNum, email: payload.email, role: payload.role };
}

function unauthenticated(message: string): HttpException {
  return new HttpException(
    { error: { code: 'UNAUTHENTICATED', message } },
    HttpStatus.UNAUTHORIZED,
  );
}
