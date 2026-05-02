// GET /admin/room-types, PATCH /admin/room-types/:id (issue #59 §D / 04-api-contract.md)
// ADMIN ロール限定。RoomTypesService の戻り値を 04-api-contract の形式に整形する。

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
  AdminRoomType,
  AdminRoomTypesListResponse,
  AdminRoomTypeUpdateResponse,
} from '@app/shared';
import { Roles } from '../auth/decorators/roles.decorator.js';
import {
  parseRoomTypeId,
  parseRoomTypeUpdateBody,
  type RawRoomTypeUpdateBody,
} from './room-types.dto.js';
import { type AdminRoomTypeView, RoomTypesService } from './room-types.service.js';

@Controller('admin/room-types')
export class RoomTypesController {
  constructor(private readonly service: RoomTypesService) {}

  @Roles('ADMIN')
  @Get()
  async list(): Promise<AdminRoomTypesListResponse> {
    const items = await this.service.listAll();
    return { items: items.map(toApiRoomType) };
  }

  @Roles('ADMIN')
  @Patch(':id')
  async update(
    @Param('id') idParam: string,
    @Body() body: RawRoomTypeUpdateBody,
    @Req() request: Request,
  ): Promise<AdminRoomTypeUpdateResponse> {
    const user = request.user;
    if (!user) {
      throw new HttpException(
        { error: { code: 'UNAUTHENTICATED', message: 'Missing authenticated user' } },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const targetId = parseRoomTypeId(idParam);
    const { inventoryCount } = parseRoomTypeUpdateBody(body);
    const updated = await this.service.updateInventoryCount(user.id, targetId, inventoryCount);
    return toApiRoomType(updated);
  }
}

function toApiRoomType(view: AdminRoomTypeView): AdminRoomType {
  return {
    id: view.id,
    code: view.code,
    name: view.name,
    capacity: view.capacity,
    inventoryCount: view.inventoryCount,
  };
}
