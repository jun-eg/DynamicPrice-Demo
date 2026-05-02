# Runbook: CI/CD 初期セットアップ

`.github/workflows/ci.yml` `.github/workflows/deploy.yml` を稼働させるために、
GCP 側と GitHub 側で一度だけ行う設定をまとめる。

根拠: ADR-0005 (cicd-github-actions) / ADR-0002 (deployment-cloud-run) /
`docs/runbooks/environment-variables.md`

## 0. 前提

- `gcloud` CLI がローカルにインストール済み・`gcloud auth login` 済み
- `docker` CLI がローカルにインストール済み（Step 7 のみ必要）
- `gh` CLI がインストール済み・`gh auth login` 済み（Step 8 のみ必要）
- リポジトリは GitHub 上に存在し、`main` への push 制限を `develop` 側へ流す Branch Protection を入れる予定
- Cloud Run と Cloud SQL は ADR-0002 で `asia-northeast1` を採用

### セットアップスクリプトの使い方

各ステップは `scripts/gcp-setup/setup.sh` でまとめて実行できる。

```bash
# 1. 変数ファイルを用意する
cp scripts/gcp-setup/.env.example scripts/gcp-setup/.env
# .env を開いて実値を入力する (.env は .gitignore 対象)

# 2. 全ステップを一括実行
./scripts/gcp-setup/setup.sh all

# または個別実行
./scripts/gcp-setup/setup.sh step1   # API 有効化のみ
./scripts/gcp-setup/setup.sh step4   # Secret Manager 投入のみ
```

シークレット値（DB パスワード・OAuth クレデンシャル・DB 接続文字列）は `gcp.env` に書かず、
スクリプト実行中に対話形式で入力を求める。

以降のセクションはスクリプトの内容を手順として記載したもの（手動実行・確認用）。

## 1. GCP プロジェクトの初期化

```bash
gcloud config set project "${PROJECT_ID}"

# 必要 API を有効化 (1 回だけ)
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  iamcredentials.googleapis.com \
  iam.googleapis.com \
  sts.googleapis.com
```

## 2. Artifact Registry リポジトリ作成

```bash
gcloud artifacts repositories create "${ARTIFACT_REPO}" \
  --repository-format=docker \
  --location="${REGION}" \
  --description="Cloud Run images for dynamic-price"
```

`asia-northeast1-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}/{api,web}` に push される。

## 3. Cloud SQL (PostgreSQL 15) 準備

ADR-0002 に従い `db-f1-micro`、HA 無し、`asia-northeast1` で作成。

```bash
gcloud sql instances create "${SQL_INSTANCE_NAME}" \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region="${REGION}" \
  --no-assign-ip                          # Cloud SQL Auth Proxy 専用にする

gcloud sql databases create dynamic_price --instance="${SQL_INSTANCE_NAME}"

# アプリ用 DB ユーザー (パスワードは控えておく)
gcloud sql users create app \
  --instance="${SQL_INSTANCE_NAME}" \
  --password="<生成した強パスワード>"
```

接続文字列の控え:

| 用途                         | 形式                                                                       |
| ---------------------------- | -------------------------------------------------------------------------- |
| Cloud Run ランタイム         | `postgresql://app:<pw>@/dynamic_price?host=/cloudsql/${SQL_INSTANCE_CONN}` |
| GitHub Actions migrate (TCP) | `postgresql://app:<pw>@127.0.0.1:5432/dynamic_price?schema=public`         |

## 4. Secret Manager にランタイム秘密を投入

`docs/runbooks/environment-variables.md` の Secret Manager 表通りに作成する。

```bash
# Auth.js 署名シークレット
echo -n "$(openssl rand -base64 32)" | \
  gcloud secrets create auth-secret --data-file=-

# Google OAuth (Cloud Console で取得した値を貼る)
printf '%s' '<CLIENT_ID>'     | gcloud secrets create google-oauth-client-id     --data-file=-
printf '%s' '<CLIENT_SECRET>' | gcloud secrets create google-oauth-client-secret --data-file=-

# DB 接続: Cloud Run ランタイム用 (Unix socket)
printf '%s' "postgresql://app:<pw>@/dynamic_price?host=/cloudsql/${SQL_INSTANCE_CONN}" \
  | gcloud secrets create database-url --data-file=-

# DB 接続: GitHub Actions migrate 用 (TCP via Cloud SQL Auth Proxy)
printf '%s' "postgresql://app:<pw>@127.0.0.1:5432/dynamic_price?schema=public" \
  | gcloud secrets create database-url-migrate --data-file=-
```

## 5. デプロイ用サービスアカウントを作成

GitHub Actions が impersonate する SA。最小権限を心がける。

