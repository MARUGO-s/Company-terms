// フードコート「テナント一覧」レポート（v2.mallpro.jp）の自動解析（分析専用・売上には登録しない）。
// マルゴS等フードコート内店舗が毎日送る全テナントの売上/客数を抽出し、基準店=100の比較カードを返す。
// 安全策: ①対象店舗を限定（FOODCOURT_STORE_KEYS）②マーカー判定 ③抽出が表として成立しなければ未処理を返し
//   通常のレシート処理へフォールスルー（誤検知が売上に影響しない）。
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.44.0'
import { FOODCOURT_DASHBOARD_SCOPE, issueAdminDashboardLoginLinkToken } from './admin_dashboard_link_auth.ts'
import { fetchReceiptDailyAggForRange } from './admin_receipt_sales.ts'
import {
  buildFoodCourtRevisionMessages,
  compactFoodCourtEvaluationContext,
  foodCourtEvaluationScoreAnchors,
  foodCourtEvaluationSurfaceRules,
  foodCourtEvaluationPassed,
  foodCourtLoopHasBudget,
  foodCourtTextSimilarity,
  rankFoodCourtRagDocuments,
  resolveFoodCourtPassingThresholds,
} from './foodcourt_loop_utils.ts'
import {
  buildFoodCourtFallbackEvent,
  type FoodCourtAiAttempt,
  type FoodCourtFallbackEvent,
} from './foodcourt_loop_utils.ts'
import {
  auditFoodCourtAnswerNumbers,
  buildFoodCourtNumberAuditFeedback,
  stripFoodCourtThinkingBlocks,
} from './foodcourt_loop_utils.ts'
import { GROQ_TEXT_FALLBACK_MODEL, GROQ_TEXT_FOODCOURT_MODEL, resolveGroqTextModel } from './groq_model.ts'
import { callGrokTrendBrief, classifyJournalChatIntent, type GrokXSearchUsage } from './journal_ai_orchestrate.ts'
import {
  actualEventAttendance,
  maxActualEventAttendance,
  resolveEventAttendance,
} from './foodcourt_attendance.ts'

// LINE通知から開くフードコート分析ページ（本番）。小口現金と同方式: from=line＋store_key＋ワンタイム lt。
const FOODCOURT_PAGE_BASE = 'https://marugo-s.github.io/line_report/foodcourt.html'
const FOODCOURT_URI_MAX_LEN = 1000
// 2026-07-09: 日報×実績の効果対照表をコード側で組み立ててAIに渡すため v14 に上げ、旧キャッシュを再生成させる。
// 2026-07-23: 数値監査(未根拠係数の不合格化)＋施策の固定フォーマットを導入したため v17 に上げ、旧キャッシュを再生成させる。
// 2026-08-18: 規模帯・最大動員の数値は実測/手入力のみ。会場収容の推定はラベル専用にしたため v18。
export const FOODCOURT_ANALYSIS_AI_VERSION = 'foodcourt-analysis-ai-v18-actual-attendance'

// 全surface共通の「施策の固定フォーマット」。統合AIの最終出力で打ち手/次の一手を書く際に必ず守らせる。
// 実用性・根拠の低スコア（抽象的な施策・根拠のない価格/客数目標）への対策。
const FOODCOURT_ACTION_FORMAT_RULE =
  '【施策の書式・厳守】打ち手・次の一手を書くときは、各施策に必ず「対象客(誰の・どの来店動機)／実施条件(曜日・時間帯・イベント条件)／実施内容(具体的に)／観測KPI(何を見るか)／判定・中止ライン(いつ・どう成否判定するか)」を含める。' +
  '価格・客数・増加率などの数値は「実績値」「現場が決めた目標」「検証用の判定ライン(設定根拠つき)」のいずれかに限り、効果予測の数値を新規に作らない。根拠の無い数値は書かず「未計測」とすること。'
// 日次サマリー専用のキャッシュバージョン（ループ有効時）。日報×実績・動員数リンクを含む。
// 期間サマリー(foodcourt_period_ai_summary)は FOODCOURT_ANALYSIS_AI_VERSION を使う。
export const FOODCOURT_DAILY_ANALYSIS_AI_VERSION = 'foodcourt-analysis-ai-v18-actual-attendance'
// 日次サマリーの「実効」キャッシュバージョン。品質ループは未設定時OFF（fail closed）。
// 現行では通常版・loop版とも v16 なので、ON/OFFによる不要なキャッシュ再生成は発生しない。
export function resolveFoodCourtDailyAnalysisVersion(): string {
  return (fcEnvFlag('FOODCOURT_LOOP_ENABLED', false) && fcEnvFlag('FOODCOURT_LOOP_APPLY_TO_DAILY', false))
    ? FOODCOURT_DAILY_ANALYSIS_AI_VERSION
    : FOODCOURT_ANALYSIS_AI_VERSION
}

function buildFoodCourtPageUrl(storeKey: string, loginToken?: string | null): string {
  const key = String(storeKey || '').trim()
  const lt = String(loginToken ?? '').trim()
  if (lt) {
    const withToken = `${FOODCOURT_PAGE_BASE}?${new URLSearchParams({ store_key: key, from: 'line', lt }).toString()}`
    if (withToken.length <= FOODCOURT_URI_MAX_LEN) return withToken
  }
  return `${FOODCOURT_PAGE_BASE}?${new URLSearchParams({ store_key: key, from: 'line' }).toString()}`
}

async function buildFoodCourtDashboardLink(supabase: SupabaseClient, storeKey: string): Promise<string> {
  const key = String(storeKey || '').trim()
  if (!key) return ''
  try {
    const issued = await issueAdminDashboardLoginLinkToken(supabase, {
      source: 'line_foodcourt', store_partition_key: key, scope: FOODCOURT_DASHBOARD_SCOPE,
    })
    return buildFoodCourtPageUrl(key, issued.token)
  } catch (e) {
    console.error('buildFoodCourtDashboardLink failed:', e instanceof Error ? e.message : String(e))
    return buildFoodCourtPageUrl(key, null)
  }
}

// フードコートレポートを送ってくる店舗（基準店）。baseTenantName=比較の基準、expectedTenants=想定テナント数(Groq抽出の十分性判定用)。
export const FOODCOURT_STORE_KEYS: Record<string, { baseTenantName: string; expectedTenants?: number }> = {
  marugoS: { baseTenantName: 'MARUGO S', expectedTenants: 11 },
}

// フードコート一覧らしさのマーカー（テナント表＝全テナントの対象/比較 売上・客数が並ぶ）。
const FOODCOURT_MARKERS =
  /テナント|対象売上|比較売上|売上比率|客数比率|対象客数|比較客数|mallpro|5092\d{3}/i

// 月末/月初に「日次ではなく月間の総売上（税抜）」の一覧が誤って送られてくることがある（テーブル自体に
// 日次/月次を判別する印字が無い）。直近の日次実績の中央値の何倍を超えたら月次集計とみなすかの閾値。
const FOODCOURT_MONTHLY_ANOMALY_MULTIPLIER = 6

// フードコート画像の売上(税抜)と、レシート集計(税抜net・売上分析と同一の正本)を突き合わせる。1円でも
// 差があれば乖離とみなす（誤差は許容しない・完全一致のみ合格）。一致すればnull、乖離があれば確認カード/
// 記録カードに載せる注意文を返す。レシート未取込の日は判定しない。
async function checkFoodCourtReceiptConsistency(
  supabase: SupabaseClient,
  storeKey: string,
  salesDate: string,
  imageSales: number,
): Promise<string | null> {
  try {
    const rows = await fetchReceiptDailyAggForRange(supabase, storeKey, salesDate, salesDate)
    const row = rows.find((r) => r.date === salesDate)
    if (!row || row.receipt_count <= 0) return null
    const diff = imageSales - row.net_sales_yen
    if (diff === 0) return null
    return `⚠ レシート集計(税抜${fcYen(row.net_sales_yen)})と画像の売上(税抜${fcYen(imageSales)})に差があります（差額${fcYen(diff)}）。日付や抽出結果をご確認ください。`
  } catch (e) {
    console.error('checkFoodCourtReceiptConsistency failed:', e instanceof Error ? e.message : String(e))
    return null
  }
}

// 推定の売上日(report_date換算)に、既にfoodcourt_tenant_reportsの登録があるか確認する。あれば「登録すると
// 既存データを置き換える」旨の注意文を返す（saveFoodCourtReportは同一report_dateの他行を削除して1件に保つ
// ため、実際に置き換わる。ここは確認カードで事前にそれをユーザーへ知らせるための表示専用チェック）。
async function checkFoodCourtExistingReport(
  supabase: SupabaseClient,
  storeKey: string,
  reportDate: string,
  baseName: string,
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('foodcourt_tenant_reports')
      .select('tenants')
      .eq('store_partition_key', storeKey)
      .eq('report_date', reportDate)
      .limit(1)
      .maybeSingle()
    if (!data) return null
    const raw = Array.isArray((data as { tenants?: unknown }).tenants) ? (data as { tenants?: unknown[] }).tenants as unknown[] : []
    const existing = raw.find((t) => {
      const o = (t && typeof t === 'object') ? t as Record<string, unknown> : {}
      return normalizeName(String(o.name ?? '')) === normalizeName(baseName)
    })
    const existingSales = existing ? numOrNull((existing as Record<string, unknown>).sales) : null
    return `⚠ この日付は既に登録済みです（既存の売上${existingSales != null ? fcYen(existingSales) : '—'}）。登録すると既存データを置き換えます。`
  } catch (e) {
    console.error('checkFoodCourtExistingReport failed:', e instanceof Error ? e.message : String(e))
    return null
  }
}

export type FoodCourtTenant = {
  name: string
  code: string | null
  sales: number | null
  guests: number | null
  /** 比較売上（前年/前期）。比較分析用。読めなければ null。 */
  compSales?: number | null
  /** 比較客数（前年/前期）。 */
  compGuests?: number | null
}

export function looksLikeFoodCourtReport(text: string): boolean {
  return FOODCOURT_MARKERS.test(String(text ?? ''))
}

/** 同じ画像バイト列の base64 を使い回すキャッシュ（Gemini→Azure退避で二重エンコードしない）。 */
const reportImageBase64Cache = new WeakMap<Uint8Array, string>()

/** 数MBの中間文字列を作り直すと worker の CPU を食うため、同一 Uint8Array なら再エンコードしない。 */
function toBase64(bytes: Uint8Array): string {
  const cached = reportImageBase64Cache.get(bytes)
  if (cached !== undefined) return cached
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  const encoded = btoa(binary)
  reportImageBase64Cache.set(bytes, encoded)
  return encoded
}

function parseFirstJson(text: string): Record<string, unknown> | null {
  const s = text.indexOf('{')
  const e = text.lastIndexOf('}')
  if (s < 0 || e <= s) return null
  try {
    const o = JSON.parse(text.slice(s, e + 1))
    return (o && typeof o === 'object') ? o as Record<string, unknown> : null
  } catch {
    return null
  }
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null
  const n = Number(String(v).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? Math.round(n) : null
}

// ===== AI使用量の記録 =====
// フードコートのAI（Q&A=Groqチャット／テナント表の画像抽出=Groq/Gemini Vision）の実測トークンを
// ai_usage_events に1行記録し、AI使用料ページ（/usage/ai-cost＝実測トークン×公式単価）に反映させる。
export interface FoodCourtAiUsage {
  provider: 'azure_openai' | 'groq' | 'gemini' | 'claude' | 'openai' | 'grok' | 'moonshot'
  model: string
  inputTokens: number
  outputTokens: number
  thinkingTokens: number | null
  totalTokens: number
}
function groqUsageFrom(json: unknown, model: string): FoodCourtAiUsage | null {
  const u = (json && typeof json === 'object') ? (json as { usage?: unknown }).usage : null
  if (!u || typeof u !== 'object') return null
  const m = u as Record<string, unknown>
  const inp = Number(m.prompt_tokens ?? 0) || 0
  const out = Number(m.completion_tokens ?? 0) || 0
  const tot = Number(m.total_tokens ?? 0) || (inp + out)
  if (!inp && !out && !tot) return null
  return { provider: 'groq', model, inputTokens: inp, outputTokens: out, thinkingTokens: null, totalTokens: tot }
}

function azureFoundryUsageFrom(json: unknown, model: string): FoodCourtAiUsage | null {
  const u = (json && typeof json === 'object') ? (json as { usage?: unknown }).usage : null
  if (!u || typeof u !== 'object') return null
  const m = u as Record<string, unknown>
  const inp = Number(m.input_tokens ?? 0) || 0
  const out = Number(m.output_tokens ?? 0) || 0
  const tot = Number(m.total_tokens ?? 0) || (inp + out)
  const details = (m.output_tokens_details && typeof m.output_tokens_details === 'object')
    ? m.output_tokens_details as Record<string, unknown>
    : null
  const thinking = details?.reasoning_tokens != null ? (Number(details.reasoning_tokens) || 0) : null
  if (!inp && !out && !tot) return null
  return { provider: 'azure_openai', model, inputTokens: inp, outputTokens: out, thinkingTokens: thinking, totalTokens: tot }
}
function geminiUsageFrom(json: unknown, model: string): FoodCourtAiUsage | null {
  const u = (json && typeof json === 'object') ? (json as { usageMetadata?: unknown }).usageMetadata : null
  if (!u || typeof u !== 'object') return null
  const m = u as Record<string, unknown>
  const inp = Number(m.promptTokenCount ?? 0) || 0
  const out = Number(m.candidatesTokenCount ?? 0) || 0
  const th = m.thoughtsTokenCount != null ? (Number(m.thoughtsTokenCount) || 0) : null
  const tot = Number(m.totalTokenCount ?? 0) || (inp + out + (th ?? 0))
  if (!inp && !out && !tot) return null
  return { provider: 'gemini', model, inputTokens: inp, outputTokens: out, thinkingTokens: th, totalTokens: tot }
}
function claudeUsageFrom(json: unknown, model: string): FoodCourtAiUsage | null {
  const u = (json && typeof json === 'object') ? (json as { usage?: unknown }).usage : null
  if (!u || typeof u !== 'object') return null
  const m = u as Record<string, unknown>
  const inp = Number(m.input_tokens ?? 0) || 0
  const out = Number(m.output_tokens ?? 0) || 0
  const tot = inp + out
  if (!inp && !out && !tot) return null
  return { provider: 'claude', model, inputTokens: inp, outputTokens: out, thinkingTokens: null, totalTokens: tot }
}
function openaiUsageFrom(json: unknown, model: string): FoodCourtAiUsage | null {
  const u = (json && typeof json === 'object') ? (json as { usage?: unknown }).usage : null
  if (!u || typeof u !== 'object') return null
  const m = u as Record<string, unknown>
  const inp = Number(m.prompt_tokens ?? m.input_tokens ?? 0) || 0
  const rawOut = Number(m.completion_tokens ?? m.output_tokens ?? 0) || 0
  const tot = Number(m.total_tokens ?? 0) || (inp + rawOut)
  // o系推論モデル: completion_tokens には reasoning(思考)トークンが含まれる。
  // Geminiと同じ「output=本文のみ / thinking=思考」の意味に揃えて分離する
  // （AI使用料ページは output+thinking を出力課金として合算するので二重計上しない）。
  const details = (m.completion_tokens_details && typeof m.completion_tokens_details === 'object')
    ? m.completion_tokens_details as Record<string, unknown>
    : null
  const reasoning = details && details.reasoning_tokens != null ? (Number(details.reasoning_tokens) || 0) : null
  const out = reasoning != null ? Math.max(0, rawOut - reasoning) : rawOut
  if (!inp && !rawOut && !tot) return null
  return { provider: 'openai', model, inputTokens: inp, outputTokens: out, thinkingTokens: reasoning, totalTokens: tot }
}
// Moonshot(Kimi)はOpenAI互換。completion_tokens に reasoning(思考)が含まれるため openai と同様に分離する。
function moonshotUsageFrom(json: unknown, model: string): FoodCourtAiUsage | null {
  const u = (json && typeof json === 'object') ? (json as { usage?: unknown }).usage : null
  if (!u || typeof u !== 'object') return null
  const m = u as Record<string, unknown>
  const inp = Number(m.prompt_tokens ?? m.input_tokens ?? 0) || 0
  const rawOut = Number(m.completion_tokens ?? m.output_tokens ?? 0) || 0
  const tot = Number(m.total_tokens ?? 0) || (inp + rawOut)
  const details = (m.completion_tokens_details && typeof m.completion_tokens_details === 'object')
    ? m.completion_tokens_details as Record<string, unknown>
    : null
  const reasoning = details && details.reasoning_tokens != null ? (Number(details.reasoning_tokens) || 0) : null
  const out = reasoning != null ? Math.max(0, rawOut - reasoning) : rawOut
  if (!inp && !rawOut && !tot) return null
  return { provider: 'moonshot', model, inputTokens: inp, outputTokens: out, thinkingTokens: reasoning, totalTokens: tot }
}
async function recordFoodCourtAiUsage(
  supabase: SupabaseClient | null | undefined,
  storeKey: string,
  lineMessageId: string | null,
  usage: FoodCourtAiUsage | null,
): Promise<void> {
  if (!supabase || !storeKey || !usage) return
  try {
    const { error } = await supabase.from('ai_usage_events').insert({
      store_partition_key: storeKey,
      provider: usage.provider,
      model: usage.model,
      input_tokens: usage.inputTokens || 0,
      output_tokens: usage.outputTokens || 0,
      thinking_tokens: usage.thinkingTokens,
      total_tokens: usage.totalTokens || 0,
      line_message_id: lineMessageId,
      surface: 'foodcourt', // 用途タグ: フードコート分析(Q&A・テナント表画像抽出)。レシート解析と区別する。
    })
    if (error) console.error('foodcourt ai_usage_events insert failed:', error.message)
  } catch (e) {
    console.error('foodcourt ai_usage_events insert threw:', (e instanceof Error ? e.message : String(e)).slice(0, 200))
  }
}

function tenantsFromParsed(parsed: Record<string, unknown> | null): FoodCourtTenant[] | null {
  const rawList = parsed && Array.isArray(parsed.tenants) ? parsed.tenants : null
  if (!rawList) return null
  const tenants: FoodCourtTenant[] = []
  for (const r of rawList) {
    const o = (r && typeof r === 'object') ? r as Record<string, unknown> : {}
    const name = String(o.name ?? '').trim()
    if (!name) continue
    const code = o.code != null ? String(o.code).replace(/[^\d]/g, '').slice(0, 12) || null : null
    // OCR誤読対策: 安定codeがあれば正規店名へ寄せ、無ければ既知エイリアスを補正してから保存する。
    const canonName = (code && FC_CODE_TO_NAME[code]) ? FC_CODE_TO_NAME[code] : (FC_NAME_ALIASES[name] || name)
    tenants.push({
      name: canonName.slice(0, 60),
      code,
      sales: numOrNull(o.sales),
      guests: numOrNull(o.guests),
      compSales: numOrNull(o.comp_sales),
      compGuests: numOrNull(o.comp_guests),
    })
  }
  return tenants.length ? tenants : null
}

const EXTRACT_PROMPT = [
  'この画像はフードコートの「テナント一覧」売上レポート（各テナントの対象売上・比較売上・対象客数などが行で並ぶ表）です。',
  '表の**全テナント行**を抜き出して、JSONだけを返してください（前後に文章を付けない）。',
  '各行: name=テナント名（印字どおり）, code=テナントコード（数字。無ければnull）, sales=「対象売上」, guests=「対象客数」, comp_sales=「比較売上」, comp_guests=「比較客数」。',
  '数値はカンマ・¥・%・空白を除いた整数にする。「売上比率」「客数比率」の%列は出さなくてよい（システムが計算する）。読めない数値はnull。比較売上が0や空欄なら comp_sales=0 とする。',
  '出力形式: {"tenants":[{"name":"店名","code":"5092133","sales":496838,"guests":265,"comp_sales":620196,"comp_guests":318}, ...]}',
].join('\n')

// 自己完結の Gemini Vision 呼び出し（テナント表を JSON 抽出）。レシート用スキーマには依存しない。
export async function extractFoodCourtTenants(
  bytes: Uint8Array,
  contentType: string | null,
  geminiApiKey: string,
  model: string,
  timeoutMs = 30000,
  onUsage?: (u: FoodCourtAiUsage) => void,
): Promise<FoodCourtTenant[] | null> {
  if (!geminiApiKey || !bytes || bytes.byteLength <= 0) return null
  const mime = String(contentType ?? '').trim().toLowerCase()
  if (!/^image\/(png|jpe?g|webp|gif|heic|heif)$/.test(mime)) return null

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
  const body = {
    contents: [
      { role: 'user', parts: [{ text: EXTRACT_PROMPT }, { inline_data: { mime_type: mime, data: toBase64(bytes) } }] },
    ],
    generationConfig: { temperature: 0.1, maxOutputTokens: 16384, responseMimeType: 'application/json' },
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (e) {
    console.error('extractFoodCourtTenants fetch failed:', e instanceof Error ? e.message : String(e))
    return null
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    console.error('extractFoodCourtTenants http error:', res.status)
    return null
  }
  const json = await res.json().catch(() => null) as
    | { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    | null
  if (onUsage) { const u = geminiUsageFrom(json, model); if (u) onUsage(u) }
  const text = json?.candidates?.[0]?.content?.parts?.map((p) => p?.text ?? '').join('') ?? ''
  return tenantsFromParsed(parseFirstJson(text))
}

// Azure AI Foundry でフードコート表を直接抽出。失敗時だけ呼び出し側で Gemini に退避する。
export async function extractFoodCourtTenantsAzureFoundry(
  bytes: Uint8Array,
  contentType: string | null,
  projectEndpoint: string,
  apiKey: string,
  deployment: string,
  timeoutMs = 40000,
  onUsage?: (u: FoodCourtAiUsage) => void,
): Promise<FoodCourtTenant[] | null> {
  if (!projectEndpoint || !apiKey || !bytes || bytes.byteLength <= 0) return null
  const mime = String(contentType ?? '').trim().toLowerCase()
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(mime)) return null
  const endpoint = `${projectEndpoint.replace(/\/+$/, '')}/openai/v1/responses`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: deployment || 'gpt-5.4-nano',
        instructions: EXTRACT_PROMPT,
        input: [{ role: 'user', content: [
          { type: 'input_text', text: 'このフードコートのテナント一覧表を全行JSONで抽出してください。' },
          { type: 'input_image', image_url: `data:${mime};base64,${toBase64(bytes)}`, detail: 'high' },
        ],
        }],
        text: { format: { type: 'json_object' } },
        max_output_tokens: 2000,
      }),
      signal: controller.signal,
    })
  } catch (e) {
    console.error('extractFoodCourtTenantsAzureFoundry fetch failed:', e instanceof Error ? e.message : String(e))
    return null
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) { console.error('extractFoodCourtTenantsAzureFoundry http error:', res.status); return null }
  const json = await res.json().catch(() => null) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }>; usage?: unknown } | null
  if (onUsage) { const u = azureFoundryUsageFrom(json, deployment || 'gpt-5.4-nano'); if (u) onUsage(u) }
  const content = String(json?.output_text ?? json?.output?.flatMap((v) => v.content ?? []).map((v) => v.text ?? '').join('\n') ?? '')
  return tenantsFromParsed(parseFirstJson(content))
}

export type FoodCourtComparison = {
  baseName: string
  baseSales: number
  baseGuests: number
  baseUnit: number | null
  totalSales: number
  baseSharePct: number | null
  salesRank: number
  guestRank: number
  unitRank: number
  count: number
  rows: Array<{ name: string; sales: number | null; salesRatio: number | null; guests: number | null; unit: number | null }>
}

const yen = (v: number) => '¥' + Math.round(v).toLocaleString('ja-JP')
const pct1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1) + '%'
const unitOf = (t: FoodCourtTenant) => (t.sales != null && t.guests && t.guests > 0) ? t.sales / t.guests : null

// 基準店=100 の比較を計算（売上が読めたテナントのみ対象）。
export function computeFoodCourtComparison(tenants: FoodCourtTenant[], baseName: string): FoodCourtComparison | null {
  const valid = tenants.filter((t) => t.sales != null && t.sales >= 0)
  if (valid.length < 2) return null
  const base = valid.find((t) => normalizeName(t.name) === normalizeName(baseName))
  if (!base || base.sales == null) return null
  const baseSales = base.sales
  const baseGuests = base.guests ?? 0
  const baseUnit = unitOf(base)
  const totalSales = valid.reduce((a, b) => a + (b.sales ?? 0), 0)
  const salesRank = 1 + valid.filter((t) => (t.sales ?? 0) > baseSales).length
  const guestRank = 1 + valid.filter((t) => (t.guests ?? 0) > baseGuests).length
  const unitRank = baseUnit == null ? 0 : 1 + valid.filter((t) => { const u = unitOf(t); return u != null && u > baseUnit }).length
  const rows = valid
    .map((t) => ({
      name: t.name,
      sales: t.sales,
      salesRatio: (t.sales != null && baseSales > 0) ? (t.sales / baseSales) * 100 : null,
      guests: t.guests,
      unit: unitOf(t),
    }))
    .sort((a, b) => (b.sales ?? 0) - (a.sales ?? 0))
  return {
    baseName: base.name,
    baseSales,
    baseGuests,
    baseUnit,
    totalSales,
    baseSharePct: totalSales > 0 ? (baseSales / totalSales) * 100 : null,
    salesRank,
    guestRank,
    unitRank,
    count: valid.length,
    rows,
  }
}

function normalizeName(s: string): string {
  return String(s ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}

// FOOD STADIUM TOKYO の安定POSコード→正規店名。OCRで name が誤読（獺月/蟬月/パインセオ/ビアー等）でも
// code で同定して正しい11店に寄せる。店舗数が11を超えて分析がブレるのを防ぐ。code未知は名前を尊重。
const FC_CODE_TO_NAME: Record<string, string> = {
  '5092133': 'クラフトビアマーケット', '5092134': 'ベトナム屋台バインセオサイゴン', '5092135': '新御茶ノ水 萬龍',
  '5092136': 'ニュー大金星', '5092137': 'A destra Salvatore', '5092138': '蟻月', '5092139': 'チャルモゴッソヨ',
  '5092140': 'ラーメン＆酒バル 麺屋一燈', '5092141': '台湾点心とビール 恒久飯店', '5092143': '水道橋 すしわさび', '5092162': 'MARUGO S',
}
const FC_NAME_ALIASES: Record<string, string> = {
  'クラフトビアーマーケット': 'クラフトビアマーケット', 'チャルモゴッツォヨ': 'チャルモゴッソヨ',
  'ベトナム屋台パインセオサイゴン': 'ベトナム屋台バインセオサイゴン', '獺月': '蟻月', '蟬月': '蟻月',
}
function canonFoodcourtReports(reports: Array<Record<string, unknown>>): void {
  for (const r of reports || []) {
    const raw = Array.isArray((r as { tenants?: unknown }).tenants) ? (r as { tenants?: unknown[] }).tenants as unknown[] : []
    for (const t of raw) {
      if (!t || typeof t !== 'object') continue
      const o = t as Record<string, unknown>
      const code = o.code != null ? String(o.code).replace(/[^\d]/g, '') : ''
      if (code && FC_CODE_TO_NAME[code]) { o.name = FC_CODE_TO_NAME[code]; continue }
      const nm = String(o.name ?? '').trim()
      if (FC_NAME_ALIASES[nm]) o.name = FC_NAME_ALIASES[nm]
    }
  }
}

function fieldRow(label: string, value: string): Record<string, unknown> {
  return {
    type: 'box', layout: 'baseline', spacing: 'sm',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#8a96a3', flex: 3 },
      { type: 'text', text: value, size: 'sm', color: '#333333', flex: 7, wrap: true },
    ],
  }
}

// 比較カード（Flex）。コンパクトなサマリー＋上位3店。
export function buildFoodCourtCompareFlex(cmp: FoodCourtComparison): Record<string, unknown> {
  const top = cmp.rows.slice(0, 3).map((r, i) =>
    fieldRow(`${i + 1}位 ${r.name}`, r.salesRatio != null ? pct1(r.salesRatio) : '—'))
  const unitLine = cmp.baseUnit != null ? `${yen(cmp.baseUnit)}（${cmp.count}店中 ${cmp.unitRank}位）` : '—'
  return {
    type: 'flex',
    altText: `フードコート売上比較（基準 ${cmp.baseName}）`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [
          { type: 'text', text: '🍴 フードコート内 売上比較', weight: 'bold', size: 'md', color: '#1a6fa8' },
          { type: 'text', text: `基準: ${cmp.baseName} ＝ 100（売上には登録していません／分析のみ）`, size: 'xs', color: '#8a96a3', wrap: true },
          { type: 'separator', margin: 'md' },
          fieldRow('基準店の売上', `${yen(cmp.baseSales)}（${cmp.count}店中 ${cmp.salesRank}位）`),
          fieldRow('基準店の客数', `${cmp.baseGuests || '—'}（${cmp.count}店中 ${cmp.guestRank}位）`),
          fieldRow('基準店の客単価', unitLine),
          fieldRow('フードコート内シェア', cmp.baseSharePct != null ? pct1(cmp.baseSharePct) : '—'),
          { type: 'separator', margin: 'md' },
          { type: 'text', text: '売上トップ3（基準店=100）', size: 'xs', color: '#8a96a3', margin: 'sm' },
          ...top,
        ],
      },
    },
  }
}

// 短い記録通知（毎回の分析結果は出さず「記録した・サイトで質問してね」＋分析ページボタン）。
export function buildFoodCourtAckFlex(n: number, pageUrl?: string | null, salesDate?: string | null, receiptWarning?: string | null): Record<string, unknown> {
  const bubble: Record<string, unknown> = {
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm',
      contents: [
        { type: 'text', text: '📊 フードコート集計を記録しました', weight: 'bold', size: 'md', color: '#1a6fa8' },
        { type: 'text', text: `${n}テナント分を保存（売上には登録していません）。${salesDate ? `売上日: ${salesDate}` : ''}`, size: 'sm', color: '#444444', wrap: true },
        { type: 'text', text: '下のボタンから分析ページを開き、データに質問できます。', size: 'xs', color: '#8a96a3', wrap: true },
        ...(receiptWarning ? [{ type: 'text', text: receiptWarning, size: 'xs', color: '#c0392b', wrap: true, margin: 'md' }] : []),
      ],
    },
  }
  const url = String(pageUrl ?? '').trim()
  if (url) {
    bubble.footer = {
      type: 'box', layout: 'vertical', spacing: 'sm',
      contents: [
        { type: 'button', style: 'primary', color: '#1a6fa8', height: 'sm', action: { type: 'uri', label: 'フードコート分析を開く', uri: url } },
      ],
    }
  }
  return { type: 'flex', altText: 'フードコート集計を記録しました', contents: bubble }
}

async function groqChat(
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
  model: string,
  maxTokens = 800,
  signal?: AbortSignal,
): Promise<FoodCourtChatResult> {
  if (!apiKey) return { content: null, usage: null, reason: 'missing_key' }
  try {
    const modelId = String(model).toLowerCase()
    const isQwen36 = modelId === 'qwen/qwen3.6-27b'
    const isGptOss = modelId.includes('gpt-oss')
    // gpt-oss は reasoning モデル。max_tokens=600 だと思考で枠を使い切り content が空になる。
    // Groq は gpt-oss に none を受け付けないので low + hidden、出力枠も確保する。
    const completionTokens = isGptOss ? Math.max(maxTokens, 2000) : maxTokens
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: completionTokens,
        max_completion_tokens: completionTokens,
        messages,
        // Qwen3.6は非思考モード＋reasoning非表示で、<think>漏出・思考だけで出力上限消費を防ぐ。
        ...(isQwen36 ? { reasoning_effort: 'none', reasoning_format: 'hidden' } : {}),
        ...(isGptOss ? { reasoning_effort: 'low', reasoning_format: 'hidden' } : {}),
      }),
      signal,
    })
    if (!res.ok) { console.error('groqChat http error:', model, res.status); return { content: null, usage: null, reason: httpReason(res.status) } }
    const json = await res.json().catch(() => null) as { choices?: Array<{ message?: { content?: string } }>; usage?: unknown } | null
    const c = stripFoodCourtThinkingBlocks(String(json?.choices?.[0]?.message?.content ?? '').trim())
    return { content: c || null, usage: groqUsageFrom(json, model), reason: c ? null : 'empty_content' }
  } catch (e) { console.error('groqChat failed:', e instanceof Error ? e.message : String(e)); return { content: null, usage: null, reason: exceptionReason(e) } }
}

type FoodCourtChatMessage = { role: string; content: string }
type FoodCourtChatProvider = 'groq' | 'gemini' | 'claude' | 'openai' | 'grok' | 'moonshot'

// 各 *Chat 関数の共通戻り値。reason はフォールバック記録用の失敗理由（成功時は null）。
type FoodCourtChatResult = { content: string | null; usage: FoodCourtAiUsage | null; reason?: string | null }

// HTTPステータスから失敗理由ラベルを作る（フォールバック履歴の可読性のため粒度を粗くする）。
function httpReason(status: number): string {
  if (status === 429) return 'rate_limited'
  if (status >= 500) return `http_${status}`
  if (status === 401 || status === 403) return 'auth_error'
  if (status === 404) return 'model_not_found'
  if (status >= 400) return `http_${status}`
  return `http_${status}`
}

// 例外から失敗理由ラベルを作る（AbortSignal のタイムアウト/中断も判別）。
function exceptionReason(e: unknown): string {
  const name = (e as { name?: unknown })?.name
  if (name === 'TimeoutError') return 'timeout'
  if (name === 'AbortError') return 'aborted'
  const msg = e instanceof Error ? e.message : String(e)
  if (/deadline/i.test(msg)) return 'deadline'
  if (/timeout/i.test(msg)) return 'timeout'
  return 'exception'
}

