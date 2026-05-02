'use client';

import { useMemo, useState, useTransition } from 'react';
import type {
  AdminBasePriceItem,
  AdminBasePricePlan,
  AdminBasePriceRoomType,
} from '@app/shared';
import { upsertBasePrice } from '../actions';

interface Props {
  roomTypes: AdminBasePriceRoomType[];
  plans: AdminBasePricePlan[];
  items: AdminBasePriceItem[];
}

export default function BasePricesTable({ roomTypes, plans, items }: Props) {
  // (RoomType, Plan) → 最新行 (effectiveFrom が最新の 1 件) のインデックス。
  // 試作段階では履歴を持たないので「最新行」が「現行値」と同義。
  const latestByCombo = useMemo(() => {
    const map = new Map<string, AdminBasePriceItem>();
    for (const item of items) {
      const key = `${item.roomTypeId}|${item.planId}`;
      const prev = map.get(key);
      if (!prev || prev.effectiveFrom < item.effectiveFrom) {
        map.set(key, item);
      }
    }
    return map;
  }, [items]);

  if (roomTypes.length === 0) {
    return <p>部屋タイプが存在しません。先に部屋タイプを登録してください。</p>;
  }
  if (plans.length === 0) {
    return (
      <p>
        プランが存在しません。CSV を取り込むかマスター seed を実行するとプランが登録されます。
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {roomTypes.map((rt) => (
        <section key={rt.id}>
          <h2 style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>
            {rt.name}{' '}
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              (code: {rt.code})
            </span>
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                borderCollapse: 'collapse',
                width: '100%',
                fontSize: '0.875rem',
              }}
            >
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  {['プラン', '基準価格', '下限', '上限', '有効開始', '操作'].map((h) => (
                    <th key={h} style={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <BasePriceRow
                    key={plan.id}
                    roomType={rt}
                    plan={plan}
                    current={latestByCombo.get(`${rt.id}|${plan.id}`) ?? null}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

interface RowProps {
  roomType: AdminBasePriceRoomType;
  plan: AdminBasePricePlan;
  current: AdminBasePriceItem | null;
}

function BasePriceRow({ roomType, plan, current }: RowProps) {
  const [amount, setAmount] = useState(current?.amount ?? '');
  const [priceMin, setPriceMin] = useState(current?.priceMin ?? '');
  const [priceMax, setPriceMax] = useState(current?.priceMax ?? '');
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  const dirty =
    amount !== (current?.amount ?? '') ||
    priceMin !== (current?.priceMin ?? '') ||
    priceMax !== (current?.priceMax ?? '');

  const ready =
    amount.trim() !== '' && priceMin.trim() !== '' && priceMax.trim() !== '';

  function handleSave() {
    if (!ready) {
      setFeedback('基準価格・下限・上限をすべて入力してください');
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const result = await upsertBasePrice({
        roomTypeId: roomType.id,
        planId: plan.id,
        amount,
        priceMin,
        priceMax,
      });
      if (result.status === 'error') {
        setFeedback(result.message);
      } else {
        setFeedback('保存しました');
      }
    });
  }

  return (
    <tr>
      <td style={td}>
        {plan.name}
        {plan.mealType ? (
          <span style={{ color: '#64748b', fontSize: '0.75rem', marginLeft: '0.4rem' }}>
            ({plan.mealType})
          </span>
        ) : null}
      </td>
      <td style={td}>
        <PriceInput value={amount} onChange={setAmount} disabled={isPending} />
      </td>
      <td style={td}>
        <PriceInput value={priceMin} onChange={setPriceMin} disabled={isPending} />
      </td>
      <td style={td}>
        <PriceInput value={priceMax} onChange={setPriceMax} disabled={isPending} />
      </td>
      <td style={td}>{current ? current.effectiveFrom : '-'}</td>
      <td style={td}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            disabled={!dirty || !ready || isPending}
            onClick={handleSave}
            style={{
              padding: '0.25rem 0.75rem',
              background: dirty && ready ? '#2563eb' : '#94a3b8',
              color: '#fff',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: dirty && ready && !isPending ? 'pointer' : 'not-allowed',
              fontSize: '0.8rem',
            }}
          >
            {current ? '保存' : '追加'}
          </button>
          {feedback ? (
            <span
              style={{
                fontSize: '0.75rem',
                color: feedback === '保存しました' ? '#16a34a' : '#b00020',
              }}
            >
              {feedback}
            </span>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

interface PriceInputProps {
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
}

function PriceInput({ value, onChange, disabled }: PriceInputProps) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder="例: 20000"
      style={{
        width: '7rem',
        padding: '0.25rem 0.5rem',
        border: '1px solid #cbd5e1',
        borderRadius: '0.25rem',
        fontSize: '0.875rem',
      }}
    />
  );
}

const th: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  border: '1px solid #e2e8f0',
  textAlign: 'left',
  whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  padding: '0.4rem 0.75rem',
  border: '1px solid #e2e8f0',
  whiteSpace: 'nowrap',
};
