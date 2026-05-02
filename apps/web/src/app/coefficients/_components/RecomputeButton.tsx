'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminCoefficientsRecomputeResponse } from '@app/shared';

type Status =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'success'; computedAt: string; rowsCreated: number }
  | { kind: 'error'; message: string };

export default function RecomputeButton() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const running = status.kind === 'running';

  async function handleClick() {
    if (!confirm('直近の予約データから係数を再計算します。実行しますか？')) return;
    setStatus({ kind: 'running' });
    try {
      const res = await fetch('/api/admin/coefficients/recompute', { method: 'POST' });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as AdminCoefficientsRecomputeResponse;
      setStatus({ kind: 'success', computedAt: data.computedAt, rowsCreated: data.rowsCreated });
      // サーバコンポーネントの /coefficients を取り直して最新値を反映する。
      startTransition(() => router.refresh());
    } catch (e) {
      setStatus({
        kind: 'error',
        message: e instanceof Error ? e.message : '再計算に失敗しました',
      });
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={running}
        style={{
          padding: '0.35rem 1rem',
          background: running ? '#94a3b8' : '#0f766e',
          color: '#fff',
          border: 'none',
          borderRadius: '0.375rem',
          fontSize: '0.875rem',
          cursor: running ? 'not-allowed' : 'pointer',
        }}
      >
        {running ? '再計算中...' : '再計算'}
      </button>
      {status.kind === 'success' && (
        <span style={{ color: '#16a34a', fontSize: '0.875rem' }}>
          再計算しました ({status.rowsCreated} 件 / {new Date(status.computedAt).toLocaleString('ja-JP')})
        </span>
      )}
      {status.kind === 'error' && (
        <span role="alert" style={{ color: '#b00020', fontSize: '0.875rem' }}>
          {status.message}
        </span>
      )}
    </div>
  );
}
