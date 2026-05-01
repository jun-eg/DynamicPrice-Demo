// 招待発行サービス (Issue #13 / 04-api-contract.md §/admin/invitations / 03-data-model.md §Invitation)
// - 同メアドの未消化・未失効な招待があれば 409 CONFLICT
// - expiresAt = now + 7 days
// - INSERT と AuditLog(USER_INVITE) を 1 トランザクションで書く

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Role } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service.js';

const INVITATION_TTL_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface CreatedInvitation {
  id: number;
  email: string;
  role: Role;
  expiresAt: Date;
}

@Injectable()
export class InvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    actorId: number,
    input: { email: string; role: Role },
    now: Date = new Date(),
  ): Promise<CreatedInvitation> {
    const existing = await this.prisma.invitation.findFirst({
      where: {
        email: input.email,
        usedAt: null,
        expiresAt: { gt: now },
      },
      select: { id: true },
    });
    if (existing) {
      throw new HttpException(
        {
          error: {
            code: 'CONFLICT',
            message: 'An active invitation for this email already exists',
          },
        },
        HttpStatus.CONFLICT,
      );
    }

    const expiresAt = new Date(now.getTime() + INVITATION_TTL_DAYS * MS_PER_DAY);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.invitation.create({
        data: {
          email: input.email,
          role: input.role,
          invitedById: actorId,
          expiresAt,
        },
        select: { id: true, email: true, role: true, expiresAt: true },
      });
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'USER_INVITE',
          target: input.email,
          payload: {
            role: input.role,
            expiresAt: expiresAt.toISOString(),
            invitationId: created.id,
          },
        },
      });
      return {
        id: created.id,
        email: created.email,
        role: created.role,
        expiresAt: created.expiresAt,
      };
    });
  }
}
