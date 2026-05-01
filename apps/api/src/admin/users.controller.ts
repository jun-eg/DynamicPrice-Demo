// GET /admin/users, PATCH /admin/users/:id (Issue #13 / 04-api-contract.md §/admin/users §/admin/users/:id)
// ADMIN ロール限定。UsersService の戻り値を 04-api-contract の形式に整形する。

import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type {
  AdminUser,
  AdminUserUpdateResponse,
  AdminUsersListResponse,
} from '@app/shared';
import { Roles } from '../auth/decorators/roles.decorator.js';
import {
  parseUserId,
  parseUserUpdateBody,
  type RawUserUpdateBody,
} from './users.dto.js';
import { type AdminUserView, UsersService } from './users.service.js';

@Controller('admin/users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Roles('ADMIN')
  @Get()
  async list(): Promise<AdminUsersListResponse> {
    const users = await this.service.listAll();
    return { items: users.map(toApiUser) };
  }

  @Roles('ADMIN')
  @Patch(':id')
  async update(
    @Param('id') idParam: string,
    @Body() body: RawUserUpdateBody,
    @Req() request: Request,
  ): Promise<AdminUserUpdateResponse> {
    const user = request.user;
    if (!user) {
      // グローバル JwtAuthGuard が前段にあるため通常は到達しない (型ガード)。
      throw new HttpException(
        { error: { code: 'UNAUTHENTICATED', message: 'Missing authenticated user' } },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const targetId = parseUserId(idParam);
    const { status } = parseUserUpdateBody(body);
    const updated = await this.service.updateStatus(user.id, targetId, status);
    return toApiUser(updated);
  }
}

function toApiUser(view: AdminUserView): AdminUser {
  return {
    id: view.id,
    email: view.email,
    name: view.name,
    role: view.role,
    status: view.status,
    lastLoginAt: view.lastLoginAt ? view.lastLoginAt.toISOString() : null,
  };
}
