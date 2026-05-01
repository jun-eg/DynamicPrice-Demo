// 認証ミドルウェア。auth() を middleware として使うと未ログイン時に
// pages.signIn にリダイレクトされる。
// signin/Auth.js エンドポイント/Next 内部アセットは matcher で除外する。

export { auth as middleware } from './auth';

export const config = {
  matcher: ['/((?!api/auth|signin|_next/static|_next/image|favicon.ico).*)'],
};
