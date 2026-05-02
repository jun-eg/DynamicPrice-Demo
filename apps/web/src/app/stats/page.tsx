import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import type {
  StatsOccupancyResponse,
  StatsAdrResponse,
  StatsLeadTimeResponse,
} from '@app/shared';
import { Suspense } from 'react';
import StatsCharts from './_components/StatsCharts';
import StatsRangeFilter from './_components/StatsRangeFilter';

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const fromDate = new Date(y, m - 5, 1);
  const fromY = fromDate.getFullYear();
  const fromM = String(fromDate.getMonth() + 1).padStart(2, '0');
  const toM = String(m + 1).padStart(2, '0');
  return { from: `${fromY}-${fromM}`, to: `${y}-${toM}` };
}

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string }>;
}

export default async function StatsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/signin');

  const subject = {
    id: session.user.userId,
    email: session.user.email ?? '',
    role: session.user.role,
  };

  const params = await searchParams;
  const def = defaultRange();
  const from = params.from ?? def.from;
  const to = params.to ?? def.to;
  const qs = new URLSearchParams({ from, to }).toString();

  let occupancy: StatsOccupancyResponse | null = null;
  let adr: StatsAdrResponse | null = null;
  let leadTime: StatsLeadTimeResponse | null = null;
  let errorMsg: string | null = null;

  try {
    [occupancy, adr, leadTime] = await Promise.all([
      apiFetch<StatsOccupancyResponse>(`/stats/occupancy?${qs}`, subject),
      apiFetch<StatsAdrResponse>(`/stats/adr?${qs}`, subject),
      apiFetch<StatsLeadTimeResponse>(`/stats/lead-time?${qs}`, subject),
    ]);
  } catch (e) {
    if (e instanceof ApiClientError) {
      errorMsg = e.message;
    } else {
      throw e;
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>統計</h1>
      <Suspense>
        <StatsRangeFilter from={from} to={to} />
      </Suspense>
      {errorMsg ? (
        <p role="alert" style={{ color: '#b00020' }}>
          {errorMsg}
        </p>
      ) : occupancy && adr && leadTime ? (
        <StatsCharts
          occupancy={occupancy.items}
          adr={adr.items}
          leadTime={leadTime.items}
        />
      ) : null}
    </div>
  );
}
