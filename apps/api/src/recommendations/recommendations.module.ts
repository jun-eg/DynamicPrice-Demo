// /recommendations モジュール (Issue #11)
// PrismaModule はグローバルなので import 不要。

import { Module } from '@nestjs/common';
import { RecommendationsController } from './recommendations.controller.js';
import { RecommendationsService } from './recommendations.service.js';

@Module({
  controllers: [RecommendationsController],
  providers: [RecommendationsService],
})
export class RecommendationsModule {}
