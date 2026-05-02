// GET /admin/base-prices, PUT /admin/base-prices (04-api-contract.md §/admin/base-prices)
// ADMIN ロール限定。BasePricesService の戻り値を 04-api-contract の形式に整形する。

import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type {
  AdminBasePriceItem,
  AdminBasePricesListResponse,
  AdminBasePriceUpsertResponse,
} from '@app/shared';
import { Roles } from '../auth/decorators/roles.decorator.js';
import {
  parseBasePriceUpsertBody,
  type RawBasePriceUpsertBody,
} from './base-prices.dto.js';
import {
  type AdminBasePriceItemView,
  BasePricesService,
} from './base-prices.service.js';

@Controller('admin/base-prices')
export class BasePricesController {
  constructor(private readonly service: BasePricesService) {}

  @Roles('ADMIN')
  @Get()
  async list(): Promise<AdminBasePricesListResponse> {
    const view = await this.service.listAll();
    return {
      roomTypes: view.roomTypes,
      plans: view.plans,
      items: view.items.map(toApiItem),
    };
  }

  @Roles('ADMIN')
  @Put()
  async upsert(
    @Body() body: RawBasePriceUpsertBody,
    @Req() request: Request,
  ): Promise<AdminBasePriceUpsertResponse> {
    const user = request.user;
    if (!user) {
      throw new HttpException(
        { error: { code: 'UNAUTHENTICATED', message: 'Missing authenticated user' } },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const parsed = parseBasePriceUpsertBody(body);
    const saved = await this.service.upsert(user.id, parsed);
    return toApiItem(saved);
  }
}

function toApiItem(view: AdminBasePriceItemView): AdminBasePriceItem {
  return {
    id: view.id,
    roomTypeId: view.roomTypeId,
    planId: view.planId,
    amount: view.amount.toFixed(2),
    priceMin: view.priceMin.toFixed(2),
    priceMax: view.priceMax.toFixed(2),
    effectiveFrom: formatIsoDate(view.effectiveFrom),
    effectiveTo: view.effectiveTo ? formatIsoDate(view.effectiveTo) : null,
  };
}

function formatIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
