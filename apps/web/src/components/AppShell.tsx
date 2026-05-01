import type { ReactNode } from 'react';
import Link from 'next/link';
import type { Role } from '@app/shared';
import { signOut } from '@/auth';

interface AppShellProps {
  role: Role;
  children: ReactNode;
}

export default function AppShell({ role, children }: AppShellProps) {
  return (
    <>
      <nav
        style={{
          display: 'flex',
          gap: '1.5rem',
          alignItems: 'center',
          padding: '0.75rem 1.5rem',
          background: '#1e293b',
          color: '#f1f5f9',
        }}
      >
        <Link href="/" style={{ color: '#f1f5f9', fontWeight: 'bold', textDecoration: 'none' }}>
          DynamicPrice
        </Link>
        <Link href="/recommendations" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
          推奨価格
        </Link>
        <Link href="/stats" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
          統計
        </Link>
        <Link href="/coefficients" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
          係数
        </Link>
        {role === 'ADMIN' && (
          <>
            <Link href="/admin/invite" style={{ color: '#93c5fd', textDecoration: 'none' }}>
              招待
            </Link>
            <Link href="/admin/users" style={{ color: '#93c5fd', textDecoration: 'none' }}>
              ユーザー管理
            </Link>
          </>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: '#94a3b8' }}>
          {role}
        </span>
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/signin' });
          }}
        >
          <button
            type="submit"
            style={{
              background: 'transparent',
              border: '1px solid #475569',
              color: '#cbd5e1',
              padding: '0.25rem 0.75rem',
              borderRadius: '0.25rem',
              cursor: 'pointer',
            }}
          >
            ログアウト
          </button>
        </form>
      </nav>
      <main style={{ padding: '1.5rem' }}>{children}</main>
    </>
  );
}
