'use client';

import { useTransition } from 'react';
import type { AdminUser } from '@app/shared';
import { disableUser } from '../actions';

interface UsersTableProps {
  users: AdminUser[];
}

export default function UsersTable({ users }: UsersTableProps) {
  const [isPending, startTransition] = useTransition();

  if (users.length === 0) {
    return <p>ユーザーが存在しません。</p>;
  }

  const handleDisable = (userId: number) => {
    if (!confirm('このユーザーを無効化しますか？')) return;
    startTransition(async () => {
      const result = await disableUser(userId);
      if (result.status === 'error') {
        alert(result.message);
      }
    });
  };

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
            {['ID', 'メール', '名前', 'ロール', 'ステータス', '最終ログイン', '操作'].map(
              (h) => (
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
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr
              key={user.id}
              style={{ opacity: user.status === 'DISABLED' ? 0.5 : 1 }}
            >
              <td style={td}>{user.id}</td>
              <td style={td}>{user.email}</td>
              <td style={td}>{user.name ?? '-'}</td>
              <td style={td}>{user.role}</td>
              <td style={td}>
                <span
                  style={{
                    padding: '0.125rem 0.5rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    background: user.status === 'ACTIVE' ? '#dcfce7' : '#fee2e2',
                    color: user.status === 'ACTIVE' ? '#166534' : '#991b1b',
                  }}
                >
                  {user.status}
                </span>
              </td>
              <td style={td}>
                {user.lastLoginAt
                  ? new Date(user.lastLoginAt).toLocaleString('ja-JP')
                  : '-'}
              </td>
              <td style={td}>
                {user.status === 'ACTIVE' && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleDisable(user.id)}
                    style={{
                      padding: '0.25rem 0.75rem',
                      background: '#ef4444',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '0.25rem',
                      cursor: isPending ? 'not-allowed' : 'pointer',
                      fontSize: '0.8rem',
                    }}
                  >
                    無効化
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const td: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  border: '1px solid #e2e8f0',
  whiteSpace: 'nowrap',
};
