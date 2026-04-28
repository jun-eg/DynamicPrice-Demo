# プロジェクト概要

GitHub:

**個人開発プロジェクト**

## 技術スタック

## ドキュメント構成

| フォルダ             | 問い                                         | 更新頻度         |
| -------------------- | -------------------------------------------- | ---------------- |
| `docs/architecture/` | なぜこの設計か（原則・制約・思想）           | 低（方針変更時） |
| `docs/adr/`          | なぜこの決断をしたか（判断の記録・追記のみ） | 追記のみ         |
| `docs/runbooks/`     | どう操作するか（手順・コマンド）             | 中（手順変更時） |

## 設計思想

- **リポジトリが唯一の真実（Single Source of Truth）**: 設計・決定・手順はすべてリポジトリ内のドキュメントに記録する。外部ツールや口頭伝達に依存しない。ただし Secret キー・認証情報は例外とし、環境変数や外部シークレット管理サービス（AWS Secrets Manager 等）で管理する。Issue 単位の実装計画・タスク分解は GitHub Issue（コメント・sub-issue）で管理し、リポジトリには残さない
- **責務ごとにファイルを分割**: 1ファイル1責務。複数の関心事を1ファイルに混在させない

## docs 自動チェックフロー

`git push` をトリガーに `scripts/hooks/pre-push` が起動し、コード差分を claude で解析する。

- `DOCS_OK` → push 続行
- `DOCS_REQUIRED` → push ブロック。指示された docs を更新して再 push する

セットアップ手順は `docs/runbooks/hooks-setup.md` を参照。
新規 worktree では `worktree-setup` エージェントが自動で設定する。

## Claude Code 設定

- 個人設定（`.claude.local/`、`.claude/settings.local.json`、ルート直下の `CLAUDE.md`）は**使わない**
- すべての設定は `.claude/settings.json` と `.claude/CLAUDE.md` に集約し、git で管理する
- 新規 worktree 作成時も `.claude.local/` のシンボリックリンク等は不要

## 開発ルール

- TypeScript の strict モードを維持する
- `any` は原則禁止。やむを得ない場合はコメントで理由を記載する
- フロントエンドの変更後は `npm run type-check && npm run lint` を実行する
- バックエンドの変更後は `npm run build` を実行する

## ブランチ戦略

- `main`: 本番環境
- `develop`: 開発統合ブランチ
- `feature/*`: 機能開発
- `main` と `develop` への直接 push は禁止（PR 必須）

## 作業スタイル

- worktree ごとにブランチを切って並行作業する
- PR は `commit-commands:commit-push-pr` スキルを使う

## エージェント・プラグインの活用方針

以下を積極的に活用する。判断に迷う場合は使う方向で動く。

| 場面                         | 使うもの                                                                   |
| ---------------------------- | -------------------------------------------------------------------------- |
| 新規 worktree 作成後         | `worktree-setup` エージェント                                              |
| UI実装・デザイン確認         | `web-structure-analyst` エージェント                                       |
| Git操作・PR・ブランチ管理    | `git-operator` エージェント                                                |
| 新機能の設計・実装・レビュー | `feature-dev` プラグイン（code-architect / code-explorer / code-reviewer） |

## プラグイン

プラグインは `.claude/settings.json` にプロジェクトスコープで登録されている。

| プラグイン          | 用途                                       |
| ------------------- | ------------------------------------------ |
| chrome-devtools-mcp | ブラウザ操作・デバッグ・自動化             |
| commit-commands     | コミット・push・PR作成のワークフロー自動化 |
| code-review         | プルリクエストのAIレビュー                 |
| feature-dev         | 機能開発支援（設計・探索・レビュー）       |
| typescript-lsp      | TypeScript LSPサポート                     |

## Chrome DevTools MCP（WSL2環境）

- 接続設定: `browserUrl: http://localhost:9222`（`.wslconfig` でミラーモード有効済み）
- Chrome起動スクリプト: `~/scripts/chrome-dev.sh`（WSLから実行）
- Chromeプロファイル: `C:\chrome-debug-profile`（Cookie・ログイン情報を保持）
- Chrome DevTools を使う前に `~/scripts/chrome-dev.sh` を実行してChromeを起動しておく

## サブエージェント

エージェント定義は `.claude/agents/` に配置されている。

| エージェント | 役割                       | モデル            |
| ------------ | -------------------------- | ----------------- |
| git-operator | Git/GitHubワークフロー操作 | claude-sonnet-4-6 |

### feature-dev プラグイン（`feature-dev:<agent>`）

| エージェント               | 役割                                   |
| -------------------------- | -------------------------------------- |
| feature-dev:code-architect | 機能アーキテクチャ設計・実装計画       |
| feature-dev:code-explorer  | コードベースの深い解析・依存関係把握   |
| feature-dev:code-reviewer  | コードレビュー・バグ・セキュリティ確認 |

## エージェント管理ルール

- **`.claude/agents/` 配下のエージェント定義ファイルは、ユーザーの明示的な指示なしに追加・編集・削除してはならない**
- 上記テーブルに記載されていないエージェントを勝手に作成しない
- エージェントを追加する場合は必ずユーザーに確認し、このファイルのテーブルも合わせて更新する

## エージェント呼び出しルール

- エージェントを呼び出す前に、そのエージェント定義ファイル（`.claude/agents/<name>.md`）を必ず確認する
- エージェント定義に保存先などの固定ルールが記載されている場合は、プロンプトで上書きせずエージェント定義に従わせる
