// POST /admin/invitations — 招待発行 (04-api-contract.md)

import type { IsoDateTime, Role } from './common.js';

export interface AdminInvitationCreateRequest {
  email: string;
  role: Role;
}

export interface AdminInvitationCreateResponse {
  id: number;
  email: string;
  role: Role;
  expiresAt: IsoDateTime;
}
