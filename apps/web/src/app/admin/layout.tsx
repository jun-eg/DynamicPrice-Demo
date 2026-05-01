import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { auth } from '@/auth';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    notFound();
  }
  return <>{children}</>;
}
