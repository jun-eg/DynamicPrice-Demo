// Google Sign-In 後の招待検証ロジック。
// 根拠: docs/architecture/03-data-model.md §Invitation / ADR-0003 §認証フロー
//
// 検証順:
//   1. User が存在する → status を確認 (ACTIVE のみ通す)
//   2. User が存在しない → 未消化かつ未失効の Invitation を探す
//   3. 該当 Invitation があれば transaction で User 作成 + Invitation.usedAt 埋め

import { Prisma, prisma } from '@app/db';
import type { Role } from '@app/shared';
import { recordAudit } from './audit-log';

export type AuthorizedUser = {
  id: number;
  email: string;
  name: string | null;
  role: Role;
};

export type SignInRejection =
  | { ok: false; reason: 'EmailUnverified' }
  | { ok: false; reason: 'NotInvited' }
  | { ok: false; reason: 'Disabled'; userId: number };

export type SignInDecision = { ok: true; user: AuthorizedUser } | SignInRejection;

export interface ResolveSignInInput {
  email: string;
  name: string | null;
  emailVerified: boolean;
}

export async function resolveSignIn(input: ResolveSignInInput): Promise<SignInDecision> {
  if (!input.emailVerified) {
    return { ok: false, reason: 'EmailUnverified' };
  }

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    if (existing.status === 'DISABLED') {
      // 既存ユーザーが拒否されたケースは誰が試みたか記録できる。
      await recordAudit({
        userId: existing.id,
        action: 'LOGIN_REJECTED',
        target: 'Disabled',
      });
      return { ok: false, reason: 'Disabled', userId: existing.id };
    }
    return {
      ok: true,
      user: {
        id: existing.id,
        email: existing.email,
        name: existing.name,
        role: existing.role,
      },
    };
  }

  // 新規ログイン: 未消化・未失効の招待を探して消化する。
  const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const invitation = await tx.invitation.findFirst({
      where: {
        email: input.email,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!invitation) return null;

    const user = await tx.user.create({
      data: {
        email: input.email,
        name: input.name,
        role: invitation.role,
        status: 'ACTIVE',
        invitedById: invitation.invitedById,
      },
    });

    await tx.invitation.update({
      where: { id: invitation.id },
      data: { usedAt: new Date() },
    });

    return user;
  });

  if (!created) {
    // 招待外メアドの拒否は AuditLog.userId NOT NULL のため記録対象外。
    return { ok: false, reason: 'NotInvited' };
  }

  return {
    ok: true,
    user: {
      id: created.id,
      email: created.email,
      name: created.name,
      role: created.role,
    },
  };
}

export async function touchLastLogin(userId: number): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  });
}
