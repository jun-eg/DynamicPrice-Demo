import { auth } from '@/auth';
import { apiFetch } from '@/lib/api-client';
import type {
  StatsOccupancyResponse,
  StatsAdrResponse,
  StatsLeadTimeResponse,
} from '@app/shared';
import StatsCharts from './_components/StatsCharts';

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

export default async function StatsPage() {
  const session = await auth();
  if (!session?.user) {
    return <p>セッションが切れました。再ログインしてください。</p>;
  }

  const subject = {
    id: session.user.userId,
    email: session.user.email ?? '',
    role: session.user.role,
  };

  const { from, to } = defaultRange();
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
    errorMsg = e instanceof Error ? e.message : '取得に失敗しました';
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>統計</h1>
      <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        期間: {from} 〜 {to}
      </p>
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
