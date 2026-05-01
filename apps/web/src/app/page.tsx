// ホーム画面。middleware で認証必須化されているのでここに来た時点でログイン済み。
// Step 11 以降で推奨価格表示などを実装する。現状はログイン確認とサインアウトのみ。

import { auth, signOut } from '@/auth';

export default async function HomePage() {
  const session = await auth();

  // middleware で保護されているが、TS の絞り込み用に念のため確認する。
  if (!session?.user) {
    return <main>サインインが必要です。</main>;
  }

  return (
    <main style={{ padding: '2rem' }}>
      <h1>DynamicPrice Demo</h1>
      <p>
        ログイン中: <strong>{session.user.email}</strong> ({session.user.role})
      </p>
      <form
        action={async () => {
          'use server';
          await signOut({ redirectTo: '/signin' });
        }}
      >
        <button type="submit">ログアウト</button>
      </form>
    </main>
  );
}
