// POST /admin/invitations (Issue #13 / 04-api-contract.md §/admin/invitations)
// ADMIN ロール限定。InvitationsService にバリデーション済みの値を委譲する。

import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AdminInvitationCreateResponse } from '@app/shared';
import { Roles } from '../auth/decorators/roles.decorator.js';
import {
  parseInvitationCreateBody,
  type RawInvitationCreateBody,
} from './invitations.dto.js';
import { InvitationsService } from './invitations.service.js';

@Controller('admin/invitations')
export class InvitationsController {
  constructor(private readonly service: InvitationsService) {}

  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async create(
    @Body() body: RawInvitationCreateBody,
    @Req() request: Request,
  ): Promise<AdminInvitationCreateResponse> {
    const user = request.user;
    if (!user) {
      // グローバル JwtAuthGuard が前段にあるため通常は到達しない (型ガード)。
      throw new HttpException(
        { error: { code: 'UNAUTHENTICATED', message: 'Missing authenticated user' } },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const parsed = parseInvitationCreateBody(body);
    const created = await this.service.create(user.id, parsed);
    return {
      id: created.id,
      email: created.email,
      role: created.role,
      expiresAt: created.expiresAt.toISOString(),
    };
  }
}
