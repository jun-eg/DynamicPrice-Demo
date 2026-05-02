import { auth } from '@/auth';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import type { AdminPendingInvitationsListResponse } from '@app/shared';
import InviteForm from './_components/InviteForm';
import PendingInvitationsTable from './_components/PendingInvitationsTable';

export default async function AdminInvitePage() {
  const session = await auth();

  let pending: AdminPendingInvitationsListResponse | null = null;
  let pendingError: string | null = null;
  if (session?.user) {
    const subject = {
      id: session.user.userId,
      email: session.user.email ?? '',
      role: session.user.role,
    };
    try {
      pending = await apiFetch<AdminPendingInvitationsListResponse>(
        '/admin/invitations',
        subject,
      );
    } catch (e) {
      if (e instanceof ApiClientError) {
        pendingError = e.message;
      } else {
        throw e;
      }
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>招待発行</h1>
      <InviteForm />

      <section style={{ marginTop: '2.5rem' }}>
        <h2 style={{ fontSize: '1.125rem', marginBottom: '0.75rem' }}>招待中ユーザー</h2>
        <p style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          発行済みで未消化、かつ有効期限内の招待を表示します。サインインで消化されると一覧から消えます。
        </p>
        {pendingError ? (
          <p role="alert" style={{ color: '#b00020' }}>
            {pendingError}
          </p>
        ) : pending ? (
          <PendingInvitationsTable items={pending.items} />
        ) : null}
      </section>
    </div>
  );
}
