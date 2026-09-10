# ドキュメント索引（line_report）

本リポジトリの Markdown 一覧と、**用語の定義**・**読む順番**です。内容の矛盾を防ぐため、他ドキュメントもこの用語に揃えています。

**本番:** Supabase `hocbnifuactbvmyjraxy`（hocbn）／GitHub Pages `https://marugo-s.github.io/line_report/`

---

## 用語集（混同しやすいもの）

| 用語 | 意味 | 承認が要るか | 主なフラグ／設定 |
|------|------|--------------|------------------|
| **ルーム連携（自動連携）** | Webhook 受信でルームを店舗の管理対象として DB に登録する | **管理者承認は不要**（既定 ON） | `RECEIPT_ROOM_AUTO_LINK`、`room_summary_settings` への upsert |
| **ルーム承認（Bot 利用許可）** | そのルームでレシート・検索等の **Bot 機能を動かすか** | **要る**（新規ルームは待ち） | `room_summary_settings.bot_access_approved`、管理 Bot @392hdime |
| **ユーザー許可** | 1対1 友だちが Bot 機能を使えるか | **要る**（新規友だちは待ち） | `line_user_permissions.is_active`、管理 Bot |
| **ルーム横断（検索）** | 1対1 から、複数の LINE ルーム（`C…`/`R…`）のデータをまとめて検索 | — | `search_line_room_messages` で `p_room_id = null` |
| **店舗内横断（売上検索）** | 同一店舗 Webhook の `receipt_table` 内の全ルームのレシート | — | **Webhook はまたがない** |
| **Webhook 横断** | **しない**（受信・記録・売上検索は常にその店舗の Webhook に紐づく） | — | `line-webhook/{store_partition_key}` |

**重要:** ルームは **自動連携されても**、**新規**の招待ルームは `bot_access_approved = false` のまま機能が止まります。連携と承認は **別レイヤ** です（[LINE-USER-APPROVAL-SECURITY.md](./LINE-USER-APPROVAL-SECURITY.md) §6.2）。

---

## ドキュメント一覧

