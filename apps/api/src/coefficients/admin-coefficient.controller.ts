// POST /admin/coefficients/recompute (Issue #9 / 04-api-contract.md §/admin/coefficients/recompute)
// ADMIN ロール限定。実体は CoefficientService.recompute() に委譲する。

import { Body, Controller, HttpCode, HttpException, HttpStatus, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import type {
  AdminCoefficientsRecomputeResponse,
  AdminCoefficientsSaveRequest,
  AdminCoefficientsSaveResponse,
} from '@app/shared';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CoefficientService } from './coefficient.service.js';

@Controller('admin/coefficients')
export class AdminCoefficientController {
  constructor(private readonly service: CoefficientService) {}

  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @Post('recompute')
  async recompute(@Req() request: Request): Promise<AdminCoefficientsRecomputeResponse> {
    const user = request.user;
    if (!user) {
      // グローバル JwtAuthGuard が前段にあるため通常は到達しない。型ガードのため。
      throw new HttpException(
        { error: { code: 'UNAUTHENTICATED', message: 'Missing authenticated user' } },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const result = await this.service.recompute(user.id);
    return {
      computedAt: result.computedAt.toISOString(),
      source: result.source,
      rowsCreated: result.rowsCreated,
    };
  }

  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @Put()
  async save(
    @Req() request: Request,
    @Body() body: AdminCoefficientsSaveRequest,
  ): Promise<AdminCoefficientsSaveResponse> {
    const user = request.user;
    if (!user) {
      throw new HttpException(
        { error: { code: 'UNAUTHENTICATED', message: 'Missing authenticated user' } },
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (!Array.isArray(body?.items) || body.items.length === 0) {
      throw new HttpException(
        { error: { code: 'VALIDATION_ERROR', message: 'items must be a non-empty array' } },
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.service.save(user.id, body.items);
    return {
      computedAt: result.computedAt.toISOString(),
      source: result.source,
      rowsCreated: result.rowsCreated,
    };
  }
}
