'use client';

import type { RecommendationItem } from '@app/shared';

interface BreakdownPopupProps {
  item: RecommendationItem;
  onClose: () => void;
}

export default function BreakdownPopup({ item, onClose }: BreakdownPopupProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '0.5rem',
          padding: '1.5rem',
          minWidth: 320,
          boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>
          {item.date} / 部屋{item.roomTypeId} / プラン{item.planId}
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <tbody>
            <Row label="基本価格" value={`¥${parseFloat(item.basePrice).toLocaleString('ja-JP')}`} />
            <Row label="季節係数" value={item.coefficients.season} />
            <Row label="曜日係数" value={item.coefficients.dayOfWeek} />
            <Row label="リードタイム係数" value={item.coefficients.leadTime} />
            <Row label="計算価格" value={`¥${parseFloat(item.rawPrice).toLocaleString('ja-JP')}`} />
            <Row
              label="確定価格"
              value={`¥${parseFloat(item.clampedPrice).toLocaleString('ja-JP')}`}
              bold
            />
            {item.clampReason !== null && (
              <Row label="補正理由" value={item.clampReason} />
            )}
          </tbody>
        </table>
        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: '1rem',
            padding: '0.5rem 1.5rem',
            background: '#1e293b',
            color: '#fff',
            border: 'none',
            borderRadius: '0.25rem',
            cursor: 'pointer',
          }}
        >
          閉じる
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <tr>
      <td
        style={{
          padding: '0.25rem 0.5rem',
          color: '#64748b',
          borderBottom: '1px solid #f1f5f9',
        }}
      >
        {label}
      </td>
      <td
        style={{
          padding: '0.25rem 0.5rem',
          textAlign: 'right',
          borderBottom: '1px solid #f1f5f9',
          fontWeight: bold ? 'bold' : undefined,
        }}
      >
        {value}
      </td>
    </tr>
  );
}
