// GET /coefficients (Issue #9 / 04-api-contract.md §/coefficients)
// MEMBER 以上で参照可能。`type` クエリでフィルタ可。
// AuthModule のグローバルガードで認証は済んでいるため、ロール指定だけ行う。

import { Controller, Get, HttpException, HttpStatus, Query } from '@nestjs/common';
import type { CoefficientItem, CoefficientsResponse, CoefficientType } from '@app/shared';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CoefficientService } from './coefficient.service.js';

const ALLOWED_TYPES: readonly CoefficientType[] = ['SEASON', 'DAY_OF_WEEK', 'LEAD_TIME'];

@Controller('coefficients')
export class CoefficientController {
  constructor(private readonly service: CoefficientService) {}

  @Roles('ADMIN', 'MEMBER')
  @Get()
  async list(@Query('type') typeQuery?: string): Promise<CoefficientsResponse> {
    const filter = parseTypeQuery(typeQuery);
    const latest = await this.service.findLatest(filter);

    if (!latest) {
      throw new HttpException(
        { error: { code: 'NOT_FOUND', message: 'No coefficients have been computed yet' } },
        HttpStatus.NOT_FOUND,
      );
    }

    const items: CoefficientItem[] = latest.items.map((i) => ({
      type: i.type,
      key: i.key,
      value: i.value,
      sampleSize: i.sampleSize,
      fallback: i.fallback,
    }));

    return {
      computedAt: latest.computedAt.toISOString(),
      source: latest.source,
      items,
    };
  }
}

function parseTypeQuery(value: string | undefined): CoefficientType | undefined {
  if (value === undefined || value === '') return undefined;
  if ((ALLOWED_TYPES as readonly string[]).includes(value)) {
    return value as CoefficientType;
  }
  throw new HttpException(
    {
      error: {
        code: 'VALIDATION_ERROR',
        message: `type must be one of ${ALLOWED_TYPES.join(', ')}`,
      },
    },
    HttpStatus.BAD_REQUEST,
  );
}
