# Portable Codespaces

スマートフォンから **GitHub Codespaces** を快適に使うための、サーバーレス Web アプリです。  
GitHub Pages でそのまま動作します。

👉 **[デモを開く](https://tanashou1.github.io/portable-codespaces/)**

---

## 機能

### 💬 AI エージェントチャット
- **GitHub Models API** を使ったストリーミングチャット（GPT-4o / Llama 3 / Phi-3.5 など）
- モバイルに最適化されたバブル UI・コピーボタン
- Markdown・コードブロックのシンタックスハイライト付きレンダリング
- システムプロンプトをカスタマイズ可能
- チャット履歴を localStorage に保存（最新 60 件）

### 📄 コードビューア
- GitHub リポジトリのファイルをブランチ/タグ指定で閲覧
- フォルダツリー + パンくずナビゲーション
- 40 以上の言語に対応したシンタックスハイライト（highlight.js）
- 画像ファイルのプレビュー対応

### 📦 Codespaces 管理
- Codespace 一覧の表示（名前・リポジトリ・ブランチ・状態・更新日時）
- ワンタップで Codespace をブラウザで開く
- コードビューアへの直接連携
- AI チャットへのコンテキスト引き継ぎ

---

## 使い方

### 1. GitHub Personal Access Token を取得

[GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens) にアクセスし、以下のスコープで **Fine-grained** または **Classic** トークンを作成します。

| スコープ | 用途 |
|---|---|
| `codespaces` | Codespaces 一覧の取得 |
| `repo` (または `contents: read`) | コードの閲覧 |
| `models:read` | GitHub Models（AI チャット） |

### 2. アプリにトークンを登録

アプリを開くと設定モーダルが表示されます。トークンを入力して「開始する」をクリックするだけです。  
トークンは **ブラウザの localStorage にのみ保存** され、外部サーバーへは送信されません。

### 3. チャット・コード閲覧

- **チャット** タブ：AIモデルを選んでメッセージを送るだけ。コード付きの質問も OK。  
- **コード** タブ：`owner/repo` を入力して「読み込む」→ ファイルをタップ。

---

## GitHub Pages へのデプロイ

リポジトリの **Settings → Pages** で、  
`Deploy from a branch` → `main` → `/ (root)` を選択して保存するだけです。

---

## セキュリティについて

- トークンは `localStorage` にのみ保存されます（共有端末では注意）
- AI レスポンスは DOMPurify でサニタイズされます
- 認証情報はソースコードにハードコーディングされていません
