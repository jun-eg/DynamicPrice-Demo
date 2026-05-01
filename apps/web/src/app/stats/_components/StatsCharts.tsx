'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { OccupancyItem, AdrItem, LeadTimeDistributionItem } from '@app/shared';

interface StatsChartsProps {
  occupancy: OccupancyItem[];
  adr: AdrItem[];
  leadTime: LeadTimeDistributionItem[];
}

const CHART_HEIGHT = 280;

export default function StatsCharts({ occupancy, adr, leadTime }: StatsChartsProps) {
  const occupancyData = occupancy.map((item) => ({
    name: item.yearMonth,
    稼働率: Math.round(parseFloat(item.occupancyRate) * 100),
  }));

  const adrData = adr.map((item) => ({
    name: item.yearMonth,
    ADR: parseFloat(item.adr),
  }));

  const leadTimeData = leadTime.map((item) => ({
    name: item.bin,
    シェア: Math.round(parseFloat(item.share) * 100),
    件数: item.count,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
      <section>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>月別稼働率 (%)</h2>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <LineChart data={occupancyData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis domain={[0, 100]} unit="%" />
            <Tooltip formatter={(v) => `${String(v)}%`} />
            <Legend />
            <Line type="monotone" dataKey="稼働率" stroke="#2563eb" strokeWidth={2} dot />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>月別 ADR (円)</h2>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <BarChart data={adrData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(v: number) => `¥${v.toLocaleString('ja-JP')}`} />
            <Tooltip formatter={(v) => typeof v === 'number' ? `¥${v.toLocaleString('ja-JP')}` : String(v)} />
            <Legend />
            <Bar dataKey="ADR" fill="#0891b2" />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>リードタイム分布</h2>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <BarChart data={leadTimeData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis unit="%" />
            <Tooltip
              formatter={(v, name) =>
                name === 'シェア' ? `${String(v)}%` : `${String(v)}件`
              }
            />
            <Legend />
            <Bar dataKey="シェア" fill="#7c3aed" />
          </BarChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}
