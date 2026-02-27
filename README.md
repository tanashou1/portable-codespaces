# Portable Codespaces

スマートフォンから **GitHub Codespaces** を快適に使うための、サーバーレス Web アプリです。  
GitHub Pages でそのまま動作します。外部サーバーへの通信は一切ありません。

👉 **[デモを開く](https://tanashou1.github.io/portable-codespaces/)**

---

## アプリの概要

`Portable Codespaces` は、モバイルブラウザから GitHub Codespaces を管理・活用するために作られた純粋な静的 Web アプリです。  
**GitHub Personal Access Token** を使って直接 GitHub API / GitHub Models API / GitHub Copilot API と通信するため、バックエンドサーバーは不要です。

主な用途：
- 外出先のスマートフォンから Codespace を確認・起動する
- GitHub Copilot Chat と同等の AI チャット機能をブラウザから利用する
- モバイルでリポジトリのソースコードを読む

---

## 機能

### 📦 Codespaces 管理
- GitHub 公式 API (`api.github.com`) を使った Codespace 一覧表示
- 名前・リポジトリ・ブランチ・状態（Available / Shutdown / Starting）・更新日時を表示
- ワンタップで公式 Codespace をブラウザで開く（`web_url` 直リンク）
- コードビューアへの直接連携
- AI チャットへのコンテキスト引き継ぎ

### 💬 AI チャット（Copilot Chat 相当）
- **GitHub Models API** を使ったストリーミングチャット
  - GPT-4o / GPT-4o mini / Llama 3.1 70B / Phi-3.5 mini
- **GitHub Copilot API** を使った Copilot Chat 相当のチャット
  - Claude 3.5 Sonnet / Claude 3 Haiku / OpenAI o1 mini / o1 preview / o3 mini
- モバイル最適化バブル UI・コピーボタン
- Markdown・コードブロックのシンタックスハイライト付きレンダリング（DOMPurify サニタイズ）
- システムプロンプトをカスタマイズ可能
- チャット履歴を localStorage に保存（最新 60 件）

### 📄 コードビューア
- GitHub リポジトリのファイルをブランチ / タグ指定で閲覧
- フォルダツリー + パンくずナビゲーション
- 40 以上の言語に対応したシンタックスハイライト（highlight.js）
- 画像ファイルのプレビュー対応

---

## 使い方

### 1. GitHub Personal Access Token を取得

[GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens) で **Classic** トークンを作成します。

| スコープ | 用途 |
|---|---|
| `codespaces` | Codespaces 一覧の取得・操作 |
| `repo` (または `contents: read`) | コードの閲覧 |
| `models:read` | GitHub Models（GPT-4o / Llama / Phi）|
| `copilot` *(任意)* | GitHub Copilot モデル（Claude / o1 など）|

### 2. アプリにトークンを登録

アプリを開くと設定モーダルが表示されます。トークンを入力して「開始する」をクリックするだけです。  
トークンは **ブラウザの localStorage にのみ保存** され、外部サーバーへは送信されません。

### 3. 各機能を使う

- **Spaces タブ**：Codespace 一覧を確認し、ワンタップで開く。  
- **チャット タブ**：モデルを選んでメッセージを送信。`copilot` スコープがあれば Claude や o1 も利用可能。  
- **コード タブ**：`owner/repo` を入力して「読み込む」→ ファイルをタップ。

---

## GitHub Pages へのデプロイ

このリポジトリには GitHub Actions ワークフロー (`.github/workflows/deploy.yml`) が含まれており、  
`main` ブランチへのプッシュで自動的に GitHub Pages へデプロイされます。

手動でデプロイする場合は、リポジトリの **Settings → Pages** で  
`Deploy from a branch` → `main` → `/ (root)` を選択して保存してください。

---

## セキュリティについて

- トークンは `localStorage` にのみ保存されます（共有端末では注意）
- AI レスポンスは DOMPurify でサニタイズされます
- 認証情報はソースコードにハードコーディングされていません
- 外部 CDN に依存しません（vendors/ ディレクトリにバンドル済み）
