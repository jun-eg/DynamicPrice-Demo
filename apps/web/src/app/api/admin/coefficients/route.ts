import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { apiFetch } from '@/lib/api-client';
import type { AdminCoefficientsSaveRequest, AdminCoefficientsSaveResponse } from '@app/shared';

export async function PUT(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' } }, { status: 401 });
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'ADMIN role required' } }, { status: 403 });
  }

  const body = await request.json() as AdminCoefficientsSaveRequest;
  const subject = { id: session.user.userId, email: session.user.email ?? '', role: session.user.role };

  try {
    const result = await apiFetch<AdminCoefficientsSaveResponse>('/admin/coefficients', subject, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: msg } }, { status: 500 });
  }
}
