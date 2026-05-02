'use server';

import { auth } from '@/auth';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import type { AdminInvitationCreateRequest, AdminInvitationCreateResponse } from '@app/shared';

export type InviteState =
  | { status: 'idle' }
  | { status: 'success'; data: AdminInvitationCreateResponse }
  | { status: 'error'; message: string };

export async function inviteUser(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return { status: 'error', message: '権限がありません' };
  }

  const email = formData.get('email');
  const role = formData.get('role');
  if (typeof email !== 'string' || typeof role !== 'string') {
    return { status: 'error', message: '入力値が不正です' };
  }
  if (role !== 'ADMIN' && role !== 'MEMBER') {
    return { status: 'error', message: 'ロールは ADMIN または MEMBER を選択してください' };
  }

  const body: AdminInvitationCreateRequest = { email, role };
  try {
    const data = await apiFetch<AdminInvitationCreateResponse>(
      '/admin/invitations',
      { id: session.user.userId, email: session.user.email ?? '', role: session.user.role },
      { method: 'POST', body: JSON.stringify(body) },
    );
    return { status: 'success', data };
  } catch (e) {
    if (e instanceof ApiClientError) {
      return { status: 'error', message: e.message };
    }
    throw e;
  }
}
