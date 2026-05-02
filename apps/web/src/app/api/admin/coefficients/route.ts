import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { apiFetch, ApiClientError } from '@/lib/api-client';
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
    if (e instanceof ApiClientError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 500 });
    }
    throw e;
  }
}
