import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import type { RecommendationsResponse } from '@app/shared';
import RecommendationsFilter from './_components/RecommendationsFilter';
import RecommendationsMatrix from './_components/RecommendationsMatrix';

interface PageProps {
  searchParams: Promise<{ dateFrom?: string; dateTo?: string; roomTypeId?: string; planId?: string }>;
}

function defaultDateRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return {
    dateFrom: `${y}-${m}-01`,
    dateTo: `${y}-${m}-${String(lastDay).padStart(2, '0')}`,
  };
}

export default async function RecommendationsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/signin');

  const params = await searchParams;
  const defaults = defaultDateRange();
  const dateFrom = params.dateFrom ?? defaults.dateFrom;
  const dateTo = params.dateTo ?? defaults.dateTo;
  const roomTypeId = params.roomTypeId ?? '';
  const planId = params.planId ?? '';

  const qs = new URLSearchParams({ dateFrom, dateTo });
  if (roomTypeId) qs.set('roomTypeId', roomTypeId);
  if (planId) qs.set('planId', planId);

  const subject = {
    id: session.user.userId,
    email: session.user.email ?? '',
    role: session.user.role,
  };

  let data: RecommendationsResponse | null = null;
  let errorMsg: string | null = null;
  try {
    data = await apiFetch<RecommendationsResponse>(`/recommendations?${qs}`, subject);
  } catch (e) {
    if (e instanceof ApiClientError) {
      errorMsg = e.message;
    } else {
      throw e;
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>推奨価格マトリックス</h1>
      <Suspense>
        <RecommendationsFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          roomTypeId={roomTypeId}
          planId={planId}
        />
      </Suspense>
      {errorMsg ? (
        <p role="alert" style={{ color: '#b00020' }}>
          {errorMsg}
        </p>
      ) : data ? (
        <RecommendationsMatrix items={data.items} computedAt={data.computedAt} />
      ) : null}
    </div>
  );
}
