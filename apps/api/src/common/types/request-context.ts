// requestId / 認証ユーザーをリクエストオブジェクトに付与するための型拡張。

import 'express';
import type { AuthenticatedUser } from '../../auth/types/jwt-payload.js';

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
    user?: AuthenticatedUser;
  }
}
