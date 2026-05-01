// 係数推定 (Issue #9) のモジュール。
// PrismaModule はグローバルなので import 不要。

import { Module } from '@nestjs/common';
import { AdminCoefficientController } from './admin-coefficient.controller.js';
import { CoefficientController } from './coefficient.controller.js';
import { CoefficientService } from './coefficient.service.js';

@Module({
  controllers: [CoefficientController, AdminCoefficientController],
  providers: [CoefficientService],
  exports: [CoefficientService],
})
export class CoefficientModule {}
