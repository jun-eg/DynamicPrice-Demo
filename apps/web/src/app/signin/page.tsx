// サインインページ。Google でログインボタンと、拒否理由のメッセージ表示。
// 拒否理由は signIn callback が `/signin?error=<reason>` でリダイレクトするのを受ける。
// `?from=<path>` が付いている場合はログイン後にそのパスへ戻す (issue #44)。

import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { signIn } from '@/auth';

const REJECTION_MESSAGE: Record<string, string> = {
  NotInvited: '招待されていません。管理者にご連絡ください。',
  Disabled: 'このアカウントは無効化されています。管理者にご連絡ください。',
  EmailUnverified: 'Google アカウントのメール認証が完了していません。',
};

interface SignInPageProps {
  searchParams: Promise<{ error?: string; from?: string }>;
}

// オープンリダイレクト対策: 同一オリジン内の絶対パスのみ許可する。
function sanitizeFrom(from: string | undefined): string {
  if (!from) return '/';
  if (!from.startsWith('/')) return '/';
  if (from.startsWith('//') || from.startsWith('/\\')) return '/';
  return from;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await auth();
  const { error, from } = await searchParams;
  const safeFrom = sanitizeFrom(from);

  if (session?.user) redirect(safeFrom);

  const message = error ? (REJECTION_MESSAGE[error] ?? 'ログインに失敗しました。') : null;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: '#1e293b', height: '48px', display: 'flex', alignItems: 'center', padding: '0 1.5rem' }}>
        <span style={{ color: '#f1f5f9', fontWeight: 'bold', fontSize: '0.95rem' }}>DynamicPrice</span>
      </header>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          background: '#fff',
          borderRadius: '0.5rem',
          border: '1px solid #e2e8f0',
          padding: '2.5rem 2rem',
          width: '100%',
          maxWidth: '360px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
            DynamicPrice Demo
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.5rem' }}>
            Google アカウントでログインしてください。
          </p>
          {message ? (
            <p role="alert" style={{
              color: '#b00020',
              fontSize: '0.875rem',
              background: '#fff5f5',
              border: '1px solid #fecaca',
              borderRadius: '0.375rem',
              padding: '0.625rem 0.75rem',
              marginBottom: '1.25rem',
            }}>
              {message}
            </p>
          ) : null}
          <form
            action={async () => {
              'use server';
              await signIn('google', { redirectTo: safeFrom });
            }}
          >
            <button
              type="submit"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.625rem 1rem',
                background: '#1e293b',
                color: '#f1f5f9',
                border: 'none',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Google でログイン
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
