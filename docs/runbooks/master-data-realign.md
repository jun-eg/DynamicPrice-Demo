# Runbook: マスターデータ再投入 (roomCount / mealType の整合性回復)

CSV 取り込みロジック (`scripts/seed/csv-mapping.ts`) や Plan の自然キーを変更したあと、
本番 DB に既に入っている `reservations` / `plans` の値を新しい規則で揃え直したい場合の手順。

## このランブックを使う場面

- ADR-0009 (issue #59) で追加した `Reservation.roomCount` を CSV 由来の値で埋め直したい
  (migration の default 1 のままだと複数室予約が稼働率・係数で過小評価される)
- issue #51 の `mealType` 正規化を既存 `plans` に反映したい
  - `scripts/seed/reservations.ts` の `ensurePlan` は既存行の `mealType` を update しない仕様。
    したがって再 seed だけでは効かず、一度 `plans` を消して作り直す必要がある
- ADR-0010 (issue #55, #56) の Plan name UNIQUE 化のあと、生 CSV 文字列が混じった旧
  `mealType` を完全に捨てたい

将来 `csv-mapping` のロジックを変えたときも同じ手順で本番データを揃え直せる。

## 触るテーブル / 触らないテーブル

| 対象                                    | 操作         | 理由                                                                       |
| --------------------------------------- | ------------ | -------------------------------------------------------------------------- |
| `reservations`                          | DELETE       | CSV から再生成可能                                                         |
| `base_prices`                           | DELETE       | seed-master では空配列なので 0 件のはず。FK 整合性のため念のため触る       |
| `plans`                                 | DELETE       | 旧 `mealType` を捨てて再作成                                               |
| `room_types`                            | 変更しない   | seed-master が冪等に維持。Web から `inventoryCount` 編集される運用 (ADR-0009) |
| `users` / `invitations` / `audit_logs`  | 変更しない   | 認証情報・監査ログを保持                                                   |
| `price_coefficients`                    | 変更しない   | 手順 6 の再計算で別 `computedAt` のレコードが追加されるだけ (ADR-0007)     |

## 前提

- 元 CSV (`ReservationTotalList-*.CSV`) を `data/raw/` 直下に配置済み
- `gcloud auth login` で本番プロジェクトに認証済み
- ローカルから本番 Cloud SQL に届くネットワーク (cloud-sql-proxy で十分)

## 手順

### 1. Cloud SQL Auth Proxy 起動 + DATABASE_URL 設定

`deploy.yml` と同じ手順で proxy を起動し、Secret Manager から接続文字列を取得する。

```bash
# proxy バイナリ取得 (deploy.yml と同じバージョン)
curl -fsSL -o cloud-sql-proxy \
  https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.13.0/cloud-sql-proxy.linux.amd64
chmod +x cloud-sql-proxy

# 起動 (バックグラウンド)
./cloud-sql-proxy "<CLOUD_SQL_INSTANCE>" --port 5432 > proxy.log 2>&1 &
PROXY_PID=$!

# Secret Manager から migrate 用 DATABASE_URL を取得
export DATABASE_URL="$(gcloud secrets versions access latest --secret=database-url-migrate)"
```

`<CLOUD_SQL_INSTANCE>` は `<project>:<region>:<instance>` 形式。GitHub Secrets の
`CLOUD_SQL_INSTANCE` と同じ値 (`scripts/gcp-setup/setup.sh` step3 で出力される)。

### 2. 事前ダンプ (推奨)

```bash
pg_dump "$DATABASE_URL" \
  --table=reservations --table=plans --table=base_prices \
  --data-only --column-inserts \
  > backup-realign-$(date +%Y%m%d-%H%M%S).sql
```

ロールバック時にこのファイルを `psql` で流し戻す。

### 3. 既存データを wipe (1 トランザクション)

```bash
psql "$DATABASE_URL" <<'SQL'
BEGIN;
DELETE FROM reservations;
DELETE FROM base_prices;
DELETE FROM plans;
COMMIT;
SQL
```

順序: `reservations` / `base_prices` (どちらも `plans` を参照) → `plans`。
逆だと FK 違反で失敗する。`TRUNCATE ... CASCADE` でも可だが、上記の DELETE のほうが
意図が読みやすい。

### 4. CSV を 8 ファイル分再 seed

`db:seed-reservations` は CSV 1 ファイル単位で動く (`scripts/seed/reservations.ts`)。
`data/raw/` 配下の全 CSV をループで流す:

```bash
for f in data/raw/ReservationTotalList-*.CSV; do
  echo "=== $(basename "$f") ==="
  RAW_CSV_PATH="$f" npm run db:seed-reservations
done
```

各実行で `失敗行: 0` を確認すること。失敗が出たら CSV のヘッダー欠落 / 必須列の空白
などを疑い、`scripts/seed/csv-mapping.ts` の `pickRequired` 一覧と突き合わせる。

### 5. 件数・分布チェック

```sql
-- 全件数
SELECT COUNT(*) AS reservations_total FROM reservations;
SELECT COUNT(*) AS plans_total FROM plans;

-- roomCount > 1 が CSV から正しく入っているか (default 1 のままになっていないか)
SELECT COUNT(*) FILTER (WHERE "roomCount" > 1) AS multi_room
FROM reservations;

-- mealType が 4 値だけになっているか
SELECT "mealType", COUNT(*) FROM plans GROUP BY "mealType" ORDER BY COUNT(*) DESC;

-- 想定外の値が無いこと (出力 0 行)
SELECT COUNT(*) AS legacy_text
FROM plans
WHERE "mealType" IS NOT NULL
  AND "mealType" NOT IN ('一泊二食','朝食付き','素泊まり');

-- name 重複が無いこと (出力 0 行)
SELECT name, COUNT(*) FROM plans GROUP BY name HAVING COUNT(*) > 1;
```

期待値:

- `multi_room` > 0 (CSV に複数室予約が含まれていれば)
- `mealType` 分布が `'一泊二食'` / `'朝食付き'` / `'素泊まり'` / `NULL` のみ
- `legacy_text` = 0
- 重複 name = 0 行

### 6. 係数再計算 (ADMIN として Web からトリガー)

`reservations` を入れ直したので、過去の `price_coefficients` は古い集計に基づく。
ADR-0007 の係数推定を最新の予約データで再計算する:

- ADMIN ロールで Web (`/coefficients`) にログイン
- 「再計算」ボタンをクリック (内部で `POST /admin/coefficients/recompute`、ADR-0006 §認証)
- `audit_logs` に `COEFFICIENTS_RECOMPUTE` が記録され、`price_coefficients` に新しい
  `computedAt` のレコードが 24 行追加されることを確認

```sql
SELECT "computedAt", COUNT(*) FROM price_coefficients GROUP BY "computedAt" ORDER BY "computedAt" DESC LIMIT 3;
```

### 7. proxy 停止

```bash
kill "$PROXY_PID"
```

## ロールバック

事前ダンプ (手順 2) を流し戻す:

```bash
psql "$DATABASE_URL" <<'SQL'
BEGIN;
DELETE FROM reservations;
DELETE FROM base_prices;
DELETE FROM plans;
COMMIT;
SQL

psql "$DATABASE_URL" < backup-realign-YYYYMMDD-HHMMSS.sql
```

`reservations` の id は再投入で振り直されるため、外部から id を参照しているシステムは
ない前提。あった場合はダンプ後の sequence 値も合わせて戻す。

## 関連

- ADR-0007 係数推定
- ADR-0009 roomCount / inventoryCount
- ADR-0010 Plan 自然キー
- ADR-0011 架空マスタ撤去方針
- `docs/runbooks/local-development.md` §5 シード投入
- `scripts/seed/csv-mapping.ts` (`normalizeMealType` / `roomCount` 取り込みロジック)
- `scripts/seed/reservations.ts` (`ensurePlan` は既存行の `mealType` を update しない)
