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
  Cell,
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
        const group = items.filter((i) => i.type === key);
        const data = group.map((i) => ({
          name: i.key,
          係数: parseFloat(i.value),
          fallback: i.fallback,
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
                <Bar dataKey="係数">
                  {data.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={entry.fallback ? BAR_FALLBACK : BAR_NORMAL}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </section>
        );
      })}
    </div>
  );
}
