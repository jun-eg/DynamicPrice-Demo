import { auth } from '@/auth';
import { apiFetch } from '@/lib/api-client';
import type { AdminUsersListResponse } from '@app/shared';
import UsersTable from './_components/UsersTable';

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session?.user) {
    return <p>セッションが切れました。再ログインしてください。</p>;
  }

  const subject = {
    id: session.user.userId,
    email: session.user.email ?? '',
    role: session.user.role,
  };

  let data: AdminUsersListResponse | null = null;
  let errorMsg: string | null = null;
  try {
    data = await apiFetch<AdminUsersListResponse>('/admin/users', subject);
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : '取得に失敗しました';
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>ユーザー管理</h1>
      {errorMsg ? (
        <p role="alert" style={{ color: '#b00020' }}>
          {errorMsg}
        </p>
      ) : data ? (
        <UsersTable users={data.items} />
      ) : null}
    </div>
  );
}
