// GET /admin/users, PATCH /admin/users/:id (04-api-contract.md)

import type { IsoDateTime, Role, UserStatus } from './common.js';

export interface AdminUser {
  id: number;
  email: string;
  name: string | null;
  role: Role;
  status: UserStatus;
  lastLoginAt: IsoDateTime | null;
}

export interface AdminUsersListResponse {
  items: AdminUser[];
}

export interface AdminUserUpdateRequest {
  status: UserStatus;
}

export type AdminUserUpdateResponse = AdminUser;
