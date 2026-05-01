import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthzModule } from './healthz/healthz.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CoefficientModule } from './coefficients/coefficient.module.js';
import { RecommendationsModule } from './recommendations/recommendations.module.js';
import { StatsModule } from './stats/stats.module.js';
import { AdminModule } from './admin/admin.module.js';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    HealthzModule,
    CoefficientModule,
    RecommendationsModule,
    StatsModule,
    AdminModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
