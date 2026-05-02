'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import type { AdminRoomTypeUpdateResponse } from '@app/shared';

export type UpdateInventoryCountState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; message: string };

export async function updateInventoryCount(
  roomTypeId: number,
  inventoryCount: number,
): Promise<UpdateInventoryCountState> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return { status: 'error', message: '権限がありません' };
  }
  if (!Number.isInteger(inventoryCount) || inventoryCount < 0) {
    return { status: 'error', message: 'inventoryCount は 0 以上の整数で指定してください' };
  }
  try {
    await apiFetch<AdminRoomTypeUpdateResponse>(
      `/admin/room-types/${roomTypeId}`,
      { id: session.user.userId, email: session.user.email ?? '', role: session.user.role },
      { method: 'PATCH', body: JSON.stringify({ inventoryCount }) },
    );
    revalidatePath('/admin/room-types');
    return { status: 'success' };
  } catch (e) {
    if (e instanceof ApiClientError) {
      return { status: 'error', message: e.message };
    }
    throw e;
  }
}
