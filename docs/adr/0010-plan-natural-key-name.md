# ADR-0010: Plan の自然キーを商品プラン名称に切り替える

- ステータス: 採用
- 日付: 2026-05-03

## コンテキスト

Step 1 〜 Step 2 の seed では `Plan.code = 商品プランコード` を自然キーとして採用していた。
しかし issue #55 / #56 の調査で、実 CSV (8 ファイル / 6,853 行) に **双方向の不整合** があると判明した。

### #55: 同一プラン名が複数コードに分裂

`商品プラン名称` distinct = 26 / `商品プランコード` distinct = 45。
13 / 26 のプランで「同 name に複数 code」が発生している。

例: `Breakfast included` は 10 個の異なる商品プランコードに散らばる:
`254225441` / `254225441A` / `254225439` / `254225439A` / `254225443` / ... 計 699 件。

ADR-0007 の係数推定はサンプル数 30 件未満で fallback するため、本来は推定可能なプランが「データ不足」扱いになる。

### #56: 同一商品プランコードに複数のプランが同居

12 / 45 コードで「1 コード = 複数プラン名称」が発生している。

例: `172e8b48b361` (1 コード) には以下 8 種類の名称が同居:
`一汁三菜和朝食プラン` / `お部屋で食べる和朝食プラン` / `Deluxe 記念日プラン` /
`すき焼き＆寿司 夕朝食付` / `鯛しゃぶ 1泊2食` / ...

`ensurePlan` (`scripts/seed/reservations.ts`) は最初に出現した名称で `Plan` を確定させ、以降の異なる名称の予約も同じ `planId` に紐付くため、「朝食のみ」と「1泊2食付き」が 1 Plan に同居してしまう。

`02-pricing-model.md` §旅館特有の制約は「一泊二食付き / 素泊まり: プラン別に基準価格を持つ(食事原価が異なるため係数では表現しない)」と前提しているが、その粒度が壊れる。

## 決定

`Plan.code` を撤廃し、**`Plan.name` (= 商品プラン名称) を自然キーにする**。

### スキーマ

```prisma
model Plan {
  id       Int     @id @default(autoincrement())
  name     String  @unique     // 元: code @unique + name
  mealType String?
  ...
}
```

### マイグレーション

`20260503000001_plan_natural_key_to_name`:

1. 同 name の plans 行のうち、最小 id 以外を参照する `reservations` / `base_prices` の `planId` を最小 id に再リンク
2. 重複 plan 行を削除
3. `code` 列を削除
4. `name` に UNIQUE 制約を追加

### CSV mapping

`csv-mapping.ts` の `CSV_COLUMN.planCode` および `MappedRow.planCode` を撤廃。
`商品プランコード` 列はホワイトリストから外し、取り込まない。

### Seed (master-data.ts / master.ts)

- `PlanSeed.code` を撤廃、自然キーは `name`
- `BasePriceSeed.planCode` を `planName` に置換
- `master.ts` の `upsertPlans` は `update: {}` で既存行を保護(ADR-0009 と同方針)

## なぜこの選択か

### 案A (採用): name を自然キー

- **#55 を直接解決**: 同 name に複数 code が散っていたものが 1 行に集約される
- **#56 を直接解決**: 同 code に異なる name が同居していたものが name ごとに分離される
- スキーマがシンプル(複合キー不要、追加テーブル不要)
- `BasePrice` の運用("プラン別基準価格")が `02-pricing-model.md` の前提と整合する

### 案B: `(code, name)` 複合 UNIQUE

- 利点: 既存の code を残せる
- 欠点: **#55 を解決しない**(同 name で複数 code が散っていれば、複合キーは依然分裂)
- 試作段階で複合キーを持っても運用利得が薄い

### 案C: `PlanGroup` を上に置く 2 層モデル

- 元 CSV の粒度を `Plan` で保ち、係数推定・基準価格は `PlanGroup` 単位
- 利点: code の発番情報を残せる
- 欠点: スキーマ変更が大きい・試作段階で過剰
- 将来「チャネル別の取り扱い」を分析したくなったら検討する候補

### 案D: code → 正規プラン名マッピング表

- `master-data.ts` に「コード → 正規プラン名」テーブルを保持
- 利点: code を残せる
- 欠点: マッピング表の維持コスト・新コード増加時の運用負担が大きい
- Plan の自然キーを name にすれば不要

## 検討して見送ったもの

### 名称ゆれ (`2adult included 2meals` ↔ `2meals included 2adults` など)

- 同じプランが英語表記の語順違いで別 Plan に分かれる可能性は残る
- 試作段階の影響は軽微(両方とも数件オーダー)
- 必要なら Phase 2 で正規化マッピングを追加する別 issue として残す

### 商品プランコードを Reservation 側に取り込んで保存する案

- 利点: チャネル別分析の素材になる
- 欠点: PII 取り込みは最小化方針(ADR-0004)、現時点で利用ユースケースなし
- 将来必要になったら CSV 取込時に追加可能

## 影響

- `packages/db/prisma/schema.prisma` の `Plan` を name UNIQUE に変更
- マイグレーション `20260503000001_plan_natural_key_to_name` を追加
  - 実データ移行: 同 name の重複行を最小 id にマージ → 重複削除 → code 列削除 → name UNIQUE 化
- `scripts/seed/csv-mapping.ts` から `planCode` を撤廃
- `scripts/seed/reservations.ts` の `ensurePlan` を name で同定
- `scripts/seed/master-data.ts` / `master.ts` の Plan / BasePrice 投入を name ベースに
- `docs/architecture/03-data-model.md` を更新

## 関連

- issue #55 (同一プラン名の複数コード分裂)
- issue #56 (同一商品プランコードに複数プラン同居)
- ADR-0004 (PII 取り込みは最小化)
- ADR-0007 (係数推定式)
- `docs/architecture/02-pricing-model.md` §旅館特有の制約
