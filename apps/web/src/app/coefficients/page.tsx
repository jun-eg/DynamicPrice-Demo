import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import type { CoefficientsResponse } from '@app/shared';
import CoefficientsCharts from './_components/CoefficientsCharts';
import CoefficientsEditor from './_components/CoefficientsEditor';
import RecomputeButton from './_components/RecomputeButton';

export default async function CoefficientsPage() {
  const session = await auth();
  if (!session?.user) redirect('/signin');

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
    if (e instanceof ApiClientError) {
      errorMsg = e.message;
    } else {
      throw e;
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>係数</h1>
      {errorMsg ? (
        <p role="alert" style={{ color: '#b00020' }}>
          {errorMsg}
        </p>
      ) : data ? (
        <>
          {session.user.role === 'ADMIN' && <RecomputeButton />}
          <CoefficientsCharts
            items={data.items}
            computedAt={data.computedAt}
            source={data.source}
          />
          {session.user.role === 'ADMIN' && (
            <CoefficientsEditor items={data.items} />
          )}
        </>
      ) : null}
    </div>
  );
}