function resolveFoodCourtGeminiApiKey(): string {
  return String(Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY') || Deno.env.get('VISION_API_KEY') || '').trim()
}

function resolveFoodCourtGrokApiKey(): string {
  return String(Deno.env.get('XAI_API_KEY') || Deno.env.get('GROK_API_KEY') || '').trim()
}

function resolveFoodCourtGrokModel(): string {
  return String(Deno.env.get('FOODCOURT_GROK_MODEL') || '').trim() || 'grok-3-mini'
}

// ===== X（旧Twitter）最新トレンドブリーフ =====
// 専門AI③は Chat Completions (/v1/chat/completions) 経由で Grok を呼ぶが、この経路は
// 関数ツールしか受け付けず x_search が使えない。つまり専門AI③は「Xを検索している」のではなく
// 学習済み知識で答えているだけになる。実際にXを検索できるのは Responses API + x_search だけなので、
// journal 側で実装済みの callGrokTrendBrief を再利用し、その結果を分析の材料として渡す。
// 参照: docs/フードコートAI分析システム_設計解説.md（専門AI③の設計意図）

type FoodCourtXTrendBrief = { text: string; citations: string[] }

// 同日・同トピックの再質問で毎回課金しないための isolate 内キャッシュ。
// 成功は長め、失敗は短めに保持する（一時的な失敗で半日ブラインドにならないように）。
const FOODCOURT_X_TREND_CACHE = new Map<string, { at: number; ttlMs: number; brief: FoodCourtXTrendBrief | null }>()

function foodCourtEnvFlag(name: string, fallback: boolean): boolean {
  const raw = String(Deno.env.get(name) ?? '').trim().toLowerCase()
  if (!raw) return fallback
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true
  if (['0', 'false', 'no', 'off'].includes(raw)) return false
  return fallback
}

function foodCourtEnvInt(name: string, fallback: number, min: number, max: number): number {
  const n = Number(Deno.env.get(name))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

// 全サーフェス共通の検索トピック。Q&Aでもユーザーの質問文は検索クエリに使わない。
//
// 【重要・2026-08-04の実測で判明】Q&Aだけ質問文を渡していたが、これは誤りだった。
// このシステムへの質問は「売上を伸ばすための提案を3つ」のように自店の数字についてのもので、
// Xには存在しない。実際にその質問文で検索した結果、無関係な投稿を31,728トークン取り込んで
// 課金だけ発生し、X投稿の引用が成立せずブロックごと破棄された。
// 検索すべきは常に「外の世界の食トレンド」で、質問によって変わらない。
// 固定トピックにすることで全店舗・全サーフェスがキャッシュを共有し、1日1検索に集約される。
//
// 【範囲について】東京ドーム周辺に絞るとX上の投稿数が足りず、拾える話題が痩せる。
// 会場のイベント・客層は専門AI②が tokyo_dome_events から取っており、Xで補う必要はない。
// Xに投稿量があり、かつ他のどのデータソースにも無いのは「いま何が食べられ、どう見せられ、
// どう語られているか」なので、地域は東京〜全国まで広げ、メニュー・商品の方向性に効く
// 食トレンドを主対象にする。
const FOODCOURT_X_TREND_TOPIC_DEFAULT = [
  '外食・グルメの直近トレンド（東京中心。話題が薄ければ全国まで広げてよい）。次の観点で複数回検索すること:',
  '(1) スパイスカレー・カレー全般の流行 — 新しい味/スパイス使い、トッピング、提供スタイル、話題の店の何が支持されているか',
  '(2) ワインの飲まれ方 — ペアリング、グラス売り、カジュアル層や若年層の関心、food+wineの組み合わせで話題のもの',
  '(3) フードコート/フードホール/商業施設内飲食で人気・行列になっているメニューと、その理由',
  '(4) SNSで話題の食の見せ方（盛り付け・器・写真映え）と、季節・時期特有の需要（猛暑/夏メニュー等）',
  '各観点で「実際に何が話題か」を具体名で挙げること。一般論ではなく、投稿で確認できた個別の事象を書く。',
].join('\n')

/** 検索トピック。デプロイせずに調整できるよう env で上書き可能にする。 */
function foodCourtXTrendTopic(): string {
  return String(Deno.env.get('FOODCOURT_X_SEARCH_TOPIC') || '').trim() || FOODCOURT_X_TREND_TOPIC_DEFAULT
}

/**
 * Q&A用。質問がトレンドと無関係なら空文字を返し、X検索自体を走らせない（＝課金ゼロ）。
 *
 * 「直近で一番売れた日は？」のような事実照会にトレンドは要らない。1回$0.09かかるので、
 * 必要な質問にだけ使う。判定は journal 側で実装・テスト済みの意図分類を流用する
 * （data=事実照会 / strategy=対策・トレンド / mixed=両方）。
 */
function foodCourtXTrendTopicForQuestion(question: string): string {
  if (!foodCourtEnvFlag('FOODCOURT_X_SEARCH_ASK_INTENT_GATE', true)) return foodCourtXTrendTopic()
  return classifyJournalChatIntent(question) === 'data' ? '' : foodCourtXTrendTopic()
}

/** キャッシュキー用の JST 日付（トレンドは日単位で十分） */
function foodCourtJstDate(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
}

/**
 * X の最新トレンドブリーフを取得する。取得できなければ null（分析はブリーフ無しで続行）。
 * softTimeoutMs を超えたら待たずに諦める。専門AIの応答待ち時間の中に収めるための保険で、
 * 裏の fetch は完走してキャッシュに載るため、次の質問では即座に使える。
 */
async function fetchFoodCourtXTrendBrief(
  topic: string,
  softTimeoutMs: number,
  supabase?: SupabaseClient | null,
  storeKey?: string | null,
): Promise<FoodCourtXTrendBrief | null> {
  if (!foodCourtEnvFlag('FOODCOURT_X_SEARCH_ENABLED', true)) return null
  if (!resolveFoodCourtGrokApiKey()) return null
  if (!topic) return null

  const key = `${foodCourtJstDate()}|${topic.trim().slice(0, 200)}`
  const cached = FOODCOURT_X_TREND_CACHE.get(key)
  if (cached && Date.now() - cached.at < cached.ttlMs) return cached.brief

  const okTtlMs = foodCourtEnvInt('FOODCOURT_X_SEARCH_CACHE_TTL_MS', 6 * 3600_000, 60_000, 24 * 3600_000)
  const ngTtlMs = Math.min(okTtlMs, 10 * 60_000)

  // softTimeoutMs 側が先に解決した後もこの promise は走り続けるため、
  // 例外は必ずここで握る（未処理拒否にしない）。
  const load = (async (): Promise<FoodCourtXTrendBrief | null> => {
    let result: FoodCourtXTrendBrief | null = null
    try {
      const brief = await callGrokTrendBrief(
        topic,
        'MARUGO S / 東京ドーム内フードホール「FOOD STADIUM TOKYO」内の店舗。'
          + '主力はスパイスカレーとワイン（高単価・大人向け）。来店動機は野球・ライブ観戦の前後、'
          + '待ち時間の軽食、デート/接待、インバウンド。'
          + '知りたいのは「メニュー・商品・見せ方をどの方向に振るべきか」の材料。'
          + 'この店の売上や東京ドームの話題そのものではなく、外の世界で今何が食べられ・話題になっているかを集めてほしい。',
      )
      result = brief.ok && brief.text
        ? { text: brief.text, citations: Array.isArray(brief.citations) ? brief.citations : [] }
        : null
      if (!result) {
        console.error('foodcourt x_search brief unavailable:', brief.error ?? 'unknown')
      }
      // 実費の可視化。破棄した応答でも xAI は課金済みなので、成否にかかわらず記録する。
      // x_search はトークンとは別に $5/1k calls で課金されるため、実行回数を model 名に残す
      // （ai_usage_events にツール回数の列が無いため。集計は docs のSQLを参照）。
      // 破棄時は理由も残し、「検索したのに使われなかった率」を後から測れるようにする。
      await recordFoodCourtXTrendUsage(supabase, storeKey, brief.usage, result ? null : (brief.error ?? 'unknown'))
    } catch (e) {
      console.error('foodcourt x_search brief threw:', (e instanceof Error ? e.message : String(e)).slice(0, 200))
    }
    FOODCOURT_X_TREND_CACHE.set(key, { at: Date.now(), ttlMs: result ? okTtlMs : ngTtlMs, brief: result })
    return result
  })()

  // callGrokTrendBrief は内部で必ず catch するため reject しない（未処理拒否にならない）。
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), Math.max(1000, softTimeoutMs)))
  return await Promise.race([load, timeout])
}

/**
 * Xトレンドブリーフの実測トークンを ai_usage_events に記録する。
 * model は `grok-4.5 x_search*2` の形にして、トークンとは別建ての x_search 実行料
 * （$5/1k calls）を後から SQL で復元できるようにする。
 */
async function recordFoodCourtXTrendUsage(
  supabase: SupabaseClient | null | undefined,
  storeKey: string | null | undefined,
  usage: GrokXSearchUsage | undefined,
  dropReason: string | null,
): Promise<void> {
  if (!supabase || !storeKey || !usage) return
  if (!usage.inputTokens && !usage.outputTokens) return
  const dropTag = dropReason ? ` drop:${String(dropReason).slice(0, 40)}` : ''
  await recordFoodCourtAiUsage(supabase, String(storeKey), null, {
    provider: 'grok',
    model: `${usage.model} x_search*${usage.xSearchCalls}${dropTag}`,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    thinkingTokens: null,
    totalTokens: usage.totalTokens,
  })
}

/**
 * トレンドブリーフに割ける待ち時間。専門AI3本と並列に走らせるので、
 * 全体の締切（統合AI・反証AIの取り分）を食い潰さない範囲に収める。
 */
function foodCourtXTrendSoftTimeoutMs(deadlineAt?: number): number {
  // 18秒では足りなかった（検索を4観点に広げてから、間に合わず毎回捨てていた）。
  // 全体予算は110秒あり、専門AI3本と並列なので40秒でも最終的な待ち時間は伸びにくい。
  const cap = foodCourtEnvInt('FOODCOURT_X_SEARCH_SOFT_TIMEOUT_MS', 40_000, 1_000, 90_000)
  if (deadlineAt == null) return cap
  const remaining = deadlineAt - Date.now()
  return Math.max(1_000, Math.min(cap, Math.floor(remaining / 2)))
}

/**
 * 統合AIへのXトレンド指示。ブロックの有無で内容ごと差し替える。
 *
 * 【重要・2026-08-04の実測で判明】「ブロックがある場合は必ず使え」という指示を常時
 * 出しておき、末尾に「無い場合は言及するな」と添える書き方は破綻した。ブリーフが
 * タイムアウトで届かなかった回に、統合AIが会話履歴に残る前回のX記述をなぞって
 * 「Xの最新トレンドでは『低アルコール』『無添加』が話題」と**実データ無しに創作した**。
 * 強い必須指示は弱い例外条項に勝つ。よってブロックが無い回は必須指示そのものを
 * プロンプトに載せず、代わりに再利用の禁止を明示する。
 */
function foodCourtXTrendRule(xTrendBlock: string, targets: string): string[] {
  if (!xTrendBlock) {
    return [
      `【X最新トレンドについて】今回はXの検索結果が無い。過去のやり取りにX由来の記述があっても、それを再利用・再掲してはならない。Xやトレンドの話題には一切言及しないこと（データが無いまま「Xで話題」と書くのは捏造である）。`,
    ]
  }
  return [
    `【X最新トレンドの扱い・使用は必須】${targets}のうち最低1つは、必ず「X（旧Twitter）最新トレンド」ブロックの内容を踏まえたものにすること。一般論だけで書いて無視してはならない（実際にXを検索して取得した情報であり、他のどのAIも持っていない材料である）。次を守る: (a) **ブロックに書かれた具体名（料理名・食材名・商品名・ハッシュタグ・店名・アカウント名など）を必ずそのまま引用する**。「季節の食材」「健康志向」「SNS映え」のような一般語に言い換えてはならない。言い換えた時点でXを検索した意味が失われる、(b) 投稿日と参照URLがブロックにあれば必ず添える、(c) 外部知見なので売上・客数の根拠には使わない、(d) 投稿の話題を市場全体の事実として断定せず「仮説」と書く。`,
  ]
}

/** トレンドブリーフを専門AI/統合AI向けのプロンプトブロックに整形する */
function formatFoodCourtXTrendBlock(brief: FoodCourtXTrendBrief | null): string {
  if (!brief) return ''
  const sources = brief.citations.slice(0, 5)
  return `# X（旧Twitter）最新トレンド（Grok x_search による外部知見）\n`
    + `※これは店舗の保存済み売上データではなく外部知見です。売上・客数の根拠には使わず、`
    + `客層・話題・来店動機の仮説としてのみ使うこと。数値と混ぜて断定しないこと。\n`
    + `${brief.text}${sources.length ? `\n\n参照: ${sources.join(' / ')}` : ''}`
}

function resolveFoodCourtClaudeApiKey(): string {
  return String(Deno.env.get('claude_haiku') || Deno.env.get('CLAUDE_HAIKU') || Deno.env.get('ANTHROPIC_API_KEY') || '').trim()
}

function resolveFoodCourtMoonshotApiKey(): string {
  return String(Deno.env.get('MOONSHOT_API_KEY') || Deno.env.get('KIMI_API_KEY') || '').trim()
}

function resolveFoodCourtOpenAiApiKey(): string {
  return String(Deno.env.get('OPENAI_API_KEY') || Deno.env.get('FOODCOURT_OPENAI_API_KEY') || '').trim()
}

function resolveFoodCourtGeminiModel(): string {
  return String(Deno.env.get('FOODCOURT_GEMINI_MODEL') || Deno.env.get('RECEIPT_GEMINI_MODEL') || '').trim() || 'gemini-3.1-pro-preview'
}

function resolveFoodCourtClaudeModel(): string {
  return String(Deno.env.get('FOODCOURT_CLAUDE_MODEL') || Deno.env.get('CLAUDE_MODEL') || '').trim() || 'claude-haiku-4-5'
}

function resolveFoodCourtMoonshotModel(): string {
  return String(Deno.env.get('FOODCOURT_MOONSHOT_MODEL') || '').trim() || 'kimi-k3'
}

function resolveFoodCourtOpenAiModel(): string {
  return String(Deno.env.get('FOODCOURT_OPENAI_MODEL') || Deno.env.get('OPENAI_MODEL') || '').trim() || 'gpt-5.6-luna'
}

/** preferred から順に試すプロバイダ列。全滅を避けるため、重い希望のあとに必ず gemini/groq を残す。 */
export function buildFoodCourtProviderOrder(preferred: FoodCourtChatProvider): FoodCourtChatProvider[] {
  if (preferred === 'openai') return ['openai', 'gemini', 'groq']
  if (preferred === 'moonshot') return ['moonshot', 'claude', 'groq']
  if (preferred === 'claude') return ['claude', 'gemini', 'groq']
  if (preferred === 'gemini') return ['gemini', 'groq']
  if (preferred === 'grok') return ['grok', 'gemini', 'groq']
  // 専門AI①は Groq 単一だとモデル失敗時に逃げ場が無いので Gemini を残す。
  if (preferred === 'groq') return ['groq', 'gemini']
  return [preferred, 'groq']
}

/**
 * 評価AI専用の期限。上限45秒だが、呼び出し全体の共有deadlineは絶対に延長しない。
 * Gateway上限付近で新しい30秒枠を作ると、呼び出し全体が150秒を越えて応答不能になるため。
 */
export function foodCourtEvalDeadlineAt(sharedDeadlineAt?: number | null): number {
  const now = Date.now()
  const maxBudget = now + 45_000
  if (sharedDeadlineAt == null || !Number.isFinite(sharedDeadlineAt)) return maxBudget
  return Math.min(maxBudget, sharedDeadlineAt)
}

function extractGeminiText(json: unknown): string {
  const candidates = (json && typeof json === 'object') ? (json as { candidates?: unknown }).candidates : null
  const first = Array.isArray(candidates) ? candidates[0] : null
  const parts = (first && typeof first === 'object')
    ? ((first as { content?: { parts?: unknown } }).content?.parts)
    : null
  if (!Array.isArray(parts)) return ''
  return parts.map((p) => String((p as { text?: unknown })?.text ?? '')).filter(Boolean).join('\n').trim()
}

function extractClaudeText(json: unknown): string {
  const content = (json && typeof json === 'object') ? (json as { content?: unknown }).content : null
  if (!Array.isArray(content)) return ''
  return content
    .map((p) => {
      const block = p as { type?: unknown; text?: unknown }
      return block.type === 'text' ? String(block.text ?? '') : ''
    })
    .filter(Boolean)
    .join('\n')
    .trim()
}

async function geminiChat(
  messages: FoodCourtChatMessage[],
  apiKey: string,
  model: string,
  maxTokens = 1200,
  signal?: AbortSignal,
): Promise<FoodCourtChatResult> {
  if (!apiKey) return { content: null, usage: null, reason: 'missing_key' }
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n').trim()
  const contents = messages
    .filter((m) => m.role !== 'system' && String(m.content ?? '').trim())
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content ?? '') }],
    }))
  if (!contents.length) return { content: null, usage: null, reason: 'empty_input' }
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
        contents,
        // 思考(thinking)対応モデルは thinking トークンも maxOutputTokens を消費するため余裕(+4096)を足す
        generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens + 4096 },
      }),
      signal,
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      console.error('geminiChat http error:', model, res.status, err.slice(0, 300))
      return { content: null, usage: null, reason: httpReason(res.status) }
    }
    const json = await res.json().catch(() => null)
    const content = stripFoodCourtThinkingBlocks(extractGeminiText(json))
    return { content: content || null, usage: geminiUsageFrom(json, model), reason: content ? null : 'empty_content' }
  } catch (e) {
    console.error('geminiChat failed:', e instanceof Error ? e.message : String(e))
    return { content: null, usage: null, reason: exceptionReason(e) }
  }
}

async function claudeChat(
  messages: FoodCourtChatMessage[],
  apiKey: string,
  model: string,
  maxTokens = 1200,
  signal?: AbortSignal,
): Promise<FoodCourtChatResult> {
  if (!apiKey) return { content: null, usage: null, reason: 'missing_key' }
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n').trim()
  const msg = messages
    .filter((m) => m.role !== 'system' && String(m.content ?? '').trim())
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content ?? ''),
    }))
  if (!msg.length) return { content: null, usage: null, reason: 'empty_input' }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0.2,
        ...(system ? { system } : {}),
        messages: msg,
      }),
      signal,
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      console.error('claudeChat http error:', model, res.status, err.slice(0, 300))
      return { content: null, usage: null, reason: httpReason(res.status) }
    }
    const json = await res.json().catch(() => null)
    const content = stripFoodCourtThinkingBlocks(extractClaudeText(json))
    return { content: content || null, usage: claudeUsageFrom(json, model), reason: content ? null : 'empty_content' }
  } catch (e) {
    console.error('claudeChat failed:', e instanceof Error ? e.message : String(e))
    return { content: null, usage: null, reason: exceptionReason(e) }
  }
}

async function moonshotChat(
  messages: FoodCourtChatMessage[],
  apiKey: string,
  model: string,
  maxTokens = 650,
  signal?: AbortSignal,
): Promise<FoodCourtChatResult> {
  if (!apiKey) return { content: null, usage: null, reason: 'missing_key' }
  try {
    // Kimi K3 は temperature=1 のみ許可。completion枠には推論トークンも含まれるため本文分の余裕を足す。
    const res = await fetch('https://api.moonshot.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 1,
        reasoning_effort: 'low',
        max_tokens: maxTokens + 1000,
      }),
      signal,
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      console.error('moonshotChat http error:', model, res.status, err.slice(0, 300))
      return { content: null, usage: null, reason: httpReason(res.status) }
    }
    const json = await res.json().catch(() => null) as {
      choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>
      usage?: unknown
    } | null
    const content = stripFoodCourtThinkingBlocks(String(json?.choices?.[0]?.message?.content ?? '').trim())
    return { content: content || null, usage: moonshotUsageFrom(json, model), reason: content ? null : 'empty_content' }
  } catch (e) {
    console.error('moonshotChat failed:', e instanceof Error ? e.message : String(e))
    return { content: null, usage: null, reason: exceptionReason(e) }
  }
}

async function openaiChat(
  messages: FoodCourtChatMessage[],
  apiKey: string,
  model: string,
  maxTokens = 1200,
  signal?: AbortSignal,
): Promise<FoodCourtChatResult> {
  if (!apiKey) return { content: null, usage: null, reason: 'missing_key' }
  try {
    // 推論系モデル（o1/o3/o4-mini, gpt-5系）は max_tokens を拒否し max_completion_tokens を要求。
    // さらに思考(reasoning)トークンも max_completion_tokens の枠を消費するため、
    // 本文が空にならないよう思考分の余裕(+4000)を足し、reasoning_effort:'low' で思考を抑える。
    const isReasoning = /^o\d/.test(model) || /^gpt-5/.test(model)
    const normalizedMessages = isReasoning
      ? messages.map((m) => m.role === 'system' ? { ...m, role: 'developer' } : m)
      : messages
    const tokenParam = isReasoning
      ? { max_completion_tokens: maxTokens + 4000, reasoning_effort: 'low' }
      : { max_tokens: maxTokens }
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: normalizedMessages,
        ...tokenParam,
      }),
      signal,
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      console.error('openaiChat http error:', model, res.status, err.slice(0, 300))
      return { content: null, usage: null, reason: httpReason(res.status) }
    }
    const json = await res.json().catch(() => null) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: unknown
    } | null
    const content = stripFoodCourtThinkingBlocks(String(json?.choices?.[0]?.message?.content ?? '').trim())
    return { content: content || null, usage: openaiUsageFrom(json, model), reason: content ? null : 'empty_content' }
  } catch (e) {
    console.error('openaiChat failed:', e instanceof Error ? e.message : String(e))
    return { content: null, usage: null, reason: exceptionReason(e) }
  }
}

async function grokChat(
  messages: FoodCourtChatMessage[],
  apiKey: string,
  model: string,
  maxTokens = 1200,
  signal?: AbortSignal,
): Promise<FoodCourtChatResult> {
  if (!apiKey) return { content: null, usage: null, reason: 'missing_key' }
  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.3,
      }),
      signal,
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      console.error('grokChat http error:', model, res.status, err.slice(0, 300))
      return { content: null, usage: null, reason: httpReason(res.status) }
    }
    const json = await res.json().catch(() => null) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    } | null
    const content = stripFoodCourtThinkingBlocks(String(json?.choices?.[0]?.message?.content ?? '').trim())
    const inp = Number(json?.usage?.prompt_tokens ?? 0) || 0
    const out = Number(json?.usage?.completion_tokens ?? 0) || 0
    const usage: FoodCourtAiUsage | null = json?.usage ? {
      provider: 'grok',
      model,
      inputTokens: inp,
      outputTokens: out,
      thinkingTokens: null,
      totalTokens: inp + out,
    } : null
    return { content: content || null, usage, reason: content ? null : 'empty_content' }
  } catch (e) {
    console.error('grokChat failed:', e instanceof Error ? e.message : String(e))
    return { content: null, usage: null, reason: exceptionReason(e) }
  }
}

async function foodCourtAiChat(
  messages: FoodCourtChatMessage[],
  groqApiKey: string,
  primaryGroqModel: string,
  maxTokens: number,
  preferred: FoodCourtChatProvider,
  fallbackGroqModel?: string,
  options?: {
    deadlineAt?: number
    perProviderMs?: number
    // フォールバック記録用の文脈。指定時のみ、希望どおりに応答しなかった場合に
    // foodcourt_ai_fallback_events へ best-effort で記録する。
    fallbackLog?: { supabase?: SupabaseClient | null; storeKey?: string | null; surface: string; role: string }
  },
): Promise<{ content: string | null; usage: FoodCourtAiUsage | null }> {
  const order = Array.from(new Set<FoodCourtChatProvider>(buildFoodCourtProviderOrder(preferred)))
  // 希望プロバイダが残り時間を食い潰すと gemini/groq に届かず全滅する。
  // 後続1本あたり約10秒を予約し、希望側は早めに切って退避できるようにする。
  const FALLBACK_SLOT_MS = 10_000
  const nextSignal = (providerIndex: number): AbortSignal | undefined => {
    const remaining = options?.deadlineAt != null ? options.deadlineAt - Date.now() : null
    if (remaining != null && remaining <= 400) return AbortSignal.abort('foodcourt_ai_deadline')
    const remainingProviders = Math.max(0, order.length - providerIndex - 1)
    const reserve = remainingProviders > 0 ? Math.min(20_000, remainingProviders * FALLBACK_SLOT_MS) : 0
    const usable = remaining != null ? Math.max(250, remaining - reserve) : null
    const timeoutMs = Math.max(250, Math.min(options?.perProviderMs ?? 12000, usable ?? Number.MAX_SAFE_INTEGER))
    return Number.isFinite(timeoutMs) ? AbortSignal.timeout(timeoutMs) : undefined
  }
  // 各プロバイダ/モデルの試行ログ。フォールバックが起きたか（希望どおり応答したか）の判定に使う。
  const attempts: FoodCourtAiAttempt[] = []
  // 希望どおり（=最初の試行）で成功したかどうかにかかわらず、記録判定は最後にまとめて行う。
  const finish = async (result: FoodCourtChatResult): Promise<{ content: string | null; usage: FoodCourtAiUsage | null }> => {
    await recordFoodCourtFallbackIfNeeded(preferred, attempts, options?.fallbackLog)
    return { content: result.content, usage: result.usage }
  }
  for (let providerIndex = 0; providerIndex < order.length; providerIndex++) {
    const provider = order[providerIndex]
    if (options?.deadlineAt != null && Date.now() >= options.deadlineAt) break
    if (provider === 'openai') {
      const model = resolveFoodCourtOpenAiModel()
      const res = await openaiChat(messages, resolveFoodCourtOpenAiApiKey(), model, maxTokens, nextSignal(providerIndex))
      attempts.push({ provider, model, ok: !!res.content, reason: res.content ? null : (res.reason ?? 'empty_content') })
      if (res.content) return await finish(res)
      continue
    }
    if (provider === 'gemini') {
      const model = resolveFoodCourtGeminiModel()
      const res = await geminiChat(messages, resolveFoodCourtGeminiApiKey(), model, maxTokens, nextSignal(providerIndex))
      attempts.push({ provider, model, ok: !!res.content, reason: res.content ? null : (res.reason ?? 'empty_content') })
      if (res.content) return await finish(res)
      continue
    }
    if (provider === 'claude') {
      const model = resolveFoodCourtClaudeModel()
      const res = await claudeChat(messages, resolveFoodCourtClaudeApiKey(), model, maxTokens, nextSignal(providerIndex))
      attempts.push({ provider, model, ok: !!res.content, reason: res.content ? null : (res.reason ?? 'empty_content') })
      if (res.content) return await finish(res)
      continue
    }
    if (provider === 'moonshot') {
      const model = resolveFoodCourtMoonshotModel()
      const res = await moonshotChat(messages, resolveFoodCourtMoonshotApiKey(), model, maxTokens, nextSignal(providerIndex))
      attempts.push({ provider, model, ok: !!res.content, reason: res.content ? null : (res.reason ?? 'empty_content') })
      if (res.content) return await finish(res)
      continue
    }
    if (provider === 'grok') {
      const model = resolveFoodCourtGrokModel()
      const res = await grokChat(messages, resolveFoodCourtGrokApiKey(), model, maxTokens, nextSignal(providerIndex))
      attempts.push({ provider, model, ok: !!res.content, reason: res.content ? null : (res.reason ?? 'empty_content') })
      if (res.content) return await finish(res)
      continue
    }
    const first = await groqChat(messages, groqApiKey, primaryGroqModel, maxTokens, nextSignal(providerIndex))
    attempts.push({ provider: 'groq', model: primaryGroqModel, ok: !!first.content, reason: first.content ? null : (first.reason ?? 'empty_content') })
    if (first.content) return await finish(first)
    if (fallbackGroqModel && fallbackGroqModel !== primaryGroqModel) {
      const second = await groqChat(messages, groqApiKey, fallbackGroqModel, maxTokens, nextSignal(providerIndex))
      attempts.push({ provider: 'groq', model: fallbackGroqModel, ok: !!second.content, reason: second.content ? null : (second.reason ?? 'empty_content') })
      if (second.content) return await finish(second)
    }
  }
  return await finish({ content: null, usage: null })
}

// フォールバック（希望どおり応答しなかった／全滅）を検知したら best-effort で記録する。
// ログの失敗は本処理を絶対に壊さない（try/catch で握りつぶす）。文脈未指定なら何もしない。
async function recordFoodCourtFallbackIfNeeded(
  preferred: string,
  attempts: FoodCourtAiAttempt[],
  ctx?: { supabase?: SupabaseClient | null; storeKey?: string | null; surface: string; role: string },
): Promise<void> {
  try {
    if (!ctx || !ctx.supabase || !ctx.storeKey) return
    const event = buildFoodCourtFallbackEvent(preferred, attempts)
    if (!event) return
    await recordFoodCourtFallbackEvent(ctx.supabase, ctx.storeKey, ctx.surface, ctx.role, event)
  } catch (e) {
    console.error('recordFoodCourtFallbackIfNeeded threw:', (e instanceof Error ? e.message : String(e)).slice(0, 200))
  }
}

// foodcourt_ai_fallback_events へ1件挿入する。テーブル未デプロイ等でも例外を握りつぶす。
async function recordFoodCourtFallbackEvent(
  supabase: SupabaseClient,
  storeKey: string,
  surface: string,
  role: string,
  event: FoodCourtFallbackEvent,
): Promise<void> {
  try {
    const { error } = await supabase.from('foodcourt_ai_fallback_events').insert({
      store_partition_key: storeKey,
      surface,
      role,
      preferred_provider: event.preferredProvider,
      preferred_model: event.preferredModel,
      used_provider: event.usedProvider,
      used_model: event.usedModel,
      outcome: event.outcome,
      attempts: event.attempts,
    })
    if (error) console.error('foodcourt_ai_fallback_events insert failed:', error.message)
  } catch (e) {
    console.error('foodcourt_ai_fallback_events insert threw:', (e instanceof Error ? e.message : String(e)).slice(0, 200))
  }
}

// ===== AIループエンジニアリング（設計: docs/AI_LOOP_ENGINEERING_DESIGN.md） =====
// 統合回答を品質評価AIが採点し、不合格なら改善点と前回回答を渡して再生成する。
// Q&A・日次・期間・週次の各surfaceで、不合格が続けば最高得点回答を返す。
// （環境変数 FOODCOURT_LOOP_APPLY_TO_ASK 等でsurfaceごとにON/OFF。未設定時は全surfaceでOFF）。
export type FoodCourtLoopSurface = 'ask' | 'daily_summary' | 'period_summary' | 'weekly_report'

export type FoodCourtLoopEvaluation = {
  total_score: number
  scores: {
    accuracy: number
    logic: number
    expertise: number
    practicality: number
    evidence: number
  }
  passed: boolean
  improvement_points: string[]
  risk_flags: string[]
  factuality_notes: string[]
}

type FoodCourtLoopGenerated = { content: string | null; usage: FoodCourtAiUsage | null }

type FoodCourtLoopConfig = {
  enabled: boolean
  maxLoops: number
  passTotal: number
  passEach: number
  evaluatorProvider: FoodCourtChatProvider
  evaluatorMaxTokens: number
}

function fcEnvFlag(name: string, fallback: boolean): boolean {
  const raw = Deno.env.get(name)
  if (raw == null || raw === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase())
}
function fcRequestDeadlineAt(): number {
  // Supabase's 150-second request idle limitに40秒の応答余裕を残し、改善ループを完了させる。
  const raw = Number(Deno.env.get('FOODCOURT_AI_REQUEST_BUDGET_MS') ?? '110000')
  const budget = Number.isFinite(raw) ? Math.max(20000, Math.min(110000, Math.trunc(raw))) : 110000
  return Date.now() + budget
}
function fcApplyFlagName(surface: FoodCourtLoopSurface): string {
  if (surface === 'daily_summary') return 'FOODCOURT_LOOP_APPLY_TO_DAILY'
  if (surface === 'period_summary') return 'FOODCOURT_LOOP_APPLY_TO_PERIOD'
  if (surface === 'weekly_report') return 'FOODCOURT_LOOP_APPLY_TO_WEEKLY'
  return 'FOODCOURT_LOOP_APPLY_TO_ASK'
}
// surfaceごとのmaxLoops既定値。各surfaceとも初回生成＋最大1回の改善再生成とする。
const FOODCOURT_LOOP_DEFAULT_MAX: Record<FoodCourtLoopSurface, number> = { ask: 2, daily_summary: 2, period_summary: 2, weekly_report: 2 }
function fcMaxLoopsEnvName(surface: FoodCourtLoopSurface): string {
  if (surface === 'daily_summary') return 'FOODCOURT_LOOP_MAX_DAILY'
  if (surface === 'period_summary') return 'FOODCOURT_LOOP_MAX_PERIOD'
  if (surface === 'weekly_report') return 'FOODCOURT_LOOP_MAX_WEEKLY'
  return 'FOODCOURT_LOOP_MAX_ASK'
}
async function resolveFoodCourtLoopConfig(
  surface: FoodCourtLoopSurface,
  supabase?: SupabaseClient | null,
): Promise<FoodCourtLoopConfig> {
  // コスト増・予期しない再生成を避けるため、全体・surfaceの両方を明示ONした場合だけ有効化する。
  const enabled = fcEnvFlag('FOODCOURT_LOOP_ENABLED', false) && fcEnvFlag(fcApplyFlagName(surface), false)
  // surface専用の上限(例: FOODCOURT_LOOP_MAX_DAILY)を優先し、無ければ共通のFOODCOURT_LOOP_MAX、それも無ければsurfaceごとの既定値。
  const maxLoopsRaw = Number(Deno.env.get(fcMaxLoopsEnvName(surface)) ?? Deno.env.get('FOODCOURT_LOOP_MAX') ?? FOODCOURT_LOOP_DEFAULT_MAX[surface])
  const maxLoops = Number.isFinite(maxLoopsRaw) && maxLoopsRaw > 0 ? Math.min(5, Math.trunc(maxLoopsRaw)) : FOODCOURT_LOOP_DEFAULT_MAX[surface]
  const fallbackTotal = Number(Deno.env.get('FOODCOURT_LOOP_PASS_TOTAL') ?? '75') || 75
  const fallbackEach = Number(Deno.env.get('FOODCOURT_LOOP_PASS_EACH') ?? '65') || 65
  let configuredScore: unknown = null
  if (supabase) {
    const { data, error } = await supabase
      .from('line_admin_console_settings')
      .select('setting_value')
      .eq('setting_key', 'foodcourt_evolution_passing_score')
      .maybeSingle()
    if (error) {
      console.error('Failed to load foodcourt AI passing score:', error.message)
    } else {
      configuredScore = data?.setting_value
    }
  }
  const { passTotal, passEach } = resolveFoodCourtPassingThresholds(
    configuredScore,
    fallbackTotal,
    fallbackEach,
  )
  const providerRaw = String(Deno.env.get('FOODCOURT_LOOP_EVALUATOR_PROVIDER') ?? '').trim().toLowerCase()
  const allowedEvaluatorProviders: FoodCourtChatProvider[] = ['groq', 'gemini', 'claude', 'openai', 'grok']
  const evaluatorProvider: FoodCourtChatProvider = allowedEvaluatorProviders.includes(providerRaw as FoodCourtChatProvider)
    ? providerRaw as FoodCourtChatProvider
    : 'claude'
  // 評価JSONが上限で切れると採点不能(evaluation_failed)になる。本番初回で700ちょうどで切れた実績があるため
  // 余裕を持たせる（プロンプト側でも件数・文字数を制限して通常は数百トークンに収まる想定）。
  return { enabled, maxLoops, passTotal, passEach, evaluatorProvider, evaluatorMaxTokens: 1200 }
}

