# ADR-0005: CI/CD (GitHub Actions)

- ステータス: 採用
- 日付: 2026-04-28

## コンテキスト

- ブランチ戦略: `main`(本番)/ `develop`(開発統合)/ `feature/*`、`main`・`develop` への直接 push は禁止(PR 必須)
- デプロイ先: Cloud Run × 2(`web` / `api`)+ Cloud SQL(ADR-0002)
- 試験運用フェーズ: 段階的環境(staging/prod 分離)は持たず、`main` のみが本番に対応
- セキュリティ: サービスアカウントの JSON 鍵を GitHub Secrets に保管したくない
- DBマイグレーション: 本番に対して `prisma migrate deploy` を確実に流したい

## 決定

### ワークフロー構成(2本)

#### `.github/workflows/ci.yml` — PR 検証

- **トリガー**: `pull_request`(対象: `main`, `develop`)
- **ジョブ**:
  1. `npm ci`(キャッシュあり)
  2. `npm run lint --workspaces`(ESLint)
  3. `npm run format:check`(Prettier check)
  4. `npm run typecheck --workspaces`(`tsc --noEmit`)
  5. `npm run build --workspaces`(全パッケージのビルド検証)
  6. (将来)テスト実行
- **失敗時**: PR をマージ不可にする(GitHub の Required Checks)

#### `.github/workflows/deploy.yml` — 本番デプロイ

- **トリガー**: `push` to `main`(PR マージ後に発火)
- **ジョブ**:
  1. CI と同等の検証(lint / typecheck / build)
  2. **Workload Identity Federation で GCP 認証**
  3. `apps/web` `apps/api` の **Docker イメージをビルド**
  4. Artifact Registry(`asia-northeast1-docker.pkg.dev/<project>/dynamic-price/`)に push
  5. **Prisma migrate deploy 実行**(下記参照)
  6. Cloud Run の `web` `api` サービスを **新しいイメージで更新**
  7. ヘルスチェック確認(`/healthz` 等が 200 を返すこと)

### Workload Identity Federation(WIF)を採用

- GitHub Actions → GCP の認証は **WIF** を使う
- サービスアカウント JSON キーを GitHub Secrets に置かない
- 必要な GCP 設定(別途 runbook で詳細化):
  - Workload Identity Pool / Provider 作成
  - GitHub の `repository` と OIDC subject を信頼
  - Cloud Run / Artifact Registry / Cloud SQL Auth に最小権限のサービスアカウントを付与
  - ワークフローで `google-github-actions/auth@v2` を WIF モードで使用

### Prisma migrate deploy の取り扱い

- **GitHub Actions の Cloud Run デプロイ前ステップで実行**
- 接続は **Cloud SQL Auth Proxy(GitHub Actions runner 上で起動)** 経由
- 失敗時はデプロイを中断、Cloud Run のサービスは更新しない(古いイメージのまま稼働継続)
- 試験運用なので **migration の自動 rollback は持たない**(必要なら手動で reset)

### マスターデータ・初期 ADMIN の seed をデプロイ時に実行

- `npm run db:seed-master` を `prisma migrate deploy` の直後 (Cloud SQL Auth Proxy が立っている間) に実行する
- 投入対象: `RoomType` / `Plan` / `BasePrice` (アプリの動作に必須のリファレンスデータ) と初期 `ADMIN` ユーザー 1 件
- **冪等性**:
  - master データは unique key での upsert
  - admin は `update: {}` の upsert (既存ユーザーが居れば触らない)。理由: 運用で role/status を変えても毎デプロイで巻き戻されるのを防ぐため
- 必要な GitHub Secret: `SEED_ADMIN_EMAIL` (初期 ADMIN のメール)
- **なぜデプロイ時に流すか**:
  - 招待制 (ADR-0003) のため、招待を発行できる ADMIN が DB に居ないとログイン可能なユーザーが 0 になる
  - 初回デプロイ後に手動で SQL を叩く運用は再現性が低くミスを誘発する
  - master データ (RoomType 等) もアプリ動作に必須なので、コード変更とデータ整備を同じパイプラインで保証したい

### Cloud Run サービスの更新方法

- `gcloud run deploy <service> --image <ARTIFACT_URL>` で新リビジョンを作成、トラフィックを 100% 切り替え
- **Blue/Green / Canary は採用しない**(試験運用で過剰、利用者が少なく影響が限定的)
- ロールバック手段: 直前リビジョンに `--to-revisions <REV>=100` で戻す。手動で十分

### シークレット管理

