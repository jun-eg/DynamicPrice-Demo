// AuditLog 書き込みユーティリティ。
// 根拠: docs/architecture/03-data-model.md (AuditLog) / ADR-0003 §監査
// ログイン拒否 (LOGIN_REJECTED) は AuditLog.userId が NOT NULL のため、
// User が確定しているケース (DISABLED) に限り記録する。
// MVP では payload (Json) は未使用。構造化情報が必要になれば target に文字列化して入れる。

import { prisma } from '@app/db';

export type AuditAction =
  | 'LOGIN'
  | 'LOGIN_REJECTED'
  | 'LOGOUT'
  | 'USER_INVITE'
  | 'USER_DISABLE'
  | 'PRICE_VIEW'
  | 'COEFFICIENT_RECOMPUTE';

export interface RecordAuditInput {
  userId: number;
  action: AuditAction;
  target?: string;
}

export async function recordAudit(input: RecordAuditInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      target: input.target ?? null,
    },
  });
}