// 評価AIのJSON出力を頑健にパースする（```json フェンス・前後の余計な文章を許容）。
// トークン上限で途中切断されたJSONでも、スコア類だけは正規表現で救出して採点を成立させる
// （本番初回で700トークンちょうどで切れて evaluation_failed になった実績への対策）。完全に読めなければnull。
function parseLoopEvaluationJson(raw: string | null): FoodCourtLoopEvaluation | null {
  if (!raw) return null
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```\s*$/i, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  const jsonText = match ? match[0] : cleaned
  const clamp = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0 }
  const arr = (v: unknown): string[] => Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 10) : []

  let parsed: unknown = null
  try { parsed = JSON.parse(jsonText) } catch { parsed = null }
  if (parsed && typeof parsed === 'object') {
    const o = parsed as Record<string, unknown>
    const scoresRaw = (o.scores && typeof o.scores === 'object') ? o.scores as Record<string, unknown> : {}
    const scores = {
      accuracy: clamp(scoresRaw.accuracy),
      logic: clamp(scoresRaw.logic),
      expertise: clamp(scoresRaw.expertise),
      practicality: clamp(scoresRaw.practicality),
      evidence: clamp(scoresRaw.evidence),
    }
    const total = o.total_score != null
      ? clamp(o.total_score)
      : Math.round((scores.accuracy + scores.logic + scores.expertise + scores.practicality + scores.evidence) / 5)
    return {
      total_score: total,
      scores,
      passed: false, // 合否は呼び出し側(runFoodCourtLoopEngineering)が閾値で再計算する（評価AIの自己申告を信用しない）
      improvement_points: arr(o.improvement_points),
      risk_flags: arr(o.risk_flags),
      factuality_notes: arr(o.factuality_notes),
    }
  }

  // --- 途中切断フォールバック ---
  // JSONとして閉じていなくても、"total_score":95 や "accuracy":90 のようなキー:数値ペアと、
  // improvement_points 配列内の完成済み文字列だけを正規表現で拾う。5軸すべて取れた場合のみ採用
  // （部分的すぎる救出は誤採点になるため破棄してnull＝evaluation_failed扱いに任せる）。
  const num = (key: string): number | null => {
    const m = cleaned.match(new RegExp(`"${key}"\\s*:\\s*(\\d+(?:\\.\\d+)?)`))
    return m ? clamp(m[1]) : null
  }
  const accuracy = num('accuracy'), logic = num('logic'), expertise = num('expertise'),
    practicality = num('practicality'), evidence = num('evidence')
  if (accuracy == null || logic == null || expertise == null || practicality == null || evidence == null) return null
  const scores = { accuracy, logic, expertise, practicality, evidence }
  const total = num('total_score') ?? Math.round((accuracy + logic + expertise + practicality + evidence) / 5)
  // improvement_points の完成済み要素だけ拾う（切れかけの最後の要素は含まれない）
  const points: string[] = []
  const arrMatch = cleaned.match(/"improvement_points"\s*:\s*\[([\s\S]*?)(?:\]|$)/)
  if (arrMatch) {
    for (const m of arrMatch[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
      const s = m[1].replace(/\\"/g, '"').trim()
      if (s) points.push(s)
      if (points.length >= 10) break
    }
  }
  return { total_score: total, scores, passed: false, improvement_points: points, risk_flags: [], factuality_notes: [] }
}

// 統合回答を品質評価AIに採点させる。評価AI自身は回答を書き直さず、採点と改善点だけを返す。
async function evaluateFoodCourtAnswer(params: {
  surface: FoodCourtLoopSurface
  question: string
  contextBlock: string
  finalAnswer: string
  groqApiKey: string
  primary: string
  fallbackModel: string
  config: FoodCourtLoopConfig
  deadlineAt?: number
  supabase?: SupabaseClient | null
  storeKey?: string | null
}): Promise<{ evaluation: FoodCourtLoopEvaluation | null; usage: FoodCourtAiUsage | null }> {
  const evalSystem = [
    'あなたはフードコート売上分析AIの品質評価者です。以下の実データ・分析メモ・最終回答を比較し、100点満点で採点してください。',
    'あなた自身は回答を書き直さない。採点と改善点のみを返す。',
    '評価軸: 1.正確性 2.論理性 3.専門性 4.実用性 5.根拠',
    ...foodCourtEvaluationScoreAnchors(),
    '禁止（見つけたら improvement_points/risk_flags に指摘として書く）:',
    '- データに無い数字を正しいものとして扱っている',
    '- 相関を因果と断定している',
    '- 売上日とレポート発行日を混同している',
    '- 抽象的な打ち手だけで終えている（KPIに落とし込めていない）',
    ...foodCourtEvaluationSurfaceRules(params.surface),
    // 出力が長いとトークン上限でJSONが途中で切れて採点不能になる。件数・文字数を厳しく制限して短いJSONに収めさせる。
    '【出力長の厳守】improvement_points は最重要のものだけ最大3件・各60字以内。risk_flags は最大2件・各40字以内。factuality_notes は最大2件・各40字以内。それ以上書かない。',
    'JSONのみで返答すること。他の文章・前置き・コードフェンスは一切書かない。',
    '{"total_score":number,"scores":{"accuracy":number,"logic":number,"expertise":number,"practicality":number,"evidence":number},"improvement_points":string[],"risk_flags":string[],"factuality_notes":string[]}',
  ].join('\n')
  const evaluationContext = compactFoodCourtEvaluationContext(params.contextBlock)
  const evalUser = `質問/タスク: ${params.question}\n\n# 分析の材料（実データ含む）\n${evaluationContext}\n\n# 評価対象の最終回答\n${params.finalAnswer}`
  const res = await foodCourtAiChat(
    [{ role: 'system', content: evalSystem }, { role: 'user', content: evalUser }],
    params.groqApiKey, params.primary, params.config.evaluatorMaxTokens, params.config.evaluatorProvider, params.fallbackModel,
    {
      // 評価にも最大45秒を与えるが、呼び出し全体の共有deadlineは延長しない。
      deadlineAt: foodCourtEvalDeadlineAt(params.deadlineAt),
      perProviderMs: 18000,
      fallbackLog: { supabase: params.supabase, storeKey: params.storeKey, surface: params.surface, role: 'evaluator' },
    },
  )
  return { evaluation: parseLoopEvaluationJson(res.content), usage: res.usage }
}

// 評価結果から、再生成AIへ渡す改善指示を作る。
function buildLoopFeedback(evaluation: FoodCourtLoopEvaluation): string {
  const lines: string[] = []
  if (evaluation.improvement_points.length) lines.push('改善点（ここだけ直す。他は変えない）:\n' + evaluation.improvement_points.map((p) => `- ${p}`).join('\n'))
  if (evaluation.risk_flags.length) lines.push('弱めるべき/断定を避けるべき主張:\n' + evaluation.risk_flags.map((p) => `- ${p}`).join('\n'))
  return lines.length ? lines.join('\n\n') : '総合的な具体性・根拠づけをもう一段上げてください。'
}
// 前回回答を assistant メッセージとして添え、改善指示で不足箇所を修正させる。
function appendLoopFeedback(messages: FoodCourtChatMessage[], feedback: string, previousAnswer: string): FoodCourtChatMessage[] {
  return buildFoodCourtRevisionMessages(messages, feedback, previousAnswer)
}

async function saveFoodCourtLoopRun(
  supabase: SupabaseClient | null | undefined,
  row: {
    storeKey: string
    surface: FoodCourtLoopSurface
    sourceRef: Record<string, unknown>
    userInput: string | null
    modelVersion: string
    maxLoops: number
  },
): Promise<string | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.from('foodcourt_ai_loop_runs').insert({
      store_partition_key: row.storeKey,
      surface: row.surface,
      source_ref: row.sourceRef,
      user_input: row.userInput,
      model_version: row.modelVersion,
      max_loops: row.maxLoops,
      status: 'running',
    }).select('id').maybeSingle()
    if (error) { console.error('foodcourt_ai_loop_runs insert failed:', error.message); return null }
    const id = data ? String((data as { id?: unknown }).id ?? '').trim() : ''
    return id || null
  } catch (e) {
    console.error('foodcourt_ai_loop_runs insert threw:', e instanceof Error ? e.message : String(e))
    return null
  }
}
async function updateFoodCourtLoopRun(
  supabase: SupabaseClient | null | undefined,
  runId: string | null,
  row: {
    finalLoopIndex: number
    bestLoopIndex: number | null
    finalScore: number | null
    finalAnswer: string | null
    returnedReason: string
    status: 'completed' | 'failed'
  },
): Promise<void> {
  if (!supabase || !runId) return
  try {
    const { error } = await supabase.from('foodcourt_ai_loop_runs').update({
      final_loop_index: row.finalLoopIndex,
      best_loop_index: row.bestLoopIndex,
      final_score: row.finalScore,
      final_answer: row.finalAnswer,
      returned_reason: row.returnedReason,
      status: row.status,
      updated_at: new Date().toISOString(),
    }).eq('id', runId)
    if (error) console.error('foodcourt_ai_loop_runs update failed:', error.message)
  } catch (e) {
    console.error('foodcourt_ai_loop_runs update threw:', e instanceof Error ? e.message : String(e))
  }
}
async function saveFoodCourtLoopIteration(
  supabase: SupabaseClient | null | undefined,
  runId: string | null,
  row: {
    loopIndex: number
    feedbackFromPrevious: string | null
    integratedAnswer: string | null
    evaluation: FoodCourtLoopEvaluation | null
    passed: boolean
    usages: FoodCourtAiUsage[]
  },
): Promise<void> {
  if (!supabase || !runId) return
  try {
    const { error } = await supabase.from('foodcourt_ai_loop_iterations').insert({
      run_id: runId,
      loop_index: row.loopIndex,
      feedback_from_previous: row.feedbackFromPrevious,
      integrated_answer: row.integratedAnswer,
      evaluation: row.evaluation,
      total_score: row.evaluation?.total_score ?? null,
      score_accuracy: row.evaluation?.scores.accuracy ?? null,
      score_logic: row.evaluation?.scores.logic ?? null,
      score_expertise: row.evaluation?.scores.expertise ?? null,
      score_practicality: row.evaluation?.scores.practicality ?? null,
      score_evidence: row.evaluation?.scores.evidence ?? null,
      passed: row.passed,
      usage_summary: { usages: row.usages },
    })
    if (error) console.error('foodcourt_ai_loop_iterations insert failed:', error.message)
  } catch (e) {
    console.error('foodcourt_ai_loop_iterations insert threw:', e instanceof Error ? e.message : String(e))
  }
}

// 過去回答を無条件に教材化すると誤答が増幅するため、合格済みまたは人が helpful と評価した回答だけを使う。
// 評価AIの risk_flags は同じ指摘が複数回出たものだけを、恒久的な注意事項として再利用する。
async function loadFoodCourtLearningMemory(
  supabase: SupabaseClient | null | undefined,
  storeKey: string | undefined,
  surface: FoodCourtLoopSurface,
  taskText: string,
): Promise<string> {
  if (!supabase || !storeKey) return ''
  try {
    const { data: ragRows, error: ragError } = await supabase
      .from('foodcourt_ai_rag_documents')
      .select('source_run_id,search_text,document_markdown,final_score,metadata,updated_at')
      .ilike('store_partition_key', storeKey)
      .eq('surface', surface)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(80)
    if (!ragError && Array.isArray(ragRows) && ragRows.length) {
      const ranked = rankFoodCourtRagDocuments(taskText, ragRows.map((row) => ({
        source_run_id: String((row as { source_run_id?: unknown }).source_run_id ?? ''),
        search_text: String((row as { search_text?: unknown }).search_text ?? ''),
        document_markdown: String((row as { document_markdown?: unknown }).document_markdown ?? ''),
        final_score: Number((row as { final_score?: unknown }).final_score ?? 0),
        updated_at: String((row as { updated_at?: unknown }).updated_at ?? ''),
      })), 2)

      const riskCounts = new Map<string, number>()
      for (const row of ragRows) {
        const metadata = (row as { metadata?: unknown }).metadata
        if (!metadata || typeof metadata !== 'object') continue
        const risks = (metadata as { risk_flags?: unknown }).risk_flags
        if (!Array.isArray(risks)) continue
        for (const risk of risks) {
          const text = String(risk ?? '').trim().slice(0, 120)
          if (text) riskCounts.set(text, (riskCounts.get(text) ?? 0) + 1)
        }
      }
      const repeatedRisks = Array.from(riskCounts.entries())
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([text]) => `- ${text}`)

      const blocks: string[] = []
      if (ranked.length) {
        const examples = ranked.map((document, index) =>
          `## 参考${index + 1}\n${document.document_markdown.slice(0, 2400)}`,
        ).join('\n\n')
        blocks.push(`# RAGから検索した承認済み学習内容\n今回の実データを最優先し、過去の数字・日付は流用しないこと。\n\n${examples}`)
      }
      if (repeatedRisks.length) blocks.push(`# 過去の評価で繰り返し検出された注意事項\n${repeatedRisks.join('\n')}`)
      if (blocks.length) return blocks.join('\n\n')
    } else if (ragError && String((ragError as { code?: unknown }).code ?? '') !== '42P01') {
      console.error('foodcourt_ai_rag_documents select failed:', ragError.message)
    }

    // RAGテーブルの初回デプロイ前または未バックフィル時だけ、従来の実行履歴検索へフォールバックする。
    const { data: runs, error } = await supabase
      .from('foodcourt_ai_loop_runs')
      .select('id,user_input,final_answer,final_score,returned_reason,source_ref,created_at')
      .ilike('store_partition_key', storeKey)
      .eq('surface', surface)
      .not('final_answer', 'is', null)
      .order('created_at', { ascending: false })
      .limit(40)
    if (error || !Array.isArray(runs) || !runs.length) return ''

    const runIds = runs.map((r) => String((r as { id?: unknown }).id ?? '')).filter(Boolean)
    const [{ data: feedback }, { data: iterations }] = await Promise.all([
      supabase.from('foodcourt_ai_feedback').select('run_id,rating').in('run_id', runIds),
      supabase.from('foodcourt_ai_loop_iterations').select('run_id,evaluation,created_at').in('run_id', runIds)
        .order('created_at', { ascending: false }).limit(80),
    ])
    const helpful = new Set((Array.isArray(feedback) ? feedback : [])
      .filter((f) => String((f as { rating?: unknown }).rating ?? '') === 'helpful')
      .map((f) => String((f as { run_id?: unknown }).run_id ?? '')))

    const candidates = runs
      .filter((r) => String((r as { returned_reason?: unknown }).returned_reason ?? '') === 'passed'
        || helpful.has(String((r as { id?: unknown }).id ?? '')))
      .map((r) => {
        const input = String((r as { user_input?: unknown }).user_input ?? '')
        const source = JSON.stringify((r as { source_ref?: unknown }).source_ref ?? {})
        return { row: r, similarity: foodCourtTextSimilarity(taskText, `${input}\n${source}`) }
      })
      .filter((candidate) => candidate.similarity >= 0.03)
      .sort((a, b) => b.similarity - a.similarity
        || Number((b.row as { final_score?: unknown }).final_score ?? 0) - Number((a.row as { final_score?: unknown }).final_score ?? 0))

    const riskCounts = new Map<string, number>()
    for (const it of (Array.isArray(iterations) ? iterations : [])) {
      const ev = (it as { evaluation?: unknown }).evaluation
      if (!ev || typeof ev !== 'object') continue
      for (const risk of (Array.isArray((ev as { risk_flags?: unknown }).risk_flags) ? (ev as { risk_flags: unknown[] }).risk_flags : [])) {
        const text = String(risk ?? '').trim().slice(0, 120)
        if (text) riskCounts.set(text, (riskCounts.get(text) ?? 0) + 1)
      }
    }
    const repeatedRisks = Array.from(riskCounts.entries()).filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1]).slice(0, 4).map(([text]) => `- ${text}`)

    const blocks: string[] = []
    if (candidates.length) {
      const best = candidates[0].row as { final_answer?: unknown; final_score?: unknown }
      blocks.push(`# 過去の承認済み回答（参考例。今回の事実を優先し、数字や日付は流用しない）\n${String(best.final_answer ?? '').slice(0, 2600)}\n評価: ${String(best.final_score ?? '人による承認')}`)
    }
    if (repeatedRisks.length) blocks.push(`# 過去の評価で繰り返し検出された注意事項\n${repeatedRisks.join('\n')}`)
    return blocks.join('\n\n')
  } catch (e) {
    console.error('loadFoodCourtLearningMemory failed:', e instanceof Error ? e.message : String(e))
    return ''
  }
}

// 共通ループエンジン。ループが明示的に無効なら初回生成のみを返す（DB保存もしない）。
// 有効時: 生成→評価→(不合格なら)改善点のみ渡して再生成→最大maxLoops→最高得点回答を返す。
// 再ループ時は統合AIのみ再生成する（専門AI・反証AIは呼び出し側が最初に1回生成したメモをそのまま使い回す）。
export async function runFoodCourtLoopEngineering(params: {
  surface: FoodCourtLoopSurface
  initialGenerate: (feedback?: string, previousAnswer?: string) => Promise<FoodCourtLoopGenerated>
  evaluationContext: string
  // 数値監査の正本。専門AIメモ/RAG回答を除き、コード計算・生データ・日報原文だけを渡す。
  numberAuditFacts?: string
  question: string
  userInput?: string | null
  sourceRef?: Record<string, unknown>
  groqApiKey: string
  primaryModel: string
  fallbackModel: string
  supabase?: SupabaseClient | null
  storeKey?: string
  deadlineAt?: number
}): Promise<{ answer: string | null; usages: FoodCourtAiUsage[]; loopScore: number | null; loopCount: number }> {
  const config = await resolveFoodCourtLoopConfig(params.surface, params.supabase)
  const usages: FoodCourtAiUsage[] = []
  if (!config.enabled) {
    const gen = await params.initialGenerate()
    if (gen.usage) usages.push(gen.usage)
    return { answer: gen.content, usages, loopScore: null, loopCount: 1 }
  }

  // 反証AI④は全 surface で Claude（社内データを Moonshot/Kimi へ送らない）。
  const criticLabel = resolveFoodCourtClaudeModel()
  const modelVersion = `foodcourt-loop-v2-calibrated(gen=${resolveFoodCourtOpenAiModel()};critic=${criticLabel};eval=${config.evaluatorProvider};pass=${config.passTotal}/${config.passEach})`
  const runId = await saveFoodCourtLoopRun(params.supabase, {
    storeKey: String(params.storeKey ?? ''),
    surface: params.surface,
    sourceRef: params.sourceRef ?? {},
    userInput: params.userInput ?? null,
    modelVersion,
    maxLoops: config.maxLoops,
  })

  const startTime = Date.now()
  const deadlineAt = params.deadlineAt ?? (startTime + 25000)
  let bestAnswer: string | null = null
  let bestScore = -1
  let bestLoopIndex: number | null = null
  let feedback: string | undefined
  let previousAnswer: string | undefined
  let finalLoopIndex = 0
  let returnedReason = 'generation_failed'

  for (let loopIndex = 1; loopIndex <= config.maxLoops; loopIndex++) {
    // 生成と評価を完了できる残り時間が無ければ、採点済みの最良回答を返す。
    if (!foodCourtLoopHasBudget(deadlineAt, Date.now(), loopIndex)) {
      console.warn(`[runFoodCourtLoopEngineering] Timeout prevention triggered at loop index ${loopIndex} (elapsed: ${Date.now() - startTime}ms). Returning best answer so far.`)
      returnedReason = 'timeout_prevented'
      break
    }
    finalLoopIndex = loopIndex

    const gen = await params.initialGenerate(feedback, previousAnswer)
    if (gen.usage) usages.push(gen.usage)
    if (!gen.content) break // 生成失敗: それまでのベストがあればそれを採用して打ち切る

    const evalRes = await evaluateFoodCourtAnswer({
      surface: params.surface,
      question: params.question,
      contextBlock: params.evaluationContext,
      finalAnswer: gen.content,
      groqApiKey: params.groqApiKey,
      primary: params.primaryModel,
      fallbackModel: params.fallbackModel,
      config,
      deadlineAt,
      supabase: params.supabase,
      storeKey: params.storeKey,
    })
    if (evalRes.usage) usages.push(evalRes.usage)
    const evaluation = evalRes.evaluation
    // コード側の決定論的な数値検査: 提供データに無い係数・金額/客数が混入していないか確認する。
    const numberAudit = auditFoodCourtAnswerNumbers(gen.content, params.numberAuditFacts ?? params.evaluationContext)
    const numberAuditFeedback = buildFoodCourtNumberAuditFeedback(numberAudit)
    // 「データに無い係数」は捏造の可能性が高い最重要問題。評価AIが合格としてもコード監査NGなら不合格。
    const cleanEnough = numberAudit.ungroundedCoefficients.length === 0
    const auditPenalty = cleanEnough ? 0 : 15
    const adjustedEvaluation: FoodCourtLoopEvaluation | null = evaluation ? {
      ...evaluation,
      total_score: Math.max(0, evaluation.total_score - auditPenalty),
      scores: cleanEnough ? evaluation.scores : {
        ...evaluation.scores,
        accuracy: Math.min(evaluation.scores.accuracy, 60),
        evidence: Math.min(evaluation.scores.evidence, 60),
      },
      improvement_points: cleanEnough
        ? evaluation.improvement_points
        : [
          ...evaluation.improvement_points,
          `コード監査: 提供データに無い係数（${numberAudit.ungroundedCoefficients.join(', ')}）を削除`,
        ].slice(0, 4),
      passed: false,
    } : null
    const passed = foodCourtEvaluationPassed(adjustedEvaluation, config.passTotal, config.passEach) && cleanEnough
    const finalEvaluation: FoodCourtLoopEvaluation | null = adjustedEvaluation ? { ...adjustedEvaluation, passed } : null

    await saveFoodCourtLoopIteration(params.supabase, runId, {
      loopIndex,
      feedbackFromPrevious: feedback ?? null,
      integratedAnswer: gen.content,
      evaluation: finalEvaluation,
      passed,
      usages: [gen.usage, evalRes.usage].filter((u): u is FoodCourtAiUsage => !!u),
    })

    // 合格した回答は、それ以前の（総合点だけは高いが各項目基準を満たさず不合格だった）回答より必ず優先する。
    // 単純な「score > bestScore」だけだと、同点/僅差で不合格の回答がbestのまま残り、実際に合格した回答が
    // 返らない事故になり得るため、合格したループは無条件でbestを上書きする。また bestAnswer===null（まだ
    // 1件も候補が無い）の場合も、評価AI自体が失敗(evaluation=null・score=-1)していた場合に生成結果を
    // 取りこぼさないよう、最初の生成物を無条件でbestにする。
    // 未根拠係数がある候補をbestとして採用しにくくする（評価AIスコアから15点の安全ペナルティ）。
    const score = finalEvaluation ? finalEvaluation.total_score : -1
    if (passed || score > bestScore || bestAnswer === null) { bestScore = score; bestAnswer = gen.content; bestLoopIndex = loopIndex }
    previousAnswer = gen.content

    if (passed) { returnedReason = 'passed'; break }
    if (!finalEvaluation) { returnedReason = 'evaluation_failed'; break } // 評価AI失敗: これ以上ループしても改善点が得られない
    if (loopIndex >= config.maxLoops) { returnedReason = 'max_loop_best'; break }
    feedback = buildLoopFeedback(finalEvaluation)
    if (numberAuditFeedback) feedback = feedback + '\n\n' + numberAuditFeedback
  }

  await updateFoodCourtLoopRun(params.supabase, runId, {
    finalLoopIndex,
    bestLoopIndex,
    finalScore: bestScore >= 0 ? bestScore : null,
    finalAnswer: bestAnswer,
    returnedReason,
    status: bestAnswer != null ? 'completed' : 'failed',
  })

  return { answer: bestAnswer, usages, loopScore: bestScore >= 0 ? bestScore : null, loopCount: finalLoopIndex }
}

function fcAddDays(ymd: string, n: number): string {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ''
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}
function fcDaysBetween(fromYmd: string, toYmd: string): number {
  const p = (s: string) => {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN
  }
  const a = p(fromYmd), b = p(toYmd)
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86400000) : 0
}
// テナント一覧は「翌朝に出る“前日”の売上比較表」。report_date はレポート発行日なので、
// 実際の売上が発生した日は前日(-1)。AIに渡す日付・相関はすべてこの“売上日”に揃える。
export function fcSalesDate(r: Record<string, unknown>): string {
  const rd = String((r as { report_date?: unknown }).report_date ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(rd)) return fcAddDays(rd.slice(0, 10), -1)
  const iso = String((r as { created_at?: unknown }).created_at ?? '')
  const d = iso ? new Date(iso) : null
  if (d && !isNaN(d.getTime())) {
    const j = new Date(d.getTime() + 9 * 3600 * 1000)
    return fcAddDays(`${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, '0')}-${String(j.getUTCDate()).padStart(2, '0')}`, -1)
  }
  return ''
}
// 日次表示・相関のキーは「売上日」（report_date の前日）に統一する。
function fcDayLabel(r: Record<string, unknown>): string {
  return fcSalesDate(r)
}

function fcAvg(a: number[]): number | null { const x = a.filter((v) => v != null && isFinite(v)); return x.length ? x.reduce((s, v) => s + v, 0) / x.length : null }
function fcMedian(a: number[]): number | null { const x = a.filter((v) => v != null && isFinite(v)).slice().sort((p, q) => p - q); if (!x.length) return null; const m = Math.floor(x.length / 2); return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2 }
function fcDow(dateStr: string): number | null { const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return null; return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay() }
const FC_DOW = ['日', '月', '火', '水', '木', '金', '土']
const fcYen = (v: number) => '¥' + Math.round(v).toLocaleString('ja-JP')
const fcPct = (v: number) => (v >= 0 ? '+' : '') + (Math.round(v * 10) / 10).toFixed(1) + '%'

// 基準店の日次系列から、傾向・曜日・前日比・順位などを事前計算した分析メモを作る（モデルに渡して“列挙”を防ぐ）。
function buildBaseInsights(reports: Array<Record<string, unknown>>, baseName: string): string {
  const rows: Array<{ date: string; dow: number | null; sales: number; guests: number | null; kt: number | null; rank: number; share: number | null }> = []
  for (const r of reports || []) {
    const raw = Array.isArray((r as { tenants?: unknown }).tenants) ? (r as { tenants?: unknown[] }).tenants as unknown[] : []
    const list: Array<{ name: string; sales: number; guests: number | null }> = []
    for (const t of raw) {
      const o = (t && typeof t === 'object') ? t as Record<string, unknown> : {}
      const name = String(o.name ?? '').trim(); const sales = numOrNull(o.sales)
      if (name && sales != null && sales >= 0) list.push({ name, sales, guests: numOrNull(o.guests) })
    }
    if (list.length < 2) continue
    const base = list.find((t) => normalizeName(t.name) === normalizeName(baseName))
    if (!base) continue
    const total = list.reduce((s, t) => s + t.sales, 0)
    const date = fcSalesDate(r) // 売上日（report_date の前日）に統一
    rows.push({ date, dow: fcDow(date), sales: base.sales, guests: base.guests, kt: (base.guests && base.guests > 0) ? base.sales / base.guests : null, rank: 1 + list.filter((t) => t.sales > base.sales).length, share: total > 0 ? base.sales / total * 100 : null })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date))
  if (!rows.length) return ''
  const sales = rows.map((r) => r.sales)
  const guests = rows.map((r) => r.guests).filter((x): x is number => x != null)
  const kts = rows.map((r) => r.kt).filter((x): x is number => x != null)
  const ranks = rows.map((r) => r.rank)
  const maxR = rows.reduce((m, r) => r.sales > m.sales ? r : m, rows[0])
  const minR = rows.reduce((m, r) => r.sales < m.sales ? r : m, rows[0])
  const half = Math.floor(rows.length / 2)
  const firstAvg = half ? fcAvg(rows.slice(0, half).map((r) => r.sales)) : null
  const lateAvg = half ? fcAvg(rows.slice(rows.length - half).map((r) => r.sales)) : null
  const ktFirst = half ? fcAvg(rows.slice(0, half).map((r) => r.kt ?? NaN)) : null
  const ktLate = half ? fcAvg(rows.slice(rows.length - half).map((r) => r.kt ?? NaN)) : null
  const we = fcAvg(rows.filter((r) => r.dow === 0 || r.dow === 6).map((r) => r.sales))
  const wd = fcAvg(rows.filter((r) => r.dow != null && r.dow !== 0 && r.dow !== 6).map((r) => r.sales))
  let up: { d: number; to: typeof rows[0] } | null = null, dn: { d: number; to: typeof rows[0] } | null = null
  for (let i = 1; i < rows.length; i++) { const d = rows[i].sales - rows[i - 1].sales; if (!up || d > up.d) up = { d, to: rows[i] }; if (!dn || d < dn.d) dn = { d, to: rows[i] } }
  const dd = (r: { date: string; dow: number | null }) => `${r.date}(${r.dow != null ? FC_DOW[r.dow] : '?'})`
  const L: string[] = []
  L.push(`期間: ${rows[0].date}〜${rows[rows.length - 1].date}（${rows.length}日分）`)
  L.push(`売上: 合計${fcYen(sales.reduce((s, v) => s + v, 0))} / 日平均${fcYen(fcAvg(sales) ?? 0)} / 中央値${fcYen(fcMedian(sales) ?? 0)}`)
  L.push(`最高売上日: ${dd(maxR)} ${fcYen(maxR.sales)} / 最低売上日: ${dd(minR)} ${fcYen(minR.sales)}`)
  if (firstAvg && lateAvg) L.push(`傾向(前半→後半の日平均): ${fcYen(firstAvg)}→${fcYen(lateAvg)}（${fcPct((lateAvg / firstAvg - 1) * 100)}＝${lateAvg >= firstAvg ? '上昇' : '下降'}基調）`)
  if (we && wd) L.push(`曜日差: 土日平均${fcYen(we)} / 平日平均${fcYen(wd)}（土日は平日の${(we / wd).toFixed(2)}倍）`)
  if (up) L.push(`最大の増加: ${dd(up.to)} ${fcYen(up.to.sales)}（前日比 +${fcYen(up.d)}）`)
  if (dn) L.push(`最大の減少: ${dd(dn.to)} ${fcYen(dn.to.sales)}（前日比 ${fcYen(dn.d)}）`)
  if (ranks.length) L.push(`FC内売上順位: 平均${(fcAvg(ranks) ?? 0).toFixed(1)}位 / 最高${Math.min(...ranks)}位・最低${Math.max(...ranks)}位（全${(rows[0] && 11) || 11}店規模）`)
  if (ktFirst && ktLate) L.push(`客単価(前半→後半の平均): ${fcYen(ktFirst)}→${fcYen(ktLate)}`)
  if (kts.length) L.push(`客単価レンジ: 平均${fcYen(fcAvg(kts) ?? 0)} / ${fcYen(Math.min(...kts))}〜${fcYen(Math.max(...kts))}`)
  if (guests.length) L.push(`客数: 日平均${Math.round(fcAvg(guests) ?? 0)}人 / ${Math.min(...guests)}〜${Math.max(...guests)}人`)
  return L.join('\n')
}

// 基準店の日次（日付・客数・売上）を抽出する。イベント相関の計算に使う。
function fcBaseDaily(reports: Array<Record<string, unknown>>, baseName: string): Array<{ date: string; guests: number | null; sales: number }> {
  const out: Array<{ date: string; guests: number | null; sales: number }> = []
  for (const r of reports || []) {
    const raw = Array.isArray((r as { tenants?: unknown }).tenants) ? (r as { tenants?: unknown[] }).tenants as unknown[] : []
    let base: { sales: number; guests: number | null } | null = null
    for (const t of raw) {
      const o = (t && typeof t === 'object') ? t as Record<string, unknown> : {}
      const name = String(o.name ?? '').trim()
      if (name && normalizeName(name) === normalizeName(baseName)) {
        const sales = numOrNull(o.sales)
        if (sales != null) base = { sales, guests: numOrNull(o.guests) }
      }
    }
    if (!base) continue
    const date = fcSalesDate(r) // 売上日（report_date の前日）に統一
    out.push({ date, guests: base.guests, sales: base.sales })
  }
  out.sort((a, b) => a.date.localeCompare(b.date))
  return out
}

