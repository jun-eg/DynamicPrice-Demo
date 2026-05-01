import { auth } from '@/auth';
import { apiFetch } from '@/lib/api-client';
import type { CoefficientsResponse } from '@app/shared';
import CoefficientsCharts from './_components/CoefficientsCharts';

export default async function CoefficientsPage() {
  const session = await auth();
  if (!session?.user) {
    return <p>セッションが切れました。再ログインしてください。</p>;
  }

  const subject = {
    id: session.user.userId,
    email: session.user.email ?? '',
    role: session.user.role,
  };

  let data: CoefficientsResponse | null = null;
  let errorMsg: string | null = null;
  try {
    data = await apiFetch<CoefficientsResponse>('/coefficients', subject);
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : '取得に失敗しました';
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>係数</h1>
      {errorMsg ? (
        <p role="alert" style={{ color: '#b00020' }}>
          {errorMsg}
        </p>
      ) : data ? (
        <CoefficientsCharts
          items={data.items}
          computedAt={data.computedAt}
          source={data.source}
        />
      ) : null}
    </div>
  );
}
