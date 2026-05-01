'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@app/shared';

interface NavLinksProps {
  role: Role;
}

const NAV_ITEMS = [
  { href: '/recommendations', label: '推奨価格', adminOnly: false },
  { href: '/stats', label: '統計', adminOnly: false },
  { href: '/coefficients', label: '係数', adminOnly: false },
  { href: '/admin/invite', label: '招待', adminOnly: true },
  { href: '/admin/users', label: 'ユーザー管理', adminOnly: true },
];

export default function NavLinks({ role }: NavLinksProps) {
  const pathname = usePathname();

  return (
    <>
      {NAV_ITEMS.filter((item) => !item.adminOnly || role === 'ADMIN').map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              color: active ? '#fff' : '#cbd5e1',
              textDecoration: 'none',
              fontSize: '0.9rem',
              padding: '0.25rem 0',
              borderBottom: active ? '2px solid #60a5fa' : '2px solid transparent',
              fontWeight: active ? 600 : 400,
              transition: 'color 0.15s',
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
