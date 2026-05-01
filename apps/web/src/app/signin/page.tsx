// サインインページ。Google でログインボタンと、拒否理由のメッセージ表示。
// 拒否理由は signIn callback が `/signin?error=<reason>` でリダイレクトするのを受ける。

import { signIn } from '@/auth';

const REJECTION_MESSAGE: Record<string, string> = {
  NotInvited: '招待されていません。管理者にご連絡ください。',
  Disabled: 'このアカウントは無効化されています。管理者にご連絡ください。',
  EmailUnverified: 'Google アカウントのメール認証が完了していません。',
};

interface SignInPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { error } = await searchParams;
  const message = error ? (REJECTION_MESSAGE[error] ?? 'ログインに失敗しました。') : null;

  return (
    <main style={{ padding: '2rem', maxWidth: 480, margin: '0 auto' }}>
      <h1>DynamicPrice Demo</h1>
      <p>Google アカウントでログインしてください。</p>
      {message ? (
        <p role="alert" style={{ color: '#b00020', marginTop: '1rem' }}>
          {message}
        </p>
      ) : null}
      <form
        action={async () => {
          'use server';
          await signIn('google', { redirectTo: '/' });
        }}
        style={{ marginTop: '1.5rem' }}
      >
        <button type="submit">Google でログイン</button>
      </form>
    </main>
  );
}
