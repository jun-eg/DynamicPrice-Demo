# ADR-0001: モノレポ構成と技術スタック

- ステータス: 採用
- 日付: 2026-04-28

## コンテキスト

価格担当者向け内製ツール(社内試験運用)を新規開発する。
要件は `docs/architecture/01-overview.md` に記載のとおり、Webアプリ(管理画面 + API)で、Cloud Run へデプロイする。
試験運用が前提のため、過剰な設計は避けつつ、後で機能拡張できる余地を残す。

## 決定

### 言語

- **TypeScript(strict)**で統一する。フロント・バックエンド・共有ロジックすべて。

### モノレポ構成

- **npm workspaces** を採用する。

```
develop/
├── apps/
│   ├── web/         (Next.js)
│   └── api/         (NestJS)
├── packages/
│   ├── shared/      (型・定数・価格計算純粋関数)
│   └── db/          (Prisma スキーマ・migration・client)
└── (省略)
```

### フレームワーク

| レイヤー       | 採用                  |
| -------------- | --------------------- |
| フロントエンド | **Next.js (App Router)** |
| バックエンド   | **NestJS**            |
| ORM            | **Prisma**            |
| DB             | **PostgreSQL**        |

### Lint / Format

- **ESLint** — TypeScript 構文・コード品質ルール
- **Prettier** — フォーマット
- **設定はルートに1つ集約**(各 workspace で共有)
- **CI で必須チェック**(GitHub Actions、ADR-0005)
- **pre-commit フック(Husky + lint-staged)は採用しない**(MVP段階では不要、CIで担保)

### ビルド・タスク管理

- 当面は **npm script** だけで運用(`npm run build --workspaces` 等)。
- Turborepo 等のタスクランナー導入は、ビルド時間が問題になってから判断する(YAGNI)。

## なぜこの選択か

### TypeScript統一

- CLAUDE.md で「TypeScript strict 維持」「`npm run type-check && lint`」が明記されている
- フロントとバックで型を共有できる(`packages/shared` で予約データ・係数・推奨価格の型を1箇所定義)
- 価格計算ロジックは数式の積で完結し、ML が要らない MVP では Python を混ぜる動機がない
- ML が必要になったら、その時点で Python サービスを別Cloud Runとして追加すれば良い

### npm workspaces

- Node.js 同梱で **追加インストール不要**。corepack 等のセットアップ手順を増やさない
- packages 数が4つ程度の小規模モノレポでは npm の機能で必要十分
- 試験運用なので、ディスク効率や CI 速度の最適化(pnpm の content-addressable storage の利点)は当面不要
- 後で pnpm に移行することは可能(`package.json` の workspaces 定義は互換的)

### Next.js (App Router)

- 管理画面の SSR が容易、認証(Auth.js)と素直に統合できる
- API Routes も使えるが **本ツールでは API は別 Cloud Run サービスに分離**(後述)
- 旧 Pages Router ではなく App Router を選ぶ理由: Server Components で認証ガード・データ取得が素直

### NestJS

- **モジュール / コントローラ / サービス / ガード** という構造化された分割を最初から強制でき、コードの責務が明確になる
- DI コンテナ・バリデーションパイプ・例外フィルタなどが標準装備で、認証ガード(`@UseGuards`)や権限デコレータが書きやすい
- TypeScript ファースト設計、Auth.js から渡された JWT を検証する Guard を素直に書ける
- 価格モジュール / 認証モジュール / マスター管理モジュール のような業務単位での分割と相性が良い
- Phase 2 以降の機能追加(係数編集、在庫補正、PMS連携 等)を見据えると、構造の効く NestJS の方がスケールしやすい
- 内部のHTTPアダプタは Express(デフォルト)。性能要件が厳しくなれば Fastify アダプタに切り替え可能

### Web と API の分離(2サービス)

- Next.js の API Routes に全部のっけることもできるが、**役割が明確に違う**:
  - web: SSR・認証セッション・画面
  - api: 計算・データ取得 (将来は他クライアントも想定可能性)
- Cloud Run で別サービスにすればスケール・デプロイが独立、障害切り分けも明確
- 同一プロジェクト内なので内部VPC・IAM経由で通信する

### Prisma

- スキーマ定義の可読性、migration の生成、TypeScript 型生成が優秀
- Drizzle も候補だが、生のSQLに近い書き味は今回不要(モデルがシンプル)
- 学習コスト・コミュニティ・PostgreSQL 連携の安心感

### PostgreSQL

- 詳細は ADR-0002 で扱う。短く言えば **Cloud SQL のマネージド前提** だから。

## 検討して見送ったもの

### Python(FastAPI + SQLAlchemy)

- 利点: ML/データ分析エコシステムが圧倒的に強い
- 見送り理由: MVP に ML は入らない(`02-pricing-model.md` 参照)。係数推定も `decimal` 平均で十分。フロントとの言語統一を優先。

### Fastify(単独)

- 利点: 軽量・高速、TypeScript型サポートが優秀
- 見送り理由: NestJS でも内部アダプタとして Fastify を選択可能。認証ガード・モジュール分割の構造を最初から得たいので NestJS を上に乗せる方を採用。

### pnpm workspaces

- 利点: node_modules 軽量化、CI キャッシュとの相性
- 見送り理由: packages 数が少ない試験運用フェーズでは利点が小さく、corepack 経由のインストール手順を一段増やす理由がない。必要になれば後で移行可能。

### Turborepo / Nx

- 利点: ビルドキャッシュ・タスク並列化
- 見送り理由: 現状 packages 数は 2 つ。npm script で困っていない段階で導入する理由がない。

### tRPC / GraphQL

- 利点: 型安全な API 通信
- 見送り理由: Next.js (web) → NestJS (api) で REST + 共有型(`packages/shared`)で十分。クライアントが増えるなら再検討。

## 影響

- 開発者は TypeScript と PostgreSQL に習熟していることが前提
- npm 10.x 以上(Node.js 20.x 同梱版で OK)
- Prisma migration の運用ルールを `runbooks/` に書く必要がある(本番ではPRレビュー後に実行)

## 関連

- ADR-0002: デプロイ先 (Cloud Run + Cloud SQL)
- ADR-0003: 認証方式
- ADR-0004: データ管理方針
