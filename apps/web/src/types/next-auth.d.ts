// Auth.js の Session/JWT 型拡張。
// Session.user.id は Auth.js デフォルトで string なので、DB の int Primary Key とは
// `userId: number` 別フィールドで分離する (interface merge の string & number = never を回避)。

import type { Role } from '@app/shared';
import type { DefaultSession } from 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      userId: number;
      role: Role;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: number;
    role?: Role;
  }
}
