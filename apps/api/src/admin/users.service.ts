// 管理者向けユーザー操作サービス (Issue #13 / 04-api-contract.md §/admin/users §/admin/users/:id)
// - listAll(): User 一覧を 04-api-contract の形式で返す
// - updateStatus(): status を切り替え、AuditLog に USER_DISABLE / USER_ENABLE を記録
// - 物理削除はしない (03-data-model.md §削除戦略)

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Role, UserStatus } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AdminUserView {
  id: number;
  email: string;
  name: string | null;
  role: Role;
  status: UserStatus;
  lastLoginAt: Date | null;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listAll(): Promise<AdminUserView[]> {
    const rows = await this.prisma.user.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        lastLoginAt: true,
      },
    });
    return rows;
  }

  async updateStatus(
    actorId: number,
    targetUserId: number,
    nextStatus: UserStatus,
  ): Promise<AdminUserView> {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, status: true },
    });
    if (!target) {
      throw new HttpException(
        { error: { code: 'NOT_FOUND', message: 'User not found' } },
        HttpStatus.NOT_FOUND,
      );
    }

    // status 変化の有無に関わらず AuditLog は残す。意図的な操作の証跡として使う。
    const action = nextStatus === 'DISABLED' ? 'USER_DISABLE' : 'USER_ENABLE';

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: targetUserId },
        data: { status: nextStatus },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          lastLoginAt: true,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action,
          target: String(targetUserId),
          payload: { previousStatus: target.status, nextStatus },
        },
      });
      return updated;
    });
  }
}
