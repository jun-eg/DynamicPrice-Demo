# ADR-0009: 室数の取り込みと部屋数 (inventoryCount) の Web 編集

- ステータス: 採用
- 日付: 2026-05-03

## コンテキスト

issue #57 / #59 を通じて、稼働率・ADR・係数推定の集計式に構造的欠陥があると判明した。

1. **分子の問題**: CSV「室数」列が `csv-mapping.ts` のホワイトリストに無いため、複数室予約 (1 行で 2 室を確保している予約) が分子に正しく反映されない。現状は「1 行 = 1 室」が暗黙の前提になっている
2. **分母の問題**: `RoomType.inventoryCount` が `master-data.ts` で全部屋タイプ `1` でハードコードされており、CSV 分析から推定される実部屋数と乖離している (Den, Fusuma, Fusuma(DInner), Gratte-ciel は 2 以上)

このまま放置すると稼働率が過大に出るほか、複数室予約が増えるにつれ静かに集計が壊れる。

試作段階とはいえ、データ分析の正確性に直結するため構造修正が必要。スキーマ変更を伴う判断と、 `inventoryCount` を運用中にどう更新するかの方針を ADR に残す。

## 決定

### 1. `Reservation.roomCount` カラムを追加する (試作段階でも放置しない)

- `packages/db/prisma/schema.prisma` の `Reservation` に `roomCount Int @default(1)` を追加
- `csv-mapping.ts` の CSV ホワイトリストに `roomCount: '室数'` を追加
- 集計式 (稼働率 / ADR / 1泊単価) を `nights × roomCount` ベースに統一する
- 既存行は `DEFAULT 1` で埋める (CSV 取り込み時の暗黙前提と一致)

### 2. `RoomType.inventoryCount` は Web から編集可能にする (履歴管理は不採用)

- ADMIN 専用画面 `/admin/room-types` を追加し、`inventoryCount` のみ編集できる
- 編集対象から外すもの:
  - `capacity` — 集計に使われていない
  - `name` — CSV から抽出する方針 (csv-mapping.ts) のため別管理
  - `code` — 予約データとの紐付けキーのため変更不可
- 部屋タイプの追加・削除は不可 (編集のみ)
- 編集は `AuditLog` (`ROOM_TYPE_INVENTORY_UPDATE`) に記録する
- 履歴管理 (`effectiveFrom` 付き時系列) は採用しない
- 編集時は「過去稼働率にも遡及影響する」旨を画面で警告

### 3. `master-data.ts` の `inventoryCount` は seed 時のみ反映 (Web 編集を尊重)

- `master.ts` の `upsertRoomTypes` は既存レコードを `update: {}` で触らない
- 初回 seed 時に CSV 分析結果に基づく暫定値を投入する:
  - Asakusa, Sugi: 1
  - Den, Fusuma, Fusuma(DInner), Gratte-ciel: 2 (暫定。担当者ヒアリング後に Web 経由で確定)

## なぜこの選択か

### `roomCount` を試作段階でも追加する理由

- 「データ分析の正確性」は試作段階でも保たないと、推奨価格モデルや係数推定の妥当性検証ができない
- 1 件 / 6,853 件の例外なので「無視」も選択肢だったが、**前提が静かに壊れる**設計を残すと、複数室予約が増えた時に係数の歪みに気付けない
- `DEFAULT 1` のおかげで既存データへの影響はなく、migration コストは小さい
- ADR-0004 で示した「PII 取り込みは最小化、分析に必要な列は取り込む」方針とも整合する

### Web 編集にする理由

- `master-data.ts` のハードコード値は本格運用前に書き換える前提だが、**実 CSV の部屋タイプ名と完全一致しない場合は反映されない**(reservations.ts の `ensureRoomType` が auto-create したレコードに対しては効かない)
- 担当者ヒアリングで実値が確定するため、シード再実行・コード変更を伴わない更新手段が必要
- 価格 (BasePrice) は MVP では DB 直接編集だが、`inventoryCount` は **稼働率の分母** という重要指標なので運用画面が必要

### 履歴管理 (`effectiveFrom` 付き時系列) を採用しない理由

- 試作段階では過剰
- 実物件の増築・改築は頻繁に起きない
- `inventoryCount × 月日数` を「月別に異なる部屋数で計算する」要件は、本格運用に入って初めて出てくる
- 採用すると `RoomType` のクエリが時系列ジョインに変わり、稼働率計算も複雑化する
- ただし「過去月の稼働率にも遡及影響する」点は明確なリスクなので、画面警告と ADR で明示する

### `master.ts` の upsert を `update: {}` にする理由

- ADR-0005 と同じ思想: **運用で変えた値を毎デプロイで巻き戻さない**
- 初回 seed の値は単なるブートストラップ。Web で編集された値が「正」になる
- name / capacity も同時に巻き戻る挙動を避ける (capacity は編集 UI 対象外だが、誤って seed の null で上書きされると混乱する)

## 検討して見送ったもの

### 案: `Reservation` を「夜単位 × 室単位」に展開する

- `nights × roomCount` 行に分解して保存する
- 利点: 集計クエリが単純化する
- 欠点: 既存 `02-pricing-model.md` の「連泊予約は 1 レコード = 1 行で扱う」方針と矛盾。係数推定の単純化が崩れる
- 現方針の `nights × roomCount` を集計時に掛ける形が、データモデルと集計の両方をシンプルに保てる

### 案: `inventoryCount` の編集 UI を持たず、`master-data.ts` での運用に閉じる

- 利点: 実装コスト最小
- 欠点: ハードコードと実 CSV 名の不一致 (例: 表記ゆれ・新規部屋追加) を運用で解消する手段がない
- 担当者ヒアリングが終わった瞬間に編集 UI が必要になる蓋然性が高い

### 案: `inventoryCount` に `effectiveFrom` を持たせて履歴管理する

- 利点: 過去月の稼働率を増築前の値で正しく計算できる
- 欠点: 試作段階では複雑度が見合わない。本格運用に入ってから検討する課題として残す

## 影響

- `packages/db/prisma/schema.prisma` の `Reservation` に `roomCount` を追加
- マイグレーション `20260503000000_add_reservation_room_count` を追加
- `scripts/seed/csv-mapping.ts` / `scripts/seed/reservations.ts` で `roomCount` を取り込む
- `packages/shared/src/stats/aggregate.ts` / `coefficients/aggregate.ts` を `nights × roomCount` ベースに変更
- `apps/api/src/admin/room-types.{controller,service,dto}.ts` を新規追加 (`/admin/room-types` GET / PATCH)
- `apps/web/src/app/admin/room-types/` 一式を追加し、ナビにリンクを追加
- `docs/architecture/02-pricing-model.md` の集計式・補足を更新
- `docs/architecture/04-api-contract.md` に `/admin/room-types` を追記

## 関連

- issue #57 (構造的欠陥の議論)
- issue #59 (本 ADR の根拠 issue)
- ADR-0007 (係数推定式) — 1泊単価の分母が `nights × roomCount` に変更される
- ADR-0008 (価格クランプ範囲の保持粒度) — `BasePrice` の運用方針と類似 (履歴管理は段階的に拡張)
- `docs/architecture/02-pricing-model.md` §補助指標の定義
- `docs/architecture/03-data-model.md` (`Reservation` / `RoomType`)
