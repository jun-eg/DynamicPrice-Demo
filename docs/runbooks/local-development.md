# Runbook: ローカル開発環境セットアップ

このプロジェクトをローカルで動かす手順。試験運用フェーズの簡易構成を前提とする。

## 前提

- Node.js 20.x 以上(npm 10.x 同梱)
- Docker / Docker Compose
- 元CSV(`ReservationTotalList.CSV`)を入手済み
- Google Cloud Console で OAuth クライアントID(Web)を作成済み

## 1. リポジトリ取得・依存インストール

```bash
git clone <repo-url>
cd develop
npm install
```

## 2. 環境変数の設定

ルートに `.env` を作成(`.env.example` をコピー、※ `.env.example` は別途作成予定):

```bash
# DB(ローカル Docker)
DATABASE_URL="postgresql://devuser:devpass@localhost:5432/dynamic_price?schema=public"

# Auth.js
AUTH_SECRET="<openssl rand -base64 32 で生成>"
AUTH_URL="http://localhost:3000"

# Google OAuth(Cloud Console で取得)
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# シード時に投入する初期 ADMIN メアド
SEED_ADMIN_EMAIL="your-email@example.com"
```

`.env` は **絶対にコミットしない**(`.gitignore` 済み)。

## 3. ローカル DB 起動

`docker-compose.yml`(`infra/` または `packages/db/` に配置予定):

```yaml
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: devuser
      POSTGRES_PASSWORD: devpass
      POSTGRES_DB: dynamic_price
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

起動:

```bash
docker compose up -d
```

## 4. Prisma マイグレーション

```bash
npm run migrate:dev --workspace @app/db
# = npx prisma migrate dev (内部)
```

スキーマ変更時は `npm run migrate:dev --workspace @app/db -- --name <変更名>`。

## 5. シード投入

### 5-1. マスター(RoomType / Plan / BasePrice / ADMIN ユーザー)

```bash
npm run db:seed-master
```

- `BasePrice` の初期値はスクリプト内ハードコード(担当者ヒアリングで決めた値)
- `SEED_ADMIN_EMAIL` で指定したメアドを `ADMIN` ロールで作成

### 5-2. 元CSV(予約履歴)

```bash
# data/raw/ReservationTotalList.CSV を配置済みであることを前提
npm run db:seed-reservations
```

このスクリプトが行うこと:

- Shift-JIS → UTF-8 変換
- PII カラム除外(`docs/adr/0004-data-management.md` 参照)
- `RoomType` `Plan` を正規化(無ければ追加)
- `Reservation` に投入(冪等)

### 5-3. サンプルデータ生成(任意)

```bash
npm run db:make-sample
# data/sample.csv を出力(匿名化済み)
```

## 6. アプリ起動

```bash
# 別ターミナルで2つ起動
npm run dev --workspace @app/api    # NestJS(:8080)
npm run dev --workspace @app/web    # Next.js(:3000)
```

ブラウザで `http://localhost:3000` を開く。Google でログイン、`SEED_ADMIN_EMAIL` で入る。

## 7. Lint / Format / 型チェック

CI(GitHub Actions)が落ちる前にローカルで確認する:

```bash
npm run lint --workspaces           # ESLint(警告含めゼロ目標)
npm run format:check                # Prettier 差分チェック
npm run format                      # Prettier 自動フォーマット
npm run typecheck --workspaces      # tsc --noEmit
npm run build --workspaces          # ビルド検証
```

CLAUDE.md の方針:
- フロントエンドの変更後は `npm run typecheck && npm run lint`
- バックエンドの変更後は `npm run build`

## 8. 係数の再計算(手動)

過去予約データから係数を推定する処理(MVP では手動キック):

```bash
npm run coef:recompute
```

`PriceCoefficient` テーブルに新しい `computedAt` のレコードを追加。
画面側は最新 `computedAt` のレコードを参照する。

## 9. よくある操作

### マイグレーションをやり直したい(開発時)

```bash
docker compose down -v   # ボリュームごと削除
docker compose up -d
npm run migrate:dev --workspace @app/db
npm run db:seed-master
npm run db:seed-reservations
```

### 招待を発行したい

- ログイン後、`/admin/invite` 画面でメアドとロールを入力
- 受信側に通知メールは送らない(MVP) → 招待者が口頭・チャットで「これでログインできます」と伝える運用
- 通知メールは Phase 2

### ユーザーを無効化したい

- `/admin/users` 画面で対象ユーザーの「無効化」を押す

### ログを見たい

```bash
# アプリのstdoutを直接見る、または:
docker compose logs -f postgres   # DB側
```

## 10. 本番(Cloud Run)へのデプロイ

→ **GitHub Actions が自動で行う**(ADR-0005)。

開発フロー:

1. `feature/*` ブランチで開発
2. PR を `develop` または `main` に向けて作成 → CI(`ci.yml`)が lint / typecheck / build を検証
3. レビュー後、`main` へマージ → `deploy.yml` が起動
4. CI 上で Prisma migrate deploy → コンテナビルド → Cloud Run 更新

緊急時のフォールバック(GitHub Actions が動かない等):

```bash
# Workload Identity の代わりに gcloud auth login で認証
gcloud auth login
gcloud config set project <project-id>

# Cloud SQL Proxy 起動 → migrate
./cloud-sql-proxy <instance-connection-name> &
npx prisma migrate deploy --schema packages/db/prisma/schema.prisma

# api / web をそれぞれ build & deploy
gcloud run deploy api --source apps/api --region asia-northeast1
gcloud run deploy web --source apps/web --region asia-northeast1
```

WIF / Service Account の初期設定手順は `docs/runbooks/cicd-setup.md`(別途作成)。

## トラブルシュート

| 症状                                    | 確認                                                                |
| --------------------------------------- | ------------------------------------------------------------------- |
| `npm install` が遅い                    | レジストリ・ネットワーク、`npm cache clean --force` を試す          |
| DB に繋がらない                         | `docker compose ps`、`DATABASE_URL` のホスト・ポート                |
| Google ログインで `redirect_uri_mismatch` | Cloud Console の「承認済みリダイレクトURI」に `http://localhost:3000/api/auth/callback/google` を追加 |
| ログインしたが「招待されていません」    | `User` に `SEED_ADMIN_EMAIL` のレコードがあるか確認、`status=ACTIVE` か |
| 文字化け(シード)                      | `iconv -f CP932 -t UTF-8` で読めるか試す                            |

## 関連

- `docs/architecture/01-overview.md`
- `docs/adr/0001-monorepo-and-stack.md`
- `docs/adr/0002-deployment-cloud-run.md`
- `docs/adr/0003-auth-google-signin-invite.md`
- `docs/adr/0004-data-management.md`
- `docs/adr/0005-cicd-github-actions.md`
