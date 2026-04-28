---

description: PR を「設計思想との整合性」「Issue との乖離」の 2 観点のみで Critical レビュー
argument-hint: "<PR番号>"
allowed-tools: ["Bash(gh pr view:*)", "Bash(gh pr diff:*)", "Bash(gh issue view:*)", "Read", "Grep", "Glob"]

---

# 設計準拠レビュー（2観点・Critical のみ）

PR **#$ARGUMENTS** を以下の 2 観点のみでレビューせよ。それ以外は指摘しない。Suggestion は不要、**Critical 乖離のみ**報告する。

## 前提取得

1. `gh pr view $ARGUMENTS --json title,body,files,commits` を実行
2. PR 本文・コミットメッセージからリンク Issue 番号を抽出し `gh issue view <番号>` を実行
3. `gh pr diff $ARGUMENTS` で差分を取得
4. `CLAUDE.md` / `docs/architecture/**` / `docs/adr/**` を**すべて参照**

## 観点1: 設計思想との整合性

参照: `CLAUDE.md`, `docs/architecture/**`, `docs/adr/**`

- 明文化された原則・設計思想・設計に反していないか
- 既存 ADR の決定と矛盾する実装になっていないか
- 矛盾がある場合、**新規 ADR で上書きすべきか / 既存設計に合わせるべきか**を示す

## 観点2: Issue と実装の乖離

- **不足**: Issue の受け入れ条件で実装されていない項目
- **スコープ外**: Issue に無いのに差分に含まれる変更
- **意図のズレ**: Issue のゴールと実装アプローチが食い違っている箇所

## 出力形式（Markdown）

```markdown
### 設計思想の不整合

- [file:line] 違反内容 / 参照原則（ADR番号 or architecture文書名）
  （無ければ「該当なし」）

### Issue との乖離

**不足**

- 項目 / Issue 上の該当箇所

**スコープ外**

- [file:line] 変更内容 / 別PR分離の要否

**意図のズレ**

- 箇所 / Issue の意図 / 実装の方向
```

## 厳守事項

- 上記 2 観点以外は**一切指摘しない**（型・テスト・バグ・スタイル・パフォーマンス等は対象外）
- **Suggestion / Nit は書かない**。Critical な乖離のみ
- 該当が無いセクションは「該当なし」と明記
- 出力は上記 Markdown テンプレートのみ。前置き・総評・要約は付けない
