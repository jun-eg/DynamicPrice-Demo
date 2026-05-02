// 管理者向け部屋タイプ操作サービス (issue #59 §D / 04-api-contract.md §/admin/room-types)
// - listAll(): RoomType 一覧を 04-api-contract の形式で返す
// - updateInventoryCount(): inventoryCount のみ更新し、AuditLog に ROOM_TYPE_INVENTORY_UPDATE を記録
// - 追加・削除はしない (編集のみ)、capacity / name / code は触らない (issue #59)

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AdminRoomTypeView {
  id: number;
  code: string;
  name: string;
  capacity: number | null;
  inventoryCount: number;
}

@Injectable()
export class RoomTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async listAll(): Promise<AdminRoomTypeView[]> {
    return this.prisma.roomType.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        capacity: true,
        inventoryCount: true,
      },
    });
  }

  async updateInventoryCount(
    actorId: number,
    targetId: number,
    nextInventoryCount: number,
  ): Promise<AdminRoomTypeView> {
    const target = await this.prisma.roomType.findUnique({
      where: { id: targetId },
      select: { id: true, inventoryCount: true },
    });
    if (!target) {
      throw new HttpException(
        { error: { code: 'NOT_FOUND', message: 'RoomType not found' } },
        HttpStatus.NOT_FOUND,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.roomType.update({
        where: { id: targetId },
        data: { inventoryCount: nextInventoryCount },
        select: {
          id: true,
          code: true,
          name: true,
          capacity: true,
          inventoryCount: true,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'ROOM_TYPE_INVENTORY_UPDATE',
          target: String(targetId),
          payload: {
            previousInventoryCount: target.inventoryCount,
            nextInventoryCount,
          },
        },
      });
      return updated;
    });
  }
}
