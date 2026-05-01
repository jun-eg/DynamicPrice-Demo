// ルートレイアウト。MVP では装飾なしの最小実装。
// Step 11 以降で UI 設計を入れる前提。

import type { ReactNode } from 'react';

export const metadata = {
  title: 'DynamicPrice Demo',
  description: '旅館向け動的価格決定支援ツール (試験運用)',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
