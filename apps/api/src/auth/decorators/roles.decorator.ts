// `@Roles('ADMIN')` で必要ロールを宣言する (ADR-0006 §ロール認可)。
// RolesGuard が Reflector でこのメタデータを読む。

import { SetMetadata } from '@nestjs/common';
import type { Role } from '@app/shared';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
