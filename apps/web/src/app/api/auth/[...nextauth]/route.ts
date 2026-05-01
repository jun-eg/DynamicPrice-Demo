// Auth.js の HTTP エンドポイント (signin/callback/csrf/session/signout)。
// /api/auth/* に到達するリクエストは全て NextAuth の handlers に委譲する。

import { handlers } from '@/auth';

export const { GET, POST } = handlers;