| ファイル | 読者 | 内容 |
|----------|------|------|
| [README-PAGES.md](./README-PAGES.md) | 運用・開発 | **入口** — Pages URL、hocbn、デプロイ、関連ガイドへのリンク |
| [操作マニュアル.md](./操作マニュアル.md) | 運用（店舗スタッフ） | LINE・管理画面のエンドユーザー操作手順（売上/レシート/予約/予算/小口現金）＋症状別トラブルシュート |
| [店舗運用修正記録.md](./店舗運用修正記録.md) | 開発・運用 | 不具合の原因→対策→反映→検証の運用ログ（newest-first・現役で随時追記） |
| [CHANGELOG-2026-05.md](./CHANGELOG-2026-05.md) | 開発 | 2026年5月の変更履歴（技術詳細・マイグレーション） |
| [LINE-SEARCH-PRESENTATION.md](./LINE-SEARCH-PRESENTATION.md) | 説明・プレゼン | LINE 検索（記録と検索、グループ／1対1、売上と会話の違い） |
| [SECURITY.md](./SECURITY.md) | 運用・開発 | **セキュリティ中核** — 不変条件・DB層防御・認証認可・Webhook/cron・監査結果・新規追加チェックリスト・検証クエリ |
| [SUPABASE-OWNERSHIP.md](./SUPABASE-OWNERSHIP.md) | 開発・運用 | 同一Supabaseプロジェクト内のLINE Report所有Function・Journalテーブル・Storage・共有リスク境界 |
| [REPOSITORY_STRUCTURE.md](./REPOSITORY_STRUCTURE.md) | 開発・AI | ルート公開ファイルを残す理由、各ディレクトリの役割、`.local/`の配置ルール |
| [AI_KNOWLEDGE_SYSTEM.md](./AI_KNOWLEDGE_SYSTEM.md) | AI・開発 | Graphify（コード/SQL）・Obsidian（手書き/既存文書ミラー）・AI作業循環・環境図・更新/検査コマンド |
| [AI_CONTEXT.md](./AI_CONTEXT.md) | AI | `knowledge:update`で生成する短縮コンテキスト。作業開始時の情報源順位・必須フロー |
| [LINE-REPORT-JOURNAL-AI-MANUAL.md](./LINE-REPORT-JOURNAL-AI-MANUAL.md) | 運用・AI・開発 | **1対1 AIの統合資料＋コード監査表** — 12区分・44項目・検索コード・実装根拠付き。公開／Edge／共有／補助・レガシー／APIルートの全対応表も自動生成 |
| [M-TALK-COMPLETE-GUIDE.md](./M-TALK-COMPLETE-GUIDE.md) | 運用・開発・説明 | **M-talk統合版** — 概要／使い方／通知／権限／管理／セキュリティ／技術構成／トラブルシュートを1ファイルに。各領域の正本は CHAT-TALK-GUIDE・CHAT-ADMIN-PERMISSIONS・SECURITY |
| `public/mtalk-help.html` | 店舗スタッフ | **使い方だけ**の共有ページ。テーブル名・管理API・内部構造は載せない。本番 `/mtalk-help.html` |
| [CHAT-TALK-GUIDE.md](./CHAT-TALK-GUIDE.md) | 運用・開発 | **トーク（chat.html）** — 利用条件、発言種別（text/card/image）、予約通知の複製、画像の非公開バケット、検索、既読・リアクション・返信・メンション |
| [CHAT-ADMIN-PERMISSIONS.md](./CHAT-ADMIN-PERMISSIONS.md) | 運用・開発 | **M-talk専用管理** — ユーザー利用停止・論理削除、1対1／ルーム別の閲覧・送信・招待・管理権限、管理API、監査 |
| [LINE-USER-APPROVAL-SECURITY.md](./LINE-USER-APPROVAL-SECURITY.md) | 運用・説明 | 利用許可・ルーム承認・管理 Bot・管理画面連携 |
| [ROOM-SELF-CONFIG-GUIDE.md](./ROOM-SELF-CONFIG-GUIDE.md) | 運用・開発 | **ルーム・セルフ設定**（LINEワンパス＋ルーム個別パスワード）— フロー・データモデル・API・設定項目・運用・トラブルシュート |
| [LINE-GROUP-BOT-IMPORTANT.md](./LINE-GROUP-BOT-IMPORTANT.md) | **必読** | グループは Bot **1体のみ**（LINE 仕様）／退出の誤解 |
| [ROOM-LINKING-GUIDE.md](./ROOM-LINKING-GUIDE.md) | **必読** | ルーム **自動連携**（承認なし）のリスクと無効化 |
| [ROOM-PERMISSION-DETAIL-GUIDE.md](./ROOM-PERMISSION-DETAIL-GUIDE.md) | 運用・開発 | 管理画面の権限（全体／店舗／個別）、表示名 |
| [ROOM-PERMISSION-TEST-CHECKLIST.md](./ROOM-PERMISSION-TEST-CHECKLIST.md) | QA | 権限・Webhook 設定の動作確認 |
| [LINE-RECEIPT-ANALYSIS.md](./LINE-RECEIPT-ANALYSIS.md) | 運用・開発 | レシート OCR・店舗 Webhook・保存フロー |
| [JOURNAL-STORE-KNOWLEDGE.md](./JOURNAL-STORE-KNOWLEDGE.md) | 運用・開発 | Journal Report「資料」タブ — 施策・メニュー資料の登録とAI分析への注入（期間一致で必ず添付／数値の正本は確定集計） |
| [JOURNAL-KNOWLEDGE-MENU-PROMPT-BLOCKS.md](./JOURNAL-KNOWLEDGE-MENU-PROMPT-BLOCKS.md) | AI・開発 | 店舗資料メニュー画像の共通・種別・店舗専用プロンプト設計。小口レシートと同じ加算式ブロック構造、MARUGO S専用規約、品質ゲート |
| [JOURNAL-REPORT-FEATURES.md](./JOURNAL-REPORT-FEATURES.md) | 運用・開発・説明 | **Journal Report 機能の詳細正本** — タブ／取込／店舗情報／資料・LINE `#メモ`／AI分析・チャット／予測／履歴 |
| [HANDOFF-2026-09-01-JOURNAL-FOODCOURT-CLASSIFICATION.md](./HANDOFF-2026-09-01-JOURNAL-FOODCOURT-CLASSIFICATION.md) | AI・開発 | **2026-09-01の続き** — 商品分類拡張とマルゴエス Journal AI へのフードコート要約。全件投入禁止・店舗キー・検証・やり残し |
| [JOURNAL-AI-CHAT-RULES.md](./JOURNAL-AI-CHAT-RULES.md) | 運用・開発・AI | Journal Report AIチャットの決まりごと — 確定集計の追加原則、銘柄／商品コード下4桁、西暦誤認禁止、プロンプト規約、API |
| [RESERVATION-GMAIL-GUIDE.md](./RESERVATION-GMAIL-GUIDE.md) | 運用・開発 | Gmail 予約 → LINE（**会話検索とは別**） |
| [RESERVATION-AI-COVERAGE.md](./RESERVATION-AI-COVERAGE.md) | AI・運用 | 予約を加味した集客構造の利用可能範囲 — CAVACAVAは2026-07以降のみ、他店は未開始 |
| [スプレッドシート売上バックアップ-GAS.md](./スプレッドシート売上バックアップ-GAS.md) | 運用・開発 | 全店舗売上スプレッドシートの毎日バックアップ（GAS・6時同期後に日付名コピー）。コード＋トリガー手順＋確定構成 |
| [フードコートAI学習・自己進化システム_完全設計書.md](./フードコートAI学習・自己進化システム_完全設計書.md) | **説明・開発・運用** | **2026-07-16時点の正本** — データ収集、売上分析セグメント、予測モデル、複数AI、品質ループ、RAG・蒸留、必要データ量、完全自己進化までのロードマップ |
| [フードコートAI売上分析システム_総合解説.md](./フードコートAI売上分析システム_総合解説.md) | **説明・開発・運用** | **単独で読める統合版** — オーケストレーション、各AIの強み、統計の事前計算、Q&Aループ、学習・蒸留、日報データの重要性 |
| [フードコートAI分析システム_設計解説.md](./フードコートAI分析システム_設計解説.md) | 開発・運用 | フードコートの5エージェントAI分析、予測モデル1本化、統計拡張、品質評価ループ（§3-3）、日報Q&A組み込み（§3-4）、API使用料 |
| [フードコート日報システム.md](./フードコート日報システム.md) | 開発・運用 | 現場日報ページ（foodcourt-report.html）の設計 — DBテーブル・API・動員数自動連携・Q&A分析への組み込み |
| [フードコートAIループシステム全体解説.md](./フードコートAIループシステム全体解説.md) | 開発・運用 | **2つの自己改善ループの全体像** — 予測のモデル選択ループ（GLM vs 乗算・毎晩自動採用）＋AI回答の品質評価ループ（Q&A段階導入・surface別制御） |
| [AI_LOOP_ENGINEERING_DESIGN.md](./AI_LOOP_ENGINEERING_DESIGN.md) | 開発 | 品質評価ループの設計書・実装ログ（Phase 1〜3・DB設計・環境変数・受け入れ基準） |
| [フードコート学習システム構造.md](./フードコート学習システム構造.md) | 開発・運用 | 来客予測のデータフロー全体（収集→蓄積→特徴量→2モデル学習→自動選択→予測→再学習） |
| [FOODCOURT-FORECAST-AUDIT.md](./FOODCOURT-FORECAST-AUDIT.md) | 開発・運用 | **数値予測の現行正本** — 5方式・改変不可の事前予測台帳・先行日数別WAPE/MAE・週次採用条件 |
| [フードコート来客予測モデル.md](./フードコート来客予測モデル.md) | 開発 | 旧方式の設計履歴（現行はFOODCOURT-FORECAST-AUDIT） |
| [フードコート売上分析_設計書.md](./フードコート売上分析_設計書.md) | 開発 | 分析フレームワーク（要因分解・相関・異常値などのSTEP設計） |
| [フードコート競合店プロファイル.md](./フードコート競合店プロファイル.md) | 開発・運用 | FOOD STADIUM TOKYO 競合11店の業態プロファイル（AI分析の前提知識） |
| [README.md](../README.md) | — | **レガシー**（旧 LINE-WINE ローカルアプリ）。本番 LINE レポートは README-PAGES を参照 |
| [ocr-bridge/README.md](../ocr-bridge/README.md) | 開発 | OCR ブリッジ |
| [cloudflare-worker/README.md](../cloudflare-worker/README.md) | 開発 | Cloudflare Worker（Webhook 入口の代替） |

