// /admin/room-types — 部屋タイプ管理画面 (issue #59 §D)
// ADMIN 専用。inventoryCount のみ編集できる (capacity / name / code は不可)。

import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import type { AdminRoomTypesListResponse } from '@app/shared';
import RoomTypesTable from './_components/RoomTypesTable';

export default async function AdminRoomTypesPage() {
  const session = await auth();
  if (!session?.user) redirect('/signin');

  const subject = {
    id: session.user.userId,
    email: session.user.email ?? '',
    role: session.user.role,
  };

  let data: AdminRoomTypesListResponse | null = null;
  let errorMsg: string | null = null;
  try {
    data = await apiFetch<AdminRoomTypesListResponse>('/admin/room-types', subject);
  } catch (e) {
    if (e instanceof ApiClientError) {
      errorMsg = e.message;
    } else {
      throw e;
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>部屋タイプ管理</h1>
      <p
        role="note"
        style={{
          padding: '0.75rem 1rem',
          marginBottom: '1.5rem',
          background: '#fef3c7',
          border: '1px solid #fcd34d',
          borderRadius: '0.375rem',
          color: '#78350f',
          fontSize: '0.875rem',
          lineHeight: 1.6,
        }}
      >
        <strong>注意:</strong>{' '}
        部屋数 (inventoryCount) は稼働率の分母に直接使われます。値を変更すると、過去月の稼働率にも遡及で影響します
        (履歴管理は試作段階では採用していません)。
      </p>
      {errorMsg ? (
        <p role="alert" style={{ color: '#b00020' }}>
          {errorMsg}
        </p>
      ) : data ? (
        <RoomTypesTable roomTypes={data.items} />
      ) : null}
    </div>
  );
}
