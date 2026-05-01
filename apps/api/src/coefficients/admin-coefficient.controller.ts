// POST /admin/coefficients/recompute (Issue #9 / 04-api-contract.md §/admin/coefficients/recompute)
// ADMIN ロール限定。実体は CoefficientService.recompute() に委譲する。

import { Controller, HttpCode, HttpException, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { AdminCoefficientsRecomputeResponse } from '@app/shared';
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
}