---

## おすすめの読む順番

1. [README-PAGES.md](./README-PAGES.md) — 本番 URL とデプロイ
2. [SECURITY.md](./SECURITY.md) — 認証/RLS/Webhook/cronの不変条件
3. [AI_KNOWLEDGE_SYSTEM.md](./AI_KNOWLEDGE_SYSTEM.md) — AI開発時の検索・Graphify・書き戻し
4. [LINE-GROUP-BOT-IMPORTANT.md](./LINE-GROUP-BOT-IMPORTANT.md) — グループに Bot を1体だけ
5. [ROOM-LINKING-GUIDE.md](./ROOM-LINKING-GUIDE.md) — 自動連携の注意
6. [LINE-USER-APPROVAL-SECURITY.md](./LINE-USER-APPROVAL-SECURITY.md) — 許可・承認
7. [LINE-SEARCH-PRESENTATION.md](./LINE-SEARCH-PRESENTATION.md) — 検索機能の説明
8. 必要に応じて [ROOM-PERMISSION-DETAIL-GUIDE.md](./ROOM-PERMISSION-DETAIL-GUIDE.md)、[LINE-RECEIPT-ANALYSIS.md](./LINE-RECEIPT-ANALYSIS.md)

---

## 仕様の単一ソース（コード）

| 領域 | 主なファイル |
|------|----------------|
| 店舗・Webhook URL | `public/pages-config.js` |
| LINE 検索 UI・待ち2分 | `supabase/functions/_shared/line_search_bot.ts` |
| 利用許可・管理 Bot | `supabase/functions/_shared/line_user_approval.ts` |
| ルーム自動連携 | `supabase/functions/_shared/auto_link_room.ts` |
| 店舗 Webhook 本体 | `supabase/functions/line-webhook/index.ts` |
| 管理 Bot Webhook | `supabase/functions/line-admin-webhook/index.ts` |
| Journal AIチャット規約 | [JOURNAL-AI-CHAT-RULES.md](./JOURNAL-AI-CHAT-RULES.md) / `public/jnm/jnl2txt.html` / `.cursor/rules/ai-enrichment-additive.mdc` |

---

## 横断チェック（2026-05-28 時点で統一済み）

| 項目 | 統一内容 |
|------|----------|
| 検索待ち TTL | **2分**（種別選択後、キーワード1通のみ非記録） |
| グループの検索 UI | 4種メニューなし。**売上案内 Flex ＋ 売上ボタン1つ** |
| 1対1の検索 UI | **4ボタン** Flex |
| グループ Bot 数 | LINE 仕様で **1体まで**（2体目は参加不可） |
| 新規ルーム | 自動連携されるが **`bot_access_approved=false` まで機能停止** |
| 本番 DB | **hocbn** のみ（Gmail も hocbn） |

---

*最終更新: 2026-08-24（M-TALK-COMPLETE-GUIDE.md を追加。2026-08-05: JOURNAL-AI-CHAT-RULES.md を追加。2026-07-26: Graphify・Obsidian・AI知識循環。2026-07-19: LINE-RECEIPT-ANALYSIS.md を現行ルーティングへ更新。）*
