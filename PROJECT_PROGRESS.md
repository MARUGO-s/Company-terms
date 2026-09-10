# LINE Report Project Progress

### 2026-09-10 - 予測システムの本番確認と関連Markdownの現行化

- 本番反映: [PR #225](https://github.com/MARUGO-s/line_report/pull/225) をマージ。main `f9b3a809620ed12e9914e8f4691fb0162e43749d` の [Edge](https://github.com/MARUGO-s/line_report/actions/runs/34475509493) は21:18:30 JST、[Pages](https://github.com/MARUGO-s/line_report/actions/runs/34475509514) は21:18:48 JSTに成功。
- 本番確認: migration・毎朝05:00 cron・dry-run・初回1発行/75予測・再実行不変・認証拒否・台帳権限・ログイン済みUIを確認。夜間の初回は朝の評価対象外で、本番評価0日は蓄積開始として正常。長期精度の改善を実証したという意味ではない。
- 文書: README、学習構造、モデル/ループ解説、総合/完全/内部/分析設計、索引を5方式・事前台帳・WAPE/MAE・週次安全判定へ更新。旧GLMの数式を履歴専用ファイルへ分離し、過去のDB件数を現在値と読まないよう確認日を明記。Journal予測・生成AI品質との区別も追記。
- 採用条件の表記修正: コードの厳密不等号に合わせ「5%以上」ではなく「5%を超える改善」とする。
- 文書検証: 更新Markdown内の相対リンク494件を確認しリンク切れ0件。旧配置のリンク104か所を修正。`help:update` / `knowledge:update` で統合資料・構造図・Obsidianを同期し、`test:ci` / `test:knowledge` / `check` / `knowledge:check` / `git diff --check` が成功。予測ロジックとDBは変更せず、画面と実行時ヘルプの閾値説明だけを一致させた。
- 正本: [FOODCOURT-FORECAST-AUDIT.md](./docs/FOODCOURT-FORECAST-AUDIT.md)。以下の日付付き記録は履歴で、矛盾する数値予測仕様は現行正本を優先する。

### 2026-09-10 - 来客・売上予測を事前予測台帳と5方式比較へ移行

- 原因切分け: 学習画面の大きな上下は、採用モデルの切替と全履歴MAPE表示を含み、台風の因果とは断定できない。都市対抗野球のプロ野球誤分類も確認した。
- 実装: 5方式を同時発行し、発行時点の特徴量と予測を改変不可の台帳へ保存。再計算と本番評価を分離し、WAPE/MAE/偏り・先行日数・固定28日・同曜日基準で比較する。週次昇格・共通日数・前後半・冷却期間を導入。GLMの日々の自動切替と過去予測の上書きを廃止。
- 保護: service_role専用の固定店舗RPCで台帳・予測・係数・履歴を原子的に発行。同日再実行は最初の成功を保持。朝以外の手動発行は本番評価から除外。ゼロ実績と未入力、天候不明を区別。
- UI/AI: 概要に5方式・予測幅・将来予測を追加。学習曲線を参考と明示、モデル切替の「改善/悪化」を禁止、固定サンプル数値と信頼度星を撤去。統合ヘルプを現行仕様へ同期。
- 検証: 数値・時系列・候補選択の単体テスト、PostgreSQL実SQLで原子性/権限/改変拒否/再実行をテスト。模擬データの実ブラウザでPC/390px、評価選択、180%MAPE、未認証非表示を確認。予測精度の改善保証はしない。
- 正本: `docs/FOODCOURT-FORECAST-AUDIT.md`。生の業務実績データはリポジトリへ保存しない。
- 検証結果: `npm run test:ci` は655件全通過、`npm run check` / `knowledge:check` / `git diff --check` と予測cronの `deno check` が通過。管理API全体の型エラーは変更前後とも194件で、新規差分なし（全体の型検査合格とは扱わない）。

### 2026-09-04 - 電子ジャーナル画面を「どちらかに保存すれば両方に出る」全店舗表示へ

- Request: 電子ジャーナル（POS取込）ページにCAVACAVAしか出ないが、Journal Report側にはマルゴエスのジャーナルも保存済み。データを一本化し、どちらへ格納しても相手側へ表示されるようにする。
- Finding: データ側はすでに一本化されていた。`pos_journal_files` にマルゴエス（店舗コード1022）の原本260件、`saved_reports` に同店舗19件が `marugos` キーで保存済みで、共有参照・自動レポート作成・Journal Reportの月復元はいずれも店舗キーで動いていた。単一店舗だったのは画面の店舗プルダウン（CAVACAVA1件で固定・選択不可）だけだった。
- API: `GET /pos-journals/stores` を追加。`POS_JOURNAL_STORE_CODE_MAP` と `pos_journal_store_codes` に加え、両テーブルの `store_partition_key` を loose index scan で走査して候補を集め、LZH原本と保存済みレポートの**いずれかに件数がある店舗だけ**を店舗コード・件数・データのある年月付きで返す。行数ではなく店舗数に比例する問い合わせにして、原本が増えても一覧が重くならないようにした。
- UI: `pos-journal.html` の店舗を可変にし、店名・店舗コード・説明文・アップロード案内を選択店舗に追従させた。店舗切替時は選択月にデータが無ければその店舗の最新月へ移動し、空の月ではデータのある月を案内する。2026-06のCAVACAVA静的スナップショットはCAVACAVA・同月だけに限定した。
- Multi-store fixes: 店舗名・店舗コードの解決が `bistrocavacava` / `"1015"` 固定だった3か所を店舗キー逆引き（`resolvePosJournalStoreByKey`）へ置き換え、原本が無い月でも正しい店名とコードを表示する。AI売上分析・AI質問の「Bistro CAVACAVAのみ対応」拒否を外し、レジ店舗コードが登録済みの店舗を対象にした。
- Security: 一覧APIは店舗スコープのセッションでは自店舗だけを返し、`pos_journal_store_codes` の照合はLIKEワイルドカードを含むキーを弾く。店舗別ログインの許可パス扱いは既存 `/pos-journals` と同じにした。
- Verification: 回帰テストへ多店舗表示・スコープ・静的スナップショット限定の7件を追加（node系19/19）。一覧ロジックは実DBで確認した行の形を再現したフェイクPostgRESTで実行し、片側だけに保存された店舗が一覧へ出ること、スコープ外が出ないことを確認。実ブラウザで店舗切替時の表示・保存・切り戻しをJSエラー無しで確認した。

### 2026-09-02 - M-talkからメニュー画像を確認付きでJournal資料へ登録

- Request: M-talkの入力欄へ画像をドロップし、メニューならJournal Report「資料」タブと同等の精度で商品名・説明・価格を抽出して返信し、カードボタンで登録／見送りを選べるようにする。
- Analysis: 既存の店舗ルーム画像を無条件で2回目のAIへ送る構成は、非メニューまで外部送信回数と料金を増やす。既存の1回目の画像判定を`receipt / reservation / menu / general`へ拡張し、非メニューはそこで終了。メニューと判定したのに商品・価格が不足する場合だけ、Journalと同じ品質ゲートで1回再確認する。
- Prompt parity: Journal資料画面と同じ共通資料規約、共通メニュー規約、認証済み店舗専用規約を既存画像解析へ加算し、`normalizeKnowledgeMenuItems`、`buildStructuredKnowledgeMenuBody`、`assessKnowledgeMenuQuality`も共用する。MARUGO S専用ワイン表規約は`marugos`ルームだけに適用する。
- Confirmation: 解析結果はM-talkの店舗Botカードへ返し、「この内容で資料へ登録」「今回は登録しない」のサーバー発行ボタンを表示する。登録前は専用下書きだけを保存し、資料テーブル・RAG・資料Storageには書かない。
- Security: 決定APIはM-talk JWT、画像の投稿者本人、送信権限、ルーム店舗対応、下書きの店舗・期限・状態を毎回検証する。下書きテーブルはservice-role専用RLS、元画像パスは同一ルーム接頭辞を必須とし、SHA-256重複防止、非公開Storage、既存`saveStoreKnowledge`経路を維持する。
- Reliability: 解決ボタンの二重実行をUIとDB状態遷移の両方で防止。登録後のカード同期に失敗しても、資料行が参照するStorage原本をエラー処理で削除しない。処理中に別ルームへ切り替えても開始時のgroup_idを固定する。
- Production audit: 初回本番反映後のSupabase AdvisorでERROR 0件を確認。下書き件数の増加時も外部キー照合が全表走査にならないよう、カード・依頼者・解決者・登録資料の4参照列へ索引を追加する追補migrationを適用する。
- Tests/docs: メニューJSON・カード状態・非メニュー拒否、単一AI呼出し、認証・店舗境界、RLS、フロント決定APIを回帰テストへ追加。M-talk／Journal資料／プロンプトブロック／統合AIマニュアルを同期する。

### 2026-09-02 - メニュー画像を商品名・価格付きのRAG資料へ構造化

- Symptom: 5SのドリンクメニューHEICを資料解析しても、概要とタグだけが本文へ入り、画像上の多数の商品名・価格がRAGへ保存されなかった。
- Cause: Geminiへの指示が「詳細テキスト」の一文だけで、構造化項目と出力品質の検査が無かった。概要だけの応答も解析成功としてフォームへ通していた。
- Fix: メニュー画像は区分・商品名・価格・説明の全件一覧、全文文字起こし、判読注意をJSONで受け、RAG本文を商品ごとの価格付き箇条書きへ整形する。商品一覧または価格が不足した場合は共通140秒期限内で1回再解析し、なお不足する場合は`needs_review`として画面で警告し、価格を追記するまで確定・保存しない。HEIC/HEIF選択も明示対応。
- Prompt architecture: 小口レシート解析と同じ加算式で、全店共通資料規約、全店共通メニュー規約、店舗専用規約、共通JSON Schemaを独立ブロック化。MARUGO S専用ブロックは認証済み`marugos`だけに適用し、他店舗は共通ブロックだけを使う。
- MARUGO S: ワイン表の区分、生産者・銘柄・品種、Glass／Decanter／Bottle価格、容量をセル単位で分離する。裸数字へ円を補い、50ml・375mlは価格に数えない。14セルfixtureは14商品／14価格で合格。
- Safety: 読めない文字や価格は推測せず判読不可として残す。売上数値の正本は従来どおり保存済みレポートで、メニュー資料は背景根拠として扱う。
- Docs/deploy: 設計正本は`docs/JOURNAL-KNOWLEDGE-MENU-PROMPT-BLOCKS.md`。commit `747dda9`、`admin-api` v1166、Pages／Edge Functionsとも本番反映済み。

### 2026-09-01 - フードコートブーストを加算統合へ修正し、ワイン確定換算を復旧

- Symptom: ブースト後の完成分析が通常分析よりフードコートへの言及が薄くなり、通常分析に出ていたワイン点数・mlも0または未取得扱いになった。
- Cause: ブースト時だけ標準 `journal-brief` を外して専門AI下書きへ置換していた。さらにチャット用の圧縮データと最終統合payloadから `wineVolumeAnalysis` が抜け、表示上限で切った `topProducts` から再計算していた。イベント詳細36件の上限も全件数と誤読されうる状態だった。
- Fix: 軽量briefを通常分析の基準情報として常に保持し、Journal確定分析・フードコート専門分析・基準情報を別の最終AIが1本の完成分析へ織り込む。ワインは検索対象期間の全商品から先に確定換算し、圧縮後と最終統合にも構造化して渡す。深掘り側は対象日数・欠損日・税抜基準を付け、期間差だけでイベント・競合・順位の事実を捨てない。
- Accuracy: `journal-brief` は期間内イベントのDB全件数を `count: exact` で返し、詳細一覧最大36件とは分離する。深掘りcoverageは重複期間を統合し、期待日数・採用日数・欠損日を共通関数で算出する。

### 2026-09-01 - マルゴエスJournal AIチャットに任意のフードコート深掘りを追加

- UX: 通常分析は既存の軽量 `GET /foodcourt/journal-brief` を維持。会場・競合要因が有効な質問だけ、現在の分析でもかなり背景を踏まえていることを説明した上で、「さらに深掘りしてブーストする」かを1回確認する。追加時間とAPI料金増加を同意前に表示する。
- Scope: `marugos` のWeb版AIチャットだけ。他店、M-talk、単純な数値照会では確認しない。拒否・曖昧返答では追加課金を始めず、従来の軽量brief経路で続ける。
- Pipeline: 同意時はJournal分析（`orchestrationMode: data`）と `POST /foodcourt/journal-deep-analysis` を `Promise.allSettled` で並列実行し、両方成功後に `ai-analyze action=integrate_foodcourt` が1本へ最終統合する。
- Security/data: dedicated routeはマルゴエス＋Journal店舗スコープ限定。Journalが解決した期間を使い、通常の `/foodcourt/ask` を開放せず、会話履歴と `foodcourt_qa_history` 保存を行わない。確定数値の正本はJournal。
- Resilience: 専門AI失敗時はJournal回答、統合失敗時は未統合2本を警告付きで表示。Journal失敗時は専門結果だけを完成分析にせずローカル確定集計へフォールバックする。

### 2026-09-01 - ワインml換算がグラス赤／ボトル赤の細分類を見るようにする

- Symptom: 分類済みでもAIが「ワイン点数は0点／グラス・デキャンタ・ボトル別は判断できない」と返した。ビールだけがドリンク上位に出ていた。
- Cause: `classifyWineProductForMl` が名称の Glass Wine / Bottle Wine / デキャンタと、デキャンタ分類だけを数えていた。銘柄名のままグラス赤／ボトル赤へ振り分けた商品は0点になっていた。
- Fix: グラス（赤／白／ロゼ／泡／オレンジ）、デキャンタ、ボトル（赤／白／ロゼ／泡／オレンジ）の細分類を換算対象にする。大分類「飲料」のままの銘柄は従来どおり入れない。

### 2026-09-01 - マルゴエス Journal AI に東京ドーム／フードコート背景の要約を足す

- Request: [foodcourt.html](https://marugo-s.github.io/line_report/foodcourt.html) のイベント・コート内順位・ボトルネック・他店比較を Journal 解析へ組み込む。全件だと時間切れになるので対策も入れる。マルゴエス専用。
- Mitigation: 新API `GET /foodcourt/journal-brief` が期間内イベント最大36件と直近コート日報1件の順位・シェア・タイプだけを返す。Groq再生成も `/foodcourt/period-summary` も呼ばない。クライアントは8秒・fail-open・2800字。資料取得と並列。
- Canonical numbers: 売上・客数の正本はジャーナル確定集計。コート日報は会場背景。他店へ転用しない。
- Also in the same change set: ロゼ／オレンジデキャンタ、ハイボール／有名カクテルの名前自動分類（ブラウザと `pos_journal.ts`）。カタカナ長音はストリップしない。
- Handoff: `docs/HANDOFF-2026-09-01-JOURNAL-FOODCOURT-CLASSIFICATION.md`
- Verification: Journal AI 78件、POS自動保存＋help 36件、`journal:integration:check` 中核24 OK。

### 2026-08-30 - マルゴエス選択時に店名が空になる不具合を修正

- Cause: Journal Reportの保存先キーは`marugos`へ小文字化する一方、店舗選択肢は共通マスターの正式キー`marugoS`を使っていた。`select.value = 'marugos'`は一致するoptionが無いため、選択欄だけ空表示になっていた。
- Fix: 保存先キー`marugos`はそのまま維持し、選択欄へ設定する時だけ大小文字を吸収して既存optionの正式キー`marugoS`へ対応付ける。これにより既存のPOS原本・保存済みレポートの保存先は変わらない。
- Scope: GitHub Pagesの正本`public/jnm/jnl2txt.html`と、表示確認用の`解凍変換ソフト/jnl2txt.html`へ同じ修正を反映。
- Verification: 新規の店舗選択回帰テスト、`npm run test:journal-ai`（85件）、`git diff --check`を成功させた。

### 2026-08-30 - マルゴエスのPOS電子ジャーナル店舗コードを登録

- Finding: KIOXIA上の実LZH 260件（2025-12-09〜2026-08-25）は、すべてファイル名先頭が`1022`で、共通パーサーでも260/260件を解析できた。一方、本番の`pos_journal_store_codes`には`1022`が無く、マルゴエス（`marugos`）の原本・保存済みレポートはいずれも0件だった。
- Fix: `1022 → marugos（マルゴエス）`を静的マップと`pos_journal_store_codes`へ追加。migrationは別店舗へ既に割り当てられている場合に上書きせず失敗する。
- Production: `20260830054941_add_marugos_pos_journal_store_code.sql`を本番適用し、対応表を読み取り確認済み。既存データは削除していない。
- Verification: `deno check supabase/functions/_shared/pos_journal.ts`、`npm run test:pos-journal`（80件）が成功。再取込は認証済みの電子ジャーナル画面で9フォルダを選び直して実施し、保存後に`pos_journal_files`と`saved_reports`を再確認する。

### 2026-08-28 - chat.htmlから全権管理者用の権限管理導線を復旧

- Symptom: `chat-admin.html`は稼働していたが、通常の`chat.html`から開くリンクがアカウントメニューに無く、直URLまたは本部管理画面を経由する必要があった。
- UI: 右上アバターのアカウントメニューへ「M-talk権限管理」を追加する。初期状態は非表示で、本人だけが読める`chat_user_access.is_full_admin=true`かつ有効な利用状態の場合だけ表示する。
- Boundary: `can_manage`、`can_review_access`、一般利用者では表示しない。表示は導線に限り、`chat-admin.html`と`admin-api /chat-admin/*`の管理セッション・スコープ認証は従来どおり別途必須とする。
- PWA: `chat.html`と責務別JSの更新をホーム画面版へ届けるため、`chat-sw.js`のキャッシュをv58へ更新する。

### 2026-08-28 - 板川与志人を全共有ルーム管理者として復旧

- Incident: 所属未設定になった板川与志人がBistro CAVACAVAを申請したが、唯一の承認者本人による自己承認はDBが正しく拒否し、承認カード側も誤ってルーム管理権限を確認していたため申請中から進めなかった。
- Production recovery: 本部オーナーの明示承認を受け、申請ID 3だけを監査付きで承認。板川与志人へ全22店舗、全アプリ利用権限、ダイレクトトークを除く全26共有ルームの閲覧・送信・招待・管理を付与した。自己承認禁止は解除していない。
- Authorization fix: 新規登録・所属変更カードは、通常ルームの`can_manage`ではなく、本部限定の`can_review_access`を画面でも確認する。一般ルーム管理者へ全体承認権限は広げない。
- Persistence: 管理者通知ルームの同期は、承認者の閲覧権限だけを同期し、本部がそのルームへ明示付与した招待・管理権限を上書きしない。PWAキャッシュをv56へ更新する。
- Audit: 申請復旧と全権付与は本番`chat_admin_audit_log` ID 16〜18に保存した。
- Durable role: `chat_user_access.is_full_admin`を本部限定の明示ロールとして追加する。認定時に全店舗・全共有ルーム・全機能へ同期し、後から追加された店舗・共有ルームも自動付与する。個人間の1対1は対象外。
- Revocation: 全権管理者を通常の委任・ルーム操作から降格・退出させることはできない。解除は本部専用操作だけとし、安全のためM-talkを停止して通常権限の再設定を必須にする。

### 2026-08-28 - CAVACAVA実LZH検証と旧店舗コード1020対応

- Evidence: 手元の実LZH `101520260605221707610001.lzh`（LH5、2,538 bytes）を共通パーサーで解析し、本番`pos_journal_files`の同一SHA-256原本ID 162と照合。営業日2026-06-05、総売上70,400円、2組・6名・2会計が一致した。
- Store code: 本番には`store_code=1020`の原本が35件あり、全件が`bistrocavacava`、ファイル名も`1020YYYYMMDD...lzh`、Storage原本・SHA-256保管済みだった。2025年2月／11月のKIOXIA再アップロード待ち35行という既存記録とも一致するため、`1020`をBistro CAVACAVAの旧POSコードとして追加する。
- Implementation: `POS_JOURNAL_STORE_CODE_MAP`と`pos_journal_store_codes`へ1015と同じ店舗対応を追加。DBに別店舗の1020が先に存在する場合は上書きせずmigrationを失敗させる。電子ジャーナル画面とM-talk運用資料も1015・1020へ更新する。
- Read-only production proof: CAVACAVA店舗専用・10分限定セッションでStorage原本35件を読み、現行パーサーで35/35成功。2025-02は13件・総売上940,010円・42会計、2025-11は22件・総売上1,383,300円・72会計で既存運用記録と一致した。セッションは直後に削除し残存0件。
- Verification: migrationは本番`BEGIN`内で適用・権限検査後に`ROLLBACK`し、1015と旧原本35件が無変更であることを確認。`npm run test:ci`、`npm run check`、POS関連76件、実ブラウザPC／390px表示、Graphify／knowledge（SQL coverage 287/287）が成功した。
- Production: PR #215を本番反映後、同じ35原本をファイル名・容量・SHA-256まで全件再照合して既存行へ修復。新規0・重複0・失敗0、保存レポート4件更新、日次／月次売上同期も同額で完了した。一般`anon`／`authenticated`は店舗コード表・原本表ともSELECT/INSERT不可、一時セッションは削除後0件。
- Zero-sales day: 2025-11-12の原本は正常解析された売上0円・会計0件の日だった。会計0件だけで未解析扱いへ戻らないよう`parsed_complete`をパーサーと判定へ追加し、保存済みの当該1行はファイル名・SHA-256・全ゼロ集計を固定条件にしたmigrationでだけ補正する。

### 2026-08-28 - M-talk専用の委任管理者を最小権限で追加

- Request: LINE Report全体の管理権限を渡さず、管理者が指定したM-talkの店舗・ルーム・操作範囲だけを扱える管理者を作る。一般ユーザーには重要な管理データやファイルを触らせない。
- Scope: `chat_admin_delegations`にM-talk全体／選択店舗／選択ルーム、8能力、有効期限、停止状態、セッション世代を保存。初期能力は`view`だけで、期限は必須。
- API boundary: 委任セッションは`scope=mtalk_admin`専用。`/chat-admin/*`以外の売上・予約・資料・ファイル・店舗設定APIは403。逆に店舗・ルーム・cronセッションもM-talk管理APIへ入れない。
- Data minimization: 管理状態は対象ルーム・所属ユーザー・店舗Bot・対象監査ログだけへ絞ってから返し、メッセージ本文、添付パス、署名URLを含めない。
- Atomic authorization: 全委任書込みをservice-role専用`chat_admin_delegated_execute`へ集約。委任行をロックし、停止・期限・能力・対象を再検査して既存管理RPCを同一トランザクションで実行する。停止と操作の競合でも停止完了後の書込みを許さない。
- Session revocation: 管理範囲・能力・期限の変更、停止・再開をDBトリガが検知して`session_version`を進める。旧リンク／旧セッションは再開後も復活しない。復元不能なルーム完全削除は本部だけ。
- UI/Docs: `chat-admin.html`へ委任作成・編集・停止・再開・リンク発行と権限範囲表示を追加。権限がないボタンは表示しない。仕様書、統合ガイド、操作マニュアル、AI資料を同期。
- Verification: ローカルSupabaseへmigrationを実適用。SQL攻撃テストで許可店舗だけ変更成功、他店舗・期限切れ・停止済み・一般`authenticated`・完全削除を拒否し、監査範囲と世代更新も確認。`npm run test:chat` Deno 63/63・Node 137/137、`npm run check`、`git diff --check`成功。`admin-api`の既存型エラー内訳は基準ブランチと一致し、新規増加なし。

### 2026-08-27 - M-talk内部helperのData API公開を最小化

- Audit: Supabase Advisorのauthenticated向けSECURITY DEFINER 42件を、画面が直接使う20 RPC、RLS・Storageが使う13自己スコープgate、内部helper 9件へ分類した。
- Least privilege: `20260909060000_revoke_authenticated_chat_internal_helpers.sql`で、所属店舗・管理者状態等を補助的に判定する9件を`public / anon / authenticated`から剥がし、`postgres / service_role`だけにした。Advisor該当件数は42件から33件へ減少。
- Impersonation guard: `20260909070000_self_scope_admin_notice_gate.sql`で、authenticated利用者が`chat_can_see_admin_notice`へ別ユーザーIDを渡して管理者状態を推測できないよう、本人またはservice-roleだけに固定した。
- Production proof: 架空authenticatedはルーム・本文・所属・`chat-images`が全て0件。実在利用者は正規ルームと未読RPCを利用可能。非参加ルームの本文・添付は0件。利用停止をtransaction内で再現するとルーム・本文・Keep・個人メモ・添付が全て0件になり、ROLLBACK後に停止ユーザー0件へ復帰した。
- Advisor allowlist: 残る33件は20 browser RPC＋13 policy gateだけ。anon/public実行可0件、固定`search_path`漏れ0件。`pg_trgm`のpublic配置警告は既存の日本語検索index/operator class互換を維持するため移動しない。
- Test: `npm run test:chat` Deno 57/57・Node 132/132。内部helperのREVOKEと管理者通知gateの本人/service-role境界を回帰テストへ追加した。

### 2026-08-27 - chat.htmlの責務別分割とM-talk最小権限化

- Request: 約10,600行の`chat.html`を段階的なツリーへ分け、一般ユーザーと管理者の境界を再監査する。
- Frontend: `chat.html`を画面構造だけの497行へ縮小。`public/chat/`へCSSと、core/auth/permissions/profile/realtime/notifications/rooms/messages/attachments/composer/bootstrapの11ファイルを分離。classic scriptの読込順を固定し、`chat-sw.js` v54ですべてPWAキャッシュ対象にした。
- Security audit: 本番DBで27対象テーブルのRLS有効、偽の非メンバーJWTでルーム・本文・所属・`chat-images`が全て0件、`chat-images`非公開を確認。匿名ロールに残っていた不要な`chat_*` GRANTと、トリガ専用SECURITY DEFINER関数のEXECUTEを追加migrationで剥がす。
- Access hardening: 停止・一時制限・論理削除ユーザーはKeepと個人メモも、本人固定の`chat_is_registered()`で遮断する。低レベルの`chat_has_active_access(uuid)`はservice_role専用のまま維持する。
- Cross-app boundary: M-talkのauthenticated JWTから、AI使用量・予約再集計・cron起動／履歴削除などチャット外の内部SECURITY DEFINER関数を実行できないようservice_role/postgres専用へ統一する。
- Public policy audit: `foodcourt_weekly_reports`の無条件ALLをservice_role専用へ修正し、`giants_game_results`は公開SELECTのみ維持してINSERT/UPDATE/DELETEをservice_roleへ限定する。
- Advisor hardening: `foodcourt_daily_features`のdefiner権限による保護表バイパスを閉じ、内部補助関数2件の`search_path`固定とブラウザロールEXECUTE剥奪を追加する。
- Test: `npm run test:chat` Deno 57/57・Node 129/129。外部化した全JSの構文検査と最小権限migration専用テストを追加。

### 2026-08-27 - 承認カードを予約通知の1対1へ送らない

- Symptom: 完全削除した「予約通知」ルームに、所属変更の承認カードが届いた。
- Cause: 管理者への通知を予約通知Botとの1対1（同じ `direct_key`）へ送っていた。
  ルームを消しても、次の通知で同じ相手の1対1が作り直される。一覧名は相手の「予約通知」。
- Fix: 専用ルーム `管理者通知`（`is_admin_notice_room`）。予約通知Botは使わない。
  このルームはゴミ箱・完全削除できない。
- Test: `tests/chat_admin_notices_private.test.mjs`。

### 2026-08-27 - 承認プロセスは管理者だけに見せる

- Request: 店舗ルームの一般メンバーに、新規登録の許可／不許可カードが見えていた。
- DB: 承認カードは `chat_is_admin_notice_message`。店舗ルームでは `can_manage` だけ
  SELECT可。配信先は `chat_ensure_manager_notice_direct` の管理者1対1。未読RPCからも除外。
  閲覧ユーザーに残っていた送信・招待は落とす。再招待時は `chat_add_members` が権限を下げられる。
- Edge: `chat-knowledge` は店舗ルームへ出さず、管理者DMへ `postAdminNoticeToManagers`。
- UI: 非管理者にはカードを描かない。Botタブは所属店舗のみ。招待ボタンは招待できるルームがあるときだけ。
- Test: `tests/chat_admin_notices_private.test.mjs`。

### 2026-08-27 - 所属店舗を必須にし、変更は管理者許可後、1対1は同じ所属のみ

- Request: 新規登録で所属店舗を必須。複数可。後からプロフィールで変更できるが、
  管理者の許可が下りてから反映。1対1の相手は所属店舗が同じ人だけ。
- DB: `chat_store_catalog` / `chat_user_stores` / `chat_store_change_requests`。
  登録は `chat_complete_signup`。変更申請は `chat_request_store_change`。
  許可時だけ所属を書き換える。`chat_open_direct` は新規1対1に所属の重なりを要求。
- UI: 初回フォームとプロフィール設定に複数選択。管理カードは許可／不許可。
- Test: `tests/chat_user_stores.test.mjs`。

### 2026-08-27 - 新規登録は管理者の許可待ち、許可後は閲覧のみ

- Request: 新規登録者を、管理権限を持つユーザーへ通知し、許可／不許可できるようにする。
  許可された時点では閲覧権限のみで始める。
- DB: `chat_user_access.signup_status` / `default_can_send`。人間の新規は pending・利用停止。
  Botと既存ユーザーは approved・送信可のまま。許可RPCはルーム管理権限が必要。
  グループ参加は `default_can_send=false` なら閲覧のみ。
- 通知: 登録トリガが `chat-knowledge?action=signup-notify` へ内部POSTし、管理者がいる
  ルームへ許可／不許可カードを出す。カード操作は `chat_review_signup`。
- UI: 承認待ち／不許可の専用画面。許可後は Realtime で本体へ入れる。
- Test: `tests/chat_signup_approval.test.mjs`。本番反映には migration と Edge のデプロイが必要。

### 2026-08-27 - 未参加グループは招待リンクで参加する

- Symptom: 一覧の「参加」は押しても入らず、案内だけだった。
- Fix: 見出しを「未参加のグループ」、ボタンを「招待で参加」にし、貼ったリンクを
  `chat_join_by_invite` へ渡す。ルームID指定の直接参加はしない。
- Test: `tests/chat_join_invite_list.test.mjs`。

### 2026-08-27 - 検索ジャンプ中の新着穴を埋める

- Symptom: 検索結果から途中の発言へ飛ぶと、その後の新着を継ぎ足さず間が空いていた。
- Fix: `fillLatestGap()` が読み込み済み末尾より新しい発言をページ単位で取得してつなぐ。
  見ていた位置は維持し、自動では最下部へ飛ばない。「最新へ」は最下部移動のまま。
- Test: `tests/chat_history_since_join.test.mjs` に契約を追加。

### 2026-08-27 - 本番管理画面の dry_run スモークを実施

- ユーザーが `chat-admin.html` でルームを選び「変更内容を確認」を押した。
- `dry_run:true` のため行も監査も書かない。管理トークン → admin-api → RPC は本番で通った。

### 2026-08-27 - M-talkで自分の発言を編集できるようにする

- Request: 誤送信の訂正が削除しかなかったので、自分の本文を後から直せるようにする。
- DB: `edited_at` を追加。UPDATE は本人かつ送信権限があるときだけ。トリガが
  kind / payload / 送信者 / 返信先 / サイレントを固定し、メンションを参加者に絞る。
  ゴミ箱ルームは既存の拒否トリガを UPDATE にも適用。Push と資料登録は INSERT 専用のまま。
- UI: 「…」→「編集」で入力欄が編集モードになる。直す前の本文は取り消し線で残し、
  `edit_history` はトリガが積み上げてクライアントから消せない。保存後に「編集済み」と表示。
  画像・ファイル・カード・大きく送ったスタンプは対象外。
- Test: `tests/chat_message_edit.test.mjs`。

### 2026-08-27 - 推奨順1〜5: スモーク・文書追いつき・スタッフ使い方・複数ルーム一括UI

- Smoke: 本番 Pages の `chat.html` / `chat-admin.html` は HTTP 200。未認証の
  `/chat-admin/state`・templates・apply・audit revert は 401。
  「変更内容を確認」の本番 dry_run はユーザーが実施済み。
- 1対1: 本番 `chat.html` にリンクプレビュー実装あり。AI使用料ページは
  Perplexity / Web検索の表示あり。天気・Web検索の実送信は従量課金と本文保護のため未実施。
- Docs: 08-27 の天気（地域名）・Web検索（ON/OFF・出典URL・使用料）を
  `CHAT-TALK-GUIDE.md` と統合ガイドへ反映。
- Staff page: `public/mtalk-help.html`。使い方のみ。`chat.html` からリンク。
- Admin UI: ルーム一覧チェック → `group_ids` 複数指定のプレビュー。DB変更なし。

### 2026-08-27 - 雑談AIのWeb検索実費をAI使用料へ表示

- Request / ship: Perplexity Web検索の従量課金を `ai_usage_events` に記録し、
  `ai-usage.html` へ表示する（#207）。出典URLの改行・読点連結を修正（#205 / #206）。
- Reply: 使用AIの注記、調理手順も検索対象（#204）。Web検索のON/OFFとモデル選択（#203）。
- Weather: 店舗座標の予報に、おおまかな地域名を添える（#202）。日次売上取込と用語整理（#201）。

### 2026-08-26 - 統合AI資料の類似・否定形質問を敵対的に再検証

- Re-test: 利用者が実際に使いそうな省略、否定形、単語が離れた表現、似た機能の比較を40問作り、`selectLineReportHelpSections` → `buildMtalkHelpReference` の実経路へ通した。
- Findings: 初回は6問で関連項目が上位6件に入らなかった。対象は「通常トーク画面からBot削除」「過去AI分析文を次回答へ再利用」「Journal天気・気温の通常AI統合」「東京ドームと小ホールの係数差」「LINEグループのBot数」「Grok／Perplexityの外部検索条件」。また「Journalの資料…」で項目検索はできても統合資料が未注入になる表現を確認した。
- Fix: ADM-01/03、JAI-01、FCT-03/06、SEC-03の検索語と説明を実装事実に合わせて追加し、`journal`、`grok`、`perplexity` を統合資料の質問判定へ追加。外部検索は戦略・改善質問のみ、数値照会では呼ばないことも明文化した。
- Verification: 40問を再実行して **40/40成功・途中切れ0件**。失敗した表現を恒久テストへ追加し、否定形・分離語・類似機能でも正しい項目を選び、統合資料が必ず注入されることを検証する。

### 2026-08-26 - 統合AI資料を全コード入口と再照合し、継続監査を追加

- Re-audit: 文書だけでなく実コードを再調査し、公開コード40件、Edge Functions 20件、共有TypeScriptモジュール90件、補助・運用・レガシーコード37件、admin-api静的ルート136件、SQL migration 270件、テスト63件をインベントリ化した。
- Gaps fixed: 手入力日次／月次売上・売上シート・店舗別解析プロンプト、メディア／文書ライブラリ、LINE Report電子ジャーナルとJournal Reportの違い、フードコートRAG／蒸留／プロンプト評価、イベント／天気／PV通知、M-talk管理・監査復元、Journalの未統合データと予約対応範囲、コード構成・API・DB基盤、GAS／OCRブリッジ／旧Worker・Expressを追加。統合資料は12区分44項目へ拡張した。
- Grounding: 全44項目に主要実装根拠ファイルを紐付けた。コード／API／テーブル等を尋ねられた時だけAIへ関連ソースを渡し、通常の使い方回答にはソース一覧を出さず簡潔さを維持する。
- Continuous check: `line_report_help_coverage.ts` と `npm run help:check` を追加。新しい公開画面、Edge Function、共有モジュール、admin-api静的ルートが資料区分へ未分類のまま追加されると `npm run check` が失敗する。
- Human audit: 自動生成資料 `LINE-REPORT-JOURNAL-AI-MANUAL.md` を1073行へ拡張し、後半に全コード精査インベントリ（入口→資料区分の対応表）を追加した。生成結果完全一致、実装根拠の存在、代表質問検索、非切断、安全境界をテストする。
- Verification: 統合資料Deno 31件（会話19＋資料11＋コード網羅1）、チャットNode 103件、`npm run test` 全グループ、`npm run check`、Journal中核接続21 OK / 0 NG、`git diff --check` が成功。

### 2026-08-26 - 1対1 AI向けLINE Report／Journal Report統合資料を作成

- Request: LINE ReportとJournal Reportの内容を何でも正確に質問できるよう、詳細だが回答は簡潔で分かりやすく、区分・索引付きの資料へまとめる。
- Knowledge: `line_report_help_manual.ts` を新設。全体像、売上・レシート・予算、予約、店舗運用・権限・小口、Journal基本・取込、資料・`#メモ`、Journal AI、フードコート、口コミ・競合、管理・利用状況、コード構成、正確性・安全の12区分（SYS/SAL/RSV/OPS/JRN/KNW/JAI/FCT/REV/ADM/DEV/SEC）、44項目、項目コード、要点、詳細、検索語を収録。
- Retrieval: `mtalk_help_manual.ts` がM-talk資料と統合し、毎回「区分索引＋質問に近いLINE/Journal最大4項目＋M-talk最大3項目」を渡す。回答指示は結論1〜2文→必要な手順／理由→注意点、索引全体は読み上げない、曖昧なら確認1問、LINE売上分析とJournal分析の正本・用途を分ける。
- Docs: 同じ実行時データから `npm run help:update` で `docs/LINE-REPORT-JOURNAL-AI-MANUAL.md`（1073行）を自動生成。テストで生成結果との完全一致を確認し、手書き二重管理を防止。
- Safety: 店舗の実数値は推測せず「＋」→「ジャーナルに聞く」へ案内。店舗スコープ、非公開保存、資料は金額の正本にしない等の境界を明記。
- Test: 区分・ID・コード一意性、全項目分類、索引網羅、代表12質問の検索精度、生成Markdown完全一致、統合参照の非切断、簡潔回答指示、実数値安全境界を追加。Deno 27件＋チャットNode 103件成功。

### 2026-08-26 - 1対1 AIが仕組みも含めて幅広い質問に答えられるよう強化

- Request: あらゆる質問に答えられるよう、AIがM-talkの仕組みを理解できるようにまとめる。
- Implementation: `mtalk_help_manual.ts` に「M-talkの仕組み・全体像」セクションを新設（ルーム種別、店舗Bot、2種類のAI＝雑談AI／ジャーナルに聞く、Web Push、画像の非公開保存、参加時点以降の履歴、4種の権限）。`isMtalkHelpQuestion` に「仕組み・とは・違い・なぜ・安全・プライバシー・対応」などの意図を追加。`buildMtalkHelpReference` は、どの質問でも「全体概要＋仕組み・全体像＋関連詳細＋全機能索引」を渡すようにし、別機能への追加質問にもその場で案内できるようにした（maxChars 2600→4200）。
- Implementation: `mtalk_casual_chat.ts` のシステム指示に「なぜ／どういう仕組み／〜とは／違い」にも仕組みセクションを根拠に答える、索引に近い機能があれば触れて案内する、を追加。
- Safety: 仕組み説明はユーザー向け範囲に限定し、鍵・実データ・他アプリ内部は含めない。店舗の実数値は引き続き「ジャーナルに聞く」へ誘導する方針を維持。
- Test: 仕組み質問の判定、仕組みセクションの添付、具体質問でも仕組み＋全機能索引を常時添付、を追加し `tests/mtalk_casual_chat.test.ts` 19件成功。

### 2026-08-26 - 1対1 AI返信が途中で切れる不具合を修正

- Symptom: 使い方の回答が「右側の紙飛」など文の途中で切れていた。生成トークン上限 `max_tokens=500` が小さく、推論モデル `gpt-oss-120b` が内部思考でも枠を消費して本文を出し切れなかった。
- Fix: 基本 `MAX_TOKENS` を1400、gpt-ossは最低2000へ引き上げ、`max_completion_tokens`、`reasoning_effort='low'`、`reasoning_format='hidden'` を指定して本文枠を確保。`REPLY_MAX_CHARS` は1800（DB上限2000内）。さらに `clampReplyForMtalk()` を追加し、万一上限を超えても句点・改行までで止めて文の途中で切らない。システム指示も「使い方は文字数を削らず全項目を出し、途中で打ち切らない」に更新。
- Safety: DBの本文上限2000文字は超えない。雑談は従来どおり短文（目安3文以内）を維持。
- Test: 文境界での安全な切り詰めに加え、gpt-ossへ2000トークン・low/hidden設定が実際のリクエストへ入ることを検証し、`tests/mtalk_casual_chat.test.ts` 16件成功。

### 2026-08-26 - 1対1 AI返信を項目ごとに空行で区切る見やすいレイアウトへ

- Symptom: Markdown記号は消えたものの、箇条書きが1行ずつ詰まって表示され、まだ読みづらかった。
- Fix: `formatCasualReplyForMtalk()` を刷新し、トップレベル項目を「▶ 見出し」＋説明行に分け、項目と項目の間へ空行を1行入れる。子項目は全角スペース字下げの「・」。表・水平線・見出しも余白付きで整形する。システム指示にも「- 項目名：説明」で1項目ずつ書き、項目間に空行を空けるルールを追加。
- Safety: 従来どおり `kind='text'` として保存し、HTML化しない。プロンプトに従わない出力も保存前の整形で同じ見た目に揃える。
- Test: 見やすいブロック分割、表・コードフェンス・水平線、Groq応答経由の整形、出力指示の3項目を更新し `tests/mtalk_casual_chat.test.ts` 15件成功。

### 2026-08-26 - 1対1 AI返信のMarkdown記号を読みやすい表示へ整形

- Symptom: 店舗Botとの1対1でM-talkの使い方を質問すると、AI回答の `**太字**`、`-` 箇条書き、`##` 見出しなどがMarkdown記号のまま吹き出しへ表示されていた。M-talkの通常メッセージはMarkdownを描画しないプレーンテキスト表示。
- Fix: `mtalk_casual_chat.ts` のシステム指示へ「Markdownを使わず、箇条書きは `・`、小見出しは `■`」を追加。さらに `formatCasualReplyForMtalk()` を通してから `chat_messages` へ保存し、見出し・箇条書き・強調・リンク・表・コードフェンス・水平線を読みやすいプレーンテキストへ変換する。
- Safety: HTMLを描画せず従来どおり `kind='text'` の本文として保存するため、XSS面の表示境界は変更しない。プロンプトにモデルが従わない場合も保存直前の整形で記号露出を防ぐ。
- Test: スクリーンショット相当の使い方回答、表・コードフェンス・水平線、Markdown禁止指示、Groq応答から保存前整形までの経路を追加し、`tests/mtalk_casual_chat.test.ts` 15件成功。`npm run test:chat` はDeno 15件＋Node 103件成功。

### 2026-08-26 - 「M-talkに貼る」の長いジャーナル回答を全文表示

- Symptom: ジャーナルレポートAIの長い回答を「M-talkに貼る」で投稿すると、`postAiAnswerToMtalk` の `pretty.slice(0, 1700)` により途中で切れていた。DBの通常ユーザー投稿ポリシーは本文2000文字まで。
- Fix: `buildMtalkJournalPasteMessages()` を追加し、整形済み回答を安全マージン1900文字以内の複数メッセージへ行単位で分割して順次投稿する。2件目以降は「[電子ジャーナル]（続き N/全件数）」と表示する。送信ボタンには進捗 `(現在/全件数)` を表示する。
- Safety: 全断片を `[電子ジャーナル]` 始まりにするため、`chat-knowledge` のジャーナル貼り付けガードが全件へ効き、Botは返信しない。DBの2000文字制限は緩めない。
- Test: 長文全文保持、各断片2000文字以内、全断片接頭辞、短文1件維持、長い質問＋5000文字単独行を検証。実データ相当3169文字が2件（1843文字＋1365文字）へ分割され、末尾まで保持されることを確認。チャット全体102件成功。

### 2026-08-26 - 貼り付けたジャーナル回答に雑談AIが返信しないよう修正

- Symptom: 「M-talkに貼る」で貼ったジャーナルレポートAIの回答（本文が「[電子ジャーナル]」で始まる）に対し、店舗Botとの1対1で雑談AIがさらに返信していた。
- Fix: `chat-knowledge` の handleDispatch 入口に `JOURNAL_PASTE_PREFIX_RE`（`^[電子ジャーナル]`）ガードを追加し、貼り付け投稿にはBotが一切反応せずスキップするようにした。雑談AI・設定・検索・スケジュール登録より手前に置く。
- Test: `tests/mtalk_journal_paste_format.test.mjs` にガードの存在と位置、jnl2txt側接頭辞との一致を検証するケースを追加（合計100件成功）。

### 2026-08-26 - M-talk管理画面へルームゴミ箱とBot削除・復元を追加

- Request: M-talk管理画面からも、通常ルームを「ゴミ箱へ移動 → 復元 / 完全削除」の順で管理できるようにする。Botの削除は管理画面だけに限定し、通常のM-talk画面では削除不可を維持する。
- DB: `20260901020000_chat_admin_room_trash_and_bot_archive.sql` を追加。`chat_admin_trash_group` / `chat_admin_restore_group` / `chat_admin_remove_bot` / `chat_admin_restore_bot` はservice_role専用。Botは `bot_deleted_at` による論理削除で、過去メッセージ・所属履歴を保持する。削除済みBot名義の新規投稿はDBトリガで拒否する。
- API/UI: `chat-admin.html` に「ゴミ箱」タブ、通常ルームの「ゴミ箱へ」、ゴミ箱内の「復元 / 完全削除」、Bot行の「Bot削除 / Bot復元」を追加。完全削除はルーム名再入力、Bot削除はBot名再入力＋最終確認。店舗固定ルームは対象外。
- Safety: 管理APIは本部フル管理セッション限定。通常の `chat.html` にはBot管理APIを追加していない。削除済みBotを店舗Bot解決・予約通知・検索応答から除外し、店舗Botが削除済みのときに汎用Botへフォールバックしない。
- Verification: 本番DBへマイグレーション適用済み。トランザクション内実テストを全件ROLLBACKし、anon/authenticated実行不可・service_roleのみ可・ゴミ箱/復元・Bot削除中の投稿拒否・Bot復元を確認。`npm run test:chat` 99件成功。PC幅1440pxとモバイル幅で管理画面を確認。

### 2026-08-25 - 「M-talkに貼る」をMarkdownのまま貼らず読みやすく整形

- Request: 「ジャーナルに聞く」の分析結果を「M-talkに貼る」で貼ると、Markdown（`##`・`**`・表）のまま出力されるので、見やすい形にまとめて貼る。
- Implementation: `public/jnm/jnl2txt.html` に `mtalkPlainTextFromMarkdown()` を追加し、`postAiAnswerToMtalk()` が貼る直前に整形する。見出しは「■/▪」、2列の表は「項目：値」、3列以上は「値 / 値」、箇条書きは「・」、水平線は区切り線にし、強調・リンク記号を除去する。
- Note: M-talkのトークは通常テキスト表示のため、カード化ではなく読みやすいプレーンテキストへ整形する方針。挿入はこれまでどおり本人JWTでの `chat_messages`(kind=text)。
- Test: `tests/mtalk_journal_paste_format.test.mjs` を追加（見出し/強調/水平線/2列表/3列表/空入力）。`npm run test:chat` 97件成功。

### 2026-08-25 - 1対1雑談AIの数値誘導を「ジャーナルに聞くを開いて確認」へ明確化

- Request: 細かい数字の分析に対しては、ジャーナルを開くよう明確に案内する言い回しにする。
- Implementation: `mtalk_casual_chat.ts` のシステムプロンプトと `mtalk_help_manual.ts` の「ジャーナルに聞く」項目を、「入力欄の『＋』→『ジャーナルに聞く』を開いて確認してください」と開く場所を添えた明確な誘導に変更した。
- Test: 数値質問でこの誘導文言と「数字には答えない」安全指示が同時に入ることを検証するケースを追加（合計11件成功）。

### 2026-08-25 - 1対1の雑談AIがM-talk使い方マニュアルを参照して回答

- Request: 1対1の通常メッセージ欄で、M-talk全体の使い方を自然に質問し、AIが詳しく案内できるようにする。
- Implementation: `supabase/functions/_shared/mtalk_help_manual.ts` を追加。ログイン、送信、画像・ファイル、スタンプ、返信、検索、予約配信、個人メモ、Keep、アルバム、予定、通知、ルーム、店舗Bot、ジャーナルAI、権限、履歴、トラブル対応を、AIが参照できるセクション形式で整理した。
- Implementation: `mtalk_casual_chat.ts` が質問のキーワードから関連項目を最大3件選び、システムプロンプトへマニュアル抜粋として渡す。通常の雑談には注入しない。
- Safety: マニュアルにない場所・機能・手順を推測しない、LINEとM-talkを混同しない、店舗の実数値は「ジャーナルに聞く」へ案内する指示を維持した。
- Test: 画像送信、iPhone通知、全体機能、個人メモ、通常雑談の5ケースを追加し、既存5ケースと合わせて10件が成功。

### 2026-08-26 - 自分以外の人間がいないトークで、Botとの雑談・簡単な相談に応じるようにした

- Request: 店舗Botと1対1のとき、通常のメッセージラインでも oss-120b で簡単な解析や会話を、会話履歴を参照しながら続けられるようにする。
- Implementation: `supabase/functions/_shared/mtalk_casual_chat.ts` を追加。既存のどのコマンド（検索・レシート修正・予定登録・`#メモ`）にも一致しなかった発言に、`GROQ_TEXT_PRIMARY_MODEL`(`openai/gpt-oss-120b`) で雑談・簡単な相談として返す。`chat-knowledge` の、これまで無反応で終わっていた最後の分岐にだけ差し込む。
- Implementation: 判定は `is_direct` ではなく「その部屋の人間メンバーが本人1人だけか」（`isSoloHumanRoom`）。先日の電子ジャーナルAIの判定基準の学びと同じで、利用者が自分でBotを招待して作った部屋（`is_direct=false`）も対象になる。グループでは発火しない。
- Note: 会話履歴は専用テーブルを持たず、その部屋の `chat_messages`（直近12件）をそのまま参照する。
- Security: 売上・客数など店舗の実データには答えさせない。システムプロンプトで明示的に禁止し、数字が要る質問は「ジャーナルに聞く」へ誘導させる。根拠データを持たないままここで数字を作らせると、`.lzh`未捕捉売上の誤答と同じ事故になるため。`GROQ_API_KEY`未設定・呼び出し失敗時は例外を投げず無反応に留める。

### 2026-08-25 - 電子ジャーナルのAIチャットをM-talk内に埋め込む

- Request: リンクで別ページへ飛ばすのではなく、M-talk アプリ内のチャット画面で、ジャーナルレポートと全く同じAIチャットができるようにする。
- Implementation: `mtalk_journal_ai.html` を M-talk 内の枠として置き、その中に `jnm/jnl2txt.html` を iframe で埋め込む。`?mtalk_embed=1` のとき `jnl2txt.html` は AIチャットパネル以外を隠して全面表示し、自動で開く。CSSと起動条件だけの追加で、AIのロジックには触れていない。答えるのは向こうのAIなので、あちらで聞いたときと完全に同じ答えになる。
- Note: ページ遷移で飛ばす前案は取りやめ。利用者から見れば M-talk の画面のまま。
- Security: `/auth/chat-journal-login` はそのまま使用。店舗スコープ固定のワンタイムリンク（5分）で、全店アクセスにはならない。

### 2026-08-25 - 電子ジャーナルQ&Aを、ジャーナルレポート本体に答えさせる方式へ変更

- Request: M-talk に同じシステムを作るのではなく、ジャーナルレポートに答えてもらい、それを M-talk へ模写する形にしたい。全く同じ答えを得たい。
- Implementation: M-talk 側にAIを持たせるのをやめ、1対1の「ジャーナルに聞く」で `jnm/jnl2txt.html` 自体を開く。`/auth/chat-journal-login` を追加し、M-talk の Supabase JWT で1対1・参加者・店舗Bot一意を確認したうえで、その店舗にスコープを固定したワンタイムリンク（5分）を発行する。`?lt=` は `auth-session.js` が `/auth/link-login` で交換するため、ジャーナルレポート側は認証の改修不要。
- Implementation: `?mtalk_group_id=` が付いているときだけ、ジャーナルレポートのAI回答に「M-talkに貼る」を出す。押すとそのトークへ書き戻す。同一オリジンなので Supabase セッションを共有できる。
- Removed: 自前Q&A画面 `mtalk_journal_ai.html` と `/chat-journal-ai` を廃止。`/pos-journals/ai-ask` を直接叩く別経路で、ジャーナルレポートとは材料もロジックも違い、答えが一致しなかった。
- Security: 発行するのは店舗スコープ付きセッションで、`STORE_SCOPED_ALLOWED_PATHS` の範囲に限られる。全店アクセスにはならない。既存の `/auth/chat-media-login` と同じ型を踏襲した。
- **Pending（特記事項）**: ジャーナルレポート側が Bistro CAVACAVA 専用のため、対象店舗はそのまま。

### 2026-08-25 - 電子ジャーナルAI画面がログインを認識しない不具合を修正

- Symptom: M-talkの1対1トークから「電子ジャーナルに聞く」を開くと「ログインしてください」と
  表示され、この画面にはログインの手段が無いため操作が先に進まない。
- Cause: `mtalk_journal_ai.html`のSupabaseクライアントだけが独自の`storageKey: 'mtalk-auth'`を
  指定していた。`chat.html`と兄弟画面の`mtalk_schedule.html`はどちらもデフォルトのキーを使う
  ため、chat.htmlで保存されたログインセッションがこの画面からは見えなかった。
  導入コミット(#179)は「mtalk_schedule.htmlと同じ型」「チャット利用者のJWTをそのまま使う」と
  明記しており、設計意図に反する取り違えだった。
- Fix: `storageKey`の指定を削除し、他画面と同じデフォルトキーへ揃えた。
- Verified: ブラウザでchat.htmlが書き込むのと同じデフォルトキーへ模擬セッションを保存し、
  修正版は認識する(`hasSession:true`)・旧コードは再現して認識しない(`hasSession:false`)ことを
  実測で確認。`npm run test`全8グループ0件失敗、`npm run check`。
  他のpublicページに同種の`storageKey`指定がないことをリポジトリ全体でgrep確認。

### 2026-08-25 - 電子ジャーナルAIを1対1専用の別画面にした

- Request: ジャーナルレポートのAIに質問するのは、分けられた別モードにしたい。1対1で発動できるモードとして。チャット内の一問一答は無くす。
- Implementation: `mtalk_journal_ai.html` を追加し、`＋` →「ジャーナルに聞く」から開く。`mtalk_schedule.html` と同じ型で、チャット利用者の Supabase JWT をそのまま使う。`admin-api` の `/chat-journal-ai` が JWT を検証し、参加者であること・1対1であることを確かめてから `askPosJournalAi` を呼ぶ。対象月はセレクタで選び、スレッドで続きの質問ができる。回答ごとに「この回答をトークに貼る」を置き、画面に閉じたままにしない。
- Implementation: チャット内の一問一答（「ジャーナル検索」→2分以内に月6桁＋質問）を撤去した。コマンドと長い回答が普通の会話に混ざり、保留が切れると入力がただの発言になっていた。同じことをする道が2つあると片方だけ直す事故が起きるため画面へ一本化する。`mtalk_search.ts` と `chat-search` から関連コードを削除。
- Note: 1対1の確認はボタンの表示、`openJournalAi()`、`/chat-journal-ai` の3箇所で行う。グループではボタン自体を出さない。
- **Pending（特記事項）**: **Bistro CAVACAVA 専用**のまま。`resolvePosJournalAiStore` の明示的な制約で、`.lzh` 取込の店舗コード登録とは別問題。

### 2026-08-25 - 電子ジャーナルQ&Aを1対1限定にし、続きの質問と回答の出どころ表示を追加

- Request: 質問は1対1のみに制限したうえで、会話履歴と「AI生成/基本回答」の区別を入れる。
- Implementation: 合図を受けた時点と質問を受けた時点の両方で `chat_groups.is_direct` を確認し、グループでは断る（売上の質問と回答が参加者全員に見えるため）。`mtalk_journal_qa_history` に往復を持ち、直近8往復かつ2時間以内だけを `history` として `/pos-journals/ai-ask` へ渡すので「じゃあ前月は？」が通る。古い文脈が別件へ混ざらないよう時間で切る。行はトリガで1対1×利用者ごとに直近32行へ刈る。
- Implementation: 回答カードに `ai_generated`（AI生成／基本回答）とモデル名を出し、`warning` があれば赤字で添える。区別せず出すと「AIが分析した」と誤解されるため。
- Note: `summary` は渡さない。未指定なら `resolvePosJournalAiSummary` が DB から組み直すので、画面の状態に依存しないぶん確実。
- Security: 質問文と回答が入るため `mtalk_journal_qa_history` は service_role 専用。RLSを有効にしたうえで anon/authenticated から revoke する。

### 2026-08-25 - M-talkから電子ジャーナルへ質問できるようにした

- Request: Journal Report の資産を M-talk から使えるようにする（提案の第2段）。
- Implementation: 店舗ルームで「ジャーナル検索」と送ると質問待ちになり、次の1通「月6桁＋質問」で答える。集計も回答生成も `/pos-journals/ai-ask` に任せるので、電子ジャーナル画面から聞いたときと同じ根拠・同じ制約で答える。M-talk の検索メニューにもボタンを足した。
- Note: 保留は `line_room_search_pending` に `search_kind='journal'` で積むが、`loadSearchPending()` は既知4種以外を null にして捨てるため使えない。`loadJournalPending()` として自前に読む。LINE 側の `SearchKind` は変えず、M-talk だけに閉じている。
- Security: `admin-api` の内部キー経路に `/pos-journals/ai-ask` を追加した。`storeScope` は null で通すが、`resolvePosJournalAiStore` が対応店舗以外を必ず弾く。
- **Pending（特記事項）**: **電子ジャーナルAIは Bistro CAVACAVA 専用。** `resolvePosJournalAiStore` が `resolvePosJournalStore("1015")` と一致しない店舗を明示的に拒否する意図的な制約で、`.lzh` 取込の店舗コード登録とは別問題。他店舗へ広げるにはこの制約の見直しが要る。実データも `pos_journal_files` は bistrocavacava の1店舗分のみ。

### 2026-08-25 - M-talkに落とした.lzhをその店舗の電子ジャーナルへ取り込む

- Request: `.lzh` をジャーナルレポートに店舗を紐づけて、その店舗用のデータベースにドロップしたときと同じように解析保存する。
- Implementation: 店舗ルーム（または店舗Botのいるルーム）へ `.lzh` を落とすと、`chat-knowledge` がルームから店舗を解決して `/pos-journals/upload` へ転送し、営業日と総売上を並べたカードを返す。管理画面から入れたときと同じ処理（店舗コード検証・重複スキップ・対象月判定・不完全日の修復・Journal Report の日別/月間レポート再作成）が走る。取込先の店舗が決まらないルームでは従来どおり電子ジャーナル画面へ誘導する。
- Implementation: 店舗コードの対応表を `pos_journal_store_codes` としてDB化した。これまで `POS_JOURNAL_STORE_CODE_MAP` に 1015 しか無く、店舗を増やすたびにデプロイが要ったが、insert だけで足せるようにした。解決順は「コード内の定数 → この表」で、表が空でも 1015 は従来どおり動く。
- Security: `admin-api` の内部キー経路に `/pos-journals/upload` を追加した。これまで `/pos-journals/knowledge/*` だけに絞っていた境界を広げることになるが、`storeScope` は null で通し、`uploadPosJournalFiles` 側の「ファイル名の店舗コード == 指定店舗」検証は従来どおり効く。他店舗のコードのファイルを別店舗のルームへ落としても弾かれる。
- **2026-08-28更新**: Bistro CAVACAVAは現行`1015`と旧`1020`へ対応。別店舗は、店舗コードが各店のLZHファイル名先頭4桁に入るため、実ファイルを確認して`pos_journal_store_codes`へinsertする（推測登録は禁止）。
- **2026-08-28更新**: CAVACAVA実ファイルの解凍・解析結果と本番保存行の一致は確認済み。M-talkへの再送では同一原本の重複スキップと結果カードを最終確認する。

### 2026-08-25 - トークの添付を拡張し、アプリ内で開けるようにした

- Request: 画像やPDFなど様々なファイルをドラッグ&ドロップできるようにし、すべてアプリ内で閲覧できるようにする。
- Implementation: 添付できる形式に PowerPoint と HEIC を足し、上限を 10MB→25MB へ。札を押すとその場で開くようにした（保存チップを押したときだけダウンロード）。PDFはブラウザ内蔵ビューア、テキスト/CSVは等幅表示、ExcelはSheetJSで表化しシートをタブ切替、Wordはmammothで整形表示。HEICは送信時にJPEGへ自動変換して通常の画像経路（長辺1600px・品質0.82）へ乗せ、サムネイル・アルバム・転送・Keepが使えるようにした。
- Security: Office を Office Online 等の外部変換サービスへ渡さない。署名URLごと資料が社外へ出るため、`chat-images` を非公開にしている判断と矛盾する。描画ライブラリは `public/vendor/` へ置いて自己ホストし、その形式を開いたときだけ遅延読込する。Excelはライブラリのhtml出力を使わず値だけ取り出して自前で表を組む。Wordはmammothの出力を `sandbox=""` の iframe に閉じ込める。`text/html` と `image/svg+xml` は引き続き除外。
- Note: `.lzh` は添付させず電子ジャーナル画面へ誘導する。`/pos-journals/upload` が店舗コード検証・重複スキップ・対象月判定・保存レポート再作成まで行う正本経路で、トークに添付すると取り込まれない写しだけが残るため。
- Fix: 20260828010000 で `chat_set_message_author` を書き直した際に落ちていたスタンプの `display`（compact/large）と、compact時に本文を上書きしない処理を復旧した。あわせて Keep/アルバム導入時の `grant ... on all sequences` が `chat_push_delivery_diagnostics_id_seq` の意図的な revoke を打ち消していたので戻し、アルバムの `updated_at` を更新するトリガを足し、購読されていない Realtime 配信を外した。
- Fix: M-talk のレシート重複確認で「置き換え」等に無反応だった問題。保留の会話キーが画像側 `mtalk-group-N` / テキスト側は店舗のLINEルームでずれていた。

### 2026-08-24 - M-talk検索・メニューを中央モーダルへ刷新し、入力欄を44/46px規格に統一

- Request: 提供されたデザインハンドオフ（M-talk Composer Final）に沿って入力欄まわりを仕上げる。
- Context: ハンドオフの主要な変更（下タブ4つの廃止・ヘッダーへの検索/設定移設・「＋」パネル・
  モードチップ・送信ボタンのモード連動ラベル）は`289da77`で既に本番実装済みだった。
  残っていたのは検索・メニューのポップアップの見た目と、PC幅でのボタンサイズの2点。
- Implementation:
  - 検索・メニューを、旧来のボトムシート（`.invite-overlay`共用）から、ハンドオフ最終仕様どおりの
    画面中央モーダル（暗幕+ぼかし、18px角丸、拡大しながら出現するアニメーション、行ごとの
    アイコンチップ・サブラベル）へ差し替えた。他のオーバーレイ（送信方法・招待等）と
    クラスを共有しないよう独立させた。
  - 行のサブラベルは、ハンドオフのプロトタイプ文言をそのまま使わず、実際の挙動に合わせて
    書き直した（メッセージ検索は「送って待つ」形式ではなく即時検索、メディアは
    店舗Botのルーム限定）。
  - 「＋」ボタン・スタンプボタン・送信ボタンの基準サイズをPC 44px／スマホ 46pxに統一。
    既存のスマホ用メディアクエリがwidthを上書きしていなかった不具合（円が楕円になる）と、
    `.input-area .send-btn`の詳細度に負けて高さが反映されない不具合を修正した。
- Verified: `npm run test` 全8グループ0件失敗、`npm run check`。ブラウザでPC(1000px)・
  スマホ(390px)双方の実寸(getBoundingClientRect)を直接測定し、44px/46pxの切り替わりと
  検索モーダルの表示・開閉を確認。

### 2026-08-24 - M-talkメディア閲覧を店舗Botのルームへ限定し、保存先の取り違えを修正

- Symptom: M-talkの検索ランチャー「写真・メディアライブラリ」がどのルームからも開けた
  （`289da77`で店舗Botがいるルームだけに制限済み）。加えて、M-talkからの画像投稿が
  同じ店舗の別のLINEルーム（例: エリア会議）の`line_message_media`へ保存されうる経路が
  残っていた。
- Fix:
  - `chat_store_file_bridge.ts`: 投稿元のM-talkルーム（`mtalk-group-{groupId}`）へ常に
    保存するよう修正。メディアIDも`mtalk-{groupId}-{messageId}`へ変更し
    （旧形式`mtalk-{messageId}`とも互換）、一意制約で重複投稿を防ぐ。
  - ワンタイム閲覧リンクの認証情報へ`store_partition_key`を追加し、ルームだけでなく
    店舗でも閲覧セッションを絞れるようにした。
  - `/chat-admin`のメディア一覧APIへルーム名・投稿者名の補完を追加（既存の
    `fetchRoomNameMapForIds`/`fetchSenderNameMapForUserIds`を再利用、他店舗・他ルームの
    データは混ぜない）。
  - レシート修正・解析削除コマンドの正規表現を新IDフォーマットへ追随。
- Verified: `npm run test` 全8グループ0件失敗、`npm run check`。`deno check admin-api`は
  一時的に+2件（`fetchRoomNameMapForIds`等へ渡す`supabase`の型パラメータ不一致）に
  なったため、同ファイル内の既存キャストパターンへ揃えてベースライン(186件)へ戻した。
  レシート系IDへの参照漏れがないことをリポジトリ全体で確認。
- Note: `289da77`（機能追加の本体）は前セッションが本番反映済みだったが、
  `PROJECT_PROGRESS.md`／`docs/店舗運用修正記録.md`への記録が漏れていた。

### 2026-08-24 - M-talkに個人メモを追加（送信しない私的な注記）

- Request: 同じトークルームに複数人いても、自分だけの目印・記憶の断片を、送信せず
  タイムラインへ挟みたい。
- Implementation: `chat_private_notes`（group_id, user_id, content）を新設。RLSは
  select/insert/delete のみ本人限定（`user_id = (select auth.uid())`）で、update
  ポリシーは意図的に作らず編集不可にした。insertは`chat_can_view_group(group_id)`を
  満たすルームにのみ許可。`chat.html`はメッセージ配列(`currentMessages`)とは別に
  `currentPrivateNotes`を保持し、`buildTimeline()`で時系列にマージして描画するため、
  返信・引用・メンション・検索・転送・削除など既存のメッセージ操作を一切巻き込まない。
  表示は破線・付箋色の中央寄せカードにし、通常の吹き出しと混同しないようにした。
  本人の別端末・別タブへは`chat-global`と同じRealtimeチャンネルで、
  `filter: user_id=eq.<自分>`を付けた個別購読で同期する。
- Naming: 店舗ルームへ送信してJournal Reportの資料へ登録する既存の「#メモ」とは
  無関係の別機能。混同を避けるため画面上は「個人メモ」と表示する。
- Verified: `test:chat` 87/87。本番でトランザクション適用→14試験→ROLLBACKを実行し、
  本人insert可・なりすまし拒否・他人からは0件・編集はRLSで無効化(内容不変)・
  未参加ルームへのinsert拒否・本人delete成功・anonは0件、をすべて確認。
- Migration: `20260826050000_chat_private_notes.sql`。

### 2026-08-24 - ドキュメントの既存記載ミスを修正

- Symptom: `docs/CHAT-TALK-GUIDE.md`と統合ガイドが「発言は追記のみで削除できない」と
  書いていたが、実際は自分の発言を削除できる（編集は不可）。
- Fix: 実装（`deleteMessage()`とRLSの`chat_messages_delete_own`policy）に合わせて
  「編集はできないが、自分の発言は削除できる」へ訂正した。

### 2026-08-24 - M-talkの検索通知ゼロ化（ダイアログ直接起動）およびメッセージ「通知なし（サイレント送信）」対応

- Feature:
  1. トーク下部メニューの「検索」ボタンをダイアログ直接起動（検索ランチャー）に変更し、トーク発言と他メンバーへの通知を完全排除。
  2. メッセージ入力バーに「🔔/🔕 通知なし」トグルを新設し、ON時にWeb Push通知をスキップして静かに送信する「サイレント送信」機能を実装。
- Implementation:
  - DB: `20260826040000_chat_silent_messages.sql` で `chat_messages.is_silent` を追加。
  - Edge Function: `chat-push` で `is_silent` メッセージのWeb Push送信をスキップ。
  - UI: `chat.html` で「🔔/🔕」トグル、検索ランチャーシート、メッセージ「🔕」マーク表示を実装。

### 2026-08-24 - M-talk / LINEの予定配信リマインダーを複数設定（最大5件・前日/当日）対応

- Feature: 予定配信（カレンダー予定リマインダー）を最大5スロットまで複数時刻・対象日（前日/当日）で設定できるように拡張。
- Implementation:
  - DB: `20260826030000_calendar_multi_reminders.sql` で `room_summary_settings.calendar_reminder_slots (jsonb)` と `calendar_tomorrow_reminder_logs.slot_id` を追加。
  - Edge Function: `calendar-tomorrow-cron` で複数スロットと対象日（前日/当日）を判定・配信。
  - UI: `room_settings.html` で最大5件のリマインド設定UIを実装。

### 2026-08-24 - M-talkの感情イラスト（アイコン）PC表示をスッキリしたサイズに改善

- Symptom: PC（デスクトップ）で感情イラストピッカーを開くと4列固定でアイコンが巨大化し、トーク内スタンプも圧迫感があった。
- Fix: `public/chat.html` でデスクトップ表示時のピッカー幅を最大440pxに収め、68pxグリッドでコンパクトに並ぶよう改善。トーク内のスタンプもPC表示時は最大130pxに抑え、スマホでは従来の4列・タップしやすいサイズを維持した。

### 2026-08-24 - M-talkの感情イラスト（アイコン）予約配信およびCronディスパッチ統合

- Symptom: 予約配信時に感情イラスト（アイコン・スタンプ）を送信しようとするとエラーとなり、また予約時間到来時に自動配信されない。
- Cause: `chat_scheduled_messages` テーブルの CHECK 制約（`chat_scheduled_messages_kind_check`）が `kind in ('text', 'image')` のままだった。また、毎分の pg_cron 基盤（`high-frequency-dispatcher-cron-job`）に `chat_dispatch_scheduled_messages` が統合されておらず、pg_cron からの実行権限（`postgres`）も不足していた。
- Fix: `20260825040000_chat_schedule_sticker_constraint.sql` で CHECK 制約に `sticker` を追加し、`20260826010000_chat_schedule_cron_dispatch_integration.sql` で `invoke_high_frequency_dispatcher_cron` に予約配信を組み込んで毎分確実にディスパッチされるようにした。

### 2026-08-24 - M-talk管理に権限テンプレート・アクセス一覧・監査ログ復元を追加

- Request: M-talk専用管理画面の日常運用で、一括設定・状況把握・誤操作の巻き戻しを楽にしたい。
- Implementation: `chat_permission_templates`（閲覧のみ／一般メンバー／ルーム管理者）と
  `chat_admin_apply_room_template`（`dry_run`はプレビュー専用・上限100件）、
  `chat_admin_user_effective_access`（拒否理由コード付き）、
  `chat_admin_revert_audit`（ホワイトリスト制・`source_audit_id`で二重復元防止）を追加。
  `admin-api` に `/chat-admin/templates`・`/chat-admin/templates/apply`・
  `/chat-admin/users/:id/access`・`/chat-admin/audit/:id/revert` を本部専用ブロック内へ追加した。
- Safety: 4権限の正規化を `chat_admin_normalize_member_permissions` へ集約し、既存の
  `chat_admin_update_member_permissions` もこれを通す。テンプレート適用の書き込み自体も
  既存の単体更新RPCへ委譲するため、行ロック・制約・監査ログが単体操作と同一になり、
  1対1の招待・管理禁止と `can_view=false` カスケードを迂回できない。書き込みは
  `dry_run:false` を明示したときだけ。新RPCはすべて service_role 専用。
- Verified: `test:chat` 67/67、本番でトランザクション適用→42試験→ROLLBACK、
  反映後にmigration記録・関数権限・Pages 200・未認証API 401・Edge Functions ACTIVE を確認。
- Migration: `20260825010000_chat_admin_templates_access_revert.sql`。
  ファイル名の日付が実施日より1日進んでいるが、適用済みのため改名しない。

### 2026-08-24 - 正規化関数のsearch_pathを固定

- Symptom: 上記の反映後、Supabase Advisors に `function_search_path_mutable` が1件増えた。
- Cause: `chat_admin_normalize_member_permissions` にだけ `set search_path = public` を付け忘れた。
- Fix: `20260825020000_chat_admin_normalize_search_path.sql` で判定ロジックを変えずに
  search_path を固定。実行権限は service_role 専用のまま。

### 2026-08-23 - 短い履歴の中央空白を解消

- Symptom: スマホで表示中のメッセージが少ないと、最後のメッセージと入力欄の間が大きな空白になっていた。
- Fix: 短い履歴は入力欄の直上へ寄せ、履歴が画面高を超える場合は従来どおり全体をスクロール表示する。

### 2026-08-23 - 感情イラストと漫符・記号をタブ分け

- Request: 追加イラストは既存の感情イラストと同じ列へ混ぜず、切り替えて選びたい。
- Implementation: `chat_stickers.category` を追加し、既存93点を「感情」、新規39点を「漫符・記号」に分類。ピッカー上部の横スライド対応タブで切り替える。

### 2026-08-23 - M-talk感情イラストを追加

- Request: 提供されたアイコン素材を、入力欄の感情イラスト一覧へ追加したい。
- Implementation: 既存・完全重複を除く54点を最大512pxへ最適化し、`chat_stickers` 台帳へ日本語名と表示順を追加。カタログキャッシュを更新して追加直後から取得する。

### 2026-08-23 - メッセージ入力欄の注釈見切れを防止

- Symptom: 画面幅や入力欄右側のボタンによって注釈が折り返すと、入力欄が1行分の高さのままで下側が見切れる。
- Fix: プレースホルダー変更時と画面リサイズ時に入力欄の高さを再計算し、PC・スマホとも注釈全文が見える行数を確保する。

### 2026-08-22 - M-talkの全機能使い方ガイドを復旧

- Symptom: 検索メニューの「📖 使い方（全機能）」を押しても、短い検索説明しか表示されなくなった。
- Cause: 定型応答を `chat-search` へ軽量分離した際、`srch=help` の全機能リッチカード変換が移植されていなかった。
- Fix: 既存の全機能ガイドを軽量関数でもリッチカードへ変換して返し、M-talkで廃止した会話検索の案内だけを除外する。

### 2026-08-22 - リッチカードの項目名を1行表示

- Symptom: 予約通知カードの「アレルギー」が2段に折り返されていた。
- Fix: 予約通知・レシート解析結果で共通利用する項目名列を68pxから88pxへ広げ、内容幅を下限として改行を禁止。値側だけを必要に応じて折り返す。

### 2026-08-22 - Bot参加ルームを一覧で識別

- Request: トーク一覧で、Botが参加しているルームを見分けられるようにしたい。
- Fix: ルーム参加者の `chat_users.is_bot` を一覧取得時に判定し、Bot参加ルームの名前横へ青い `BOT` バッジを表示する。通常ユーザーだけのルームには表示しない。

### 2026-08-22 - 通知アイコンと画面の未読数を同期

- Symptom: ホーム画面アイコンの通知数と、M-talk画面に表示される実際の未読数が一致しない。
- Cause: 画面は既読保存の結果を確認せず現在ルームを未読集計から除外し、DBへの既読保存エラーも検知していなかった。また、バックグラウンド中も開いているルームを既読にしていた。
- Fix: 未読数の正本をDB集計へ統一。既読upsertのエラーを検知して必ず再集計し、バックグラウンド中の新着は未読、画面復帰時に既読へ更新する。

## Document information

- Current date: 2026-08-20
- Repository: `https://github.com/MARUGO-s/line_report`
- Branch: `main`
- Work-start HEAD: `74b44e6876ceaa226578426ab323e31b5d3dd356`
- Production: `https://marugo-s.github.io/line_report/`
- Supabase: `hocbnifuactbvmyjraxy`
- Do not record secret values, customer data, message bodies, receipt images, or uploaded media here.

### 2026-08-22 - リッチカードの文字をさらに1px拡大

- Request: リッチテキスト部分のフォントを、現在からもう1段階大きくしたい。
- Fix: 見出し・項目・値・注記・ボタンをさらに1px拡大し、直前に詰めた行間と項目間隔は維持した。

### 2026-08-22 - リッチカードの行間をコンパクト化

- Request: 予約通知などのリッチテキストの行間を現在の半分程度に詰めたい。
- Fix: 項目間隔を10pxから5pxへ変更し、折り返し本文の行高を1.55から1.4へ調整。レシート解析結果にも共通適用した。

### 2026-08-22 - 予約通知・レシート解析カードの文字を拡大

- Request: 予約通知とレシート解析結果のフォントを1段階だけ大きくしたい。
- Fix: 共通リッチカードの見出し・項目・値・注記・ボタンを一律1px拡大し、両方へ同じ基準を適用した。

### 2026-08-22 - スマホのメッセージ入力注釈を1行表示

- Symptom: 入力欄のPC向けShift+Enter注釈がスマホで折り返され、下側が見切れる。
- Fix: 1024px以下では短い「メッセージを入力」へ切り替え、店舗Botルームのみ「#メモ対応」を併記する。

### 2026-08-22 - リアクションメニュー背景を60%透明化

- Request: 操作メニューの背景を60%透過にしたい。
- Fix: 背景色の不透明度を40%へ変更し、既存の背景ぼかしで文字・アイコンの視認性を維持した。

### 2026-08-22 - リアクション15種類を一画面に表示

- Request: 横スライドでは追加アイコンに気付きにくいため、全種類を表示したい。
- Fix: 横スクロールを廃止し、15種類を5列×3段で常時表示。メニューが画面下へはみ出さない位置補正も追加した。

### 2026-08-22 - リアクションの表情を15種類へ拡充

- Request: 怒り・困惑・知らんぷりなど、リアクションの表情を増やしたい。
- Fix: 😡 😓 🤔 🙄 😭 🎉 👏 👀 🤷 を追加。メニュー幅を維持したまま横スクロールで選択できるようにした。

### 2026-08-21 - メッセージ操作メニューをコンパクト化

- Request: リアクション・返信・コピー・転送の操作メニューを、より洗練された見た目にしたい。
- Fix: 半透明の小型フローティングメニューへ変更し、リアクションは横一列、各操作は丸アイコン付きの横並びに整理した。

### 2026-08-21 - リアクションを1人1つに制限

- Request: 同じメッセージには1人1リアクションとし、2つ目を選んだら1つ目を自動で消したい。
- Fix: DBの一意制約を `(message_id, user_id)` に変更。別絵文字はupsertで置換し、同じ絵文字の再選択は取り消しにした。

### 2026-08-21 - リアクションしたユーザーをLINE風に表示

- Request: リアクションを付けた人が分かるようにし、LINEのような一覧表示へ揃えたい。
- Fix: メッセージ下のリアクションを透明背景へ変更。押すと、リアクション総数とユーザーのアイコン・名前・絵文字を一覧表示する。

### 2026-08-21 - トークルームでも共通アイコン集を選択可能に

- Request: トークルームのヘッダーアイコン変更時も、ユーザー設定と同じアイコン集を使いたい。
- Fix: 複数人トークのアイコン変更画面に共通の標準アイコン70点を表示し、プリセット選択と従来の画像アップロードを両方利用可能にした。

### 2026-08-21 - 軽量検索カードが無反応になる不具合を修正

- Incident: 「検索」送信後、軽量 `chat-search` は起動するが返信カードが表示されない。
- Cause/Fix: `chat_messages.kind` に用途名 `search` を入れてDB制約に拒否されていた。表示形式を正しい `card` にし、用途は `payload.kind=search` のまま分離した。

### 2026-08-21 - ユーザーアイコン・感情イラストの表示軽量化

- Request: ユーザーアイコンとメッセージ用感情イラストの表示・一覧読み込みを速くしたい。
- Fix: 同梱画像を表示用解像度へ縮小し、遅延読み込み・非同期デコード・Service Workerキャッシュ・感情イラスト台帳の端末キャッシュを追加。新規アップロードアイコンは192px WebP＋長期キャッシュへ変更した。

### 2026-08-21 - M-talk検索の定型応答を軽量処理へ分離

- Request: 「検索」送信後と検索種別ボタン選択後の定型返信が遅いため、レスポンスを改善したい。
- Fix: DB dispatchで検索制御メッセージを判定し、レシート・画像解析を含む `chat-knowledge` ではなく専用の `chat-search` へ直接送る。検索キーワードや検索以外のメッセージは従来経路を維持する。

### 2026-08-21 - M-talk店舗Botの会話検索を廃止

- Request: 店舗Botとのトーク内で行う会話検索を削除し、トーク一覧上部の検索欄から検索する形へ統一したい。
- Fix: M-talk専用検索メニューから会話検索を除外。予定・メディア・売上検索は維持し、古い会話検索ボタン・直接コマンド・残存する検索待ちには上部の「トークルームとメッセージ検索」を案内する。

### 2026-08-21 - 招待参加時点からの履歴と段階読み込み

- Request: 新規招待ユーザーには参加前の発言を見せず、大量履歴を毎回全件通信しないようにしたい。
- Security: `chat_group_members.joined_at` を境界に、本文RLS・検索・Realtime・リアクション・未読数・Pushバッジから参加前データを除外する。
- Performance: 既存の最新50件取得、上スクロール時の50件ページング、最大12ルームのメモリキャッシュを維持し、自動テストで固定する。

### 2026-08-21 - ユーザーアイコン一覧の詰まりを修正

- Symptom: 標準アイコン70点が狭い画面で詰まり、各イラストを判別できない。
- Fix: 通常4列・スマホ3列へ減らし、各マス84px以上、12〜14pxの間隔、縦スクロールに変更。画像は `contain` で全体を表示する。

### 2026-08-21 - M-talkユーザー用の標準アイコン集

- Request: 添付したイラストをプロフィール用に最適化し、新規・既存ユーザーが自分のアイコンとして選べるようにしたい。
- Implementation: 70点を中央正方形・256px PNGへ統一して `public/profile-icons/` に保存。アイコン変更画面へ一覧を追加し、従来の画像アップロードも同じ画面から利用可能にした。
- Persistence: 選択した相対URLを `chat_users.icon_url` に保存するため、ユーザー単位で継続利用できる。
- Verification: カタログ数・画像数・新規登録・既存ユーザー更新・アップロード併存を自動テストする。

### 2026-08-21 - 感情イラストボタンを見やすくする

- Symptom: M-talk入力欄の `☺` が小さく、機能を見つけにくい。
- Fix: タップ領域はそのまま、顔を28px・太字へ拡大。スマホの入力欄幅には影響しない。
- Operation: トーク入力欄の大きな `☺` を押して感情イラストを選ぶ。

### 2026-08-21 - M-talk感情イラスト送信

- Request: 提供した感情イラストをメッセージの代わりに入力欄から送り、DBへ保存したい。
- Implementation: PNG 39点、`chat_stickers` 台帳、`chat_messages.kind='sticker'`、入力欄の `☺` ピッカー、表示・返信・転送・検索・通知用contentを追加。
- Security: クライアントの名称・パスは破棄し、有効なスタンプIDをDB台帳で照合してpayloadを再構成する。
- Operation: M-talkのトークを開き、入力欄左の `☺` → イラストをタップすると送信される。

### 2026-08-21 - 店舗ロゴ内のbot文字見切れを修正

- Symptom: 赤い `bot` マークの末尾が円形アイコンで切れていた。
- Cause: 右下端から2pxの配置が円形クリップに近すぎた。
- Fix: 右7px・下6pxへ内側移動し、文字を8pxに調整。3文字すべてを円内へ収める。
- Operation: M-talkを再読込すると、各店舗ロゴ内に `bot` が欠けずに表示される。

### 2026-08-21 - 店舗ロゴ内へ赤いbotマークを表示

- Request: 各店舗ロゴの中に、Botと分かる赤文字のマークを入れたい。
- Implementation: 店舗Botロゴの円内右下へ、白い小型背景付きの赤文字 `bot` を表示する。SVG原本と一般ユーザー画像は変更しない。
- Operation: M-talkを再読込すると、Bot一覧・トーク一覧・ヘッダー等の店舗ロゴ内に赤い `bot` が表示される。

### 2026-08-21 - M-talk店舗Botロゴを白背景に統一

- Request: 各店舗Botロゴの背景をすべて白にして表示し直したい。
- Implementation: `icons/store-bots/` の画像だけ白背景、`object-fit: contain`、4px余白に統一。一般ユーザーと通常グループ画像の `cover` 表示は維持する。
- Operation: M-talkを再読込すると、各店舗ロゴが白い円形背景の中に切れずに表示される。

### 2026-08-21 - M-talk店舗Botへ各店舗ロゴを表示

- Request: `.chat.html` の各店舗Botアカウントに、提供された各店舗ロゴを表示したい。
- Implementation: 22店舗のSVGを `public/icons/store-bots/` に追加。`chat.html` はBotの `store_key` からロゴを解決し、Bot一覧、1対1、ヘッダー、メンバー、招待、メンションで共通表示する。
- Fallback: 未対応の店舗キーは既存 `icon_url`、それも無ければ店名の頭文字を表示する。
- Operation: M-talkの「Bot」タブ、または店舗Botとのトークを開くと店舗ロゴが表示される。

### 2026-08-21 - ゴミ箱タブを一番右へ

- Request: トーク一覧のゴミ箱タブを真ん中ではなく、Bot の右（一番右）にする。
- Fix: タブ順を すべて／友だち／グループ／登録ユーザー／Bot／ゴミ箱 にする。
- Operation: トーク一覧の右端がゴミ箱。

### 2026-08-21 - 通知テストボタンがタブに重なる

- Symptom: トーク一覧の「通知テスト」が縦に潰れて、タブの上に重なる。
- Cause: ゴミ箱タブ追加後、タブ行の文字ボタンが縮んで1文字ずつ折り返していた。デスクトップは左レールにも同じボタンがある。
- Fix: タブは横スクロール、通知ボタンは右に固定。デスクトップではタブ行の「通知テスト」を出さない。
- Operation: 通知オンのPCは左の✓、スマホはタブ右の「通知テスト」。

### 2026-08-20 - ルーム削除はゴミ箱経由にする

- Request: 完全削除は危険なので、先にゴミ箱へ入れて復元と完全削除の両方できるようにする。
- Implementation: M-talkは `chat_groups.trashed_at`。作成者だけがゴミ箱へ／復元／完全削除。管理画面は「ゴミ箱へ」（dismiss）のあと、ゴミ箱一覧から復元または完全削除。完全削除はゴミ箱必須。店舗固定ルームは対象外。予約取込と店舗売上は対象外。
- Operation: トークを長押し → ゴミ箱へ移動。ゴミ箱タブから復元または完全削除。管理画面はゴミ箱へ → 画面下のゴミ箱から復元／完全削除。

### 2026-08-20 - 不要ルームの完全削除

- Request: 不要になったルームを完全削除し、関連データも消す。他ルームには影響しない。
- Implementation: M-talkは作成者のみ。管理画面は「完全削除」を別名ボタンに。`room_id` 一致の行と、そのグループの画像だけ消す。予約取込と店舗売上は対象外。
- Operation: トークを長押し → ルームを完全に削除。管理画面は完全削除。

### 2026-08-20 - 明日の予定カードからカレンダーが開かない

- Symptom: カードの「予定カレンダーを開く」を押すと「ルームが指定されていません」。
- Cause: リンクが `?group=`、予定画面は `group_id` だけを読んでいた。
- Fix: 予定画面は両方受け取る。新しいカードは `group_id`。トーク内のボタンは同じ画面で開く。
- Operation: カードのボタン、または下部の「予約・予定」。

### 2026-08-20 - 明日の予定配信の時刻を設定ページから指定する

- Request: ルーム設定の「明日の予定を配信」から、配信時刻も設定したい。
- Implementation: トグル下に本日の予約状況と同じ時刻欄。`calendar_tomorrow_reminder_hour/minute` を保存。`calendar-tomorrow-cron` が指定時刻に翌日の予定を配信。未設定は 19:00。
- Operation: 設定 → 予約・カレンダー → 明日の予定を配信をON → 時刻を保存。

### 2026-08-20 - 予約カレンダーと予定カレンダーを分ける

- Request: 予定のカレンダーには予定だけ、予約のカレンダーには予約だけ。
- Implementation: 月カレンダーの印と凡例を、開いているタブの種類だけにする。
- Operation: 「予約・予定」でタブを切り替えると、印が予約または予定だけになる。

### 2026-08-20 - 会話の予定登録先を M-talk カレンダーにする

- Request: 会話から検知した予定を Googleカレンダーではなく M-talk の予定カレンダーへ登録する。
- Implementation: LINE / M-talk の「予定の自動登録」は `line_room_calendar_events` へ保存。Gmail予約のGoogleカレンダーは据え置き。
- Operation: ルーム設定で予定の自動登録をON。「明日15時から仕込み」などと送ると、予約・予定の予定タブに出る。

### 2026-08-20 - 予約・予定は注意・特記だけ赤にする

- Request: 注意事項や特記事項だけ赤。その他は黒または白。ダークでも注意・特記は赤。
- Implementation: オレンジを外す。アレルギー・お誕生日・苦手・要望だけ赤。時刻・氏名・コースは通常色。
- Operation: 「予約・予定」を開き直す。

### 2026-08-20 - 予約・予定のオレンジをコースと内容だけに戻す

- Request: コースと予約内容だけオレンジ、注釈は赤、その他はダークで白／ライトで黒。
- Implementation: 時刻・氏名・人数は通常色。コースと予定の内容をオレンジ。アレルギー・お誕生日・要望は赤。
- Operation: 「予約・予定」を開き直す。

### 2026-08-20 - M-talk の予約・予定を画面から追加・変更・キャンセルする

- Request: 予約も予定も、表示サイトから新規追加、変更、キャンセル、日付変更したい。
- Implementation: `/chat-schedule/reservation` と `/chat-schedule/event` をチャットJWT＋メンバー確認で追加。予約は既存の手入力／取込編集と同じ店舗データ。予定は M-talk ルームのカレンダーへ保存。
- Operation: 「予約・予定」で追加／カードの編集・日付変更／キャンセル。予約キャンセルは非表示、予定は削除。

### 2026-08-20 - M-talk 予約表示をオレンジ／アレルギー赤／お誕生日ピンクにする

- Request: 予約内容はオレンジで視認しやすくし、アレルギーやお誕生日があるときは別色にする。
- Implementation: `mtalk_schedule.html` の予約カードと詳細を色分け。`/chat-schedule` は記念日・要望・苦手だけを slim して返し、生 JSON は返さない。Gmail 取込のカレンダー JSON に要望を追加。
- Operation: 「予約・予定」の予約タブで、アレルギーは赤字、お誕生日／記念日はピンク。

### 2026-08-20 - M-talk から予約と予定をタブ切替で見る

- Request: M-talk から使え、予約取り込みと同じ予約と同期し、予約／予定をタブで切り替える。
- Implementation: トーク下部「予約・予定」から `mtalk_schedule.html` を開く。`GET /chat-schedule` はルームメンバーJWTのみ。予約は Gmail 取り込みと同じ店舗カレンダー、予定は同店舗のカレンダーイベント。
- Operation: 店舗Botのいるルームで「予約・予定」→ 予約タブ／予定タブ。月送りで一覧。

### 2026-08-20 - iPhoneホーム画面アプリの通知表示を公式形式に合わせて直す

- Symptom: Apple PushへはHTTP成功するが、ホーム画面のM-talkに通知バナーが出ない。別作業の診断実装が途中で止まっていた。
- Cause: ペイロードの`app_badge`をトップレベルに置いていた。WebKit公式（Meet Declarative Web Push）では`notification.app_badge`の文字列。形式がずれると宣言型通知が捨てられ、Service Worker失敗時に何も出ない。
- Fix: `app_badge`と絶対URLの`icon`を`notification`内へ移す。iOS 18.4+は`window.pushManager`で購読する。テスト通知は4秒遅延し、ホームへ戻してから届くようにする。Apple送信／SW受信／表示の診断テーブルを追加する。
- Operation: ホーム画面のM-talkを開き、ベルで通知ON→「通知テスト」→すぐにホームへ戻る。4秒後にバナーが出れば成功。

### 2026-08-20 - Apple向け通知をDeclarative Web Pushへ切り替える

- Symptom: iPhoneは新しいApple Push endpointへ再登録され、Apple側HTTP成功でも通知画面が出なかった。
- Investigation: 独自`aes128gcm`暗号化は標準`http_ece`で復号でき、VAPID/暗号化は互換。残る失敗点はWebKitのService Worker通知処理。
- Fix: ペイロードをWebKit Declarative Web Push (`web_push: 8030`)へ変更し、絶対HTTPS `notification.navigate`とトップレベル`app_badge`を送る。対応WebKitはService Worker失敗時もOSがfallback通知を表示し、未対応ブラウザは既存SWが同じ辞書を表示する。
- Security: 遷移先は`https://marugo-s.github.io`同一originだけを許可し、外部URLは`/line_report/chat.html`へ固定する。
- Verification: ペイロード形式・外部URL拒否・バッジ境界・通常Web Push暗号化のテストを追加。全chatテスト、Deno型チェック、静的チェック成功。

### 2026-08-20 - iOSホーム画面アプリで新UIが出ない問題に自動再読込を追加

- Symptom: 通知テストを追加しても、iPhoneのホーム画面版M-talkに「通知テスト」ボタンが出ず、旧UIのままだった。
- Cause: iOSのstandalone PWAは一度開くと旧HTMLがメモリに残り、Service Workerを更新しても再読込されない。
- Fix: 新しいService Worker有効化(`controllerchange`)時に、`sessionStorage`で1回だけ自動再読込する。復帰時に`registration.update()`と待機SWの`SKIP_WAITING`で更新を早める。キャッシュ名を`v43`へ更新。
- Verification: `npm test`全通過、`npm run check`、Deno型チェック、`knowledge:check`成功。Pages/Edge Function本番デプロイ確認。
- Operation: 変更後は、ホーム画面のM-talkを開くと一度だけ自動で更新→「通知テスト」が表示される。出ない場合はアプリを完全終了して開き直す。

### 2026-08-20 - M-talk の通知再開で購読が増殖する不具合を直し、端末テストを追加

- Symptom: 通知再開後もスマホに表示されず、同じアカウントのiOS購読がタップのたびに増えた。
- Cause: 正常な購読がある場合にも、最初の画面タップを「復旧操作」として扱って購読を破棄・再作成していた。Pushサービスは残った旧購読にも成功を返すため、サーバー上は成功でも端末表示を保証できなかった。
- Fix: 自動の画面タップ復旧を廃止し、オレンジの再開バー／ベルを明示的に押した時だけ再購読する。新しい購読の保存時は、同じユーザー・同じUser-Agentの旧endpointを停止する。通知ON後は現在のendpointだけへテスト通知を送る「通知テスト」を表示する。
- Operation: ホーム画面版M-talkでベルを押して通知ONにし、「通知テスト」を押す。届かなければ再開バーから1回だけ再登録し、もう一度通知テストを押す。

### 2026-08-20 - M-talk の切れたスマホ通知を再開できるようにする

- Request: `chat.html` の新着をスマホへ通知したいが、通知ON後も届かない。
- Cause: Service Worker の登録URLへクエリ文字列を付けて変更したため、端末側で別Workerとして扱われ、既存Web Push購読がHTTP 410になった。切れた購読をそのまま再利用していた端末もあった。
- Fix: Worker URLを安定した `chat-sw.js` へ戻し、通知希望が残っているのに購読が無い場合は「通知が切れたので、ここをタップして再開」を表示する。タップ時は古い購読を破棄し、同じVAPID公開鍵で新規購読してサーバーへ再登録する。
- Verification: 2026-08-20 15:02 JSTにPages反映。反映後の本番Web Pushは2 dispatch・12端末送信・失敗0、再登録された有効購読7件すべてで送信成功を確認。
- Operation: iPhone/iPadはホーム画面のM-talkを開き、オレンジの再開バーまたはベルを1回タップする。通常Safariからは設定せず、OS側で通知拒否なら端末設定からM-talkを許可する。

### 2026-08-20 - M-talk に LINE の「検索」メニューを載せる

- Request: LINE で「検索」と送ると出る会話／予定／メディア／売上の操作を M-talk 専用に移植する。
- Implementation: 店舗Botのいるルームで「検索」と送ると、同じカードが出る。ボタンのあとキーワード（売上は日付）を送ると LINE と同じ検索が走る。
- Operation: マルゴセカンドのルームで「検索」→ 会話検索／予定検索／メディア検索／売上検索／使い方。

### 2026-08-20 - M-talk に LINE と同じルーム設定を載せる

- Request: LINE の「設定」で開くルーム設定と全く同じ機能を、M-talk のルームにも載せて運用できる状態にする。
- Implementation: トークごとに `room_summary_settings`（`mtalk-group-{id}`）を持ち、同じ画面で ON/OFF。ログイン済みメンバーだけが触れる。本日の予約と Gmail 予約通知は、ON にしたトークへ届く。
- Operation: ルームで「設定」と送る、または右上の歯車／トーク設定から開く。マルゴセカンドの Bot がいるルームで「本日の予約状況配信」を ON にすると、そのルームへ当日分が届く。

### 2026-08-20 - 同日レシート確認を LINE と同じレイアウトにする

- Request: すでにデータがある場合は、LINE と同じ説明文・同じ並び・数値は太字。
- Cause: 「総売上」があるカードを売上レポート扱いし、説明文を捨てていた。太字と primary ボタンも写していなかった。
- Fix: Flex の順番どおりに説明・項目・警告を残し、数値を太字、日付変更を緑ボタンにする。
- Operation: 同じ日付の再送は、説明・太字の金額・オレンジの警告・加算／中止／置き換え／日付変更が出る。既に出ている古いカードは、もう一度送ると新しいレイアウトになる。

### 2026-08-20 - 売上レポートカードの区切りと赤字を直す

- Request: 08:34 のように、予算・前年比の区切りと赤字で返す。
- Cause: LINE Flex をカードへ写すとき、見出しを先頭にまとめ、色と区切りを捨てていた。
- Fix: Flex の順番どおりに項目・区切り・見出しを写し、赤字を残す。
- Operation: レシート返信は店名〜客単価、月次、予算（赤字）、前年比（赤字）の順。

### 2026-08-20 - 招待ルームのレシート解析 500 を直す

- Request: Botのいるルームへレシートを送っても無反応。
- Cause: chat-knowledge が chat_users を embed して PostgREST 500。
- Fix: 送信者は user_id で別に取る。既存の日計画像は再処理済み。
- Operation: 同じ日が登録済みなら加算／中止／置き換え／日付変更のカードが返る。

### 2026-08-20 - 招待した店舗Botがレシートを解析する

- Request: Bistro CAVACAVA bot を招待したルームに日計レシートを落とすと、その店として解析・返信する。
- Implementation: 店舗Botがいるルームの投稿は、その Bot の store_key で chat-knowledge を動かす。
- Operation: Bot を招待したルームへレシート画像を送ると、その店舗の売上レポートが返る。

### 2026-08-20 - すべてタブからも店舗Botを外す

- Request: グループだけでなく「すべて」にも Bot を出さない。
- Implementation: 店舗ルームと店舗Botの1対1は、すべて／友だち／グループに出さない。Botタブから開く。検索すれば店舗ルームは出る。
- Operation: ホームは通常のトークだけ。店舗Botは Bot タブ。

### 2026-08-20 - 店舗Botの名前を「店名 bot」にする

- Request: Botタブは「Bot」ではなく「クラウディア2 bot」のように店名＋bot。
- Implementation: 表示名・返信名を `${店名} bot` にする。アイコン文字は店名の頭文字。
- Operation: Botタブに「クラウディア2 bot」と出る。

### 2026-08-20 - 店舗Botの表示名を Bot にする

- Request: 店舗Botのアイコン名を店名ではなく Bot にする。
- Implementation: 画面上の名前とアイコン文字を Bot にする。メッセージ投稿名も Bot。店名は Bot タブの補足に残す。
- Operation: メンバー・1対1・返信の名前が Bot になる。

### 2026-08-20 - Botをグループタブに出さない

- Request: Botはグループに入れない。招待されたルームのメンバーか 1:1 だけ。グループタブに単独表示しない。
- Implementation: グループタブから店舗ルームを外す。店舗Botの自動参加をやめる。Botタブは 1対1 と既存ルームへの招待だけ。
- Operation: 店舗ルームは「すべて」。Botは Bot タブから 1対1 か招待。

### 2026-08-20 - ルーム切替をキャッシュして速くする

- Request: ルームを選ぶたびに画像を読み直して遅い。キャッシュで軽く・速くする。
- Implementation: 直近12ルームの本文をメモリに残し、切替時はすぐ描画してから差分更新。画像の署名URLは sessionStorage に残す。
- Operation: 一度開いたルームは、次から本文と画像がすぐ出る。

### 2026-08-20 - 登録ユーザーの横に Bot タブを追加する

- Request: 登録ユーザータブの横に Bot タブを作り、店舗Botをそこに表示する。
- Implementation: `chat.html` のトーク一覧タブに Bot を追加。登録ユーザーは人だけ、Bot タブは店舗Botだけ。
- Operation: Bot タブから店舗Botを選んで、ルームへ招待できる。

### 2026-08-20 - 店舗Botを登録ユーザーとして追加する

- Request: 店舗用アカウントを LINE の Bot のようにする。登録ユーザーとして扱い、その Bot がいるルームの投稿を紐づいた店舗へ送る。
- Implementation: 店舗ごとに `chat_users` の Bot を作る。店舗ルームに入れ、他ルームへ招待もできる。返信はその店舗Bot名義。
- Operation: 店舗ルームのメンバーに店舗Botが見える。別ルームへ招待すると、そのルームの画像・#メモも同じ店舗へ送る。

### 2026-08-20 - 同日レシートの返信カードが空になる

- Request: レシート送信後の返信が空の白いカードになっていた。
- Cause: LINE Flex の `contents` はバブルオブジェクトなのに、配列のときだけ中を見ていた。
- Fix: オブジェクトの `contents` も辿る。中身のないカードは出さず本文を出す。
- Operation: 同じ日付の再送なら加算／中止／置き換え／日付変更のカードが出る。

### 2026-08-20 - レシート修正・削除を保存済み行だけに限定する

- Request: 操作と登録の構造を LINE と同じにする。削除は同じ日付だけ。他データは絶対に消さない。
- Cause: 同日登録済みでもカードを出し、存在しない `mtalk-*` ID で修正していた。
- Fix: 保存できた行の RID で修正・削除する。同日重複は LINE と同じ確認カード。削除は `id` と `receipt_date` の両方一致の1行だけ。置き換えも同じ日付だけ。見つからない行は消さない。
- Operation: 新しい日付ならレポートの修正／削除。同じ日付の再送なら加算／中止／置き換え／日付変更。番号入力も LINE と同じ修正フロー。

### 2026-08-20 - M-talk のレシート返信を LINE と同じにする

- Request: レシート画像を送ったとき、LINE と同じ解析方法・同じ返信形式にする。
- Implementation: `buildReceiptChatCard` が LINE Flex と同じ項目・赤字・ボタンを出す。解析は Gemini Flash Lite → Azure → Claude。カードの修正／削除は LINE と同じコマンドを投稿して処理する。
- Operation: 店舗ルームへレシート画像を送ると、LINE と同じ売上レポートが返る。

### 2026-08-20 - 画像添付でも即送信か予約配信かを選ぶ

- Request: 画像やファイルをドロップ・添付したときも、即配信か予約配信かを聞いてその通り動かす。
- Implementation: 添付・ドロップ・貼り付け後に選択ポップアップを出す。予約なら既存の日時指定へ進み、画像は先に `chat-images` へ置いて `chat_schedule_message` で予約する。
- Operation: 画像を付ける → 「今すぐ送る」または「予約配信」。

### 2026-08-20 - M-talk に予約配信を追加

- Request: メッセージを即送信せず、日時を指定して送りたい。入力欄に予約配信ボタンを置く。
- Implementation: `chat_scheduled_messages` に本人の予約を保存し、毎分 `chat_dispatch_scheduled_messages` が到来分を `chat_messages` へ入れる。入力欄の時計ボタンから日時を選び、予約の取消もできる。
- Security: 予約の作成・閲覧・取消は本人のみ。送信時にルーム非参加なら送らない。
- Operation: 本文を書いて時計ボタン → 送信日時 → 「この日時で予約する」。

### 2026-08-19 - 店舗ルームの画像は LINE と同じくメディア閲覧へ

- Request: `#メモ` が付いていない画像・ファイルは資料ではなく、LINE と同じくメディアライブラリへ保存し、同じ反応を返す。
- Implementation: 店舗ルームの画像は `line_message_media` へ保存する。レシートなら既存の解析・売上登録を使い、トークへレポートを返す。`#メモ` のリプライだけ資料へ移し、そのときメディア閲覧の複製は消す。
- Security: メディアは従来どおり非公開 `line-media`。内部 dispatch の認可は変えない。
- Operation: 画像を送る＝メディア閲覧。資料にしたいときだけ画像へリプライして `#メモ`。

### 2026-08-19 - 店舗ルームの画像を資料にし、改行とドラッグ＆ドロップを足す

- Request: 店舗ルームへ送ったレシート画像にも `#メモ` と同じ登録結果を返す。資料はドラッグ＆ドロップで入れたい。PCは Shift+Enter で改行、スマホでも改行したい。
- Implementation: `chat-knowledge` は店舗ルームの画像メッセージをそのまま Journal 資料へ送る。トーク画面は画像のドロップ／貼り付けに対応し、入力欄を textarea にした。PCは Enter 送信、スマホは送信ボタンで送り Enter は改行。
- Security: 画像は従来どおり参加者が `chat-images` へ置くだけ。資料登録は内部 dispatch のまま。
- Operation: 店舗ルームで画像を送るかドロップする。成功すると予約通知 Bot が資料登録の結果を返す。

### 2026-08-19 - 店舗ルームの #メモ が無反応だった原因を直す

- Request: Bistro CAVACAVA 店舗ルームへ `#メモ` を送っても Bot も Journal 資料も動かない。
- Cause: `chat-knowledge` だけ `verify_jwt` が既定の true のまま。pg_net の内部シークレットは JWT ではないためゲートウェイが 401。
- Fix: `config.toml` に `[functions.chat-knowledge] verify_jwt = false` を足し、関数側の `dispatch_secret` 照合はそのまま。
- Security: ゲートウェイ JWT は切るが、関数内で DB 生成シークレットを定数時間比較する。公開ページから呼べない。
- Operation: 店舗固定ルームで `#メモ 本文`、または画像へリプライして `#メモ`。成功すると予約通知 Bot が資料登録の結果を返す。

### 2026-08-19 - トークに既読・リアクション・返信引用・メンションを追加

- Request: LINEにあってトークに無い便利機能のうち、必要なものを実装する。
- Implementation: `chat_read_states`は自分の行しか見えず他人の既読を知れなかったため、同じグループの参加者どうしは互いの既読時刻を参照できるようにした（書き込みは自分の分のみ）。自分の発言へ「既読 N」を出し、1対1では人数を出さず「既読」だけにする。`chat_message_reactions`を追加し6種の絵文字を付け外しできる（発言と違い自分の分は取り消せる）。`chat_messages.reply_to_id`で返信引用を持ち、返信先が同じトークルームの発言であることをトリガで強制する。`chat_messages.mentions uuid[]`はクライアントの申告を信用せず、トリガでそのグループの参加者だけへ絞り込む。入力欄の`@`で候補を出し、名指しされた人のWeb Push本文の先頭へ「@あなた宛」を付ける。
- Fix: 吹き出しの`white-space: pre-wrap`を`.bubble-text`へ移した。吹き出し全体がpre-wrapのままだと、引用ブロックを組み立てるテンプレート文字列の改行とインデントが表示され、引用が縦に間延びする。
- Security: 返信先とメンションはサーバー側で検証する。リアクションは自分の分しか付けられず、他人の分は消せない。
- Operation: リアクションと返信はメッセージの`⋯`ボタンから。リアクション取り消しは付いているチップを再タップ。

### 2026-08-19 - トークに過去メッセージの遡り・日付区切り・画像送信・本文検索を追加

- Request: LINEにあってトークに無い便利機能のうち、影響の大きいものを実装する。
- Implementation: 直近50件で打ち切りだった読み込みを、上端まで遡ったら50件ずつ追加取得し、読み込み後も見ていた位置を保つようにした。日が変わる位置へ「今日／昨日／日付」を挟む。画像は非公開バケット`chat-images`へ置き、表示のたびに署名URL（1時間）を作る。送信前に長辺1600px・JPEG品質0.82へ縮小する。検索ボックスは「トークルームとメッセージ検索」と表示しながら実際はルーム名と最後の1件しか見ていなかったため、参加中の全トークを`ILIKE`で引き、ヒット箇所を強調し、タップで前後25件を読み込んでその発言へ飛ぶようにした。
- Note: 日本語は`to_tsvector`が効かないため全文検索ではなくpg_trgmのGINインデックスを使う。このプロジェクトのpg_trgmは`extensions`ではなく`public`スキーマにあるので、演算子クラスのスキーマを決め打ちせず実際の場所を引いて索引を張る。
- Security: レシートや予約表など顧客名の写った写真が流れる前提のため、アイコン用`chat-icons`と違い`chat-images`は非公開にする。読み書きはそのグループの参加者だけ。update/deleteのポリシーは作らない（発言と同じく追記のみ）。`kind='image'`のpayloadはトリガで作り直し、保存先が必ず送信先グループ配下であることを強制する。
- Known limit: 検索から途中へジャンプしている間は新着を継ぎ足さない。並びに穴が空くため「最新へ」で読み直す。

### 2026-08-19 - LINEの予約通知をトークへカードで複製

- Request: LINE「マルゴ予約」ルームへ送っている予約通知を、トークの「マルゴセカンド予約」にも同じように送る。
- Implementation: `chat_messages`へ`kind`と`payload`を足し、Flex Messageに対応するカードを描画できるようにした。`room_summary_settings.chat_group_id`でLINEルーム→トークルームを対応付け、未設定のルームは従来どおりLINEのみとする。`gmail-alert-cron`（新規予約・変更・キャンセル）と`reservation-today-cron`（本日の予約まとめ）は、LINE送信が成功した分だけ複製する。`reservation-today-cron`は送信失敗時にログ行を消して再送するため、成功時のみ複製することで二重投稿を避ける。投稿後に`chat-push`の内部dispatch経路を叩いてWeb Pushまで配信する。
- Security: `card`はservice_roleからしか作れない。ブラウザからのinsertは`chat_set_message_author`トリガで必ず`text`へ落とす。送信者用Botは`banned_until=infinity`と受信不能な`.invalid`メールでログインを封じる。
- Note: `content`には従来どおりプレーンテキスト版を入れる。トーク一覧のプレビューとWeb Push本文はここを見るため、payloadが読めなくても表示が壊れない。
- Operation: 通知を受け取る人は対象トークルームへの招待と、トーク画面での通知ONが必要。

### 2026-08-19 - トークをPWA化し、新着をスマホへWeb Push通知

- Request: `public/chat.html`へ新しいトークが入ったら、ホーム画面へ追加したスマホへ通知を出す。
- Implementation: チャット専用manifest／Service Worker／通知ON-OFFを追加。`chat_push_subscriptions`とユーザー共通設定をservice-role専用で保存し、`chat_messages` INSERT後の非同期triggerから`chat-push` Edge Functionを呼ぶ。送信者本人を除外し、無効購読は自動停止、同一メッセージは重複送信しない。通知タップで対象グループを直接開く。ホーム画面アプリ対応端末では、全トークの未読合計をアプリアイコンの数字バッジへ表示し、既読・通知OFF・ログアウト時に更新／解除する。スマホ表示はノッチ／Dynamic Island／角丸／ホームインジケータのsafe-areaへ上下左右の最低余白を重ね、縦横・ソフトウェアキーボード時もVisual Viewport内へ固定する。ピンチ拡大とiOS入力自動ズームを抑止する。ブラウザのタブ／ブックマーク、iPhoneホーム画面、Android/PWA、通知アイコンは、キャッシュを避ける新しい`chat-*v2`系ファイル名の「緑地＋白い吹き出し＋3点」へ統一し、他の管理画面のLINE Reportアイコンには影響させない。
- Security: 購読情報はData APIへ露出せず、ブラウザ操作はSupabase Auth本人確認、内部dispatchはDB生成シークレットで認可。VAPID秘密鍵はSupabase VaultまたはEdge Secretのみで管理する。
- Operation: iPhone/iPadはホーム画面に追加したトークから通知を許可する。Android/PCはトーク一覧のベルから許可する。

### 2026-08-18 - 推定動員を実測として扱わない

- Request: FOOD STADIUM改善案のうち、予測・AIを正確にする最小変更だけ入れる。
- Implementation: 会場収容の推定はラベル専用。入力欄の初期値、日次バッジ、規模帯、最大動員、期間ランキングは `expected_attendance` だけを使う。AIキャッシュを v18 に更新。
- Skipped: テーブル再設計、7日人員予測、欠損フラグ付きGLM、例示スプレッドシートの取り込み。

### 2026-08-18 - 公開画面のスマホ切れと空の売上シートリンクを修正

- Request: 2026-08-18 UX監査の高優先度。売上シートが空リンク、メディアが横にはみ出す、売上分析・口コミの上部ナビとシステムマップ／AI学習タブが390pxで切れる。
- Implementation: 売上シートは http(s) URL があるときだけ表示し、`#` はクリック無効。売上分析・口コミのヘッダーpillを折り返す。メディアのフィルタを縦積み。システムマップとAI学習タブを折り返す。
- Skipped: 言葉の整理、502再試行UI、空状態の長文改善は今回対象外。

### 2026-08-17 - 電子ジャーナル画面を1つのPDFにまとめて出力

- Request: 電子ジャーナル（POS取込）の画面を1枚のPDFにまとめて出力できるボタンを作る。
- Implementation: `public/pos-journal.html` の店舗・対象月ツールバーへ「PDFにまとめる」を追加。1ページ目はKPI・日別推移・決済・日別サマリー、2ページ目は商品ランキング。既存のAI分析PDFと同じ `window.print()` で保存する。アップロード・保管原本・会計明細は含めない。
- Verification: `tests/pos_journal_ai_history.test.mjs` に画面ボタンと印刷経路の検査を追加。

### 2026-08-13 - AI学習・進化の信頼度スター表示をカード内へ修正

- Request: 概要タブの「予測の信頼度」で星がカード右端からはみ出す。
- Fix: OS依存で横幅が大きくなる絵文字星を文字星へ変更し、信頼度表示だけ26px・改行なし・カード内クリップに固定。1280px表示で星幅144px、カード幅183px、カード越境なしを確認した。

### 2026-08-13 - AI学習・進化ページを5タブ構成へ整理

- Request: 提供された高精細デザイン設計に合わせて、AI学習 進化トラッキング画面の長い縦積みレイアウトを整理する。
- Implementation: `概要`／`学習曲線`／`全記録`／`判定基準`／`自己進化`の5タブへ既存の実データブロックを再配置し、初期表示を概要に固定。全記録は直近12件を既定表示として全件切替を追加し、判定基準は説明との2カラム、自己進化は準備状況・RAG・品質ループ・モデル選択をまとめた。既存の認証、API取得、合格基準保存、評価セット作成、候補下書き、書き出し、回答評価は維持する。

### 2026-08-13 - AI学習をプロンプト候補比較の準備段階へ移行

- Request: 自己進化の次段階へ移行する。
- Decision: 画面の実績（承認済み23件・人の承認7件・日次教材12件）により「プロンプト候補の比較評価」の開始条件は満たす。一方、モデル蒸留は承認済み100件・人の承認20件・日次教材30件・3surface以上が必要なため、開始しない。
- Implementation: `foodcourt_prompt_evaluation_sets`／`foodcourt_prompt_evaluation_cases`で承認済み回答の固定評価セットを作成し、`foodcourt_prompt_candidates`へ手動の候補指示を下書き登録できるようにした。評価セットは現在のベースライン回答を固定するだけで、本番プロンプト・モデル・自動昇格を変更しない。RLSと`anon`/`authenticated`からの権限剥奪を適用し、操作は認証済み`admin-api`に限定する。

### 2026-08-13 - 予約を加味した集客構造の利用可能期間を固定

- Request: 予約を加味した集客構造は、Bistro CAVACAVAが2026年5月から予約取り込みを始めた分だけを使う。他店舗は未開始であり、将来店舗を増やすまで予約要因を使わないことを明記・常時参照する。
- Implementation: `public/jnm/jnl2txt.html`に予約取り込み開始月の正本を追加し、CAVACAVAは2026-05以降だけ予約 vs 飛び込み（月次）を生成するよう制限。開始前を予約0件／飛び込み100%として扱わない。予約未開始の他店は予約分析を生成しない。さらに`ai-analyze`のサーバー固定ポリシーにも同じ店舗・期間制約を入れ、クライアント文脈が欠けてもAIが常に参照する。正本は`docs/RESERVATION-AI-COVERAGE.md`。

### 2026-08-13 - 電子ジャーナル画面を5タブへ再編

- Request: 電子ジャーナルのブロックをタブ化し、AI分析・質問・履歴カードは単独タブへ分離。タブ順は売上サマリー、商品ランキング、ジャーナルアップロード、保管ファイル、AI売上分析にする。
- Implementation: `public/pos-journal.html`を指定順の5タブへ再編し、ページを開くたび必ず売上サマリーを初期表示にした。KPI・日別推移・決済内訳・日別サマリーは売上サマリー、AI分析・質問・PDF・履歴はAI売上分析へ分離した。AI売上分析には、現在の画面を残してJournal Reportの詳細分析を別タブで開く「詳しく分析する」ボタン（`/jnm/jnl2txt.html`）を追加。Journal Report側のヘッダーにもLINE Report電子ジャーナルへ戻る「LINE Reportへ」ボタン（`/pos-journal.html`）を追加。商品ランキングは従来の合計に加え、商品コードまたは保存済みのカテゴリを基準にフード／ドリンクだけを切り替えて表示できる3表示にした。既存のアップロード、保管原本のダウンロード／削除、AI分析・質問・PDF・履歴のID・イベント・APIは維持。左右矢印／Home／Endのキーボード操作にも対応。
- Verification: `npm run test:pos-journal` 57件成功、`npm run check`、`git diff --check`成功。ローカルPagesでページ初期表示とAIタブを開いた後の再読込がどちらも売上サマリーになること、商品ランキングの合計／フード／ドリンク切替、AIタブ単独表示を確認。390px幅では横スクロールなし（タブは3行）。

### 2026-08-13 - レシート無反応の原因究明とWebhook消失対策（Edge 502／CPU Time exceeded）

- Symptom: 2026-08-13 14:10 JST、クラウディア2ルームのレシート画像が完全に無反応。確認カード・解析通知・`line_webhook_delivery_logs` のいずれも無し。
- Root cause: LINE の `POST /line-webhook/claudia2` に対し Supabase Edge Functions が **9ms で 502**（`05:10:20.952Z`）。アクセスログに `function_id` / `version` / `x-served-by` が無く、同時刻の boot ログも無いため、**関数コードは一度も実行されていない**（ワーカー起動前のゲートウェイ障害）。LINE の webhook 再送は既定OFFのため、このイベントは raw 保存も返信もされず恒久消失した。
- Related failures: 同日 `02:57:16Z` にマルゴ四谷が 503 `SUPABASE_EDGE_RUNTIME_SERVICE_DEGRADED`（7ms）、その30秒後と前日 `08-12 12:26:19Z` に `line-webhook` ワーカーが `CPU Time exceeded` で強制終了。いずれも同じ「無反応」に見える。
- Platform context: 当リポジトリの Edge デプロイ run `31668740838` は 05:00:01Z 完了。`line-webhook` v865 の `updated_at` は 05:04:15.876Z で、`/app/` 系13関数が同ミリ秒に一斉更新されているため Supabase 側の一括ロールアウト。その6分後の初回コールドスタートが 502 を踏んだ。
- Fix 1 (requires LINE console): 各チャネルで **Webhook 再送を ON**。`webhook_event_id` による冪等化が既にあるため二重返信・二重登録は起きない。これが 502/503 を踏んだレシートを救う唯一の自動復旧経路。
- Fix 2 (repo): `deploy-edge-functions.yml` に **Warm up webhook-facing functions** を追加。デプロイ後に `line-webhook` / `line-admin-webhook` / `admin-api` を GET で起こし（405 / 405 / 401 の軽い経路、DB書き込みもLINE送信も無し）、5回リトライしても 5xx ならジョブを fail。新バージョンの初回起動を店舗のレシートに踏ませない。
- Fix 3 (repo): 1画像を最大7回のモデル呼び出しへ渡すたびに base64 をフル再エンコードしていた箇所を、同一 `Uint8Array` を WeakMap で使い回す `encodeVisionImageBase64` に統一。`foodcourt_compare.ts` も同様。`CPU Time exceeded` の発生確率を下げる。
- Verification: `npm run test:receipt` 32件（新規2件）、`npm run test:ci` 250 tests / 0 fail、`npm run check`、`git diff --check` 成功。`deno check line-webhook/index.ts` は変更前後とも16 errors（既存のみ）で新規増加なし。warm-up は `bash -n` と本番実行で `405 / 405 / 401`・exit 0 を確認。
- Outstanding: 14:10 のレシートは復旧不能のため**同じ画像の再送が必要**。再送時は横長ヤマト対応（`017fade`）により「木次乳業有限会社／木次パスチャライズ牛乳 1000ml／¥5,670」となる想定。

### 2026-08-13 - ヤマト宅急便コレクト横長領収証の小口解析ブロックを追加

- Request: LINE小口登録で、従来のヤマト送り状とは異なる横長の宅急便コレクト領収証を解析し、伝票内の発送元・品名と右上の金額を読み取れるようにする。
- Format: 左上に「領収証／宅急便コレクト」、左端に縦書きの「お届け先／発送元／品名」、右上に枠付き「代金引換額（税込）」がある横長形式。従来の「左下ご依頼主・品名欄なし」形式とは別ブロックとして扱う。
- Extraction: `store_name`は「発送元」欄の会社名、`line_items[0].name`は「品名」欄の具体的な商品名、`gross_sales`と明細価格は右上の「代金引換額（税込）」を正本にする。宛先の自店名、下部のヤマト運輸株式会社、併写のレジ出金伝票は店名・品名に使用しない。
- Example verified from the provided image: 仕入先=`木次乳業有限会社`、品名=`木次パスチャライズ牛乳 1000ml`、税込金額=`¥5,670`、飲食料品のため8%。下流の小口変換は出金¥5,670・内税¥420・税抜¥5,250・食材として整合する。
- Compatibility: 横長形式に一致した場合は旧ヤマトブロックの「品名＝発送元」を適用しない。従来の左下「ご依頼主」型は既存ブロックをそのまま利用する。
- Verification: `receipt_prompt.ts`の`deno check`、専用プロンプト配線テスト、下流小口変換テスト、`npm run test:receipt` 31件、`npm run check`、`npm run test:ci` 248 tests / 0 fail、`git diff --check`に成功。合成プロンプトは21,101 / 22,000字で末尾ブロックまで保持。
- Deploy: commit `017fade`をmainへpush。`line-webhook` version 864、`admin-api` version 854（ともにACTIVE）へ反映し、GitHub Actions Edge run `31668740838` / Pages run `31668740834`はsuccess。未認証`admin-api /petty-cash/receipt-image`は401、署名なし`line-webhook/claudia2`は403。実画像を本番解析APIへ送ると小口行が実登録されるため、自動E2Eは非破壊のプロンプト・下流変換・配線確認までとし、次回LINEから同画像を再送して確認カードの仕入先／品名／金額を確認する。

### 2026-08-13 - 電子ジャーナル画面のLZH登録から保存済み日別・月間レポートを自動生成

- Request: LINE Reportの電子ジャーナル画面へLZHをドロップした場合も、Journal Reportの「保存済みレポート」に日別・月間を自動作成する。
- Behavior: `/pos-journals/upload` の保存・修復・重複確認後、影響月の有効な `pos_journal_files` を読み直す。既存保存レポートが原本より広い期間を持つ場合は最も広い月データを土台にし、LZH原本がある営業日だけ原本で差し替えて、月単位の日別／月間レポート2件を再構築する。今回投入したファイルだけで完全月を縮めない。`sourceMonths`を持たない旧レポートもタイトル／期間から参照候補へ含めるが、ユーザー作成の合算レポートは自動更新先IDにしない。
- Idempotency: 同じ月を再アップロードしても新しい重複レポートを増やさない。既存の単月日別・月間レポートがあればそのIDと作成日時を維持して更新し、無い場合だけ決定的ID `pos_journal_auto_<store>_<YYYYMM>_daily|monthly` で作成する。重複LZHだけの再送でも不足していた保存レポートを修復できる。
- Data: 保存データには伝票、商品明細、日計客数・組数・税、決済、天候、昼夜、カテゴリ集計、商品ランキング、曜日／時間帯、原本IDを含む。店舗別の商品分類上書きを適用し、未知コードは「その他（要確認）」、LZH原本の `posJournalDays` も保持する。
- Failure handling: 原本保存は成功したがレポート生成が失敗した場合は、API応答を `ok=false` にして月別エラーを返し、画面に「保存済みレポートで失敗」と表示する。既存レポートを部分的に削除せず、再アップロードで再生成可能。
- Verification: 部分原本マージ、旧日別断片の統合、取消明細の負数保持、不整合な旧原本明細の安全維持、自己完結HTML保存、API/UI配線、正常な同時刻・同額会計と組数≠伝票行数の割勘を誤って重複除外しない条件、新しい部分断片で同じ広さの完全月を上書きしない条件、旧単月IDを維持し合算IDを上書きしない配線を回帰テストで固定。対象テスト27件、`npm run test:ci` 246 tests / 0 fail、`npm run check`、変更共有モジュールの`deno check`、`git diff --check`に成功。`admin-api`全体の`deno check`は既存173エラーから増加なし。本番原本3日だけの再生成で月が3日に縮む問題をE2E中に検知し、既存21営業日＋原本3日差し替えへ修正。本番読み取りデータでは2026年1月を21営業日・2026-01-06〜01-31・64会計・総売上¥1,087,600・128名・64組で維持し、1月6日の正常な同額2会計（6322/6323）は両方保持、1月30日の支払変更控えは旧6591を除外して最新6592を採用することを確認。
- Production E2E: `5b06d48` / `d6e2837` / `deb0555` をmainへpushし、`admin-api` version 848（ACTIVE / `verify_jwt=false`）へ反映。既存LZH `101520260129220406670001.lzh` を10分限定・`bistrocavacava`店舗スコープの一時セッションで重複再送し、HTTP 200、`uploaded=0 / repaired=0 / duplicate=1 / failed=0`、保存レポート`created=0 / updated=2`を確認。既存ID `1785441706573_0_xv9o6i` / `1785441706574_1_ydz3ud` と作成日時を維持し、両方を21営業日・64会計・¥1,087,600・128名・64組へ復元。原本は3件、単月レポートは2件のまま、両HTMLオブジェクトも`pos-report-html`に存在。一時セッションは即時削除し有効行0、未認証APIは401。ActionsはEdge run `31666169067`、Pages run `31666169076`がsuccess。公開`pos-journal.html`はHTTP 200で自動作成表示を確認し、`解凍変換ソフト`のWebファイル9点は正本とSHA-256一致。

### 2026-08-12 - Journal Report登録データを電子ジャーナル画面へ共有参照

- Request: `解凍変換ソフト`（正本 `public/jnm/jnl2txt.html`）で登録したジャーナルを、LINE Reportの `pos-journal.html` でも表示する。
- Root cause: 両画面は同じSupabaseを使っていたが、Journal Reportは主に`saved_reports`へ保存し、電子ジャーナル画面は`pos_journal_files`だけを取得していたため、`.jnl`のみの登録や原本未保存の月が見えなかった。
- Shared read behavior: `GET /pos-journals`が同じ`store_partition_key`・同じ年月の`saved_reports`を認証済み`admin-api`内で参照し、保存された`data.sales`（大容量時は`posJournalDays`）をPOS日次形式へ変換する。公開PagesからDBを直接読ませず、既存の管理セッション・店舗スコープを維持。
- Ordering / de-duplication: 単月の月間レポートを優先し、総売上・伝票数が大きい完全期間候補を選ぶ。月間が無い旧データは日別をまとめる。同じ営業日がLZH原本と保存レポートの両方にある場合は`pos_journal_files`を正本にし、保存レポートは原本に無い日だけ補完する。
- UI: 原本なしで共有参照だけの月もKPI・日別・決済・商品・会計明細を表示する。「保管ファイル」はLZH原本だけを表示したまま、共有参照中／補完日数／原本優先を専用通知で説明する。
- AI: POS電子ジャーナルの月次分析・質問も画面と同じ共有マージを使い、表示とAIの対象日がずれないようにした。
- Future saves: Journal Reportは通常`data.sales`を保存し、サイズ上限で`data.sales`を省略するときだけ共有用`posJournalDays`を残す。
- Verification: 本番DB（読み取りのみ）で2026年1月の単月月間レポートが21営業日・64会計・総売上¥1,087,600を保持し、LZH原本3営業日と重複3日、共有補完後21営業日になることを確認。共有形式変換、別月除外、最新日付優先、大容量スナップショット、LZH優先、AI配線、共有月UIを新規テストで固定。`npm run test:ci` 231 tests / 0 fail、`npm run check`、`pos_journal.ts`の`deno check`、両HTMLのインラインJS構文検査に成功。

### 2026-08-12 - ゴミ箱の選択式一括完全削除を追加

- Request: ゴミ箱を選択して一括削除できる機能をつけてほしい。
- Design: 復元不可の破壊的操作のため多重に守る。サーバー `purgeJournalHistoryItems`（admin-api）は (1) `deleted_at` が入っている行だけを対象にし、有効な行が1件でも混ざっていたら409で中止 (2) 削除クエリにも `store_partition_key` を掛ける（URL・JSONボディの店舗強制上書きに加えた二重ガード） (3) `confirmation: "delete"` 必須（`deletePosJournalFile` と同じ作法） (4) 一度に500件まで (5) 実削除にも `.not("deleted_at","is",null)` を付け、事前チェックと実削除の間に復元されても巻き込まない。対象は保存済みレポート／売上予測／AI分析履歴／AIチャットPDF履歴の4種類。
- UI: 各セクションにチェックボックスと「すべて選択」、選択件数表示、赤い完全削除ボタンを追加。確認は件数入り `confirm` と `delete` の入力の二段。復元ボタンは行ごと、完全削除はセクション見出しに置いて誤操作を避けた。
- Self-review findings (レビュー用ワークフローが利用上限で全滅したため自分で実施し、実データで裏を取った): ①**HTMLパス取得のため `data` 列を丸ごと select しており、ゴミ箱219件では25MB（最大単体2MB）をEdge Functionへ読み込む実装だった**。`select("html_path:data->>htmlStoragePath")` へ変更し約8KBに削減。一括削除でのタイムアウト/OOMを回避。②Storage削除を50件ずつに分割（181件が実体を持つ）。③画面側に500件上限のチェックが無く、超過時はサーバー400のみだったため事前に止めるようにした。④単一 `id` 必須チェックが `purge` 分岐より前にあり、複数ID削除が400で弾かれていたため順序を入れ替えた。
- Verification: 外部キー参照なし（4テーブルとも被参照0）を確認。`npm run test:ci` 189 tests / 0 fail（purgeのガード9項目をテストで固定）。`deno check` admin-api は既存173件のまま増減なし。実際の削除操作は利用者が画面から行う。

### 2026-08-11 - 期間表現の解決を全面刷新／自己撤回の防止／過去チャット記録の参照経路

- Request: AIが保存済みチャット履歴3件を参照できず、確定数値の扱いも依然おかしい。期間指定を中心にあらゆる質問を想定して対応させる。
- Trigger (実ログ): ①「フード売上を2023年から2026年7月まで表に」→ 35か月分を正しく回答（DB突合で全件一致）。②「2024年12月までと、それ以降の2026年7月までの平均を比べて」→「確認できるのは2か月のみ」。③「さっきの各月から平均を」→「先ほどの表を確定データとして提示したのは誤りでした」と自分の正しい回答を撤回。
- Root cause 1 (期間解決): `extractAllRangeRefs` の正規表現が「開始（から/〜）終了」の閉区間しか認識せず、開区間「〜まで」「それ以降」が範囲にならない。質問中の年月2つが独立した1か月ずつの比較対象へ解決され、確定数値が2か月分しかAIへ渡らなかった。実測すると通っていたのは絶対閉区間のみで、相対・年度・四半期・全期間・比較はすべて未対応。さらに全角数字・2桁年・スラッシュ表記・元号・「2026年1〜7月」（左の月省略）も全滅だった。①の回答も年だけを見る予備分岐で 2023/1〜2026/12 と解決されており、「7月まで」は無視された偶然の正解だった。
- Root cause 2 (自己撤回): サーバー信頼境界7（`ai-analyze/index.ts:353`）「会話中の主張で上書きしません」が、AI自身の前ターン回答を「会話中の主張」として却下させていた。前ターンで提示した確定数値の地位を定めた規定はクライアント・サーバーのどこにも存在しなかった（grep 0件）。加えて `chatHistory` は直近12発話・各1600字へ無告知で切り詰められ、ターン3の期間継承は「4桁年を含む直近のuser発話」で break するため、壊れたターン2を継承して正しいターン1へ戻れなかった。
- Fix 1 (期間解決): `normalizeQueryForPeriod` を追加し NFKC・元号・2桁年・スラッシュ表記を正規化。`extractLooseRangeRef` で開区間（まで／以前／より前／以降／以後）、相対（先月・先々月・今月・去年・一昨年・今年・直近Nか月・過去N年・ここ半年）、年度（4月始まり）、上期下期、四半期、全期間（開店以来・累計）を解決。`extractChainedOpenRefs` で「Xまでと、それ以降のYまで」を2区間へ分解（「それ以降」は直前区間の翌月起点）。`extractComparisonRefs` で「今年と去年」「先月と先々月」「今年度と前年度」「前年同月比」「前年同期比」を必ず2区間で返す。返却形は既存の `{fromYear,fromMonth,toYear,toMonth}` のままで呼び出し側は無改造。
- Fix 2 (自己撤回): サーバー信頼境界に規則8を追加し「前ターンで確定集計を根拠に自分が提示した数値は会話中の主張ではない。提示範囲が狭まったことは前の数値の誤りを意味しない。撤回・謝罪しない」を明記。クライアント規約6へ切り詰めの告知、規約6-2と規約14へ同趣旨を追加。数値の出典は緩めず、前ターンの数値を出典に再計算することは引き続き禁止で、対象期間の指定を促す。期間継承は「さっき／各月／同じ期間」等の指示語があるとき履歴を遡って最も広い期間の発話を採用するよう変更。
- Fix 3 (過去チャット記録): `ai_chat_pdf_history` を背景情報としてプロンプト末尾（knowledgeBlock の直後）へ添付。数値の出典にはしない。**罠2つを無害化**——(a) 履歴本文が店舗資料マーカーを含むと `clampAiSystemInstruction` の切り詰めが誤爆するため `［資料開始表記］` へ置換、(b) 履歴本文の「確定済み集計データ」「予約確定事実」「ジャーナル商品検索の確定事実」はサーバー信頼境界が数値の正本判定に使う語のため置換。ブロック内の注意書き自体にも同語を書かない。取得失敗・0件・未接続を区別し、失敗時は「存在しないとは断定しないでください」と明示。今回の質問と語が重なる記録を優先し最大5件・回答各400字。
- Self-inflicted bugs caught by harness/tests (実装中に作り込み、検証で発見・修正): ①「2025年度の下期」「第3四半期」が年度全体へ潰れる（年度判定が期より先に返っていた）②注意書き自体に「確定済み集計データ」を書いて信頼境界と衝突 ③正規化が「10年前」→「2010年前」、「1300000/12」→「1300000年12月」、電話番号を破壊 ④「一昨年」が内部の「昨年」に二重ヒットし1語で2区間 ⑤`formatVerifiedDetailLines` の外部定数依存で既存テストが `ReferenceError`。
- Coverage: 58表現を一括検証。解決47（絶対8・開区間7・相対11・年度期9・比較9・全期間3）、意図的に非解決5（「客単価を上げるには」「1000円以下の商品」「3年以上の常連」「10年前の売上」「おすすめの施策」＝期間として誤認しないことを確認）。
- Follow-up (履歴の一覧提示): 「履歴を見せて」に対して背景利用のまま分析回答になり、記録そのものが提示されなかったため `wantsChatHistoryListing` を追加。一覧要求時は新しい順に最大20件・件数つきで列挙させ、見出しも「列挙は可」へ切り替える（「背景情報であり」のままだと列挙を躊躇するため）。保存時に連結される確認Q&Aは除いて本来の質問だけを見せる。列挙は許すが再計算は【完全禁止】のまま。「保存レポート」「保存済みデータ」は売上データを指す語のため履歴要求から除外し、15表現で判定を検証した。取得上限は30→50件。
- Data fix: 2023年7月・2024年7月の月間レポートがゴミ箱にあり（2026-08-07 12:36〜12:38 に削除済み。今回の整理より前）、日別のみが有効だった。AIの月次集計は月間レポートを正本にするため2023年7月（フード¥755,300）が集計から欠落していた。チャージが正しく入っている7/30保存版2件を復元。復元後は月間36か月・欠落0・重複0・チャージ欠落0。前期の正しい月平均は¥876,478（18か月・¥15,776,600）。
- Known gap: 季節・行事表現（夏場／年末年始／GW／お盆／クリスマス時期）、「コロナ前」、月名のみの比較「2月と8月を比べて」は未対応で解決しない。年が特定できず誤った期間を返す危険があるため、あえて解決させず既存の確認質問経路へ委ねている。
- Verification: `npm run test:ci` 188 tests / 0 fail（期間解決・撤回防止・履歴無害化の回帰テストを6件追加）。`npm run check` exit 0（`journal:integration:check` 21 OK / 0 NG）。`deno check` ai-analyze 0エラー。HTML内スクリプトの構文検証も通過。

### 2026-08-10 - チャージ欠落データの復旧と保存レポートの重複整理

- Request: 前日修正した `isCharge` 欠落の影響を受けた保存レポートを実データごと直し、増えすぎた重複レポートを整理する。
- Root cause (確定): 保存レポート `jnl2txt_category_overrides_v1__bistrocavacava`（2026-07-31 更新）に分類上書き `0000000000001|チャージ料 → その他` が登録されていた。修正前の `classifyProduct` は上書き経路で `isCharge:false` を固定で返すため、**2026-07-31 以降に解析した月だけ `chargeTotal` が 0** になっていた。7/31 以前に解析済みの月は、後から上書きを再適用しても `applyCategoryOverrideToSales` が `category` しか書き換えないため `isCharge:true` が保持されており、無傷だった。チャージが「その他」に入っているのは誤りではなく、この上書き設定どおりの意図的な分類。
- Impact (実測): 月間レポート16か月分でチャージ合計 **¥941,500** が `chargeTotal:0` として欠落（2026年7月、2025年6月・8月・9月・11月、2024年1〜6月、2023年8〜12月）。総売上・客数・カテゴリ4項目合計はいずれも正しく、欠落はチャージ内訳のみ。
- Recovery: 対象16か月のジャーナルを再取り込み。全月で `isCharge` が復活し `chargeTotal` が明細と一致。**総売上・客数・伝票数は再取り込み前後で全月一致**（各月の全コピーで `total` が単一値であることを検算）。
- Incident: 2026年7月の初回再取り込みで、7/25 までしか含まないジャーナルを投入し、総売上が ¥1,300,000 → ¥1,120,850（124名→108名、21営業日→17営業日）へ減少。新しいレポートが優先して読まれる並びのため、チャージ ¥13,000 の復旧と引き換えに売上 ¥179,150 を失う状態だった。保存前後の突合で検知し、当該2件をゴミ箱へ戻したうえで 7/1〜7/31 の23ファイルで取り直し、¥1,300,000 / 124名 / チャージ ¥13,000 で確定。**再取り込み時は総売上・客数・期間を必ず突合すること。**
- Cleanup: 重複・不要レポート計172件をゴミ箱へ移動（`deleted_at` を立てるソフト削除。アプリのゴミ箱から復元可能）。内訳は、8/6の一括取り込みで生じた壊れた日別の複製39件（18か月分）、誤って取り込んだ2025年7月の重複4件、7/25までの2026年7月2件、`chargeTotal:0` の旧2026年7月2件、再取り込み後の重複124件（16か月分・月間62/日別62）、タイトルと中身が食い違う「日別売上レポート（2026年6月）」1件（中身は2026-01-06〜06-30の半年分。総売上・伝票数・チャージが1〜6月各月の合計と1円まで一致するため固有データなしを確認のうえ削除）。
- Delete criteria: 各（種別×月）で「チャージが正しく入っている最新の1件」を残し、**総売上・客数・伝票数が残す1件と完全一致する行だけ**を削除対象にした。内容が異なる行は自動削除の対象から除外している。
- Final state: `saved_reports` の有効行は **81件**。内訳は売上レポート **77件**（月間34／日別36／合算7）＋システム管理行4件（分類ルール2／PDF履歴2）。売上レポートのチャージ欠落 **0件**、同一（種別×月）の重複 **0件**、カテゴリ4項目合計と総売上の不一致 **0件**。ゴミ箱 220件。
- Known gap: 合算レポート7件は期間の切り方が任意のため自動整理の対象外。うち「合算売上レポート（2026年1月〜7月）」と「合算日別売上レポート（2026年1月〜7月）」は内容が同一（¥9,115,800・437伝票）。
- Operational note: 分類上書きを追加・変更すると保存済み明細の `category` は反映されるが、既存の `isCharge` と集計サマリーは再計算されない。チャージ判定に影響する変更後は対象月を再取り込みすること。取り込み時にチャージ対象商品があるのに集計0件なら警告が出る。
- Final recheck: 16か月のチャージ内訳を再加算して **¥941,500**、整理内訳を再加算して **172件** と一致。2026年7月は原本23ファイル、¥1,300,000／124名／57伝票／21営業日／チャージ¥13,000。`npm run test:ci` は現行 **215 tests / 0 fail**、`npm run check` は `journal:integration:check` **21 OK / 0 NG** を含めて成功。確定数値の切断・予約名による商品名破壊・チャージ上書き経路に回帰テストを追加した。

### 2026-08-10 - 確定数値のAI受け渡し監査と4件の修正／`jnm/index.html` の重複解消

- Request: 確定数値の確定の仕方・渡し方・AI側の扱い・連携が正しく動いているかを全経路で調べ、見つかった問題を修正する。
- Audit scope: 集計エンジン／保存と復元／AIへの受け渡し／プロンプト規約と切断安全性／サーバー側 ai-analyze／実データ突合の6観点。
- Audit result (計算は正常): 保存済み月間レポート12か月分をDBで検算し、`ランチ+ディナー`・曜日別合計・時間帯別合計の売上と客数がすべて総売上／総客数と一致（差分0）。カテゴリ4項目（フード＋飲料＋室料＋その他）＝総売上も7か月とも一致。16:00境界は分単位で厳密（時刻不明は分類せず検算停止）、VOIDは明示宣言のみ対象で取引変更バナーでは誤除外せず、明細の取消行は純額相殺。曜日別・時間帯別のキー名は集計・合算・AI提示で一致（保存済み121件のJSONを実査）。問題は計算ではなく受け渡しに集中していた。
- Fix 1 (切り詰め): `clampAiSystemInstruction` が上限超過時に末尾を無条件カットしていたため、確定数値が行の途中で切れ、ブロック末尾にある「この確定済み集計データの値のみを使用／再計算は完全禁止」規約まで失われていた。行単位で削り、省略時も規約を必ず付け直す `AI_TRUNCATION_TAIL` を追加。複数期間比較で確定数値ブロックが単独で39000字へ届く条件で再現・検証済み。
- Fix 2 (仮名化): 予約者名の置換が単純な全置換で、確定済み集計データ内の商品名まで巻き込んで壊していた（予約者「山田」で商品「山田錦」が「予約客A錦」になる）。名前が実際に現れる3文脈（予約明細の`/ 氏名 /`、`氏名様/さん`、`customer_name: 氏名`）だけを置換し、1文字名は対象外。ブラウザ側 `journal-ai-privacy.js` と Edge Function 側 `journal_ai_privacy.ts` の両方に同じ実装があるため双方を修正。構造化フィールドの置換経路は従来どおりのため、マスク強度の低下は自由入力の素書きに限られる。
- Fix 3 (チャージ帰属): コード・画面・AI文言はいずれも「チャージ＝フードの内数」としていたが、実データでは `チャージ料`（code `0000000000001`）が `その他` に分類されていた（2026年1〜7月で確認）。AIは「フード ¥916,200（うちチャージ ¥6,500）」と誤った内訳説明を受け取っていた（合計は正しく、帰属のみ誤り）。所属カテゴリを保存済み伝票明細から判定する方式へ変更し、判定できない保存レポートでは断定せず「4カテゴリのいずれかの内数／合計へ足し戻さないこと」と明示。画面KPI・チャート見出し・ヘルプ・プロンプト規約の固定文言9か所も実態に合わせた。
- Fix 4 (isCharge): カテゴリ手動上書きの経路が `isCharge:false` を固定で返していたため、同一商品が月によってチャージ集計から消えていた（2026年7月は ¥13,000 のチャージが `chargeTotal:0` として欠落）。上書きは分類だけを変えるようにし、チャージ対象の商品コードがあるのに集計が0件のときは取り込み時に警告を出す。保存済みレポートを再分類する経路は無いため、7月分の是正には該当月の再取り込みが必要（総売上は正しいため今回は見送り）。
- Refactor: `public/jnm/index.html` を `jnl2txt.html` と byte一致の825KB複製から、1.2KBの転送スタブへ変更。クエリ・ハッシュを保って本体へ転送し、JS無効時も meta refresh とリンクで到達できる。byte一致を強制していた3テストのアサーションを外し、アプリ本体として `index.html` を読んでいた2テストを `jnl2txt.html` 基準へ移し、代わりに「`index.html` は小さな転送スタブのままであること」を `repository_structure` テストで守る。デプロイ手順（HANDOVER.md）・構成図・作業コピーREADMEを新しい前提へ更新。
- Regression caught in review: `formatVerifiedDetailLines` を外部定数 `SALES_CATEGORIES` に依存させたところ、この関数をVMサンドボックスへ切り出す既存テストが `ReferenceError` を検出。依存を外し、注記を出したかどうかをフラグで判定する形へ修正（不正な `chargeCategory` が入ってもチャージが表示から消えない）。
- Verification: `npm run test:ci` 178 tests / 0 fail。`npm run check` exit 0（`journal:integration:check` 21 OK / 0 NG、`supabase:ownership:check` 通過）。`deno check` ai-analyze 0エラー。`git diff --check` clean。`node --check` / `new Function()` によるHTML内スクリプト構文検証も通過。作業コピー9ファイルは正本と同期済み。
- Deploy: `fix/verified-numbers-handoff` を `main` へ fast-forward マージし、`19c95a1..a925917` を push（commit `fe6ef27` 修正4件 / `b110441` index.html転送スタブ化 / `a925917` 記録）。GitHub Actions の `Deploy GitHub Pages` / `Deploy Edge Functions` が両方 success。
- Production check: `/jnm/jnl2txt.html` は HTTP 200・832,308 bytes・ローカルと byte一致。`/jnm/`（転送スタブ）は HTTP 200・1,262 bytes で `location.replace('jnl2txt.html' …)` を確認。公開HTMLに `AI_TRUNCATION_TAIL` / `resolveChargeCategoryFromSales` / `dominantChargeCategory` が反映済み。未認証の `ai-analyze` は HTTP 401。
- Note: 本エントリ以降、`public/jnm/index.html` と `jnl2txt.html` の byte一致は成立しない（意図的な仕様変更）。過去エントリの byte一致記述は当時の記録として残す。

### 2026-08-10 - 店舗資料A+B複合案の全経路監査・信頼境界・LINE失敗通知

- Request: A案（詳細候補拡張）＋B案（全資料目次）の実装、LINE連絡経路、AI判断経路を再監査し、バグと改善点を修正して再デプロイする。
- A+B: 詳細は最大20資料・全体12000字、目次は最大4000字。証拠を先、目次を後に分離し、目次は存在確認専用で因果・引用の根拠にしない。RAG上限8件に入らない資料は資料別本文へフォールバック。
- Accuracy: 離れた比較期間を別区間のまま照合。無効資料は期間付きの過去明示分析だけ参照。日本語期間も解析。取得失敗・未接続・stale・上限到達・詳細部分失敗と、正常な0件を区別。
- Performance: 一覧をページングし本文を取得しない。選定最大20件は一括詳細APIで取得し、更新日時が同じ詳細をキャッシュ。AI実行時は一覧を再検証して直前のLINEメモを反映。
- AI safety: サーバー固定規約をOpenAI developer/system・Claude systemへ置き、ブラウザ文脈、店舗資料、集計、外部知見を非信頼userデータへ分離。埋め込み命令・区切り偽装を無視し、目次と証拠、確定数値と背景資料を分離。
- Prompt: 39000字超過時は実資料マーカー内だけを縮め、前方の確定集計・店舗情報と後方の統合指示を保持。全店一律のクリスマス実施断定を廃止し、確定商品または選定資料がある場合だけ事実、無ければ仮説とする。
- Backend/LINE: 編集時の添付・由来保持、店舗キー正規化、Storageパス店舗境界、引用添付のStorage失敗時ロールバック、テキスト`#メモ`失敗返信を追加。
- Verification: `npm run check` / `test:ci` / `journal:integration:check`（21 OK / 0 NG）すべて exit 0。`deno check` ai-analyze 0エラー。`git diff --check` clean。`public/jnm/index.html` と `jnl2txt.html` は byte一致。
- Deploy: commit `d7d18bb` を `main` へ push。GitHub Actions の `Deploy GitHub Pages` / `Deploy Edge Functions` が両方 success（push 時に全 Edge Function を自動デプロイするため手動 deploy 不要）。
- Production check: Pages 2入口とも HTTP 200・824,895 bytes・ローカルと byte一致。`AI_KNOWLEDGE_MAX_ITEMS = 20` / `MAX_CHARS = 12000` / `CATALOG_MAX_CHARS = 4000` を公開HTMLで確認。未認証の `admin-api/pos-journals/knowledge`・`.../knowledge/items`・`ai-analyze` はいずれも HTTP 401。
- Known gap: `npm run knowledge:check` は `graphify` CLI 不在で fail。生成ミラーは同期済み、Graphify抽出のみ stale。製品影響なし。

### 2026-08-07 - LINE `#メモ` 送信日時を分析時間軸へ

- Request: `#メモ` を分析の糧にするとき送信日時も読み、時間軸をずらさない。
- Change: webhook が `line_timestamp` を転送。`created_at`＝送信時刻、`period`＝JST送信日。AIブロックに送信ラベル。他月 LINE投稿は類似度補完から除外。
- Deploy: `line-webhook` / `admin-api` + Pages `public/jnm/*`。

### 2026-08-07 - ドキュメント: Qwen/Kimi を現行AI構成から除外して記載更新

- Request: 情報流出対策で構成外にした Qwen／Kimi が MD に残っているので書き直す。
- Change: アーキテクチャ／機能仕様／AIループ設計／運用記録の「現行」記述を OpenAI・Claude・Groq GPT-OSS・Gemini・Grok に合わせる。履歴項目は当時の記録として残し、冒頭に現行表を追加。

### 2026-08-07 - Journal Report 機能仕様MDを整備

- Request: `#メモ` を含む Journal Report の機能を詳細に正確な MD へまとめる。
- Change: `docs/JOURNAL-REPORT-FEATURES.md` を新設。DOCS-INDEX・アーキテクチャ・資料仕様・使い方タブを同期。
- Deploy: Pages `public/jnm/*`（使い方文言）＋ docs。

### 2026-08-07 - AIチャットのワイン量 点数/ml 確認経路

- Request: 年比較などでワイン量を聞かれたとき、点数／総ml／両方をユーザーに確認し、mlは店舗換算で計算。
- Change: `wineMetric` clarifier + choice buttons + `formatWineVolumeFactsForAi` を verifiedData に注入。
- Deploy: Pages `public/jnm/*`。

### 2026-08-07 - ワイン提供量(ml)換算を店舗情報＋AI分析へ

- Request: 店舗情報でグラスワインmlを店舗別に設定（ボトル750固定）。分析の1項目にする。
- Change: `profile.wineMl` + UI。`wineVolumeAnalysis` を salesData／店舗営業情報ブロックへ。AI指示に必須節を追加。
- Deploy: `admin-api` + Pages `public/jnm/*`。

### 2026-08-07 - 店舗情報カレンダー（施策・イベント）

- Request: 店舗情報入力時にカレンダーでイベント／施策を開始日〜終了日登録し、AIとプレビューへ自動反映。
- Change: `profile.calendarEvents` + 月次カレンダーUI。`formatStoreOpsBlockForAi` / `#opsPreview` に反映。API はキー省略時に既存イベントを維持。
- Deploy: `admin-api` + Pages `public/jnm/*`。

### 2026-08-07 - 過去売上同期トグルの本番動作テスト

- Result: PASS (Actions run 31146495132)
- Covered: Pages wiring, DB ON store = bistrocavacava only, admin-api ON/OFF/omit-key preserve on sauvage (restored), CAVACAVA stayed ON
- Script kept: `scripts/verify-journal-sales-sync-toggle.sh`

### 2026-08-07 - 過去売上同期 ON/OFF を店舗情報へ

- Request: おすすめの場所に journalSalesSync の on/off スイッチを作る。
- Place: Journal Report「店舗情報」タブ、営業カレンダーカードの下に独立カード。
- Change: UI トグル＋`normalizeStoreOperationProfile` で boolean 保持。キー未送信時は既存 ON を維持。初期値リセットでも同期フラグは維持。
- Deploy: `admin-api` + Pages（`public/jnm/*`）。

### 2026-08-07 - 誤登録2027-08予算の削除

- Store: Sauvage (`sauvage`)
- Deleted: month budget ¥2,300,000 and 4 closed days for `2027-08`
- Verified empty afterward. One-shot workflow removed after run.

### 2026-08-07 - migration 履歴ズレ修復で Edge デプロイを緑に

- Request: Deploy Edge Functions の ×（db push 履歴ズレ）を消し、git push デプロイを成功扱いにする。
- Cause: 本番だけに残る orphan migration `20260806185129`（local git にファイル無し）。
- Change: `scripts/supabase-db-push-reconcile.sh` で remote-only を `migration repair --status reverted` 後に再 `db push`。workflow から呼び出す。
- Expected: 未適用の `20260806133001` / `20260807030000` もこの成功時に適用される。

### 2026-08-06 - git push デプロイの単一ジョブ化

- Request: `main` への git push / マージで Edge Functions と GitHub Pages が確実にデプロイされるようにする。
- Cause: validate と deploy が別ジョブのため、hosted runner 枯渇時に二段目だけ取得失敗して未デプロイが残った。加えて Actions/Pages major outage。
- Change: 両 workflow を単一 `deploy` ジョブへ統合。Edge は db push 失敗後も関数デプロイを続行し、最後に DB 失敗を通知。緊急用 `skip_tests` / `skip_db_push` を追加。
- Note: GitHub Actions 自体が outage の間はキューイングされない。復旧後、この workflow 変更の push が未反映分の再デプロイを起動する。

### 2026-08-06 - POSジャーナル修復の周辺不具合

- Request: 複数修復に続き、最新ファイル表示・原本整合・不完全行可視化・売上同期営業日・Luna退避記録も直す。
- Change: 修復で `uploaded_at` 更新、ハッシュ変更時は Storage 差し替え、Storage 無し行の削除許容、POS一覧に要修復表示、月次営業日は総売上>0、月次 source は mixed、Luna は auth/rate/quota で縮小再試行せず、clarifier も fallback 記録。
- Deploy: `admin-api` / `ai-analyze` / Pages。GitHub Actions・Pages は 2026-08-06 時点で major outage。

### 2026-08-06 - POSジャーナル upload のプレースホルダ複数修復

- Request: 不完全な電子ジャーナル行（会計0件／売上未設定）へ同じ営業日の LZH を再アップロードしたとき、削除せずに解析結果を上書き修復できるようにする。
- Change: `admin-api` の `/pos-journals/upload` でプレースホルダ判定後に `parsed_data` と集計を UPDATE。既存 `storage_path` は維持し、未保管時のみ Storage 保存。応答に `repaired_count` / `repaired` を追加。Journal Report / POS Journal UI に「うち修復 M件」を表示。
- Merged: `main` `be5dfcd`（#61）。
- Deploy: `admin-api` 再デプロイと Pages（`public/jnm/*`, `pos-journal.html`）が必要。GitHub Actions/Pages major outage のため未デプロイの場合あり。
- Post-deploy check: KIOXIA 202502 / 202511 の再アップロードで修復件数と月次合計を確認。

### 2026-08-05 - Journal Report 原本ジャーナル全件ページ分割

- Request: Supabase/PostgRESTの1レスポンス行数上限で、長期保存した原本ジャーナルの古い月が落ちる構造的弱点を解消。
- Change: `scanRowsByAscendingId`を追加し、IDカーソルで空ページまで取得。商品初出・コース全期間・商品利用比較・汎用コホート比較を共通スキャナへ移行。短いページをEOFにせず、重複を除外し、進捗停止・不正ID・100,000行超・途中失敗は部分成功にしない。
- Tests: 2,505行、短縮ページ、境界重複、順不同、空ページ、進捗停止、安全上限、取得/処理失敗と、`admin-api`の配線回帰テストを追加。
- Deploy: `admin-api` Edge Functionの再デプロイが必要。DB migrationとPages変更は不要。

### 2026-08-05 - Journal Report 全期間コース導入前後分析の根本修正

- Request: SPコース初出を起点に全期間を分析すると、初回だけ2026年1月以前の既存コースが落ち、指摘後には読める問題を再発防止。
- Root cause: 「全ての月」が全期間語彙に無く、2回目の期間確認上限で最新月へ強制縮小。加えて商品初出の「SP導入前0点」とコース全体を区別する保存全期間月次表がAIへ無かった。
- Change: 全期間表現を共通判定し、明示範囲を確認上限でも保持。`q=コース`のジャーナル全件`by_month`を導入前を含め全件プロンプト化し、固有商品0点と既存コース全体を分離。
- Tests: 実会話型の期間解決、全期間選択、導入前後コース月次・集計の回帰テストを追加。

## Current application boundary

- Static GitHub Pages management application for 22 stores.
- Protected management API and store-scoped sessions through Supabase `admin-api`.
- Store-specific LINE Webhooks, management Bot, media, conversation search, receipts, sales analytics, reservations/Gmail, reviews, petty cash, and AI-usage management.
- MARUGO S foodcourt forecasting, multi-agent analysis, daily reports, quality loops, and learning/fallback history.
- Supabase migrations, RLS, private Storage, pg_cron, and multiple cron Edge Functions.
- Auxiliary legacy/optional Cloudflare, Render OCR bridge, local Express/SQLite, and Google Apps Script components.

## Knowledge system

- Graphify is the code/SQL structural index. Final baseline includes third-party vendor exclusions and SQL parser coverage.
- Obsidian is durable external memory. Manual notes, mirrored repository docs, and generated Graphify notes are separate.
- AI workflow: Obsidian search → knowledge check → Graphify query/path/explain → targeted source reading → implementation/verification → knowledge writeback → regeneration.
- `knowledge/system-architecture.json` generates the production, business-AI, and development-knowledge diagrams from one model.
- `system-map.html` verifies the existing admin session before embedding the public code-only maps.

## Required closure checklist

1. Update this file and `docs/店舗運用修正記録.md`.
2. Update relevant manual Obsidian knowledge.
3. Run `npm run knowledge:update`, `npm run knowledge:check`, related tests, and `git diff --check`.
4. Commit/push and verify Pages plus any Supabase deployment.

## Open product work

- Actual provider/API and production-data work remains governed by existing feature docs and operations log.
- 2026-07-31: Journal Report 全店舗ドロップダウン＋store_partition_key分離＋管理者横断サマリーを追加。店舗用ログインは自店固定。

## Continuation log

New records are appended below.

### 2026-08-04 - Journal AI multiple continuous range comparison fix

- Symptom: 「2025年3月〜7月と2026年3月〜7月」の比較で、2025年側だけ回答し2026年側を「表示されていません」とした。
- Cause: `extractRangeRef`が質問中の最初の連続期間だけを返し、`searchSavedReportsByQuery`が単一範囲として早期returnしていた。DBには2026年3〜7月の月間データが存在。
- Change: `extractAllRangeRefs`で複数の連続期間を抽出し、単一範囲分岐より先に各期間を個別集計して`multiPeriod`へ渡す。合算レポートは従来どおり除外。
- Accuracy: `monthCount`と`monthlyAvgCustomers`をローカル確定集計で計算し、AIへ明示する。
- Verified facts (Bistro CAVACAVA): 2025年3〜7月=580名/5か月→116名/月、客単価¥11,532。2026年3〜7月=640名/5か月→128名/月、客単価¥10,218。

### 2026-08-04 - Reservation AI chronology, monitoring, paging, direct queries, and compact cache

- Accuracy: 新規/リピートを「その予約時点・店舗別・食べログ/一休/manual横断」で再計算。キャンセル/非表示を除外し、`last_visit_at`は対象予約より前の同店舗直前予約へ変更。
- Paging: 予約イベント取得の月2,000件固定上限を廃止し、1,000件ページング＋安全上限100,000件へ変更。上限超過は途中集計せずエラーにする。
- Monitoring: `reservation_ai_cache_runs`へ実行開始/終了・成功失敗・店舗数・更新日数・予約件数・所要時間・エラーを保存。最終成功から36時間超の場合はキャッシュを使わずDB直接参照へ退避。
- Direct queries: 「明日/来週の予約」「特定日の予約」「売上レポート未保存月の予約」へ予約DBだけで回答可能。単日・日付範囲は売上があれば予約と統合する。
- Compact cache: `reservation_ai_cache_coverage`で生成済み期間を管理し、予約0件の日次行を削除。coverage内の行なしを0件と解釈する。
- Cron: pg_net待機時間を5分へ延長し、長い全再生成をHTTPタイムアウトに見せない。

### 2026-08-04 - Reservation AI daily cache and live-future split

- Request: 予約日が過ぎた確定データをAIチャットのたびに予約イベント表から再読せず、店舗別のRAG風確定データとして毎朝作成し、未来予約だけ最新DBを読む。
- Data: `reservation_ai_store_cache`を追加。店舗×予約日で`facts`（集計＋氏名入り明細）と`rag_text`を保持。RLS有効、anon/authenticated revoke、service_roleのみ。
- Change tracking: `reservation_ai_cache_dirty_dates`と3予約イベント表のtriggerを追加。過去予約の後日編集・削除があった日を記録し、翌cronで安全に再作成する。
- Cron: `reservation-ai-cache-cron`を追加。既存の日次処理（04:10、04:20、05:00 JST）と重ならない**毎朝05:37 JST**に実行。初回は過去24か月、通常は昨日分＋dirty日以降を再計算。
- API: `/reservations/ai-facts`は過去日を日次キャッシュから取得し、本日以降を予約イベントDBから直接取得して結合。キャッシュ欠損日はライブDBへフォールバックし、既存API応答形を維持。
- Token/latency: 日次キャッシュを`summary_facts`（集計のみ）と`facts.items`（氏名入り明細）に分離。通常分析は集計だけを取得し、予約者名・予約一覧・前回来店・顧客等の質問時だけ明細を取得する。
- Security: キャッシュ再構築 `/reservations/ai-cache/rebuild` はcron認証専用。公開Pagesから予約テーブル/キャッシュを直接読まない。
- Verification: 予約キャッシュ新規テスト4件を含む予約テスト8件、Journal AIテスト36件、`npm run check`、共有helper/cronのDeno check、`git diff --check`成功。

### 2026-08-03 - Journal Report AI data-flow verification

- Request: 月次・日別・ジャーナル原本・店舗施策／LINE投稿等がAI分析へ統合されているか、コードから全経路を再検証する。
- Added: `scripts/verify-journal-ai-data-flow.mjs` と `npm run journal:integration:check`。中核経路が切れると失敗し、条件付き接続と通常AI未統合系統を明示する。
- Verified core: 月次優先＋月次欠損の日別補完、単日検索、原本保存・必要時再読、Web資料、LINEテキスト／引用添付、RAG、店舗営業情報、商品分類ルール、店舗立地、会話履歴、AI分析レポート、AIチャット。
- Conditional: 原本再読は質問に応じて実行、外部知見は戦略系のみ、資料は最大5件／8チャンク／3500字、詳細明細は通常12か月・商品質問36か月・昼夜F/D補完18か月。
- Gaps: 通常Journal AIへ天候・気温を明示投入していない、過去予測/MAPEと過去AI文章は通常AIの入力外、`generate-insight`はAPIのみで自動呼び出しなし。

### 2026-08-03 - Journal Report security, recoverability, CI, and ownership hardening

- `ai-analyze`: 公開anonキーだけでは実行できないよう、`lrst_`管理セッション検証、店舗スコープ照合、DB共有レート制限を追加。Journalの分析・確認質問・チャットは共通`journal-ai-client.js`から管理セッションを送る。
- Frontend security: ドロップしたファイル名・解凍エラーを`innerHTML`ではなく`textContent`で描画し、`public/jnm`本体とPDF履歴ページへCSP/referrer policyを追加。
- Accuracy: `コース６品`のNFKC＋長音正規化後もコース商品として認識し、ボトル＋コースの複合質問からコースが脱落しないよう修正。
- Recoverability: `saved_reports` / `sales_forecasts` / `ai_analysis_history` / `ai_chat_pdf_history`へ`deleted_at`を追加。DELETEはゴミ箱移動、通常一覧・AI検索から除外。復元PATCH APIと「ゴミ箱・復元」UIを追加し、レポートHTML Storageも復元用に保持。
- CI: Pages/Edge Functionsデプロイ前にNode/Deno、静的チェック、全CIテストを必須化。DB migration失敗時はFunctionだけを先行公開せず停止する。
- Supabase ownership: `knowledge/supabase-ownership.json`を正本に、LINE Report所有15 Functionsを検査・デプロイ対象化。共有プロジェクト内の別アプリFunctionは触らない。
- Legacy native: 非Git作業コピーの旧macOS/Windows資産を非破壊で隔離し、通常ビルドを停止。現行正本は`line_report-main/public/jnm/`。
- Knowledge: Graphify/SQL coverageと公開システムマップを更新。Journal回帰テスト、POS Journal Denoテスト、知識検査を拡充。

### 2026-08-02 - Journal Report store knowledge folder (phase 1)

- Request: 店舗がやってきた施策やメニュー資料を登録するフォルダを作り、そこに蓄積した資料をもとにAIが分析する循環にする。
- Scope decision: フェーズ1は「登録 → 実施期間で売上と紐付け → AIプロンプトへ注入」までを通し、自動テキスト抽出・チャンク分割・埋め込み検索・効果測定はフェーズ2以降へ分離。フェーズ2/3をテーブル変更なしで載せられる形にした。
- Data: `store_knowledge_documents`（RLS有効・anon/authenticated revoke・service_roleのみ）と非公開Storage `store-knowledge`（20MB・許可MIMEのみ）。`period_start`/`period_end` は null を「常時有効」とし、`is_active` による論理削除を既定にする（終了した施策も過去期間の回答に必要なため）。`source_type='ai_insight'` をフェーズ3用に予約。
- API: `admin-api` に `/pos-journals/knowledge`（一覧・登録更新）、`/knowledge/item`（単体・削除）、`/knowledge/upload`（multipart＋SHA-256）、`/knowledge/download`（署名URL）を追加。すべて店舗スコープ許可リストへ登録し、他店キーは403。一覧は本文を200字の抜粋に切り詰める。
- UI: 「資料」タブを新設。種別・タイトル・実施期間・概要・内容・タグ・添付の7項目。テキスト/CSV/Markdownはその場で本文へ取り込み、PDF・画像は保管のみ。
- AI: チャットと分析レポートの双方へ店舗ナレッジブロックを注入。**確定集計の対象期間と重なる資料は類似度に関係なく必ず添付**し、残りを2文字組の類似度で補完。上限5件・6000字。取得失敗時はナレッジ無しで通常回答へ退避する。
- Invariant: 数値の正本は確定済み集計データのまま。規約第8項で「本ナレッジを数値の出典にしてはいけない」「使う場合は登録資料によると明示」「推測には※これは推測です」を固定。
- Verification: 全テスト50件（本機能で3件追加）。本番DB往復テストと制約発火確認（テストデータ削除済み）、`admin-api` 型チェックで新規エラー0、実ブラウザでコンソールエラーなし。
- Docs: `docs/JOURNAL-STORE-KNOWLEDGE.md` を新設し、`docs/DOCS-INDEX.md` と `docs/店舗運用修正記録.md` を更新。

### 2026-08-02 - Journal AI period accuracy and stored-breakdown coverage

- Request: AIチャットの応答を自然にし、保存データを欠かさず正しく検索できるようにする。
- Cause: 続きの質問で直前の発話を丸ごと前置していたため古い年月を先に拾っていた。年月抽出が4桁年必須で、日単位の集計経路が無かった。`summarizeMatched` の戻り値に曜日別・時間帯別・昼夜・室料が無く、保存レポート検索がヒットすると開いているレポート由来の内訳も失われていた。一覧APIは商品明細を返さないのに商品質問時しか詳細取得していなかった。意図判定に素の「売上」が無く、商品明細判定と語彙が食い違っていた。
- Change: 続きの質問は年だけ引き継ぐ（日だけの発話は年月）。年を一度しか書かない比較を2期間として解釈。単日・日付範囲・今日/昨日/今週/先週の日単位集計を追加。曜日別・時間帯別・ランチ/ディナー・室料/チャージ/その他を確定集計とプロンプトへ追加し、対象3か月以内なら一般質問でも明細を取得。意図判定と商品明細判定の語彙を統一しつつ、「売上を分析して」のような開いた依頼は従来どおり一問だけ確認する。比較の片方が無い場合は取れた期間を返し欠損期間を明示する。
- Verification: リポジトリ全テスト47件（3件更新・5件追加）と実データ形状の統合テスト55件、実ブラウザ確認、公開Pagesとソースのバイト一致。フロントのみでDB・Edge Function変更なし。

### 2026-08-02 - Journal AI bottle/course fact grounding

- Request: ジャーナル明細にボトル・コース販売があるのに、AIレポートが「保存データには含まれていない」と注記する誤判定を修正する。
- Cause: ボトル／本数／コースを商品明細検索の対象語として扱っておらず、一覧サマリーだけをAIへ渡していた。また詳細取得時は、同じ明細から生成された`topProducts`と`sales.items`を足して上位商品を二重計上していた。
- Change: 対象語を商品明細検索へ追加し、質問に該当する商品だけを伝票明細から集計。明細がある場合は`sales.items`を正本、無い場合だけ`topProducts`をフォールバックにする。明細取得が不完全なら保存DB全体の不存在を断定しない。
- Field semantics: ボトル／コースの商品名・数量・売上は確定値として回答する。予約人数と宴会件数は専用項目が無いため、実来店客数・会計組数・コース商品を含む会計件数と明確に区別して参考表示する。
- Verification: Journal AIテスト24件、全体テスト114件。HTML 2入口同期、インラインJavaScript構文、実画面、本番Pagesを確認する。フロント／文書のみでDB・Edge Function変更なし。

### 2026-08-02 - Journal AI conversational intent clarification

- Request: 固定選択式ではなく、曖昧な質問の意図を自然な会話で引き出し、必要な保存データだけを使って正確に回答する。
- Change: 明確な質問は従来どおり即時検索し、曖昧な場合だけ`ai-analyze`の専用`clarify`アクションを使用。直近会話・保存範囲・利用可能項目だけから、短い確認質問または文脈を統合した`resolvedQuery`を構造化JSONで返す。売上金額・商品明細は確認段階で送信しない。
- Conversation: 既知の期間や指標は聞き直さず、一度に一問だけ確認。番号一覧は出さず、「前者／後者」「おまかせ／全部」、訂正（例:「違う、6月」）、確認中の新しい自己完結質問を状態として解決する。同じ曖昧点は最大2回まで確認し、意図と期間は別々に管理する。
- Accuracy: 「前月」「前年同月」は絶対年月2件へ展開し、比較対象の片方が無い場合は単月回答へ進まない。確認AIの初回`ready`、根拠のない期間補完、ユーザーが求めていない全期間・商品明細への拡大をクライアントでも拒否する。月間レポートが無い月は日別全件を合算し、クラウド一覧・詳細の未確認や部分取得はAI検索と売上予測の両方で「データなし／実績待ち」と断定しない。
- Token/latency: 確認AIは直近6発話・500字入力・短い出力上限・合計約11秒のprovider timeout。通常AI履歴も現在発言を重複させず、クライアント／Edge双方で直近12発話・各1600字に制限。商品明細は最新側から最大36か月。
- Fallback: AI失敗・不正JSON・タイムアウト時も、質問内容に応じた自然なローカル確認質問へ退避する。
- Scope: `public/jnm/jnl2txt.html` / `index.html`、`supabase/functions/ai-analyze/index.ts`、Journal AI回帰テスト。DB変更なし。

### 2026-08-02 - Journal AI mobile keyboard-safe composer

- Request: スマートフォン／タブレットでソフトウェアキーボード表示時も、AIチャットの入力欄と入力中の文字を見える状態にする。
- Change: 固定`100vh`をVisual Viewport追従の高さ・上端へ変更。入力欄を縮小対象外にし、フォーカス時の表示位置・最下部スクロールを同期。モバイルは全幅、入力文字16px、44pxタップ領域、safe-area対応。
- Input: 日本語IME変換中のEnterでは送信しない。
- Scope: `public/jnm/jnl2txt.html` / `index.html` とフロント回帰テストのみ。DB・Edge Function変更なし。

### 2026-08-02 - Journal AI conversational saved-data query planner

- Request: 保存済みレポートがあるのに曖昧な質問で「データなし／0」と返さず、必要範囲を対話で確認し、AIトークン量も抑える。
- Change: 保存レポートの軽量月次索引を先に確認。「最新月」「直近3/12か月」「全期間」は必要月だけ集約し、期間が曖昧なら保存範囲を踏まえた自然な一問で聞き返す（旧1〜4回答も互換維持）。取得・認証エラーはデータ不存在と区別。
- UI: Journal Reportのテーマ未設定時はライトモードで起動し、明示的に保存されたダーク設定は維持。
- Scope: `public/jnm/jnl2txt.html` / `index.html` とフロント回帰テストのみ。DB・Edge Function変更なし。

### 2026-08-01 - Journal AI Luna + Kimi K3 fallback

- Request: 既定 gpt-5.6-luna のフォールバックに Kimi K3 を指定。
- Change: `ai-analyze` で Luna 失敗時に `kimi-k3` へ自動退避。応答 note にフォールバック表示。

### 2026-08-01 - Journal AI default → gpt-5.6-luna

- Request: Journal Report AIの既定を Kimi K3 から GPT Luna へ変更。
- Change: `ai-analyze` を OpenAI `gpt-5.6-luna` 既定に切替。戦略系の外部ブリーフ統合先も Luna。

### 2026-07-31 - Receipt correction multi-field edits

- Request: 「この結果を修正」で複数箇所を直せるようにする。
- Change: `receipt_correction.ts` で変更済み項目の蓄積・可視化、「すべて保存して終了」、`5 140000` 形式の一括入力を追加。`line-webhook` デプロイ対象。

### 2026-07-31 - Remove Journal Report「クラウド連携」badge

- Request: ヘッダーの「クラウド連携」バッジを削除。
- Change: `public/jnm` ナビの `.pill-live` 要素とCSSを除去（`jnl2txt.html` / `index.html` 同期）。

### 2026-07-31 - Journal Report light-mode text contrast

- Request: ライトモードの文字視認性を上げ、濃くする。
- Change: `public/jnm` のライトテーマで `--text-2`/`--text-3`・本文色・アクセント・レポート内 opacity を濃く調整（ダークは変更なし）。
- Files: `jnl2txt.html` / `index.html`、運用記録。

### 2026-07-31 - Journal Report multi-store select and isolation

- Request: 店舗選択UI、店舗ごとの独立保存、非管理者の横断禁止、管理者の横断閲覧・分析。
- Isolation: 既存テーブルの `store_partition_key` + admin-api 強制（物理分割はしない）。
- UI: `public/jnm` に店舗セレクト、スコープバッジ、管理者横断サマリー。
- API: `GET /pos-journals/saved-reports/cross-store-summary`（フル管理者のみ）。保存時の他店舗ID衝突を409。
- Category overrides: ID を店舗別に変更。

### 2026-07-31 - AIチャットPDF履歴（質問＋回答）をDB保存
（質問＋回答）をDB保存

- Request: AIチャット表示結果を「PDFにする」押下時に Supabase の新テーブルへ自動保存し、質問起点の一覧ページを用意する。
- Database: migration `20260731070000_ai_chat_pdf_history.sql`（`ai_chat_pdf_history`、RLS、service_roleのみ）。
- API: `admin-api` の `/pos-journals/chat-pdf-history`（GET/POST）と `/item`（GET/DELETE）、店舗スコープ許可リスト追加。
- UI: `public/jnm/jnl2txt.html` / `index.html` で PDF ボタン時に保存、ツールボタンと専用ページ `ai-chat-pdf-history.html` で質問リスト表示。
- Docs: `docs/店舗運用修正記録.md`、`docs/REPOSITORY_STRUCTURE.md` を更新。

### 2026-07-28 - Bistro CAVACAVA POS電子ジャーナル保管・アップロード・削除

- Request: `/Volumes/KIOXIA/202606` のPOS電子ジャーナルをWebで確認するだけでなく、今後のLZHファイルを画面からアップロード・保管し、保管済み原本を削除できるようにする。削除は `delete` の確認入力を必須にする。
- Store mapping:
  - ファイル名先頭の店舗コード `1015` を既存店舗キー `bistrocavacava`、表示名 `Bistro CAVACAVA` に固定。
  - 未登録コード・選択店舗不一致・対象月不一致は保存前に拒否。
- Database and Storage:
  - migration `20260728092020_pos_journal_storage.sql` で `pos_journal_files` とprivate bucket `pos-journals`（8MB/件）を追加。
  - 公開Pagesからの直接参照を禁止し、RLS有効・anon/authenticated権限なし。admin-apiのservice_role経由のみ。
  - 同一店舗×営業日と同一店舗×SHA-256を重複防止。Storage削除後に削除スナップショットを記録してからテーブル行を削除。
- API:
  - `GET /pos-journals`: 店舗・月の原本一覧と保存済み解析データから月次集計を返す。
  - `POST /pos-journals/upload`: multipart複数LZH、LH5をEdge内で解凍、ESC/POS除去、CP932解析、Storage→DBの順で保存。DB失敗時はStorageをロールバック。
  - `GET /pos-journals/download`: private原本の期限付き署名URL。
  - `DELETE /pos-journals/file`: JSON `confirmation` が半角小文字の `delete` 完全一致の場合だけ、Storage APIで原本削除→削除スナップショット→テーブル削除。
- UI:
  - `pos-journal.html`へ管理セッション、対象月、複数選択/ドラッグ＆ドロップ、進捗・部分失敗、保管一覧、原本DL、delete確認モーダルを追加。
  - 2026年6月の静的互換データはDB未投入時の表示フォールバックとして維持し、ローカルパスを公開JSONから除去。
- Verification:
  - LHA/LH5 unit tests 4/4。CP932実ジャーナルサンプルで2026-06-02、総売上105,000円、会計2件を確認。
  - ローカルAPI E2E: upload 200、一覧/集計200、同一SHA重複スキップ、署名URL200、`DELETE`は400、`delete`は200、Storage/DB残0、削除後の再アップロード成功。
  - migration単体をローカルPostgresへ適用し、private bucket・RLS・anon/authenticated SELECT不可・partial unique indexを確認。
  - `npm run check`、既存`npm test` 90/90、`npm run knowledge:update`/`knowledge:check`、`git diff --check`成功。
  - Commit `4e6d70a`をmainへpush。Pages run `30351184119`、DB migration＋全Edge Functions run `30351184113`はいずれもsuccess。
  - 本番`pos-journal.html`/静的JSONはHTTP 200、新API未認証は401。本番DBで`pos_journal_files`、private bucket（8MB）、RLS有効、anon/authenticated SELECT不可を確認。

### 2026-07-28 - 電子ジャーナルへAI月次分析・自由質問を追加

- Request: 電子ジャーナルのデータも既存の売上分析と同様にAIで分析できるようにする。
- Analysis scope:
  - 月次総売上・営業日平均・客数・客単価・組単価。
  - 最高/最低営業日、前半/後半、中央値、標準偏差、異常日。
  - 曜日別・天候別、決済比率、商品売上構成と上位集中度。
  - 総評、売上推移、客数/客単価、曜日/天候、決済/商品、注目日、改善提案、注意点。
- API/UI:
  - `POST /pos-journals/ai-analysis`: 月次分析。保存済みデータがあればDB解析JSONを正本とし、未保管の2026年6月互換データは検証・再集計した画面データを使う。
  - `POST /pos-journals/ai-ask`: 最大500字の自由質問と直近8件の会話文脈。最高日、客単価、天候、商品、決済などに回答。
  - Groqの実測トークンは`ai_usage_events.surface='pos_journal'`へ記録し、AI使用料へ反映。
  - AIキーなし/API失敗/タイムアウト時は、画面を壊さず同じ事実データから基本分析・定型回答へフォールバック。
  - `pos-journal.html`へAI分析カード、進行状態、見出し別分析、質問候補、会話スレッドを追加。
- Safety:
  - クライアントの合計値・ランキングを信用せず日次/会計明細から再計算。DB保存済み月はクライアントJSONよりDBを優先。
  - 店舗/月を強制し、62日・1日200会計・1会計100品・リクエスト約900KBの上限、質問長・履歴数/文字数を検証。
  - 商品名などPOS文字列はプロンプト内で非信頼データとして扱い、命令に従わず、外部要因や利益を捏造しないよう制約。
- Verification:
  - 新規AI unit tests 5/5、既存LHA tests 4/4。
  - ローカルAPI E2E: 未認証401、AIキーなし基本分析200（総売上1,519,300円・最高日2026-06-12）、質問回答200、空データ200、501字質問400、未対応店舗400。
  - `npm run check`、既存`npm test` 90/90、UIインラインJS構文、実画面のAIカード/Q&A表示を確認。
  - Commit `1af2957`（機能）と`980c07a`（入力検証補強）をmainへpush。Pages run `30355275104`、Edge Functions run `30355274736`/`30355681784`はsuccess。
  - 本番`pos-journal.html`はHTTP 200でAI分析UIを確認、新AI API未認証は401。

### 2026-07-28 - 電子ジャーナルAI分析のPDF保存・DB履歴・削除

- Request: AI分析結果をPDFとして保存できるようにし、データベースへ蓄積、不要な履歴を削除できるようにする。
- Database/API:
  - migration `20260728115706_pos_journal_ai_analysis_history.sql`でprivate table `pos_journal_ai_analyses`を追加。
  - 分析本文、AI/基本分析区分、provider/model、警告、分析時点のfactsスナップショット、ファイル/日数、総売上、客数、客単価、生成日時を履歴ごとに保存。
  - 分析実行ごとに追加保存。同じ月の複数履歴を保持し、一覧は`created_at desc, id desc`。
  - `GET /pos-journals/ai-history`、`GET /pos-journals/ai-history/item`、`DELETE /pos-journals/ai-history/item`を追加。削除は店舗スコープと`confirmation === "delete"`完全一致を必須にする。
  - AI分析の表示はDB保存失敗で失わず、`history_saved=false`と警告を返すフェイルソフト設計。空データ/空本文は保存しない。
- UI/PDF:
  - AI分析カードに「PDFで保存」と「AI分析履歴」を追加。履歴から再表示、PDF、削除が可能。
  - PDFはブラウザ印刷の「PDFとして保存」を使用し、A4専用レイアウトで店舗、対象月、生成日時、AI種別/モデル、主要KPI、分析全文、注意を含める。
  - PDFは保存時点のfactsスナップショットを使うため、後日POSデータが変わっても履歴の主要数値が変化しない。
- Verification:
  - migration単体をローカルDBへ適用し、RLS有効、anon/authenticated直接SELECT不可を確認。
  - API E2E: 自動保存200、一覧200、詳細200、`DELETE`確認文字は400、`delete`は200、削除後詳細404。
  - 新規履歴テスト3/3、AI/LHAテスト10/10、既存`npm test` 90/90、`npm run check`成功。
  - 実画面のPDF保存処理からA4 PDFを生成。1ページ、日本語、店舗、総売上1,519,300円、改善提案を確認し、全ページをPNGへレンダリングして文字切れ・重なりなしを確認。
  - Commit `580915d`をmainへpush。Pages run `30364591130`、DB migration＋全Edge Functions run `30364585947`はsuccess。
  - 本番`pos-journal.html`はHTTP 200でPDF/履歴/削除UIを確認。履歴API未認証401。本番DBで`pos_journal_ai_analyses`、RLS有効、anon/authenticated SELECT不可、service_role insert/delete可を確認。

### 2026-07-27 - リポジトリ構成を整理

- Request: `line_report-main`直下に公開ページ、ローカルDB、復旧用バックアップ、生成物が混在していたため、既存URLを壊さずに整理する。
- Public site:
  - GitHub Pagesの公開HTML/JS、icons、vendor、system-mapを`public/`へ集約。
  - `.github/workflows/deploy-pages.yml`を追加し、`public/`だけをPages artifactとして配信する構成へ変更。
  - 公開URLは従来どおり`https://marugo-s.github.io/line_report/*.html`を維持。
- Local state:
  - SQLite DB/WAL/SHMを`.local/sqlite/`へ移動。
  - 復旧作業用SQL・スクリプトを`.local/backups/restore-work/`へ移動。
  - ローカル`deno.lock`を`.local/`へ移動し、不要な`.DS_Store`と自己参照`line_report` symlinkを除去。
  - 壊れたClaude worktree登録と約35MBの残骸を清掃。未統合の`wip-local-fix`ブランチは保護して変更していない。
- Compatibility:
  - 旧Express/SQLiteは旧配置が残る場合に優先し、整理後は`.local/sqlite/wine_price.db`と`.local/backups/runtime`を既定にする互換フォールバックを追加。
  - ローカルPagesサーバーは`.local/pages-preview/line_report -> public/`を使い、本番同様の`/line_report/` URLを維持。
- Guardrails:
  - `docs/REPOSITORY_STRUCTURE.md`を追加し、配置ルールを正本化。
  - `AGENTS.md`、`AI_HANDOFF.md`、README、DOCS-INDEX、SECURITYへ新構成を反映。
  - `tests/repository_structure.test.mjs`を追加し、公開ファイル、Pages workflow、ローカル状態、既存docsリンクを検査。
  - Graphify/Obsidian生成先と検査を`public/system-map/`へ更新し、`.local/`と公開system-map生成物をGraphify入力から除外。
- Verification:
  - `npm run check` success。
  - `npm test`はknowledge 7、structure 7、foodcourt 44、reservation 4、receipt 28、合計90/90 success。
  - `npm run knowledge:update` / `npm run knowledge:check` success。最終Graphify 3,708ノード、8,874関係、305コミュニティ、SQL 176ファイル、migration 175/175。
  - ローカル`/line_report/index.html`、`system-map.html`、`pages-config.js`がHTTP 200。静的href/srcの欠落なし。
  - Commit `8f6e779`を`main`へpush。GitHub Pagesをlegacy branch-root配信からActions workflow配信へ切替。
  - Pages run `30277607753` success。本番`index.html`、`analytics.html`、`system-map.html`、`pages-config.js`、環境図、graph statsは全てHTTP 200。

### 2026-07-27 11:48 JST - Graphify・Obsidian・AI開発知識環境を導入

- Request: Instatic TalksXと同様に、LINE ReportへObsidianとGraphifyを十分に連携した開発知識システムと、AIが活用できる環境図を構築する。
- Design:
  - Graphify = 現在のコード/SQL構造、関数・テーブル・migration・経路の索引。
  - Obsidian = 手書き知識、既存README/docsミラー、Graphify生成ノートの外部記憶。
  - AI = `knowledge:search` → `knowledge:check` → Graphify → 必要箇所精読 → 実装/検証 → 知識書き戻し → 再生成。
- Graphify:
  - 専用Python環境へ`tree-sitter-sql==0.3.11`を導入。
  - `.graphifyignore`でvendor、node_modules、生成物、backups、data、`.env*`、`.claude`、Supabase temp、`.clasp`を除外。
  - 古いSQLキャッシュ時はmigration coverage不足を検出し、`--force`で自動再抽出。
  - 最終結果: 2,982ノード、6,750関係、294コミュニティ、SQL 176ファイル/417ノード。Supabase migration 175/175件を全てグラフに収録。
- Environment diagrams:
  - `knowledge/system-architecture.json`を正本として3層図を生成。
  - 本番・配信・外部サービス: GitHub Pages/Actions、Supabase、LINE、Google、AI providers、補助/レガシー経路。
  - 業務データ・AI処理: レシート/OCR、売上、予約/Gmail、検索/メディア、口コミ、小口、フードコート予測/AI/品質ループ。
  - AI開発知識循環: AI入口、Obsidian検索、既存docsミラー、Graphify+SQL、精読、実装/テスト、本番確認、知識書き戻し。
- Management UI:
  - `index.html`ページメニューへ「システムマップ」を追加。
  - `system-map.html`を追加。`auth-session.js`の既存セッションを`POST /auth/verify`で検証し、全体管理者（storeScope/roomScope/scopeKindなし）だけ許可。
  - 未認証・店舗/ルーム限定セッションではiframeを読み込まず接続設定へ案内。
  - LINEアプリ経由は既存方針どおり`analytics.html?from=line`へリダイレクト。
  - コード/SQL構成、本番構成、業務AI構成、AI知識循環を切替表示。
- Obsidian:
  - `アプリ知識/10_アプリ別/LINE Report/`を作成し、総合アプリ一覧へ追加。
  - 手書き: 概要、アーキテクチャ/セキュリティ、運用、意思決定、障害、レシート、売上/口コミ、予約、フードコートAI。
  - `70_AI作業環境`: AI START HERE、3図、情報源、チェックリスト、Graphify/Obsidianブリッジ、Canvas 3件。
  - `80_リポジトリ文書`: README、AGENTS、HANDOFF、PROGRESS、docs 31件を自動ミラー。正本はGit側。
  - `90_Graphify`: 自動生成ノート3,276件と`graph.canvas`。nested `.obsidian`は削除。
  - LINE Report配下はMarkdown合計3,330件、AI workspace 10ファイル。
- Security:
  - `docs/SECURITY.md`へ公開システムマップの不変条件と更新チェックを追加。
  - Graphify/Obsidian/Gitへ秘密値、顧客データ、メッセージ本文、レシート画像、添付メディアを入れない。
  - 公開manifestにローカル`/Users/`パスなし。高リスク秘密値スキャン成功。
  - 本番`admin-api POST /auth/verify`は未認証で401を確認。
- Automation:
  - `knowledge:update`, `knowledge:check`, `knowledge:search`, `knowledge:generate`, `graphify:system-map`, `test:knowledge`, `check`, aggregate `test`を追加。
  - `docs/AI_CONTEXT.md`, `docs/AI_KNOWLEDGE_SYSTEM.md`, `system-map/`生成物を追加。
  - `npm run knowledge:search`で既存の`店舗運用修正記録`, `LINE-RECEIPT-ANALYSIS`, `SECURITY`, フードコート完全設計書等を検索できることを確認。
- Tests:
  - `npm run check`: success.
  - `npm test`: knowledge 7/7、foodcourt 44/44、reservation 4/4、receipt 28/28。合計83/83 success.
  - `npm run knowledge:check`: Graphify freshness、SQL coverage、構成hash、Web生成物、Obsidianミラー一致、Canvas、秘密値検査すべてsuccess.
  - Auth gate unit scenarios: tokenなし、store scope、future scopeKind拒否、全体管理者成功、stats失敗時のmap継続を確認。
- UI verification:
  - ローカル`system-map.html`未認証ゲートを1280×900で確認。マップは未読込、接続設定リンクを表示。
  - 3層環境図を1440×1000で確認。
  - 業務AI図を390×844で確認。統計を折返し表示、タブと大型図は横スクロール。
  - `?from=line&store_key=marugoS`は売上分析へリダイレクトし`<title>売上分析`を確認。
  - ObsidianアプリでLINE Reportの`00_AI_START_HERE`を開き、2,982ノード/6,750関係/SQL 176、3図/Canvas導線を確認。
- Documentation:
  - README、DOCS-INDEX、README-PAGES、SECURITY、店舗運用修正記録、ローカルサーバー案内を更新。
  - `AGENTS.md`, `AI_HANDOFF.md`, `PROJECT_PROGRESS.md`を追加。
- Deployment scope:
  - Supabase DB migration、Edge Functions、Secrets、LINE/Google/AI providers、本番データの変更なし。
  - Integration commit `1aecf7ef806b4573630b714dab55a1c3b4a6552e`とGraphify生成物整合commit `2c8eaf0956cab5f34da37437d19765e6d6bdc87c`を`main`へpush。
  - GitHub Pages workflow run `30233350201`（HEAD `2c8eaf0956cab5f34da37437d19765e6d6bdc87c`）はsuccess。
  - 公開`index.html`、`system-map.html`、`environment.html`、`graph.html`、`graph-stats.json`、`knowledge-system-manifest.json`は全てHTTP 200。
  - 公開環境図に2,982ノード、6,750関係、SQL 176ファイル/417ノード、3層図を確認。公開manifestにローカル`/Users/`パスなし。
  - 今回HEADの`Deploy Edge Functions` workflowは起動していない。Supabase DB/Functions/Secretsは変更なし。
- Remaining:
  - 認証済み本番全体管理者で4表示を切り替える最終操作確認。

### 2026-07-31 - AI分析を店舗住所基準に（新宿三丁目固定廃止）

- Request: 系列23店舗。四谷・丸の内・地方店もあり、ジャーナル店舗の住所で分析したい。
- Fix: `STORE_LOCATION_PROFILES` + AIプロンプトへ店舗立地ブロック。全店新宿三丁目前提を禁止。
- Deploy: Pages + `ai-analyze`（ユーザー端末からも deploy 可）。

### 2026-07-31 - Journal AI 意図ルーティング＋Perplexity/Grok

- Request: 数値は Kimi、戦略・対策は Perplexity/Grok を自動オーケストレーション。
- Changes: `journal_ai_orchestrate.ts` + `ai-analyze` chat 分岐、クライアント `orchestrationMode: auto`、モード注記表示。
- Secrets: `PERPLEXITY_API_KEY`（任意）、既存 Moonshot / xAI。
- Verify: `npm run test:journal-ai`。
- Deploy: `ai-analyze` + Pages。

### 2026-07-31 - AI参照を保存済み月間レポート優先に

- Request: ジャーナル検索より、カテゴリ分け済みの保存済みレポート（2023-07〜）を正本にしたい。
- Cause: `saved-reports` が created_at 降順+limit のため日別が月間を押し出していた。
- Fix: API `kind=monthly|daily`、クライアントは月間優先＋欠月だけ日別補完。
- Deploy: Pages + `admin-api`。

### 2026-07-31 - AIチャット年クエリに月次推移を付与

- Request: 「今年の売り上げの推移」で月次が無いと返る問題を直す。
- Cause: 年指定が年合計のみに集約され、AIへ月次系列が渡っていなかった。
- Fix: `summarizeMatched` の `monthlyBreakdown` を確定データ／ローカル回答に含め、推移説明を許可。
- Deploy: Pages（`public/jnm`）。Edge Function 変更なし。

### 2026-07-31 - AI分析ベースをマルゴグループ（ワイン推し）特化へ

- Request: Journal／売上AI分析・チャットを、一般飲食ではなくマルゴグループ専用（ワイン推し・ワイン充実）の前提で行う。会社情報は https://05-marugo-group.com 。
- Changes:
  - `supabase/functions/ai-analyze/index.ts` に `MARUGO_COMPANY_CONTEXT` を追加し、analyze/chat 既定プロンプトを更新。
  - `public/jnm/jnl2txt.html` / `index.html` のチャット厳格指示と分析 `systemInstruction` を同前提へ。
  - `pos_journal_ai.ts` の月次分析・Q&A system もマルゴ／ワイン軸へ更新。
  - `docs/店舗運用修正記録.md` に追記。
- Verification:
  - 埋め込みJS定数を Node で実行し会社URL含有を確認。
  - `npm run check`、`npm run test:structure` success。
  - Graphify／Obsidian はこのクラウド環境に未配置のため `knowledge:check` は未実施。
- Deploy notes:
  - Pages（`public/jnm`）と Edge Function `ai-analyze`（および `pos_journal_ai` を使う `admin-api`）の反映が必要。
### 2026-08-23 - 送信した感情イラストを自動表示

- Symptom: 感情イラストを送信しても、画像の下側が固定入力欄の裏に隠れ、「最新へ」が残ることがある。
- Fix: 送信直後に加え、画像の読み込みで高さが確定した後にも最新位置へスクロールし、送信したイラスト全体を表示する。
### 2026-08-23 - 感情イラストの表示サイズを選択可能に

- Request: アイコンを従来どおり大きく流すか、メッセージ内へ縮小して入れるか選びたい。
- Fix: イラスト選択画面に「大きく送る／小さく吹き出し内」を追加。小表示は64pxで吹き出し内に収め、選択した表示形式をメッセージへ保存する。
### 2026-08-23 - 小アイコンを文章と同じメッセージ内へ添付

- Correction: 小アイコン単独の吹き出しではなく、入力した文章と同じメッセージ内に入れたい。
- Fix: 「小さく吹き出し内」では選択時に即送信せず入力欄へ添付し、送信時に文章と64pxアイコンを同じ吹き出し内へ保存・表示する。
### 2026-08-23 - 文章入力中のアイコン添付を強調

- Request: メッセージ入力時に顔アイコンを点灯し、文章内へアイコンを入れられることを分かりやすくしたい。
- Fix: 入力中だけ顔ボタンを緑色の発光表示にし、その状態で一覧を開いた場合だけ「文章内に入れる」を初期選択する。空欄時は従来の「大きく送る」で開く。
### 2026-08-23 - 途中位置でもメッセージ下の空白を除去

- Symptom: 「最新へ」が表示される途中位置で、最後に見えているメッセージと入力欄の間へ大きな空白が残る。
- Fix: 読み込み済みの最後のメッセージが画面内にある場合だけ下端位置を補正し、入力欄直上へ寄せる。長い履歴の途中を読んでいる場合は自動移動しない。
### 2026-08-23 - 「最新へ」前に生じる空白の根本修正

- Root cause: 検索・途中ジャンプでは前後25件だけを読み込み、さらに新しい発言があると `viewHasLatest=false` になる。読み込み済み末尾の先はDOMに存在しないため、末尾まで来ると入力欄まで空白になっていた。「最新へ」で消えるのは最新50件を再読込するため。
- Fix: 最新未到達の範囲で読み込み済み末尾が見える、または下端へ達した時点で「最新へ」と同じ処理を自動実行する。重複再読込を防ぐロックも追加した。
### 2026-08-23 - アイコン読込後に残る「最新へ」空白を修正

- Missed cause: 感情イラストは `loading=lazy` のため、前回の空白判定時には画像の高さが未確定だった。判定後に画像が読み込まれて下端が変わっても再判定されず、アイコンの一部と大きな空白が残った。
- Fix: 画面内の全感情イラストについて `load` / `error` 完了後にレイアウト下端を再判定する。最新表示中は最下部へ追従し、途中範囲なら最新範囲へ自動接続する。
### 2026-08-23 - 最新取得後も残っていた誤った途中表示状態を修正

- Root cause: `selectGroup()` は最新50件を取得しても、検索・途中ジャンプ由来の `viewHasLatest=false` を `true` へ戻していなかった。そのため最新データ取得後も「最新へ」が残り、画面が途中位置として扱われていた。
- Fix: 最新ページ取得成功時に `viewHasLatest=true` と `followNewMessages=true` を必ず設定し、差分がなくても最下部スクロールとボタン更新を実行する。
### 2026-08-23 - iOSホーム画面版へ余白修正を強制反映

- Cause: `chat.html` を更新しても `chat-sw.js` のキャッシュ世代がv50のままで、iOSホーム画面版が開いたまま古い画面ロジックを保持する場合があった。
- Fix: チャットキャッシュをv51へ更新。新Service Workerの有効化時に表示中の `chat.html` を再ナビゲーションし、最新状態リセット修正を確実に読み込ませる。
### 2026-08-23 - 最新取得済みなのに残る空白の除外条件を修正

- Root cause: モバイルのメッセージ領域は `--chat-composer-height` で固定入力欄ぶんを予約するが、文章内アイコンのプレビュー解除や複数行入力の縮小後に予約高が更新されず、実際の入力欄との間に青い帯が残っていた。`selectGroup()` の初回計測も入力欄を表示する前で、「最新へ」による再選択時だけ正しい高さへ直る状態だった。加えて、最新取得済みの `viewHasLatest=true` は従来の空白解消処理から除外されていた。
- Fix: 固定入力欄がメイン領域へ実際に重なる高さを座標から計測し、入力欄の表示・リサイズを `ResizeObserver` と入力処理の両方で同期する。最新追従中は計測後に最下部へ戻す。最新取得済みで最後のメッセージ下にも空白がある場合は追従を自動復活し、未読込時は従来どおり最新範囲を再取得する。
- Deploy: この分岐修正を開いたままのホーム画面版へ届けるため、Service Workerキャッシュをv52へ更新する。

### 2026-08-24 - M-talk専用の管理画面とユーザー・ルーム別権限

- Request: `chat.html` だけに効く管理画面を用意し、ユーザーの利用停止・削除と、1対1／ルームごとの細かな権限を管理する。
- Changes:
  - `public/chat-admin.html` を追加し、全体のM-talk利用、1対1開始、ルーム作成、ユーザー一覧表示、ルーム別の閲覧・送信・招待・管理を設定可能にした。
  - `chat_user_access` とメンバー権限をRLS・RPC・Storage・予約送信・Web Pushまで一貫して強制し、直接APIを呼ぶ迂回経路も閉じた。
  - 「M-talkから削除」は履歴・ルーム・Supabase Authを保持するM-talk専用の論理削除とし、管理画面から復元できるようにした。
  - 管理操作の監査ログ、Bot保護、1対1の2人固定、停止期限の自動解除を追加した。
- Verification:
  - チャット契約テスト57件、Edge Function構文確認、全既存チャットmigrationから新migrationまでのPostgreSQLトランザクション適用を確認。
  - 実ブラウザで390px／1280px表示と横はみ出しがないことを確認。
  - ローカルDBへ既存chat関連44本＋新migrationを単一トランザクションで適用し、停止ユーザー、閲覧専用、非メンバー自己参加、管理RPCのauthenticated／anon拒否を実RLSで確認後、ROLLBACKした。