// 東京ドームのイベントと基準店客数の相関を事前計算（イベント日 vs 非イベント日、ジャンル別）。
function buildEventCorrelation(reports: Array<Record<string, unknown>>, baseName: string, events: VenueEvent[]): string {
  if (!Array.isArray(events) || !events.length) return ''
  const byDate = new Map<string, VenueEvent[]>()
  for (const e of events) {
    const d = String(e.event_date ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue
    if (!byDate.has(d)) byDate.set(d, [])
    byDate.get(d)!.push(e)
  }
  const daily = fcBaseDaily(reports, baseName).filter((r) => r.guests != null)
  if (!daily.length) return ''
  const ev: number[] = []; const nonEv: number[] = []
  const evS: number[] = []; const nonEvS: number[] = []
  const byCat = new Map<string, number[]>()
  for (const r of daily) {
    const hits = byDate.get(r.date) || []
    if (hits.length) {
      ev.push(r.guests as number); evS.push(r.sales)
      for (const h of hits) { const c = h.category || 'その他'; if (!byCat.has(c)) byCat.set(c, []); byCat.get(c)!.push(r.guests as number) }
    } else { nonEv.push(r.guests as number); nonEvS.push(r.sales) }
  }
  const L: string[] = []
  const evAvg = fcAvg(ev); const nonAvg = fcAvg(nonEv)
  if (evAvg != null && nonAvg != null) {
    const ratio = nonAvg > 0 ? evAvg / nonAvg : null
    L.push(`イベント日(${ev.length}日)の平均客数 ${Math.round(evAvg)}人 / 非イベント日(${nonEv.length}日)の平均客数 ${Math.round(nonAvg)}人${ratio ? `（${ratio.toFixed(2)}倍）` : ''}`)
  } else if (evAvg != null) {
    L.push(`イベント日(${ev.length}日)の平均客数 ${Math.round(evAvg)}人（非イベント日のデータが不足）`)
  }
  const evSa = fcAvg(evS); const nonSa = fcAvg(nonEvS)
  if (evSa != null && nonSa != null) L.push(`イベント日の平均売上 ${fcYen(evSa)} / 非イベント日 ${fcYen(nonSa)}`)
  const cats = Array.from(byCat.entries()).filter(([, a]) => a.length).sort((a, b) => (fcAvg(b[1]) ?? 0) - (fcAvg(a[1]) ?? 0))
  for (const [c, a] of cats) L.push(`・${c}: ${a.length}日 / 平均客数 ${Math.round(fcAvg(a) ?? 0)}人`)
  if (byCat.has('スポーツ中継')) L.push('注: スポーツ中継(PV観戦)は全体の集客が大きい日。当店への売上寄与は固定視せず、上の「客数」と「客単価/売上」の実績数値で都度判断すること（断定しない・蓄積で更新）。現場の仮説として『サッカー放映は客がバーガー/ビールに流れやすく、野球の方が当店売上は伸びやすい』があるが、あくまで仮説で、競技・放映時間帯ごとの実際の数値で検証する。')
  // 会場別（東京ドーム本体／カナデビアホール／後楽園ホール等）の平均客数。会場で客層が異なるため取り込み方を読む。
  const byVenue = new Map<string, number[]>()
  for (const r of daily) {
    const hits = byDate.get(r.date) || []
    const vs = new Set(hits.map((h) => String(h.venue ?? 'tokyo-dome')))
    for (const v of vs) { if (!byVenue.has(v)) byVenue.set(v, []); byVenue.get(v)!.push(r.guests as number) }
  }
  const venName = (v: string) => fcVenueLabel(v) || (v === 'tokyo-dome' ? '東京ドーム' : v)
  const venRows = Array.from(byVenue.entries()).filter(([, a]) => a.length).sort((a, b) => (fcAvg(b[1]) ?? 0) - (fcAvg(a[1]) ?? 0))
  if (venRows.length >= 2) { L.push('会場別の平均客数（会場で客層が違う＝取り込み方を変える）:'); for (const [v, a] of venRows) L.push(`・${venName(v)}: ${a.length}日 / 平均客数 ${Math.round(fcAvg(a) ?? 0)}人`) }
  // 実測/手入力の動員があるイベント日だけで、規模帯ごとの平均客数（動的ドライバー）
  const withAtt: Array<{ att: number; guests: number; sales: number }> = []
  for (const r of daily) {
    const hits = byDate.get(r.date) || []
    const maxAtt = maxActualEventAttendance(hits)
    if (maxAtt != null && maxAtt > 0 && r.guests != null) withAtt.push({ att: maxAtt, guests: r.guests as number, sales: r.sales })
  }
  if (withAtt.length >= 3) {
    const bands: Array<{ label: string; lo: number; hi: number }> = [
      { label: '小規模(~1.5万人)', lo: 1, hi: 15000 },
      { label: '中規模(1.5〜3.5万)', lo: 15000, hi: 35000 },
      { label: '大規模(3.5万~)', lo: 35000, hi: 1e9 },
    ]
    L.push('動員規模帯ごとの平均客数（実測/手入力の動員がある日のみ・規模は動的要因）:')
    for (const b of bands) {
      const rows = withAtt.filter((x) => x.att >= b.lo && x.att < b.hi)
      if (!rows.length) continue
      L.push(`・${b.label}: ${rows.length}日 / 平均客数${Math.round(fcAvg(rows.map((x) => x.guests)) ?? 0)}人 / 平均売上${fcYen(fcAvg(rows.map((x) => x.sales)) ?? 0)}`)
    }
    const missing = daily.filter((r) => {
      const hits = byDate.get(r.date) || []
      if (!hits.length) return false
      return !hits.some((h) => actualEventAttendance(h) != null)
    }).length
    if (missing > 0) L.push(`注: イベントありだが実測/手入力の動員が無い日が${missing}日ある。規模比較は有効な日のみ。会場収容からの推定は数値に使わない。`)
  }

  // プロ野球（巨人戦）の開始時間・勝敗結果・試合時間・点差・連勝連敗の影響分析
  const baseballWins: number[] = []; const baseballLosses: number[] = []
  const baseballWinsS: number[] = []; const baseballLossesS: number[] = []
  const baseballDay: number[] = []; const baseballNight: number[] = []
  const baseballDayS: number[] = []; const baseballNightS: number[] = []
  const baseballShort: number[] = []; const baseballLong: number[] = []
  const baseballShortS: number[] = []; const baseballLongS: number[] = []
  const baseballClose: number[] = []; const baseballCloseS: number[] = []
  const baseballMid: number[] = []; const baseballMidS: number[] = []
  const baseballBlowout: number[] = []; const baseballBlowoutS: number[] = []
  const baseballWinStreak: number[] = []; const baseballWinStreakS: number[] = []
  const baseballLossStreak: number[] = []; const baseballLossStreakS: number[] = []
  const baseballNoStreak: number[] = []; const baseballNoStreakS: number[] = []

  for (const r of daily) {
    const hits = byDate.get(r.date) || []
    const bb = hits.find((h) => h.category === 'プロ野球' && (h.venue === 'tokyo-dome' || !h.venue))
    if (bb) {
      const g = r.guests as number
      const s = r.sales
      
      // 1) 勝敗別 (game_result)
      if (bb.game_result === '○') {
        baseballWins.push(g); baseballWinsS.push(s)
      } else if (bb.game_result === '●') {
        baseballLosses.push(g); baseballLossesS.push(s)
      }
      
      // 2) 開始時間別 (start_time)
      if (bb.start_time) {
        const hh = parseInt(bb.start_time.split(':')[0], 10)
        if (!isNaN(hh)) {
          if (hh <= 15) {
            baseballDay.push(g); baseballDayS.push(s)
          } else {
            baseballNight.push(g); baseballNightS.push(s)
          }
        }
      }
      
      // 3) 試合時間別 (game_duration)
      if (bb.game_duration) {
        const parts = bb.game_duration.split(':')
        if (parts.length >= 2) {
          const hours = parseInt(parts[0], 10)
          const mins = parseInt(parts[1], 10)
          if (!isNaN(hours) && !isNaN(mins)) {
            const totalMins = hours * 60 + mins
            if (totalMins <= 180) { // 3時間以下
              baseballShort.push(g); baseballShortS.push(s)
            } else {
              baseballLong.push(g); baseballLongS.push(s)
            }
          }
        }
      }

      // 4) 点差（接戦度）別 (score_margin)
      if (bb.score_margin != null && bb.score_margin !== undefined) {
        const margin = bb.score_margin
        if (margin <= 1) {
          baseballClose.push(g); baseballCloseS.push(s)
        } else if (margin <= 4) {
          baseballMid.push(g); baseballMidS.push(s)
        } else {
          baseballBlowout.push(g); baseballBlowoutS.push(s)
        }
      }

      // 5) 連勝・連敗別 (streak_before)
      if (bb.streak_before != null && bb.streak_before !== undefined) {
        const streak = bb.streak_before
        if (streak >= 2) {
          baseballWinStreak.push(g); baseballWinStreakS.push(s)
        } else if (streak <= -2) {
          baseballLossStreak.push(g); baseballLossStreakS.push(s)
        } else {
          baseballNoStreak.push(g); baseballNoStreakS.push(s)
        }
      }
    }
  }

  const bbL: string[] = []
  if (baseballWins.length || baseballLosses.length || baseballDay.length || baseballNight.length || baseballShort.length || baseballLong.length || baseballClose.length || baseballMid.length || baseballBlowout.length || baseballWinStreak.length || baseballLossStreak.length || baseballNoStreak.length) {
    bbL.push('【プロ野球詳細分析】')
    if (baseballWins.length && baseballLosses.length) {
      bbL.push(`・勝敗別: 勝ち試合(${baseballWins.length}日) 平均客数 ${Math.round(fcAvg(baseballWins)!)}人 / 売上 ${fcYen(fcAvg(baseballWinsS)!)} vs 負け試合(${baseballLosses.length}日) 平均客数 ${Math.round(fcAvg(baseballLosses)!)}人 / 売上 ${fcYen(fcAvg(baseballLossesS)!)}`)
    }
    if (baseballDay.length && baseballNight.length) {
      bbL.push(`・時間帯別: デーゲーム(${baseballDay.length}日) 平均客数 ${Math.round(fcAvg(baseballDay)!)}人 / 売上 ${fcYen(fcAvg(baseballDayS)!)} vs ナイター(${baseballNight.length}日) 平均客数 ${Math.round(fcAvg(baseballNight)!)}人 / 売上 ${fcYen(fcAvg(baseballNightS)!)}`)
    }
    if (baseballShort.length && baseballLong.length) {
      bbL.push(`・試合時間別: 3時間以内・スピード決着(${baseballShort.length}日) 平均客数 ${Math.round(fcAvg(baseballShort)!)}人 / 売上 ${fcYen(fcAvg(baseballShortS)!)} vs 3時間超・長期戦(${baseballLong.length}日) 平均客数 ${Math.round(fcAvg(baseballLong)!)}人 / 売上 ${fcYen(fcAvg(baseballLongS)!)}`)
    }
    if (baseballClose.length || baseballMid.length || baseballBlowout.length) {
      const parts: string[] = []
      if (baseballClose.length) parts.push(`接戦(1点差以内: ${baseballClose.length}日) 平均客数 ${Math.round(fcAvg(baseballClose)!)}人/売上 ${fcYen(fcAvg(baseballCloseS)!)}`)
      if (baseballMid.length) parts.push(`中点差(2〜4点差: ${baseballMid.length}日) 平均客数 ${Math.round(fcAvg(baseballMid)!)}人/売上 ${fcYen(fcAvg(baseballMidS)!)}`)
      if (baseballBlowout.length) parts.push(`大点差(5点差以上: ${baseballBlowout.length}日) 平均客数 ${Math.round(fcAvg(baseballBlowout)!)}人/売上 ${fcYen(fcAvg(baseballBlowoutS)!)}`)
      bbL.push(`・接戦度・点差別: ${parts.join(' vs ')}`)
    }
    if (baseballWinStreak.length || baseballLossStreak.length || baseballNoStreak.length) {
      const parts: string[] = []
      if (baseballWinStreak.length) parts.push(`連勝中(2連勝以上: ${baseballWinStreak.length}日) 平均客数 ${Math.round(fcAvg(baseballWinStreak)!)}人/売上 ${fcYen(fcAvg(baseballWinStreakS)!)}`)
      if (baseballLossStreak.length) parts.push(`連敗中(2連敗以上: ${baseballLossStreak.length}日) 平均客数 ${Math.round(fcAvg(baseballLossStreak)!)}人/売上 ${fcYen(fcAvg(baseballLossStreakS)!)}`)
      if (baseballNoStreak.length) parts.push(`連勝連敗なし(-1〜+1: ${baseballNoStreak.length}日) 平均客数 ${Math.round(fcAvg(baseballNoStreak)!)}人/売上 ${fcYen(fcAvg(baseballNoStreakS)!)}`)
      bbL.push(`・直前の連勝・連敗状況別: ${parts.join(' vs ')}`)
    }
    L.push(bbL.join('\n'))
  }

  // データのある日付ごとのイベント有無を提示（モデルが個別イベントを名指しで語れるように・売上・動員も添える）
  const sample = daily.slice(-14).map((r) => {
    const hits = byDate.get(r.date) || []
    const lab = fcFormatEventsForDay(hits)
    const dw = fcDow(r.date)
    return `${r.date}(${dw != null ? FC_DOW[dw] : '?'}) 客数${r.guests}人 売上${fcYen(r.sales)} ${lab}`
  })
  if (sample.length) L.push('—\n直近の日別イベント（タイトル＋動員予想を使い、“どの規模のイベントがどう効いたか”を述べること）:\n' + sample.join('\n'))
  return L.join('\n')
}

// 今後の会場イベント予定をテキスト化（最大25件）。動員予想を必ず併記。
function buildEventListText(events: VenueEvent[]): string {
  if (!Array.isArray(events) || !events.length) return ''
  const sorted = events.slice().filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(String(e.event_date ?? '').slice(0, 10)))
    .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date))).slice(0, 25)
  const lines = sorted.map((e) => {
    const d = e.event_date.slice(0, 10)
    const dw = fcDow(d)
    const vl = fcVenueLabel(e.venue)
    const jp = e.is_japan ? '🇯🇵日本戦(集客大・深夜営業あり) ' : ''
    const nt = e.note ? ` ※${e.note}` : ''
    const att = fcEventAttendanceLabel(e)
    return `${d}(${dw != null ? FC_DOW[dw] : '?'}) [${e.category}${vl ? `/${vl}` : ''}] ${jp}${e.title} ｜${att}${nt}`
  })
  // PV(スポーツ中継)の運用知見をAIが必ず踏まえるよう注記。
  if (sorted.some((e) => e.category === 'スポーツ中継')) {
    lines.push('※PV観戦(スポーツ中継)の見方: フードコート全体は集客増が見込める日。当店の売上寄与は断定せず、実績の客数/客単価/売上で判断する（蓄積で随時更新・固定の結論にしない）。現場の仮説として『サッカー放映は客がバーガー/ビールに流れやすく、野球の方が当店売上は伸びやすい』があるが要検証。日本戦は深夜営業の可能性に備える。')
  }
  lines.push('※動員数はイベント規模の動的ドライバー。同種イベントでも動員が違う日は客数リフトが異なる前提で比較すること。「動員推定」表記は会場収容人数からの機械算出（実測ではない）のため、規模感の参考にとどめ断定しない。')
  return lines.join('\n')
}

export type VenueEvent = {
  event_date: string
  title: string
  category: string
  venue?: string
  is_japan?: boolean
  note?: string
  /** 手入力の予想動員（tokyo_dome_events.expected_attendance）。未入力 is null */
  expected_attendance?: number | null
  start_time?: string | null
  game_duration?: string | null
  game_result?: string | null
  game_score?: string | null
  score_margin?: number | null
  streak_before?: number | null
  streak_after?: number | null
}
export type ForecastRow = { target_date: string; metric: string; predicted: number; predicted_low?: number | null; predicted_high?: number | null; actual?: number | null; model_version?: string }

function fcEventAttendanceLabel(e: VenueEvent): string {
  const r = resolveEventAttendance(e)
  if (!r) return '動員データなし'
  if (r.estimated) return `動員推定${r.mid.toLocaleString('ja-JP')}人（会場収容ベースの仮値・幅${r.low.toLocaleString('ja-JP')}〜${r.high.toLocaleString('ja-JP')}人、実測ではない）`
  return `動員予想${r.mid.toLocaleString('ja-JP')}人`
}

/** 同日イベントを「種別名:タイトル(動員…)」形式で短く並べる */
function fcFormatEventsForDay(hits: VenueEvent[]): string {
  if (!hits.length) return 'イベントなし'
  return hits.map((h) => {
    const vl = fcVenueLabel(h.venue)
    const details: string[] = [fcEventAttendanceLabel(h)]
    if (h.start_time) details.push(`開始:${h.start_time}`)
    if (h.game_duration) details.push(`時間:${h.game_duration}`)
    if (h.game_result) details.push(`結果:${h.game_result}`)
    if (h.game_score) details.push(`スコア:${h.game_score}`)
    if (h.score_margin != null && h.score_margin !== undefined) details.push(`点差:${h.score_margin}点差`)
    if (h.streak_before != null && h.streak_before !== undefined && h.streak_before !== 0) {
      details.push(h.streak_before > 0 ? `${h.streak_before}連勝中` : `${Math.abs(h.streak_before)}連敗中`)
    }
    return `${h.category}${vl ? `@${vl}` : ''}:${h.title}（${details.join('／')}）`
  }).join('｜')
}

