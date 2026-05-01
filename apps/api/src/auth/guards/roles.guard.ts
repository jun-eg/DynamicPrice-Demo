// RolesGuard (ADR-0006 §ロール認可 / 04-api-contract.md §認証)
// `@Roles(...)` で要求されたロールを持っているか確認する。
// JwtAuthGuard の後段で動作する前提で、req.user が無ければ 401 を返す。

import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role } from '@app/shared';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    if (!user) {
      throw new HttpException(
        { error: { code: 'UNAUTHENTICATED', message: 'Missing authenticated user' } },
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!required.includes(user.role)) {
      throw new HttpException(
        { error: { code: 'FORBIDDEN', message: 'Insufficient role' } },
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
