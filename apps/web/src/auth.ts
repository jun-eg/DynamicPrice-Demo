// Auth.js (NextAuth v5) の設定。
// 根拠: ADR-0003 §認証フロー / ADR-0006 §認証 / 03-data-model.md
//
// セッション戦略は jwt (Cloud Run のステートレス性に合わせる)。
// Auth.js のセッション JWT は web 内部の cookie に乗る (JWE)。
// api への Bearer は別途 issueApiToken() で HS256 を発行する点に注意。

import NextAuth from 'next-auth';
import Google, { type GoogleProfile } from 'next-auth/providers/google';
import { prisma } from '@app/db';
import type { Role } from '@app/shared';
import { resolveSignIn, touchLastLogin } from './lib/invitation';
import { recordAudit } from './lib/audit-log';

const SESSION_MAX_AGE_SEC = 8 * 60 * 60; // 8h (ADR-0003)

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE_SEC,
  },
  pages: {
    signIn: '/signin',
    error: '/signin',
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== 'google') return false;
      const googleProfile = profile as GoogleProfile | undefined;
      const email = googleProfile?.email;
      const verified = googleProfile?.email_verified === true;
      if (!email) return false;

      const decision = await resolveSignIn({
        email,
        name: googleProfile?.name ?? null,
        emailVerified: verified,
      });

      if (!decision.ok) {
        // Auth.js は文字列を返すと URL としてリダイレクトする。
        // 拒否理由は ?error= で signin 画面に渡す。
        return `/signin?error=${decision.reason}`;
      }
      return true;
    },

    async jwt({ token }) {
      // 初回ログイン時のみ DB から userId/role を取りに行き token に焼く。
      // ロール詐称を防ぐため token.role は信用しすぎず、重要操作は api 側で再確認 (ADR-0003)。
      if (!token.userId && token.email) {
        const dbUser = await prisma.user.findUnique({ where: { email: token.email } });
        if (dbUser && dbUser.status === 'ACTIVE') {
          token.userId = dbUser.id;
          token.role = dbUser.role as Role;
          await touchLastLogin(dbUser.id);
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (token.userId && token.role) {
        session.user = {
          ...session.user,
          userId: token.userId,
          role: token.role,
        };
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      if (!user.email) return;
      const dbUser = await prisma.user.findUnique({ where: { email: user.email } });
      if (!dbUser) return;
      await recordAudit({ userId: dbUser.id, action: 'LOGIN' });
    },

    async signOut(message) {
      // jwt strategy では token が、 database strategy では session が来る。
      if ('token' in message && message.token?.email) {
        const dbUser = await prisma.user.findUnique({ where: { email: message.token.email } });
        if (dbUser) await recordAudit({ userId: dbUser.id, action: 'LOGOUT' });
      }
    },
  },
});
