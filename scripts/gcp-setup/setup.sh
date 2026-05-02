#!/usr/bin/env bash
# GCP 初回セットアップスクリプト
# 使い方: ./setup.sh [step1|step2|step3|step4|step5|step6|step7|step8|all]
# 根拠: docs/runbooks/cicd-setup.md
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Error: ${ENV_FILE} が見つかりません。"
  echo "  cp scripts/gcp-setup/.env.example scripts/gcp-setup/.env"
  echo "  を実行して実値を入力してください。"
  exit 1
fi

# shellcheck source=./gcp.env.example
source "${ENV_FILE}"

# 派生変数
SQL_INSTANCE_CONN="${PROJECT_ID}:${REGION}:${SQL_INSTANCE_NAME}"
DEPLOYER_EMAIL="${DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
POOL_ID="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}"

# --------------------------------------------------------------------------- #

step1_init() {
  echo "==> Step 1: GCP プロジェクト初期化・API 有効化"
  gcloud config set project "${PROJECT_ID}"
  gcloud services enable \
    run.googleapis.com \
    sqladmin.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    secretmanager.googleapis.com \
    iamcredentials.googleapis.com \
    iam.googleapis.com \
    sts.googleapis.com
  echo "Done: API 有効化完了"
}

step2_artifact() {
  echo "==> Step 2: Artifact Registry 作成"
  gcloud artifacts repositories create "${ARTIFACT_REPO}" \
    --repository-format=docker \
    --location="${REGION}" \
    --description="Cloud Run images for dynamic-price" \
    || echo "既に存在するためスキップ"
  echo "Done: ${REGISTRY}/{api,web} に push 可能"
}

step3_cloudsql() {
  echo "==> Step 3: Cloud SQL (PostgreSQL 15) 作成"
  gcloud sql instances create "${SQL_INSTANCE_NAME}" \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region="${REGION}" \
    --no-assign-ip \
    || echo "既に存在するためスキップ"

  gcloud sql databases create dynamic_price \
    --instance="${SQL_INSTANCE_NAME}" \
    || echo "既に存在するためスキップ"

  echo ""
  echo "アプリ用 DB ユーザーのパスワードを入力してください (非表示):"
  read -r -s DB_PASSWORD
  gcloud sql users create app \
    --instance="${SQL_INSTANCE_NAME}" \
    --password="${DB_PASSWORD}" \
    || echo "既に存在するためスキップ"

  echo ""
  echo "DB 接続文字列 (控えておく):"
  echo "  Cloud Run 用 : postgresql://app:<pw>@/dynamic_price?host=/cloudsql/${SQL_INSTANCE_CONN}"
  echo "  migrate 用   : postgresql://app:<pw>@127.0.0.1:5432/dynamic_price?schema=public"
}

step4_secrets() {
  echo "==> Step 4: Secret Manager にシークレットを投入"

  echo "Auth.js シークレットを自動生成して登録します..."
  echo -n "$(openssl rand -base64 32)" | \
    gcloud secrets create auth-secret --data-file=- \
    || echo "auth-secret は既に存在するためスキップ"

  echo ""
  echo "Google OAuth クライアント ID を入力してください:"
  read -r GOOGLE_CLIENT_ID
  printf '%s' "${GOOGLE_CLIENT_ID}" | \
    gcloud secrets create google-oauth-client-id --data-file=- \
    || echo "既に存在するためスキップ"

  echo "Google OAuth クライアントシークレットを入力してください (非表示):"
  read -r -s GOOGLE_CLIENT_SECRET
  printf '%s' "${GOOGLE_CLIENT_SECRET}" | \
    gcloud secrets create google-oauth-client-secret --data-file=- \
    || echo "既に存在するためスキップ"

  echo ""
  echo "Cloud Run 用 DATABASE_URL を入力してください (非表示):"
  echo "  例: postgresql://app:<pw>@/dynamic_price?host=/cloudsql/${SQL_INSTANCE_CONN}"
  read -r -s DATABASE_URL
  printf '%s' "${DATABASE_URL}" | \
    gcloud secrets create database-url --data-file=- \
    || echo "既に存在するためスキップ"

  echo "GitHub Actions migrate 用 DATABASE_URL を入力してください (非表示):"
  echo "  例: postgresql://app:<pw>@127.0.0.1:5432/dynamic_price?schema=public"
  read -r -s DATABASE_URL_MIGRATE
  printf '%s' "${DATABASE_URL_MIGRATE}" | \
    gcloud secrets create database-url-migrate --data-file=- \
    || echo "既に存在するためスキップ"

  echo "Done: シークレット登録完了"
}

