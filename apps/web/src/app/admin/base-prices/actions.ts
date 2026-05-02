'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import type {
  AdminBasePriceUpsertRequest,
  AdminBasePriceUpsertResponse,
} from '@app/shared';

export type UpsertBasePriceState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; message: string };

export async function upsertBasePrice(
  input: AdminBasePriceUpsertRequest,
): Promise<UpsertBasePriceState> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return { status: 'error', message: '権限がありません' };
  }

  try {
    await apiFetch<AdminBasePriceUpsertResponse>(
      '/admin/base-prices',
      { id: session.user.userId, email: session.user.email ?? '', role: session.user.role },
      { method: 'PUT', body: JSON.stringify(input) },
    );
    revalidatePath('/admin/base-prices');
    return { status: 'success' };
  } catch (e) {
    if (e instanceof ApiClientError) {
      return { status: 'error', message: e.message };
    }
    throw e;
  }
}
