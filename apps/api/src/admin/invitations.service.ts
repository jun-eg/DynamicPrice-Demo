// 招待発行・招待中一覧サービス (Issue #13 / 04-api-contract.md §/admin/invitations / 03-data-model.md §Invitation)
// - create(): 同メアドの未消化・未失効な招待があれば 409 CONFLICT、expiresAt = now + 7 days、AuditLog(USER_INVITE)
// - listPending(): usedAt IS NULL かつ expiresAt > now の Invitation を新しい順に返す

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

export interface PendingInvitationView {
  id: number;
  email: string;
  role: Role;
  invitedByEmail: string | null;
  expiresAt: Date;
  createdAt: Date;
}

@Injectable()
export class InvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPending(now: Date = new Date()): Promise<PendingInvitationView[]> {
    const rows = await this.prisma.invitation.findMany({
      where: { usedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
        invitedBy: { select: { email: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      invitedByEmail: r.invitedBy?.email ?? null,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    }));
  }

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
