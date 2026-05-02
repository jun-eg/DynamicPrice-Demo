// POST /admin/invitations — 招待発行 (04-api-contract.md)
// GET  /admin/invitations — 招待中 (未消化 + 未失効) 一覧 (04-api-contract.md)

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

export interface AdminPendingInvitation {
  id: number;
  email: string;
  role: Role;
  invitedByEmail: string | null;
  expiresAt: IsoDateTime;
  createdAt: IsoDateTime;
}

export interface AdminPendingInvitationsListResponse {
  items: AdminPendingInvitation[];
}
