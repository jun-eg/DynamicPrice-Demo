import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { auth } from '@/auth';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'DynamicPrice Demo',
  description: '旅館向け動的価格決定支援ツール (試験運用)',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  return (
    <html lang="ja">
      <body style={{ margin: 0, fontFamily: 'sans-serif' }}>
        {session?.user ? (
          <AppShell role={session.user.role}>{children}</AppShell>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