// 学習型モデルの予測（forecast_predictions）を、精度（過去の予測vs実績MAPE）＋今後の予測としてテキスト化。
function buildForecastContext(forecast: ForecastRow[]): string {
  if (!Array.isArray(forecast) || !forecast.length) return ''
  const byDate = new Map<string, { guests?: ForecastRow; sales?: ForecastRow }>()
  for (const r of forecast) {
    const d = String(r.target_date ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue
    const o = byDate.get(d) ?? {}
    if (r.metric === 'guests') o.guests = r; else if (r.metric === 'sales') o.sales = r
    byDate.set(d, o)
  }
  const days = Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  const ape = (m: 'guests' | 'sales') => {
    const xs = days.map(([, o]) => o[m]).filter((r): r is ForecastRow => !!r && r.actual != null && (r.actual as number) > 0).map((r) => Math.abs(r.predicted - (r.actual as number)) / (r.actual as number))
    return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null
  }
  const mg = ape('guests'); const ms = ape('sales')
  const nEval = days.filter(([, o]) => o.guests && o.guests.actual != null).length
  const L: string[] = []
  L.push(`予測一覧の参考集計: ${nEval}日、客数MAPE ${mg != null ? Math.round(mg * 100) : '—'}% / 売上MAPE ${ms != null ? Math.round(ms * 100) : '—'}%。旧再計算・異なる発行条件が混在し得るため、これは本番精度や学習による改善の証拠ではない。本番精度はAI学習進化の事前予測台帳で、先行日数・対象日・方式を揃えて比較する。MAPEを予測区間や的中率として扱わない。`)
  const today = jstTodayForFc()
  const fut = days.filter(([d]) => d >= today).slice(0, 10)
  for (const [d, o] of fut) {
    const dw = fcDow(d)
    const g = o.guests ? `客数${Math.round(o.guests.predicted)}人` : ''
    const s = o.sales ? `売上${fcYen(o.sales.predicted)}` : ''
    const range = o.guests?.predicted_low != null && o.guests?.predicted_high != null ? `（客数の経験的80%幅 ${Math.round(o.guests.predicted_low)}〜${Math.round(o.guests.predicted_high)}人。保証なし）` : '（予測幅は評価データ不足）'
    L.push(`${d}(${dw != null ? FC_DOW[dw] : '?'}) 予測 ${[g, s].filter(Boolean).join(' / ')} ${range}`)
  }
  return L.join('\n')
}
function jstTodayForFc(): string { const j = new Date(Date.now() + 9 * 3600 * 1000); return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, '0')}-${String(j.getUTCDate()).padStart(2, '0')}` }
// 会場ラベル（東京ドーム本体は無印で簡潔に、各ホールは会場名を明示してAIが客層差を読めるように）。
function fcVenueLabel(venue?: string): string {
  const v = String(venue ?? "").trim().toLowerCase()
  if (v === "kanadevia") return "カナデビアホール"
  if (v === "korakuen") return "後楽園ホール"
  if (v === "prism") return "プリズムホール"
  if (v === "laqua") return "ラクーア"
  if (v === "public-viewing") return "PV観戦(世界スポーツ放映)"
  if (v === "imm" || v === "imm-theater" || v === "imm_theater") return "IMMシアター"
  return "" // tokyo-dome / 不明は無印
}
export type WeatherDay = { weather_date: string; weather_code: number | null; temp_max: number | null; temp_min: number | null; precipitation_mm: number | null; precip_prob: number | null; summary: string }

// 天気と基準店客数の相関を事前計算（雨の日 vs 雨でない日、天気区分別、気温）。
function buildWeatherCorrelation(reports: Array<Record<string, unknown>>, baseName: string, weather: WeatherDay[]): string {
  if (!Array.isArray(weather) || !weather.length) return ''
  const byDate = new Map<string, WeatherDay>()
  for (const w of weather) { const d = String(w.weather_date ?? '').slice(0, 10); if (/^\d{4}-\d{2}-\d{2}$/.test(d)) byDate.set(d, w) }
  const daily = fcBaseDaily(reports, baseName).filter((r) => r.guests != null)
  if (!daily.length) return ''
  const rainG: number[] = [], dryG: number[] = [], rainS: number[] = [], dryS: number[] = []
  const hotG: number[] = [], coolG: number[] = []
  const byCat = new Map<string, number[]>()
  for (const r of daily) {
    const w = byDate.get(r.date); if (!w) continue
    const g = r.guests as number
    const rainy = (w.precipitation_mm ?? 0) >= 1
    if (rainy) { rainG.push(g); rainS.push(r.sales) } else { dryG.push(g); dryS.push(r.sales) }
    const cat = w.summary || '—'; if (!byCat.has(cat)) byCat.set(cat, []); byCat.get(cat)!.push(g)
    if (w.temp_max != null) { if (w.temp_max >= 30) hotG.push(g); else coolG.push(g) }
  }
  const L: string[] = []
  const rA = fcAvg(rainG), dA = fcAvg(dryG)
  if (rA != null && dA != null) {
    const ratio = dA > 0 ? rA / dA : null
    L.push(`雨の日(${rainG.length}日)の平均客数 ${Math.round(rA)}人 / 雨でない日(${dryG.length}日)の平均客数 ${Math.round(dA)}人${ratio ? `（${ratio.toFixed(2)}倍）` : ''}`)
    const rsa = fcAvg(rainS), dsa = fcAvg(dryS)
    if (rsa != null && dsa != null) L.push(`雨の日の平均売上 ${fcYen(rsa)} / 雨でない日 ${fcYen(dsa)}`)
  } else if (rA != null) {
    L.push(`雨の日(${rainG.length}日)の平均客数 ${Math.round(rA)}人（雨でない日のデータが不足）`)
  } else if (dA != null) {
    L.push(`雨でない日(${dryG.length}日)の平均客数 ${Math.round(dA)}人（雨の日のデータがまだ無い）`)
  }
  const hA = fcAvg(hotG), cA = fcAvg(coolG)
  if (hA != null && cA != null) L.push(`真夏日(最高30℃以上 ${hotG.length}日)の平均客数 ${Math.round(hA)}人 / それ未満(${coolG.length}日) ${Math.round(cA)}人`)
  const cats = Array.from(byCat.entries()).filter(([, a]) => a.length).sort((a, b) => (fcAvg(b[1]) ?? 0) - (fcAvg(a[1]) ?? 0))
  for (const [c, a] of cats) L.push(`・${c}: ${a.length}日 / 平均客数 ${Math.round(fcAvg(a) ?? 0)}人`)
  return L.join('\n')
}

// FOOD STADIUM TOKYO（東京ドームシティのフードホール）の競合店プロファイル。
// 詳細は docs/フードコート競合店プロファイル.md（こちらが正本／改装時は両方更新）。
// 客単価は業態差が大きいため、AIが「単価順位」を業態文脈で正しく解釈できるよう注入する。
const FOODCOURT_STORE_PROFILES: Array<{ name: string; genre: string; price: string; drink: string; note: string }> = [
  { name: 'MARUGO S', genre: 'ワインバル＋スパイスカレー', price: '昼¥1,000-1,999/夜¥3,000-3,999(FC最高単価ゾーン)', drink: 'やや飲み(ワイン)寄り', note: '施設で唯一の本格ワイン×スパイス。高単価・大人路線。ワイン需要をほぼ独占＝強み' },
  { name: 'クラフトビアマーケット', genre: 'クラフトビール×バーガー', price: '¥2,000-2,999', drink: '飲み(ビール)中心', note: 'ビール20〜30種＋スマッシュバーガー' },
  { name: 'ニュー大金星', genre: '大衆居酒屋(鉄板/揚物)', price: '¥1,000-1,999', drink: '両立(食事寄り)', note: '鉄板焼きそば。汎用性高' },
  { name: '新御茶ノ水 萬龍', genre: '中華(ネオ町中華)', price: '昼¥1,000-1,999/夜〜¥2,999', drink: '食事中心', note: '肉玉炒飯。行列町中華2号店' },
  { name: 'ベトナム屋台バインセオサイゴン', genre: 'ベトナム料理(屋台)', price: '約¥1,000-1,500', drink: '食事中心', note: 'バインセオ/フーティウ。本場志向' },
  { name: 'A destra Salvatore', genre: 'イタリアン(ピザ/パスタ)', price: '昼¥1,000-1,999/夜¥3,000-3,999', drink: '食事中心＋ワイン', note: 'サルヴァトーレ系。MARUGO Sと並ぶ夜の最高単価' },
  { name: '水道橋 すしわさび', genre: '寿司酒場', price: '昼¥1,000-1,999/夜は3-5千の可能性', drink: '飲み寄り(寿司飲み)', note: 'わさびバラちらし。地酒充実' },
  { name: '蟻月', genre: '博多もつ鍋', price: '¥1,000-1,999', drink: '食事中心(当店)', note: '白/赤もつ鍋＋カップもつ鍋。フード寄り最適化' },
  { name: 'ラーメン＆酒バル 麺屋一燈', genre: 'ラーメン＆酒バル', price: '¥1,000-1,999', drink: '食事(ラーメン)主軸＋飲み', note: '濃厚魚介つけ麺。施設内で高評価' },
  { name: 'チャルモゴッソヨ', genre: '韓国料理/韓国酒場', price: '昼約¥1,300-1,800/夜約¥2,000-3,000', drink: '両立(酒場＋定食)', note: '映え×健康志向。若年・女性層に強い' },
  { name: '台湾点心とビール 恒久飯店', genre: '台湾点心×クラフトビール', price: '推定¥1,500-2,500', drink: '飲み(ビール)寄り', note: 'ブルワリー運営。点心×ビール' },
]

// 競合プロファイルを、実データに登場する店だけに絞ってテキスト化（基準店に★）。
function buildCompetitorContext(reports: Array<Record<string, unknown>>, baseName: string): string {
  const present = new Set<string>()
  for (const r of (reports || [])) {
    const raw = Array.isArray((r as { tenants?: unknown }).tenants) ? (r as { tenants?: unknown[] }).tenants as unknown[] : []
    for (const t of raw) { const nm = String(((t && typeof t === 'object') ? (t as Record<string, unknown>).name : '') ?? '').trim(); if (nm) present.add(normalizeName(nm)) }
  }
  const lines: string[] = ['施設: FOOD STADIUM TOKYO（東京ドーム内・共有席のフードホール／全店アルコール提供／イベント前後の来場客が回遊）。']
  lines.push('注意: 客単価は業態差が大きい（ワイン/イタリアン＝高単価、ラーメン/ベトナム/もつ鍋＝低単価）。単価の順位は業態由来なので「単価順位の上下」より「業態として妥当か」「客数(集客)で勝てているか」で評価すること。')
  for (const p of FOODCOURT_STORE_PROFILES) {
    if (present.size && !present.has(normalizeName(p.name))) continue
    const mark = normalizeName(p.name) === normalizeName(baseName) ? '★基準 ' : ''
    lines.push(`・${mark}${p.name}｜${p.genre}｜単価${p.price}｜${p.drink}｜${p.note}`)
  }
  return lines.join('\n')
}

// --- 設計書フレームワーク用の統計ヘルパー（docs/フードコート売上分析_設計書.md）---
function fcStdev(a: number[]): number | null {
  const x = a.filter((v) => v != null && isFinite(v))
  if (x.length < 2) return null
  const m = x.reduce((s, v) => s + v, 0) / x.length
  return Math.sqrt(x.reduce((s, v) => s + (v - m) * (v - m), 0) / x.length)
}
function fcPearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length)
  const px: number[] = [], py: number[] = []
  for (let i = 0; i < n; i++) { if (xs[i] != null && ys[i] != null && isFinite(xs[i]) && isFinite(ys[i])) { px.push(xs[i]); py.push(ys[i]) } }
  const m = px.length
  if (m < 4) return null
  const mx = px.reduce((s, v) => s + v, 0) / m, my = py.reduce((s, v) => s + v, 0) / m
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < m; i++) { const dx = px[i] - mx, dy = py[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy }
  return (sxx > 0 && syy > 0) ? sxy / Math.sqrt(sxx * syy) : null
}

// 売上=客数×客単価 の要因分解（前半→後半の日平均で、増減を客数要因/単価要因/交互に切り分ける）。設計書 §2。
function buildContributionDecomposition(reports: Array<Record<string, unknown>>, baseName: string): string {
  const daily = fcBaseDaily(reports, baseName).filter((r) => r.guests != null && (r.guests as number) > 0)
  if (daily.length < 6) return ''
  const half = Math.floor(daily.length / 2)
  const first = daily.slice(0, half)
  const late = daily.slice(daily.length - half)
  const Sf = fcAvg(first.map((r) => r.sales)) ?? 0
  const Sl = fcAvg(late.map((r) => r.sales)) ?? 0
  const Gf = fcAvg(first.map((r) => r.guests as number)) ?? 0
  const Gl = fcAvg(late.map((r) => r.guests as number)) ?? 0
  if (Gf <= 0 || Gl <= 0 || Sf <= 0) return ''
  const Kf = Sf / Gf, Kl = Sl / Gl
  const dS = Sl - Sf
  const cG = (Gl - Gf) * Kf       // 客数要因
  const cK = (Kl - Kf) * Gf       // 客単価要因
  const cX = (Gl - Gf) * (Kl - Kf) // 交互
  const pct = (v: number) => dS !== 0 ? `${Math.round(v / Math.abs(dS) * 100)}%` : '—'
  const driver = Math.abs(cG) >= Math.abs(cK) ? '客数要因' : '客単価要因'
  return [
    `前半${first.length}日→後半${late.length}日の日平均: 売上 ${fcYen(Sf)}→${fcYen(Sl)}（${fcPct((Sl / Sf - 1) * 100)}）/ 客数 ${Math.round(Gf)}→${Math.round(Gl)}人 / 客単価 ${fcYen(Kf)}→${fcYen(Kl)}`,
    `増減${fcYen(dS)}の内訳 ≒ 客数要因${fcYen(cG)}(${pct(cG)}) ＋ 客単価要因${fcYen(cK)}(${pct(cK)}) ＋ 交互${fcYen(cX)}(${pct(cX)}) → 主因は【${driver}】`,
  ].join('\n')
}

// 店舗間の日次売上ピアソン相関（基準店 vs 各店）。負=カニバリ(食い合い)候補、正=連動/アンカー候補。設計書 §6・§8。
function buildStoreCorrelation(reports: Array<Record<string, unknown>>, baseName: string): string {
  const byDate = new Map<string, Map<string, number>>()
  const nameDisplay = new Map<string, string>()
  for (const r of (reports || [])) {
    const date = fcSalesDate(r)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const raw = Array.isArray((r as { tenants?: unknown }).tenants) ? (r as { tenants?: unknown[] }).tenants as unknown[] : []
    let m = byDate.get(date); if (!m) { m = new Map(); byDate.set(date, m) }
    for (const t of raw) {
      const o = (t && typeof t === 'object') ? t as Record<string, unknown> : {}
      const nm = String(o.name ?? '').trim(); const s = numOrNull(o.sales)
      if (!nm || s == null) continue
      const key = normalizeName(nm)
      m.set(key, s); if (!nameDisplay.has(key)) nameDisplay.set(key, nm)
    }
  }
  const dates = Array.from(byDate.keys()).sort()
  if (dates.length < 5) return ''
  const baseKey = normalizeName(baseName)
  const others = new Set<string>()
  for (const m of byDate.values()) for (const k of m.keys()) if (k !== baseKey) others.add(k)
  const results: Array<{ name: string; r: number; n: number }> = []
  for (const ok of others) {
    const bx: number[] = [], ox: number[] = []
    for (const d of dates) { const m = byDate.get(d)!; const b = m.get(baseKey); const o = m.get(ok); if (b != null && o != null) { bx.push(b); ox.push(o) } }
    const r = fcPearson(bx, ox)
    if (r != null) results.push({ name: nameDisplay.get(ok) || ok, r, n: bx.length })
  }
  if (!results.length) return ''
  results.sort((a, b) => a.r - b.r)
  const neg = results.filter((x) => x.r <= -0.3).slice(0, 3)
  const pos = results.filter((x) => x.r >= 0.5).sort((a, b) => b.r - a.r).slice(0, 3)
  const L: string[] = ['※相関は因果ではない（曜日・イベント等の共通要因で連動しうる）。']
  if (neg.length) L.push('カニバリ候補(負相関): ' + neg.map((x) => `${x.name} r=${x.r.toFixed(2)}(${x.n}日)`).join(' / '))
  else L.push('明確なカニバリ(強い負相関)は未検出。')
  if (pos.length) L.push('連動候補(正相関・アンカー/共通需要): ' + pos.map((x) => `${x.name} r=${x.r.toFixed(2)}(${x.n}日)`).join(' / '))
  return L.join('\n')
}

// 異常値（基準店の日次売上のZスコア |Z|≧2）。記録的な日/落ち込み日を平常から切り分ける。設計書 §6。
function buildAnomalyDays(reports: Array<Record<string, unknown>>, baseName: string, events: VenueEvent[], weather: WeatherDay[]): string {
  const daily = fcBaseDaily(reports, baseName)
  if (daily.length < 7) return ''
  const sales = daily.map((r) => r.sales)
  const mean = fcAvg(sales) ?? 0
  const sd = fcStdev(sales)
  if (!sd || sd <= 0) return ''
  const evByDate = new Map<string, VenueEvent[]>()
  for (const e of (events || [])) { const d = String(e.event_date ?? '').slice(0, 10); if (/^\d{4}-\d{2}-\d{2}$/.test(d)) { if (!evByDate.has(d)) evByDate.set(d, []); evByDate.get(d)!.push(e) } }
  const wByDate = new Map<string, WeatherDay>()
  for (const w of (weather || [])) { const d = String(w.weather_date ?? '').slice(0, 10); if (/^\d{4}-\d{2}-\d{2}$/.test(d)) wByDate.set(d, w) }
  const out: string[] = []
  for (const r of daily) {
    const z = (r.sales - mean) / sd
    if (Math.abs(z) < 2) continue
    const dw = fcDow(r.date); const ev = evByDate.get(r.date) || []; const w = wByDate.get(r.date)
    const ctx: string[] = [ev.length ? ev.map((e) => `${e.category}:${e.title}`).join('｜') : 'イベントなし']
    if (w && (w.precipitation_mm ?? 0) >= 1) ctx.push('雨')
    if (w && w.temp_max != null) ctx.push(`最高${w.temp_max}℃`)
    out.push(`${r.date}(${dw != null ? FC_DOW[dw] : '?'}) 売上${fcYen(r.sales)} Z=${z.toFixed(1)}（${z > 0 ? '突出' : '落込'}）｜${ctx.join('・')}`)
  }
  if (!out.length) return ''
  return `平均${fcYen(mean)}・SD${fcYen(sd)}。|Z|≧2の日（平常分析から切り分けて要因を見る）:\n` + out.slice(0, 8).join('\n')
}

// 「分析サマリー（自動）」1日分の日次サマリー用に、対象レポート(=1日)のFC内順位・シェア・自店史比較・
// イベント/天気・直近推移を事前計算する。AIには数字を作らせず、ここで計算した事実だけを渡して意味を語らせる。
function buildTargetDayFacts(
  reports: Array<Record<string, unknown>>,
  baseName: string,
  targetReport: Record<string, unknown>,
  events: VenueEvent[],
  weather: WeatherDay[],
): string {
  const date = fcSalesDate(targetReport)
  const raw = Array.isArray((targetReport as { tenants?: unknown }).tenants) ? (targetReport as { tenants?: unknown[] }).tenants as unknown[] : []
  type Row = { name: string; sales: number; guests: number | null; kt: number | null }
  const list: Row[] = []
  for (const t of raw) {
    const o = (t && typeof t === 'object') ? t as Record<string, unknown> : {}
    const name = String(o.name ?? '').trim(); const sales = numOrNull(o.sales)
    if (!name || sales == null) continue
    const guests = numOrNull(o.guests)
    list.push({ name, sales, guests, kt: (guests && guests > 0) ? sales / guests : null })
  }
  const base = list.find((t) => normalizeName(t.name) === normalizeName(baseName))
  if (!base || !list.length) return ''
  const byS = list.slice().sort((a, b) => b.sales - a.sales)
  const salesRank = 1 + byS.findIndex((t) => t === base)
  const total = list.reduce((s, t) => s + t.sales, 0)
  const share = total > 0 ? base.sales / total * 100 : null
  const byG = list.filter((t) => t.guests != null).sort((a, b) => (b.guests as number) - (a.guests as number))
  const guestsRank = base.guests != null ? 1 + byG.findIndex((t) => t === base) : null
  const byK = list.filter((t) => t.kt != null).sort((a, b) => (b.kt as number) - (a.kt as number))
  const ktRank = base.kt != null ? 1 + byK.findIndex((t) => t === base) : null
  const fcAvgSales = fcAvg(list.map((t) => t.sales))
  const fcAvgGuests = fcAvg(list.map((t) => t.guests ?? NaN).filter((v) => isFinite(v)))
  const fcAvgKt = fcAvg(list.map((t) => t.kt ?? NaN).filter((v) => isFinite(v)))
  const fcMedKt = fcMedian(list.map((t) => t.kt ?? NaN).filter((v) => isFinite(v)))
  const top = byS[0]
  const above = salesRank > 1 ? byS[salesRank - 2] : null
  const below = salesRank < byS.length ? byS[salesRank] : null

  // 自店の履歴（対象日を除く全期間）と比較
  const histAll = fcBaseDaily(reports, baseName)
  const hist = histAll.filter((r) => r.date !== date)
  const histSalesAvg = fcAvg(hist.map((r) => r.sales))
  const histGuestsAvg = fcAvg(hist.map((r) => r.guests ?? NaN).filter((v) => isFinite(v)))
  const dow = fcDow(date)
  const sameDowAvg = fcAvg(hist.filter((r) => fcDow(r.date) === dow).map((r) => r.sales))
  const rankAmongHist = 1 + hist.filter((r) => r.sales > base.sales).length

  // イベント・天気（対象日）
  const ev = (events || []).filter((e) => String(e.event_date ?? '').slice(0, 10) === date)
  const wx = (weather || []).find((w) => String(w.weather_date ?? '').slice(0, 10) === date)

  // 過去平均との差を「客数要因」「客単価要因」に分解
  let decompLine = ''
  if (base.guests != null && histGuestsAvg && histSalesAvg != null) {
    const histKtAvg = histSalesAvg / histGuestsAvg
    const diff = base.sales - histSalesAvg
    const guestEffect = (base.guests - histGuestsAvg) * histKtAvg
    const priceEffect = ((base.kt ?? histKtAvg) - histKtAvg) * base.guests
    decompLine = `過去平均との差${fcYen(diff)}の主因は「${Math.abs(guestEffect) >= Math.abs(priceEffect) ? '客数' : '客単価'}」（客数の寄与${fcYen(guestEffect)}／客単価の寄与${fcYen(priceEffect)}）。`
  }

  // 直近の推移（対象日を含む直近3日）
  const idx = histAll.findIndex((r) => r.date === date)
  const recent = idx >= 0 ? histAll.slice(Math.max(0, idx - 2), idx + 1) : []
  const trendLine = recent.length > 1 ? `直近${recent.length}日: ${recent.map((r) => `${r.date.slice(5)} ${fcYen(r.sales)}`).join(' → ')}` : ''
  let prevDiffLine = ''
  if (idx > 0) {
    const prev = histAll[idx - 1]
    const d = base.sales - prev.sales
    prevDiffLine = `前回(${prev.date.slice(5)}) ${fcYen(prev.sales)} との差 ${fcYen(d)}（${prev.sales > 0 ? fcPct(d / prev.sales * 100) : '—'}）＝${d >= 0 ? '増' : '減'}。`
  }

  const L: string[] = []
  L.push(`対象日: ${date}（${dow != null ? FC_DOW[dow] : '?'}）`)
  L.push(`売上: ${fcYen(base.sales)}（FC平均${fcAvgSales != null ? fcYen(fcAvgSales) : '—'}の${fcAvgSales ? Math.round(base.sales / fcAvgSales * 100) : '—'}%、全${list.length}店中${salesRank}位）、売上シェア${share != null ? share.toFixed(1) : '—'}%`)
  if (base.guests != null) L.push(`客数: ${base.guests}人（FC平均${fcAvgGuests != null ? Math.round(fcAvgGuests) + '人' : '—'}、${guestsRank ?? '—'}位）`)
  if (base.kt != null) L.push(`客単価: ${fcYen(base.kt)}（FC平均${fcAvgKt != null ? fcYen(fcAvgKt) : '—'}・中央値${fcMedKt != null ? fcYen(fcMedKt) : '—'}、${ktRank ?? '—'}位）`)
  if (top && top !== base) L.push(`首位: ${top.name} ${fcYen(top.sales)}（自店比${base.sales > 0 ? (top.sales / base.sales).toFixed(2) : '—'}倍）`)
  if (above || below) L.push(`順位の前後: ${above ? '上位 ' + above.name + ' ' + fcYen(above.sales) + '（+' + fcYen(above.sales - base.sales) + '）' : ''}${above && below ? ' / ' : ''}${below ? '下位 ' + below.name + ' ' + fcYen(below.sales) + '（' + fcYen(below.sales - base.sales) + '）' : ''}`)
  if (histSalesAvg != null) L.push(`自店史（対象日除く全${hist.length}日）平均比: ${histSalesAvg > 0 ? (base.sales / histSalesAvg * 100).toFixed(1) : '—'}%、履歴内順位${rankAmongHist}位`)
  if (sameDowAvg != null) L.push(`同じ曜日（${dow != null ? FC_DOW[dow] : '?'}）平均比: ${sameDowAvg > 0 ? (base.sales / sameDowAvg * 100).toFixed(1) : '—'}%`)
  L.push(ev.length
    ? `この日のイベント: ${ev.map((e) => `${e.category ? e.category + ':' : ''}${e.title}（${fcEventAttendanceLabel(e)}）`).filter(Boolean).join('、')}`
    : `この日のイベント: なし`)
  const maxAtt = maxActualEventAttendance(ev)
  if (maxAtt != null && maxAtt > 0) L.push(`この日の最大動員（実測/手入力）: ${maxAtt.toLocaleString('ja-JP')}人（規模ドライバー。同種イベントでも動員差で客数リフトが変わりうる）`)
  if (wx) L.push(`天気: ${String(wx.summary ?? '') || '—'}${(wx.precipitation_mm ?? 0) >= 1 ? '（雨）' : ''}${wx.temp_max != null ? ` 最高${wx.temp_max}℃` : ''}`)
  if (decompLine) L.push(decompLine)
  if (trendLine) L.push(trendLine)
  if (prevDiffLine) L.push(prevDiffLine)
  return L.join('\n')
}

// buildTargetDayFactsの「期間集計」版。開始日〜終了日を合算し、FC内順位・シェア・自店史（期間外）比較・
// イベント/天気の内訳を事前計算する。単日と違い1つのreport_idを持たないため、日次サマリーとは別キャッシュ
// (foodcourt_period_ai_summary、store+start+end)で扱う。
function buildPeriodFacts(
  reports: Array<Record<string, unknown>>,
  baseName: string,
  startDate: string,
  endDate: string,
  events: VenueEvent[],
  weather: WeatherDay[],
): string {
  const inRange = (d: string) => d >= startDate && d <= endDate
  type Row = { name: string; sales: number; guests: number }
  const byDate = new Map<string, Array<{ name: string; sales: number; guests: number | null }>>()
  for (const r of reports || []) {
    const date = fcSalesDate(r)
    if (!inRange(date) || byDate.has(date)) continue
    const raw = Array.isArray((r as { tenants?: unknown }).tenants) ? (r as { tenants?: unknown[] }).tenants as unknown[] : []
    const list: Array<{ name: string; sales: number; guests: number | null }> = []
    for (const t of raw) {
      const o = (t && typeof t === 'object') ? t as Record<string, unknown> : {}
      const name = String(o.name ?? '').trim(); const sales = numOrNull(o.sales)
      if (!name || sales == null) continue
      list.push({ name, sales, guests: numOrNull(o.guests) })
    }
    if (list.length) byDate.set(date, list)
  }
  const dates = Array.from(byDate.keys()).sort()
  if (!dates.length) return ''
  const totals = new Map<string, Row & { display: string }>()
  for (const d of dates) {
    for (const row of byDate.get(d)!) {
      const key = normalizeName(row.name)
      const cur = totals.get(key) || { name: row.name, display: row.name, sales: 0, guests: 0 }
      cur.sales += row.sales
      cur.guests += row.guests ?? 0
      totals.set(key, cur)
    }
  }
  const baseKey = normalizeName(baseName)
  const base = totals.get(baseKey)
  if (!base) return ''
  const list = Array.from(totals.values())
  const bySales = list.slice().sort((a, b) => b.sales - a.sales)
  const salesRank = 1 + bySales.findIndex((x) => x === base)
  const total = list.reduce((s, x) => s + x.sales, 0)
  const share = total > 0 ? base.sales / total * 100 : null
  const kt = base.guests > 0 ? base.sales / base.guests : null
  const fcAvgSales = fcAvg(list.map((x) => x.sales))
  const fcAvgGuests = fcAvg(list.map((x) => x.guests))
  const fcAvgKt = fcAvg(list.filter((x) => x.guests > 0).map((x) => x.sales / x.guests))
  const top = bySales[0]

  // 自店史（期間外の日々）と比較
  const histAll = fcBaseDaily(reports, baseName)
  const outside = histAll.filter((r) => !inRange(r.date))
  const outsideAvg = fcAvg(outside.map((r) => r.sales))
  const periodDailyAvg = fcAvg(dates.map((d) => byDate.get(d)!.find((r) => normalizeName(r.name) === baseKey)?.sales ?? 0))

  // イベント・天気の内訳（期間内の日数ベース）
  const evByDate = new Map<string, VenueEvent[]>()
  for (const e of (events || [])) { const d = String(e.event_date ?? '').slice(0, 10); if (inRange(d)) { if (!evByDate.has(d)) evByDate.set(d, []); evByDate.get(d)!.push(e) } }
  const wByDate = new Map<string, WeatherDay>()
  for (const w of (weather || [])) { const d = String(w.weather_date ?? '').slice(0, 10); if (inRange(d)) wByDate.set(d, w) }
  const daysWithEvent = dates.filter((d) => evByDate.has(d)).length
  const rainyDays = dates.filter((d) => { const w = wByDate.get(d); return w && (w.precipitation_mm ?? 0) >= 1 }).length

  const L: string[] = []
  L.push(`対象期間: ${startDate}〜${endDate}（${dates.length}日分）`)
  L.push(`売上: 合計${fcYen(base.sales)}／日平均${fcYen(periodDailyAvg ?? 0)}（FC平均${fcAvgSales != null ? fcYen(fcAvgSales) : '—'}の${fcAvgSales ? Math.round(base.sales / fcAvgSales * 100) : '—'}%、全${list.length}店中${salesRank}位）、売上シェア${share != null ? share.toFixed(1) : '—'}%`)
  L.push(`客数: 合計${base.guests}人（FC平均${fcAvgGuests != null ? Math.round(fcAvgGuests) + '人' : '—'}）`)
  if (kt != null) L.push(`客単価: ${fcYen(kt)}（FC平均${fcAvgKt != null ? fcYen(fcAvgKt) : '—'}）`)
  if (top && top !== base) L.push(`首位: ${top.name} ${fcYen(top.sales)}（自店比${base.sales > 0 ? (top.sales / base.sales).toFixed(2) : '—'}倍）`)
  if (outsideAvg != null && periodDailyAvg != null) L.push(`この期間外の自店史（${outside.length}日）の日平均比: ${outsideAvg > 0 ? (periodDailyAvg / outsideAvg * 100).toFixed(1) : '—'}%`)
  L.push(`イベントがあった日: ${daysWithEvent}/${dates.length}日、雨の日: ${rainyDays}/${dates.length}日`)
  // 期間内イベントで実測/手入力の動員があるものを規模順に数件（動的ドライバー）
  const periodEvWithAtt: Array<{ e: VenueEvent; mid: number }> = []
  for (const list of evByDate.values()) {
    for (const e of list) {
      const mid = actualEventAttendance(e)
      if (mid != null) periodEvWithAtt.push({ e, mid })
    }
  }
  periodEvWithAtt.sort((a, b) => b.mid - a.mid)
  if (periodEvWithAtt.length) {
    L.push('期間内の動員（実測/手入力）が入ったイベント（規模順・上位）:')
    for (const { e } of periodEvWithAtt.slice(0, 8)) {
      L.push(`・${String(e.event_date).slice(0, 10)} ${e.category}:${e.title} ｜${fcEventAttendanceLabel(e)}`)
    }
  } else if (daysWithEvent > 0) {
    L.push('注: 期間内にイベントはあるが実測/手入力の動員が無い。会場収容の推定は規模比較に使わない。種別のみで語ること。')
  }
  return L.join('\n')
}

// 来客予測モデル(foodcourt-forecast-cron)がバックテストまで済ませてfoodcourt_forecast_factorsに書き出した
// 「フィット済み係数」を読み、AI解説用のテキストにする。予測モデルは曜日×イベント×天気を掛け算で組み合わせ、
// サンプルが少ない係数は1(影響なし)へ自動収縮し、拡張窓バックテストで自己採点(MAPE)までしている＝
// buildConditionPatternStats(単変量の別集計)より一段上の、唯一の学習結果。AI解説・チャット・自動サマリーは
// すべてこの同じ係数を参照することで、数値予測モデルとAIの解説が矛盾しない「1本化された学習」になる。
async function buildForecastFactorsContext(
  supabase: SupabaseClient | null | undefined,
  baseName: string,
): Promise<string> {
  if (!supabase) return ''
  try {
    const { data } = await supabase
      .from('foodcourt_forecast_factors')
      .select('*')
      .eq('tenant_name', baseName)
      .maybeSingle()
    if (!data) return ''
    const row = data as {
      model_version: string; mean_guests: number
      wday_factors: Record<string, number>; wday_counts: Record<string, number>
      event_factors: Record<string, number>; event_counts: Record<string, number>
      weather_factors: Record<string, number>; weather_counts: Record<string, number>
      history_days: number; backtest_days: number; mape_guests: number | null; mape_sales: number | null
      rolling_mape_guests?: number | null; rolling_mape_sales?: number | null
      advanced_stats?: {
        version?: string
        factor_ci?: { wday?: Record<string, { factor: number; lo: number; hi: number; n: number }>; evt?: Record<string, { factor: number; lo: number; hi: number; n: number }>; weather?: Record<string, { factor: number; lo: number; hi: number; n: number }> }
        quantiles?: Record<string, { n: number; min: number; q25: number; med: number; q75: number; max: number }>
        interactions?: Array<{ label: string; n: number; actual: number; expected: number; ratio: number }>
        residual_bias?: Array<{ label: string; n: number; bias: number }>
        effect_sizes?: Array<{ label: string; d: number; n1: number; n2: number; magnitude: string }>
      } | null
    }
    const confidence = (n: number) => n >= 6 ? '再現性あり' : n >= 3 ? '参考程度(やや少数)' : 'サンプル僅少(参考不可)'
    const drivers: Array<{ label: string; factor: number; n: number }> = []
    const factorLine = (label: string, factor: number, n: number) => {
      const f = Number(factor)
      const count = Math.max(0, Math.trunc(Number(n) || 0))
      if (Number.isFinite(f) && count >= 3 && Math.abs(f - 1) >= 0.04) drivers.push({ label, factor: f, n: count })
      return `${label}: ×${Number.isFinite(f) ? f.toFixed(2) : '—'}（n=${count}）［${confidence(count)}］`
    }
    const wdayLines = [1, 2, 3, 4, 5, 6, 7].map((d) => {
      const f = row.wday_factors?.[String(d)]; const n = row.wday_counts?.[String(d)] ?? 0
      return f != null ? factorLine(`${FC_DOW[d % 7]}曜日`, f, n) : null
    }).filter((x): x is string => !!x)
    const EVT_LABEL: Record<string, string> = {
      soccer_pv: 'サッカーPV', japan: '日本戦PV(サッカー以外)', pro: 'プロ野球(ドーム本体)',
      live: 'ライブ(ドーム本体)', dome: 'ドーム本体(アマ野球等)', sports: '世界スポーツ放映',
      hall: '小ホールのみ(カナデビア等)', none: 'イベント無し',
    }
    const evtLines = Object.keys(EVT_LABEL).map((k) => {
      const f = row.event_factors?.[k]; const n = row.event_counts?.[k] ?? 0
      return f != null ? factorLine(EVT_LABEL[k], f, n) : null
    }).filter((x): x is string => !!x)
    const wxLines = ['rainy', 'dry'].map((k) => {
      const f = row.weather_factors?.[k]; const n = row.weather_counts?.[k] ?? 0
      return f != null ? factorLine(k === 'rainy' ? '雨' : '雨でない', f, n) : null
    }).filter((x): x is string => !!x)
    const recentMape = row.rolling_mape_guests != null || row.rolling_mape_sales != null
      ? `、直近14日: 客数±${row.rolling_mape_guests != null ? Math.round(row.rolling_mape_guests * 100) : '—'}%／売上±${row.rolling_mape_sales != null ? Math.round(row.rolling_mape_sales * 100) : '—'}%`
      : ''
    const mapeLine = (row.mape_guests != null || row.mape_sales != null)
      ? `自己採点(バックテスト${row.backtest_days}日/履歴${row.history_days}日): 全期間 客数誤差±${row.mape_guests != null ? Math.round(row.mape_guests * 100) : '—'}%／売上誤差±${row.mape_sales != null ? Math.round(row.mape_sales * 100) : '—'}%${recentMape}`
      : `履歴${row.history_days}日・バックテスト${row.backtest_days}日`
    const mapeGuests = row.rolling_mape_guests != null
      ? Number(row.rolling_mape_guests)
      : (row.mape_guests != null ? Number(row.mape_guests) : null)
    const reliability = row.backtest_days >= 14 && mapeGuests != null && mapeGuests <= 0.25
      ? 'モデル信頼度: 中〜高（運営判断の参考に使える）'
      : row.backtest_days >= 7 && mapeGuests != null && mapeGuests <= 0.4
        ? 'モデル信頼度: 中（方向感の参考。断定は避ける）'
        : 'モデル信頼度: 低〜蓄積中（仮説出し中心。断定不可）'
    // 学習の進化トラッキング: foodcourt_forecast_history から誤差の推移を読み、
    // 「モデルが実際に賢くなっているか」の時系列証拠をAIに渡す（7日以上離れた2点で比較）。
    let evolutionLine = ''
    try {
      const { data: histRows } = await supabase
        .from('foodcourt_forecast_history')
        .select('log_date, history_days, mape_guests, rolling_mape_guests')
        .eq('tenant_name', baseName)
        .order('log_date', { ascending: true })
      const hs = (Array.isArray(histRows) ? histRows : [])
        .map((r) => ({
          date: String((r as { log_date?: unknown }).log_date ?? '').slice(0, 10),
          days: Number((r as { history_days?: unknown }).history_days ?? 0),
          mape: (r as { rolling_mape_guests?: unknown }).rolling_mape_guests != null
            ? Number((r as { rolling_mape_guests?: unknown }).rolling_mape_guests)
            : ((r as { mape_guests?: unknown }).mape_guests != null ? Number((r as { mape_guests?: unknown }).mape_guests) : null),
        }))
        .filter((r) => r.date && r.mape != null)
      if (hs.length >= 2) {
        const latest = hs[hs.length - 1]
        const past = hs.find((r) => fcDaysBetween(r.date, latest.date) >= 7) // 最古側から7日以上離れた点
        if (past && past.date !== latest.date && past.mape != null && latest.mape != null) {
          const pPct = Math.round(past.mape * 100)
          const lPct = Math.round(latest.mape * 100)
          const diff = pPct - lPct
          const trend = diff >= 3
            ? `${diff}pt改善＝データ蓄積でモデルは着実に賢くなっている`
            : diff <= -3
              ? `${Math.abs(diff)}pt悪化＝直近に予測しにくい日が続いた可能性。係数の断定は普段より控えること`
              : 'ほぼ横ばい＝改善はデータ蓄積待ち'
          evolutionLine = `[学習の進化(自動追跡)] ${past.date}(履歴${past.days}日): 客数誤差±${pPct}% → ${latest.date}(履歴${latest.days}日): ±${lPct}%（${trend}）`
        }
      }
    } catch { /* 履歴テーブル未作成でも本文は成立させる */ }
    const L: string[] = [
      `来客予測モデル(${row.model_version})の学習結果。ベース客数(全体平均)${Math.round(row.mean_guests)}人に、以下の係数を掛け合わせて予測している。係数はサンプル数が少ないほど1(影響なし)へ自動収縮済み。`,
      mapeLine,
      reliability,
    ]
    if (evolutionLine) L.push(evolutionLine)
    if (wdayLines.length) L.push('[曜日係数]\n' + wdayLines.join('\n'))
    if (evtLines.length) L.push('[イベント種別係数]\n' + evtLines.join('\n'))
    if (wxLines.length) L.push('[天気係数]\n' + wxLines.join('\n'))
    const driverLines = drivers
      .sort((a, b) => Math.abs(b.factor - 1) - Math.abs(a.factor - 1))
      .slice(0, 8)
      .map((d) => `${d.label}: ${d.factor >= 1 ? '押し上げ' : '押し下げ'}候補 ×${d.factor.toFixed(2)}（n=${d.n}）`)
    if (driverLines.length) L.push('[強く効いている候補]\n' + driverLines.join('\n'))

    // --- 統計拡張(stats-ext-v1): 係数を「どこまで信じてよいか」の判断材料 ---
    const adv = row.advanced_stats
    if (adv && typeof adv === 'object') {
      const QK_LABEL: Record<string, string> = {
        'evt:soccer_pv': 'サッカーPVの日', 'evt:japan': '日本戦PVの日', 'evt:pro': 'プロ野球の日',
        'evt:live': 'ライブの日', 'evt:dome': 'ドーム本体(その他)の日', 'evt:sports': '世界スポーツ放映の日',
        'evt:hall': '小ホールのみの日', 'evt:none': 'イベント無しの日',
        weekend: '土日', weekday: '平日', rainy: '雨の日', dry: '雨でない日',
      }
      // ① 95%信頼区間: CIが1をまたぐ係数は「偶然の可能性を否定できない」と明示
      const ciLines: string[] = []
      const pushCi = (label: string, e?: { factor: number; lo: number; hi: number; n: number }) => {
        if (!e) return
        const crossesOne = e.lo <= 1 && e.hi >= 1
        ciLines.push(`${label}: 生係数×${e.factor.toFixed(2)}（95%CI: ${e.lo.toFixed(2)}〜${e.hi.toFixed(2)}、n=${e.n}）${crossesOne ? '←CIが1をまたぐ＝効果は偶然の可能性を否定できない' : '←CIが1を含まない＝統計的に意味のある差'}`)
      }
      const EVT_CI_LABEL: Record<string, string> = {
        soccer_pv: 'サッカーPV', japan: '日本戦PV', pro: 'プロ野球', live: 'ライブ',
        dome: 'ドーム本体(その他)', sports: '世界スポーツ放映', hall: '小ホールのみ', none: 'イベント無し',
      }
      for (const k of Object.keys(EVT_CI_LABEL)) pushCi(EVT_CI_LABEL[k], adv.factor_ci?.evt?.[k])
      pushCi('雨', adv.factor_ci?.weather?.rainy)
      pushCi('雨でない', adv.factor_ci?.weather?.dry)
      if (ciLines.length) {
        L.push('[係数の95%信頼区間（収縮前の生係数）]\n※上の係数表は少数サンプルを1へ収縮した予測用の値。こちらは収縮前の生の値と不確実性の幅。\n' + ciLines.join('\n'))
      }
      // ② 条件別の分布: 「同じ条件でも最悪ここまで低い日がある」を平均と併せて渡す
      const qLines = Object.entries(adv.quantiles ?? {})
        .map(([k, q]) => `${QK_LABEL[k] ?? k}: 中央値${q.med}人［四分位: ${q.q25}〜${q.q75}人／実績range: ${q.min}〜${q.max}人／n=${q.n}］`)
      if (qLines.length) {
        L.push('[条件別の客数分布]\n※平均だけで判断しない。最小値〜最大値の幅が広い条件は「ブレやすい条件」として扱う。\n' + qLines.join('\n'))
      }
      // ③ 交互作用: 独立仮定（係数の掛け算）が実測とずれる組み合わせ
      const itLines = (adv.interactions ?? []).map((it) => {
        const gap = Math.round((it.ratio - 1) * 100)
        const note = Math.abs(gap) < 10 ? 'ほぼ独立（掛け算予測が妥当）' : gap > 0 ? `実測が理論値より+${gap}%（相乗効果あり）` : `実測が理論値より${gap}%（重なっても伸びは頭打ち）`
        return `${it.label}: 実測×${it.actual.toFixed(2)} vs 独立仮定×${it.expected.toFixed(2)}（n=${it.n}）→ ${note}`
      })
      if (itLines.length) {
        L.push('[条件の組み合わせ（交互作用）]\n※予測モデルは「係数の掛け算＝条件は独立」を仮定。実測とのズレが大きい組み合わせは掛け算どおりに伸びない。\n' + itLines.join('\n'))
      }
      // ④ 残差バイアス: モデルが系統的に外す条件（自己申告の弱点）
      const rbLines = (adv.residual_bias ?? []).map((rb) => {
        const pct = Math.round(rb.bias * 100)
        return `${rb.label}: 予測が実績より平均${pct > 0 ? '+' : ''}${pct}%${pct > 0 ? '（過大評価の傾向）' : '（過小評価の傾向）'}（n=${rb.n}）`
      })
      if (rbLines.length) {
        L.push('[モデルの弱点（バックテスト残差の偏り）]\n※この条件の日の予測は、記載の方向に割り引いて解釈すること。\n' + rbLines.join('\n'))
      }
      // ⑤ 効果量: どの要因が「本当に」効いているかの横比較
      const esLines = (adv.effect_sizes ?? []).slice(0, 8).map((es) =>
        `${es.label}: d=${es.d.toFixed(2)}（効果量: ${es.magnitude}、n=${es.n1}/${es.n2}）`
      )
      if (esLines.length) {
        L.push('[効果量（Cohen\'s d）による要因の影響力ランキング]\n※dの絶対値: 0.2未満=ごく小/0.2=小/0.5=中/0.8=大/1.2以上=極めて大。倍率(%)の見かけの大きさではなく、この値で「どの要因が確かに効いているか」を比較する。\n' + esLines.join('\n'))
      }
    }
    return L.join('\n\n')
  } catch (e) {
    console.error('buildForecastFactorsContext failed:', e instanceof Error ? e.message : String(e))
    return ''
  }
}

// 「曜日」「東京ドームのイベント種別」「天気」ごとに、実績の平均・サンプル数・ばらつき(CV)をコードで集計する。
// 数値予測モデル(foodcourt-forecast-cron)の fit() と同じ発想＝AIには数字を作らせず、確度(サンプル数)つきの
// 客観的事実だけを渡す。LLMが自由文で記憶を書き換える方式(蓄積知見)と違い、毎回`reports`から計算し直すため
// 状態を持たず、データが増えるほど自動的に確度が上がる（＝数値予測モデルと同じ意味でのMAPE的な自己改善）。
// AI側の役割は「複数の条件が同時に成立する日にどう組み合わさるか」を多角的に判断すること（コードは単変量集計のみ）。
// ※foodcourt_forecast_factors(buildForecastFactorsContext)が無い/未生成のときのフォールバックとしてのみ使う。
function buildConditionPatternStats(
  reports: Array<Record<string, unknown>>,
  baseName: string,
  events: VenueEvent[],
  weather: WeatherDay[],
): string {
  const daily = fcBaseDaily(reports, baseName).filter((r) => r.guests != null)
  if (daily.length < 5) return ''
  const overallAvg = fcAvg(daily.map((r) => r.sales)) ?? 0
  if (overallAvg <= 0) return ''
  const evByDate = new Map<string, VenueEvent[]>()
  for (const e of (events || [])) { const d = String(e.event_date ?? '').slice(0, 10); if (/^\d{4}-\d{2}-\d{2}$/.test(d)) { if (!evByDate.has(d)) evByDate.set(d, []); evByDate.get(d)!.push(e) } }
  const wByDate = new Map<string, WeatherDay>()
  for (const w of (weather || [])) { const d = String(w.weather_date ?? '').slice(0, 10); if (/^\d{4}-\d{2}-\d{2}$/.test(d)) wByDate.set(d, w) }
  const confidence = (n: number) => n >= 6 ? '再現性あり' : n >= 3 ? '参考程度(やや少数)' : 'サンプル僅少(参考不可)'
  const line = (label: string, xs: number[]): string | null => {
    if (xs.length < 2) return null
    const m = fcAvg(xs) ?? 0
    const sd = fcStdev(xs)
    const cv = (sd != null && m > 0) ? sd / m : null
    return `${label}: n=${xs.length} 平均${fcYen(m)}（全体比${fcPct((m / overallAvg - 1) * 100)}）ばらつきCV=${cv != null ? Math.round(cv * 100) + '%' : '—'}［${confidence(xs.length)}］`
  }
  const L: string[] = ['※n=サンプル数(3未満は参考にしない)。CV(変動係数)が大きいほど条件だけでは説明できないばらつきがある。']
  const wLines: string[] = []
  for (let d = 0; d <= 6; d++) {
    const ln = line(`${FC_DOW[d]}曜日`, daily.filter((r) => fcDow(r.date) === d).map((r) => r.sales))
    if (ln) wLines.push(ln)
  }
  if (wLines.length) L.push('[曜日別]\n' + wLines.join('\n'))
  const catBuckets = new Map<string, number[]>()
  const noneBucket: number[] = []
  for (const r of daily) {
    const evs = evByDate.get(r.date) || []
    if (!evs.length) { noneBucket.push(r.sales); continue }
    for (const c of new Set(evs.map((e) => e.category || '不明'))) { if (!catBuckets.has(c)) catBuckets.set(c, []); catBuckets.get(c)!.push(r.sales) }
  }
  const evLines: string[] = []
  for (const [cat, xs] of catBuckets) { const ln = line(cat, xs); if (ln) evLines.push(ln) }
  const noneLn = line('イベント無し', noneBucket)
  if (noneLn) evLines.push(noneLn)
  if (evLines.length) L.push('[イベント種別]\n' + evLines.sort().join('\n'))
  const rain = daily.filter((r) => { const w = wByDate.get(r.date); return w && (w.precipitation_mm ?? 0) >= 1 }).map((r) => r.sales)
  const dry = daily.filter((r) => { const w = wByDate.get(r.date); return w && (w.precipitation_mm ?? 0) < 1 }).map((r) => r.sales)
  const wxLines = [line('雨', rain), line('雨でない', dry)].filter((x): x is string => x != null)
  if (wxLines.length) L.push('[天気]\n' + wxLines.join('\n'))
  return L.length > 1 ? L.join('\n\n') : ''
}

const NIPPOU_ACTION_CAT_LABEL: Record<string, string> = {
  promotion: '販促・集客', menu: 'メニュー提案', service: '接客・サービス',
  environment: '環境・設備', staff: 'スタッフ', other: 'その他',
}

function nippouActionTexts(actions: unknown[]): string[] {
  return actions.map((a) => {
    const ao = (a && typeof a === 'object') ? a as Record<string, unknown> : {}
    const cat = NIPPOU_ACTION_CAT_LABEL[String(ao.cat ?? '')] || String(ao.cat ?? '')
    const text = String(ao.text ?? '').trim()
    return text ? `[${cat}] ${text}` : null
  }).filter((x): x is string => !!x)
}

// 日報(foodcourt_daily_logs)をテキストブロックに変換してAIのコンテキストに渡す。
// 担当者が現場で記録した施策・客数/売上の主観的評価・課題を数値実績と照合させる。
// Q&A / 日次・期間サマリー / 週次レポートから共通利用する。
export function buildDailyLogsContext(logs: Array<Record<string, unknown>>): string {
  if (!Array.isArray(logs) || logs.length === 0) return ''
  const lines: string[] = []
  for (const log of logs.slice(0, 60)) {
    const date = String((log as { log_date?: unknown }).log_date ?? '').slice(0, 10)
    if (!date) continue
    const handler = String((log as { handler?: unknown }).handler ?? '').trim()
    const actions = Array.isArray((log as { actions?: unknown }).actions) ? (log as { actions?: unknown[] }).actions as unknown[] : []
    const guestImpact = String((log as { guest_impact?: unknown }).guest_impact ?? '').trim()
    const salesImpact = String((log as { sales_impact?: unknown }).sales_impact ?? '').trim()
    const weatherNote = String((log as { weather_note?: unknown }).weather_note ?? '').trim()
    const eventNote = String((log as { event_note?: unknown }).event_note ?? '').trim()
    const issues = String((log as { issues?: unknown }).issues ?? '').trim()
    const nextActions = String((log as { next_actions?: unknown }).next_actions ?? '').trim()
    const memo = String((log as { memo?: unknown }).memo ?? '').trim()
    const attendanceRaw = (log as { daily_attendance?: unknown }).daily_attendance
    const attendance = attendanceRaw != null ? Number(attendanceRaw) : null
    const parts: string[] = [`▶ ${date}${handler ? `（担当:${handler}）` : ''}`]
    if (attendance != null && Number.isFinite(attendance)) parts.push(`  動員数: ${attendance.toLocaleString()}人`)
    if (weatherNote) parts.push(`  天気: ${weatherNote}`)
    if (eventNote) parts.push(`  イベント: ${eventNote}`)
    const actionTexts = nippouActionTexts(actions)
    if (actionTexts.length) parts.push(`  実施施策: ${actionTexts.join(' ／ ')}`)
    if (guestImpact) parts.push(`  客数への影響（担当者評価）: ${guestImpact}`)
    if (salesImpact) parts.push(`  売上への影響（担当者評価）: ${salesImpact}`)
    if (issues) parts.push(`  課題・問題点: ${issues}`)
    if (nextActions) parts.push(`  申し送り: ${nextActions}`)
    if (memo) parts.push(`  メモ: ${memo.slice(0, 400)}`)
    lines.push(parts.join('\n'))
  }
  return lines.join('\n\n')
}

/**
 * 日報の「こんなことをしてみた」施策と、その日の売上・客数実績をコード側で突き合わせた対照表。
 * AIに数字を作らせず、前日比・同曜日平均比・全日平均比を材料として渡す（普段の売上AI分析の核心リンク）。
 */
export function buildDailyLogImpactContext(
  logs: Array<Record<string, unknown>>,
  reports: Array<Record<string, unknown>>,
  baseName: string,
  events: VenueEvent[] = [],
): string {
  if (!Array.isArray(logs) || !logs.length) return ''
  const daily = fcBaseDaily(reports, baseName)
  if (!daily.length) {
    return '【日報×実績 効果対照】実績（テナント一覧）がまだ無く、日報施策の数値照合ができません。日報の記述のみを仮説材料として扱ってください。'
  }
  const byDate = new Map(daily.map((d) => [d.date, d]))
  const sortedDates = daily.map((d) => d.date).sort()
  const salesAll = daily.map((d) => d.sales)
  const guestsAll = daily.map((d) => d.guests).filter((g): g is number => g != null && g > 0)
  const avgSales = fcAvg(salesAll)
  const avgGuests = fcAvg(guestsAll)
  const eventsByDate = new Map<string, VenueEvent[]>()
  for (const e of events || []) {
    const d = String(e.event_date ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue
    if (!eventsByDate.has(d)) eventsByDate.set(d, [])
    eventsByDate.get(d)!.push(e)
  }
  const rel = (cur: number, base: number | null | undefined) => {
    if (base == null || !isFinite(base) || base === 0) return '—'
    return fcPct((cur / base - 1) * 100)
  }
  const lines: string[] = [
    '【日報×実績 効果対照（コード計算・数字は捏造禁止）】',
    '各日報の「実施施策」について、同日の基準店実績を前日・同曜日平均・全日平均と比較した。',
    '動的要因として、同日のイベント名・動員予想（手入力）・日報の動員数も併記する。',
    '担当者評価は主観。実績比と整合すれば「データと一致」、乖離すれば「主観と実績が不一致」と明記すること。',
    'イベント規模（動員）・天気の交絡を切り分け候補として挙げ、施策単独の因果は断定せず「仮説」とすること。',
  ]
  let n = 0
  for (const log of logs.slice(0, 40)) {
    const date = String((log as { log_date?: unknown }).log_date ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const actions = Array.isArray((log as { actions?: unknown }).actions) ? (log as { actions?: unknown[] }).actions as unknown[] : []
    const actionTexts = nippouActionTexts(actions)
    const guestImpact = String((log as { guest_impact?: unknown }).guest_impact ?? '').trim()
    const salesImpact = String((log as { sales_impact?: unknown }).sales_impact ?? '').trim()
    const issues = String((log as { issues?: unknown }).issues ?? '').trim()
    const memo = String((log as { memo?: unknown }).memo ?? '').trim()
    const logAttRaw = (log as { daily_attendance?: unknown }).daily_attendance
    const logAtt = logAttRaw != null ? Number(logAttRaw) : null
    // 施策も考察も無い日はスキップ（空日報でノイズを増やさない）
    if (!actionTexts.length && !guestImpact && !salesImpact && !issues && !memo && !(logAtt != null && Number.isFinite(logAtt))) continue
    n += 1
    const row = byDate.get(date)
    const dow = fcDow(date)
    const dowLabel = dow != null ? FC_DOW[dow] : '?'
    const dayEvents = eventsByDate.get(date) || []
    const parts: string[] = [`▶ ${date}（${dowLabel}）`]
    if (actionTexts.length) parts.push(`  現場が試したこと: ${actionTexts.join(' ／ ')}`)
    else parts.push('  現場が試したこと: （施策カテゴリの記載なし・評価/メモのみ）')
    if (guestImpact) parts.push(`  担当者の客数感: ${guestImpact}`)
    if (salesImpact) parts.push(`  担当者の売上感: ${salesImpact}`)
    if (issues) parts.push(`  課題: ${issues.slice(0, 200)}`)
    if (memo) parts.push(`  メモ: ${memo.slice(0, 200)}`)
    // 動的要因: 日報動員 + イベント動員予想
    if (logAtt != null && Number.isFinite(logAtt)) parts.push(`  日報の動員数: ${Math.round(logAtt).toLocaleString('ja-JP')}人`)
    if (dayEvents.length) {
      parts.push(`  同日イベント: ${fcFormatEventsForDay(dayEvents)}`)
      const maxEvAtt = maxActualEventAttendance(dayEvents)
      if (maxEvAtt != null && maxEvAtt > 0) parts.push(`  イベント最大動員（実測/手入力）: ${maxEvAtt.toLocaleString('ja-JP')}人（規模ドライバー）`)
    } else {
      parts.push('  同日イベント: なし')
    }
    if (!row) {
      parts.push('  実績: （この日のテナント一覧実績なし＝数値照合不可）')
      lines.push(parts.join('\n'))
      continue
    }
    const idx = sortedDates.indexOf(date)
    const prevDate = idx > 0 ? sortedDates[idx - 1] : null
    const prev = prevDate ? byDate.get(prevDate) : null
    const sameDow = daily.filter((d) => d.date !== date && fcDow(d.date) === dow)
    const sameDowSales = fcAvg(sameDow.map((d) => d.sales))
    const sameDowGuests = fcAvg(sameDow.map((d) => d.guests).filter((g): g is number => g != null && g > 0))
    const kt = (row.guests && row.guests > 0) ? Math.round(row.sales / row.guests) : null
    parts.push(
      `  実績: 売上${fcYen(row.sales)}` +
      (row.guests != null ? ` / 客数${Math.round(row.guests)}人` : ' / 客数—') +
      (kt != null ? ` / 客単価${fcYen(kt)}` : ''),
    )
    if (prev) {
      parts.push(
        `  前日(${prevDate})比: 売上${rel(row.sales, prev.sales)}` +
        (row.guests != null && prev.guests != null ? ` / 客数${rel(row.guests, prev.guests)}` : ''),
      )
    } else {
      parts.push('  前日比: （直前営業日データなし）')
    }
    parts.push(
      `  同曜日平均比(n=${sameDow.length}): 売上${rel(row.sales, sameDowSales)}` +
      (row.guests != null ? ` / 客数${rel(row.guests, sameDowGuests)}` : ''),
    )
    parts.push(
      `  全日平均比: 売上${rel(row.sales, avgSales)}` +
      (row.guests != null ? ` / 客数${rel(row.guests, avgGuests)}` : ''),
    )
    // 粗い方向性ヒント（AIの断定ではなく材料）
    const salesVsPrev = prev && prev.sales > 0 ? (row.sales / prev.sales - 1) : null
    const guestsVsPrev = prev && prev.guests != null && prev.guests > 0 && row.guests != null
      ? (row.guests / prev.guests - 1) : null
    if (salesVsPrev != null || guestsVsPrev != null) {
      const gDir = guestsVsPrev == null ? '客数—' : (guestsVsPrev >= 0.03 ? '客数↑' : guestsVsPrev <= -0.03 ? '客数↓' : '客数→')
      const sDir = salesVsPrev == null ? '売上—' : (salesVsPrev >= 0.03 ? '売上↑' : salesVsPrev <= -0.03 ? '売上↓' : '売上→')
      parts.push(`  コード側ヒント(前日比±3%閾値): ${gDir} / ${sDir} ※因果断定用ではない`)
    }
    lines.push(parts.join('\n'))
  }
  if (n === 0) return ''
  lines.push(`（対照 ${n} 件。施策あり日のみ。分析時は各「現場が試したこと」を引用し、実績比と担当者評価の整合を必ず述べること）`)
  return lines.join('\n')
}

/** 普段の売上AI分析で日報を素材にする共通プロンプト（統合AI・専門AIに共有） */
export function foodCourtNippouPromptRules(baseName: string): string {
  return [
    `【日報リンク分析・必須】現場日報がある場合、売上分析は数値だけで終わらせない。`,
    `(N1) 日報の「実施施策／こんなことをしてみた」記述を具体的に引用する（抽象化して消さない）。`,
    `(N2) 同日の実績（売上・客数・客単価）と、前日比・同曜日平均比・全日平均比（「日報×実績 効果対照」ブロック）を必ず使い、施策がどの程度の実績につながったかを述べる。`,
    `(N3) 担当者の客数/売上評価は主観。実績と一致→「データと一致」、乖離→「主観と実績が不一致」と明記し、イベント・天気の交絡を疑う。`,
    `(N4) 因果は原則「仮説」。効果があった/薄かったの判定は「支持／不支持／条件付き」＋効果量（%や差分）で書く。`,
    `(N5) 日報が無い日は施策を捏造しない。施策あり日があれば、総評や評価見出しで必ず触れる。`,
    `(N6) 次の一手は、日報の成功施策の継続/強化、または失敗・課題の改善に接続する（${baseName}向けに具体化）。`,
    `【動的要因・必須】固定の曜日パターンだけで終わらせない。`,
    `(D1) イベントは「種別」だけでなく「タイトル」と「動員数（人数）」を材料にする。動員が大きい日は需要の上限が上がりやすいが、当店捕捉率は別問題。`,
    `(D2) 同種イベント（例: プロ野球）でも動員が違う日は、客数リフトが異なりうる前提で比較する。動員データが無い日は規模を断定しない。`,
    `(D2b) 動員数には3種類ある: 実測（プロ野球はNPB系サイトから試合終了後に自動取得＝確度高）／手入力（担当者の予想）／推定（会場収容人数からの機械算出＝確度低）。規模帯・最大動員・順位などの数値比較は実測/手入力だけを使う。「動員推定」は規模感の参考ラベルであり、人数として集計・断定しない。`,
    `(D3) 日報の動員数とイベント動員（実測/手入力）が両方ある日は、規模感の材料として両方を引用し、客数実績との関係を述べる。推定だけの日は人数を比較材料にしない。`,
    `(D4) 天気（雨・気温）・曜日・イベント規模・現場施策を同時に並べ、「何が主因候補か」を仮説として整理する。`,
  ].join('\n')
}

/** 日報ブロック一式（原文＋効果対照）を組み立てる */
export function buildFoodCourtNippouBlocks(
  logs: Array<Record<string, unknown>>,
  reports: Array<Record<string, unknown>>,
  baseName: string,
  events: VenueEvent[] = [],
): { logsCtx: string; impactCtx: string; block: string; hasNippou: boolean } {
  const logsCtx = buildDailyLogsContext(logs)
  const impactCtx = buildDailyLogImpactContext(logs, reports, baseName, events)
  const hasNippou = !!(logsCtx || impactCtx)
  const parts: string[] = []
  if (logsCtx) {
    parts.push(`# 現場日報・施策記録（原文：担当者が「試したこと」・評価・課題・動員数）\n${logsCtx}`)
  } else {
    parts.push('# 現場日報・施策記録\n(日報データなし)')
  }
  if (impactCtx) {
    parts.push(`# 日報×実績 効果対照（コード計算・施策・動員・イベント規模と数字のリンク）\n${impactCtx}`)
  }
  return { logsCtx, impactCtx, block: parts.join('\n\n'), hasNippou }
}

