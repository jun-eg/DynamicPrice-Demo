# 03. データモデル

## 設計方針

- **PII(個人情報)はDBに入れない**: 元CSVに含まれる氏名・電話・住所・メールアドレス等は、シード投入時に**完全に落とす**。再構成不能にする。
- **テーブルは責務ごとに分割**: 予約履歴 / マスター / 価格 / 認証 で系統を分ける。
- **MVPの薄さに合わせる**: 編集UIや承認フローがないので、状態遷移を持つテーブルは最小化。
- **数値は `Decimal`**: 金額・係数は浮動小数点誤差を避けるため `Decimal` を使う。

## 論理モデル(概要)

```
┌─────────────────┐
│   RoomType      │ 部屋タイプ・マスター(seed)
└────┬────────────┘
     │
     │  ┌──────────────────┐
     ├─▶│   BasePrice      │ 基準価格(roomType × plan、seed)
     │  └──────────────────┘
     │
┌─────────────────┐
│   Plan          │ プラン・マスター(seed)
└────┬────────────┘
     │
     │  ┌──────────────────┐
     └─▶│   Reservation    │ 予約履歴(PII除去済み)
        └──────────────────┘

┌──────────────────────┐
│   PriceCoefficient   │ 自動推定された係数(season/dow/leadtime)
└──────────────────────┘

┌──────────┐  ┌──────────────┐  ┌─────────────┐
│  User    │  │  Invitation  │  │  AuditLog   │  認証・監査
└──────────┘  └──────────────┘  └─────────────┘
```

## テーブル定義(MVP)

### `Reservation` — 予約履歴

元CSV `ReservationTotalList.CSV` から PII を除去して投入。
**価格モデルの「過去データ」として使う**。

| カラム            | 型         | 由来 / 備考                                |
| ----------------- | ---------- | ------------------------------------------ |
| `id`              | int (PK)   | 自動採番                                   |
| `reservationCode` | string?    | 元の予約番号(個人非特定)。デバッグ用     |
| `bookedDate`      | date       | 申込日                                     |
| `checkInDate`     | date       | チェックイン日                             |
| `checkOutDate`    | date       | チェックアウト日                           |
| `nights`          | int        | 泊数                                       |
| `bookingChannel`  | string?    | 予約サイト名称(楽天 / じゃらん / 公式...) |
| `roomTypeId`      | int (FK)   | → `RoomType`                               |
| `planId`          | int (FK)   | → `Plan`                                   |
| `adults`          | int        | 大人人数計                                 |
| `children`        | int        | 子供人数計                                 |
| `infants`         | int        | 幼児人数計                                 |
| `totalAmount`     | decimal    | 料金合計額                                 |
| `adultUnitPrice`  | decimal?   | 大人単価                                   |
| `childUnitPrice`  | decimal?   | 子供単価                                   |
| `infantUnitPrice` | decimal?   | 幼児単価                                   |
| `cancelDate`      | date?      | 予約キャンセル日(NULLなら成立)           |

**インデックス**: `(checkInDate)`, `(bookedDate)`, `(roomTypeId, planId, checkInDate)`

**PII で**入れないカラム**(元CSVにあるが落とす)**:

```
宿泊者氏名 / 宿泊者氏名カタカナ / 電話番号 / 郵便番号 / 住所1 /
メールアドレス / 予約者氏名 / 予約者氏名カタカナ / 会員番号 / 法人情報 /
備考1 / 備考2 / メモ
```

`備考1` `備考2` `メモ` は自由記述で個人情報が混入する典型箇所。落とす。

### `RoomType` — 部屋タイプ・マスター

| カラム            | 型       | 備考                                        |
| ----------------- | -------- | ------------------------------------------- |
| `id`              | int (PK) | 自動採番                                    |
| `code`            | string   | UNIQUE。元CSVの分類に対応                   |
| `name`            | string   | 表示名                                      |
| `capacity`        | int?     | 定員                                        |
| `inventoryCount`  | int      | 部屋数。稼働率の分母に使う(`02-pricing-model.md`) |

### `Plan` — プラン・マスター

| カラム      | 型       | 備考                                       |
| ----------- | -------- | ------------------------------------------ |
| `id`        | int (PK) | 自動採番                                   |
| `code`      | string   | UNIQUE。元CSVの「商品プランコード」に対応  |
| `name`      | string   | 表示名                                     |
| `mealType`  | string?  | 一泊二食 / 朝食付き / 素泊まり 等(正規化) |

### `BasePrice` — 基準価格

`RoomType × Plan` の組合せに対する基準価格。Seed で投入し、変更は DB 直接(MVPでは編集UIなし)。

| カラム          | 型       | 備考                       |
| --------------- | -------- | -------------------------- |
| `id`            | int (PK) | 自動採番                   |
| `roomTypeId`    | int (FK) | → `RoomType`               |
| `planId`        | int (FK) | → `Plan`                   |
| `amount`        | decimal  | 基準価格(税込)           |
| `effectiveFrom` | date     | 適用開始日                 |
| `effectiveTo`   | date?    | 適用終了日(NULLなら継続) |

