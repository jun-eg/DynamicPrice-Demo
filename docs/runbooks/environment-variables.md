# Runbook: 環境変数一覧

`apps/web` `apps/api` `scripts/` が参照する環境変数の完全な一覧。

## 配置先の使い分け

| 配置先                            | 用途                                                    |
| --------------------------------- | ------------------------------------------------------- |
| ローカル `.env`(リポジトリ非含) | 開発者ローカル                                          |
| GCP Secret Manager                | 本番 Cloud Run の実行時シークレット(キー・接続情報)    |
| GitHub Secrets                    | GitHub Actions(ID 相当の値、デプロイ用)                 |

`.env` は `.gitignore` 済み。リポジトリには `.env.example` をコミット(値は空、コメントのみ)。

## web (Next.js, apps/web)

| 変数名                  | 必須 | ローカル例                              | 本番(Cloud Run)                | 用途                              |
| ----------------------- | ---- | --------------------------------------- | ------------------------------- | --------------------------------- |
| `AUTH_SECRET`           | yes  | `<openssl rand -base64 32>`              | Secret Manager                  | Auth.js JWT 署名鍵(api と同値) |
| `AUTH_URL`              | yes  | `http://localhost:3000`                  | `https://web-...run.app`         | Auth.js のコールバック URL        |
| `GOOGLE_CLIENT_ID`      | yes  | Cloud Console から                        | Secret Manager                  | Google OAuth                      |
| `GOOGLE_CLIENT_SECRET`  | yes  | Cloud Console から                        | Secret Manager                  | Google OAuth                      |
| `API_BASE_URL`          | yes  | `http://localhost:8080`                  | api の内部 URL                  | api 呼び出し先                    |
| `NODE_ENV`              | yes  | `development`                            | `production`                    | 標準                              |

## api (NestJS, apps/api)

| 変数名         | 必須     | ローカル例                                                                   | 本番(Cloud Run)  | 用途                              |
| -------------- | -------- | ---------------------------------------------------------------------------- | ----------------- | --------------------------------- |
| `DATABASE_URL` | yes      | `postgresql://devuser:devpass@localhost:55432/dynamic_price?schema=public`    | Secret Manager    | Prisma 接続                       |
| `AUTH_SECRET`  | yes      | (web と同値)                                                                 | Secret Manager    | JWT 署名検証                      |
| `PORT`         | no       | `8080`                                                                       | Cloud Run が設定  | リッスンポート                    |
| `NODE_ENV`     | yes      | `development`                                                                | `production`      | 標準                              |
| `CORS_ORIGIN`  | dev のみ | `http://localhost:3000`                                                      | (未設定)          | dev 時のみ CORS 許可              |

## scripts/(シード・係数再計算 等)

| 変数名               | 必須 | ローカル例                                                  | 用途                                  |
| -------------------- | ---- | ----------------------------------------------------------- | ------------------------------------- |
| `DATABASE_URL`       | yes  | (api と同値)                                                | DB 接続                               |
| `SEED_ADMIN_EMAIL`   | yes  | `your-email@example.com`                                    | 初期 ADMIN ユーザーのメアド           |
| `RAW_CSV_PATH`       | no   | `data/raw/ReservationTotalList.CSV`                          | シード入力 CSV のパス(デフォルト有り) |

## GitHub Actions(GitHub Repository Secrets)

| 変数名                  | 用途                                                            |
| ----------------------- | --------------------------------------------------------------- |
| `GCP_PROJECT_ID`        | デプロイ先 GCP プロジェクト ID                                  |
| `WIF_PROVIDER`          | Workload Identity Provider のリソース名                         |
| `WIF_SERVICE_ACCOUNT`   | GitHub Actions が impersonate する SA                            |
| `CLOUD_SQL_INSTANCE`    | `prisma migrate deploy` 用の Cloud SQL インスタンス接続名         |
| `SEED_ADMIN_EMAIL`      | デプロイ時 `db:seed-master` で作成する初期 ADMIN ユーザーのメール |

ADR-0005 参照。

## Secret Manager(GCP、本番ランタイム用)

Cloud Run のサービスから IAM 経由で参照する。

| Secret 名                      | 中身                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `auth-secret`                  | Auth.js 署名シークレット                                                      |
| `google-oauth-client-id`       | Google OAuth クライアント ID                                                  |
| `google-oauth-client-secret`   | Google OAuth クライアントシークレット                                         |
| `database-url`                 | 本番 Cloud SQL の接続文字列(Cloud Run の Unix socket 経由)                    |
| `database-url-migrate`         | GitHub Actions の `prisma migrate deploy` 用(Cloud SQL Auth Proxy TCP 経由)   |

## ローカル `.env.example`(コミット対象)

```bash
# DB(ローカル Docker)
DATABASE_URL="postgresql://devuser:devpass@localhost:55432/dynamic_price?schema=public"

# Auth.js(web/api 共通)
AUTH_SECRET=""
AUTH_URL="http://localhost:3000"

# Google OAuth
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# api 接続(web から見た)
API_BASE_URL="http://localhost:8080"

# api(dev のみ CORS 許可)
CORS_ORIGIN="http://localhost:3000"

# シード
SEED_ADMIN_EMAIL=""
```

## 関連

- ADR-0002: デプロイ・Secret Manager
- ADR-0005: GitHub Actions
- ADR-0006: API 契約(`AUTH_SECRET` を web/api で共有する根拠)
- `docs/runbooks/local-development.md`
