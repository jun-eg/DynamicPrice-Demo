'use client';

import { useState, useTransition } from 'react';
import type { AdminRoomType } from '@app/shared';
import { updateInventoryCount } from '../actions';

interface RoomTypesTableProps {
  roomTypes: AdminRoomType[];
}

export default function RoomTypesTable({ roomTypes }: RoomTypesTableProps) {
  if (roomTypes.length === 0) {
    return <p>部屋タイプが存在しません。</p>;
  }

  return (
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
            {['ID', 'コード', '名称', '定員', '部屋数', '操作'].map((h) => (
              <th
                key={h}
                style={{
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #e2e8f0',
                  textAlign: 'left',
                  whiteSpace: 'nowrap',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roomTypes.map((rt) => (
            <RoomTypeRow key={rt.id} roomType={rt} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoomTypeRow({ roomType }: { roomType: AdminRoomType }) {
  const [draft, setDraft] = useState<string>(String(roomType.inventoryCount));
  const [isPending, startTransition] = useTransition();
  const dirty = draft !== String(roomType.inventoryCount);

  const handleSave = () => {
    const next = Number(draft);
    if (!Number.isInteger(next) || next < 0) {
      alert('部屋数は 0 以上の整数で指定してください');
      return;
    }
    if (!confirm(`部屋タイプ「${roomType.name}」の部屋数を ${roomType.inventoryCount} → ${next} に変更します。過去月の稼働率にも影響します。続行しますか？`)) {
      return;
    }
    startTransition(async () => {
      const result = await updateInventoryCount(roomType.id, next);
      if (result.status === 'error') {
        alert(result.message);
      }
    });
  };

  return (
    <tr>
      <td style={td}>{roomType.id}</td>
      <td style={td}>{roomType.code}</td>
      <td style={td}>{roomType.name}</td>
      <td style={td}>{roomType.capacity ?? '-'}</td>
      <td style={td}>
        <input
          type="number"
          min={0}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={isPending}
          style={{
            width: '6rem',
            padding: '0.25rem 0.5rem',
            border: '1px solid #cbd5e1',
            borderRadius: '0.25rem',
            fontSize: '0.875rem',
          }}
        />
      </td>
      <td style={td}>
        <button
          type="button"
          disabled={!dirty || isPending}
          onClick={handleSave}
          style={{
            padding: '0.25rem 0.75rem',
            background: dirty ? '#2563eb' : '#94a3b8',
            color: '#fff',
            border: 'none',
            borderRadius: '0.25rem',
            cursor: dirty && !isPending ? 'pointer' : 'not-allowed',
            fontSize: '0.8rem',
          }}
        >
          保存
        </button>
      </td>
    </tr>
  );
}

const td: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  border: '1px solid #e2e8f0',
  whiteSpace: 'nowrap',
};