// 蓄積されたフードコート日次データを根拠に、ユーザーの質問へ回答する（Groqテキスト／安価）。
// events（東京ドームのイベント日程）・weather（日次天気）を渡すと、客数増減との相関も踏まえて回答する。
// 競合店プロファイル（業態・価格帯・飲み/食事傾向）も注入し、業態文脈を踏まえた分析にする。
export type FoodCourtJournalAnalysisScope = {
  requested_ranges?: Array<{ from: string; to: string }>
  expected_day_count?: number
  covered_day_count?: number
  missing_date_count?: number
  missing_dates?: string[]
  missing_dates_truncated?: boolean
  coverage_status?: "complete" | "partial"
  sales_basis?: string
}

export async function answerFoodCourtQuestion(
  reports: Array<Record<string, unknown>>,
  baseName: string,
  question: string,
  groqApiKey: string,
  events: VenueEvent[] = [],
  weather: WeatherDay[] = [],
  supabase?: SupabaseClient | null,
  storeKey?: string,
  history: Array<{ role: string; content: string }> = [],
  forecast: ForecastRow[] = [],
  viewingDate?: string | null,
  dailyLogs: Array<Record<string, unknown>> = [],
  journalScope: FoodCourtJournalAnalysisScope | null = null,
): Promise<{ answer: string | null; loopScore: number | null; loopCount: number; xTrendBrief?: string | null }> {
  if (!groqApiKey) return { answer: null, loopScore: null, loopCount: 0 }
  const deadlineAt = fcRequestDeadlineAt()
  const q = String(question ?? '').trim().slice(0, 500)
  if (!q) return { answer: null, loopScore: null, loopCount: 0 }
  canonFoodcourtReports(reports) // OCR誤読の店名を安定codeで正規化し、11店として一貫分析する
  const blocks: string[] = []
  for (const r of (reports || []).slice(0, 45)) {
    const rawTenants = Array.isArray((r as { tenants?: unknown }).tenants) ? (r as { tenants?: unknown[] }).tenants as unknown[] : []
    const rows: string[] = []
    for (const t of rawTenants) {
      const o = (t && typeof t === 'object') ? t as Record<string, unknown> : {}
      const name = String(o.name ?? '').trim()
      const sales = numOrNull(o.sales)
      if (!name || sales == null) continue
      const guests = numOrNull(o.guests)
      const kt = (guests && guests > 0) ? Math.round(sales / guests) : null
      const mark = normalizeName(name) === normalizeName(baseName) ? '★基準' : ''
      rows.push(`${name}${mark}\t売上${sales}\t客数${guests ?? '-'}\t客単価${kt ?? '-'}`)
    }
    if (rows.length) blocks.push(`■${fcDayLabel(r)}\n${rows.join('\n')}`)
  }
  if (!blocks.length) return { answer: 'まだ分析できるデータがありません。フードコートのテナント一覧画像を送ると蓄積されます。', loopScore: null, loopCount: 0 }
  const journalScopeBlock = journalScope
    ? [
      "【Journal連携の対象範囲・サーバー確定】",
      `対象範囲: ${(journalScope.requested_ranges || []).map((range) => `${range.from}〜${range.to}`).join(" / ") || "未指定"}`,
      `対象日数: ${Number(journalScope.expected_day_count || 0)}日 / フードコート日報あり: ${Number(journalScope.covered_day_count || 0)}日 / 欠損: ${Number(journalScope.missing_date_count || 0)}日`,
      `欠損日: ${(journalScope.missing_dates || []).join("・") || "なし"}${journalScope.missing_dates_truncated ? "（続きあり）" : ""}`,
      "フードコート側の売上はテナント比較日報の税抜値。欠損日がある場合、合計を対象期間全体の月間売上と呼ばない。",
      "Journal側の税込／税抜店舗売上とは税区分と日数を揃えない限り直接比較しない。売上差があっても、同期間のイベント・競合・順位・客層の事実は独立した背景根拠として分析する。",
    ].join("\n")
    : ""
  const data = [journalScopeBlock, blocks.reverse().join('\n\n')].filter(Boolean).join('\n\n')
  const journalScopeRule = journalScope
    ? "【Journal連携範囲】日報欠損日は0円扱いせず、部分日報の合計を対象期間全体の売上と呼ばない。Journalとの金額差だけを理由に、イベント・競合・順位の独立した背景事実まで捨てない。"
    : ""
  const insights = buildBaseInsights(reports, baseName)
  const eventCorr = buildEventCorrelation(reports, baseName, events)
  const eventList = buildEventListText(events)
  const weatherCorr = buildWeatherCorrelation(reports, baseName, weather)
  const competitors = buildCompetitorContext(reports, baseName)
  const decomposition = buildContributionDecomposition(reports, baseName) // 売上=客数×客単価 の要因分解
  const storeCorr = buildStoreCorrelation(reports, baseName)               // 店舗間相関（カニバリ/アンカー）
  const anomalies = buildAnomalyDays(reports, baseName, events, weather)   // 異常値Zスコア
  const forecastCtx = buildForecastContext(forecast)                      // 学習型モデルの予測＋自己採点
  const primary = resolveGroqTextModel(Deno.env.get('FOODCOURT_GROQ_MODEL'), GROQ_TEXT_FOODCOURT_MODEL)
  const fallbackModel = GROQ_TEXT_FALLBACK_MODEL
  // 画面に表示中の単日レポートの対象日。これを渡さないと、AIは何十日分もの生データのどの日の話かを
  // 画面と無関係に(会話文脈やイベントの派手さだけで)決めてしまい、時間軸がずれた回答をする原因になる。
  const viewingBlock = viewingDate
    ? `【画面表示中の対象日・最優先で厳守】ユーザーは今、対象日=${viewingDate}のレポート画面を見ている。質問に別の日付が明示されていない限り、これが質問の対象日である。他の日のデータと混同しないこと。`
    : ''
  // 曜日/イベント種別/天気の傾向は、来客予測モデルの学習係数(自己採点つき)を最優先で使う（未生成時のみ
  // 単変量の簡易集計にフォールバック）。数値予測とAI解説が同じ学習結果を参照し矛盾なく1本化する。
  const forecastFactorsCtx = await buildForecastFactorsContext(supabase, baseName)
  const patternStats = forecastFactorsCtx || buildConditionPatternStats(reports, baseName, events, weather)
  const patternBlock = patternStats
    ? `# 統計的パターン（${forecastFactorsCtx ? '来客予測モデルの学習係数・自己採点つき' : '条件別集計・コード計算・サンプル数と確度つき'}）\n${patternStats}`
    : ''
  // 現場日報: 原文＋コード側「施策×実績」効果対照（普段の売上AI分析と日報をリンク）
  const nippou = buildFoodCourtNippouBlocks(dailyLogs, reports, baseName, events)
  const nippouRules = foodCourtNippouPromptRules(baseName)

  // --- 専門AI 2体を並列実行し、統合AIに渡す「分析メモ」を作らせる（同一プロンプト過積載を避けるための役割分担） ---
  const quantSystem = [
    `あなたは「${baseName}」（東京ドーム内フードホール「FOOD STADIUM TOKYO」の1店舗）専属の、他店舗比較と過去実績データの分析専門家です。`,
    journalScopeRule,
    `担当は「他店舗との関係」と「過去の実績データ」および「日報施策の数値効果」のみ。イベント・天気の深掘りは別担当。`,
    `【厳守】表の値をそのまま言い換えるだけの回答は禁止。数字は根拠として引用し、必ず「だから何を意味するか」まで述べる。`,
    `(1) 競合プロファイル（各店の業態）を使い、客単価・客数の水準がその業態から見て妥当か想定外かを判定する。`,
    `(2) 真の競合（同じ来店動機・時間帯・価格帯で客を奪い合う相手）を特定する。`,
    `(3) 売上=客数×客単価の要因分解で、動きが「客数要因」か「客単価要因」かを切り分ける。`,
    `(4) 店舗間相関（カニバリ/アンカー）を業態文脈で解釈する。ただし相関は因果ではないと明示する。`,
    `(5) 異常値（Zスコア）の突出日/落込日は平常と切り離して注記する。`,
    `(6) 来客予測モデルがあれば、自己採点(誤差%)を踏まえて参考程度に触れる。`,
    `(7) 「日報×実績 効果対照」がある場合、施策日の客数/売上が前日比・同曜日比でどう動いたかを数値で述べ、施策との関係は仮説として書く。`,
    `出力は最終回答ではなく「統合担当AIへの分析メモ」。見出し＋箇条書きで簡潔に（400字程度）。`,
  ].join('\n')
  const quantUser = `${viewingBlock ? viewingBlock + '\n\n' : ''}質問: ${q}\n\n# 競合プロファイル\n${competitors}\n\n# 事前計算サマリー\n${insights || '(履歴不足)'}\n\n# 要因分解\n${decomposition || '(日数不足)'}\n\n# 店舗間相関\n${storeCorr || '(データ不足)'}\n\n# 異常値\n${anomalies || '(外れ値なし)'}\n\n# 来客予測\n${forecastCtx || '(蓄積中)'}${patternBlock ? '\n\n' + patternBlock : ''}\n\n${nippou.block}\n\n# 日次生データ\n${data}`

  const extSystem = [
    `あなたは「${baseName}」（東京ドーム内フードホール「FOOD STADIUM TOKYO」の1店舗）専属の、会場イベント・天気の需要ドライバー分析専門家です。`,
    journalScopeRule,
    `担当は「東京ドームのイベント」と「天気」のみ。競合比較・過去実績の話は別担当なので触れなくてよい。`,
    `(1) 客数・売上に動きがある日は、そのイベント名・種別・規模・客層まで特定し、なぜ効いた/効かなかったかを客層・滞在時間と業態(ワイン×スパイス＝高単価大人向け)の相性で説明する。`,
    `(2) 野球は対戦相手/デーナイター、ライブはアーティスト/客層、ドームシティの小ホール(後楽園ホール・カナデビアホール等)独自の集客動機も考慮する。`,
    `(3) 天気(雨・猛暑等)とイベント有無の交互作用も見る。`,
    `(4) 今後の予定イベントがあれば、想定される影響を打ち手につながる形で触れる。`,
    `(5) 日報施策がある日は、イベント/天気の影響と施策効果を切り分け候補として一言添える（施策単独の因果断定はしない）。`,
    `出力は最終回答ではなく「統合担当AIへの分析メモ」。見出し＋箇条書きで簡潔に（400字程度）。`,
  ].join('\n')
  const extUser = `${viewingBlock ? viewingBlock + '\n\n' : ''}質問: ${q}\n\n# 会場イベント相関\n${eventCorr || '(イベントデータなし)'}\n\n# 今後の会場イベント予定\n${eventList || '(予定データなし)'}\n\n# 天気相関\n${weatherCorr || '(天気データなし)'}\n\n${nippou.impactCtx ? nippou.impactCtx + '\n\n' : ''}# 日次生データ\n${data}`

  const opsSystem = [
    `あなたは「${baseName}」専属の、飲食店オペレーション改善責任者です。`,
    journalScopeRule,
    `担当は「明日から現場で試せる打ち手」に加え、日報に書かれた「こんなことをしてみた」施策の効果検証と次アクションへの接続。`,
    `【厳守】データに無い販売点数・原価・スタッフ人数は作らない。打ち手は必ず「狙う客層/来店動機」「実施条件」「見るべきKPI」をセットで書く。`,
    `【現場の大前提・重要】フードコート店舗であるため、デリバリー（外部配達代行など）の新規導入や強化を提案することは非現実的であり禁止します。デリバリーではなく、テイクアウト（持ち帰り）用の容器・セットメニューの工夫や、客席呼び込みによる自店集客を提案してください。`,
    nippouRules,
    `出力は最終回答ではなく「統合担当AIへの運営改善メモ」。見出し＋箇条書きで簡潔に（400字程度）。施策あり日は必ず1件以上、施策名を引用して効果仮説を書く。`,
  ].join('\n')
  const opsUser = `${viewingBlock ? viewingBlock + '\n\n' : ''}質問: ${q}\n\n# 事前計算サマリー\n${insights || '(履歴不足)'}\n\n# 要因分解\n${decomposition || '(日数不足)'}\n\n# 競合プロファイル\n${competitors}\n\n# 来客予測\n${forecastCtx || '(蓄積中)'}${patternBlock ? '\n\n' + patternBlock : ''}\n\n# 今後の会場イベント予定\n${eventList || '(予定データなし)'}\n\n${nippou.block}\n\n# 日次生データ\n${data}`

  const [quantRes, extRes, opsRes, xTrendBrief] = await Promise.all([
    foodCourtAiChat([{ role: 'system', content: quantSystem }, { role: 'user', content: quantUser }], groqApiKey, primary, 700, 'groq', fallbackModel, { deadlineAt, perProviderMs: 25000, fallbackLog: { supabase, storeKey, surface: 'ask', role: 'specialist_quant' } }),
    foodCourtAiChat([{ role: 'system', content: extSystem }, { role: 'user', content: extUser }], groqApiKey, primary, 700, 'gemini', fallbackModel, { deadlineAt, perProviderMs: 25000, fallbackLog: { supabase, storeKey, surface: 'ask', role: 'specialist_ext' } }),
    foodCourtAiChat([{ role: 'system', content: opsSystem }, { role: 'user', content: opsUser }], groqApiKey, primary, 700, 'grok', fallbackModel, { deadlineAt, perProviderMs: 25000, fallbackLog: { supabase, storeKey, surface: 'ask', role: 'specialist_ops' } }),
    fetchFoodCourtXTrendBrief(foodCourtXTrendTopicForQuestion(q), foodCourtXTrendSoftTimeoutMs(deadlineAt), supabase, storeKey),
  ])
  const xTrendBlock = formatFoodCourtXTrendBlock(xTrendBrief)
  if (quantRes.usage) await recordFoodCourtAiUsage(supabase, String(storeKey ?? ''), null, quantRes.usage)
  if (extRes.usage) await recordFoodCourtAiUsage(supabase, String(storeKey ?? ''), null, extRes.usage)
  if (opsRes.usage) await recordFoodCourtAiUsage(supabase, String(storeKey ?? ''), null, opsRes.usage)
  const quantNote = quantRes.content || '(他店舗・過去データ分析メモ: 取得失敗)'
  const extNote = extRes.content || '(イベント・天気分析メモ: 取得失敗)'
  const opsNote = opsRes.content || '(運営改善メモ: 取得失敗)'

  const criticSystem = [
    `あなたは「${baseName}」分析の反証・品質管理担当です。`,
    journalScopeRule,
    `担当は、専門AIメモに含まれる言い過ぎ、根拠不足、相関と因果の混同、対象日/期間の取り違え、データに無い数字の混入を検出すること。`,
    `日報施策の効果を断定している場合、「日報×実績 効果対照」の数値と照合していないなら「仮説に弱める」よう指摘する。`,
    `担当者評価と実績の不一致を無視しているメモも指摘する。`,
    `出力は最終回答ではなく「統合担当AIへの反証メモ」。採用してよい主張、弱めるべき主張、禁止すべき断定を箇条書きで短く書く（300字程度）。`,
  ].join('\n')
  const criticUser = `${viewingBlock ? viewingBlock + '\n\n' : ''}質問: ${q}\n\n# 専門AIメモ\n## 他店舗・過去データ\n${quantNote}\n\n## イベント・天気\n${extNote}\n\n## 運営改善\n${opsNote}\n\n# 検証用の根拠\n${insights || '(履歴不足)'}\n\n${decomposition || '(要因分解なし)'}\n\n${storeCorr || '(店舗間相関なし)'}\n\n${eventCorr || '(イベント相関なし)'}\n\n${weatherCorr || '(天気相関なし)'}\n\n${forecastCtx || '(予測なし)'}${patternBlock ? '\n\n' + patternBlock : ''}\n\n${nippou.block}\n\n# 日次生データ\n${data}`
  const criticRes = await foodCourtAiChat([{ role: 'system', content: criticSystem }, { role: 'user', content: criticUser }], groqApiKey, primary, 650, 'claude', fallbackModel, { deadlineAt, perProviderMs: 25000, fallbackLog: { supabase, storeKey, surface: 'ask', role: 'critic' } })
  if (criticRes.usage) await recordFoodCourtAiUsage(supabase, String(storeKey ?? ''), null, criticRes.usage)
  const criticNote = criticRes.content || '(反証メモ: 取得失敗)'

  const system = [
    `あなたは「${baseName}」（東京ドーム内フードホール「FOOD STADIUM TOKYO」の1店舗）専属の、飲食業界に精通したシニア市場アナリスト兼経営コンサルタントです。`,
    journalScopeRule,
    `目的は「表を見れば分かる事実の再掲」ではなく、数字の“奥”を読み解いた洞察（市場調査レベルの考察）を提供することです。現場日報があるときは、日報と売上実績をリンクした「施策レポート」としても書く。`,
    `【データの大前提・最重要】売上・客数は「テナント一覧＝翌朝に出る“前日”の売上比較表」由来です。ただし提供データの日付は既に『実際に売上が発生した日（売上日）』へ補正済みなので、表示された日付＝その売上が発生した実日付として扱い、それ以上ずらさないこと（重ねて前日に戻さない）。イベント・天気・曜日との連動も、その売上日の条件でそのまま解釈してよい。`,
    `【厳守・禁止】「売上は¥◯、客単価は¥◯、◯位です」のように表の値をそのまま言い換えるだけ／最大・最小をただ列挙するだけの回答は禁止。数字は根拠として最小限だけ引用し、必ず「だから何を意味するか（原因・メカニズム・顧客行動・示唆）」をセットで述べること。`,
    `【必ず市場調査として読み解く・以下を踏まえる】`,
    `(1) 競合プロファイル（各店の業態・提供する料理/飲み物・飲み中心か食事中心か）を必ず使い、“なぜその数字になるのか”を業態のメカニズムで説明する。例: 客単価の高低は業態（ワイン×スパイス＝高単価／ラーメン・ベトナム・もつ鍋＝低単価）の必然か想定外か。客数が伸びにくいのは「高単価で意思決定コストが高い業態だから」か。`,
    `(2) 顧客の利用シーン・来店動機を推定する（野球/ライブ観戦の前後の一杯、待ち時間の軽食、がっつり飯、デート・接待、インバウンド、ファミリー等）。${baseName}はどの動機を取れていて、どれを取りこぼしているか。`,
    `(3) 真の競合（代替関係）を特定する。席は共有なので“客の財布と滞在時間”の奪い合い。同じ来店動機・時間帯・価格帯で客を奪い合う相手はどの店か。同ジャンル競合の有無（ワインは自店がほぼ独占）も強み/弱みとして語る。`,
    `(4) 需要ドライバーの中でも【東京ドームのイベント】を最重要視し、具体的に深掘りする。提供データの「会場イベント相関」「直近の日別イベント（日付・客数・売上・イベント名つき）」を必ず使い、客数・売上に動きがある日は次を必ず述べる: (a) その日に**どんなイベントが・いつ（昼興行か夜公演か）あったかをイベント名・種別・規模・客層まで特定**する（例: NiziUライブ＝若年女性中心で物販・グッズ後の軽い飲食、巨人戦などプロ野球＝幅広い年齢の野球ファンで試合前後に長め滞在、大学野球＝昼開催で飲酒需要が薄い、コンサート＝開演前後に集中、等）。(b) そのイベントが${baseName}の客数・売上に**どれだけ・なぜ**効いた/効かなかったかを実数を引用してメカニズムで説明する（観客の客層・財布・滞在時間・開演時間帯と、ワイン×スパイスという高単価・大人向け業態の相性）。(c) 取り込めたイベント／取りこぼしたイベントを切り分け、次に同種のイベントが来たときの打ち手につなげる。「イベント日は客数が多い」で終わらせない。天気・曜日は補助要因として絡める。`,
    `(5) 自店の構造的な強み・弱みと打開仮説。打ち手は「誰の・どの来店動機を・どう取るか」まで具体化し、検証方法（次に何の数字を見れば効果が分かるか）も添える。なお、本店舗はフードコート（FOOD STADIUM TOKYO）であり、デリバリー（外部配達代行など）の新規導入や強化を提案することは非現実的であるため厳禁とする。代わりに、テイクアウト（持ち帰り）用の容器・セットメニューの工夫や、客席呼び込みによる自店集客を提案すること。`,
    `(5-2) 施策効果の実績値が無い場合、増収額・客数リフト率・客単価上昇額を予測値として作らない。施策は「検証仮説」とし、対象客・実施方法・観測KPIを示す。数値を置く場合は効果予測ではなく、明確に「検証用の目標/判定ライン」と表記し、設定根拠を添える。`,
    `【分析フレームワーク（設計書準拠・必ず踏まえる）】`,
    `(6) 要因分解を最初に：売上＝客数×客単価。売上が動いたら必ず「客数要因」か「客単価要因」かを切り分ける（提供の「要因分解」ブロックの数値を使う）。集客が課題なら集客策、単価が課題なら単価策、と打ち手を取り違えない。`,
    `(7) 店舗間のカニバリ/アンカー：提供の「店舗間相関」を使い、負相関＝同じ来店動機の食い合い(カニバリ)候補、正相関＝連動/アンカー（人気店の集客が周辺も底上げ）候補として業態文脈で解釈する。ただし相関は因果ではない（曜日・イベント等の共通要因で連動しうる）ことを明示する。`,
    `(8) 異常値の切り分け：提供の「異常値（Zスコア）」の突出日/落込日は平常の傾向から切り離し、その日のイベント・天気で要因を注記する（外れ値で平常分析を歪めない）。`,
    `(9) イベント深掘りと交互作用：野球は対戦相手・デー/ナイター、ライブはアーティスト・客層（若年女性公演はデザート/カフェ/ドリンクの単価感度が高い等）で効き方が変わる。東京ドーム本体が無イベントでも、ドームシティの各会場（後楽園ホール＝格闘技で中年男性、プリズムホール＝展示/即売、カナデビアホール＝ライブ/舞台、ラクーア＝アイドル）が独立した来館動機になりうる点も考慮。交互作用（雨×イベント有無、猛暑×デザート/ドリンク等）も組み合わせて見る。`,
    `(10) 仮説は「支持／不支持／条件付き」で判定し、効果量（リフト率や差・倍率）を数値で添える。相関と因果は区別し、因果を主張する前に他要因（曜日・天気・イベント）を考慮する。データに無い指標（販売点数・推定来館者数による捕捉率・前年同曜日比など）は「データにありません／取得すれば精度が上がる」と明示し捏造しない。`,
    `(11) 「来客予測（学習型モデル）」がある場合は、今後の予測客数・売上を仕入・人員の助言に使う。ただしモデルの自己採点（誤差%）も併記されているので、誤差が大きい時は「精度は発展途上（データ蓄積で改善）」と断った上で参考値として扱う。`,
    nippouRules,
    `(12) 出力では可能なら短い見出し「施策と実績」を1つ入れ、日報の施策→実績比→次アクションの順で書く（日報が無い場合は省略可）。`,
    `【出力スタイル】結論を先に → 根拠（数字は最小限＋競合/業態/利用シーンの文脈＋日報施策）→ 示唆・打ち手（具体的で検証可能な仮説）。短い見出し＋箇条書き。断定できないことは「仮説」と明示し、データに無いことは「データにありません」と述べ捏造しない。新規オープンで前年比は無いため、自店の履歴と業態特性を基準に語る。客単価の順位は業態由来なので単価の高低そのものを優劣にしない（集客＝客数で評価する）。`,
    `【会話の継続】これは継続的な対話です。直前までのやり取り（履歴）を踏まえて回答し、「その店」「それ」「さっきの」「もっと詳しく」等の指示語・省略は文脈から解決して自然に会話を続けること。前の回答と矛盾しないようにする。`,
    `【専門AIメモの統合】以下には「他店舗・過去データ分析メモ」「イベント・天気分析メモ」「運営改善メモ」「反証メモ」という、別担当の専門AIが書いた下書きが含まれる。これらは参考意見であり鵜呑みにしない。メモが矛盾する場合や誇張がある場合は、必ず生データ・事前計算ブロック・日報×実績対照の数値で裏取りしてから採否を判断し、1つの一貫した最終回答にまとめること。反証メモで禁止された断定は使わず、必要なら「仮説」「データ不足」と弱めること。`,
    ...foodCourtXTrendRule(xTrendBlock, '打ち手・メニューや商品の方向性・客層の見立て'),
    `【統計的パターンの多角的判断】「統計的パターン」が与えられている場合、これはコードが計算した客観的な集計(サンプル数n・確度つき)であり、AI自身が確度を判定したものではない。来客予測モデルの学習係数(自己採点済み)であれば、来客予測の自己採点(誤差%)と矛盾しない範囲で解釈する。対象日/対象期間に同時に成立する複数条件(曜日・イベント種別・天気)を横断的に見て、確度を踏まえながら多角的に判断する。nが少ない条件は「参考程度」と明示し、断定しない。`,
    `【回答品質】最後に必ず、実行すべき次の一手または次に確認すべきKPIを1つ以上入れる。数字の羅列だけで終えない。日報があるときは次の一手を日報の学びと接続する。`,
    FOODCOURT_ACTION_FORMAT_RULE,
  ].join('\n')
  const learningMemory = await loadFoodCourtLearningMemory(supabase, storeKey, 'ask', q)
  const contextBlock = `# データの前提（必読）\n以下の売上・客数は「テナント一覧＝翌朝発行の”前日”の売上比較表」由来ですが、日付は既に『実際の売上日』へ補正済みです。表示された日付＝その売上が発生した実日付として扱い、これ以上ずらさず、その日のイベント・天気・曜日で解釈してください。\n\n# 競合プロファイル（FOOD STADIUM TOKYO）\n${competitors}\n\n# 事前計算サマリー（基準店）\n${insights || '(履歴不足)'}\n\n# 売上=客数×客単価 の要因分解（基準店）\n${decomposition || '(日数不足で分解不可)'}\n\n# 店舗間相関（カニバリ/アンカー・基準店 vs 各店）\n${storeCorr || '(共通日数が不足)'}\n\n# 会場イベント相関（東京ドーム）\n${eventCorr || '(イベントデータなし)'}\n\n# 今後の会場イベント予定\n${eventList || '(予定データなし)'}\n\n# 天気相関（東京ドーム周辺）\n${weatherCorr || '(天気データなし)'}\n\n# 異常値（基準店・Zスコア）\n${anomalies || '(外れ値なし/日数不足)'}\n\n# 来客予測（学習型モデル・自己採点つき）\n${forecastCtx || '(予測データなし/蓄積中)'}${patternBlock ? '\n\n' + patternBlock : ''}\n\n${nippou.block}\n\n# 他店舗・過去データ分析メモ（専門AIの下書き）\n${quantNote}\n\n# イベント・天気分析メモ（専門AIの下書き）\n${extNote}\n\n# 運営改善メモ（専門AIの下書き）\n${opsNote}\n\n# 反証メモ（品質管理AIの指摘）\n${criticNote}${learningMemory ? '\n\n' + learningMemory : ''}${xTrendBlock ? '\n\n' + xTrendBlock : ''}\n\n# 日次生データ（全テナント）\n${data}`
  // 会話継続: 直前までのQ&Aを文脈として渡す（「その店は?」等の指示語が効くように）。最大8メッセージ。
  const convo: Array<{ role: string; content: string }> = []
  for (const h of (Array.isArray(history) ? history : []).slice(-8)) {
    const role = (h && h.role === 'assistant') ? 'assistant' : ((h && h.role === 'user') ? 'user' : '')
    const content = String((h && h.content) ?? '').trim().slice(0, 4000)
    if (role && content) convo.push({ role, content })
  }
  const systemFull = (viewingBlock ? viewingBlock + '\n\n' : '') + system + '\n\n# 分析の材料（この実データに基づき、直前までの会話の流れも踏まえて回答する）\n' + contextBlock
  const baseMessages = [{ role: 'system', content: systemFull }, ...convo, { role: 'user', content: q }]
  // AIループエンジニアリング（Phase 1・Q&Aのみ）: FOODCOURT_LOOP_ENABLED=true かつ FOODCOURT_LOOP_APPLY_TO_ASK=true の
  // ときだけ有効。既定はOFFで、無効時は従来どおり1回生成して返すだけ（挙動・使用量記録とも変わらない）。
  const loopResult = await runFoodCourtLoopEngineering({
    surface: 'ask',
    initialGenerate: (feedback, previousAnswer) => foodCourtAiChat(
      feedback && previousAnswer ? appendLoopFeedback(baseMessages, feedback, previousAnswer) : baseMessages,
      // 改稿を廉価モデルに落とすと1周目より品質が下がり点数が伸びないため、両周ともOpenAI系で統一する。
      groqApiKey, primary, 1800, 'openai', fallbackModel,
      { deadlineAt, perProviderMs: 35000, fallbackLog: { supabase, storeKey, surface: 'ask', role: 'integrator' } },
    ),
    evaluationContext: contextBlock,
    numberAuditFacts: `# コード計算・生データのみ\n${insights || ''}\n${decomposition || ''}\n${storeCorr || ''}\n${eventCorr || ''}\n${weatherCorr || ''}\n${anomalies || ''}\n${forecastCtx || ''}\n${patternBlock || ''}\n${nippou.block}\n${data}`,
    question: q,
    userInput: q,
    sourceRef: { viewing_date: viewingDate ?? null },
    groqApiKey,
    primaryModel: primary,
    fallbackModel,
    supabase,
    storeKey,
    deadlineAt,
  })
  // Q&Aの実測トークンをAI使用料に合算（best-effort・store_partition_keyで集計に乗る）。ループ有効時は
  // 生成AI・評価AIの全呼び出し分をまとめて記録する。
  for (const u of loopResult.usages) await recordFoodCourtAiUsage(supabase, String(storeKey ?? ''), null, u)
  // ブリーフ本文を呼び出し元へ返す。統合AIが圧縮した後の回答しか残らないと、
  // 「Xの情報が薄い」のか「統合AIが潰した」のかを切り分けられないため。
  return {
    answer: loopResult.answer,
    loopScore: loopResult.loopScore,
    loopCount: loopResult.loopCount,
    xTrendBrief: xTrendBrief ? xTrendBrief.text : null,
  }
}
// 「分析サマリー（自動）」カードの1日分をAIで生成する（従来はJSテンプレートで毎回同じ言い回しだった問題への対応）。
// answerFoodCourtQuestion と同じ「専門AI2体(他店舗・過去データ／イベント・天気)を並列実行→統合AIが1本にまとめる」
// 構成を使い、対象日(targetReport)の事実(buildTargetDayFacts)を軸に語らせる。呼び出し側(admin-api)で
// report_id単位にキャッシュし、閲覧のたびに再生成しない運用を前提とする。
export async function generateFoodCourtDailySummary(
  reports: Array<Record<string, unknown>>,
  baseName: string,
  targetReport: Record<string, unknown>,
  groqApiKey: string,
  events: VenueEvent[] = [],
  weather: WeatherDay[] = [],
  forecast: ForecastRow[] = [],
  supabase?: SupabaseClient | null,
  storeKey?: string,
  priorSummary?: { businessDate: string; summaryText: string } | null,
  dailyLogs: Array<Record<string, unknown>> = [],
  monthlyRetro?: string | null,
): Promise<string | null> {
  if (!groqApiKey) return null
  const deadlineAt = fcRequestDeadlineAt()
  canonFoodcourtReports(reports)
  const targetFacts = buildTargetDayFacts(reports, baseName, targetReport, events, weather)
  if (!targetFacts) return null
  // 前回(直近の1つ前の営業日)のAI分析を「自己検証の材料」として渡す。同じ結論を毎回繰り返すのではなく、
  // 前回の見立て（好調/不調の理由・客数要因か客単価要因か等）が今回の実績でも裏付けられたか、変わったかを
  // 一言加えさせることで、日々の分析に連続性と自己修正を持たせる（数値予測モデルの自己採点と同じ発想）。
  const priorBlock = priorSummary
    ? `# 前回（${priorSummary.businessDate}）の分析（自己検証用の材料。今回の対象日ではない）\n${priorSummary.summaryText}`
    : ''
  // 先月の振り返り（月次AI要約）を「学習材料」として渡す。日次の分析は直近1〜2日の比較が中心になりがち
  // なので、月単位の季節性・トレンドを踏まえられるようにする（データが蓄積するほど自動的に厚みが増す）。
  const monthlyBlock = monthlyRetro
    ? `# 先月の振り返り（学習材料。月単位のトレンド・季節性の参考にする。今回の対象日そのものではない）\n${monthlyRetro}`
    : ''
  // 曜日/イベント種別/天気ごとの傾向は、来客予測モデルが自己採点(バックテストMAPE)まで済ませた
  // フィット済み係数(foodcourt_forecast_factors)を最優先で使う。数値予測とAI解説が同じ学習結果を参照する
  // ことで矛盾なく1本化される。未生成(cron未実行等)の場合のみ、単変量の簡易集計にフォールバックする。
  const forecastFactorsCtx = await buildForecastFactorsContext(supabase, baseName)
  const patternStats = forecastFactorsCtx || buildConditionPatternStats(reports, baseName, events, weather)
  const patternBlock = patternStats
    ? `# 統計的パターン（${forecastFactorsCtx ? '来客予測モデルの学習係数・自己採点つき' : '条件別集計・コード計算・サンプル数と確度つき'}）\n${patternStats}`
    : ''
  const insights = buildBaseInsights(reports, baseName)
  const eventCorr = buildEventCorrelation(reports, baseName, events)
  const eventList = buildEventListText(events)
  const weatherCorr = buildWeatherCorrelation(reports, baseName, weather)
  const competitors = buildCompetitorContext(reports, baseName)
  const decomposition = buildContributionDecomposition(reports, baseName)
  const storeCorr = buildStoreCorrelation(reports, baseName)
  const anomalies = buildAnomalyDays(reports, baseName, events, weather)
  const forecastCtx = buildForecastContext(forecast)
  // 現場日報: 原文＋施策×実績の効果対照（普段の売上AI分析レポートと日報をリンク）
  const nippou = buildFoodCourtNippouBlocks(dailyLogs, reports, baseName, events)
  const nippouRules = foodCourtNippouPromptRules(baseName)
  const dailyLogsBlock = nippou.block
  const primary = resolveGroqTextModel(Deno.env.get('FOODCOURT_GROQ_MODEL'), GROQ_TEXT_FOODCOURT_MODEL)
  const fallbackModel = GROQ_TEXT_FALLBACK_MODEL

  // --- 専門AI①: 対象日の他店舗比較・過去データ分析メモ ---
  const quantSystem = [
    `あなたは「${baseName}」専属の、他店舗比較と過去実績データの分析専門家です。`,
    `担当は「対象日の他店舗との関係」と「過去の実績データとの比較」および日報施策の数値効果。イベント・天気は別担当。`,
    `対象日の実績・順位・シェアと、自店史（平均・同曜日平均・履歴内順位）との比較データが与えられる。`,
    `(1) 対象日の客単価・順位が業態(競合プロファイル)から見て妥当か想定外かを判定する。`,
    `(2) 真の競合（同じ来店動機・価格帯で客を奪い合う相手）の視点で、対象日の順位の意味を語る。`,
    `(3) 対象日と自店史平均の差が「客数要因」か「客単価要因」か（与えられた分解データを使う）。`,
    `(4) 対象日が自店史の中でどの程度の位置(好調/不調/平常)かを、履歴内順位・同曜日平均比で語る。`,
    `(5) 「前回の分析」が与えられている場合、そこで語った見立て（好調/不調の理由・客数要因か客単価要因か等）が今回の対象日の実績でも裏付けられたか、それとも変わったかを一言で検証する（同じ結論・同じ言い回しの繰り返しを避ける）。`,
    `(6) 「統計的パターン」が与えられている場合、これはコードが計算した客観的な集計(サンプル数n・確度つき)。対象日に該当する曜日/イベント種別/天気の複数条件を同時に参照し、それぞれの確度(nが少ない条件は割り引く)を踏まえた上で、条件同士がどう重なって効いているか(多角的に)を判断する。単一条件の数字をそのまま言い換えるだけにしない。`,
    `(7) 日報×実績対照がある場合、対象日の施策と客数/売上の前日比・同曜日比を数値で述べる（因果は仮説）。`,
    `出力は最終回答ではなく「統合担当AIへの分析メモ」。見出し＋箇条書きで簡潔に（350字程度）。`,
  ].join('\n')
  const quantUser = `対象日の分析メモを書いてください。\n\n# 対象日の事実\n${targetFacts}\n\n# 競合プロファイル\n${competitors}\n\n# 期間サマリー（全体傾向）\n${insights || '(履歴不足)'}\n\n# 要因分解（前半→後半の全体傾向）\n${decomposition || '(日数不足)'}\n\n# 店舗間相関\n${storeCorr || '(データ不足)'}\n\n# 異常値\n${anomalies || '(外れ値なし)'}\n\n# 来客予測\n${forecastCtx || '(蓄積中)'}${patternBlock ? '\n\n' + patternBlock : ''}\n\n${dailyLogsBlock}${priorBlock ? '\n\n' + priorBlock : ''}`

  // --- 専門AI②: 対象日のイベント・天気分析メモ ---
  const extSystem = [
    `あなたは「${baseName}」専属の、会場イベント・天気の需要ドライバー分析専門家です。`,
    `担当は「対象日の東京ドームのイベント」と「天気」のみ。競合比較・過去実績の話は別担当なので触れなくてよい。`,
    `(1) 対象日にイベントがあれば、種別・規模・客層から、なぜ客数・売上に効いた/効かなかったかを説明する。`,
    `(2) 対象日の天気(雨か否か)が客足にどう影響したかを説明する。`,
    `(3) 今後の予定イベントがあれば、次に活かせる打ち手を一言添える。`,
    `出力は最終回答ではなく「統合担当AIへの分析メモ」。見出し＋箇条書きで簡潔に（300字程度）。`,
  ].join('\n')
  const extUser = `対象日の分析メモを書いてください。\n\n# 対象日の事実\n${targetFacts}\n\n# 会場イベント相関（全体傾向）\n${eventCorr || '(イベントデータなし)'}\n\n# 今後の会場イベント予定\n${eventList || '(予定データなし)'}\n\n# 天気相関（全体傾向）\n${weatherCorr || '(天気データなし)'}`

  // --- 専門AI③: 対象日の運営改善メモ ---
  const opsSystem = [
    `あなたは「${baseName}」専属の、飲食店オペレーション改善責任者です。`,
    `担当は、対象日の実績と日報の「試したこと」から、次回同条件の日に試すべき現場アクションを出すこと。`,
    `(1) 仕込み量・人員配置・ピーク対応・声かけ・セット提案・商品見せ方のうち、データから言えるものだけを書く。`,
    `(2) 売上要因が客数なら集客/導線、客単価ならセット/追加注文、イベント要因ならイベント客の動線に合わせる。`,
    `(3) 必ず「狙う客層/来店動機」「実施条件」「見るべきKPI」をセットで書く。`,
    nippouRules,
    `出力は最終回答ではなく「統合担当AIへの運営改善メモ」。見出し＋箇条書きで簡潔に（350字程度）。対象日に施策がある場合は施策名を引用し、効果対照の数値と担当者評価の整合を1つ以上述べる。`,
  ].join('\n')
  const opsUser = `対象日の運営改善メモを書いてください。\n\n# 対象日の事実\n${targetFacts}\n\n# 競合プロファイル\n${competitors}\n\n# 要因分解\n${decomposition || '(日数不足)'}\n\n# 来客予測\n${forecastCtx || '(蓄積中)'}${patternBlock ? '\n\n' + patternBlock : ''}\n\n# 今後の会場イベント予定\n${eventList || '(予定データなし)'}\n\n${dailyLogsBlock}${priorBlock ? '\n\n' + priorBlock : ''}`

  const [quantRes, extRes, opsRes, xTrendBrief] = await Promise.all([
    foodCourtAiChat([{ role: 'system', content: quantSystem }, { role: 'user', content: quantUser }], groqApiKey, primary, 600, 'groq', fallbackModel, { deadlineAt, perProviderMs: 25000, fallbackLog: { supabase, storeKey, surface: 'daily_summary', role: 'specialist_quant' } }),
    foodCourtAiChat([{ role: 'system', content: extSystem }, { role: 'user', content: extUser }], groqApiKey, primary, 600, 'gemini', fallbackModel, { deadlineAt, perProviderMs: 25000, fallbackLog: { supabase, storeKey, surface: 'daily_summary', role: 'specialist_ext' } }),
    foodCourtAiChat([{ role: 'system', content: opsSystem }, { role: 'user', content: opsUser }], groqApiKey, primary, 600, 'grok', fallbackModel, { deadlineAt, perProviderMs: 25000, fallbackLog: { supabase, storeKey, surface: 'daily_summary', role: 'specialist_ops' } }),
    fetchFoodCourtXTrendBrief(foodCourtXTrendTopic(), foodCourtXTrendSoftTimeoutMs(deadlineAt), supabase, storeKey),
  ])
  const xTrendBlock = formatFoodCourtXTrendBlock(xTrendBrief)
  if (quantRes.usage) await recordFoodCourtAiUsage(supabase, String(storeKey ?? ''), null, quantRes.usage)
  if (extRes.usage) await recordFoodCourtAiUsage(supabase, String(storeKey ?? ''), null, extRes.usage)
  if (opsRes.usage) await recordFoodCourtAiUsage(supabase, String(storeKey ?? ''), null, opsRes.usage)
  const quantNote = quantRes.content || '(他店舗・過去データ分析メモ: 取得失敗)'
  const extNote = extRes.content || '(イベント・天気分析メモ: 取得失敗)'
  const opsNote = opsRes.content || '(運営改善メモ: 取得失敗)'

  // --- 専門AI④: 反証・品質管理メモ ---
  const criticSystem = [
    `あなたは「${baseName}」日次分析の反証・品質管理担当です。`,
    `専門AIメモのうち、言い過ぎ、根拠不足、相関と因果の混同、対象日の取り違え、データに無い数字を検出する。`,
    `日報施策の効果断定は「日報×実績 効果対照」の数値と照合していないなら「仮説に弱める」よう指摘する。`,
    `出力は最終回答ではなく「統合担当AIへの反証メモ」。採用してよい主張、弱めるべき主張、禁止すべき断定を箇条書きで短く書く（250字程度）。`,
  ].join('\n')
  const criticUser = `# 対象日の事実\n${targetFacts}\n\n# 専門AIメモ\n## 他店舗・過去データ\n${quantNote}\n\n## イベント・天気\n${extNote}\n\n## 運営改善\n${opsNote}\n\n# 検証用データ\n${insights || '(履歴不足)'}\n\n${decomposition || '(要因分解なし)'}\n\n${eventCorr || '(イベント相関なし)'}\n\n${weatherCorr || '(天気相関なし)'}\n\n${forecastCtx || '(予測なし)'}\n\n${dailyLogsBlock}${patternBlock ? '\n\n' + patternBlock : ''}${priorBlock ? '\n\n' + priorBlock : ''}`
  const criticRes = await foodCourtAiChat([{ role: 'system', content: criticSystem }, { role: 'user', content: criticUser }], groqApiKey, primary, 550, 'claude', fallbackModel, { deadlineAt, perProviderMs: 15000, fallbackLog: { supabase, storeKey, surface: 'daily_summary', role: 'critic' } })
  if (criticRes.usage) await recordFoodCourtAiUsage(supabase, String(storeKey ?? ''), null, criticRes.usage)
  const criticNote = criticRes.content || '(反証メモ: 取得失敗)'

  // --- 統合AI: 4つのメモ＋対象日の事実を、画面の固定7見出しフォーマットにまとめる ---
  const system = [
    `あなたは「${baseName}」（東京ドーム内フードホール「FOOD STADIUM TOKYO」の1店舗）専属の、飲食業界に精通したシニア市場アナリストです。`,
    `目的は対象日の実績について、表の値の言い換えではなく「だから何を意味するか」まで踏み込んだ日次サマリーを作ることです。日報がある日は、日報とリンクした「施策×実績レポート」としても書く。`,
    `以下には「他店舗・過去データ分析メモ」「イベント・天気分析メモ」「運営改善メモ」「反証メモ」という、別担当の専門AIが書いた下書きが含まれる。これらは参考意見であり鵜呑みにしない。矛盾や誇張がある場合は「対象日の事実」および「日報×実績 効果対照」の数値で裏取りしてから採否を判断する。反証メモで禁止された断定は使わず、必要なら「仮説」「データ不足」と弱める。`,
    `【前回分析の自己検証】「前回の分析」が与えられている場合、そこで語った見立て（好調/不調の理由・客数要因か客単価要因か・イベント/天気の影響など）が今回の対象日の実績でも裏付けられたか、変わったかを必ずどこかの見出し（主に【この日の評価（条件別）】か【直近の勢い】）で一言検証すること。同じ結論・同じ言い回しを毎日繰り返さない。前回との継続性がある分析にする。`,
    `【比較可能性】前回分析と対象日の曜日・イベント規模・天気など主要条件が違う場合は、前回仮説が支持/否定されたと断定せず「条件が異なるため直接比較できない」と書く。`,
    ...foodCourtXTrendRule(xTrendBlock, '打ち手・メニューや商品の方向性・客層の見立て'),
    `【統計的パターンの多角的判断】「統計的パターン」が与えられている場合、これはコードが計算した客観的な集計(サンプル数n・確度つき)であり、AI自身が確度を判定したものではない。対象日に同時に成立する複数条件(曜日・イベント種別・天気)を横断的に見て、それぞれの確度を踏まえながら「複数の条件が重なってどう効いたか」を多角的に判断し、【この日の評価（条件別）】で言及する。nが少ない条件は「参考程度」と明示し、断定しない。`,
    `【不足データの扱い】入力に無い他店のイベント捕捉率・時間帯別実績・統計的有意差は作らない。日報ブロックが無い場合は「施策なし」ではなく「日報記録を確認できない」と書く。`,
    `【打ち手】根拠のない客数+○%・客単価+○円などの目標を作らない。基準値がある場合だけ数値化し、無い場合は「次回記録する観測可能なKPI」を1つ示す。`,
    FOODCOURT_ACTION_FORMAT_RULE,
    `【月次トレンドの参照】「先月の振り返り」が与えられている場合、そこで語られた月単位のトレンド・季節性（例:月内で伸びていた時期か、曜日構成、イベント密度など）と対象日の実績が整合するか、それとも先月から変化したかを、【総評】か【直近の勢い】のどちらかで一言だけ軽く触れる。対象日そのものの分析を月次の話にすり替えない。`,
    nippouRules,
    `【出力フォーマット・厳守】必ず次の7つの見出しを、この順番・この表記（【】で囲む）で出力すること。見出し以外の前置き・締めの文章は書かない。`,
    `【総評】対象日の総合評価(強い/弱い/平常)を1〜2文＋根拠。日報施策があれば一言触れる。`,
    `【売上】対象日の売上・FC平均比・順位を、意味づけとともに2〜3文。`,
    `【客数】対象日の客数・FC平均比・順位を、意味づけとともに1〜2文。`,
    `【客単価】対象日の客単価・FC平均比・順位を、業態文脈での意味づけとともに1〜2文。`,
    `【競合環境】自店の業態・真の競合・強みを2〜3文（対象日に限らず一般的な立ち位置の説明でよい）。`,
    `【この日の評価（条件別）】自店史平均比・同曜日平均比・履歴内順位・イベント/天気の影響・客数/客単価要因分解に加え、日報がある場合は「現場が試したこと」を引用し、前日比・同曜日比など効果対照の数値と担当者評価の整合・不整合を2〜4文で書く。`,
    `【直近の勢い】直近の推移・前回との差、および前回分析の自己検証結果を1〜2文。可能なら次に確認すべきKPI、または日報の学びを踏まえた次回同条件の打ち手を1つ入れる。`,
    `各見出しの本文は短い文を2〜4行程度。断定できないことは「仮説」と明示し、データに無いことは「データにありません」と述べ捏造しない。客単価の順位は業態由来なので単価の高低そのものを優劣にしない。`,
  ].join('\n')
  const learningMemory = await loadFoodCourtLearningMemory(supabase, storeKey, 'daily_summary', targetFacts)
  const contextBlock = `# 対象日の事実\n${targetFacts}\n\n# 競合プロファイル\n${competitors}\n\n${dailyLogsBlock}\n\n# 他店舗・過去データ分析メモ（専門AIの下書き）\n${quantNote}\n\n# イベント・天気分析メモ（専門AIの下書き）\n${extNote}\n\n# 運営改善メモ（専門AIの下書き）\n${opsNote}\n\n# 反証メモ（品質管理AIの指摘）\n${criticNote}${patternBlock ? '\n\n' + patternBlock : ''}${priorBlock ? '\n\n' + priorBlock : ''}${monthlyBlock ? '\n\n' + monthlyBlock : ''}${learningMemory ? '\n\n' + learningMemory : ''}${xTrendBlock ? '\n\n' + xTrendBlock : ''}`
  const baseMessages = [
    { role: 'system', content: system },
    { role: 'user', content: `# 分析の材料\n${contextBlock}\n\n上記フォーマット厳守で、対象日の日次サマリーを作成してください。` },
  ]
  const businessDate = fcSalesDate(targetReport) || null
  // AIループエンジニアリング（Phase 2）: FOODCOURT_LOOP_ENABLED=true かつ FOODCOURT_LOOP_APPLY_TO_DAILY=true の
  // ときだけ有効。既定はOFFで、無効時は従来どおり1回生成して返すだけ（挙動・使用量記録とも変わらない）。
  const loopResult = await runFoodCourtLoopEngineering({
    surface: 'daily_summary',
    initialGenerate: (feedback, previousAnswer) => foodCourtAiChat(
      feedback && previousAnswer ? appendLoopFeedback(baseMessages, feedback, previousAnswer) : baseMessages,
      // 改稿だけ廉価モデルへ切り替えると、1周目より品質が下がる実績があったため同じOpenAI系で統一する。
      groqApiKey, primary, 1400, 'openai', fallbackModel,
      { deadlineAt, perProviderMs: 35000, fallbackLog: { supabase, storeKey, surface: 'daily_summary', role: 'integrator' } },
    ),
    evaluationContext: contextBlock,
    numberAuditFacts: `# コード計算・日報原文のみ\n${targetFacts}\n${dailyLogsBlock}\n${patternBlock || ''}`,
    // Q&Aと違い自由質問が無いため、評価AIに渡す固定タスク文言を用意する。
    question: `「${baseName}」の${businessDate ?? '対象日'}の日次サマリーを、7見出しフォーマット厳守で生成するタスク`,
    sourceRef: { report_id: (targetReport as { id?: unknown }).id ?? null, business_date: businessDate },
    groqApiKey,
    primaryModel: primary,
    fallbackModel,
    supabase,
    storeKey,
    deadlineAt,
  })
  for (const u of loopResult.usages) await recordFoodCourtAiUsage(supabase, String(storeKey ?? ''), null, u)
  return loopResult.answer
}

