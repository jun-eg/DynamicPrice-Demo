'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { inviteUser, type InviteState } from '../actions';

const initialState: InviteState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        padding: '0.5rem 1.5rem',
        background: '#1e293b',
        color: '#fff',
        border: 'none',
        borderRadius: '0.25rem',
        cursor: pending ? 'not-allowed' : 'pointer',
        opacity: pending ? 0.6 : 1,
      }}
    >
      {pending ? '送信中...' : '招待を発行'}
    </button>
  );
}

export default function InviteForm() {
  const [state, action] = useActionState(inviteUser, initialState);

  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 400 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
        メールアドレス
        <input
          type="email"
          name="email"
          required
          placeholder="user@example.com"
          style={{ padding: '0.4rem 0.6rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
        ロール
        <select
          name="role"
          required
          style={{ padding: '0.4rem 0.6rem', border: '1px solid #cbd5e1', borderRadius: '0.25rem' }}
        >
          <option value="MEMBER">MEMBER</option>
          <option value="ADMIN">ADMIN</option>
        </select>
      </label>
      <SubmitButton />
      {state.status === 'error' && (
        <p role="alert" style={{ color: '#b00020', margin: 0, fontSize: '0.875rem' }}>
          {state.message}
        </p>
      )}
      {state.status === 'success' && (
        <div
          style={{
            background: '#dcfce7',
            border: '1px solid #86efac',
            borderRadius: '0.25rem',
            padding: '0.75rem',
            fontSize: '0.875rem',
          }}
        >
          <p style={{ margin: 0, fontWeight: 'bold' }}>招待を発行しました</p>
          <p style={{ margin: '0.25rem 0 0' }}>メール: {state.data.email}</p>
          <p style={{ margin: '0.25rem 0 0' }}>ロール: {state.data.role}</p>
          <p style={{ margin: '0.25rem 0 0' }}>
            有効期限: {new Date(state.data.expiresAt).toLocaleString('ja-JP')}
          </p>
        </div>
      )}
    </form>
  );
}