**ユニーク制約**: `(roomTypeId, planId, effectiveFrom)`

### `PriceCoefficient` — 自動推定された係数

過去予約データから推定された係数を保存。バッチ的に再計算してバージョン管理する。

| カラム        | 型             | 備考                                                           |
| ------------- | -------------- | -------------------------------------------------------------- |
| `id`          | int (PK)       | 自動採番                                                       |
| `type`        | enum           | `SEASON` / `DAY_OF_WEEK` / `LEAD_TIME`                         |
| `key`         | string         | `SEASON`なら "1"〜"12"、`DAY_OF_WEEK`なら "MON".."SUN"、`LEAD_TIME`なら "0-3", "4-7", "8-14", "15-30", "31+" |
| `value`       | decimal        | 係数(例: 1.15)                                              |
| `computedAt`  | timestamp      | 推定実行日時(バージョン代わり)                              |
| `source`      | string?        | 推定方式の識別子("monthly_avg_v1" 等)                       |

**ユニーク制約**: `(type, key, computedAt)`
**インデックス**: `(type, key)`

「最新の係数」を取るときは `computedAt` の最大を取るクエリで対応。

### `User` — 利用者

| カラム        | 型         | 備考                                       |
| ------------- | ---------- | ------------------------------------------ |
| `id`          | int (PK)   | 自動採番                                   |
| `email`       | string     | UNIQUE。Google アカウントのメアド          |
| `name`        | string?    | Google プロフィール由来                    |
| `role`        | enum       | `ADMIN` / `MEMBER`                         |
| `status`      | enum       | `ACTIVE` / `DISABLED`                      |
| `createdAt`   | timestamp  |                                            |
| `lastLoginAt` | timestamp? |                                            |
| `invitedById` | int?       | → `User`(誰が招待したか)                |

### `Invitation` — 招待

| カラム        | 型         | 備考                                       |
| ------------- | ---------- | ------------------------------------------ |
| `id`          | int (PK)   | 自動採番                                   |
| `email`       | string     | 招待先メアド                               |
| `role`        | enum       | `ADMIN` / `MEMBER`(デフォルト `MEMBER`) |
| `invitedById` | int (FK)   | → `User`                                   |
| `expiresAt`   | timestamp  | 招待の有効期限                             |
| `usedAt`      | timestamp? | 消化日時(NULL=未使用)                  |
| `createdAt`   | timestamp  |                                            |

**インデックス**: `(email)`

サインイン時のフロー:

1. Google OAuth で取得したメアドを `Invitation` で検索
2. 未使用 かつ `expiresAt > now()` のレコードがあれば
3. `User` を作成、`Invitation.usedAt` を埋める
4. `User.status=ACTIVE` の場合のみセッション発行

`User` がすでに存在する場合は `Invitation` チェックをスキップ(2回目以降のログイン)。

### `AuditLog` — 監査ログ

| カラム      | 型        | 備考                                                |
| ----------- | --------- | --------------------------------------------------- |
| `id`        | int (PK)  | 自動採番                                            |
| `userId`    | int (FK)  | → `User`                                            |
| `action`    | string    | `USER_INVITE`, `USER_DISABLE`, `PRICE_VIEW` ...     |
| `target`    | string?   | 対象を識別する文字列(対象メアド・対象日付など)    |
| `payload`   | json?     | 任意の追加情報                                      |
| `createdAt` | timestamp |                                                    |

**インデックス**: `(userId, createdAt)`

監査の対象:

- 招待発行 / ユーザー無効化(管理操作)
- ログイン / ログアウト
- 推奨価格画面の閲覧(誰がいつ何の日付を見たか)

## ER 観点の補足

- **Reservation** と **RoomType / Plan** は外部キーで結ぶ。元CSVの「部屋タイプ名称」「商品プラン名称」は**自由文字列**なので、Seed 時に正規化テーブルへマッピングする。
- 同じ「商品プランコード」が時期で異なる名称を持つ可能性がある。`Plan.code` を主キー扱いし、名称揺れは Seed で吸収する。
- `Reservation.cancelDate` がある行は「キャンセル予約」。係数推定では原則除外。

## 物理設計上の注意

- **DB**: PostgreSQL 15+(Cloud SQL)
- **タイムゾーン**: 日本時間(JST)で統一。`timestamp with time zone` を使い、保存はUTC、表示はJST。
- **Decimal精度**: 金額は `decimal(10, 0)` か `decimal(12, 2)`、係数は `decimal(6, 4)` 想定。
- **削除戦略**: `User` は物理削除しない(`status=DISABLED`)。`Invitation` は期限切れを定期的に削除可。`Reservation` は履歴データなので原則削除しない。
- **マイグレーション**: Prisma migrate でバージョン管理。本番投入前にレビュー。

## Phase 2 で追加候補

- `BasePrice` 編集UIに対応するため `updatedAt` `updatedBy` を追加
- 係数 UI 編集のため `PriceCoefficient` に `manualOverride` フラグ
- 在庫(`Inventory` テーブル)— `RoomType × date` で残室数
- PMS連携用の同期ジョブ管理(`SyncRun` テーブル)
