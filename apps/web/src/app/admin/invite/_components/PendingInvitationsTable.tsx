import type { AdminPendingInvitation } from '@app/shared';

interface Props {
  items: AdminPendingInvitation[];
}

export default function PendingInvitationsTable({ items }: Props) {
  if (items.length === 0) {
    return <p style={{ color: '#64748b', fontSize: '0.875rem' }}>招待中のユーザーはいません。</p>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.875rem' }}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            {['メール', 'ロール', '招待者', '発行日時', '有効期限'].map((h) => (
              <th key={h} style={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td style={td}>{it.email}</td>
              <td style={td}>{it.role}</td>
              <td style={td}>{it.invitedByEmail ?? '-'}</td>
              <td style={td}>{new Date(it.createdAt).toLocaleString('ja-JP')}</td>
              <td style={td}>{new Date(it.expiresAt).toLocaleString('ja-JP')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  border: '1px solid #e2e8f0',
  textAlign: 'left',
  whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  border: '1px solid #e2e8f0',
  whiteSpace: 'nowrap',
};