// generateFoodCourtDailySummaryの「期間集計」版。画面の「期間で見る」モード専用。単日と違い単一のreport_id
// を持たないため、呼び出し側(admin-api)ではstore+start+endでキャッシュする(foodcourt_period_ai_summary)。
// 期間は日次のような連続キャデンスではない(ユーザーが都度好きな範囲を選ぶ)ため、前回分析の自己検証は行わない。
export async function generateFoodCourtPeriodSummary(
  reports: Array<Record<string, unknown>>,
  baseName: string,
  startDate: string,
  endDate: string,
  groqApiKey: string,
  events: VenueEvent[] = [],
  weather: WeatherDay[] = [],
  forecast: ForecastRow[] = [],
  supabase?: SupabaseClient | null,
  storeKey?: string,
  dailyLogs: Array<Record<string, unknown>> = [],
): Promise<string | null> {
  if (!groqApiKey) return null
  const deadlineAt = fcRequestDeadlineAt()
  canonFoodcourtReports(reports)
  const periodFacts = buildPeriodFacts(reports, baseName, startDate, endDate, events, weather)
  if (!periodFacts) return null
  // 曜日/イベント種別/天気ごとの傾向は、来客予測モデルの学習係数(自己採点つき)を最優先で使う（未生成時のみ
  // 単変量の簡易集計にフォールバック）。数値予測とAI解説が同じ学習結果を参照し矛盾なく1本化する。
  const forecastFactorsCtx = await buildForecastFactorsContext(supabase, baseName)
  const patternStats = forecastFactorsCtx || buildConditionPatternStats(reports, baseName, events, weather)
  const patternBlock = patternStats
    ? `# 統計的パターン（${forecastFactorsCtx ? '来客予測モデルの学習係数・自己採点つき' : '条件別集計・コード計算・サンプル数と確度つき'}）\n${patternStats}`
    : ''
  const insights = buildBaseInsights(reports, baseName)
  const eventCorr = buildEventCorrelation(reports, baseName, events)
  const eventList = buildEventListText(events)
  const weatherCorr = buildWeatherCorrelation(reports, baseName, weather)
  const competitors = buildCompetitorContext(reports, baseName)
  const decomposition = buildContributionDecomposition(reports, baseName)
  const storeCorr = buildStoreCorrelation(reports, baseName)
  const anomalies = buildAnomalyDays(reports, baseName, events, weather)
  const forecastCtx = buildForecastContext(forecast)
  const nippou = buildFoodCourtNippouBlocks(dailyLogs, reports, baseName, events)
  const nippouRules = foodCourtNippouPromptRules(baseName)
  const dailyLogsBlock = nippou.block
  const primary = resolveGroqTextModel(Deno.env.get('FOODCOURT_GROQ_MODEL'), GROQ_TEXT_FOODCOURT_MODEL)
  const fallbackModel = GROQ_TEXT_FALLBACK_MODEL

  // --- 専門AI①: 対象期間の他店舗比較・過去データ分析メモ ---
  const quantSystem = [
    `あなたは「${baseName}」専属の、他店舗比較と過去実績データの分析専門家です。`,
    `担当は「対象期間の他店舗との関係」と「過去の実績データとの比較」および日報施策の数値効果。イベント・天気は別担当。`,
    `対象期間(合算)の実績・順位・シェアと、期間外の自店史平均との比較データが与えられる。`,
    `(1) 対象期間の客単価・順位が業態(競合プロファイル)から見て妥当か想定外かを判定する。`,
    `(2) 真の競合（同じ来店動機・価格帯で客を奪い合う相手）の視点で、対象期間の順位の意味を語る。`,
    `(3) 対象期間の実績と全体傾向(要因分解)を突き合わせ、客数要因か客単価要因かを切り分ける。`,
    `(4) 対象期間が期間外の自店史と比べて好調/不調/平常のどれかを、日平均比で語る。`,
    `(5) 「統計的パターン」が与えられている場合、対象期間に含まれる曜日/イベント種別/天気の構成比を踏まえ、確度(nが少ない条件は割り引く)を意識して多角的に判断する。`,
    `(6) 期間中の日報×実績対照があれば、効いた施策日・効かなかった施策日を数値で対比する（因果は仮説）。`,
    `出力は最終回答ではなく「統合担当AIへの分析メモ」。見出し＋箇条書きで簡潔に（350字程度）。`,
  ].join('\n')
  const quantUser = `対象期間の分析メモを書いてください。\n\n# 対象期間の事実\n${periodFacts}\n\n# 競合プロファイル\n${competitors}\n\n# 期間サマリー（全体傾向）\n${insights || '(履歴不足)'}\n\n# 要因分解（前半→後半の全体傾向）\n${decomposition || '(日数不足)'}\n\n# 店舗間相関\n${storeCorr || '(データ不足)'}\n\n# 異常値\n${anomalies || '(外れ値なし)'}\n\n# 来客予測\n${forecastCtx || '(蓄積中)'}${patternBlock ? '\n\n' + patternBlock : ''}\n\n${dailyLogsBlock}`

  // --- 専門AI②: 対象期間のイベント・天気分析メモ ---
  const extSystem = [
    `あなたは「${baseName}」専属の、会場イベント・天気の需要ドライバー分析専門家です。`,
    `担当は「対象期間の東京ドームのイベント」と「天気」のみ。競合比較・過去実績の話は別担当なので触れなくてよい。`,
    `(1) 対象期間中にイベントが多かった/少なかったか、どんな種別が中心だったかを踏まえ、客数・売上への影響を説明する。`,
    `(2) 対象期間中の雨の日の比率が客足にどう影響したかを説明する。`,
    `(3) 今後の予定イベントがあれば、次に活かせる打ち手を一言添える。`,
    `出力は最終回答ではなく「統合担当AIへの分析メモ」。見出し＋箇条書きで簡潔に（300字程度）。`,
  ].join('\n')
  const extUser = `対象期間の分析メモを書いてください。\n\n# 対象期間の事実\n${periodFacts}\n\n# 会場イベント相関（全体傾向）\n${eventCorr || '(イベントデータなし)'}\n\n# 今後の会場イベント予定\n${eventList || '(予定データなし)'}\n\n# 天気相関（全体傾向）\n${weatherCorr || '(天気データなし)'}`

  // --- 専門AI③: 対象期間の運営改善メモ ---
  const opsSystem = [
    `あなたは「${baseName}」専属の、飲食店オペレーション改善責任者です。`,
    `担当は、対象期間の傾向と日報の「試したこと」から次の同条件期間・イベント週に試すべき現場アクションを出すこと。`,
    `(1) 仕込み量・人員配置・ピーク対応・声かけ・セット提案・商品見せ方のうち、データから言えるものだけを書く。`,
    `(2) 売上要因が客数なら集客/導線、客単価ならセット/追加注文、イベント要因ならイベント客の動線に合わせる。`,
    `(3) 必ず「狙う客層/来店動機」「実施条件」「見るべきKPI」をセットで書く。`,
    nippouRules,
    `出力は最終回答ではなく「統合担当AIへの運営改善メモ」。見出し＋箇条書きで簡潔に（350字程度）。期間中の施策は成功/薄いを分け、次期間の重点に接続する。`,
  ].join('\n')
  const opsUser = `対象期間の運営改善メモを書いてください。\n\n# 対象期間の事実\n${periodFacts}\n\n# 競合プロファイル\n${competitors}\n\n# 要因分解\n${decomposition || '(日数不足)'}\n\n# 来客予測\n${forecastCtx || '(蓄積中)'}${patternBlock ? '\n\n' + patternBlock : ''}\n\n# 今後の会場イベント予定\n${eventList || '(予定データなし)'}\n\n${dailyLogsBlock}`

  const [quantRes, extRes, opsRes, xTrendBrief] = await Promise.all([
    foodCourtAiChat([{ role: 'system', content: quantSystem }, { role: 'user', content: quantUser }], groqApiKey, primary, 600, 'groq', fallbackModel, { deadlineAt, perProviderMs: 25000, fallbackLog: { supabase, storeKey, surface: 'period_summary', role: 'specialist_quant' } }),
    foodCourtAiChat([{ role: 'system', content: extSystem }, { role: 'user', content: extUser }], groqApiKey, primary, 600, 'gemini', fallbackModel, { deadlineAt, perProviderMs: 25000, fallbackLog: { supabase, storeKey, surface: 'period_summary', role: 'specialist_ext' } }),
    foodCourtAiChat([{ role: 'system', content: opsSystem }, { role: 'user', content: opsUser }], groqApiKey, primary, 600, 'grok', fallbackModel, { deadlineAt, perProviderMs: 25000, fallbackLog: { supabase, storeKey, surface: 'period_summary', role: 'specialist_ops' } }),
    fetchFoodCourtXTrendBrief(foodCourtXTrendTopic(), foodCourtXTrendSoftTimeoutMs(deadlineAt), supabase, storeKey),
  ])
  const xTrendBlock = formatFoodCourtXTrendBlock(xTrendBrief)
  if (quantRes.usage) await recordFoodCourtAiUsage(supabase, String(storeKey ?? ''), null, quantRes.usage)
  if (extRes.usage) await recordFoodCourtAiUsage(supabase, String(storeKey ?? ''), null, extRes.usage)
  if (opsRes.usage) await recordFoodCourtAiUsage(supabase, String(storeKey ?? ''), null, opsRes.usage)
  const quantNote = quantRes.content || '(他店舗・過去データ分析メモ: 取得失敗)'
  const extNote = extRes.content || '(イベント・天気分析メモ: 取得失敗)'
  const opsNote = opsRes.content || '(運営改善メモ: 取得失敗)'

  // --- 専門AI④: 反証・品質管理メモ ---
  const criticSystem = [
    `あなたは「${baseName}」期間分析の反証・品質管理担当です。`,
    `専門AIメモのうち、言い過ぎ、根拠不足、相関と因果の混同、期間の取り違え、データに無い数字を検出する。`,
    `日報施策の効果断定は効果対照の数値照合が不足していれば「仮説に弱める」よう指摘する。`,
    `出力は最終回答ではなく「統合担当AIへの反証メモ」。採用してよい主張、弱めるべき主張、禁止すべき断定を箇条書きで短く書く（250字程度）。`,
  ].join('\n')
  const criticUser = `# 対象期間の事実\n${periodFacts}\n\n# 専門AIメモ\n## 他店舗・過去データ\n${quantNote}\n\n## イベント・天気\n${extNote}\n\n## 運営改善\n${opsNote}\n\n# 検証用データ\n${insights || '(履歴不足)'}\n\n${decomposition || '(要因分解なし)'}\n\n${eventCorr || '(イベント相関なし)'}\n\n${weatherCorr || '(天気相関なし)'}\n\n${forecastCtx || '(予測なし)'}\n\n${dailyLogsBlock}${patternBlock ? '\n\n' + patternBlock : ''}`
  const criticRes = await foodCourtAiChat([{ role: 'system', content: criticSystem }, { role: 'user', content: criticUser }], groqApiKey, primary, 550, 'claude', fallbackModel, { deadlineAt, perProviderMs: 25000, fallbackLog: { supabase, storeKey, surface: 'period_summary', role: 'critic' } })
  if (criticRes.usage) await recordFoodCourtAiUsage(supabase, String(storeKey ?? ''), null, criticRes.usage)
  const criticNote = criticRes.content || '(反証メモ: 取得失敗)'

  // --- 統合AI: 4つのメモ＋対象期間の事実を、画面の固定7見出しフォーマットにまとめる ---
  const system = [
    `あなたは「${baseName}」（東京ドーム内フードホール「FOOD STADIUM TOKYO」の1店舗）専属の、飲食業界に精通したシニア市場アナリストです。`,
    `目的は対象期間(${startDate}〜${endDate})の実績について、表の値の言い換えではなく「だから何を意味するか」まで踏み込んだ期間サマリーを作ることです。期間中の日報は施策レポートとして必ずリンクする。`,
    `以下には「他店舗・過去データ分析メモ」「イベント・天気分析メモ」「運営改善メモ」「反証メモ」という、別担当の専門AIが書いた下書きが含まれる。これらは参考意見であり鵜呑みにしない。矛盾や誇張がある場合は「対象期間の事実」および「日報×実績 効果対照」の数値で裏取りしてから採否を判断する。反証メモで禁止された断定は使わず、必要なら「仮説」「データ不足」と弱める。`,
    ...foodCourtXTrendRule(xTrendBlock, '打ち手・メニューや商品の方向性・客層の見立て'),
    `【統計的パターンの多角的判断】「統計的パターン」が与えられている場合、これはコードが計算した客観的な集計(サンプル数n・確度つき)であり、AI自身が確度を判定したものではない。対象期間に含まれる複数条件(曜日・イベント種別・天気)を横断的に見て、確度を踏まえながら多角的に判断し、【この期間の評価（条件別）】で言及する。nが少ない条件は「参考程度」と明示し、断定しない。`,
    FOODCOURT_ACTION_FORMAT_RULE,
    nippouRules,
    `【出力フォーマット・厳守】必ず次の7つの見出しを、この順番・この表記（【】で囲む）で出力すること。見出し以外の前置き・締めの文章は書かない。`,
    `【総評】対象期間の総合評価(強い/弱い/平常)を1〜2文＋根拠。日報施策の有無にも触れる。`,
    `【売上】対象期間の合計売上・日平均・FC平均比・順位を、意味づけとともに2〜3文。`,
    `【客数】対象期間の合計客数・FC平均比を、意味づけとともに1〜2文。`,
    `【客単価】対象期間の客単価・FC平均比を、業態文脈での意味づけとともに1〜2文。`,
    `【競合環境】自店の業態・真の競合・強みを2〜3文（対象期間に限らず一般的な立ち位置の説明でよい）。`,
    `【この期間の評価（条件別）】期間外の自店史平均比・イベント/天気の構成比の影響に加え、日報がある場合は「現場が試したこと」を引用し、効果対照の数値でどれだけ実績につながったかを2〜4文で書く。`,
    `【直近の勢い】この期間内での前半→後半の傾向を1〜2文。日報の学びを踏まえた次回同条件期間の打ち手またはKPIを1つ入れる。`,
    `各見出しの本文は短い文を2〜4行程度。断定できないことは「仮説」と明示し、データに無いことは「データにありません」と述べ捏造しない。客単価の順位は業態由来なので単価の高低そのものを優劣にしない。`,
  ].join('\n')
  const learningMemory = await loadFoodCourtLearningMemory(supabase, storeKey, 'period_summary', `${startDate} ${endDate} ${periodFacts}`)
  const contextBlock = `# 対象期間の事実\n${periodFacts}\n\n# 競合プロファイル\n${competitors}\n\n${dailyLogsBlock}\n\n# 他店舗・過去データ分析メモ（専門AIの下書き）\n${quantNote}\n\n# イベント・天気分析メモ（専門AIの下書き）\n${extNote}\n\n# 運営改善メモ（専門AIの下書き）\n${opsNote}\n\n# 反証メモ（品質管理AIの指摘）\n${criticNote}${patternBlock ? '\n\n' + patternBlock : ''}${learningMemory ? '\n\n' + learningMemory : ''}${xTrendBlock ? '\n\n' + xTrendBlock : ''}`
  const baseMessages = [
    { role: 'system', content: system },
    { role: 'user', content: `# 分析の材料\n${contextBlock}\n\n上記フォーマット厳守で、対象期間の日次サマリーを作成してください。` },
  ]
  // AIループエンジニアリング（Phase 3・最も控えめ）: FOODCOURT_LOOP_ENABLED=true かつ FOODCOURT_LOOP_APPLY_TO_PERIOD=true の
  // ときだけ有効。既定maxLoopsは1（11章「期間: 最大1〜2ループ」の下限。期間集計はコストが高くなりやすいため）。
  // 既定はOFFで、無効時は従来どおり1回生成して返すだけ（挙動・使用量記録・キャッシュバージョンとも変わらない）。
  const loopResult = await runFoodCourtLoopEngineering({
    surface: 'period_summary',
    initialGenerate: (feedback, previousAnswer) => foodCourtAiChat(
      feedback && previousAnswer ? appendLoopFeedback(baseMessages, feedback, previousAnswer) : baseMessages,
      groqApiKey, primary, 1400, 'openai', fallbackModel,
      { deadlineAt, perProviderMs: 35000, fallbackLog: { supabase, storeKey, surface: 'period_summary', role: 'integrator' } },
    ),
    evaluationContext: contextBlock,
    numberAuditFacts: `# コード計算・日報原文のみ\n${periodFacts}\n${dailyLogsBlock}\n${patternBlock || ''}`,
    question: `「${baseName}」の${startDate}〜${endDate}の期間サマリーを、7見出しフォーマット厳守で生成するタスク`,
    sourceRef: { start_date: startDate, end_date: endDate },
    groqApiKey,
    primaryModel: primary,
    fallbackModel,
    supabase,
    storeKey,
    deadlineAt,
  })
  for (const u of loopResult.usages) await recordFoodCourtAiUsage(supabase, String(storeKey ?? ''), null, u)
  return loopResult.answer
}

