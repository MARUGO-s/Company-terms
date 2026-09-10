# AI Knowledge Context

Generated from `knowledge/system-architecture.json` and the current Graphify graph.

## Project
- Name: LINE Report
- Working directory: `/Users/yoshito/Library/CloudStorage/Dropbox/web/line_report-main`
- Repository: MARUGO-s/line_report
- Production: https://marugo-s.github.io/line_report/
- Supabase: hocbnifuactbvmyjraxy
- Graphify: 5446 nodes / 11954 relationships / 526 communities
- SQL coverage: 302 files / 892 nodes
- Generated: 2026-09-10T12:09:03.793Z

## Required workflow
1. Read `AGENTS.md`, `PROJECT_PROGRESS.md`, `AI_HANDOFF.md`, `docs/AI_KNOWLEDGE_SYSTEM.md`, and Obsidian `70_AI作業環境/00_AI_START_HERE.md`.
2. Search durable knowledge with `npm run knowledge:search -- "<task or topic>"`.
3. Run `npm run knowledge:check`.
4. Investigate with Graphify first: `graphify query`, `graphify path`, `graphify explain`.
5. Read only required source ranges. Directly inspect inline HTML/JS, SECURITY.md, runtime service boundaries, and live Supabase/GitHub/LINE state when relevant.
6. Run the relevant static checks and test groups; verify UI locally and Pages/API after deployment.
7. Write rationale/results to the relevant manual Obsidian note, repository docs, and `PROJECT_PROGRESS.md`.
8. After structural changes run `npm run knowledge:update`, then `npm run knowledge:check`.

## Source priority
| Rank | Source | Use | Warning |
|---:|---|---|---|
| 1 | 本番GitHub Pages / Supabase hocbn / GitHub Actions / LINE・AI API | 現在の配信・DB・Edge Function・外部サービス状態 | 変化するため対象作業ごとに再確認 |
| 2 | Git作業コピー | HTML/JS、Edge Functions、SQL migration、テストの正本 | 未commit差分と既存運用を保護 |
| 3 | Graphify（SQL parser有効） | コード・SQLの場所、関係、経路の索引 | インラインHTML/JSや外部サービス境界は直接確認 |
| 4 | Obsidian手書き知識 + 80_リポジトリ文書 | 設計意図、セキュリティ不変条件、運用、障害、AI設計 | 現在状態は本番・Gitで検証 |
| 5 | 会話コンテキスト | 現在の依頼と一時的な作業状態 | 永続記憶にせず必要事項を書き戻す |

## Security boundary
Never place env files, private keys, service-role keys, LINE tokens, AI keys, Gmail credentials, customer data, message bodies, receipts, or uploaded media into Graphify, Obsidian, Git, screenshots, or chat.
