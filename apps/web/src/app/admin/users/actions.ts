'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import type { AdminUserUpdateResponse } from '@app/shared';

export type DisableUserState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; message: string };

export async function disableUser(userId: number): Promise<DisableUserState> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return { status: 'error', message: '権限がありません' };
  }
  try {
    await apiFetch<AdminUserUpdateResponse>(
      `/admin/users/${userId}`,
      { id: session.user.userId, email: session.user.email ?? '', role: session.user.role },
      { method: 'PATCH', body: JSON.stringify({ status: 'DISABLED' }) },
    );
    revalidatePath('/admin/users');
    return { status: 'success' };
  } catch (e) {
    if (e instanceof ApiClientError) {
      return { status: 'error', message: e.message };
    }
    return { status: 'error', message: 'ユーザーの無効化に失敗しました' };
  }
}
