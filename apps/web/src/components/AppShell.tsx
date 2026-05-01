import type { ReactNode } from 'react';
import Link from 'next/link';
import type { Role } from '@app/shared';
import { signOut } from '@/auth';
import NavLinks from './NavLinks';

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
          padding: '0 1.5rem',
          height: '48px',
          background: '#1e293b',
          color: '#f1f5f9',
        }}
      >
        <Link href="/" style={{ color: '#f1f5f9', fontWeight: 'bold', textDecoration: 'none', fontSize: '0.95rem', marginRight: '0.5rem' }}>
          DynamicPrice
        </Link>
        <NavLinks role={role} />
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#94a3b8' }}>
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
              fontSize: '0.8rem',
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
