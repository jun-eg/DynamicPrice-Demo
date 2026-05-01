// 認証ミドルウェア。
// /admin/* はADMINロールのみ許可し、それ以外はホームへリダイレクト。

import { auth } from './auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  if (req.nextUrl.pathname.startsWith('/admin')) {
    if (req.auth?.user?.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/', req.nextUrl));
    }
  }
  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!api/auth|signin|_next/static|_next/image|favicon.ico).*)'],
};
