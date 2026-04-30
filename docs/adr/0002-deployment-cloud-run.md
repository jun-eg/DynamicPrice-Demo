# ADR-0002: デプロイ先 (Cloud Run + Cloud SQL)

- ステータス: 採用
- 日付: 2026-04-28

## コンテキスト

価格担当者向け内製ツールを社内試験運用としてデプロイする。
- 利用者は少人数(同時アクセス〜十数)
- 24/365 の高可用性は要件外
- バッチ処理・ファイル取り込み・公開APIは無し(`01-overview.md` 参照)
- ファイル取り込み機能なし → ストレージ層は当面不要

## 決定

### コンピュート

- **Cloud Run** に **2サービス** を配置:
  - `web` (Next.js)
  - `api` (NestJS)
- リージョン: **`asia-northeast1`(東京)**
- 最小インスタンス: `0`(コスト最小化、コールドスタート許容)
- 最大インスタンス: 当面 `2`(試験運用のため)

### データベース

- **Cloud SQL for PostgreSQL 15** を利用
- リージョン: **`asia-northeast1`(東京)**
- インスタンスサイズ: `db-f1-micro` または `db-g1-small`(試験運用なので最小から)
- 接続: **Cloud SQL Auth Proxy(Cloud Run のサイドカー)**
- 高可用性 (HA) 構成: **無効**(試験運用ではコスト最適化)

### ストレージ

- **Cloud Storage は当面採用しない**
- 必要になった時点で追加(エクスポート機能を入れる、ファイル取り込みUIを作る、等)

### スケジューラ・キュー

- **Cloud Scheduler / Pub/Sub / Cloud Run Jobs はいずれも採用しない**
- 係数の再推定は手動キック(管理画面 or 開発者が CLI 実行)で十分。試験運用での利用頻度は低い。
- 必要になった時点で追加

### ロギング

- **Cloud Logging** に標準出力を流すだけ
- アプリは構造化ログ(JSON)で出力する
- 監査用の業務ログは DB の `AuditLog` テーブルに残す(`03-data-model.md` 参照)。Cloud Logging はインフラ・例外用。

### シークレット管理

- **Secret Manager** で Google OAuth クライアントシークレット・DB接続情報・Auth.js シークレットを管理
- Cloud Run は IAM で Secret Manager を参照、環境変数経由でアプリに渡す

### CI/CD

- **GitHub Actions** で自動化する。詳細は ADR-0005 参照。
- 開発者ローカルからの `gcloud run deploy` は緊急時のフォールバックとして許可

## なぜこの選択か

### Cloud Run

- スケールゼロ(0インスタンスからのオートスケール)= コストが極小
- コンテナさえ作れれば動く = ベンダーロック弱め
- 試験運用に適した「動かしている時だけ課金」モデル
- HTTP リクエスト経路で認証・サイドカー・VPC コネクタなどが揃う

### web と api を分離する理由

- 役割が違う(SSR/認証 vs 計算/データ取得)
- スケール特性が違う可能性(api は計算重め)
- デプロイ・障害切り分けを独立させたい
- 将来、別のクライアントが api を使う可能性に備える

### Cloud SQL(マネージドPostgreSQL)

- 自前で Postgres を運用したくない(バックアップ・パッチ・接続管理)
- Cloud Run との接続が「Cloud SQL Auth Proxy + IAM」で完結する
- 試験運用は最小サイズ・HA 無しで月数千円規模

### asia-northeast1(東京)

- 利用者(社員)・既存PMS(国内設置想定)とのレイテンシ
- データ所在地が日本国内(個人情報を扱うため、説明責任で有利)

## 検討して見送ったもの

### App Engine

- スケールゼロは可能だが、Cloud Run の方が新しい・コンテナベースで柔軟・ベンダーロック弱い

### GKE

- 試験運用にはオーバー。クラスタ運用コストが見合わない

### Compute Engine + 自前構築

- 運用負荷が高い。マネージドにしない理由がない

### Firestore / Cloud Spanner

- リレーショナル要件(予約 ↔ 部屋タイプ ↔ プラン)が明確、SQL の集約クエリを多用する
- Postgres の方が向く

### 公開API → 認証なし

- IAP は当初検討したが、Google Workspace 共通ドメインがないため断念(ADR-0003)

### Cloud Storage (バックアップ用途)

- Cloud SQL の自動バックアップ機能で代用可能
- アプリのファイル取り扱いがないため、ストレージレイヤー自体がない方がシンプル

## コスト見積(目安)

試験運用想定:

- Cloud Run × 2: 利用時のみ課金、無料枠で収まる可能性大
- Cloud SQL `db-f1-micro` (HA 無し): 月 1,500〜3,000 円
- Cloud Logging: 標準利用なら無料枠
- Secret Manager: 数十円
- 合計: **月数千円程度**

## 影響

- 開発者は GCP プロジェクトへの IAM 権限が必要
- ローカル開発では Docker Compose で Postgres を立てる(`runbooks/local-development.md`)
- DB スキーマ変更は **Prisma migrate** を本番に手動適用する運用(試験運用のうちは)。CI に組み込むのは安定後

## 関連

- ADR-0001: 技術スタック
- ADR-0003: 認証方式
- ADR-0004: データ管理方針
- ADR-0005: CI/CD (GitHub Actions)
- `docs/runbooks/local-development.md`