// 受信時刻(JST)からの「発行日」推定。テナント一覧は「前日の売上比較表」なので売上日はこの前日(-1)。
function jstNowDate(): string {
  const nowJst = new Date(Date.now() + 9 * 3600 * 1000)
  return `${nowJst.getUTCFullYear()}-${String(nowJst.getUTCMonth() + 1).padStart(2, '0')}-${String(nowJst.getUTCDate()).padStart(2, '0')}`
}

export async function saveFoodCourtReport(
  supabase: SupabaseClient,
  params: { storeKey: string; roomId: string; lineMessageId: string; baseName: string; tenants: FoodCourtTenant[]; reportDate?: string },
): Promise<void> {
  try {
    // report_date＝レポート発行日（＝送信日）。テナント一覧は「前日の売上比較表」なので
    // 売上日は report_date の前日(-1)。この日付が無いと一覧フィルタ(hasReportDate)で
    // 除外され表示されないため、指定が無ければ受信日(JST)を発行日としてセットする。
    const reportDate = (params.reportDate && /^\d{4}-\d{2}-\d{2}$/.test(params.reportDate)) ? params.reportDate : jstNowDate()
    // 同じ店舗・同じ発行日(report_date)の行は1件だけに保つ（line_message_id違いの再送/別画像でも二重登録
    // させない）。自分自身(line_message_id一致)はupsertで更新されるので対象から除外。
    await supabase.from('foodcourt_tenant_reports')
      .delete()
      .eq('store_partition_key', params.storeKey)
      .eq('report_date', reportDate)
      .neq('line_message_id', params.lineMessageId)
    await supabase.from('foodcourt_tenant_reports').upsert({
      store_partition_key: params.storeKey,
      room_id: params.roomId,
      line_message_id: params.lineMessageId,
      report_date: reportDate,
      base_tenant_name: params.baseName,
      tenants: params.tenants,
    }, { onConflict: 'line_message_id' })
  } catch (e) {
    console.error('saveFoodCourtReport failed:', e instanceof Error ? e.message : String(e))
  }
}

// 売上日(YYYY-MM-DD)確認カード。LINE画像受信直後、即保存せずこのカードを返す。
// 「この日付で登録」＝推定通り／「日付を指定」＝datetimepickerで売上日を選び直す／「キャンセル」＝破棄。
function buildFoodCourtDateConfirmFlex(pendingId: number, tenantCount: number, guessedSalesDate: string, warnings?: Array<string | null | undefined>): Record<string, unknown> {
  const warningLines = (warnings ?? []).filter((w): w is string => !!w)
  return {
    type: 'flex',
    altText: `フードコート集計の日付確認（${guessedSalesDate}）`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [
          { type: 'text', text: '📊 フードコート集計を検出しました', weight: 'bold', size: 'md', color: '#1a6fa8' },
          { type: 'text', text: `${tenantCount}テナント分（売上には登録していません）。`, size: 'sm', color: '#444444', wrap: true },
          { type: 'separator', margin: 'md' },
          { type: 'text', text: '売上日（推定）', size: 'xs', color: '#8a96a3' },
          { type: 'text', text: guessedSalesDate, weight: 'bold', size: 'lg', color: '#1a6fa8' },
          { type: 'text', text: 'この日付で登録してよいですか？ 違う場合は「日付を指定する」から選び直せます。', size: 'xs', color: '#8a96a3', wrap: true, margin: 'md' },
          ...warningLines.map((w) => ({ type: 'text', text: w, size: 'xs', color: '#c0392b', wrap: true, margin: 'md' })),
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [
          { type: 'button', style: 'primary', color: '#1a6fa8', height: 'sm',
            action: { type: 'postback', label: 'この日付で登録する', data: `fcimp=${pendingId}`, displayText: `${guessedSalesDate}で登録します` } },
          { type: 'button', style: 'secondary', height: 'sm',
            action: { type: 'datetimepicker', label: '日付を指定する', data: `fcimp_pick=${pendingId}`, mode: 'date', initial: guessedSalesDate } },
          { type: 'button', style: 'secondary', height: 'sm',
            action: { type: 'postback', label: 'キャンセル', data: `fcimp_skip=${pendingId}`, displayText: 'フードコート集計の登録をキャンセルします' } },
        ],
      },
    },
  }
}

function foodCourtSimpleNoticeFlex(text: string): Record<string, unknown> {
  return {
    type: 'flex',
    altText: text.slice(0, 380),
    contents: {
      type: 'bubble',
      body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text, wrap: true, size: 'sm', color: '#444444' }] },
    },
  }
}

// フードコート日付確認カードの postback（fcimp=<id> 登録 / fcimp_pick=<id> 日付指定(datetimepicker) / fcimp_skip=<id> 破棄）。
export async function handleFoodCourtReportPostback(
  supabase: SupabaseClient,
  postbackData: string,
  pickedDate?: string | null,
): Promise<Record<string, unknown> | null> {
  const m = /^(fcimp|fcimp_pick|fcimp_skip)=(\d+)$/.exec(String(postbackData ?? '').trim())
  if (!m) return null
  const action = m[1]
  const pendingId = Number(m[2])
  if (!Number.isInteger(pendingId) || pendingId <= 0) return null

  const { data: pending, error } = await supabase
    .from('pending_foodcourt_reports')
    .select('id, status, store_partition_key, room_id, line_message_id, base_tenant_name, tenants, guessed_sales_date')
    .eq('id', pendingId)
    .maybeSingle()
  if (error || !pending) return foodCourtSimpleNoticeFlex('対象のフードコート集計が見つかりませんでした。')
  const p = pending as {
    id: number; status: string; store_partition_key: string; room_id: string | null; line_message_id: string | null
    base_tenant_name: string; tenants: FoodCourtTenant[]; guessed_sales_date: string
  }
  if (p.status !== 'pending') return foodCourtSimpleNoticeFlex('この集計はすでに処理済みです。')

  if (action === 'fcimp_skip') {
    await supabase.from('pending_foodcourt_reports').update({ status: 'dismissed' }).eq('id', pendingId)
    return foodCourtSimpleNoticeFlex('フードコート集計の登録をキャンセルしました。')
  }

  // 確定する売上日: fcimp=推定通り／fcimp_pick=ユーザーがdatetimepickerで選んだ日。
  // 保存側は report_date(発行日)を持つため、売上日+1日を report_date として渡す（fcSalesDateの逆算）。
  const salesDate = action === 'fcimp_pick' && pickedDate && /^\d{4}-\d{2}-\d{2}$/.test(pickedDate) ? pickedDate : p.guessed_sales_date
  const reportDate = fcAddDays(salesDate, 1)
  await saveFoodCourtReport(supabase, {
    storeKey: p.store_partition_key,
    roomId: p.room_id ?? '',
    lineMessageId: p.line_message_id ?? `pending:${p.id}`,
    baseName: p.base_tenant_name,
    tenants: p.tenants,
    reportDate,
  })
  await supabase.from('pending_foodcourt_reports').update({ status: 'registered' }).eq('id', pendingId)
  const pageUrl = await buildFoodCourtDashboardLink(supabase, p.store_partition_key)
  const tenantCount = Array.isArray(p.tenants) ? p.tenants.length : 0
  const cmp = computeFoodCourtComparison(p.tenants, p.base_tenant_name)
  const receiptWarning = cmp ? await checkFoodCourtReceiptConsistency(supabase, p.store_partition_key, salesDate, cmp.baseSales) : null
  return buildFoodCourtAckFlex(tenantCount, pageUrl, salesDate, receiptWarning)
}

// オーケストレーション: 対象店舗＋マーカー一致のとき Azure Foundry で抽出 → 比較が成立すれば
//   保存＋カードを返し handled=true（売上登録しない）。成立しなければ handled=false（通常処理へ）。
export async function maybeHandleFoodCourtReport(
  supabase: SupabaseClient,
  params: {
    storeKey: string
    roomId: string
    lineMessageId: string
    bytes: Uint8Array
    contentType: string | null
    detectText: string
    geminiApiKey: string
    geminiModel: string
    azureFoundryProjectEndpoint?: string
    azureFoundryApiKey?: string
    azureFoundryDeployment?: string
    /** 自店レシートとして確信できない画像のとき true＝マーカー不一致でも抽出を試す（検知の取りこぼし防止）。 */
    forceAttempt?: boolean
  },
): Promise<{ handled: boolean; reply?: Record<string, unknown> }> {
  const cfg = FOODCOURT_STORE_KEYS[String(params.storeKey ?? '')]
  if (!cfg) return { handled: false }
  if (!looksLikeFoodCourtReport(params.detectText) && !params.forceAttempt) return { handled: false }

  const valid = (ts: FoodCourtTenant[] | null) =>
    (ts && ts.length >= 3 && computeFoodCourtComparison(ts, cfg.baseTenantName)) ? ts : null

  // 画像抽出で消費したトークンを記録（成立有無に関わらず・AI使用料に反映）。
  const aiUsages: FoodCourtAiUsage[] = []
  const onUsage = (u: FoodCourtAiUsage) => { aiUsages.push(u) }
  // 1) まず Azure Foundry で抽出する。比較表として成立すれば採用する。
  // 想定11店中6〜9店でも分析は可能なので、件数不足だけで Gemini に逃げない。
  let tenants = valid(await extractFoodCourtTenantsAzureFoundry(
    params.bytes,
    params.contentType,
    params.azureFoundryProjectEndpoint ?? '',
    params.azureFoundryApiKey ?? '',
    params.azureFoundryDeployment ?? 'gpt-5.4-nano',
    40000,
    onUsage,
  ))
  const tenantExtractAttempts: FoodCourtAiAttempt[] = [{
    provider: 'azure',
    model: params.azureFoundryDeployment ?? 'gpt-5.4-nano',
    ok: !!tenants,
    reason: tenants ? null : 'invalid_or_insufficient_tenants',
  }]
  // 2) Azure が表として成立しないときだけ Gemini に退避する。
  if (!tenants && params.geminiApiKey) {
    const g = valid(await extractFoodCourtTenants(params.bytes, params.contentType, params.geminiApiKey, params.geminiModel, 30000, onUsage))
    tenantExtractAttempts.push({
      provider: 'gemini',
      model: params.geminiModel,
      ok: !!g,
      reason: g ? null : 'invalid_or_insufficient_tenants',
    })
    if (g) tenants = g
  }
  await recordFoodCourtFallbackIfNeeded('azure', tenantExtractAttempts, {
    supabase,
    storeKey: params.storeKey,
    surface: 'tenant_extract',
    role: 'tenant_extractor',
  })
  for (const u of aiUsages) await recordFoodCourtAiUsage(supabase, params.storeKey, params.lineMessageId, u)
  if (!tenants) return { handled: false } // どちらも成立しない → 通常のレシート処理へ

  const cmp = computeFoodCourtComparison(tenants, cfg.baseTenantName)
  if (!cmp) return { handled: false }

  // 月末/月初に「日次ではなく月間の総売上（税抜）」の一覧が誤って送られてくることがある。テーブル自体には
  // 日次か月次かを判別する印字が無いため、直近の日次実績と比べて極端に大きい場合は月次集計とみなし、
  // 登録せず通知だけ返す（分析データが月次の巨大値で汚染されるのを防ぐ）。十分な履歴が無い場合は判定しない。
  const { data: recentRows } = await supabase
    .from('foodcourt_tenant_reports')
    .select('tenants, report_date, created_at')
    .ilike('store_partition_key', params.storeKey)
    .order('created_at', { ascending: false })
    .limit(30)
  const recentDaily = fcBaseDaily(Array.isArray(recentRows) ? recentRows as Array<Record<string, unknown>> : [], cfg.baseTenantName)
  const recentSales = recentDaily.slice(-14).map((r) => r.sales).filter((v) => v > 0)
  const medianRecentSales = recentSales.length >= 5 ? fcMedian(recentSales) : null
  if (medianRecentSales != null && medianRecentSales > 0 && cmp.baseSales > medianRecentSales * FOODCOURT_MONTHLY_ANOMALY_MULTIPLIER) {
    return {
      handled: true,
      reply: foodCourtSimpleNoticeFlex(
        `検出した売上（${fcYen(cmp.baseSales)}）が直近の日次実績（中央値 ${fcYen(medianRecentSales)}）と比べて大きく乖離しているため、月間の総売上レポートの可能性があると判断し、登録しませんでした。日次のテナント一覧画像を再度お送りください。`,
      ),
    }
  }

  // 即保存はせず、「この日付でよいか」を確認するpendingカードを返す（postbackで本登録/日付指定/破棄）。
  // 受信時刻(JST)からの推定発行日の前日＝推定売上日を初期値として提示する。
  const guessedReportDate = jstNowDate()
  const guessedSalesDate = fcAddDays(guessedReportDate, -1)
  const { data: pendingRow, error: pendingErr } = await supabase
    .from('pending_foodcourt_reports')
    .upsert({
      store_partition_key: params.storeKey,
      room_id: params.roomId,
      line_message_id: params.lineMessageId,
      base_tenant_name: cfg.baseTenantName,
      tenants,
      guessed_sales_date: guessedSalesDate,
      status: 'pending',
    }, { onConflict: 'line_message_id' })
    .select('id')
    .single()
  if (pendingErr || !pendingRow) {
    console.error('pending_foodcourt_reports upsert failed:', pendingErr?.message)
    return { handled: false }
  }
  const pendingId = Number((pendingRow as { id?: unknown }).id ?? 0)
  const receiptWarning = await checkFoodCourtReceiptConsistency(supabase, params.storeKey, guessedSalesDate, cmp.baseSales)
  const existingWarning = await checkFoodCourtExistingReport(supabase, params.storeKey, guessedReportDate, cfg.baseTenantName)
  return { handled: true, reply: buildFoodCourtDateConfirmFlex(pendingId, tenants.length, guessedSalesDate, [receiptWarning, existingWarning]) }
}

// ===== 週次経営レポート生成 =====
// 先週（月〜日）の売上データ・日報・天気・イベントを集計し、Q&Aと同じAIループエンジンで
// 高品質な経営アドバイザーレポートを生成する。weekly-report.html から参照可能なJSONを返す。
export type FoodCourtWeeklyRawData = {
  weekStart: string
  weekEnd: string
  baseName: string
  totalSales: number | null
  totalGuests: number | null
  dailySales: Array<{ date: string; sales: number | null; guests: number | null; salesRank: number | null; tenantCount: number }>
  avgRank: number | null
  shareAvg: number | null
  tenantRows: Array<{ name: string; sales: number | null; salesRatio: number | null }>
  dailyLogs: Array<Record<string, unknown>>
}

function buildWeeklyRawData(
  reports: Array<Record<string, unknown>>,
  baseName: string,
  weekStart: string,
  weekEnd: string,
  dailyLogs: Array<Record<string, unknown>>,
): FoodCourtWeeklyRawData {
  const inWeek = reports.filter((r) => {
    const d = fcSalesDate(r)
    return d && d >= weekStart && d <= weekEnd
  })
  let totalSales: number | null = null
  let totalGuests: number | null = null
  const dailySales: FoodCourtWeeklyRawData['dailySales'] = []
  const tenantMap = new Map<string, number>()

  for (const r of inWeek) {
    const d = fcSalesDate(r)
    if (!d) continue
    const tenants = Array.isArray((r as { tenants?: unknown }).tenants) ? (r as { tenants?: unknown[] }).tenants! : []
    const base = tenants.find((t) => {
      const o = (t && typeof t === 'object') ? t as Record<string, unknown> : {}
      return normalizeName(String(o.name ?? '')) === normalizeName(baseName)
    })
    const baseO = (base && typeof base === 'object') ? base as Record<string, unknown> : null
    const baseSalesDay = baseO ? numOrNull(baseO.sales) : null
    const baseGuestsDay = baseO ? numOrNull(baseO.guests) : null
    const validTenants = tenants.filter((t) => {
      const o = (t && typeof t === 'object') ? t as Record<string, unknown> : {}
      return numOrNull(o.sales) != null
    })
    const salesRankDay = baseSalesDay != null
      ? 1 + validTenants.filter((t) => {
          const o = (t && typeof t === 'object') ? t as Record<string, unknown> : {}
          return (numOrNull(o.sales) ?? 0) > baseSalesDay
        }).length
      : null

    // テナント合算（週次比較表用）
    for (const t of validTenants) {
      const o = (t && typeof t === 'object') ? t as Record<string, unknown> : {}
      const nm = String(o.name ?? '').trim()
      const s = numOrNull(o.sales) ?? 0
      tenantMap.set(nm, (tenantMap.get(nm) ?? 0) + s)
    }

    if (baseSalesDay != null) totalSales = (totalSales ?? 0) + baseSalesDay
    if (baseGuestsDay != null) totalGuests = (totalGuests ?? 0) + baseGuestsDay
    dailySales.push({ date: d, sales: baseSalesDay, guests: baseGuestsDay, salesRank: salesRankDay, tenantCount: validTenants.length })
  }
  dailySales.sort((a, b) => a.date.localeCompare(b.date))

  // テナント比較表（週合計ベース）
  const baseWeekSales = tenantMap.get(Array.from(tenantMap.keys()).find((k) => normalizeName(k) === normalizeName(baseName)) ?? '') ?? null
  const tenantRows: FoodCourtWeeklyRawData['tenantRows'] = Array.from(tenantMap.entries())
    .map(([name, sales]) => ({
      name,
      sales,
      salesRatio: (baseWeekSales && baseWeekSales > 0) ? (sales / baseWeekSales) * 100 : null,
    }))
    .sort((a, b) => (b.sales ?? 0) - (a.sales ?? 0))

  const ranks = dailySales.map((d) => d.salesRank).filter((r): r is number => r != null)
  const avgRank = ranks.length ? Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length * 10) / 10 : null
  const totalWeekSales = Array.from(tenantMap.values()).reduce((a, b) => a + b, 0)
  const shareAvg = (totalSales != null && totalWeekSales > 0) ? (totalSales / totalWeekSales) * 100 : null

  return { weekStart, weekEnd, baseName, totalSales, totalGuests, dailySales, avgRank, shareAvg, tenantRows, dailyLogs }
}

export async function generateFoodCourtWeeklyReport(
  reports: Array<Record<string, unknown>>,
  baseName: string,
  weekStart: string,  // YYYY-MM-DD (月曜)
  weekEnd: string,    // YYYY-MM-DD (日曜)
  groqApiKey: string,
  events: VenueEvent[] = [],
  weather: WeatherDay[] = [],
  forecast: ForecastRow[] = [],
  supabase?: SupabaseClient | null,
  storeKey?: string,
  dailyLogs: Array<Record<string, unknown>> = [],
): Promise<{ report: string | null; rawData: FoodCourtWeeklyRawData; loopScore: number | null; loopCount: number }> {
  const rawData = buildWeeklyRawData(reports, baseName, weekStart, weekEnd, dailyLogs)
  if (!groqApiKey) return { report: null, rawData, loopScore: null, loopCount: 0 }
  const deadlineAt = fcRequestDeadlineAt()
  canonFoodcourtReports(reports)

  // 期間サマリーと同じ分析コンテキストを構築
  const periodFacts = buildPeriodFacts(reports, baseName, weekStart, weekEnd, events, weather)
  if (!periodFacts) return { report: null, rawData, loopScore: null, loopCount: 0 }

  const forecastFactorsCtx = await buildForecastFactorsContext(supabase, baseName)
  const patternStats = forecastFactorsCtx || buildConditionPatternStats(reports, baseName, events, weather)
  const patternBlock = patternStats
    ? `# 統計的パターン（${forecastFactorsCtx ? '来客予測モデルの学習係数・自己採点つき' : '条件別集計'}）\n${patternStats}`
    : ''
  const insights = buildBaseInsights(reports, baseName)
  const eventCorr = buildEventCorrelation(reports, baseName, events)
  const eventList = buildEventListText(events)
  const weatherCorr = buildWeatherCorrelation(reports, baseName, weather)
  const competitors = buildCompetitorContext(reports, baseName)
  const decomposition = buildContributionDecomposition(reports, baseName)
  const anomalies = buildAnomalyDays(reports, baseName, events, weather)
  const forecastCtx = buildForecastContext(forecast)
  const primary = resolveGroqTextModel(Deno.env.get('FOODCOURT_GROQ_MODEL'), GROQ_TEXT_FOODCOURT_MODEL)
  const fallbackModel = GROQ_TEXT_FALLBACK_MODEL

  // 日報（施策記録）＋週内の施策×実績効果対照
  const weekLogs = dailyLogs.filter((l) => {
    const d = String((l as { log_date?: unknown }).log_date ?? '').slice(0, 10)
    return d >= weekStart && d <= weekEnd
  })
  const nippou = buildFoodCourtNippouBlocks(weekLogs, reports, baseName, events)
  const nippouRules = foodCourtNippouPromptRules(baseName)
  const logsBlock = nippou.hasNippou
    ? `# 日報リンク（${weekStart}〜${weekEnd}）\n${nippou.block}`
    : ''

  // --- 専門AI並列実行（期間サマリーと同じ4体構成）---
  const quantSystem = [
    `あなたは「${baseName}」専属の他店舗比較・過去実績データ分析専門家です。`,
    `担当は「対象週の他店舗との関係」と「過去の実績データとの比較」のみ。`,
    `(1) 今週の客単価・順位が業態から見て妥当か想定外かを判定する。`,
    `(2) 真の競合視点で、今週の順位の意味を語る（単純な順位の言い換えを避ける）。`,
    `(3) 客数要因か客単価要因かを切り分ける（与えられた分解データを使う）。`,
    `(4) 今週が自店史の中でどの程度の位置（好調/不調/平常）かを語る。`,
    `出力は「統合担当AIへの分析メモ」。見出し＋箇条書きで簡潔に（350字程度）。`,
  ].join('\n')
  const quantUser = `今週の分析メモを書いてください。\n\n# 対象週の事実\n${periodFacts}\n\n# 競合プロファイル\n${competitors}\n\n# 全体傾向\n${insights || '(履歴不足)'}\n\n# 要因分解\n${decomposition || '(日数不足)'}\n\n# 異常値\n${anomalies || '(外れ値なし)'}${patternBlock ? '\n\n' + patternBlock : ''}`

  const extSystem = [
    `あなたは「${baseName}」専属の、会場イベント・天気の需要ドライバー分析専門家です。`,
    `(1) 今週のイベント構成（種別・規模・客層）が客数・売上に与えた影響を説明する。`,
    `(2) 今週の天気（雨の日の比率）が客足に与えた影響を説明する。`,
    `(3) 来週の予定イベントがあれば、活かせる打ち手を一言添える。`,
    `出力は「統合担当AIへの分析メモ」。見出し＋箇条書きで簡潔に（300字程度）。`,
  ].join('\n')
  const extUser = `今週の分析メモを書いてください。\n\n# 対象週の事実\n${periodFacts}\n\n# イベント相関\n${eventCorr || '(データなし)'}\n\n# 来週のイベント予定\n${eventList || '(予定なし)'}\n\n# 天気相関\n${weatherCorr || '(データなし)'}`

  const opsSystem = [
    `あなたは「${baseName}」専属の、飲食店経営アドバイザー（運営改善担当）です。`,
    `担当は「今週の施策の効果を日報×実績で検証し、来週の重点アクションを3〜5件出すこと」。`,
    nippouRules,
    `(1) 日報の「現場が試したこと」を引用し、効果対照の前日比・同曜日比で効果を数値化する。`,
    `(2) 効果があった施策は継続・強化を、効果が薄かった施策は改善案を提案する。担当者評価と実績の不一致も書く。`,
    `(3) 来週の重点施策を3〜5件、「狙う客層/実施条件/見るべきKPI」セットで具体的に書く。`,
    `出力は「統合担当AIへの経営改善メモ」。見出し＋箇条書きで簡潔に（400字程度）。`,
  ].join('\n')
  const opsUser = `今週の経営改善メモを書いてください。\n\n# 対象週の事実\n${periodFacts}\n\n${logsBlock ? logsBlock + '\n\n' : ''}# 競合プロファイル\n${competitors}\n\n# 要因分解\n${decomposition || '(日数不足)'}\n\n# 来週のイベント予定\n${eventList || '(予定なし)'}${patternBlock ? '\n\n' + patternBlock : ''}`

  const criticSystem = [
    `あなたは「${baseName}」週次分析の反証・品質管理担当です。`,
    `専門AIメモのうち、言い過ぎ・根拠不足・相関と因果の混同・データに無い数字を検出する。`,
    `日報施策の効果断定は効果対照の数値が無いなら「仮説に弱める」よう指摘する。`,
    `採用してよい主張、弱めるべき主張、禁止すべき断定を箇条書きで短く書く（250字程度）。`,
  ].join('\n')

  const [quantRes, extRes, opsRes, xTrendBrief] = await Promise.all([
    foodCourtAiChat([{ role: 'system', content: quantSystem }, { role: 'user', content: quantUser }], groqApiKey, primary, 600, 'groq', fallbackModel, { deadlineAt, perProviderMs: 25000, fallbackLog: { supabase, storeKey, surface: 'weekly_report', role: 'specialist_quant' } }),
    foodCourtAiChat([{ role: 'system', content: extSystem }, { role: 'user', content: extUser }], groqApiKey, primary, 600, 'gemini', fallbackModel, { deadlineAt, perProviderMs: 25000, fallbackLog: { supabase, storeKey, surface: 'weekly_report', role: 'specialist_ext' } }),
    foodCourtAiChat([{ role: 'system', content: opsSystem }, { role: 'user', content: opsUser }], groqApiKey, primary, 700, 'grok', fallbackModel, { deadlineAt, perProviderMs: 25000, fallbackLog: { supabase, storeKey, surface: 'weekly_report', role: 'specialist_ops' } }),
    fetchFoodCourtXTrendBrief(foodCourtXTrendTopic(), foodCourtXTrendSoftTimeoutMs(deadlineAt), supabase, storeKey),
  ])
  const xTrendBlock = formatFoodCourtXTrendBlock(xTrendBrief)
  for (const u of [quantRes.usage, extRes.usage, opsRes.usage]) {
    if (u) await recordFoodCourtAiUsage(supabase, String(storeKey ?? ''), null, u)
  }
  const quantNote = quantRes.content || '(他店舗・過去データ分析メモ: 取得失敗)'
  const extNote = extRes.content || '(イベント・天気分析メモ: 取得失敗)'
  const opsNote = opsRes.content || '(経営改善メモ: 取得失敗)'

  const criticUser = `# 対象週の事実\n${periodFacts}\n\n# 専門AIメモ\n## 他店舗・過去データ\n${quantNote}\n\n## イベント・天気\n${extNote}\n\n## 経営改善・施策効果\n${opsNote}\n\n${logsBlock || '(日報なし)'}`
  const criticRes = await foodCourtAiChat([{ role: 'system', content: criticSystem }, { role: 'user', content: criticUser }], groqApiKey, primary, 500, 'claude', fallbackModel, { deadlineAt, perProviderMs: 25000, fallbackLog: { supabase, storeKey, surface: 'weekly_report', role: 'critic' } })
  if (criticRes.usage) await recordFoodCourtAiUsage(supabase, String(storeKey ?? ''), null, criticRes.usage)
  const criticNote = criticRes.content || '(反証メモ: 取得失敗)'

  // --- 統合AI: 週次経営レポートフォーマットで出力 ---
  const system = [
    `あなたは「${baseName}」（東京ドーム内フードホール「FOOD STADIUM TOKYO」の1店舗）の経営アドバイザーです。`,
    `目的は先週（${weekStart}〜${weekEnd}）の実績について、経営者に週次で届ける「経営レポート」を作ることです。日報がある週は日報リンクの施策効果レポートとしても書く。`,
    `以下の専門AIメモを参考意見として使い、「対象週の事実」と「日報×実績 効果対照」の数値で裏取りしてから採否を判断する。反証メモで禁止された断定は使わない。`,
    ...foodCourtXTrendRule(xTrendBlock, '「来週の重点施策」・メニューや商品の方向性・客層の見立て'),
    FOODCOURT_ACTION_FORMAT_RULE,
    nippouRules,
    `【出力フォーマット・厳守】必ず次の5つの見出しを、この順番・この表記（##で始める）で出力すること。`,
    `## 週次総評`,
    `今週の総合評価（強い/弱い/平常）を2〜3文＋主要因。前週と比較できる場合は言及する。`,
    `## 売上・客数の推移`,
    `週合計売上・客数・平均順位・フードコート内シェアを3〜4文で説明する。曜日ごとの波が読み取れる場合は言及する。`,
    `## 施策効果測定`,
    `日報の「現場が試したこと」を引用し、効果対照の前日比・同曜日比でどれだけ実績につながったかを2〜4文で評価する。日報が無い場合はその旨とデータから読み取れる動きのみ。`,
    `## 環境要因（イベント・天気）`,
    `今週のイベント・天気が売上・客数に与えた影響を2〜3文で説明する。施策効果との切り分け候補にも触れる。`,
    `## 来週の重点施策`,
    `来週に向けた具体的なアクションを3〜5件、箇条書きで書く（「狙う客層」「実施タイミング」「確認すべきKPI」をセットで）。日報の学びを接続する。`,
    `各見出しの本文は経営者が読む想定で、プロフェッショナルかつ具体的に書く。断定できないことは「仮説」と明示する。`,
  ].join('\n')
  const learningMemory = await loadFoodCourtLearningMemory(supabase, storeKey, 'weekly_report', `${weekStart} ${weekEnd} ${periodFacts}`)
  const contextBlock = `# 対象週の事実\n${periodFacts}\n\n# 競合プロファイル\n${competitors}\n\n${logsBlock ? logsBlock + '\n\n' : ''}# 他店舗・過去データ分析メモ\n${quantNote}\n\n# イベント・天気分析メモ\n${extNote}\n\n# 経営改善・施策効果メモ\n${opsNote}\n\n# 反証メモ\n${criticNote}${patternBlock ? '\n\n' + patternBlock : ''}${learningMemory ? '\n\n' + learningMemory : ''}${xTrendBlock ? '\n\n' + xTrendBlock : ''}`
  const baseMessages = [
    { role: 'system', content: system },
    { role: 'user', content: `# 分析の材料\n${contextBlock}\n\n上記フォーマット厳守で、${weekStart}〜${weekEnd}の週次経営レポートを作成してください。` },
  ]

  const loopResult = await runFoodCourtLoopEngineering({
    surface: 'weekly_report',
    initialGenerate: (feedback, previousAnswer) => foodCourtAiChat(
      feedback && previousAnswer ? appendLoopFeedback(baseMessages, feedback, previousAnswer) : baseMessages,
      groqApiKey, primary, 1800, 'openai', fallbackModel,
      { deadlineAt, perProviderMs: 35000, fallbackLog: { supabase, storeKey, surface: 'weekly_report', role: 'integrator' } },
    ),
    evaluationContext: contextBlock,
    numberAuditFacts: `# コード計算・日報原文のみ\n${periodFacts}\n${logsBlock || ''}\n${patternBlock || ''}`,
    question: `「${baseName}」の${weekStart}〜${weekEnd}週の経営レポートを5見出しフォーマット厳守で生成するタスク`,
    sourceRef: { week_start: weekStart, week_end: weekEnd, surface: 'weekly_report' },
    groqApiKey,
    primaryModel: primary,
    fallbackModel,
    supabase,
    storeKey,
    deadlineAt,
  })
  for (const u of loopResult.usages) await recordFoodCourtAiUsage(supabase, String(storeKey ?? ''), null, u)
  return { report: loopResult.answer, rawData, loopScore: loopResult.loopScore, loopCount: loopResult.loopCount }
}
