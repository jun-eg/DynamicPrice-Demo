'use client';

import { useState } from 'react';
import type { RecommendationItem } from '@app/shared';
import BreakdownPopup from './BreakdownPopup';

interface RecommendationsMatrixProps {
  items: RecommendationItem[];
  computedAt: string;
}

export default function RecommendationsMatrix({ items, computedAt }: RecommendationsMatrixProps) {
  const [selected, setSelected] = useState<RecommendationItem | null>(null);

  if (items.length === 0) {
    return <p>該当するデータがありません。</p>;
  }

  // 日付ごとにグループ化
  const dates = [...new Set(items.map((i) => i.date))].sort();
  // (roomTypeId, planId) 列を抽出
  const columns = [
    ...new Map(
      items.map((i) => [`${i.roomTypeId}-${i.planId}`, { roomTypeId: i.roomTypeId, planId: i.planId }]),
    ).values(),
  ];

  // (date, roomTypeId, planId) → item のルックアップ
  const lookup = new Map<string, RecommendationItem>();
  for (const item of items) {
    lookup.set(`${item.date}-${item.roomTypeId}-${item.planId}`, item);
  }

  return (
    <>
      <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1rem' }}>
        計算日時: {new Date(computedAt).toLocaleString('ja-JP')}
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            borderCollapse: 'collapse',
            fontSize: '0.875rem',
            minWidth: '100%',
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  padding: '0.5rem 0.75rem',
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  whiteSpace: 'nowrap',
                }}
              >
                日付
              </th>
              {columns.map((col) => (
                <th
                  key={`${col.roomTypeId}-${col.planId}`}
                  style={{
                    padding: '0.5rem 0.75rem',
                    background: '#f1f5f9',
                    border: '1px solid #e2e8f0',
                    whiteSpace: 'nowrap',
                  }}
                >
                  部屋{col.roomTypeId} / プラン{col.planId}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dates.map((date) => (
              <tr key={date}>
                <td
                  style={{
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #e2e8f0',
                    whiteSpace: 'nowrap',
                    background: '#fafafa',
                  }}
                >
                  {date}
                </td>
                {columns.map((col) => {
                  const item = lookup.get(`${date}-${col.roomTypeId}-${col.planId}`);
                  return (
                    <td
                      key={`${col.roomTypeId}-${col.planId}`}
                      style={{
                        padding: '0.5rem 0.75rem',
                        border: '1px solid #e2e8f0',
                        textAlign: 'right',
                        cursor: item ? 'pointer' : undefined,
                        background: item?.clampReason !== null ? '#fef9c3' : undefined,
                      }}
                      onClick={() => item && setSelected(item)}
                    >
                      {item
                        ? `¥${parseFloat(item.clampedPrice).toLocaleString('ja-JP')}`
                        : '-'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.5rem' }}>
        ※ 黄色セルは価格が補正されています。クリックで内訳を表示。
      </p>
      {selected && <BreakdownPopup item={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