- アプリの実行時シークレット(OAuth client、Auth.js secret、DB 接続)は **Secret Manager**(ADR-0002)
- GitHub Actions が必要とするのは:
  - `GCP_PROJECT_ID`
  - `WIF_PROVIDER`(Workload Identity Provider のリソース名)
  - `WIF_SERVICE_ACCOUNT`(Actions が impersonate するサービスアカウント)
  - `CLOUD_SQL_INSTANCE`(migrate 用)
- これらは **GitHub Repository Secrets** に保管(値そのものは秘ではない、IDに近い)

### 環境分離(将来検討)

- 試験運用中は **本番環境のみ**(main → 直接デプロイ)
- staging を分けるなら `develop` ブランチ → staging Cloud Run のワークフローを追加(別ADRで)

## なぜこの選択か

### GitHub Actions(Cloud Build や CircleCI ではなく)

- リポジトリが GitHub にある以上、追加サービスを増やさず GitHub Actions で完結するのが最小構成
- WIF サポートが手厚い
- 試験運用で十分な機能・無料枠

### Workload Identity Federation(JSON 鍵ではなく)

- JSON 鍵はローテーション・漏洩リスクが高い、保管責任が重い
- WIF は短命トークンを発行、鍵保管不要
- GCP/GitHub 公式の推奨パターン
- 設定一回分の手間で長期的に安全

### Artifact Registry(Docker Hub ではなく)

- GCP 内で完結、IAM 管理が一元化
- Cloud Run と同リージョン(`asia-northeast1`)で帯域コスト最小化
- 公開イメージ(Docker Hub)は不要(社内ツール)

### Migration を CI 内で実行(Cloud Run 起動時ではない)

- Cloud Run のサービス起動毎に migrate を流すのは **同時起動でデッドロックする可能性**
- CI 内なら 1 回だけ確実に実行され、失敗を可視化できる
- 試験運用での DB 変更頻度は低く、CI での実行で十分

### Blue/Green / Canary を採用しない

- Cloud Run は標準で「リビジョンごとのトラフィック割り当て」が使えるが、試験運用で利用者が少ない以上、即時 100% 切替で問題ない
- 必要になれば後付けで導入可能

## ワークフロー(疑似)

```yaml
# .github/workflows/deploy.yml(疑似コード)
on:
  push:
    branches: [main]

permissions:
  contents: read
  id-token: write   # WIF に必要

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run lint --workspaces
      - run: npm run typecheck --workspaces
      - run: npm run build --workspaces

      - id: auth
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.WIF_SERVICE_ACCOUNT }}

      - uses: google-github-actions/setup-gcloud@v2

      # Cloud SQL Auth Proxy 起動 → prisma migrate deploy
      - name: Run migrations
        run: |
          ./cloud-sql-proxy ${{ secrets.CLOUD_SQL_INSTANCE }} &
          npx prisma migrate deploy --schema packages/db/prisma/schema.prisma

      # web / api をそれぞれビルド・push・deploy
      - name: Build & deploy api
        run: |
          gcloud builds submit apps/api \
            --tag asia-northeast1-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/dynamic-price/api:$GITHUB_SHA
          gcloud run deploy api \
            --image asia-northeast1-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/dynamic-price/api:$GITHUB_SHA \
            --region asia-northeast1
      # web も同様
```

実コードは別途 `.github/workflows/` に作成。

## 影響

- リポジトリに `.github/workflows/ci.yml` `.github/workflows/deploy.yml` を追加する
- GCP 側に Workload Identity Pool / Provider / 専用サービスアカウントを作成する必要がある(初回 setup 手順は `runbooks/cicd-setup.md` に書く想定、別途作成)
- `main` への push を制限する Branch Protection を設定する
- Required Checks に `ci.yml` のジョブを設定する

## 検討して見送ったもの

### Cloud Build 単独

- 利点: GCP 完結、IAM 統合
- 見送り理由: PR 検証では GitHub Actions を使うため二重管理になる。GitHub Actions に集約

### サービスアカウント JSON キー方式

- 利点: WIF 設定不要、シンプル
- 見送り理由: 鍵保管・ローテーション責任が重い、GCP公式に WIF が推奨されている

### Migration を Cloud Run init で実行

- 利点: CI 設定が軽くなる
- 見送り理由: 同時起動時のデッドロック、失敗時の可視化が悪い

### staging 環境を分ける

- 利点: 安全な検証
- 見送り理由: 試験運用で利用者が限定的、コスト・運用負荷の方が大きい

## 関連

- ADR-0002: デプロイ(Cloud Run + Cloud SQL)
- ADR-0001: 技術スタック(ESLint / Prettier の CI 必須化)
- `docs/runbooks/cicd-setup.md`(別途作成、WIF 設定手順)
- `docs/runbooks/local-development.md`
