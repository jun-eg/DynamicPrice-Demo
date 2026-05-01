'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { CoefficientItem } from '@app/shared';

interface CoefficientsChartsProps {
  items: CoefficientItem[];
  computedAt: string;
  source: string;
}

const CHART_HEIGHT = 260;
const BAR_NORMAL = '#2563eb';
const BAR_FALLBACK = '#f59e0b';

type TypeGroup = {
  label: string;
  key: 'SEASON' | 'DAY_OF_WEEK' | 'LEAD_TIME';
};

const DAY_OF_WEEK_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const LEAD_TIME_ORDER = ['0-3', '4-7', '8-14', '15-30', '31+'];
const DAY_OF_WEEK_LABELS: Record<string, string> = {
  MON: '月', TUE: '火', WED: '水', THU: '木', FRI: '金', SAT: '土', SUN: '日',
};

const GROUPS: TypeGroup[] = [
  { label: '季節係数', key: 'SEASON' },
  { label: '曜日係数', key: 'DAY_OF_WEEK' },
  { label: 'リードタイム係数', key: 'LEAD_TIME' },
];

export default function CoefficientsCharts({
  items,
  computedAt,
  source,
}: CoefficientsChartsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
      <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>
        計算日時: {new Date(computedAt).toLocaleString('ja-JP')} / ソース: {source}
      </p>
      <p style={{ fontSize: '0.8rem', color: '#92400e', background: '#fef9c3', padding: '0.4rem 0.75rem', borderRadius: '0.25rem', margin: 0 }}>
        ★ 黄色バー = フォールバック値（サンプル数が不足しているため推定値を使用）
      </p>
      {GROUPS.map(({ label, key }) => {
        const rawGroup = items.filter((i) => i.type === key);
        const group = key === 'DAY_OF_WEEK'
          ? [...rawGroup].sort((a, b) => DAY_OF_WEEK_ORDER.indexOf(a.key) - DAY_OF_WEEK_ORDER.indexOf(b.key))
          : key === 'SEASON'
          ? [...rawGroup].sort((a, b) => Number(a.key) - Number(b.key))
          : key === 'LEAD_TIME'
          ? [...rawGroup].sort((a, b) => LEAD_TIME_ORDER.indexOf(a.key) - LEAD_TIME_ORDER.indexOf(b.key))
          : rawGroup;
        const data = group.map((i) => ({
          name: key === 'DAY_OF_WEEK'
            ? (DAY_OF_WEEK_LABELS[i.key] ?? i.key)
            : key === 'SEASON'
            ? `${i.key}月`
            : key === 'LEAD_TIME'
            ? (i.key === '31+' ? '31日以上' : `${i.key}日`)
            : i.key,
          係数: parseFloat(i.value),
          fill: i.fallback ? BAR_FALLBACK : BAR_NORMAL,
        }));

        return (
          <section key={key}>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>{label}</h2>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={['auto', 'auto']} tickFormatter={(v: number) => v.toFixed(3)} />
                <Tooltip
                  formatter={(v) =>
                    typeof v === 'number' ? v.toFixed(4) : String(v)
                  }
                />
                <Legend />
                <Bar dataKey="係数" />
              </BarChart>
            </ResponsiveContainer>
          </section>
        );
      })}
    </div>
  );
}