step5_sa() {
  echo "==> Step 5: デプロイ用サービスアカウント作成・IAM 権限付与"
  gcloud iam service-accounts create "${DEPLOYER_SA}" \
    --display-name="GitHub Actions deployer for dynamic-price" \
    || echo "既に存在するためスキップ"

  for role in \
    roles/run.admin \
    roles/iam.serviceAccountUser \
    roles/artifactregistry.writer \
    roles/cloudsql.client \
    roles/secretmanager.secretAccessor; do
    gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
      --member="serviceAccount:${DEPLOYER_EMAIL}" \
      --role="${role}" \
      --condition=None \
      > /dev/null
    echo "  Bound: ${role}"
  done
  echo "Done: ${DEPLOYER_EMAIL}"
}

step6_wif() {
  echo "==> Step 6: Workload Identity Federation 設定"

  gcloud iam workload-identity-pools create "${WIF_POOL}" \
    --location=global \
    --display-name="GitHub Actions pool" \
    || echo "既に存在するためスキップ"

  gcloud iam workload-identity-pools providers create-oidc "${WIF_PROVIDER}" \
    --location=global \
    --workload-identity-pool="${WIF_POOL}" \
    --display-name="GitHub OIDC" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository == '${GITHUB_OWNER}/${GITHUB_REPO}'" \
    || echo "既に存在するためスキップ"

  gcloud iam service-accounts add-iam-policy-binding "${DEPLOYER_EMAIL}" \
    --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/${POOL_ID}/attribute.repository/${GITHUB_OWNER}/${GITHUB_REPO}"

  echo ""
  echo "GitHub Secrets に登録する WIF_PROVIDER:"
  echo "  projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/providers/${WIF_PROVIDER}"
  echo "Done"
}

step7_cloudrun() {
  echo "==> Step 7: Cloud Run サービスの初回作成は deploy.yml (CI/CD) が担当"
  echo ""
  echo "  deploy.yml の Cloud Run deploy ステップに --add-cloudsql-instances /"
  echo "  --set-secrets / --set-env-vars が含まれているため、main への初回マージで"
  echo "  サービスの新規作成まで自動で行われる。"
  echo ""
  echo "  このステップで行うことは何もない。"
  echo "  Step 8 (GitHub Secrets 登録) を済ませて main に push すれば CI/CD が動く。"
}

step8_github_secrets() {
  echo "==> Step 8: GitHub Repository Secrets を gh CLI で登録"

  if ! command -v gh &> /dev/null; then
    echo "gh CLI が見つかりません。手動で登録してください:"
    echo "  GCP_PROJECT_ID      : ${PROJECT_ID}"
    echo "  WIF_PROVIDER        : projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/providers/${WIF_PROVIDER}"
    echo "  WIF_SERVICE_ACCOUNT : ${DEPLOYER_EMAIL}"
    echo "  CLOUD_SQL_INSTANCE  : ${SQL_INSTANCE_CONN}"
    return
  fi

  gh secret set GCP_PROJECT_ID      --body "${PROJECT_ID}"
  gh secret set WIF_PROVIDER        --body "projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/providers/${WIF_PROVIDER}"
  gh secret set WIF_SERVICE_ACCOUNT --body "${DEPLOYER_EMAIL}"
  gh secret set CLOUD_SQL_INSTANCE  --body "${SQL_INSTANCE_CONN}"

  echo "Done: GitHub Secrets 登録完了"
}

# --------------------------------------------------------------------------- #

usage() {
  echo "使い方: $0 [step1|step2|step3|step4|step5|step6|step7|step8|all]"
  echo ""
  echo "  step1  GCP API 有効化"
  echo "  step2  Artifact Registry 作成"
  echo "  step3  Cloud SQL 作成"
  echo "  step4  Secret Manager にシークレット投入"
  echo "  step5  デプロイ用 SA 作成・IAM 権限付与"
  echo "  step6  Workload Identity Federation 設定"
  echo "  step7  bootstrap イメージビルド・Cloud Run 初回作成"
  echo "  step8  GitHub Repository Secrets 登録"
  echo "  all    step1〜step8 を順番に実行"
}

main() {
  local step="${1:-all}"
  case "${step}" in
    step1) step1_init ;;
    step2) step2_artifact ;;
    step3) step3_cloudsql ;;
    step4) step4_secrets ;;
    step5) step5_sa ;;
    step6) step6_wif ;;
    step7) step7_cloudrun ;;
    step8) step8_github_secrets ;;
    all)
      step1_init
      step2_artifact
      step3_cloudsql
      step4_secrets
      step5_sa
      step6_wif
      step7_cloudrun
      step8_github_secrets
      ;;
    *) usage; exit 1 ;;
  esac
}

main "$@"
