'use client';

import { useState } from 'react';
import type { CoefficientItem } from '@app/shared';

interface Props {
  items: CoefficientItem[];
}

const TYPE_LABELS: Record<string, string> = {
  SEASON: '季節係数',
  DAY_OF_WEEK: '曜日係数',
  LEAD_TIME: 'リードタイム係数',
};

const DAY_LABELS: Record<string, string> = {
  MON: '月', TUE: '火', WED: '水', THU: '木', FRI: '金', SAT: '土', SUN: '日',
};

function displayKey(type: string, key: string): string {
  if (type === 'SEASON') return `${key}月`;
  if (type === 'DAY_OF_WEEK') return DAY_LABELS[key] ?? key;
  return key;
}

export default function CoefficientsEditor({ items }: Props) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(items.map((item) => [`${item.type}|${item.key}`, item.value])),
  );
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  function handleChange(type: string, key: string, val: string) {
    setValues((prev) => ({ ...prev, [`${type}|${key}`]: val }));
  }

  async function handleSave() {
    setStatus('saving');
    try {
      const saveItems = items.map((item) => ({
        type: item.type,
        key: item.key,
        value: parseFloat(values[`${item.type}|${item.key}`] ?? item.value).toFixed(4),
      }));

      const res = await fetch('/api/admin/coefficients', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: saveItems }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      }

      setStatus('saved');
      setEditing(false);
      setTimeout(() => setStatus('idle'), 3000);
    } catch (e) {
      setStatus('error');
      setErrorMsg(e instanceof Error ? e.message : '保存に失敗しました');
    }
  }

  function handleCancel() {
    setValues(Object.fromEntries(items.map((item) => [`${item.type}|${item.key}`, item.value])));
    setEditing(false);
    setStatus('idle');
  }

  const groups = ['SEASON', 'DAY_OF_WEEK', 'LEAD_TIME'] as const;

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            style={{ padding: '0.35rem 1rem', background: '#1e293b', color: '#fff', border: 'none', borderRadius: '0.375rem', fontSize: '0.875rem', cursor: 'pointer' }}
          >
            係数を編集
          </button>
        ) : (
          <>
            <button
              onClick={handleSave}
              disabled={status === 'saving'}
              style={{ padding: '0.35rem 1rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '0.375rem', fontSize: '0.875rem', cursor: 'pointer' }}
            >
              {status === 'saving' ? '保存中...' : '保存'}
            </button>
            <button
              onClick={handleCancel}
              style={{ padding: '0.35rem 1rem', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.875rem', cursor: 'pointer' }}
            >
              キャンセル
            </button>
          </>
        )}
        {status === 'saved' && <span style={{ color: '#16a34a', fontSize: '0.875rem' }}>保存しました</span>}
        {status === 'error' && <span style={{ color: '#b00020', fontSize: '0.875rem' }}>{errorMsg}</span>}
      </div>

      {editing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {groups.map((type) => {
            const groupItems = items.filter((i) => i.type === type);
            if (groupItems.length === 0) return null;
            return (
              <section key={type}>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', fontWeight: 600 }}>{TYPE_LABELS[type]}</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                  {groupItems.map((item) => (
                    <div key={item.key} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '80px' }}>
                      <label style={{ fontSize: '0.8rem', color: '#64748b' }}>{displayKey(type, item.key)}</label>
                      <input
                        type="number"
                        step="0.0001"
                        min="0.1"
                        max="9.9999"
                        value={values[`${type}|${item.key}`] ?? item.value}
                        onChange={(e) => handleChange(type, item.key, e.target.value)}
                        style={{ width: '90px', padding: '0.3rem 0.5rem', border: '1px solid #94a3b8', borderRadius: '0.375rem', fontSize: '0.875rem' }}
                      />
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
