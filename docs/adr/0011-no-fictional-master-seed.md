# ADR-0011: 架空マスタを seed しない方針

- ステータス: 採用
- 日付: 2026-05-03

## コンテキスト

ADR-0004 §「シード処理の中身」/ ADR-0005 §「マスターデータ・初期 ADMIN の seed をデプロイ時に実行」では、`db:seed-master` が `RoomType` / `Plan` / `BasePrice` の初期値をハードコードで投入する前提で書かれていた。

`scripts/seed/master-data.ts` には実 CSV に存在しないサンプル値が入っていた:

- `RoomType`: `STD` / `DLX` / `SUI` (架空)
- `Plan`: `STAY_RO` / `STAY_BB` / `STAY_HB` (架空)
- `BasePrice`: 上記の組合せ 9 件 (ハードコード)

しかし実 CSV (6,853 行) のデータと突き合わせたところ、いずれの架空 code も実 CSV には登場せず、参照されない孤立レコードになっていた。架空マスタが残っていると以下の弊害がある:

- ADMIN 画面 (`/admin/room-types` 等) に実データに対応しない行が出て混乱する
- `master.ts` 再実行で巻き戻されるリスク (元の `update: { ... }` 挙動)
- 「seed と実データの 2 系統」が共存し、運用上どちらが正かが曖昧

## 決定

PR #53 / 本 PR で `master-data.ts` を以下の構成に変更する:

| 配列         | 中身                                                 |
| ------------ | ---------------------------------------------------- |
| `ROOM_TYPES` | 実 CSV 由来の 6 件のみ (Asakusa / Den / Fusuma / Fusuma(DInner) / Gratte-ciel / Sugi) |
| `PLANS`      | **空配列**。実 Plan は CSV 取込時に `ensurePlan` で仮投入される |
| `BASE_PRICES`| **空配列**。実 RoomType × 実 Plan の組合せで別途整備する     |

これにより `db:seed-master` が投入する「アプリ動作に必須のリファレンスデータ」は **`RoomType` と初期 ADMIN ユーザーのみ** になる。

ADR-0004 / ADR-0005 の記述は「当時の判断記録」として残し、本 ADR で上書きする。

## なぜこの選択か

### 架空マスタを seed しない理由

- **実データとの一致が運用の正**: 推奨価格・係数推定は実 CSV を入力にする。架空マスタは検証・分析のどちらにも貢献しない
- **重複を生まない**: 架空 `RoomType` が DB に残っていると、実 CSV 由来の `RoomType` と並んでしまい統計画面で意味のない 0 件行が出る
- **基準価格は実マスタで決まる**: BasePrice は `RoomType × Plan` の実組合せで担当者ヒアリングを経て決める性質。試作段階の暫定値を seed に入れる意味は薄い

### `Plan` を空配列にする理由

- 実 CSV の Plan 名は 26 種類 (issue #55 / ADR-0010 で `name` 自然キー化済み)
- どれを seed に固定値で持つかは恣意的になる。CSV 取込時の `ensurePlan` で全部入る
- `mealType` の正規化は `csv-mapping.ts` の `normalizeMealType()` (issue #51) で一元化されているため、seed 側で重複させない

### `BasePrice` を空配列にする理由

- 実 RoomType (6 件) × 実 Plan (26 件) の組合せに対する基準価格はまだ決まっていない
- 推奨価格 (`/recommendations`) は BasePrice なしでは出ないが、これは試作段階の制約として明示する
- 担当者ヒアリングで価格レンジが確定したら別タスク (Web UI または seed 追加) で整備する

## 検討して見送ったもの

### 案: 架空マスタを「サンプルデータ」として残す

- 利点: 推奨価格画面が初期状態でも動作する
- 欠点: 実データと混在することで、画面・分析の解釈が歪む。デモ用と運用データの境界が曖昧になる
- 試作段階でもデータの正確性を優先する (ADR-0009 §「試作段階でも構造的欠陥は放置しない」と整合)

### 案: 既存 ADR-0004 / ADR-0005 を直接書き換える

- 利点: 1 箇所に最新方針が集約される
- 欠点: 「いつ・なぜ判断が変わったか」の履歴が消える
- 設計思想 (`.claude/CLAUDE.md` §「リポジトリが唯一の真実」/ §「ADR は追記のみ」) に従い、新規 ADR で上書きする

## 影響

- `scripts/seed/master-data.ts`:
  - `ROOM_TYPES` を実 CSV 6 件に置換
  - `PLANS` / `BASE_PRICES` を空配列に
- `scripts/seed/master.ts`:
  - 既存レコードを `update: {}` で保護 (ADR-0009 と同方針)
- `db:seed-master` の実態:
  - 投入対象は `RoomType` (6 件) と初期 ADMIN ユーザー 1 件のみ
- `db:seed-reservations`:
  - 引き続き CSV から `Plan` を `ensurePlan` で仮投入
- ADR-0004 §「シード処理の中身」/ ADR-0005 §「マスターデータ・初期 ADMIN の seed をデプロイ時に実行」の記述は本 ADR で上書きされる
- `docs/runbooks/local-development.md` §5-1 / `docs/architecture/03-data-model.md` の BasePrice 記述も整合更新

## 関連

- PR #53 (chore(seed): 架空マスタを撤去し実在 RoomType 6 件に置換)
- ADR-0004 (データ管理) — シード処理の中身を本 ADR で上書き
- ADR-0005 (CI/CD) — seed 投入対象を本 ADR で上書き
- ADR-0009 (roomCount / inventoryCount 編集) — 既存レコード保護方針が共通
- ADR-0010 (Plan 自然キー = name) — Plan を CSV から仮投入する前提と整合
