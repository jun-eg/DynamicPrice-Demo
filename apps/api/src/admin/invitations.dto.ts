// POST /admin/invitations のリクエストボディ・バリデーション (Issue #13 / 04-api-contract.md §/admin/invitations)
// 失敗時は 400 VALIDATION_ERROR を返す。

import { HttpException, HttpStatus } from '@nestjs/common';
import type { Role } from '@app/shared';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ROLES: readonly Role[] = ['ADMIN', 'MEMBER'];

export interface RawInvitationCreateBody {
  email?: unknown;
  role?: unknown;
}

export interface ParsedInvitationCreateBody {
  email: string;
  role: Role;
}

export function parseInvitationCreateBody(raw: RawInvitationCreateBody): ParsedInvitationCreateBody {
  if (typeof raw.email !== 'string' || raw.email.length === 0 || !EMAIL_RE.test(raw.email)) {
    throw validationError('email must be a valid email address');
  }
  if (typeof raw.role !== 'string' || !(ALLOWED_ROLES as readonly string[]).includes(raw.role)) {
    throw validationError(`role must be one of ${ALLOWED_ROLES.join(', ')}`);
  }
  return { email: raw.email, role: raw.role as Role };
}

function validationError(message: string): HttpException {
  return new HttpException(
    { error: { code: 'VALIDATION_ERROR', message } },
    HttpStatus.BAD_REQUEST,
  );
}
