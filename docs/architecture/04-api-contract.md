# 04. API 契約

web (Next.js) ↔ api (NestJS) 間の REST API 仕様。
判断根拠は ADR-0006 を参照。本ドキュメントは仕様の確定形を記す。

## 基本方針

- ベース URL(本番): api サービスの内部 URL
- ベース URL(ローカル): `http://localhost:8080`
- 全エンドポイント JSON、UTF-8
- 共通ヘッダ:
  - `Authorization: Bearer <JWT>`(`/healthz` 以外は必須)
  - `Content-Type: application/json`(POST/PATCH 時)

## 認証

- web の Auth.js が発行した JWT を `Authorization: Bearer` で渡す
- api 側 NestJS Guard が同じシークレット(`AUTH_SECRET`)で署名検証
- JWT クレーム:
  - `sub`: User ID
  - `email`: メアド
  - `role`: `ADMIN` / `MEMBER`
  - `exp`: 有効期限(8時間)
- ロール認可は Guard / カスタムデコレータ(`@Roles('ADMIN')`)で行う

## エラーレスポンス

すべてのエラーで以下の形式を返す:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "dateFrom must be ISO date"
  }
}
```

| HTTP | code 例              | 用途                          |
| ---- | -------------------- | ----------------------------- |
| 400  | `VALIDATION_ERROR`   | リクエストパラメタ不正        |
| 401  | `UNAUTHENTICATED`    | JWT 無し / 無効 / 期限切れ    |
| 403  | `FORBIDDEN`          | ロール不足                    |
| 404  | `NOT_FOUND`          | 対象なし                      |
| 409  | `CONFLICT`           | 招待重複等                    |
| 500  | `INTERNAL_ERROR`     | 想定外(詳細はログにのみ)    |
| 503  | `DB_UNAVAILABLE`     | DB 接続失敗(`/healthz` 等)  |

## 数値の表現

- 金額・係数は **JSON 文字列** で送る(例: `"20000"`, `"1.10"`)
- 理由: Decimal 精度を保つため(ADR-0006)

## エンドポイント一覧

| メソッド | パス                              | 認可        | 用途                     |
| -------- | --------------------------------- | ----------- | ------------------------ |
| GET      | `/healthz`                        | 不要        | 死活 + DB接続確認        |
| GET      | `/recommendations`                | MEMBER以上  | 推奨価格マトリックス     |
| GET      | `/coefficients`                   | MEMBER以上  | 最新の係数一覧           |
| GET      | `/stats/occupancy`                | MEMBER以上  | 月別稼働率               |
| GET      | `/stats/adr`                      | MEMBER以上  | 月別 ADR                 |
| GET      | `/stats/lead-time`                | MEMBER以上  | リードタイム分布         |
| POST     | `/admin/invitations`              | ADMIN       | 招待発行                 |
| GET      | `/admin/users`                    | ADMIN       | ユーザー一覧             |
| PATCH    | `/admin/users/:id`                | ADMIN       | ユーザー無効化           |
| POST     | `/admin/coefficients/recompute`   | ADMIN       | 係数の再推定             |
| PUT      | `/admin/coefficients`             | ADMIN       | 係数の手動保存           |

## エンドポイント詳細

### `GET /healthz`

死活確認。DB 接続も含む。Cloud Run のスタートアッププローブ・liveness で利用可。

レスポンス(200):

```json
{ "status": "ok", "db": "ok" }
```

DB 失敗時(503):

```json
{ "error": { "code": "DB_UNAVAILABLE", "message": "..." } }
```

---

### `GET /recommendations`

推奨価格マトリックス。

クエリ:

| 名前         | 必須 | 型      | 例           |
| ------------ | ---- | ------- | ------------ |
| `dateFrom`   | yes  | ISO日付 | `2026-05-01` |
| `dateTo`     | yes  | ISO日付 | `2026-05-31` |
| `roomTypeId` | no   | int     | `1`          |
| `planId`     | no   | int     | `2`          |

レスポンス(200):

```json
{
  "computedAt": "2026-04-30T12:00:00Z",
  "items": [
    {
      "date": "2026-05-01",
      "roomTypeId": 1,
      "planId": 1,
      "basePrice": "20000",
      "coefficients": {
        "season": "1.10",
        "dayOfWeek": "1.20",
        "leadTime": "0.95"
      },
      "rawPrice": "25080",
      "clampedPrice": "25000",
      "clampReason": null
    }
  ]
}
```

- `rawPrice` = `basePrice × season × dayOfWeek × leadTime`
- `clampedPrice` = `rawPrice` を `[priceMin, priceMax]` でクランプした値
- `clampReason` は `MIN` / `MAX` / `null`
- `computedAt` は使用した係数のバージョン(`PriceCoefficient.computedAt`)

監査ログ: 1リクエストに対して `PRICE_VIEW` を 1 件記録(payload に検索条件)。

---

### `GET /coefficients`

最新の `computedAt` の係数一覧を返す。

クエリ:

| 名前   | 必須 | 型   | 例                                |
| ------ | ---- | ---- | --------------------------------- |
| `type` | no   | enum | `SEASON` / `DAY_OF_WEEK` / `LEAD_TIME` |

レスポンス(200):

```json
{
  "computedAt": "2026-04-30T12:00:00Z",
  "source": "unit_price_avg_v1",
  "items": [
    { "type": "SEASON", "key": "1", "value": "0.85", "sampleSize": 320, "fallback": false },
    { "type": "SEASON", "key": "8", "value": "1.30", "sampleSize": 540, "fallback": false }
  ]
}
```

- `fallback: true` はサンプル不足で `1.0` にフォールバックされたことを示す(ADR-0007)

---

### `GET /stats/occupancy`

月別稼働率。定義は `02-pricing-model.md` 参照。

クエリ:

| 名前   | 必須 | 型        |
| ------ | ---- | --------- |
| `from` | yes  | `YYYY-MM` |
| `to`   | yes  | `YYYY-MM` |

レスポンス(200):

```json
{
  "items": [
    {
      "yearMonth": "2026-01",
      "occupancyRate": "0.62",
      "soldRoomNights": 124,
      "totalRoomNights": 200
    }
  ]
}
```

---

### `GET /stats/adr`

月別 ADR。定義は `02-pricing-model.md` 参照。

クエリ: `from`, `to`(occupancy と同じ)

レスポンス(200):

```json
{
  "items": [
    {
      "yearMonth": "2026-01",
      "adr": "18500",
      "totalRevenue": "2294000",
      "soldRoomNights": 124
    }
  ]
}
```

---

### `GET /stats/lead-time`

リードタイム分布。ビンは係数と同一。

クエリ: `from`, `to`(occupancy と同じ)

レスポンス(200):

```json
{
  "items": [
    { "bin": "0-3",   "count": 120, "share": "0.20" },
    { "bin": "4-7",   "count": 180, "share": "0.30" },
    { "bin": "8-14",  "count": 150, "share": "0.25" },
    { "bin": "15-30", "count":  90, "share": "0.15" },
    { "bin": "31+",   "count":  60, "share": "0.10" }
  ]
}
```

---

### `POST /admin/invitations`

招待発行。

リクエスト:

```json
{ "email": "user@example.com", "role": "MEMBER" }
```

レスポンス(201):

```json
{
  "id": 12,
  "email": "user@example.com",
  "role": "MEMBER",
  "expiresAt": "2026-05-07T12:00:00Z"
}
```

エラー:

- `409 CONFLICT`: 同メアドの未消化・未失効な招待が既にある場合

監査ログ: `USER_INVITE` を記録(target=email)。

---

### `GET /admin/users`

ユーザー一覧。

レスポンス(200):

```json
{
  "items": [
    {
      "id": 1,
      "email": "admin@example.com",
      "name": "Admin",
      "role": "ADMIN",
      "status": "ACTIVE",
      "lastLoginAt": "2026-04-29T08:00:00Z"
    }
  ]
}
```

---

### `PATCH /admin/users/:id`

ユーザー無効化。

リクエスト:

```json
{ "status": "DISABLED" }
```

レスポンス(200): 更新後の User オブジェクト(上記一覧の要素と同形式)。

監査ログ: `USER_DISABLE` を記録(target=userId)。

---

### `POST /admin/coefficients/recompute`

係数の再推定をキック。同期実行(試験運用ではデータ量が小さいため)。

リクエストボディ: 無し

レスポンス(200):

```json
{
  "computedAt": "2026-04-30T12:00:00Z",
  "source": "unit_price_avg_v1",
  "rowsCreated": 24
}
```

監査ログ: `COEFFICIENT_RECOMPUTE` を記録。

---

### `PUT /admin/coefficients`

係数を手動で保存する。現在の推定値をデフォルトとして画面から任意の値に変更できる。

リクエストボディ:

```json
{
  "items": [
    { "type": "SEASON", "key": "3", "value": "1.1000" },
    { "type": "DAY_OF_WEEK", "key": "SAT", "value": "1.0500" }
  ]
}
```

- `items` は非空配列。`type` / `key` は既存の係数キーと同一。
- `value` は小数4桁文字列。保存時に `toFixed(4)` で正規化する。
- `source = 'manual'` として新しい `computedAt` のバッチを作成する。推奨価格計算は最新 `computedAt` を参照するため、保存後即反映される。

レスポンス(200):

```json
{
  "computedAt": "2026-05-02T10:00:00Z",
  "source": "manual",
  "rowsCreated": 24
}
```

監査ログ: `COEFFICIENT_MANUAL_SAVE` を記録。

## 共有型の置き場

- `packages/shared/src/api/` 配下に各エンドポイントの `Request` / `Response` 型と `ApiError` 型を配置
- web は fetch ラッパー、api は DTO バリデーション双方で使用

## ロギング

- 全リクエストに `requestId`(UUIDv4)を発行、レスポンスヘッダ `X-Request-Id` で返す
- 構造化 JSON ログ:
  - `requestId`, `userId?`, `method`, `path`, `status`, `latencyMs`
- 監査対象操作(各エンドポイントの「監査ログ」記載)は `AuditLog` テーブルにも記録

## CORS

- 本番: web → api は同一 GCP プロジェクトの内部呼び出し、CORS 不要
- ローカル: api 側で `CORS_ORIGIN=http://localhost:3000` のみ許可

## 関連

- ADR-0006: API 契約と認証方式(判断根拠)
- ADR-0003: 認証方式
- ADR-0007: 係数推定式
- `docs/architecture/02-pricing-model.md`
- `docs/architecture/03-data-model.md`
