# LINE Report — MARUGO S 管理システム

> **リポジトリ**: `MARUGO-s/line_report`  
> **本番 GitHub Pages**: `https://marugo-s.github.io/line_report/`  
> **バックエンド Supabase**: `https://hocbnifuactbvmyjraxy.supabase.co`（プロジェクト名: hocbn）  
> **最終更新**: 2026-09-10（数値予測・評価・関連文書。その他の設定値は各節の確認時点）

---

## 目次

1. [システム概要](#1-システム概要)
2. [画面一覧（全ページ）](#2-画面一覧全ページ)
3. [アーキテクチャ](#3-アーキテクチャ)
4. [認証・セキュリティ](#4-認証セキュリティ)
5. [Supabase Edge Functions](#5-supabase-edge-functions)
6. [フードコート専用システム（marugoS）](#6-フードコート専用システムmarugos)
7. [LINE Webhook フロー](#7-line-webhook-フロー)
8. [フロントエンド共通仕様](#8-フロントエンド共通仕様)
9. [デプロイ手順](#9-デプロイ手順)
10. [ローカル開発](#10-ローカル開発)
11. [ドキュメント索引](#11-ドキュメント索引)

---

## 1. システム概要

マルゴグループ（飲食店チェーン）向けの **LINE 連携型 店舗管理プラットフォーム** です。

### 主な機能

| 機能カテゴリ | 概要 |
|---|---|
| **LINE レシート解析** | スタッフが撮影したレジ精算書をAIが自動解析し、売上・客数・予算達成率をLINEに返信 |
| **売上分析ダッシュボード** | 全店舗の日次・月次売上、前年比、予算比をブラウザで閲覧 |
| **フードコート AI 分析** | MARUGO S（東京ドーム）専用。来客予測・施策効果・AI経営アドバイスを自動生成 |
| **フードコート日報** | MARUGO S スタッフが現場の施策・出来事を記録する日報入力システム |
| **AI 学習進化トラッキング** | 事前予測のWAPE/MAE・5方式比較・参考再計算を分離表示 |
| **予約表** | Gmail 予約メールを自動取り込み、来客履歴と紐付けてブラウザで管理 |
| **メディア閲覧** | LINE で受け取った画像・動画をブラウザで閲覧・管理 |
| **会話検索** | 全 LINE グループの会話をキーワード全文検索 |
| **口コミ・競合分析** | Google マップ・競合店の口コミをAIが自動収集・要約 |
| **AI 使用料管理** | Groq / Gemini / Claude の API 使用量・コストを一元管理 |
| **小口現金管理** | 経費レシートをLINEに送るだけで自動記帳 |

---

## 2. 画面一覧（全ページ）

| ページ名 | URL | 認証 | 説明 |
|---|---|---|---|
| **管理コンソール** | `/index.html` | ✅ 要 | 全機能の起点。ルーム設定・権限管理・店舗設定 |
| **売上分析** | `/analytics.html` | ✅ 要 | 全店舗・月別・日次の売上ダッシュボード |
| **メディア閲覧** | `/media.html` | ✅ 要 | LINE 受信画像・動画のギャラリー |
| **会話検索** | `/message-search.html` | ✅ 要 | LINE グループ会話の全文検索 |
| **予約表** | `/reservation.html` | ✅ 要 | 予約カレンダー・来店履歴管理 |
| **口コミ・競合** | `/reviews.html` | ✅ 要 | Google 口コミ分析・競合店比較 |
| **AI 使用料** | `/ai-usage.html` | ✅ 要 | AI API コスト・使用量ダッシュボード |
| **システムマップ** | `/system-map.html` | ✅ 要 | Graphifyコード/SQL構成、本番・業務AI・開発知識循環 |
| **小口現金** | `/petty_cash.html` | ✅ 要 | 経費仕訳・小口現金帳 |
| **フードコート分析** | `/foodcourt.html` | ✅ 要 | MARUGO S 専用 来客予測・売上分析・施策提言 |
| **AI学習 進化** | `/foodcourt-evolution.html` | ✅ 要 | MARUGO S 専用 事前予測の精度・5方式比較 |
| **フードコート日報** | `/foodcourt-report.html` | ✅ 要 | MARUGO S 専用 現場日報の入力・閲覧 |

### 認証フロー

1. `index.html`（接続設定）で管理トークン（`lrst_xxxx`）を入力しログイン
2. セッションは `auth-session.js` が `sessionStorage` + `localStorage`（スコープ別）に保存
3. 同一ドメイン・同一パス配下のページ間でセッションは自動共有される
4. LINE リンクからのアクセスは `?lt=lrlt_xxxx`（ワンタイムログインチケット）で自動ログイン

---

## 3. アーキテクチャ

```
┌─────────────────────────────────────────────────┐
│         GitHub Pages（静的配信）                  │
│  HTML + CSS + JS（認証・UI）                     │
│  https://marugo-s.github.io/line_report/         │
└──────────────────┬──────────────────────────────┘
                   │ HTTPS（API呼び出し）
┌──────────────────▼──────────────────────────────┐
│     Supabase (hocbn)                             │
│  ┌────────────────┐  ┌────────────────────────┐  │
│  │  Edge Functions│  │      Database          │  │
│  │  ・line-webhook│  │  ・line_receipt__*     │  │
│  │  ・admin-api   │  │  ・line_webhook_raw__* │  │
│  │  ・各種 cron   │  │  ・foodcourt_*         │  │
│  └────────┬───────┘  │  ・reservation_*       │  │
│           │          │  ・admin_dashboard_*   │  │
│  ┌────────▼───────┐  └────────────────────────┘  │
│  │ AI 外部API連携  │                              │
│  │ ・Groq (主力)  │                              │
│  │ ・Gemini       │                              │
│  │ ・Claude       │                              │
│  └────────────────┘                              │
└─────────────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│         LINE Messaging API                       │
│  グループチャット / トークルームでの              │
│  レシート送信・会話・返信                         │
└─────────────────────────────────────────────────┘
```

### 設定の単一ソース

`public/pages-config.js` がフロントエンド全体で使う URL・店舗情報を一元管理します。

```javascript
PROJECT_URL = 'https://hocbnifuactbvmyjraxy.supabase.co'  // 全 API の向き先
ADMIN_SURFACE = 'line_report'                               // 認証面識別子
```

### Graphify × Obsidian × AI 開発知識環境

- `public/system-map.html`: 既存管理セッションを`POST /auth/verify`で確認してからマップを表示（公開URLは`/system-map.html`）。
- `public/system-map/graph.html`: Graphifyによる自作コード・SQL migrationの構造図。
- `public/system-map/environment.html`: 本番・業務AI・AI開発知識循環の3層環境図。
- `knowledge/system-architecture.json`: 環境図の構造化された正本。
- Obsidian `アプリ知識/10_アプリ別/LINE Report/`:
  - `70_AI作業環境`: AI入口、環境図、チェックリスト、Graphify/Obsidianブリッジ
  - `80_リポジトリ文書`: README/docsの自動ミラー
  - `90_Graphify`: コード・SQLノートとCanvas

標準フロー:

```bash
npm run knowledge:search -- "<依頼・症状・機能名>"
npm run knowledge:check
graphify query "<コード・SQL上の質問>"
npm run knowledge:update
```

Graphifyは`tree-sitter-sql`を使ってmigrationを解析します。`vendor`、`node_modules`、生成物、バックアップ、秘密設定は`.graphifyignore`で除外します。

---

## 4. 認証・セキュリティ

### トークンの種類

| 種類 | プレフィックス | 有効期限 | 用途 |
|---|---|---|---|
| **ログインリンクトークン（lt）** | `lrlt_` | 24時間・1回限り | LINE リンクでの自動ログイン用 |
| **セッショントークン（st）** | `lrst_` | 3日間 | ブラウザが保持するセッション |
| **管理トークン** | なし（生値） | 無期限 | `ADMIN_DASHBOARD_TOKEN` 環境変数の値 |

### ストレージ方針（`auth-session.js`）

- 生の管理トークンは永続化しない（初回読込時に自動削除）
- セッショントークンは `sessionStorage` + スコープ別 `localStorage` に保存
- スコープ = `origin + ディレクトリパス` のハッシュ → 同一アプリ配下でのみ共有

### 店舗スコープ（marugoS 等）

LINE リンクから開いた画面はセッション作成時に `store_partition_key` がメタデータに付与され、**その店舗のデータのみ**閲覧・操作できる。

---

## 5. Supabase Edge Functions

### 常駐 Function 一覧

| Function 名 | トリガー | 役割 |
|---|---|---|
| `line-webhook` | LINE Webhook（店舗別） | レシート解析・会話応答・予約受付の全ハンドリング |
| `line-admin-webhook` | LINE Webhook（@392hdime 管理Bot） | 新規ユーザー・ルームの承認専用 |
| `admin-api` | HTTPS リクエスト | 全管理画面の API バックエンド |
| `admin-line-test-push` | 手動 / テスト | LINE へのテスト Push 送信 |

### Cron Function 一覧

| Function 名 | 実行時刻（JST） | 役割 |
|---|---|---|
| `foodcourt-forecast-cron` | 毎朝 05:00 | 来客予測モデルの学習・更新（marugoS 専用） |
| `gmail-alert-cron` | 定期 | Gmail 予約メール取込 → LINE 通知 |
| `receipt-midreport-cron` | 定期 | 月中の売上速報レポートを LINE に送信 |
| `receipt-sheets-sync-cron` | 定期 | Supabase ↔ Google スプレッドシート 同期 |
| `reservation-today-cron` | 毎朝 | 当日予約を LINE に通知 |
| `review-alert-cron` | 定期 | 新着口コミを検出して LINE アラート |
| `room-messages-retention-cron` | 定期 | 古いメッセージの自動削除 |
| `tokyo-dome-events-cron` | 定期 | 東京ドームイベント情報を自動取得・更新 |
| `tokyo-dome-weekly-cron` | 毎週 | 翌週のドームイベントスケジュールを LINE 配信 |
| `weather-daily-cron` | 毎日 | 気象データを取得・DB に保存 |
| `pv-japan-alert-cron` | 定期 | PV ジャパン関連アラート |

### Edge Secrets（hocbn に設定が必要な環境変数）

```
GROQ_API_KEY
GEMINI_API_KEY
CLAUDE_API_KEY（Anthropic）
LINE_CHANNEL_SECRET__{STORE_KEY}  例: LINE_CHANNEL_SECRET__MARUGO_S
LINE_CHANNEL_ACCESS_TOKEN__{STORE_KEY}
ADMIN_DASHBOARD_TOKEN
GMAIL_CLIENT_ID
GMAIL_CLIENT_SECRET
GMAIL_REFRESH_TOKEN
GMAIL_ALERT_ENABLED
```

---

## 6. フードコート専用システム（marugoS）

MARUGO S（東京ドーム内フードホール「FOOD STADIUM TOKYO」）専用の高度な分析基盤です。

### 6-1. 来客予測モデル（ループ①）

2026-09-10に `forecast-audit-v1` を本番反映しました。毎朝05:00 JST、発行日より前の完了実績を用いて5方式×15日＝75予測を計算し、発行時点の入力と一緒に改変不可の台帳へ保存します。

比較するのは安全補正乗算（`mult-factor-v4-safe`）、直近4回同曜日（`weekday-4-v1`）、類似日（`similar-days-v1`）、客数・売上別の正則化回帰（`ridge-direct-v1`）、3候補の等重み平均（`ensemble-v1`）。初期採用は安全補正乗算です。

主評価は「本番・事前予測 / 直近28日 / 1日前」のWAPE・MAE・偏り。採用切替は月曜のみで、共通21日以上、客数・売上とも5%超のMAE改善、前後半の改善、同曜日基準との比較、採用後28日の冷却期間を設けます。バックテストだけでは切り替えません。

仕様・例外・本番検証証跡は [FOODCOURT-FORECAST-AUDIT.md](./docs/FOODCOURT-FORECAST-AUDIT.md) を参照してください。

### 6-2. AI 品質評価ループ（ループ②）

5エージェントAI が生成した回答を「第6の評価AI」が5軸で採点し、不合格なら再生成します。

```
専門AI × 3（来客分析 / 気象 / 施策提言）
  ↓
反証AI（矛盾・過信を指摘）
  ↓
統合AI⑤（総合回答を生成）
  ↓
評価AI⑥（正確性・論理性・専門性・実用性・根拠 の5軸で採点）
  合格基準: 総合90点以上 / 各項目80点以上
  ↓ 不合格なら
改善点だけを統合AI に渡して再生成（最大N回）
  ↓ 合格した回答を返す
```

### 6-3. AI 学習進化ページ（foodcourt-evolution.html）

- 概要: 5方式のWAPE/MAE、偏り、同曜日比、条件別の評価母数と当日〜14日先の予測。
- 評価: 本番の事前予測と参考再計算を分離。期間14/28/56日・先行日数0/1/7/14日を選択。
- 未評価は「蓄積中」や空欄で表示し、誤差ゼロ・最高精度とは扱わない。予測幅は経験的80%で保証値ではない。
- 学習曲線・全記録: 参考再計算の履歴。方式・評価バージョンが切り替わる箇所は比較不可。
- 判定基準・自己進化: AI回答/RAG側の品質設定。数値予測の採用条件とは独立し、スライダーで数値予測の方式は変更しない。

### 6-4. フードコート日報（foodcourt-report.html）

MARUGO S スタッフが毎日記録する現場日報システム。

**記録できる内容:**

| フィールド | 説明 |
|---|---|
| 担当者名 | 当日の責任者 |
| 施策（actions） | カテゴリ付き自由記述（販促 / メニュー / 接客 / 環境 / スタッフ / その他） |
| 客数への影響 | 担当者評価（良い / 悪い / 変わらず） |
| 売上への影響 | 担当者評価 |
| 天気・気候メモ | 体感・特記事項 |
| イベント・特記事項 | 当日の特別事項 |
| 動員数 | 東京ドームの動員を背景分析へ利用。事後の実測値を現行5方式の数値予測には使用しない |
| 課題・問題点 | 改善が必要な事項 |
| 翌日への申し送り | 引継ぎ事項 |
| 自由メモ | その他 |

**レシートカードからのアクセス（2026-07-09 実装）:**  
MARUGO S のレシート解析カードに「📋 日報を記入する」ボタンを追加。  
タップするとワンタイムログインチケット（`?lt=`）付き URL で自動ログインして日報ページへ遷移。

### 6-5. 主な DB テーブル（marugoS 関連）

| テーブル名 | 内容 |
|---|---|
| `line_receipt__marugoS` | レシート解析結果（売上・客数・予算比較） |
| `foodcourt_daily_facts` | 来客予測の学習データ（気象・イベント・実績客数） |
| `foodcourt_base_daily` | 基準店の確定実績（予測の教師データ） |
| `foodcourt_forecast_issuances` / `foodcourt_forecast_snapshots` | 発行情報・5方式×15日分の改変不可予測 |
| `forecast_predictions` | 当日〜14日先の採用方式の最新表示キャッシュ |
| `foodcourt_forecast_factors` | 係数・モデル選択結果・バックテスト誤差 |
| `foodcourt_forecast_history` | 参考再計算の履歴（本番精度の正本は発行台帳） |
| `foodcourt_daily_logs` | 日報データ（施策・評価・申し送り） |
| `tokyo_dome_events` | 東京ドームイベント一覧（動員予測値含む） |

---

## 7. LINE Webhook フロー

### レシート解析フロー

```
スタッフが LINE グループに精算書画像を送信
  ↓
line-webhook が受信
  ↓
Azure Foundry（GPT-5.4 nano）で画像解析
  「解析中…」プッシュ通知を送信
  ↓
Azure の失敗時だけ Gemini、さらに失敗時だけ Claude へ退避
  ↓
売上・客数・予算データを DB に保存
  ↓
Flex メッセージで結果返信（店名・日付・消費税・総売上・客数・客単価・月間集計・予算比・前年比）
  ↓
フッターボタン:
  「この結果を修正」（修正コマンドをLINEに送信）
  「この解析結果を削除」（削除コマンドをLINEに送信）
  「売上推移を見る」（analytics.html へのワンタイムログインリンク）
  「📋 日報を記入する」※marugoS のみ（foodcourt-report.html へのワンタイムログインリンク）
```

### AI使用モデルの使い分け

| 店舗・用途 | 使用モデル |
|---|---|
| 通常レシート解析（全店舗） | Azure Foundry（GPT-5.4 nano） |
| Azure障害時の退避 | Gemini、次に Claude Haiku |
| 経費レシート再解析 | Azure Foundry（GPT-5.4 nano） |
| AI 品質評価ループ | Claude / Gemini |

---

## 8. フロントエンド共通仕様

### 共通 JS ファイル

| ファイル | 役割 |
|---|---|
| `public/pages-config.js` | Supabase URL・店舗名マップ・API パス生成 |
| `public/auth-session.js` | ログイン・セッション管理・ワンタイムトークン交換 |
| `public/app-theme.js` | ダーク / ライトテーマ切替 |
| `public/menu-logout.js` | サイドバーのログアウト処理 |
| `public/site-cache.js` | キャッシュ制御 |

### サイドバーナビゲーション

全ページ共通の左サイドバー（PC）/ ハンバーガーメニュー（スマホ）を実装。  
LINE 経由アクセス（`?from=line`）時は一部メニューを自動非表示。

### 認証バッジ

ヘッダー右上に接続状態を表示：
- 🟢 `接続済み` — セッション有効
- ⚫ `未接続` — 未ログイン → ログインフォームを表示

### localStorage の用途

| キー | 用途 |
|---|---|
| `fc_theme` / `fc_report_theme` | テーマ設定（ダーク/ライト）の記憶 |
| `fc_passing_score` | AI評価合格ラインの即時反映用キャッシュ |
| `line_summary_admin_session__scope__{hash}` | スコープ別セッショントークン |

---

## 9. デプロイ手順

### フロントエンド（GitHub Pages）

```bash
git add .
git commit -m "変更内容の説明"
git push origin main
# → GitHub Actions が自動で Pages に配信（約1〜2分）
```

### Edge Functions（Supabase）

`supabase/functions/**` に変更をプッシュすると `.github/workflows/deploy-edge-functions.yml` が自動実行されます。

```bash
# 手動デプロイ（supabase CLI が必要な場合）
supabase link --project-ref hocbnifuactbvmyjraxy
supabase functions deploy line-webhook --project-ref hocbnifuactbvmyjraxy --use-api
supabase functions deploy admin-api --project-ref hocbnifuactbvmyjraxy --use-api
```

### DB マイグレーション

```bash
supabase db push --project-ref hocbnifuactbvmyjraxy
```

---

## 10. ローカル開発

リポジトリの配置規約は [REPOSITORY_STRUCTURE.md](./docs/REPOSITORY_STRUCTURE.md) を参照してください。GitHub Pagesの公開HTML/JSは`public/`へ集約し、Actionsで従来URLのまま配信します。DB・バックアップ等の端末ローカル状態は`.local/`へ集約します。

```bash
# ローカルサーバー起動（ポート 8765）
./scripts/local-line-report-pages.sh

# アクセス URL
http://127.0.0.1:8765/line_report/

# 各ページのローカル URL
http://127.0.0.1:8765/line_report/index.html              # 管理コンソール
http://127.0.0.1:8765/line_report/analytics.html           # 売上分析
http://127.0.0.1:8765/line_report/system-map.html          # システムマップ
http://127.0.0.1:8765/line_report/foodcourt.html           # フードコート分析
http://127.0.0.1:8765/line_report/foodcourt-evolution.html # AI学習 進化
http://127.0.0.1:8765/line_report/foodcourt-report.html    # フードコート日報
```

> ローカルでも API は本番 Supabase（hocbn）に接続します。

### テスト用ダミーデータ

```bash
# ダミー売上・予算を投入
./scripts/dummy-sales-seed.sh seed-all

# ダミーデータを削除
./scripts/dummy-sales-seed.sh delete-all
```

---

## 11. ドキュメント索引

| ドキュメント | 内容 |
|---|---|
| [DOCS-INDEX.md](./docs/DOCS-INDEX.md) | 全ドキュメントの索引・用語集 |
| [CHANGELOG-2026-05.md](./docs/CHANGELOG-2026-05.md) | 2026年5月の機能追加・変更履歴 |
| [フードコートAIループシステム全体解説.md](./docs/フードコートAIループシステム全体解説.md) | 来客予測ループ・品質評価ループの全体設計 |
| [フードコートAI分析システム_設計解説.md](./docs/フードコートAI分析システム_設計解説.md) | 5エージェントAI構成の設計書 |
| [FOODCOURT-FORECAST-AUDIT.md](./docs/FOODCOURT-FORECAST-AUDIT.md) | 数値予測・評価・採用条件・本番検証の現行正本 |
| [フードコート来客予測モデル.md](./docs/フードコート来客予測モデル.md) | 旧方式との差分と現行仕様への入口 |
| [フードコート学習システム構造.md](./docs/フードコート学習システム構造.md) | データフロー・学習の仕組み |
| [フードコート日報システム.md](./docs/フードコート日報システム.md) | 日報システムの設計・APIエンドポイント |
| [フードコート売上分析_設計書.md](./docs/フードコート売上分析_設計書.md) | 売上分析機能の設計 |
| [フードコート競合店プロファイル.md](./docs/フードコート競合店プロファイル.md) | 競合分析データの仕様 |
| [AI_LOOP_ENGINEERING_DESIGN.md](./docs/AI_LOOP_ENGINEERING_DESIGN.md) | 品質評価ループの工学設計書・実装ログ |
| [AI_KNOWLEDGE_SYSTEM.md](./docs/AI_KNOWLEDGE_SYSTEM.md) | Graphify・Obsidian・AI開発知識循環の構成・更新・検査 |
| [LINE-RECEIPT-ANALYSIS.md](./docs/LINE-RECEIPT-ANALYSIS.md) | レシート解析の仕様・プロンプト設計 |
| [LINE-SEARCH-PRESENTATION.md](./docs/LINE-SEARCH-PRESENTATION.md) | LINE 会話検索の設計 |
| [LINE-GROUP-BOT-IMPORTANT.md](./docs/LINE-GROUP-BOT-IMPORTANT.md) | LINE グループBot の注意事項 |
| [LINE-USER-APPROVAL-SECURITY.md](./docs/LINE-USER-APPROVAL-SECURITY.md) | ユーザー承認・セキュリティ設計 |
| [ROOM-LINKING-GUIDE.md](./docs/ROOM-LINKING-GUIDE.md) | ルーム自動連携の仕組みとリスク |
| [ROOM-PERMISSION-DETAIL-GUIDE.md](./docs/ROOM-PERMISSION-DETAIL-GUIDE.md) | ルーム権限の優先順位・詳細仕様 |
| [ROOM-SELF-CONFIG-GUIDE.md](./docs/ROOM-SELF-CONFIG-GUIDE.md) | スタッフによるルーム設定変更 |
| [ROOM-PERMISSION-TEST-CHECKLIST.md](./docs/ROOM-PERMISSION-TEST-CHECKLIST.md) | 権限設定のテストチェックリスト |
| [RESERVATION-GMAIL-GUIDE.md](./docs/RESERVATION-GMAIL-GUIDE.md) | Gmail 予約連携の設定・運用 |
| [SECURITY.md](./docs/SECURITY.md) | セキュリティポリシー |
| [README-PAGES.md](./docs/README-PAGES.md) | Pages配信の技術詳細（旧メイン README） |
| [操作マニュアル.md](./docs/操作マニュアル.md) | スタッフ向け操作手順 |
| [小口経費の登録手順.md](./docs/小口経費の登録手順.md) | 経費レシートの登録方法 |
| [スプレッドシート売上バックアップ-GAS.md](./docs/スプレッドシート売上バックアップ-GAS.md) | Google スプレッドシート連携（GAS）の設定 |
| [店舗運用修正記録.md](./docs/店舗運用修正記録.md) | 店舗ごとの設定変更・運用メモ |

---

## 変更履歴（直近）

| 日付 | 変更内容 |
|---|---|
| 2026-09-10 | フードコート予測を5方式の事前台帳・WAPE/MAE・週次採用判定へ移行。本番反映済み。現行説明を更新し、旧GLM仕様を履歴へ分離 |
| 2026-07-09 | フードコート日報ページ（`foodcourt-report.html`）の認証バグ修正（themeBtn ID 不一致によりログイン済みでも「未接続」になる問題） |
| 2026-07-09 | レシート解析カードに「📋 日報を記入する」ボタンを追加（marugoS 専用・ワンタイムログインリンク付き） |
| 2026-07-08 | AI 評価合格ラインのスライダー設定を Supabase DB に保存するよう変更（複数デバイス間で共有可能） |
| 2026-07-08 | フードコート日報システム（`foodcourt-report.html`）を新設 |
| 2026-07-07 | AI 学習進化ページに「再提出＆再評価中」バッジと合格ライン設定スライダーを追加 |
| 2026-07-07 | 来客予測ループ（ループ①）・AI品質評価ループ（ループ②）を本番デプロイ |
| 2026-07-06 | フードコート日報ページにナビゲーションバーを追加 |
