'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

interface Props {
  from: string;
  to: string;
}

export default function StatsRangeFilter({ from, to }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [fromVal, setFromVal] = useState(from);
  const [toVal, setToVal] = useState(to);

  function apply() {
    if (fromVal > toVal) {
      alert('開始月は終了月より前にしてください');
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('from', fromVal);
    params.set('to', toVal);
    router.push(`/stats?${params.toString()}`);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
      <label style={{ fontSize: '0.875rem', color: '#64748b' }}>期間:</label>
      <input
        type="month"
        value={fromVal}
        onChange={(e) => setFromVal(e.target.value)}
        style={{ padding: '0.25rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.875rem' }}
      />
      <span style={{ color: '#64748b' }}>〜</span>
      <input
        type="month"
        value={toVal}
        onChange={(e) => setToVal(e.target.value)}
        style={{ padding: '0.25rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.875rem' }}
      />
      <button
        onClick={apply}
        style={{ padding: '0.25rem 0.75rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '0.375rem', fontSize: '0.875rem', cursor: 'pointer' }}
      >
        適用
      </button>
    </div>
  );
}
