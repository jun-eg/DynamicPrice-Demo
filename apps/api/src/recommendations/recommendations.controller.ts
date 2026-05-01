// GET /recommendations (Issue #11 / 04-api-contract.md §/recommendations)
// MEMBER 以上で参照可能。AuthModule のグローバルガード越しに動作するため、ロール指定だけ行う。

import { Controller, Get, HttpException, HttpStatus, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { RecommendationsResponse } from '@app/shared';
import { Roles } from '../auth/decorators/roles.decorator.js';
import {
  parseRecommendationsQuery,
  type RawRecommendationsQuery,
} from './recommendations.dto.js';
import { RecommendationsService } from './recommendations.service.js';

@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly service: RecommendationsService) {}

  @Roles('ADMIN', 'MEMBER')
  @Get()
  async list(
    @Query() query: RawRecommendationsQuery,
    @Req() request: Request,
  ): Promise<RecommendationsResponse> {
    const user = request.user;
    if (!user) {
      // グローバル JwtAuthGuard が前段にあるため通常は到達しない (型ガード)。
      throw new HttpException(
        { error: { code: 'UNAUTHENTICATED', message: 'Missing authenticated user' } },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const parsed = parseRecommendationsQuery(query);
    return this.service.list(parsed, user.id);
  }
}
