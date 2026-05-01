'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

interface RecommendationsFilterProps {
  dateFrom: string;
  dateTo: string;
  roomTypeId: string;
  planId: string;
}

export default function RecommendationsFilter({
  dateFrom,
  dateTo,
  roomTypeId,
  planId,
}: RecommendationsFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = e.currentTarget;
      const params = new URLSearchParams(searchParams.toString());
      const fromEl = form.elements.namedItem('dateFrom') as HTMLInputElement;
      const toEl = form.elements.namedItem('dateTo') as HTMLInputElement;
      const roomEl = form.elements.namedItem('roomTypeId') as HTMLInputElement;
      const planEl = form.elements.namedItem('planId') as HTMLInputElement;
      params.set('dateFrom', fromEl.value);
      params.set('dateTo', toEl.value);
      if (roomEl.value) {
        params.set('roomTypeId', roomEl.value);
      } else {
        params.delete('roomTypeId');
      }
      if (planEl.value) {
        params.set('planId', planEl.value);
      } else {
        params.delete('planId');
      }
      router.replace(`/recommendations?${params.toString()}`);
    },
    [router, searchParams],
  );

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
        開始日
        <input type="date" name="dateFrom" defaultValue={dateFrom} required />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
        終了日
        <input type="date" name="dateTo" defaultValue={dateTo} required />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
        部屋タイプID
        <input
          type="number"
          name="roomTypeId"
          defaultValue={roomTypeId}
          placeholder="すべて"
          min={1}
          style={{ width: '7rem' }}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
        プランID
        <input
          type="number"
          name="planId"
          defaultValue={planId}
          placeholder="すべて"
          min={1}
          style={{ width: '7rem' }}
        />
      </label>
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <button
          type="submit"
          style={{
            padding: '0.4rem 1rem',
            background: '#1e293b',
            color: '#fff',
            border: 'none',
            borderRadius: '0.25rem',
            cursor: 'pointer',
          }}
        >
          絞り込む
        </button>
      </div>
    </form>
  );
}
