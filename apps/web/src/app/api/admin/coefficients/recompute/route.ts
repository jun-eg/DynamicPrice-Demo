import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import type { AdminCoefficientsRecomputeResponse } from '@app/shared';

export async function POST(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' } },
      { status: 401 },
    );
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'ADMIN role required' } },
      { status: 403 },
    );
  }

  const subject = {
    id: session.user.userId,
    email: session.user.email ?? '',
    role: session.user.role,
  };

  try {
    const result = await apiFetch<AdminCoefficientsRecomputeResponse>(
      '/admin/coefficients/recompute',
      subject,
      { method: 'POST' },
    );
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ApiClientError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 500 });
    }
    throw e;
  }
}