```bash
gcloud iam service-accounts create "${DEPLOYER_SA}" \
  --display-name="GitHub Actions deployer for dynamic-price"

DEPLOYER_EMAIL="${DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

# Cloud Run へのデプロイ
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${DEPLOYER_EMAIL}" \
  --role="roles/run.admin"

# Cloud Run service が使う runtime SA を deployer がセットできるようにする
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${DEPLOYER_EMAIL}" \
  --role="roles/iam.serviceAccountUser"

# Artifact Registry に push
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${DEPLOYER_EMAIL}" \
  --role="roles/artifactregistry.writer"

# Cloud SQL Auth Proxy で接続して migrate
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${DEPLOYER_EMAIL}" \
  --role="roles/cloudsql.client"

# migrate 時に Secret Manager から DATABASE_URL を取得
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${DEPLOYER_EMAIL}" \
  --role="roles/secretmanager.secretAccessor"
```

## 6. Workload Identity Federation を構成

GitHub Actions の OIDC トークンと SA を結びつける。SA キー JSON は **作成しない**。

```bash
# 6-1. プールを作成
gcloud iam workload-identity-pools create "${WIF_POOL}" \
  --location=global \
  --display-name="GitHub Actions pool"

POOL_ID="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}"

# 6-2. GitHub OIDC プロバイダを登録
# attribute-condition で対象リポジトリのみに制限する (なりすまし防止)
gcloud iam workload-identity-pools providers create-oidc "${WIF_PROVIDER}" \
  --location=global \
  --workload-identity-pool="${WIF_POOL}" \
  --display-name="GitHub OIDC" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository == '${GITHUB_OWNER}/${GITHUB_REPO}'"

# 6-3. SA を impersonate できるバインディング
# main ブランチからのワークフロー実行のみを許可するなら attribute.ref で絞る
gcloud iam service-accounts add-iam-policy-binding "${DEPLOYER_EMAIL}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${POOL_ID}/attribute.repository/${GITHUB_OWNER}/${GITHUB_REPO}"
```

GitHub Actions に渡す Provider のフルリソース名:

```
projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/providers/${WIF_PROVIDER}
```

## 7. Cloud Run サービスの初回作成

**手動作業は不要。** `deploy.yml` の Cloud Run deploy ステップに
`--add-cloudsql-instances` / `--set-secrets` / `--set-env-vars` が含まれているため、
`main` への初回マージ時に GitHub Actions がサービスの新規作成まで自動で行う。

Step 8 (GitHub Secrets 登録) を済ませて、`main` への最初の PR をマージすれば CI/CD が起動する。

## 8. GitHub Repository Secrets を登録

`docs/runbooks/environment-variables.md` の "GitHub Actions" 表通りに、
GitHub の Settings → Secrets and variables → Actions で登録する。

| Secret                | 値                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `GCP_PROJECT_ID`      | `${PROJECT_ID}`                                                                                           |
| `WIF_PROVIDER`        | `projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/providers/${WIF_PROVIDER}` |
| `WIF_SERVICE_ACCOUNT` | `${DEPLOYER_EMAIL}`                                                                                       |
| `CLOUD_SQL_INSTANCE`  | `${SQL_INSTANCE_CONN}` (例: `dynamic-price-demo:asia-northeast1:dynamic-price-db`)                        |

これらは ID 相当(漏れても直接の被害は限定的)だが、慣例として Secrets に格納する。

## 9. Branch Protection と Required Checks

GitHub の Settings → Branches → `main` の保護ルール:

- "Require a pull request before merging" を有効
- "Require status checks to pass before merging" を有効化し、`CI / verify` を必須にする
- "Do not allow bypassing the above settings" を有効
- `develop` にも同じルールを適用する

## 10. 動作確認

1. 適当な PR を `develop` 向けに作る → `ci.yml` が起動し全 step がグリーンになる
2. PR を `main` にマージ → `deploy.yml` が起動し、最終的に api/web の `/healthz`・`/` が 200 を返す
3. 失敗時は `cat proxy.log` などのログを Actions の run logs から確認

## トラブルシュート

| 症状                                                 | 確認                                                                               |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `auth.failed: ... no matching attribute condition`   | `attribute-condition` の repository 名が正しいか                                   |
| `prisma migrate deploy: P1001 Can't reach database`  | Cloud SQL Auth Proxy が listen しているか (workflow の `proxy.log`)                |
| `denied: permission denied` (docker push)            | deployer SA に `roles/artifactregistry.writer` が付いているか                      |
| Cloud Run deploy 後に 500、`/healthz` が `db: error` | Cloud Run service に `--add-cloudsql-instances` が紐付いているか / Secret は最新か |

## 関連

- ADR-0002: デプロイ(Cloud Run + Cloud SQL)
- ADR-0005: CI/CD(GitHub Actions)
- `docs/runbooks/environment-variables.md`
- `docs/runbooks/local-development.md`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
