// 認証ミドルウェア。
// 未認証アクセスは /signin?from=<元のパス> へリダイレクトし、各ページの
// セッション切れ分岐を不要にする (issue #44)。
// /admin/* は ADMIN ロールのみ許可し、それ以外はホームへ。

import { auth } from './auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { pathname, search } = req.nextUrl;

  if (!req.auth?.user) {
    const signInUrl = new URL('/signin', req.nextUrl);
    if (pathname !== '/' && !pathname.startsWith('/signin')) {
      signInUrl.searchParams.set('from', `${pathname}${search}`);
    }
    return NextResponse.redirect(signInUrl);
  }

  if (pathname.startsWith('/admin') && req.auth.user.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/', req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!api/auth|signin|_next/static|_next/image|favicon.ico).*)'],
};
