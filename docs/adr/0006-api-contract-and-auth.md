# ADR-0006: API 契約と認証方式

- ステータス: 採用
- 日付: 2026-04-30

## コンテキスト

- web (Next.js) と api (NestJS) は別 Cloud Run サービス(ADR-0001, ADR-0002)
- 認証は Auth.js + Google Sign-In + 招待制(ADR-0003)
- web → api 間でセッションを引き継ぎ、api 側でロール認可も行う必要がある
- 当面クライアントは web のみだが、将来別クライアントを想定する余地は残す
- ADR-0001/0003 で「api は Guard で JWT を検証」と方向性は決めたが、**渡し方・エラー形式・エンドポイント方針が未決**

## 決定

### 認証ヘッダ

- web → api の API 呼び出しは `Authorization: Bearer <JWT>` で行う
- JWT は Auth.js (web) が発行したセッショントークンと**同一シークレットで署名**する
- NestJS 側の Guard が同じシークレットで署名検証する
- JWT クレーム: `sub`(User ID) / `email` / `role`(`ADMIN` or `MEMBER`) / `exp`(8時間)

### ロール認可

- NestJS の `@UseGuards(JwtAuthGuard)` + カスタムデコレータ `@Roles('ADMIN')` で実装
- ロール詐称防止のため、`role` は JWT から読みつつ**重要操作はリクエスト時に DB から再確認**(ADR-0003 と整合)

### エラーレスポンス形式

統一フォーマット:

```json
{ "error": { "code": "string", "message": "string" } }
```

| HTTP | code 例              | 用途                          |
| ---- | -------------------- | ----------------------------- |
| 400  | `VALIDATION_ERROR`   | リクエストパラメタ不正        |
| 401  | `UNAUTHENTICATED`    | JWT 無し / 無効 / 期限切れ    |
| 403  | `FORBIDDEN`          | ロール不足                    |
| 404  | `NOT_FOUND`          | 対象なし                      |
| 409  | `CONFLICT`           | 招待重複等                    |
| 500  | `INTERNAL_ERROR`     | 想定外(詳細はログにのみ)    |

### エンドポイント命名

- ベース: api サービスの直下(`/healthz`, `/recommendations` 等)
- ADMIN 専用エンドポイントは `/admin/*` 名前空間
- ヘルスチェック `/healthz` は認可不要、DB 接続も確認

### CORS

- 本番: web → api は GCP プロジェクト内の内部 URL 経由、CORS 不要
- ローカル: api 側で `http://localhost:3000` のみ許可(dev フラグで切替)

### 数値の表現

- 金額・係数は **JSON 文字列** で送る(`"20000"` `"1.10"`)
- 理由: Decimal の精度落ちを避ける、フロントの `toFixed` 等で表示加工しやすい

### 共有型

- `packages/shared/src/api/` に各エンドポイントの `Request` / `Response` 型を置く
- web の fetch ラッパー・api の DTO バリデーションで共用
- エラー型 `ApiError` も同所に置く

詳細仕様: `docs/architecture/04-api-contract.md`

## なぜこの選択か

### Bearer ヘッダを採用(Cookie 透過ではなく)

- web の Server Components / Server Actions から fetch でヘッダに乗せる方が、Cloud Run の独立サービス間通信として標準的
- Cookie ドメイン共有のための SameSite / domain 設定が不要
- 将来、別クライアントが api を叩く場合にも同じ認証経路で済む

### web と同じシークレットで JWT を署名

- 鍵管理が一箇所で済む(Secret Manager に1つ)
- 試験運用フェーズではこのシンプルさを優先
- api を独立公開する段になれば JWKS 化を検討(別 ADR)

### エラーフォーマット統一

- フロント側のエラー表示・ロギングを 1 経路で書ける
- `code` を機械可読に、`message` を人間可読にすることで両用途を満たす

### 数値を文字列で送る

- 金額・係数は `Decimal` で扱う方針(`03-data-model.md`)。JSON `number` で送ると IEEE 754 に丸められる
- フロントは `string` のまま表示し、計算が必要な場合のみ Decimal ライブラリで読み込む

## 検討して見送ったもの

### Cookie 透過(web/api を同一 cookie domain で共有)

- Cloud Run の独立サービス間で cookie domain を共有するにはカスタムドメインの設定が前提
- ローカル開発時の差分も増える
- Bearer ヘッダの方が経路としてシンプル

### tRPC / GraphQL

- ADR-0001 で見送り済み。REST + 共有型で十分

### 数値を JSON `number` で送る

- 表現範囲は十分だが、Decimal を扱う前提では文字列の方が安全
- バンド幅・パース速度の差は試験運用規模では無視できる

## 影響

- web 側に「Server Component から api を fetch するための共通ヘルパ」が必要(JWT 取得 + ヘッダ付与)
- api 側に NestJS Guard(JWT 検証 + ロールチェック)を実装
- `packages/shared/src/api/` の整備が前提条件

## 関連

- ADR-0001, ADR-0002, ADR-0003
- `docs/architecture/04-api-contract.md`
