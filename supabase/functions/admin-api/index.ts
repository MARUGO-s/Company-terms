import "jsr:@supabase/functions-js/edge-runtime.d.ts"
// deploy re-trigger marker (2026-07-09)
import {
  importDailyReceiptsOverwrite,
  importManualMonthSalesOverwrite,
  clearDailyReceiptsForMonth,
  parseMonthlyDailySalesWorkbook,
  resolveReceiptTableForStore,
  countExistingReceiptsForDates,
  type DailySalesImportEntry,
  type ManualMonthImportEntry,
} from "../_shared/daily_sales_import.ts"
import {
  classifyKnowledgeFile,
  extractKnowledgeText,
  isBlankExtract,
} from "../_shared/knowledge_file_extract.ts"
import {
  assessKnowledgeMenuQuality,
  buildStructuredKnowledgeMenuBody,
  normalizeKnowledgeMenuItems,
  scoreKnowledgeMenuExtraction,
} from "../_shared/knowledge_menu_extract.ts"
import {
  buildKnowledgeCommonPromptBlock,
  buildStoreKnowledgeSpecializedPromptBlock,
  KNOWLEDGE_MENU_EXTRACTION_PROMPT_BLOCK,
} from "../_shared/knowledge_menu_prompt.ts"
import { hasKnowledgeMemoTag, stripKnowledgeMemoTag } from "../_shared/knowledge_memo_tag.ts"
import { isJobTitleLabel, JOB_TITLE_OPTIONS, jobTitleSortRank } from "../_shared/job_titles.ts"
import {
  purgeLineAdminRoom,
  purgeMtalkGroup,
  purgeMtalkGroupAsAdmin,
  restoreLineAdminRoom,
} from "../_shared/room_hard_delete.ts"
import {
  isMarugoGroupStoreLabel,
  MARUGO_GROUP_STORE_OPTIONS,
  STORE_COORDINATES,
} from "../_shared/marugo_group_stores.ts"
import {
  listReceiptSheetsStores,
} from "../_shared/receipt_sheets_store_catalog.ts"
import {
  annotateReservationChronology,
  aggregateReservationAiItems,
  aggregateReservationAiItemsByMonth,
  buildReservationDailyRagText,
  emptyReservationAiTotals,
  enumerateReservationDateKeys,
  mergeReservationAiFactsPayloads,
  reservationJstDateKey,
  type ReservationAiFactItem,
  type ReservationAiFactsPayload,
  type ReservationChronologyItem,
} from "../_shared/reservation_ai_cache.ts"
import {
  allocateDailyBudgetsForMonth,
  enumerateMonthDates,
  mergeStoreClosedDateLists,
  parseStoreClosedDatesForMonth,
  type SalesBudgetAllocationWeights,
} from "../_shared/sales_budget_allocation.ts"
import { fetchJapaneseHolidayMap } from "../_shared/japanese_holidays.ts"
import {
  type JournalSalesSyncResult,
  syncJournalSalesFromReport,
} from "../_shared/journal_sales_sync.ts"
import { EXPENSE_RECEIPT_PROMPT_ADDITION, RECEIPT_VISION_SYSTEM_PROMPT_BASE, STORE_RECEIPT_PROMPT_MAX_CHARS } from "../_shared/receipt_prompt.ts"
import { GROQ_VISION_BASE64_MAX_BYTES } from "../_shared/receipt_types.ts"
import { analyzeExpenseReceiptWithAzureFoundry, analyzeLineImageWithGemini, AZURE_FOUNDRY_VISION_MODEL, needsGeminiProPettyCashReview, shouldFallbackLineImageVisionFailure, type LineImageVisionUsage } from "../_shared/receipt_vision.ts"
import { extractExpenseFromReceipt } from "../_shared/petty_cash_flow.ts"
import {
  answerFoodCourtQuestion,
  FOODCOURT_ANALYSIS_AI_VERSION,
  resolveFoodCourtDailyAnalysisVersion,
  generateFoodCourtDailySummary,
  generateFoodCourtPeriodSummary,
  generateFoodCourtWeeklyReport,
  fcSalesDate,
} from "../_shared/foodcourt_compare.ts"
import { buildFoodcourtJournalCoverage } from "../_shared/foodcourt_journal_coverage.ts"
import { sanitizeJournalAiPayload } from "../_shared/journal_ai_privacy.ts"
import {
  assessFoodCourtEvolutionReadiness,
  FOODCOURT_PASSING_SCORE_MAX,
  FOODCOURT_PASSING_SCORE_MIN,
  normalizeFoodCourtPassingScore,
} from "../_shared/foodcourt_loop_utils.ts"
import { buildFoodCourtDistillationRecords } from "../_shared/foodcourt_distillation.ts"
import {
  pushLineMessagesToTarget,
  resolveChannelAccessToken,
  resolveGeminiApiKey,
  resolveReceiptGeminiFlashModel,
  resolveReceiptGeminiModel,
} from "../_shared/line_client.ts"
import {
  fetchManualMonthSales,
  fetchManualMonthSalesMapForStore,
  upsertManualMonthSalesEntries,
} from "../_shared/manual_month_sales.ts"
import {
  upsertManualDayBudgetEntries,
  upsertManualDaySalesEntries,
} from "../_shared/manual_day_sales.ts"
import {
  RECEIPT_STORE_PARTITION_UNKNOWN,
  toReceiptStorePartitionKey,
} from "../_shared/receipt_report_aggregate.ts"
import { resolveReceiptNamePartitionKey } from "../_shared/receipt_store_name_resolve.ts"
import {
  fetchAnalyticsMonthly as fetchStoreAnalyticsMonthly,
  fetchManualMonthsForYearState as fetchStoreManualMonthsForYearState,
  fetchReceiptDailyAggForRange,
  fetchReceiptSalesState as fetchStoreReceiptSalesState,
  fetchReceiptStoreOptions as fetchStorePartitionReceiptOptions,
  fetchReceiptWebhookStatus,
  upsertManualMonthEntries as upsertStoreManualMonthEntries,
  upsertReceiptSalesBudget as upsertStoreReceiptSalesBudget,
  updateStoreReceiptPhones,
} from "../_shared/admin_receipt_sales.ts"
import {
  deactivateCompetitorPlace,
  deactivateStoreReviewPlace,
  ensureStoreReviewProfile,
  fetchCompetitorReviewContext,
  fetchStoreReviewContext,
  nearbySearchGooglePlaces,
  refreshCompetitorReviews,
  refreshStoreReview,
  searchStoreReviewPlaces,
  upsertCompetitorPlace,
  upsertStoreReviewPlace,
} from "../_shared/competitor_review_context.ts"
import { isReceiptRoomAutoLinkEnabled } from "../_shared/auto_link_room.ts"
import {
  authenticateAdminDashboardSessionToken,
  exchangeAdminDashboardLoginLinkToken,
  exchangeRoomConfigLoginLink,
  hashRoomConfigPassword,
  issueAdminDashboardLoginLinkToken,
  issueAdminDashboardSessionToken,
  CHAT_MEDIA_VIEW_SCOPE,
  CHAT_JOURNAL_AI_SCOPE,
  FOODCOURT_DAILY_LOG_SCOPE,
  FOODCOURT_DASHBOARD_SCOPE,
  FOODCOURT_WEEKLY_VIEW_SCOPE,
  PETTY_CASH_SCOPE,
  RECEIPT_ANALYTICS_SCOPE,
  REUSABLE_VIEW_LINK_TTL_SEC,
  RESERVATION_CALENDAR_SCOPE,
  revokeAdminDashboardSessionToken,
  revokeAllAdminDashboardAuthTokens,
  ROOM_CONFIG_SCOPE,
  STORE_LINK_SCOPES,
  validateChatScopedSessionAccess,
} from "../_shared/admin_dashboard_link_auth.ts"
import {
  CHAT_ADMIN_CAPABILITIES,
  MTALK_ADMIN_SCOPE,
  chatAdminAllowsAudit,
  chatAdminAllowsRoom,
  chatAdminAllowsUser,
  hasChatAdminCapability,
  headquartersChatAdminAuthority,
  loadMtalkAdminAuthority,
  publicChatAdminAuthority,
  type ChatAdminAuthority,
  type ChatAdminCapability,
  type ChatAdminScopeMode,
} from "../_shared/chat_admin_delegation.ts"
import { saveMediaBytesToLibrary } from "../_shared/line_media_store.ts"
import {
  ADMIN_ACCESS_HISTORY_KEEP,
  actorFromAuth,
  classifyAdminAccess,
  insertAdminAccessEvent,
} from "../_shared/admin_access_log.ts"
import {
  fetchWeatherDailyRange,
  fetchWeatherDailyState,
} from "../_shared/weather_daily.ts"
import {
  fetchLineRoomCalendarSearchState,
  fetchLineRoomMessageSearchState,
} from "../_shared/line_room_message_search.ts"
import {
  applyCachedWeatherToPosJournalDays,
  buildJournalSavedReportsFromPosDays,
  buildPosJournalCategoryRules,
  type PosJournalCategoryRules,
  buildJournalSavedReportHtml,
  buildPosJournalSummary,
  buildPosJournalDaysFromSavedReports,
  detectPosJournalStoreCode,
  parsePosJournalLzh,
  mergePosJournalDaysPreferPrimary,
  pickBestJournalSavedReportDays,
  POS_JOURNAL_REPORT_PARSER_VERSION,
  POS_JOURNAL_STORE_CODE_MAP,
  posJournalDayNeedsWeather,
  resolvePosJournalStore,
  resolvePosJournalStoreByKey,
  type PosJournalDay,
} from "../_shared/pos_journal.ts"
import {
  answerPosJournalAiQuestion,
  buildPosJournalAiFacts,
  generatePosJournalAiAnalysis,
  normalizePosJournalAiHistory,
  normalizePosJournalAiQuestion,
  normalizePosJournalAiSummary,
  type PosJournalAiUsage,
} from "../_shared/pos_journal_ai.ts"
import {
  scanRowsByAscendingId,
  type AscendingIdScanResult,
} from "../_shared/paged_row_scan.ts"
import {
  aggregateJournalProductMonthlyRows,
  extractNetProductItemsFromReceipt,
  extractProductLinesFromParsedDay,
  indexRowMatchesProductFilter,
  normalizePosProductSearchText as normalizePosProductSearchTextShared,
  reconcileParsedJournalDayDetail,
  summarizeJournalProductDetailCoverage,
  type JournalProductDayDetail,
  type JournalProductDetailCoverage,
  type JournalProductLineItem,
} from "../_shared/journal_product_index.ts"
import {
  normalizeReminderSlots,
} from "../_shared/calendar_tomorrow_reminder.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.0"
import JSZip from "https://esm.sh/jszip@3.10.1"
import { isMtalkSyntheticRoomId, mtalkSyntheticRoomId } from "../_shared/mtalk_room_id.ts"
import {
  ensureMtalkRoomSettings,
  loadMtalkStoreBot,
  mtalkUserCanAccessStore,
  resolveMtalkRoomStoreKey,
} from "../_shared/mtalk_room_settings.ts"
import {
  buildMtalkMenuKnowledgeCard,
  normalizeMtalkMenuKnowledgeAnalysis,
} from "../_shared/mtalk_menu_knowledge.ts"

const ADMIN_SURFACE_LEGACY = "legacy"
const ADMIN_SURFACE_LINE_REPORT = "line_report"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token, x-admin-surface",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
}

const FOODCOURT_WEEKLY_REPORT_PAGE_BASE = "https://marugo-s.github.io/line_report/foodcourt-weekly-report.html"

const STORE_LINK_ALLOWED_REQUESTS: Readonly<Record<string, ReadonlySet<string>>> = {
  [RESERVATION_CALENDAR_SCOPE]: new Set([
    "GET /reservations/calendar",
    "GET /reservations/search",
  ]),
  [PETTY_CASH_SCOPE]: new Set([
    "GET /petty-cash",
    "GET /petty-cash/receipt-media",
  ]),
  [RECEIPT_ANALYTICS_SCOPE]: new Set([
    "GET /analytics/holidays",
    "GET /analytics/monthly",
    "GET /weather/daily",
    "GET /receipts/sales",
    "GET /receipts/sales-budget",
    "GET /receipts/sales-daily-budget",
    "GET /receipts/sales-manual-days",
    "GET /receipts/sales-manual-months",
  ]),
  [FOODCOURT_DASHBOARD_SCOPE]: new Set([
    "GET /foodcourt/reports",
    "GET /foodcourt/daily-summary",
    "GET /foodcourt/daily-summary/list",
    "GET /foodcourt/weekly-report",
    "GET /foodcourt/weekly-report/list",
    "GET /foodcourt/period-summary",
    "GET /foodcourt/qa-history",
    "POST /foodcourt/ask",
  ]),
  [FOODCOURT_DAILY_LOG_SCOPE]: new Set([
    "GET /foodcourt/daily-logs",
    "GET /foodcourt/reports",
    "PUT /foodcourt/daily-logs",
  ]),
  [FOODCOURT_WEEKLY_VIEW_SCOPE]: new Set([
    "GET /foodcourt/weekly-report",
  ]),
  [CHAT_JOURNAL_AI_SCOPE]: new Set([
    "GET /pos-journals/saved-reports",
    "GET /pos-journals/saved-reports/item",
    "GET /pos-journals/product-search",
    "GET /pos-journals/product-cohort",
    "POST /pos-journals/cohort-compare",
    "POST /foodcourt/journal-deep-analysis",
  ]),
}

// CRON_AUTH_TOKEN は「内部処理なら何でもできる鍵」にはしない。現在この関数へ
// cron が直接委譲する2処理だけを明示し、管理APIの他経路への横展開を拒否する。
const CRON_ALLOWED_REQUESTS = new Set<string>([
  "POST /reservations/ai-cache/rebuild",
  "POST /foodcourt/weekly-report",
])

function isStoreLinkRequestAllowed(scopeKind: string | null, method: string, path: string): boolean {
  if (method === "POST" && path === "/auth/logout") return true
  if (!scopeKind || !STORE_LINK_SCOPES.has(scopeKind)) return false
  return STORE_LINK_ALLOWED_REQUESTS[scopeKind]?.has(`${method.toUpperCase()} ${path}`) === true
}

const GENERIC_LINK_LOGIN_SCOPES = [
  ...[...STORE_LINK_SCOPES].filter((scope) => scope !== CHAT_JOURNAL_AI_SCOPE),
  MTALK_ADMIN_SCOPE,
]

async function resolveFoodCourtPassingAwareCacheVersion(
  supabase: ReturnType<typeof createClient>,
  baseVersion: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("line_admin_console_settings")
    .select("setting_value")
    .eq("setting_key", "foodcourt_evolution_passing_score")
    .maybeSingle()
  if (error) {
    console.error("Failed to load foodcourt passing score for cache version:", error.message)
    return baseVersion
  }
  const score = normalizeFoodCourtPassingScore(data?.setting_value)
  return score == null ? baseVersion : `${baseVersion}-pass${score}`
}

type FoodCourtLoopScoreInfo = { loop_score: number | null; loop_count: number }

async function loadLatestFoodCourtLoopScore(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
  surface: "daily_summary" | "period_summary",
  sourceRef: Record<string, unknown>,
): Promise<FoodCourtLoopScoreInfo> {
  const { data, error } = await supabase
    .from("foodcourt_ai_loop_runs")
    .select("source_ref, final_score, final_loop_index, created_at")
    .ilike("store_partition_key", storeKey)
    .eq("surface", surface)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(100)
  if (error) {
    console.error(`Failed to load ${surface} loop score:`, error.message)
    return { loop_score: null, loop_count: 0 }
  }
  const row = (Array.isArray(data) ? data : []).find((candidate) => {
    const actual = candidate && typeof candidate.source_ref === "object" && candidate.source_ref
      ? candidate.source_ref as Record<string, unknown>
      : {}
    return Object.entries(sourceRef).every(([key, expected]) => String(actual[key] ?? "") === String(expected ?? ""))
  })
  if (!row) return { loop_score: null, loop_count: 0 }
  const score = row.final_score == null ? null : Number(row.final_score)
  const count = row.final_loop_index == null ? 0 : Number(row.final_loop_index)
  return {
    loop_score: score != null && Number.isFinite(score) ? score : null,
    loop_count: Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0,
  }
}

function weeklyReportHtml(report: string): string {
  const escape = (value: string) => value.replace(/[&<>\"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c] ?? c))
  return `<article class="weekly-report-content">${escape(report).replace(/\n/g, "<br>")}</article>`
}

async function buildFoodCourtWeeklyReportLink(supabase: ReturnType<typeof createClient>, storeKey: string, weekStart: string): Promise<string> {
  // 閲覧専用（設定変更なし）なので35日間は再利用できる。実質無期限にはせず、
  // 交換後セッションも30分に限定する。
  const issued = await issueAdminDashboardLoginLinkToken(
    supabase,
    {
      source: "line_foodcourt_weekly",
      store_partition_key: storeKey,
      scope: FOODCOURT_WEEKLY_VIEW_SCOPE,
      reusable: true,
    },
    { ttlSeconds: REUSABLE_VIEW_LINK_TTL_SEC },
  )
  const params = new URLSearchParams({ store_key: storeKey, week_start: weekStart, from: "line", lt: issued.token })
  return `${FOODCOURT_WEEKLY_REPORT_PAGE_BASE}?${params.toString()}`
}

/**
 * ルーム×週で1回だけLINE送信を許可する（先に予約行を確保してから送信する方式）。
 * foodcourt-weekly-report-cron は5分おきに±5分の許容誤差で起動するため、分ぴったりの設定
 * （例: minute=0）だと同一時間帯に複数回一致し、二重送信が起きる。この関数で吸収する。
 */
async function reserveFoodCourtWeeklyReportSend(
  supabase: ReturnType<typeof createClient>,
  roomId: string,
  weekStart: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("foodcourt_weekly_report_sends")
    .insert({ room_id: roomId, week_start: weekStart })
  if (error) {
    if (String((error as { code?: string }).code ?? "") === "23505") return false
    console.error("reserveFoodCourtWeeklyReportSend insert failed:", error.message)
    return false
  }
  return true
}

function buildWeeklyReportFlexMessage(weekStart: string, weekEnd: string, reportUrl: string): Record<string, unknown> {
  return {
    type: "flex",
    altText: `📊 フードコート週次レポート（${weekStart}〜${weekEnd}）を作成しました。`,
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1a3a5c",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "📊 フードコート週次レポート", color: "#ffffff", size: "sm", weight: "bold" },
          { type: "text", text: `${weekStart}（月）〜 ${weekEnd}（日）`, color: "#a8c4e0", size: "xs", margin: "xs" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "16px",
        contents: [
          {
            type: "box", layout: "horizontal", spacing: "sm",
            contents: [
              { type: "text", text: "週売上合計", color: "#666666", size: "xs", flex: 1 },
              { type: "text", text: "客数・客単価", color: "#666666", size: "xs", flex: 1 },
              { type: "text", text: "週平均売上順位", color: "#666666", size: "xs", flex: 1 },
            ],
          },
          { type: "text", text: "Webで詳細・グラフを確認できます", color: "#888888", size: "xxs", margin: "md", wrap: true },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        contents: [
          {
            type: "button",
            action: { type: "uri", label: "📈 レポートを開く", uri: reportUrl },
            style: "primary",
            color: "#1a3a5c",
            height: "sm",
          },
        ],
      },
    },
  }
}

type AppError = {
  status: number
  message: string
}

type AuthenticatedAdmin = {
  ok: true
  storeScope: string | null
  roomScope: string | null
  scopeKind: string | null
  chatAdminAuthority: ChatAdminAuthority | null
  actorLabel: string | null
}

type AdminAuthenticationResult = AuthenticatedAdmin | {
  ok: false
  status: number
  message: string
}

type MessageCleanupTiming = "after_each_delivery" | "end_of_day"
type LastDeliverySummaryMode = "independent" | "daily_rollup"
type MessageRetentionDays = 0 | 60 | 120 | 180 | 365 | 730 | 1095
type StorageUsageTableStat = {
  table_name: string
  size_bytes: number
  size_pretty: string
}
type StorageUsageStats = {
  database_size_bytes: number
  database_size_pretty: string
  managed_tables_total_bytes: number
  managed_tables_total_pretty: string
  managed_tables: StorageUsageTableStat[]
}
type MediaType = "image" | "video" | "audio" | "file"
type MediaListRow = {
  id: number
  message_id: string | null
  line_message_id: string
  room_id: string
  room_name: string | null
  user_id: string | null
  sender_display_name: string | null
  media_type: MediaType
  storage_bucket: string
  storage_path: string
  original_file_name: string | null
  mime_type: string | null
  file_size_bytes: number
  content_preview: string | null
  created_at: string
}
type MediaMessageContext = {
  before_text: string | null
  before_at: string | null
  after_text: string | null
  after_at: string | null
}
type DocumentMimeType =
  | "text/plain"
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
type DocumentListRow = {
  id: number
  room_id: string | null
  room_name: string | null
  storage_bucket: string
  storage_path: string
  original_file_name: string
  mime_type: DocumentMimeType
  file_size_bytes: number
  extracted_text: string
  source: string
  created_at: string
  updated_at: string
}
type DocumentViewerPermissionState = {
  document_id: number
  mode: "public" | "restricted"
  allowed_user_ids: string[]
}
type LineUserPermissionRow = {
  line_user_id: string
  display_name: string | null
  is_active: boolean
  can_message_search: boolean
  can_library_search: boolean
  can_calendar_create: boolean
  can_calendar_update: boolean
  can_calendar_view: boolean
  can_media_access: boolean
  excluded_message_search_room_ids: string[]
  assigned_store: string | null
  assigned_job_title: string | null
  updated_at: string
}

const MEDIA_SIGNED_URL_EXPIRES_SEC = 60 * 30
const MEDIA_LIST_DEFAULT_LIMIT = 24
const MEDIA_LIST_MAX_LIMIT = 100
const MEDIA_STORAGE_CAP_BYTES = 2 * 1024 * 1024 * 1024
const DEFAULT_MEDIA_UPLOAD_MAX_MB = 10
const MAX_MEDIA_UPLOAD_MAX_MB = 20
const LINE_DOCUMENT_BUCKET = "line-documents"
const DOCUMENT_LIST_DEFAULT_LIMIT = 20
const DOCUMENT_LIST_MAX_LIMIT = 100
const DOCUMENT_UPLOAD_MAX_BYTES = 20 * 1024 * 1024
const DOCUMENT_EXTRACT_MAX_CHARS = 250000
const DOCUMENT_PREVIEW_MAX_CHARS = 240
const DOCUMENT_PDF_EXTRACT_MAX_PAGES = 120
const DOCUMENT_TEXT_BINARY_RATIO_MAX = 0.08
const PETTY_CASH_RECEIPT_IMAGE_BUCKET = "line-media"
const PETTY_CASH_RECEIPT_IMAGE_MAX_BYTES = GROQ_VISION_BASE64_MAX_BYTES
const POS_JOURNAL_BUCKET = "pos-journals"
const POS_JOURNAL_UPLOAD_MAX_BYTES = 8 * 1024 * 1024
const POS_JOURNAL_UPLOAD_MAX_FILES = 62
const POS_JOURNAL_REPARSE_MAX_FILES = 20
const POS_JOURNAL_AUTO_REPORT_SOURCE = "pos_journal_upload"
/** 売上レポート表示用HTML（PDF元）。数値正本ではない。 */
const POS_REPORT_HTML_BUCKET = "pos-report-html"
const POS_REPORT_HTML_MAX_BYTES = 5 * 1024 * 1024
const AZURE_RECEIPT_MODEL = AZURE_FOUNDRY_VISION_MODEL
const PDFJS_MODULE_URL = "https://esm.sh/pdfjs-dist@4.10.38/build/pdf.mjs"
const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

/** OOXML SpreadsheetML — explicit NS first; fall back when DOM omits default NS or `*` behaves oddly. */
const OFFICE_SPREADSHEETML_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"

function getSheetElementsLive(root: Document | Element, localName: string): HTMLCollectionOf<Element> {
  const byNs = root.getElementsByTagNameNS(OFFICE_SPREADSHEETML_NS, localName)
  if (byNs.length > 0) return byNs
  const byStar = root.getElementsByTagNameNS("*", localName)
  if (byStar.length > 0) return byStar
  return root.getElementsByTagName(localName) as HTMLCollectionOf<Element>
}
const DOCUMENT_ARCHIVE_MAX_XML_ENTRIES = 120
const DOCUMENT_ARCHIVE_MAX_ENTRIES = 400
const DOCUMENT_ARCHIVE_TOTAL_UNCOMPRESSED_MAX_BYTES = 80 * 1024 * 1024
const DOCUMENT_ARCHIVE_SINGLE_ENTRY_MAX_BYTES = 24 * 1024 * 1024
const DOCUMENT_ARCHIVE_MAX_COMPRESSION_RATIO = 40
const DOCUMENT_ARCHIVE_ENTRY_MAX_BYTES = 8 * 1024 * 1024
const ADMIN_RATE_LIMIT_DEFAULT_WINDOW_MS = 60 * 1000
const ADMIN_RATE_LIMIT_DEFAULT_MAX_REQUESTS = 180
const ADMIN_RATE_LIMIT_UPLOAD_WINDOW_MS = 60 * 1000
const ADMIN_RATE_LIMIT_UPLOAD_MAX_REQUESTS = 12
const USER_PERMISSION_LIST_DEFAULT_LIMIT = 100
const USER_PERMISSION_LIST_MAX_LIMIT = 300
/** Max rows fetched before in-memory sort (pagination applied after sort). */
const USER_PERMISSION_SORT_FETCH_CAP = 10000
const RESERVATION_SEARCH_DEFAULT_LIMIT = 100
const RESERVATION_SEARCH_MAX_LIMIT = 200
const RESERVATION_SEARCH_SOURCE_FETCH_CAP = 240
const RESERVATION_CUSTOMER_HISTORY_FETCH_CAP = 10000
const RESERVATION_AI_FACTS_DEFAULT_LIMIT = 300
const RESERVATION_AI_FACTS_MAX_LIMIT = 500
const RESERVATION_AI_FACTS_MAX_MONTHS = 24
const RESERVATION_EVENT_PAGE_SIZE = 1000
const RESERVATION_EVENT_FETCH_MAX_ROWS = 100000
const RESERVATION_AI_CACHE_MONTHS = 24
const RESERVATION_AI_CACHE_TABLE = "reservation_ai_store_cache"
const RESERVATION_AI_CACHE_STALE_MS = 36 * 60 * 60 * 1000
const RESERVATION_CANCELLATION_RE = /(キャンセル|取消|取り消し|cancel(?:led|ed)?)/i

type ReservationEventTable =
  | "tabelog_reservation_visit_events"
  | "ikyu_reservation_visit_events"
  | "manual_reservation_visit_events"

type LineUserPermissionSortable = {
  display_name?: string | null
  line_user_id?: string | null
  assigned_job_title?: string | null
}

function userPermissionDisplaySortKey(row: LineUserPermissionSortable): string {
  const name = String(row.display_name ?? "").trim()
  if (name) return name.normalize("NFKC")
  return String(row.line_user_id ?? "").trim().normalize("NFKC")
}

function sortLineUserPermissionsForAdminDisplay<T extends LineUserPermissionSortable>(rows: T[]): T[] {
  const collator = new Intl.Collator("ja-JP", { sensitivity: "base", usage: "sort" })
  return [...rows].sort((a, b) => {
    const ra = jobTitleSortRank(a.assigned_job_title)
    const rb = jobTitleSortRank(b.assigned_job_title)
    if (ra !== rb) return ra - rb
    const sa = userPermissionDisplaySortKey(a)
    const sb = userPermissionDisplaySortKey(b)
    const c = collator.compare(sa, sb)
    if (c !== 0) return c
    return collator.compare(
      String(a.line_user_id ?? "").trim(),
      String(b.line_user_id ?? "").trim(),
    )
  })
}

type MediaUsageStats = {
  total_files: number
  total_bytes: number
}
type GmailLinkedAccountState = {
  enabled: boolean
  configured: boolean
  email_address: string | null
  history_id: string | null
  checked_at: string
  error: string | null
}
type PdfJsTextItem = {
  str?: unknown
}
type PdfJsTextContent = {
  items?: unknown
}
type PdfJsPage = {
  getTextContent: () => Promise<PdfJsTextContent>
  cleanup?: () => void
}
type PdfJsDocument = {
  numPages: number
  getPage: (pageNumber: number) => Promise<PdfJsPage>
  cleanup?: () => void
  destroy?: () => void | Promise<void>
}
type PdfJsLoadingTask = {
  promise: Promise<PdfJsDocument>
  destroy?: () => void | Promise<void>
}
type PdfJsModule = {
  getDocument: (source: Record<string, unknown>) => PdfJsLoadingTask
}
type OfficeZipEntry = {
  name: string
  dir: boolean
  async: (type: "string") => Promise<string>
}

let cachedPdfJsModulePromise: Promise<PdfJsModule | null> | null = null

// ルーム・セルフ設定で「ルームのユーザーが編集してよい安全なサブセット」(機能ON/OFF＋予約通知時刻)。
// bot_access_approved(承認) / receipt_report_store_partition_key(集計店舗) / is_enabled / room_name /
// パスワード列 などの機微フィールドはここに含めない＝room スコープからは絶対に変更させない。
const ROOM_CONFIG_SAFE_BOOL_FIELDS = [
  "bot_reply_enabled", "bot_reply_hard_mute_enabled",
  "message_search_enabled", "message_search_library_enabled",
  "send_room_summary", "receive_overall_summary_enabled",
  "media_file_access_enabled", "image_analysis_reply_enabled",
  "receipt_reply_executive_detail_enabled",
  "receipt_correction_reply_enabled", "non_receipt_image_reply_enabled",
  "media_save_enabled", "budget_entry_enabled", "petty_receipt_analysis_enabled",
  "receipt_midreport_enabled", "receipt_monthend_report_enabled",
  "gmail_reservation_alert_enabled", "today_reservation_alert_enabled",
  "calendar_tomorrow_reminder_enabled", "calendar_ai_auto_create_enabled",
  "calendar_silent_auto_register_enabled", "calendar_low_confidence_confirm_reply_enabled",
  "calendar_registration_reply_enabled", "dome_weekly_enabled",
  "review_alert_enabled", "foodcourt_weekly_report_enabled",
  "mtalk_web_search_enabled",
]

// M-talk雑談AIのWeb検索で使える Perplexity モデル。DBのCHECK制約と同じ集合を持つ。
// 許可外の値は null（＝既定 sonar）へ落とし、課金単価の高いモデルを勝手に指定させない。
const MTALK_WEB_SEARCH_MODELS_ALLOWED = new Set(["sonar", "sonar-pro"])
const ROOM_CONFIG_SAFE_SELECT = "room_id,room_name,room_config_access_enabled," +
  ROOM_CONFIG_SAFE_BOOL_FIELDS.join(",") +
  ",today_reservation_alert_hour,today_reservation_alert_minute" +
  ",calendar_tomorrow_reminder_hour,calendar_tomorrow_reminder_minute,calendar_reminder_slots" +
  ",dome_weekly_dow,dome_weekly_hour,dome_weekly_minute" +
  ",foodcourt_weekly_dow,foodcourt_weekly_hour,foodcourt_weekly_minute" +
  ",review_alert_hour,review_alert_minute" +
  ",gmail_alert_interval_minutes,gmail_alert_anchor_hour,gmail_alert_anchor_minute" +
  ",mtalk_web_search_model"

// 予約メール通知(gmail-alert-cron)の配信間隔（分）として許可する値。
// 1(既定・null扱い)=毎分チェック(リアルタイム)。それ以外は「N分おきにまとめて配信」。
const GMAIL_ALERT_INTERVAL_MINUTES_ALLOWED = new Set([1, 15, 30, 60, 120, 180, 360, 480, 720, 1440])

function buildRoomConfigSafePayload(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of ROOM_CONFIG_SAFE_BOOL_FIELDS) {
    if (f in body) out[f] = body[f] === true || body[f] === "true" || body[f] === 1
  }
  if ("today_reservation_alert_hour" in body) {
    const h = Number(body.today_reservation_alert_hour)
    out.today_reservation_alert_hour = (Number.isInteger(h) && h >= 0 && h <= 23) ? h : null
  }
  if ("today_reservation_alert_minute" in body) {
    const m = Number(body.today_reservation_alert_minute)
    out.today_reservation_alert_minute = (Number.isInteger(m) && m >= 0 && m <= 59) ? m : null
  }
  if ("calendar_tomorrow_reminder_hour" in body) {
    const h = Number(body.calendar_tomorrow_reminder_hour)
    out.calendar_tomorrow_reminder_hour = (Number.isInteger(h) && h >= 0 && h <= 23) ? h : null
  }
  if ("calendar_tomorrow_reminder_minute" in body) {
    const m = Number(body.calendar_tomorrow_reminder_minute)
    out.calendar_tomorrow_reminder_minute = (Number.isInteger(m) && m >= 0 && m <= 59) ? m : null
  }
  if ("calendar_reminder_slots" in body) {
    if (body.calendar_reminder_slots == null) {
      out.calendar_reminder_slots = null
    } else if (Array.isArray(body.calendar_reminder_slots)) {
      out.calendar_reminder_slots = normalizeReminderSlots(body.calendar_reminder_slots)
    }
  }
  // 東京ドーム週次配信の曜日・時刻（NULL許容＝既定 土6/10時/0分）
  if ("dome_weekly_dow" in body) {
    const v = Number(body.dome_weekly_dow)
    out.dome_weekly_dow = (Number.isInteger(v) && v >= 0 && v <= 6) ? v : null
  }
  if ("dome_weekly_hour" in body) {
    const v = Number(body.dome_weekly_hour)
    out.dome_weekly_hour = (Number.isInteger(v) && v >= 0 && v <= 23) ? v : null
  }
  if ("dome_weekly_minute" in body) {
    const v = Number(body.dome_weekly_minute)
    out.dome_weekly_minute = (Number.isInteger(v) && v >= 0 && v <= 59) ? v : null
  }
  // フードコート週次レポートの曜日・時刻（NULL許容＝既定 月曜1/9時/0分）
  if ("foodcourt_weekly_dow" in body) {
    const v = Number(body.foodcourt_weekly_dow)
    out.foodcourt_weekly_dow = (Number.isInteger(v) && v >= 0 && v <= 6) ? v : null
  }
  if ("foodcourt_weekly_hour" in body) {
    const v = Number(body.foodcourt_weekly_hour)
    out.foodcourt_weekly_hour = (Number.isInteger(v) && v >= 0 && v <= 23) ? v : null
  }
  if ("foodcourt_weekly_minute" in body) {
    const v = Number(body.foodcourt_weekly_minute)
    out.foodcourt_weekly_minute = (Number.isInteger(v) && v >= 0 && v <= 59) ? v : null
  }
  // 口コミ新着通知の配信時刻（毎日・NULL許容＝既定 8時/10分）
  if ("review_alert_hour" in body) {
    const v = Number(body.review_alert_hour)
    out.review_alert_hour = (Number.isInteger(v) && v >= 0 && v <= 23) ? v : null
  }
  if ("review_alert_minute" in body) {
    const v = Number(body.review_alert_minute)
    out.review_alert_minute = (Number.isInteger(v) && v >= 0 && v <= 59) ? v : null
  }
  // 予約メール通知の配信間隔（分）。NULL/1=リアルタイム（毎分チェック）。
  if ("gmail_alert_interval_minutes" in body) {
    const v = Number(body.gmail_alert_interval_minutes)
    out.gmail_alert_interval_minutes = GMAIL_ALERT_INTERVAL_MINUTES_ALLOWED.has(v) ? v : null
  }
  // 予約メール通知の基準時刻（まとめ配信のみで使用、NULL は既定 10:00）。
  if ("gmail_alert_anchor_hour" in body) {
    const v = Number(body.gmail_alert_anchor_hour)
    out.gmail_alert_anchor_hour = (Number.isInteger(v) && v >= 0 && v <= 23) ? v : null
  }
  if ("gmail_alert_anchor_minute" in body) {
    const v = Number(body.gmail_alert_anchor_minute)
    out.gmail_alert_anchor_minute = (Number.isInteger(v) && v >= 0 && v <= 59) ? v : null
  }
  // M-talk雑談AIのWeb検索モデル。許可外は null（＝既定 sonar）へ落とす。
  if ("mtalk_web_search_model" in body) {
    const v = String(body.mtalk_web_search_model ?? "").trim().toLowerCase()
    out.mtalk_web_search_model = MTALK_WEB_SEARCH_MODELS_ALLOWED.has(v) ? v : null
  }
  return out
}

// room_summary_settings の行から password ハッシュを除き、設定済みかの boolean(room_config_password_set)
// に置き換える（ハッシュをフロントへ出さない）。
function stripRoomConfigSecret<T extends Record<string, unknown>>(row: T | null): T | null {
  if (!row || typeof row !== "object") return row
  const rest = { ...(row as Record<string, unknown>) }
  const hash = rest.room_config_password_hash
  delete rest.room_config_password_hash
  rest.room_config_password_set = !!String(hash ?? "")
  return rest as unknown as T
}

// 会場（東京ドーム）のイベントを、レポートの期間に合わせて取得する。
// マルゴSは東京ドーム内フードコートのため、客数増減と会場イベントが相関する。
// 対象はマルゴS（store_key が marugoS）のみ。期間はレポート最古〜最新＋45日先（予定先取り）。
async function loadVenueEventsForReports(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
  reports: Array<Record<string, unknown>>,
): Promise<Array<{ event_date: string; title: string; category: string; venue: string; is_japan: boolean; note: string; expected_attendance: number | null }>> {
  if (String(storeKey ?? "").trim().toLowerCase() !== "marugos") return []
  const dates: string[] = []
  for (const r of (Array.isArray(reports) ? reports : [])) {
    const rd = String((r as { report_date?: unknown }).report_date ?? "").slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(rd)) dates.push(rd)
  }
  dates.sort()
  // レポートが無い場合でも、当月前後の予定を返せるよう today を基準にフォールバック。
  // イベント一覧（ページ側）として過去〜先まで広めに返す（過去90日〜先400日 と レポート期間の和集合）。
  const todayIso = new Date().toISOString().slice(0, 10)
  const minDate = dates[0] ?? todayIso
  const maxBase = dates[dates.length - 1] ?? todayIso
  const loCand = [addDaysIso(minDate, -7), addDaysIso(todayIso, -90)].sort()
  const hiCand = [addDaysIso(maxBase > todayIso ? maxBase : todayIso, 45), addDaysIso(todayIso, 400)].sort()
  const lo = loCand[0]
  const hi = hiCand[hiCand.length - 1]
  const { data: gamesData } = await supabase
    .from("giants_game_results")
    .select("game_date, game_result, opponent, venue, attendance, game_score, score_margin, game_duration, start_time")
    .order("game_date", { ascending: true })
    
  interface GiantsGameRow {
    game_date: string
    game_result: string | null
    opponent: string
    venue: string
    attendance: number | null
    game_score: string | null
    score_margin: number | null
    game_duration: string | null
    start_time: string | null
  }
  const gamesMap: Record<string, GiantsGameRow> = {}
  const streakBeforeMap: Record<string, number> = {}
  const streakAfterMap: Record<string, number> = {}
  let currentStreak = 0
  if (gamesData && Array.isArray(gamesData)) {
    for (const g of gamesData) {
      const d = String(g.game_date ?? "").slice(0, 10)
      if (!d) continue
      
      gamesMap[d] = g as unknown as GiantsGameRow
      streakBeforeMap[d] = currentStreak
      
      const res = g.game_result
      if (res === "○") {
        if (currentStreak > 0) {
          currentStreak += 1
        } else {
          currentStreak = 1
        }
      } else if (res === "●") {
        if (currentStreak < 0) {
          currentStreak -= 1
        } else {
          currentStreak = -1
        }
      } else if (res === "△") {
        currentStreak = 0
      }
      
      streakAfterMap[d] = currentStreak
    }
  }

  let data: any[] = []
  const firstTry = await supabase
    .from("tokyo_dome_events")
    .select("event_date, title, category, venue, is_japan, note, expected_attendance, start_time, game_duration, game_result, game_score, score_margin")
    .gte("event_date", lo)
    .lte("event_date", hi)
    .order("event_date", { ascending: true })
    .limit(600)
  if (!firstTry.error && Array.isArray(firstTry.data)) {
    data = firstTry.data
  } else {
    const secondTry = await supabase
      .from("tokyo_dome_events")
      .select("event_date, title, category, venue, is_japan, note, expected_attendance")
      .gte("event_date", lo)
      .lte("event_date", hi)
      .order("event_date", { ascending: true })
      .limit(600)
    if (secondTry.error || !Array.isArray(secondTry.data)) return []
    data = secondTry.data
  }
  return data.map((e) => {
    const dateStr = String((e as { event_date?: unknown }).event_date ?? "").slice(0, 10)
    const isBaseball = String((e as { category?: unknown }).category ?? "") === "プロ野球"
    const g = isBaseball ? gamesMap[dateStr] : null
    
    return {
      event_date: dateStr,
      title: String((e as { title?: unknown }).title ?? ""),
      category: String((e as { category?: unknown }).category ?? ""),
      venue: String((e as { venue?: unknown }).venue ?? "tokyo-dome"),
      is_japan: (e as { is_japan?: unknown }).is_japan === true,
      note: String((e as { note?: unknown }).note ?? ""),
      expected_attendance: g
        ? (g.attendance != null ? Number(g.attendance) : null)
        : ((e as { expected_attendance?: unknown }).expected_attendance == null
          ? null
          : Number((e as { expected_attendance?: unknown }).expected_attendance)),
      start_time: g ? g.start_time : ((e as { start_time?: unknown }).start_time ? String((e as { start_time?: unknown }).start_time) : null),
      game_duration: g ? g.game_duration : ((e as { game_duration?: unknown }).game_duration ? String((e as { game_duration?: unknown }).game_duration) : null),
      game_result: g ? g.game_result : ((e as { game_result?: unknown }).game_result ? String((e as { game_result?: unknown }).game_result) : null),
      game_score: g ? g.game_score : ((e as { game_score?: unknown }).game_score ? String((e as { game_score?: unknown }).game_score) : null),
      score_margin: g
        ? (g.score_margin != null ? Number(g.score_margin) : null)
        : ((e as { score_margin?: unknown }).score_margin == null ? null : Number((e as { score_margin?: unknown }).score_margin)),
      streak_before: streakBeforeMap[dateStr] ?? 0,
      streak_after: streakAfterMap[dateStr] ?? 0,
    }
  }).filter((e) => e.event_date && e.title)
}

// 基準店(marugoS)の日次「正本」客数/売上/組数。
// 取得元は売上分析(/receipts/sales = fetchReceiptSalesState)と同一の日次集計
// 「受領レシート集計(line_receipt__marugoS)＋日次手入力上書き(line_sales_manual_day)」で一本化（唯一の正本）。
// 以前は foodcourt_base_daily ビューを読んでいたが、ビューは手入力の売上を反映せず・客数サニタイズも無いため
// 売上分析とズレる余地があった。共有関数 fetchReceiptDailyAggForRange に載せ替えて差異を解消。
// 日報(foodcourt_tenant_reports)が投稿されない日（例 6/14 等）も含めて全日返す＝取りこぼし解消。
async function loadBaseDailyForReports(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
): Promise<Array<{ date: string; guests: number | null; sales: number | null; party: number | null; has_manual: boolean; attendance: number | null }>> {
  if (String(storeKey ?? "").trim().toLowerCase() !== "marugos") return []
  const todayIso = new Date().toISOString().slice(0, 10)
  const lo = addDaysIso(todayIso, -400)
  const hi = addDaysIso(todayIso, 1)
  const rows = await fetchReceiptDailyAggForRange(supabase, storeKey, lo, hi)
  // 売上(sales)は税抜net＝日報と一致させる正本。手入力上書きは売上分析と同じく総売上(gross)側にのみ効くため、
  // net はレシート集計のまま（受領レシートが無い手入力のみの日は net=null＝当店売上未確定として扱う）。
  const base = rows.map((r) => ({
    date: r.date,
    guests: (r.manual_guest || r.receipt_count > 0) ? r.guest_count : null,
    sales: r.receipt_count > 0 ? r.net_sales_yen : null,
    party: (r.manual_party || r.receipt_count > 0) ? r.party_count : null,
    has_manual: r.manual_guest || r.manual_party || r.manual_gross,
    attendance: null as number | null,
  }))
  // 日報(foodcourt_daily_logs)の動員数を baseDaily にマージ。
  const { data: attRows, error: attErr } = await supabase
    .from("foodcourt_daily_logs")
    .select("log_date, daily_attendance")
    .ilike("store_partition_key", storeKey)
    .gte("log_date", lo)
    .lte("log_date", hi)
    .not("daily_attendance", "is", null)
  if (attErr) {
    console.error("loadBaseDailyForReports daily_logs attendance failed:", attErr.message)
  }
  if (Array.isArray(attRows) && attRows.length > 0) {
    const attMap = new Map(
      attRows.map((r) => [String((r as { log_date?: unknown }).log_date ?? "").slice(0, 10), Number((r as { daily_attendance?: unknown }).daily_attendance)])
    )
    for (const b of base) {
      const v = attMap.get(b.date)
      if (v != null && Number.isFinite(v)) b.attendance = v
    }
  }
  return base
}

/** フードコート日報を AI 分析用に読み込む。失敗時は error を返し、呼び出し側で可視化できるようにする。 */
async function loadFoodCourtDailyLogs(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
  opts?: { from?: string; to?: string; limit?: number },
): Promise<{ logs: Array<Record<string, unknown>>; error: string | null; count: number }> {
  const key = String(storeKey ?? "").trim()
  if (!key) return { logs: [], error: "store_key is required", count: 0 }
  const limit = Math.min(Math.max(1, opts?.limit ?? 60), 120)
  let q = supabase
    .from("foodcourt_daily_logs")
    .select(
      "log_date, handler, actions, guest_impact, sales_impact, weather_note, event_note, daily_attendance, issues, next_actions, memo",
    )
    .ilike("store_partition_key", key)
    .order("log_date", { ascending: false })
    .limit(limit)
  const from = String(opts?.from ?? "").slice(0, 10)
  const to = String(opts?.to ?? "").slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) q = q.gte("log_date", from)
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) q = q.lte("log_date", to)
  const { data, error } = await q
  if (error) {
    console.error("loadFoodCourtDailyLogs failed:", key, error.message)
    return { logs: [], error: error.message, count: 0 }
  }
  const logs = Array.isArray(data) ? data as Array<Record<string, unknown>> : []
  return { logs, error: null, count: logs.length }
}

/** JST 基準の YYYY-MM-DD（日報の「今日」と 60 日窓を UTC ずれなく揃える） */
function jstDateIso(offsetDays = 0): string {
  const jst = new Date(Date.now() + 9 * 3600 * 1000 + offsetDays * 24 * 3600 * 1000)
  return jst.toISOString().slice(0, 10)
}

/** 先週の月曜〜日曜（JST） */
function lastWeekMonSunJst(): { weekStart: string; weekEnd: string } {
  const jstNow = new Date(Date.now() + 9 * 3600 * 1000)
  // getUTC* は JST シフト後の UTC 表現なので曜日・日付として使える
  const dow = jstNow.getUTCDay() // 0=日
  // 今週月曜 = 今日 - ((dow+6)%7) 日
  const daysSinceMon = (dow + 6) % 7
  const thisMon = new Date(jstNow)
  thisMon.setUTCDate(jstNow.getUTCDate() - daysSinceMon)
  const lastMon = new Date(thisMon)
  lastMon.setUTCDate(thisMon.getUTCDate() - 7)
  const lastSun = new Date(lastMon)
  lastSun.setUTCDate(lastMon.getUTCDate() + 6)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { weekStart: fmt(lastMon), weekEnd: fmt(lastSun) }
}

// 自己再学習型の来客予測（forecast_predictions）を返す。基準店（マルゴS）のみ。当日前後の窓で guests/sales。
async function loadForecastForStore(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
): Promise<Array<{ target_date: string; metric: string; predicted: number; predicted_low: number | null; predicted_high: number | null; actual: number | null; model_version: string; features: unknown }>> {
  if (String(storeKey ?? "").trim().toLowerCase() !== "marugos") return []
  const todayIso = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
  const lo = addDaysIso(todayIso, -14)
  const hi = addDaysIso(todayIso, 21)
  const { data, error } = await supabase
    .from("forecast_predictions")
    .select("target_date, metric, predicted, predicted_low, predicted_high, actual, model_version, features")
    .eq("tenant_name", "MARUGO S")
    .gte("target_date", lo)
    .lte("target_date", hi)
    .order("target_date", { ascending: true })
    .limit(200)
  if (error || !Array.isArray(data)) return []
  return data.map((r) => ({
    target_date: String((r as { target_date?: unknown }).target_date ?? "").slice(0, 10),
    metric: String((r as { metric?: unknown }).metric ?? ""),
    predicted: Number((r as { predicted?: unknown }).predicted ?? 0),
    predicted_low: (r as { predicted_low?: unknown }).predicted_low == null ? null : Number((r as { predicted_low?: unknown }).predicted_low),
    predicted_high: (r as { predicted_high?: unknown }).predicted_high == null ? null : Number((r as { predicted_high?: unknown }).predicted_high),
    actual: (r as { actual?: unknown }).actual == null ? null : Number((r as { actual?: unknown }).actual),
    model_version: String((r as { model_version?: unknown }).model_version ?? ""),
    features: (r as { features?: unknown }).features ?? null,
  })).filter((r) => r.target_date && r.metric)
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function isStrictIsoDate(value: unknown): value is string {
  const raw = String(value ?? "").trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false
  const parsed = new Date(`${raw}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw
}

// businessDateIso を含む月の「前月」の範囲を返す（月次振り返りは常に完全に終わった月を対象にする）。
function previousMonthRange(businessDateIso: string): { yearMonth: string; monthStart: string; monthEnd: string } | null {
  const d = new Date(`${businessDateIso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  const firstOfThisMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
  const lastOfPrevMonth = new Date(firstOfThisMonth.getTime() - 24 * 3600 * 1000)
  const firstOfPrevMonth = new Date(Date.UTC(lastOfPrevMonth.getUTCFullYear(), lastOfPrevMonth.getUTCMonth(), 1))
  const yearMonth = `${lastOfPrevMonth.getUTCFullYear()}-${String(lastOfPrevMonth.getUTCMonth() + 1).padStart(2, "0")}`
  return {
    yearMonth,
    monthStart: firstOfPrevMonth.toISOString().slice(0, 10),
    monthEnd: lastOfPrevMonth.toISOString().slice(0, 10),
  }
}

// 「先月の振り返り」を store_partition_key + year_month でキャッシュしつつ取得する。
// 未生成なら generateFoodCourtPeriodSummary を月境界で呼んで生成・保存する（月に1回だけAI生成・以降はキャッシュ）。
// データ不足等でnullが返ることもあり、その場合は日次分析側で単に「先月の振り返り」ブロックなしとして扱う。
async function getOrGenerateMonthlyRetrospective(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
  baseName: string,
  yearMonth: string,
  monthStart: string,
  monthEnd: string,
  groqApiKey: string,
  reports: Array<Record<string, unknown>>,
  events: Awaited<ReturnType<typeof loadVenueEventsForReports>>,
  weather: Awaited<ReturnType<typeof loadWeatherForReports>>,
  forecast: Awaited<ReturnType<typeof loadForecastForStore>>,
  dailyLogs: Array<Record<string, unknown>>,
): Promise<string | null> {
  const { data: cached, error: cacheErr } = await supabase
    .from("foodcourt_monthly_retrospective")
    .select("summary_text")
    .eq("store_partition_key", storeKey)
    .eq("year_month", yearMonth)
    .maybeSingle()
  if (cacheErr) console.error("foodcourt_monthly_retrospective select failed:", cacheErr.message)
  if (cached && (cached as { summary_text?: unknown }).summary_text) {
    return String((cached as { summary_text: string }).summary_text)
  }
  const summary = await generateFoodCourtPeriodSummary(
    reports, baseName, monthStart, monthEnd, groqApiKey, events, weather, forecast, supabase, storeKey, dailyLogs,
  )
  if (!summary) return null
  const { error: upErr } = await supabase.from("foodcourt_monthly_retrospective").upsert({
    store_partition_key: storeKey,
    year_month: yearMonth,
    month_start: monthStart,
    month_end: monthEnd,
    summary_text: summary,
    model_version: "v1",
  }, { onConflict: "store_partition_key,year_month" })
  if (upErr) console.error("foodcourt_monthly_retrospective upsert failed:", upErr.message)
  return summary
}

// 東京ドーム周辺の日次天気を、レポート期間に合わせて取得する（マルゴSのみ）。
// マルゴSは東京ドーム内フードコートのため、天気（雨/気温）と客数・売上が相関する。
async function loadWeatherForReports(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
  reports: Array<Record<string, unknown>>,
): Promise<Array<{ weather_date: string; weather_code: number | null; temp_max: number | null; temp_min: number | null; precipitation_mm: number | null; precip_prob: number | null; summary: string }>> {
  if (String(storeKey ?? "").trim().toLowerCase() !== "marugos") return []
  const dates: string[] = []
  for (const r of (Array.isArray(reports) ? reports : [])) {
    const rd = String((r as { report_date?: unknown }).report_date ?? "").slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(rd)) dates.push(rd)
  }
  dates.sort()
  const todayIso = new Date().toISOString().slice(0, 10)
  const minDate = dates[0] ?? todayIso
  const maxBase = dates[dates.length - 1] ?? todayIso
  // 過去90日〜先16日（天気予報の上限）とレポート期間の和集合。
  const loCand = [addDaysIso(minDate, -7), addDaysIso(todayIso, -90)].sort()
  const hiCand = [addDaysIso(maxBase > todayIso ? maxBase : todayIso, 16), addDaysIso(todayIso, 16)].sort()
  const lo = loCand[0]
  const hi = hiCand[hiCand.length - 1]
  const { data, error } = await supabase
    .from("weather_daily")
    .select("weather_date, weather_code, temp_max, temp_min, precipitation_mm, precip_prob, summary")
    .eq("location", "tokyo_dome")
    .gte("weather_date", lo)
    .lte("weather_date", hi)
    .order("weather_date", { ascending: true })
    .limit(400)
  if (error || !Array.isArray(data)) return []
  const num = (v: unknown) => { const n = Number(v); return v == null || !Number.isFinite(n) ? null : n }
  return data.map((w) => ({
    weather_date: String((w as { weather_date?: unknown }).weather_date ?? "").slice(0, 10),
    weather_code: num((w as { weather_code?: unknown }).weather_code),
    temp_max: num((w as { temp_max?: unknown }).temp_max),
    temp_min: num((w as { temp_min?: unknown }).temp_min),
    precipitation_mm: num((w as { precipitation_mm?: unknown }).precipitation_mm),
    precip_prob: num((w as { precip_prob?: unknown }).precip_prob),
    summary: String((w as { summary?: unknown }).summary ?? ""),
  })).filter((w) => w.weather_date)
}

Deno.serve(async (req, info) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const path = normalizePath(url.pathname)
  const clientIp = extractClientIp(req.headers, info)
  // 店舗スコープ強制で body を差し替えたいときに使う実効リクエスト（既定は元のreq）。
  let workReq = req

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing." }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const rateLimit = resolveAdminRateLimit(req.method, path)
  const rateLimitResult = await consumeRateLimitFromDb(
    supabase,
    `${clientIp}:${req.method}:${path}`,
    rateLimit.maxRequests,
    rateLimit.windowMs,
  )
  if (!rateLimitResult.available) {
    return json({
      error: "Request protection is temporarily unavailable. Please retry later.",
      code: "rate_limit_unavailable",
    }, 503)
  }
  if (!rateLimitResult.allowed) {
    return json({
      error: "Too many requests. Please retry later.",
      code: "rate_limited",
      retry_after_ms: rateLimitResult.retryAfterMs,
    }, 429)
  }

  if (req.method === "POST" && path === "/auth/verify") {
    try {
      const fallbackToken = Deno.env.get("ADMIN_DASHBOARD_TOKEN") ?? ""
      const authResult = await authenticate(req, supabase, fallbackToken)
      if (!authResult.ok) {
        return json({ error: authResult.message }, authResult.status)
      }
      if (authResult.scopeKind === "cron") {
        return json({ error: "この内部実行権限に許可された操作ではありません。" }, 403)
      }
      return json({
        ok: true,
        storeScope: authResult.storeScope,
        roomScope: authResult.roomScope,
        scopeKind: authResult.scopeKind,
        chatAdminAuthority: authResult.chatAdminAuthority
          ? publicChatAdminAuthority(authResult.chatAdminAuthority)
          : null,
      }, 200)
    } catch (e) {
      const err = asAppError(e)
      return json({ error: err.message }, err.status)
    }
  }

  if (req.method === "POST" && path === "/auth/link-login") {
    try {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const loginToken = String(body.login_token ?? "").trim()
      if (!loginToken) {
        throw { status: 400, message: "login_token is required." } satisfies AppError
      }
      const rememberLogin = body.remember_login !== false
      const adminSurface = resolveAdminSurface(req, url)
      const session = await exchangeAdminDashboardLoginLinkToken(supabase, loginToken, {
        rememberLogin,
        requiredScopes: GENERIC_LINK_LOGIN_SCOPES,
        metadata: {
          admin_surface: adminSurface,
          exchanged_via: "admin_api",
        },
      })
      void recordCurrentAdminAccess({
        supabase,
        req,
        path,
        method: req.method,
        ip: clientIp,
        action: "login",
        eventKind: "login",
        page: "admin",
        actorKind: "store_link",
        actorLabel: "ログインリンク",
      })
      return json({
        ok: true,
        session_token: session.token,
        expires_at: session.expires_at,
      }, 200)
    } catch (e) {
      if (e instanceof Error && /invalid|expired|already used|cannot be used/i.test(e.message)) {
        return json({ error: e.message }, 401)
      }
      const err = asAppError(e)
      return json({ error: err.message }, err.status)
    }
  }

  if (req.method === "POST" && path === "/auth/room-config-login") {
    try {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const loginToken = String(body.login_token ?? "").trim()
      const password = String(body.password ?? "")
      if (!loginToken) {
        throw { status: 400, message: "login_token is required." } satisfies AppError
      }
      if (!password) {
        throw { status: 400, message: "password is required." } satisfies AppError
      }
      const rememberLogin = body.remember_login !== false
      const adminSurface = resolveAdminSurface(req, url)
      const session = await exchangeRoomConfigLoginLink(supabase, loginToken, password, {
        rememberLogin,
        metadata: { admin_surface: adminSurface, exchanged_via: "admin_api" },
      })
      void recordCurrentAdminAccess({
        supabase,
        req,
        path,
        method: req.method,
        ip: clientIp,
        action: "login",
        eventKind: "login",
        page: "admin",
        actorKind: "store_link",
        actorLabel: "ルーム設定リンク",
      })
      return json({ ok: true, session_token: session.token, expires_at: session.expires_at }, 200)
    } catch (e) {
      // パスワード誤り/無効リンク/未有効化はすべて 401 で曖昧に返す（攻撃者に情報を与えない）。
      if (e instanceof Error) {
        return json({ error: "リンクまたはパスワードが正しくありません。" }, 401)
      }
      const err = asAppError(e)
      return json({ error: err.message }, err.status)
    }
  }

  if (req.method === "POST" && path === "/auth/session") {
    try {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const provided = String(body.admin_token ?? "").trim()
      if (!provided) {
        throw { status: 400, message: "admin_token is required." } satisfies AppError
      }
      const rememberLogin = body.remember_login !== false
      const fallbackAdminToken = Deno.env.get("ADMIN_DASHBOARD_TOKEN") ?? ""
      const authResult = await authenticateRawAdminToken(provided, supabase, fallbackAdminToken)
      if (!authResult.ok) {
        return json({ error: authResult.message }, authResult.status)
      }
      const adminSurface = resolveAdminSurface(req, url)
      const session = await issueAdminDashboardSessionToken(supabase, {
        rememberLogin,
        metadata: {
          admin_surface: adminSurface,
          exchanged_via: "admin_api_manual_login",
        },
      })
      void recordCurrentAdminAccess({
        supabase,
        req,
        path,
        method: req.method,
        ip: clientIp,
        action: "login",
        eventKind: "login",
        page: "admin",
        actorKind: "admin_token",
        actorLabel: "本部",
      })
      return json({
        ok: true,
        session_token: session.token,
        expires_at: session.expires_at,
      }, 200)
    } catch (e) {
      const err = asAppError(e)
      return json({ error: err.message }, err.status)
    }
  }

  // line-webhook からの #メモ 自動転送ブリッジ（内部呼び出し）。
  // 関数間で共有される legacy service_role / 新 secret API キーを
  // x-internal-key として検証し、
  // 管理セッションを介さずに「LINE投稿のナレッジ登録」だけを許可する。
  if (req.method === "POST" && path === "/pos-journals/knowledge/process-line-post") {
    const internalKey = req.headers.get("x-internal-key") ?? ""
    if (isInternalSupabaseServerKey(internalKey)) {
      try {
        const body = await parseJson(req)
        if (!isRecord(body)) {
          throw { status: 400, message: "Invalid JSON body." } satisfies AppError
        }
        return json(await processLinePostKnowledge(supabase, body, null), 200)
      } catch (e) {
        const err = asAppError(e)
        return json({ error: err.message }, err.status)
      }
    }
    // 内部キーが無い/不一致の場合は通常の管理者認証へフォールスルー
  }

  // line-webhook からの引用返信 #メモ（画像・PDF・Excel・Word・テキスト）登録ブリッジ（内部呼び出し）。
  // process-line-post と同じ service_role キー検証で、ナレッジのAI解析・原本保存・登録の3手順のみ許可する。
  // （旧実装は x-admin-token:'demo' で呼んでいたため管理者認証で全て 401 になり、引用返信登録が機能していなかった）
  if (
    req.method === "POST" && (
      path === "/pos-journals/knowledge/analyze-image" ||
      path === "/pos-journals/knowledge/upload" ||
      path === "/pos-journals/knowledge" ||
      // M-talk の店舗ルームへ落とされた .lzh を、その店舗として取り込む。
      // 店舗は呼び出し側(chat-knowledge)がルームから解決して store_key で渡す。
      // storeScope は null で通し、下の uploadPosJournalFiles が
      // 「ファイル名の店舗コード == 指定店舗」を必ず検証する。
      path === "/pos-journals/upload" ||
      // M-talk の「ジャーナル検索」から電子ジャーナルAIへ質問する。
      // 同じく storeScope は null で通すが、resolvePosJournalAiStore が
      // レジ店舗コード未登録の店舗を必ず弾く。
      path === "/pos-journals/ai-ask"
    )
  ) {
    const internalKey = req.headers.get("x-internal-key") ?? ""
    if (isInternalSupabaseServerKey(internalKey)) {
      try {
        if (path === "/pos-journals/knowledge/analyze-image") {
          return json(await analyzeStoreKnowledgeImage(req, null), 200)
        }
        if (path === "/pos-journals/knowledge/upload") {
          return json(await uploadStoreKnowledgeFile(req, supabase, null), 200)
        }
        if (path === "/pos-journals/upload") {
          return json(await uploadPosJournalFiles(req, supabase, null), 200)
        }
        if (path === "/pos-journals/ai-ask") {
          const askBody = await parseJson(req)
          if (!isRecord(askBody)) {
            throw { status: 400, message: "Invalid JSON body." } satisfies AppError
          }
          return json(await askPosJournalAi(supabase, askBody, null), 200)
        }
        const body = await parseJson(req)
        if (!isRecord(body)) {
          throw { status: 400, message: "Invalid JSON body." } satisfies AppError
        }
        return json(await saveStoreKnowledge(supabase, body, null, true), 200)
      } catch (e) {
        const err = asAppError(e)
        return json({ error: err.message }, err.status)
      }
    }
    // 内部キーが無い/不一致の場合は通常の管理者認証へフォールスルー
  }

  // デプロイ後の原本再解析・派生index再構築を、管理セッションの値を
  // ターミナルへ取り出さずに実行するためのサーバー間メンテナンス経路。
  // legacy service_role または有効な新 secret API キーと完全一致する
  // 内部キーだけを許可し、キー不一致時は
  // 通常の本部管理者認証へフォールスルーする。店舗リンクには開放しない。
  if (
    req.method === "POST" && (
      path === "/pos-journals/reparse" ||
      path === "/pos-journals/product-index/rebuild"
    )
  ) {
    const internalKey = req.headers.get("x-internal-key") ?? ""
    if (isInternalSupabaseServerKey(internalKey)) {
      try {
        const body = await parseJson(req)
        if (!isRecord(body)) {
          throw { status: 400, message: "Invalid JSON body." } satisfies AppError
        }
        if (path === "/pos-journals/reparse") {
          return json(await reparseStoredPosJournalFiles(supabase, body, null), 200)
        }
        return json(
          await rebuildJournalProductMonthlyIndex(supabase, body, null),
          200,
        )
      } catch (e) {
        const err = asAppError(e)
        return json({ error: err.message }, err.status)
      }
    }
    // 内部キーが無い/不一致の場合は通常の本部管理者認証へフォールスルー
  }

  // M-talk のルーム完全削除。作成者のチャットJWTのみ。管理トークンは使わない。
  if (req.method === "POST" && path === "/chat-room-purge") {
    try {
      return await handleChatRoomPurge(req, workReq, supabase)
    } catch (e) {
      const err = asAppError(e)
      return json({ error: err.message }, err.status)
    }
  }

  // M-talk のルーム設定。ログイン済みメンバーが自分のルームだけ触れる。
  if ((req.method === "GET" || req.method === "PUT") && path === "/chat-room-config") {
    try {
      return await handleChatRoomConfig(req, workReq, url, supabase)
    } catch (e) {
      const err = asAppError(e)
      return json({ error: err.message }, err.status)
    }
  }

  // M-talk の予約・予定。メンバーのみ。閲覧と編集はチャットJWT。管理トークンは使わない。
  if (
    path === "/chat-schedule" ||
    path === "/chat-schedule/reservation" ||
    path === "/chat-schedule/event"
  ) {
    try {
      if (path === "/chat-schedule" && req.method === "GET") {
        return await handleChatSchedule(req, url, supabase)
      }
      if (path === "/chat-schedule/reservation") {
        return await handleChatScheduleReservation(req, workReq, url, supabase)
      }
      if (path === "/chat-schedule/event") {
        return await handleChatScheduleEvent(req, workReq, url, supabase)
      }
      throw { status: 405, message: "Method not allowed." } satisfies AppError
    } catch (e) {
      const err = asAppError(e)
      return json({ error: err.message }, err.status)
    }
  }

  // M-talkの添付画像を、LINE受信メディアと同じライブラリへ保存する。
  // クライアントが任意のストレージを指定できないよう、送信済み自分のメッセージだけを
  // サーバー側で検証して private chat-images から取り出す。
  if (req.method === "POST" && path === "/chat-media-archive") {
    try {
      return json(await archiveChatMedia(req, workReq, supabase), 200)
    } catch (e) {
      const err = asAppError(e)
      return json({ error: err.message }, err.status)
    }
  }
  // M-talkのAIメニュー解析カード。本人JWT＋現在のルーム送信権限＋店舗所属を
  // 毎回確認し、登録ボタンを押した時だけ店舗ナレッジへ原本と解析結果を移す。
  if (req.method === "POST" && path === "/chat-menu-knowledge-decision") {
    try {
      return json(await decideChatMenuKnowledge(req, workReq, supabase), 200)
    } catch (e) {
      const err = asAppError(e)
      return json({ error: err.message }, err.status)
    }
  }
  if (req.method === "POST" && path === "/chat-media-link") {
    try { return json(await issueChatMediaViewLink(req, workReq, supabase), 200) }
    catch (e) { const err = asAppError(e); return json({ error: err.message }, err.status) }
  }
  // M-talk の1対1から、ジャーナルレポート(jnl2txt.html)へ入るための
  // 店舗限定ログインリンクを発行する。回答をM-talk側で作り直さず、
  // ジャーナルレポートのAIにそのまま答えてもらうため。
  if (req.method === "POST" && path === "/auth/chat-journal-login") {
    try { return json(await issueChatJournalLoginLink(req, workReq, supabase), 200) }
    catch (e) { const err = asAppError(e); return json({ error: err.message }, err.status) }
  }
  if (req.method === "POST" && path === "/auth/chat-journal-link-login") {
    try { return json(await exchangeChatJournalLoginLink(workReq, supabase), 200) }
    catch (e) {
      if (e instanceof Error) return json({ error: "電子ジャーナルAIリンクが無効または期限切れです。" }, 401)
      const err = asAppError(e); return json({ error: err.message }, err.status)
    }
  }
  if (req.method === "POST" && path === "/auth/chat-media-login") {
    try { return json(await exchangeChatMediaViewLink(workReq, supabase), 200) }
    catch (e) {
      if (e instanceof Error) return json({ error: "メディア閲覧リンクが無効または期限切れです。" }, 401)
      const err = asAppError(e); return json({ error: err.message }, err.status)
    }
  }
  if (req.method === "GET" && path === "/chat-media-view") {
    try { return json(await fetchChatMediaView(req, supabase, url), 200) }
    catch (e) { const err = asAppError(e); return json({ error: err.message }, err.status) }
  }

  const fallbackAdminToken = Deno.env.get("ADMIN_DASHBOARD_TOKEN") ?? ""
  const authResult = await authenticate(req, supabase, fallbackAdminToken)
  if (!authResult.ok) {
    return json({ error: authResult.message }, authResult.status)
  }

  if (
    authResult.scopeKind === "cron" &&
    !CRON_ALLOWED_REQUESTS.has(`${req.method.toUpperCase()} ${path}`)
  ) {
    return json({ error: "この内部実行権限に許可された操作ではありません。" }, 403)
  }

  // 委任されたM-talk管理セッションは、売上・予約・資料・店舗設定など通常管理APIへ
  // 絶対に横展開させない。個別ルートより前で専用名前空間へ閉じ込める。
  if (
    authResult.scopeKind === MTALK_ADMIN_SCOPE &&
    path !== "/auth/logout" &&
    path !== "/chat-admin" &&
    !path.startsWith("/chat-admin/")
  ) {
    return json({ error: "この権限はM-talk管理だけに利用できます。" }, 403)
  }

  // 店舗スコープ強制(IDOR対策): 店舗別ログインリンク由来のセッションは、その店舗のページ
  // (petty_cash.html / analytics.html)が使うパスだけに限定し、店舗キーをスコープへ固定する。
  // 生adminトークン由来(storeScope=null)は全店アクセスのまま(従来どおり)。
  const storeScope = authResult.storeScope
  if (storeScope) {
    if (!isStoreLinkRequestAllowed(authResult.scopeKind, req.method, path)) {
      return json({ error: "この店舗リンクに許可された操作ではありません。" }, 403)
    }
    const STORE_SCOPED_ALLOWED_PATHS = new Set<string>([
      "/auth/logout",
      "/reservations/calendar",
      "/reservations/search",
      "/reservations/ai-facts",
      "/reservations/event",
      "/reservations/customer-suggest",
      "/petty-cash",
      "/petty-cash/receipt-image",
      "/petty-cash/receipt-media",
      "/pos-journals",
      "/pos-journals/stores",
      "/pos-journals/product-search",
      "/pos-journals/product-cohort",
      "/pos-journals/cohort-compare",
      "/pos-journals/product-index/rebuild",
      "/pos-journals/upload",
      "/pos-journals/file",
      "/pos-journals/download",
      "/pos-journals/ai-analysis",
      "/pos-journals/ai-ask",
      "/pos-journals/ai-history",
      "/pos-journals/ai-history/item",
      "/pos-journals/saved-reports",
      "/pos-journals/saved-reports/item",
      "/pos-journals/saved-reports/html",
      "/pos-journals/saved-reports/html-offload",
      "/pos-journals/report-ai-history",
      "/pos-journals/report-ai-history/item",
      "/pos-journals/chat-pdf-history",
      "/pos-journals/chat-pdf-history/item",
      "/pos-journals/sales-forecasts",
      "/pos-journals/sales-forecasts/item",
      "/pos-journals/knowledge",
      "/pos-journals/knowledge/item",
      "/pos-journals/knowledge/items",
      "/pos-journals/knowledge/upload",
      "/pos-journals/knowledge/download",
      "/pos-journals/knowledge/analyze-image",
      "/pos-journals/knowledge/process",
      "/pos-journals/knowledge/generate-insight",
      "/pos-journals/store-ops",
      "/foodcourt/reports",
      "/foodcourt/journal-brief",
      "/foodcourt/journal-deep-analysis",
      "/foodcourt/ask",
      "/foodcourt/qa-history",
      "/foodcourt/ai-fallback-events",
      "/foodcourt/ai-fallback-events/ack",
      "/foodcourt/dome-weekly",
      "/foodcourt/evolution-history",
      "/foodcourt/ai-loop-runs",
      "/foodcourt/ai-loop-feedback",
      "/foodcourt/ai-rag",
      "/foodcourt/ai-distillation-dataset",
      "/foodcourt/evolution-readiness",
      "/foodcourt/prompt-evaluation-sets",
      "/foodcourt/prompt-evaluation-sets/bootstrap",
      "/foodcourt/prompt-candidates",
      "/foodcourt/daily-logs",
      "/foodcourt/daily-summary",
      "/foodcourt/daily-summary/list",
      "/foodcourt/period-summary",
      "/foodcourt/weekly-report",
      "/foodcourt/weekly-report/list",
      "/foodcourt/monthly-retrospective",
      "/foodcourt/events/attendance",
      "/analytics/holidays",
      "/analytics/monthly",
      "/access/events",
      "/weather/daily",
      "/receipts/sales",
      "/receipts/sheets-pilot-link",
      "/receipts/sales-budget",
      "/receipts/sales-daily-budget",
      "/receipts/sales-manual-days",
      "/receipts/sales-manual-days/import",
      "/receipts/sales-manual-months",
      "/receipts/daily-receipts-import",
      "/receipts/daily-receipts",
      "/receipts/competitors",
      "/receipts/competitors/refresh",
      "/receipts/competitors/nearby-search",
      "/receipts/store-reviews",
      "/receipts/store-reviews/profile/ensure",
      "/receipts/store-reviews/refresh",
      "/receipts/store-reviews/search",
    ])
    if (!STORE_SCOPED_ALLOWED_PATHS.has(path)) {
      return json({ error: "この店舗用ログインからはこの操作はできません。" }, 403)
    }
    // URLクエリの店舗キーをスコープへ強制(他店舗を明示要求していたら拒否)。
    for (const p of ["store", "store_key"]) {
      const requested = String(url.searchParams.get(p) ?? "").trim().toLowerCase()
      if (requested && requested !== storeScope.toLowerCase()) {
        return json({ error: "他店舗のデータにはアクセスできません。" }, 403)
      }
      url.searchParams.set(p, storeScope)
    }
    // 書込系(POST/PUT/PATCH)の JSON ボディは店舗フィールドをスコープへ強制し、差し替えたRequestを使う。
    // ※ multipart(ファイルアップロード=sales-manual-days/import の解析専用・店舗無し)は body を消費せず素通し。
    const contentType = String(req.headers.get("content-type") ?? "").toLowerCase()
    if (
      (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") &&
      contentType.includes("application/json")
    ) {
      let raw = ""
      try { raw = await req.text() } catch { raw = "" }
      if (raw) {
        let bodyObj: unknown = null
        try { bodyObj = JSON.parse(raw) } catch { bodyObj = null }
        if (isRecord(bodyObj)) {
          for (const p of ["store", "store_key", "store_partition_key"]) {
            if (p in bodyObj) {
              const v = String(bodyObj[p] ?? "").trim().toLowerCase()
              if (v && v !== storeScope.toLowerCase()) {
                return json({ error: "他店舗のデータにはアクセスできません。" }, 403)
              }
              bodyObj[p] = storeScope
            }
          }
          raw = JSON.stringify(bodyObj)
        }
      }
      const fwdHeaders = new Headers(req.headers)
      fwdHeaders.delete("content-length")
      workReq = new Request(req.url, { method: req.method, headers: fwdHeaders, body: raw })
    }
  }

  // ルームスコープ強制(IDOR対策): room_config セッション(LINEワンパス＋パスワード由来)は
  // /room-config(GET/PUT) のみに限定し、room_id をスコープへ固定。他ルーム・他admin操作は一切不可。
  const roomScope = authResult.scopeKind === ROOM_CONFIG_SCOPE ? authResult.roomScope : null
  if (roomScope) {
    const ROOM_SCOPED_ALLOWED_PATHS = new Set<string>(["/room-config", "/auth/logout"])
    if (!ROOM_SCOPED_ALLOWED_PATHS.has(path)) {
      return json({ error: "このルーム用ログインからはこの操作はできません。" }, 403)
    }
    const requestedRoom = String(url.searchParams.get("room_id") ?? "").trim()
    if (requestedRoom && requestedRoom !== roomScope) {
      return json({ error: "他のルームのデータにはアクセスできません。" }, 403)
    }
    url.searchParams.set("room_id", roomScope)
    const contentType = String(req.headers.get("content-type") ?? "").toLowerCase()
    if (
      (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") &&
      contentType.includes("application/json")
    ) {
      let raw = ""
      try { raw = await req.text() } catch { raw = "" }
      if (raw) {
        let bodyObj: unknown = null
        try { bodyObj = JSON.parse(raw) } catch { bodyObj = null }
        if (isRecord(bodyObj)) {
          const bodyRoom = String(bodyObj.room_id ?? "").trim()
          if (bodyRoom && bodyRoom !== roomScope) {
            return json({ error: "他のルームのデータにはアクセスできません。" }, 403)
          }
          bodyObj.room_id = roomScope
          raw = JSON.stringify(bodyObj)
        }
      }
      const fwdHeaders = new Headers(req.headers)
      fwdHeaders.delete("content-length")
      workReq = new Request(req.url, { method: req.method, headers: fwdHeaders, body: raw })
    }
  }

  try {
    if (authResult.scopeKind !== "cron") {
      void recordCurrentAdminAccess({
        supabase,
        req,
        path,
        method: req.method,
        ip: clientIp,
        auth: authResult,
      })
    }

    if (req.method === "GET" && path === "/access/events") {
      return json(await fetchAdminAccessEvents(supabase, url, storeScope), 200)
    }
    if (req.method === "POST" && path === "/access/events") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const actor = actorFromAuth(authResult)
      const page = String(body.page ?? "").trim() || "unknown"
      const storeKey = storeScope ||
        String(body.store_key ?? body.store ?? "").trim() || null
      await insertAdminAccessEvent(supabase, {
        eventKind: "page_view",
        action: "page_view",
        page,
        method: "POST",
        apiPath: path,
        storeKey,
        actorKind: actor.actorKind,
        actorLabel: actor.actorLabel,
        lineUserId: actor.lineUserId,
        ip: clientIp,
        userAgent: req.headers.get("user-agent"),
        detail: { path: String(body.path ?? "").slice(0, 240) },
      })
      return json({ ok: true }, 200)
    }

    if (req.method === "POST" && path === "/auth/logout") {
      const provided = req.headers.get("x-admin-token") ?? ""
      const revoked = await revokeAdminDashboardSessionToken(supabase, provided)
      return json({ success: true, revoked }, 200)
    }

    // M-talk 専用管理。通常の店舗・ルーム・cronスコープは拒否し、本部フル管理者、または
    // DBで有効性を再確認済みのM-talk委任管理者だけを通す。
    if (path === "/chat-admin" || path.startsWith("/chat-admin/")) {
      const chatAuthority = authResult.scopeKind === MTALK_ADMIN_SCOPE
        ? authResult.chatAdminAuthority
        : (!storeScope && !roomScope && authResult.scopeKind === null
          ? headquartersChatAdminAuthority()
          : null)
      if (!chatAuthority) {
        return json({ error: "このセッションではM-talk管理を利用できません。" }, 403)
      }
      const actor = actorFromAuth(authResult)
      const actorLabel = `admin-api:${actor.actorKind}:${actor.actorLabel}`.slice(0, 200)

      if (req.method === "GET" && path === "/chat-admin/state") {
        return json(await fetchChatAdminState(supabase, chatAuthority), 200)
      }

      if (req.method === "GET" && path === "/chat-admin/delegations") {
        chatAdminRequireHeadquarters(chatAuthority)
        return json(await fetchChatAdminDelegations(supabase), 200)
      }

      if (req.method === "POST" && path === "/chat-admin/delegations") {
        chatAdminRequireHeadquarters(chatAuthority)
        const body = await parseJson(workReq)
        if (!isRecord(body)) throw { status: 400, message: "Invalid JSON body." } satisfies AppError
        return json(await createChatAdminDelegation(supabase, body, actorLabel), 201)
      }

      const delegationMatch = /^\/chat-admin\/delegations\/([0-9a-f-]{36})(?:\/(link))?$/i.exec(path)
      if (delegationMatch) {
        chatAdminRequireHeadquarters(chatAuthority)
        const delegationId = delegationMatch[1].toLowerCase()
        if (!isUuid(delegationId)) throw { status: 400, message: "Invalid delegation id." } satisfies AppError
        if (delegationMatch[2] === "link" && req.method === "POST") {
          return json(await issueChatAdminDelegationLoginLink(supabase, delegationId, actorLabel), 200)
        }
        if (!delegationMatch[2] && req.method === "PATCH") {
          const body = await parseJson(workReq)
          if (!isRecord(body)) throw { status: 400, message: "Invalid JSON body." } satisfies AppError
          return json(await updateChatAdminDelegation(supabase, delegationId, body, actorLabel), 200)
        }
        throw { status: 405, message: "Method not allowed." } satisfies AppError
      }

      if (req.method === "GET" && path === "/chat-admin/templates") {
        chatAdminRequireCapability(chatAuthority, "manage_templates")
        return json(await fetchChatAdminTemplates(supabase), 200)
      }

      if (req.method === "POST" && path === "/chat-admin/templates/apply") {
        chatAdminRequireCapability(chatAuthority, "manage_templates")
        const body = await parseJson(workReq)
        if (!isRecord(body)) throw { status: 400, message: "Invalid JSON body." } satisfies AppError
        await assertChatAdminTemplateScope(supabase, chatAuthority, body)
        return json(await applyChatAdminTemplate(supabase, body, actorLabel, chatAuthority), 200)
      }

      const userAccessMatch = /^\/chat-admin\/users\/([0-9a-f-]{36})\/access$/i.exec(path)
      if (userAccessMatch && req.method === "GET") {
        const userId = userAccessMatch[1].toLowerCase()
        if (!isUuid(userId)) throw { status: 400, message: "Invalid user_id." } satisfies AppError
        await assertChatAdminUserReadScope(supabase, chatAuthority, userId)
        return json(
          await fetchChatAdminUserAccess(
            supabase,
            userId,
            url.searchParams.get("limit"),
            url.searchParams.get("offset"),
            chatAuthority,
          ),
          200,
        )
      }

      const auditRevertMatch = /^\/chat-admin\/audit\/(\d{1,18})\/revert$/.exec(path)
      if (auditRevertMatch && req.method === "POST") {
        chatAdminRequireCapability(chatAuthority, "revert_audit")
        const auditId = Number(auditRevertMatch[1])
        if (!Number.isSafeInteger(auditId) || auditId <= 0) {
          throw { status: 400, message: "Invalid audit id." } satisfies AppError
        }
        const body = await parseJson(workReq)
        if (!isRecord(body)) throw { status: 400, message: "Invalid JSON body." } satisfies AppError
        await assertChatAdminAuditScope(supabase, chatAuthority, auditId, "revert_audit")
        return json(await revertChatAdminAudit(supabase, auditId, body, actorLabel, chatAuthority), 200)
      }

      const roomActionMatch = /^\/chat-admin\/rooms\/(\d+)\/(trash|restore|purge)$/i.exec(path)
      if (roomActionMatch && req.method === "POST") {
        chatAdminRequireCapability(chatAuthority, "manage_rooms")
        const groupId = Number(roomActionMatch[1])
        if (!Number.isSafeInteger(groupId) || groupId <= 0) {
          throw { status: 400, message: "Invalid room id." } satisfies AppError
        }
        const action = roomActionMatch[2].toLowerCase()
        const body = await parseJson(workReq)
        if (!isRecord(body)) throw { status: 400, message: "Invalid JSON body." } satisfies AppError
        if (action === "trash") {
          await assertChatAdminRoomScope(supabase, chatAuthority, groupId, "manage_rooms")
          return json(await trashChatAdminRoom(supabase, groupId, actorLabel, chatAuthority), 200)
        }
        if (action === "restore") {
          await assertChatAdminRoomScope(supabase, chatAuthority, groupId, "manage_rooms")
          return json(await restoreChatAdminRoom(supabase, groupId, actorLabel, chatAuthority), 200)
        }
        // 完全削除はStorageを含む復元不能な複数段処理なので、委任対象にはしない。
        chatAdminRequireHeadquarters(chatAuthority)
        return json(await purgeChatAdminRoom(supabase, groupId, body, actorLabel), 200)
      }

      const botActionMatch = /^\/chat-admin\/bots\/([0-9a-f-]{36})\/(remove|restore)$/i.exec(path)
      if (botActionMatch && req.method === "POST") {
        chatAdminRequireCapability(chatAuthority, "manage_bots")
        const botId = botActionMatch[1].toLowerCase()
        if (!isUuid(botId)) throw { status: 400, message: "Invalid bot id." } satisfies AppError
        await assertChatAdminBotScope(supabase, chatAuthority, botId, "manage_bots")
        const action = botActionMatch[2].toLowerCase()
        if (action === "remove") {
          const body = await parseJson(workReq)
          if (!isRecord(body)) throw { status: 400, message: "Invalid JSON body." } satisfies AppError
          return json(await removeChatAdminBot(supabase, botId, body, actorLabel, chatAuthority), 200)
        }
        return json(await restoreChatAdminBot(supabase, botId, actorLabel, chatAuthority), 200)
      }

      const memberMatch = /^\/chat-admin\/rooms\/(\d+)\/members\/([0-9a-f-]{36})$/i.exec(path)
      if (memberMatch) {
        chatAdminRequireCapability(chatAuthority, "manage_members")
        const groupId = Number(memberMatch[1])
        const userId = memberMatch[2].toLowerCase()
        if (!Number.isSafeInteger(groupId) || groupId <= 0 || !isUuid(userId)) {
          throw { status: 400, message: "Invalid room member." } satisfies AppError
        }
        await assertChatAdminRoomScope(supabase, chatAuthority, groupId, "manage_members")
        if (req.method === "PATCH") {
          const body = await parseJson(workReq)
          if (!isRecord(body)) throw { status: 400, message: "Invalid JSON body." } satisfies AppError
          return json(await updateChatAdminMemberPermissions(supabase, groupId, userId, body, actorLabel, chatAuthority), 200)
        }
        if (req.method === "DELETE") {
          return json(await removeChatAdminMember(supabase, groupId, userId, actorLabel, chatAuthority), 200)
        }
        throw { status: 405, message: "Method not allowed." } satisfies AppError
      }

      const userActionMatch = /^\/chat-admin\/users\/([0-9a-f-]{36})\/(remove|restore)$/i.exec(path)
      if (userActionMatch && req.method === "POST") {
        chatAdminRequireCapability(chatAuthority, "manage_users")
        const userId = userActionMatch[1].toLowerCase()
        if (!isUuid(userId)) throw { status: 400, message: "Invalid user_id." } satisfies AppError
        await assertChatAdminUserGlobalScope(supabase, chatAuthority, userId, "manage_users")
        if (userActionMatch[2].toLowerCase() === "remove") {
          const body = await parseJson(workReq)
          if (!isRecord(body)) throw { status: 400, message: "Invalid JSON body." } satisfies AppError
          return json(await removeChatAdminUser(supabase, userId, body, actorLabel, chatAuthority), 200)
        }
        return json(await restoreChatAdminUser(supabase, userId, actorLabel, chatAuthority), 200)
      }

      const userMatch = /^\/chat-admin\/users\/([0-9a-f-]{36})$/i.exec(path)
      if (userMatch && req.method === "PATCH") {
        chatAdminRequireCapability(chatAuthority, "manage_users")
        const userId = userMatch[1].toLowerCase()
        if (!isUuid(userId)) throw { status: 400, message: "Invalid user_id." } satisfies AppError
        await assertChatAdminUserGlobalScope(supabase, chatAuthority, userId, "manage_users")
        const body = await parseJson(workReq)
        if (!isRecord(body)) throw { status: 400, message: "Invalid JSON body." } satisfies AppError
        return json(await updateChatAdminUserAccess(supabase, userId, body, actorLabel, chatAuthority), 200)
      }

      throw { status: 404, message: "M-talk管理APIが見つかりません。" } satisfies AppError
    }

    // ── ルーム・セルフ設定（room_config スコープ専用。room_id は上のブロックでスコープへ強制済み）──
    if (req.method === "GET" && path === "/room-config") {
      const roomId = String(url.searchParams.get("room_id") ?? "").trim()
      if (!roomId) throw { status: 400, message: "room_id is required." } satisfies AppError
      const { data, error } = await supabase
        .from("room_summary_settings")
        .select(ROOM_CONFIG_SAFE_SELECT)
        .eq("room_id", roomId)
        .maybeSingle()
      if (error) throw { status: 500, message: `Failed to load room config: ${error.message}` } satisfies AppError
      return json({ room_config: data ?? null }, 200)
    }

    if (req.method === "PUT" && path === "/room-config") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      const roomId = String(body.room_id ?? url.searchParams.get("room_id") ?? "").trim()
      if (!roomId) throw { status: 400, message: "room_id is required." } satisfies AppError
      // 安全サブセットのみ採用（bot_access_approved / receipt_report_store_partition_key 等の機微フィールドは
      // クライアントが送っても無視＝サーバ側 whitelist で守る）。
      const safe = buildRoomConfigSafePayload(body)
      const { data, error } = await supabase
        .from("room_summary_settings")
        .update({ ...safe, updated_at: new Date().toISOString() })
        .eq("room_id", roomId)
        .select(ROOM_CONFIG_SAFE_SELECT)
        .maybeSingle()
      if (error) throw { status: 500, message: `Failed to save room config: ${error.message}` } satisfies AppError
      if (!data) throw { status: 404, message: "Room not found." } satisfies AppError
      return json({ room_config: data }, 200)
    }

    if (req.method === "GET" && path === "/state") {
      const adminSurface = resolveAdminSurface(req, url)
      const state = await fetchState(supabase, url, adminSurface)
      return json(state, 200)
    }

    if (req.method === "GET" && path === "/usage/ai-cost") {
      const result = await fetchAiUsageCostState(supabase, url)
      return json(result, 200)
    }

    if (req.method === "GET" && path === "/permissions/users") {
      const users = await fetchLineUserPermissions(supabase, url)
      return json(users, 200)
    }

    if (req.method === "GET" && path === "/gmail/account") {
      const gmailAccount = await fetchGmailLinkedAccountState()
      return json({ gmail_account: gmailAccount }, 200)
    }

    if (req.method === "GET" && path === "/receipts/sheets-pilot-link") {
      const link = await fetchReceiptSheetsPilotLinkState()
      return json(link, 200)
    }

    if (req.method === "GET" && path === "/media") {
      const mediaState = await fetchMediaState(supabase, url)
      return json(mediaState, 200)
    }

    if (req.method === "GET" && path === "/documents") {
      const documentState = await fetchDocumentState(supabase, url)
      return json(documentState, 200)
    }
    if (req.method === "GET" && path === "/pos-journals") {
      return json(await fetchPosJournalState(supabase, url), 200)
    }
    if (req.method === "GET" && path === "/pos-journals/stores") {
      return json(await fetchPosJournalStoreDirectory(supabase, storeScope), 200)
    }
    if (req.method === "GET" && path === "/pos-journals/product-search") {
      return json(await searchPosJournalProducts(supabase, url), 200)
    }
    if (req.method === "POST" && path === "/pos-journals/product-index/rebuild") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      return json(await rebuildJournalProductMonthlyIndex(supabase, body, storeScope), 200)
    }
    if (req.method === "POST" && path === "/pos-journals/reparse") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      return json(await reparseStoredPosJournalFiles(supabase, body, storeScope), 200)
    }
    if (req.method === "GET" && path === "/pos-journals/product-cohort") {
      return json(await comparePosJournalProductCohorts(supabase, url), 200)
    }
    if (req.method === "POST" && path === "/pos-journals/cohort-compare") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      return json(await comparePosJournalCohortsGeneral(supabase, body, storeScope), 200)
    }
    if (req.method === "GET" && path === "/pos-journals/download") {
      return json(await fetchPosJournalDownloadUrl(supabase, url), 200)
    }
    if (req.method === "POST" && path === "/pos-journals/ai-analysis") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      return json(await analyzePosJournalWithAi(supabase, body, storeScope), 200)
    }
    if (req.method === "POST" && path === "/pos-journals/ai-ask") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      return json(await askPosJournalAi(supabase, body, storeScope), 200)
    }
    if (req.method === "GET" && path === "/pos-journals/ai-history") {
      return json(await fetchPosJournalAiHistory(supabase, url), 200)
    }
    if (req.method === "GET" && path === "/pos-journals/ai-history/item") {
      return json(await fetchPosJournalAiHistoryItem(supabase, url), 200)
    }
    if (req.method === "DELETE" && path === "/pos-journals/ai-history/item") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      return json(await deletePosJournalAiHistoryItem(supabase, body, storeScope), 200)
    }

    // ── jnl2txt.html（POS電子ジャーナル→売上分析Webアプリ）の保存済みレポート／AI分析履歴 ──
    // 旧実装はブラウザから anon キーで saved_reports/ai_analysis_history を直接叩いており、
    // RLS が全公開だったため晒されていた。pos_journal_* と同じ service_role 経由・
    // store_partition_key スコープの admin-api ルートへ移行する。
    if (req.method === "GET" && path === "/pos-journals/saved-reports") {
      return json(await fetchSavedReportsList(supabase, url), 200)
    }
    if (req.method === "GET" && path === "/pos-journals/saved-reports/cross-store-summary") {
      // フル管理者のみ（店舗スコープは STORE_SCOPED_ALLOWED_PATHS 外のため 403）
      return json(await fetchSavedReportsCrossStoreSummary(supabase, storeScope), 200)
    }
    if (req.method === "GET" && path === "/pos-journals/saved-reports/item") {
      return json(await fetchSavedReportItem(supabase, url), 200)
    }
    if (req.method === "POST" && path === "/pos-journals/saved-reports") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      return json(await saveSavedReport(supabase, body, storeScope), 200)
    }
    if (req.method === "DELETE" && path === "/pos-journals/saved-reports/item") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      return json(await deleteSavedReportItem(supabase, body, storeScope), 200)
    }
    if (req.method === "PATCH" && path === "/pos-journals/saved-reports/item") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      return json(await restoreJournalHistoryItem(supabase, "saved_reports", "保存済みレポート", body, storeScope), 200)
    }
    if (req.method === "POST" && path === "/pos-journals/saved-reports/html") {
      return json(await uploadSavedReportHtml(workReq, supabase, storeScope), 200)
    }
    if (req.method === "GET" && path === "/pos-journals/saved-reports/html") {
      return json(await createSavedReportHtmlSignedUrl(supabase, url), 200)
    }
    if (req.method === "POST" && path === "/pos-journals/saved-reports/html-offload") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      return json(await offloadSavedReportHtml(supabase, body, storeScope), 200)
    }
    if (req.method === "GET" && path === "/pos-journals/sales-forecasts") {
      return json(await fetchSalesForecastsList(supabase, url), 200)
    }
    if (req.method === "GET" && path === "/pos-journals/sales-forecasts/item") {
      return json(await fetchSalesForecastItem(supabase, url), 200)
    }
    if (req.method === "POST" && path === "/pos-journals/sales-forecasts") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      return json(await saveSalesForecast(supabase, body, storeScope), 200)
    }
    if (req.method === "DELETE" && path === "/pos-journals/sales-forecasts/item") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      return json(await deleteSalesForecastItem(supabase, body, storeScope), 200)
    }
    if (req.method === "PATCH" && path === "/pos-journals/sales-forecasts/item") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      return json(await restoreJournalHistoryItem(supabase, "sales_forecasts", "売上予測", body, storeScope), 200)
    }

    // ── 店舗ナレッジ（施策・メニュー資料）──
    // AIが「その期間に店舗が何をしていたか」を踏まえて回答するための資料置き場。
    // 数値の正本ではないため、売上集計とは独立したテーブルで管理する。
    if (req.method === "GET" && path === "/pos-journals/knowledge") {
      return json(await fetchStoreKnowledgeList(supabase, url), 200)
    }
    if (req.method === "GET" && path === "/pos-journals/knowledge/item") {
      return json(await fetchStoreKnowledgeItem(supabase, url), 200)
    }
    if (req.method === "POST" && path === "/pos-journals/knowledge/items") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      return json(await fetchStoreKnowledgeItems(supabase, body, storeScope), 200)
    }
    if (req.method === "GET" && path === "/pos-journals/knowledge/download") {
      return json(await createStoreKnowledgeDownloadUrl(supabase, url), 200)
    }
    if (req.method === "POST" && path === "/pos-journals/knowledge") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      return json(await saveStoreKnowledge(supabase, body, storeScope), 200)
    }
    if (req.method === "POST" && path === "/pos-journals/knowledge/upload") {
      return json(await uploadStoreKnowledgeFile(workReq, supabase, storeScope), 200)
    }
    if (req.method === "DELETE" && path === "/pos-journals/knowledge/item") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      return json(await deleteStoreKnowledgeItem(supabase, body, storeScope), 200)
    }
    // Gemini マルチモーダル画像解析（DBには触れない読み取り専用のOCR。保存は /knowledge 側で行う）
    if (req.method === "POST" && path === "/pos-journals/knowledge/analyze-image") {
      return json(await analyzeStoreKnowledgeImage(workReq, storeScope), 200)
    }
    // 資料のRAGチャンク再生成（1,500文字・200文字オーバーラップ）
    if (req.method === "POST" && path === "/pos-journals/knowledge/process") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      return json(await processStoreKnowledgeChunks(supabase, body, storeScope), 200)
    }
    // 施策効果測定インサイトの自動追記（source_type='ai_insight'）
    if (req.method === "POST" && path === "/pos-journals/knowledge/generate-insight") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      return json(await generateStoreKnowledgeInsight(supabase, body, storeScope), 200)
    }
    // LINE #メモ の登録（通常はフル管理者か line-webhook 内部ブリッジ経由）
    if (req.method === "POST" && path === "/pos-journals/knowledge/process-line-post") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      return json(await processLinePostKnowledge(supabase, body, storeScope), 200)
    }
    if (req.method === "GET" && path === "/pos-journals/store-ops") {
      return json(await fetchStoreOperationProfile(supabase, url, storeScope), 200)
    }
    if (req.method === "POST" && path === "/pos-journals/store-ops") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      return json(await saveStoreOperationProfile(supabase, body, storeScope), 200)
    }
    if (req.method === "GET" && path === "/pos-journals/report-ai-history") {
      return json(await fetchReportAiHistoryList(supabase, url), 200)
    }
    if (req.method === "POST" && path === "/pos-journals/report-ai-history") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      return json(await saveReportAiHistory(supabase, body, storeScope), 200)
    }
    if (req.method === "DELETE" && path === "/pos-journals/report-ai-history/item") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      return json(await deleteReportAiHistoryItem(supabase, body, storeScope), 200)
    }
    if (req.method === "PATCH" && path === "/pos-journals/report-ai-history/item") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      return json(await restoreJournalHistoryItem(supabase, "ai_analysis_history", "AI分析履歴", body, storeScope), 200)
    }
    if (req.method === "GET" && path === "/pos-journals/chat-pdf-history") {
      return json(await fetchChatPdfHistoryList(supabase, url), 200)
    }
    if (req.method === "GET" && path === "/pos-journals/chat-pdf-history/item") {
      return json(await fetchChatPdfHistoryItem(supabase, url), 200)
    }
    if (req.method === "POST" && path === "/pos-journals/chat-pdf-history") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      return json(await saveChatPdfHistory(supabase, body, storeScope), 200)
    }
    if (req.method === "DELETE" && path === "/pos-journals/chat-pdf-history/item") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      return json(await deleteChatPdfHistoryItem(supabase, body, storeScope), 200)
    }
    if (req.method === "PATCH" && path === "/pos-journals/chat-pdf-history/item") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      return json(await restoreJournalHistoryItem(supabase, "ai_chat_pdf_history", "AIチャットPDF履歴", body, storeScope), 200)
    }

    if (req.method === "GET" && path === "/reservations/calendar") {
      const reservationCalendarState = await fetchReservationCalendarState(supabase, url)
      return json(reservationCalendarState, 200)
    }
    if (req.method === "GET" && path === "/reservations/search") {
      const reservationSearchState = await fetchReservationSearchState(supabase, url)
      return json(reservationSearchState, 200)
    }
    // Journal Report AI チャット用の予約確定事実（氏名あり・電話なし・新規/リピート付き）
    if (req.method === "GET" && path === "/reservations/ai-facts") {
      const reservationAiFacts = await fetchReservationAiFacts(supabase, url)
      return json(reservationAiFacts, 200)
    }
    // 予約表の手動編集: 新規作成（手入力）/ 編集・非表示(ソフト削除)・復元 / 氏名・電話サジェスト。
    if (req.method === "POST" && path === "/reservations/event") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const result = await createManualReservationEvent(supabase, body, storeScope)
      return json(result, 200)
    }
    if (req.method === "PATCH" && path === "/reservations/event") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const result = await updateReservationEvent(supabase, body, storeScope)
      return json(result, 200)
    }
    if (req.method === "POST" && path === "/reservations/customer-suggest") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const result = await suggestReservationCustomers(supabase, body, storeScope)
      return json(result, 200)
    }
    // 日次cron用: 過去予約を店舗別・日別のAI確定キャッシュへ保存する。
    // 顧客名を含む内部一括処理なので、cron認証以外からの実行は許可しない。
    if (req.method === "POST" && path === "/reservations/ai-cache/rebuild") {
      if (authResult.scopeKind !== "cron") {
        return json({ error: "Forbidden." }, 403)
      }
      const parsedBody = await parseJson(workReq).catch(() => ({}))
      const result = await rebuildReservationAiDailyCache(
        supabase,
        isRecord(parsedBody) ? parsedBody : {},
      )
      return json(result, 200)
    }
    // 完全削除（ハードデリート）: キャンセル(非表示)と異なり行を物理削除し履歴も残さない。
    // source/id は URL クエリで受ける（PII を含まない）。
    if (req.method === "DELETE" && path === "/reservations/event") {
      const result = await deleteReservationEvent(supabase, url, storeScope)
      return json(result, 200)
    }

    // ── 小口現金（出金/経費）台帳: 一覧+月集計 / 追加(手入力) / 論理削除 ──
    if (req.method === "GET" && path === "/petty-cash") {
      const state = await fetchPettyCashState(supabase, url)
      return json(state, 200)
    }
    // 出金(レシート画像由来)の元レシート画像の署名URLを返す（別ページで開く用）。
    if (req.method === "GET" && path === "/petty-cash/receipt-media") {
      const result = await fetchPettyCashReceiptMedia(supabase, url, storeScope)
      return json(result, 200)
    }
    // フードコート「テナント一覧」レポートの抽出結果（分析専用・店舗スコープ）。専用ページ foodcourt.html 用。
    if (req.method === "GET" && path === "/foodcourt/reports") {
      // 店舗キーは大文字小文字ゆらぎ（例: marugoS）があるため ilike で照合（スコープ強制側は小文字化される）。
      const storeKey = String(url.searchParams.get("store_key") ?? url.searchParams.get("store") ?? "").trim()
      if (!storeKey) return json({ error: "store_key is required." }, 400)
      const limitRaw = Number(url.searchParams.get("limit") ?? "60")
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : 60
      const { data, error } = await supabase
        .from("foodcourt_tenant_reports")
        .select("id, report_date, base_tenant_name, tenants, created_at, line_message_id")
        .ilike("store_partition_key", storeKey)
        .order("created_at", { ascending: false })
        .limit(limit)
      if (error) return json({ error: error.message }, 500)
      const reports = Array.isArray(data) ? data : []
      // 会場イベント（東京ドーム）・天気を併せて返す。マルゴSは東京ドーム内のため客数増減と相関する。
      const events = await loadVenueEventsForReports(supabase, storeKey, reports)
      const weather = await loadWeatherForReports(supabase, storeKey, reports)
      const forecast = await loadForecastForStore(supabase, storeKey)
      // 客数/売上/組数の正本（管理表＝レシート集計＋手入力）。日報が無い日も含む。画面はこれを優先採用。
      const baseDaily = await loadBaseDailyForReports(supabase, storeKey)
      return json({ store_key: storeKey, reports, events, weather, forecast, baseDaily }, 200)
    }
    // Journal ReportのマルゴエスAI向け。foodcourt.html全件ではなく、期間内イベントと
    // 直近のコート内順位だけを返す。Groq再生成はしない（時間切れ対策）。
    if (req.method === "GET" && path === "/foodcourt/journal-brief") {
      const storeKey = String(url.searchParams.get("store_key") ?? url.searchParams.get("store") ?? "").trim()
      if (!storeKey) return json({ error: "store_key is required." }, 400)
      if (storeKey.toLowerCase() !== "marugos") {
        return json({ ok: true, skipped: true, reason: "marugos_only" }, 200)
      }
      const startRaw = String(url.searchParams.get("start") ?? "").trim()
      const endRaw = String(url.searchParams.get("end") ?? "").trim()
      const todayIso = new Date().toISOString().slice(0, 10)
      const startDate = /^\d{4}-\d{2}-\d{2}$/.test(startRaw) ? startRaw : addDaysIso(todayIso, -31)
      const endDate = /^\d{4}-\d{2}-\d{2}$/.test(endRaw) ? endRaw : todayIso
      const lo = startDate <= endDate ? startDate : endDate
      const hi = startDate <= endDate ? endDate : startDate
      // 詳細本文は36件に抑える一方、件数はPostgRESTのexact countを別契約で保持する。
      // events.lengthを期間内の全件数として扱うと、36件上限がそのまま誤った分析値になる。
      const { data: eventRows, error: eventError, count: eventTotalCount } = await supabase
        .from("tokyo_dome_events")
        .select("event_date, title, category, venue, expected_attendance", { count: "exact" })
        .gte("event_date", lo)
        .lte("event_date", hi)
        .order("event_date", { ascending: true })
        .limit(36)
      if (eventError) return json({ error: eventError.message }, 500)
      const events = (Array.isArray(eventRows) ? eventRows : []).map((row) => ({
        event_date: String((row as { event_date?: unknown }).event_date ?? "").slice(0, 10),
        title: String((row as { title?: unknown }).title ?? "").slice(0, 80),
        category: String((row as { category?: unknown }).category ?? "").slice(0, 40),
        venue: String((row as { venue?: unknown }).venue ?? "").slice(0, 40),
        expected_attendance: (row as { expected_attendance?: unknown }).expected_attendance == null
          ? null
          : Number((row as { expected_attendance?: unknown }).expected_attendance),
      })).filter((row) => row.event_date && row.title)
      const { data: reportRows, error: reportError } = await supabase
        .from("foodcourt_tenant_reports")
        .select("report_date, base_tenant_name, tenants")
        .ilike("store_partition_key", storeKey)
        .gte("report_date", lo)
        .lte("report_date", hi)
        .order("report_date", { ascending: false })
        .limit(1)
      if (reportError) return json({ error: reportError.message }, 500)
      const latest = Array.isArray(reportRows) && reportRows[0]
        ? reportRows[0] as Record<string, unknown>
        : null
      const baseName = String(latest?.base_tenant_name ?? "MARUGO S")
      const tenantList = (Array.isArray(latest?.tenants) ? latest.tenants : [])
        .map((tenant) => {
          const rec = tenant && typeof tenant === "object" ? tenant as Record<string, unknown> : {}
          const sales = rec.sales == null ? null : Number(rec.sales)
          const guests = rec.guests == null ? null : Number(rec.guests)
          return {
            name: String(rec.name ?? "").trim().slice(0, 40),
            sales: Number.isFinite(sales) ? sales : null,
            guests: Number.isFinite(guests) ? guests : null,
          }
        })
        .filter((tenant) => tenant.name && tenant.sales != null && tenant.sales >= 0)
        .sort((a, b) => (b.sales || 0) - (a.sales || 0))
      const totalSales = tenantList.reduce((sum, tenant) => sum + (tenant.sales || 0), 0)
      const norm = (value: string) => value.replace(/\s+/g, "").toLowerCase()
      const self = tenantList.find((tenant) =>
        norm(tenant.name) === norm(baseName) || /マルゴ\s*エス|marugo\s*s/.test(norm(tenant.name))
      ) || null
      const selfRank = self ? tenantList.findIndex((tenant) => tenant === self) + 1 : null
      const withMeta = tenantList.map((tenant) => ({
        ...tenant,
        unit: tenant.guests && tenant.guests > 0 && tenant.sales != null
          ? Math.round(tenant.sales / tenant.guests)
          : null,
      }))
      const guestOrder = [...withMeta]
        .filter((tenant) => tenant.guests != null)
        .sort((a, b) => (b.guests || 0) - (a.guests || 0))
      const unitOrder = [...withMeta]
        .filter((tenant) => tenant.unit != null)
        .sort((a, b) => (b.unit || 0) - (a.unit || 0))
      const medianOf = (nums: number[]) => {
        const xs = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
        if (!xs.length) return null
        const mid = Math.floor(xs.length / 2)
        return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2
      }
      const medGuests = medianOf(withMeta.map((tenant) => tenant.guests).filter((n): n is number => n != null))
      const medUnit = medianOf(withMeta.map((tenant) => tenant.unit).filter((n): n is number => n != null))
      const selfMeta = self ? withMeta.find((tenant) => tenant.name === self.name) || null : null
      const guestRank = selfMeta && selfMeta.guests != null
        ? guestOrder.findIndex((tenant) => tenant.name === selfMeta.name) + 1
        : null
      const unitRank = selfMeta && selfMeta.unit != null
        ? unitOrder.findIndex((tenant) => tenant.name === selfMeta.name) + 1
        : null
      const guestsAtOrAboveMedian = selfMeta?.guests != null && medGuests != null
        ? selfMeta.guests >= medGuests
        : null
      const unitAtOrAboveMedian = selfMeta?.unit != null && medUnit != null
        ? selfMeta.unit >= medUnit
        : null
      const courtType = guestsAtOrAboveMedian == null || unitAtOrAboveMedian == null
        ? null
        : guestsAtOrAboveMedian && unitAtOrAboveMedian ? "総合上位"
        : guestsAtOrAboveMedian ? "集客型"
        : unitAtOrAboveMedian ? "単価型"
        : "要改善"
      const courtTypeNote = courtType === "総合上位" ? "客数・単価とも中央値以上"
        : courtType === "集客型" ? "集客は強い・単価が弱み"
        : courtType === "単価型" ? "単価は中位・集客が弱み"
        : courtType === "要改善" ? "客数・単価とも中央値未満"
        : null
      return json({
        ok: true,
        skipped: false,
        store_key: storeKey,
        start: lo,
        end: hi,
        events,
        event_total_count: Math.max(0, Number(eventTotalCount ?? events.length) || 0),
        event_list_truncated: Number(eventTotalCount ?? events.length) > events.length,
        court: latest ? {
          report_date: String(latest.report_date ?? "").slice(0, 10),
          base_tenant_name: baseName,
          tenant_count: tenantList.length,
          total_sales: totalSales,
          self: selfMeta ? {
            name: selfMeta.name,
            sales: selfMeta.sales,
            guests: selfMeta.guests,
            unit: selfMeta.unit,
            rank: selfRank,
            guest_rank: guestRank,
            unit_rank: unitRank,
            share_pct: totalSales > 0 ? Math.round((selfMeta.sales || 0) / totalSales * 1000) / 10 : null,
            type: courtType,
            type_note: courtTypeNote,
          } : null,
          top: tenantList.slice(0, 5).map((tenant, index) => ({
            rank: index + 1,
            name: tenant.name,
            sales: tenant.sales,
          })),
        } : null,
      }, 200)
    }
    // 「レポート一覧」タブ用：日次AIサマリーの一覧（本文は含まない軽量版。クリック時に
    // /foodcourt/daily-summary?report_id=... で本文を取得する）。
    if (req.method === "GET" && path === "/foodcourt/daily-summary/list") {
      const storeKey = String(url.searchParams.get("store_key") ?? url.searchParams.get("store") ?? "").trim()
      if (!storeKey) return json({ error: "store_key is required." }, 400)
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 90) || 90, 1), 365)
      const { data, error } = await supabase
        .from("foodcourt_daily_ai_summary")
        .select("report_id, business_date, model_version, created_at")
        .ilike("store_partition_key", storeKey)
        .order("business_date", { ascending: false })
        .limit(limit)
      if (error) return json({ error: error.message }, 500)
      return json({ items: data ?? [] }, 200)
    }
    // 「分析サマリー（自動）」カードのAI版。report_id単位でキャッシュし、閲覧のたびに再生成・再課金しない。
    // 初回閲覧時にGroq(専門AI2体→統合AI)で生成しDBへ保存、以降は保存済みテキストを即返す。
    if (req.method === "GET" && path === "/foodcourt/daily-summary") {
      const storeKey = String(url.searchParams.get("store_key") ?? url.searchParams.get("store") ?? "").trim()
      if (!storeKey) return json({ error: "store_key is required." }, 400)
      const reportIdParam = url.searchParams.get("report_id")
      // 実効バージョン: ループが日次で有効なときだけ v12-loop（無効の間は v11 のまま＝既存キャッシュを維持）。
      const dailyAiVersion = await resolveFoodCourtPassingAwareCacheVersion(
        supabase,
        resolveFoodCourtDailyAnalysisVersion(),
      )
      const { data, error } = await supabase
        .from("foodcourt_tenant_reports")
        .select("id, report_date, base_tenant_name, tenants, created_at")
        .ilike("store_partition_key", storeKey)
        .order("created_at", { ascending: false })
        .limit(90)
      if (error) return json({ error: error.message }, 500)
      const reports = Array.isArray(data) ? data as Array<Record<string, unknown>> : []
      if (!reports.length) return json({ summary: null, reportCount: 0 }, 200)
      const target = reportIdParam
        ? reports.find((r) => String((r as { id?: unknown }).id ?? "") === reportIdParam)
        : reports[0]
      if (!target) return json({ error: "report_id not found." }, 404)
      const reportId = (target as { id?: unknown }).id
      const { data: cached, error: cacheErr } = await supabase
        .from("foodcourt_daily_ai_summary")
        .select("summary_text")
        .eq("report_id", reportId)
        .eq("model_version", dailyAiVersion)
        .maybeSingle()
      if (cacheErr) return json({ error: cacheErr.message }, 500)
      if (cached && (cached as { summary_text?: unknown }).summary_text) {
        const loop = await loadLatestFoodCourtLoopScore(supabase, storeKey, "daily_summary", { report_id: reportId })
        return json({
          summary: (cached as { summary_text: string }).summary_text,
          cached: true,
          reportCount: reports.length,
          ...loop,
        }, 200)
      }
      const groqApiKey = Deno.env.get("GROQ_API_KEY") ?? ""
      if (!groqApiKey) return json({ error: "GROQ_API_KEY is missing." }, 500)
      const baseName = String((target as { base_tenant_name?: unknown }).base_tenant_name ?? "MARUGO S")
      const events = await loadVenueEventsForReports(supabase, storeKey, reports)
      const weather = await loadWeatherForReports(supabase, storeKey, reports)
      const forecast = await loadForecastForStore(supabase, storeKey)
      const modelVersion = dailyAiVersion
      const businessDate = fcSalesDate(target) || null
      // 前回（直近の1つ前の営業日）に生成済みのAI分析を、自己検証の材料として渡す（日々の分析に連続性を持たせる）。
      let priorSummary: { businessDate: string; summaryText: string } | null = null
      if (businessDate) {
        const { data: priorRow } = await supabase
          .from("foodcourt_daily_ai_summary")
          .select("business_date, summary_text")
          .eq("store_partition_key", storeKey)
          .eq("model_version", dailyAiVersion)
          .lt("business_date", businessDate)
          .order("business_date", { ascending: false })
          .limit(1)
          .maybeSingle()
        if (priorRow && (priorRow as { summary_text?: unknown }).summary_text) {
          priorSummary = {
            businessDate: String((priorRow as { business_date?: unknown }).business_date ?? ""),
            summaryText: String((priorRow as { summary_text: string }).summary_text),
          }
        }
      }
      // 現場日報: 対象日の前後14日＋対象日を含めて AI に渡す（施策効果の照合用）。
      const logsTo = businessDate || jstDateIso(0)
      const logsFrom = addDaysIso(logsTo, -14)
      const { logs: dailyLogs, error: dailyLogsError, count: dailyLogsCount } = await loadFoodCourtDailyLogs(
        supabase,
        storeKey,
        { from: logsFrom, to: logsTo, limit: 30 },
      )
      if (dailyLogsError) {
        console.error("foodcourt/daily-summary daily_logs load failed:", dailyLogsError)
      }
      // 「先月の振り返り」を学習材料として渡す（月に1回だけAI生成・以降は月末までキャッシュ再利用）。
      // reportsは既に読み込み済みの直近90件（前月分は通常この範囲に収まる）を再利用し、追加クエリはしない。
      let monthlyRetro: string | null = null
      if (businessDate) {
        const monthRange = previousMonthRange(businessDate)
        if (monthRange) {
          monthlyRetro = await getOrGenerateMonthlyRetrospective(
            supabase, storeKey, baseName, monthRange.yearMonth, monthRange.monthStart, monthRange.monthEnd,
            groqApiKey, reports, events, weather, forecast, dailyLogs,
          )
        }
      }
      // 曜日/イベント種別/天気ごとの統計パターンはgenerateFoodCourtDailySummary内でreportsから毎回
      // 計算し直す（コード計算・状態を持たない＝データが増えるほど自動的に確度が上がる）。
      const summary = await generateFoodCourtDailySummary(
        reports, baseName, target, groqApiKey, events, weather, forecast, supabase, storeKey, priorSummary, dailyLogs, monthlyRetro,
      )
      if (!summary) {
        return json({
          summary: null,
          error: "生成に失敗しました。",
          reportCount: reports.length,
          daily_logs_count: dailyLogsCount,
          daily_logs_error: dailyLogsError,
        }, 200)
      }
      const { error: upErr } = await supabase.from("foodcourt_daily_ai_summary").upsert({
        report_id: reportId,
        store_partition_key: storeKey,
        business_date: businessDate,
        summary_text: summary,
        model_version: modelVersion,
      }, { onConflict: "report_id" })
      if (upErr) console.error("foodcourt_daily_ai_summary upsert failed:", upErr.message)
      const loop = await loadLatestFoodCourtLoopScore(supabase, storeKey, "daily_summary", { report_id: reportId })
      return json({
        summary,
        cached: false,
        reportCount: reports.length,
        daily_logs_count: dailyLogsCount,
        daily_logs_error: dailyLogsError,
        ...loop,
      }, 200)
    }
    // 「分析サマリー（自動）」カードの期間集計版。「期間で見る」モード専用（単日と違いreport_idを持たないため
    // 店舗+開始日+終了日でキャッシュ）。ロジックはdaily-summaryと同じ考え方。
    if (req.method === "GET" && path === "/foodcourt/period-summary") {
      const storeKey = String(url.searchParams.get("store_key") ?? url.searchParams.get("store") ?? "").trim()
      if (!storeKey) return json({ error: "store_key is required." }, 400)
      const startRaw = String(url.searchParams.get("start") ?? "").trim()
      const endRaw = String(url.searchParams.get("end") ?? "").trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startRaw) || !/^\d{4}-\d{2}-\d{2}$/.test(endRaw)) {
        return json({ error: "start/end must be YYYY-MM-DD." }, 400)
      }
      const startDate = startRaw <= endRaw ? startRaw : endRaw
      const endDate = startRaw <= endRaw ? endRaw : startRaw
      const periodAiVersion = await resolveFoodCourtPassingAwareCacheVersion(
        supabase,
        FOODCOURT_ANALYSIS_AI_VERSION,
      )
      const { data: cached, error: cacheErr } = await supabase
        .from("foodcourt_period_ai_summary")
        .select("summary_text")
        .eq("store_partition_key", storeKey)
        .eq("start_date", startDate)
        .eq("end_date", endDate)
        .eq("model_version", periodAiVersion)
        .maybeSingle()
      if (cacheErr) return json({ error: cacheErr.message }, 500)
      if (cached && (cached as { summary_text?: unknown }).summary_text) {
        const loop = await loadLatestFoodCourtLoopScore(supabase, storeKey, "period_summary", {
          start_date: startDate,
          end_date: endDate,
        })
        return json({ summary: (cached as { summary_text: string }).summary_text, cached: true, ...loop }, 200)
      }
      const { data, error } = await supabase
        .from("foodcourt_tenant_reports")
        .select("id, report_date, base_tenant_name, tenants, created_at")
        .ilike("store_partition_key", storeKey)
        .order("created_at", { ascending: false })
        .limit(90)
      if (error) return json({ error: error.message }, 500)
      const reports = Array.isArray(data) ? data as Array<Record<string, unknown>> : []
      if (!reports.length) return json({ summary: null, reportCount: 0 }, 200)
      const groqApiKey = Deno.env.get("GROQ_API_KEY") ?? ""
      if (!groqApiKey) return json({ error: "GROQ_API_KEY is missing." }, 500)
      const baseName = String((reports[0] as { base_tenant_name?: unknown }).base_tenant_name ?? "MARUGO S")
      const events = await loadVenueEventsForReports(supabase, storeKey, reports)
      const weather = await loadWeatherForReports(supabase, storeKey, reports)
      const forecast = await loadForecastForStore(supabase, storeKey)
      const modelVersion = periodAiVersion
      const { logs: dailyLogs, error: dailyLogsError, count: dailyLogsCount } = await loadFoodCourtDailyLogs(
        supabase,
        storeKey,
        { from: startDate, to: endDate, limit: 90 },
      )
      if (dailyLogsError) {
        console.error("foodcourt/period-summary daily_logs load failed:", dailyLogsError)
      }
      const summary = await generateFoodCourtPeriodSummary(
        reports, baseName, startDate, endDate, groqApiKey, events, weather, forecast, supabase, storeKey, dailyLogs,
      )
      if (!summary) {
        return json({
          summary: null,
          error: "生成に失敗しました。",
          daily_logs_count: dailyLogsCount,
          daily_logs_error: dailyLogsError,
        }, 200)
      }
      const { error: upErr } = await supabase.from("foodcourt_period_ai_summary").upsert({
        store_partition_key: storeKey,
        start_date: startDate,
        end_date: endDate,
        summary_text: summary,
        model_version: modelVersion,
      }, { onConflict: "store_partition_key,start_date,end_date" })
      if (upErr) console.error("foodcourt_period_ai_summary upsert failed:", upErr.message)
      const loop = await loadLatestFoodCourtLoopScore(supabase, storeKey, "period_summary", {
        start_date: startDate,
        end_date: endDate,
      })
      return json({
        summary,
        cached: false,
        daily_logs_count: dailyLogsCount,
        daily_logs_error: dailyLogsError,
        ...loop,
      }, 200)
    }
    // 蓄積データへの質問応答（Q&A）。Journal用のdeep routeは同じ分析器を使うが、
    // マルゴエス限定・期間固定・履歴非保存・明確なHTTP失敗契約にする。
    if (req.method === "POST" && (path === "/foodcourt/ask" || path === "/foodcourt/journal-deep-analysis")) {
      const isJournalDeep = path === "/foodcourt/journal-deep-analysis"
      const body = await workReq.json().catch(() => ({})) as Record<string, unknown>
      const storeKey = String(body.store_key ?? body.store ?? url.searchParams.get("store_key") ?? "").trim()
      const rawQuestion = String(body.question ?? "").trim()
      if (!storeKey) return json({ error: "store_key is required." }, 400)
      if (!rawQuestion) return json({ error: "question is required." }, 400)
      if (rawQuestion.length > 500) return json({ error: "question must be 1-500 characters." }, 400)
      if (isJournalDeep && storeKey.toLowerCase() !== "marugos") {
        return json({ error: "フードコート深掘りはマルゴエス専用です。" }, 403)
      }
      let question = rawQuestion
      const requestId = isJournalDeep ? crypto.randomUUID() : null
      const rangeRows = Array.isArray(body.requested_ranges) ? body.requested_ranges : []
      const requestedRanges = rangeRows.map((row) => {
        const rec = row && typeof row === "object" ? row as Record<string, unknown> : {}
        const from = String(rec.from ?? "").slice(0, 10)
        const to = String(rec.to ?? "").slice(0, 10)
        if (!isStrictIsoDate(from) || !isStrictIsoDate(to)) return null
        return from <= to ? { from, to } : { from: to, to: from }
      }).filter((row): row is { from: string; to: string } => row != null).slice(0, 6)
      if (
        isJournalDeep &&
        (rangeRows.length > 6 || (rangeRows.length > 0 && requestedRanges.length !== rangeRows.length))
      ) {
        return json({
          error: "requested_ranges は有効な日付範囲を最大6件まで指定してください。",
          code: "invalid_date_range",
          request_id: requestId,
        }, 400)
      }
      if (isJournalDeep && requestedRanges.length === 0) {
        const today = jstDateIso(0)
        requestedRanges.push({ from: jstDateIso(-90), to: today })
      }
      // 会話継続: 直前までのQ&A履歴を受け取り、文脈として渡す（指示語が効くように）。最新8件・各4000字まで。
      const historyRaw = Array.isArray((body as { history?: unknown }).history) ? (body.history as unknown[]) : []
      const history = (isJournalDeep ? [] : historyRaw).map((h) => {
        const o = (h && typeof h === "object") ? h as Record<string, unknown> : {}
        const role = String(o.role ?? "")
        const content = String(o.content ?? "").slice(0, 4000)
        return (role === "user" || role === "assistant") && content ? { role, content } : null
      }).filter((x): x is { role: string; content: string } => x != null).slice(-8)
      const groqApiKey = Deno.env.get("GROQ_API_KEY") ?? ""
      if (!groqApiKey) {
        if (isJournalDeep) {
          return json({
            error: "フードコート専門分析を開始できませんでした。",
            code: "foodcourt_ai_unavailable",
            request_id: requestId,
          }, 500)
        }
        return json({ error: "GROQ_API_KEY is missing." }, 500)
      }
      let reportsQuery = supabase
        .from("foodcourt_tenant_reports")
        .select("id, report_date, tenants, created_at, base_tenant_name")
        .ilike("store_partition_key", storeKey)
        .order("created_at", { ascending: false })
        .limit(isJournalDeep ? 500 : 90)
      if (isJournalDeep) {
        const from = requestedRanges.map((row) => row.from).sort()[0]
        const to = requestedRanges.map((row) => row.to).sort().at(-1) || from
        // tenant reportは売上日の翌朝発行なので、DB検索境界を1日進める。
        reportsQuery = reportsQuery
          .gte("report_date", addDaysIso(from, 1))
          .lte("report_date", addDaysIso(to, 1))
      }
      const { data, error } = await reportsQuery
      if (error) {
        console.error(`${path} reports load failed:`, error.message)
        if (isJournalDeep) {
          return json({
            error: "フードコート比較データを取得できませんでした。",
            code: "foodcourt_data_load_failed",
            request_id: requestId,
          }, 500)
        }
        return json({ error: error.message }, 500)
      }
      const fetchedReports = Array.isArray(data) ? data as Array<Record<string, unknown>> : []
      const reports = isJournalDeep
        ? (() => {
          // created_at降順の先頭だけを売上日ごとの正本として使い、再取込・再解析履歴を二重集計しない。
          const seenSalesDates = new Set<string>()
          return fetchedReports.filter((report) => {
            const salesDate = fcSalesDate(report)
            if (!requestedRanges.some((range) => salesDate >= range.from && salesDate <= range.to)) return false
            if (!salesDate || seenSalesDates.has(salesDate)) return false
            seenSalesDates.add(salesDate)
            return true
          })
        })()
        : fetchedReports
      const journalCoverage = isJournalDeep
        ? buildFoodcourtJournalCoverage(
          requestedRanges,
          reports.map((report) => fcSalesDate(report)).filter(Boolean),
        )
        : null
      if (!reports.length) {
        if (isJournalDeep) {
          return json({
            error: "指定期間のフードコート比較データがありません。",
            code: "foodcourt_data_unavailable",
            request_id: requestId,
            coverage: { ...journalCoverage, report_count: 0 },
          }, 422)
        }
        return json({ answer: "まだデータがありません。フードコートのテナント一覧画像を送ると蓄積されます。", reportCount: 0 }, 200)
      }
      const baseName = String((reports[0] as { base_tenant_name?: unknown }).base_tenant_name ?? "MARUGO S")
      // 会場イベント（東京ドーム）・天気も根拠に渡す。客数増減との相関を踏まえて回答させる。
      const events = await loadVenueEventsForReports(supabase, storeKey, reports)
      const weather = await loadWeatherForReports(supabase, storeKey, reports)
      const forecast = await loadForecastForStore(supabase, storeKey)
      // 現場日報（foodcourt_daily_logs）: Q&A分析の精度向上のため直近60日分を取得してAIに渡す。
      // 失敗時は空配列にせず error をレスポンス・ログに出し、サイレント劣化を防ぐ。
      const todayForLogs = isJournalDeep
        ? requestedRanges.map((row) => row.to).sort().at(-1) || jstDateIso(0)
        : jstDateIso(0)
      const logsFrom = isJournalDeep
        ? requestedRanges.map((row) => row.from).sort()[0]
        : jstDateIso(-60)
      const { logs: dailyLogs, error: dailyLogsError, count: dailyLogsCount } = await loadFoodCourtDailyLogs(
        supabase,
        storeKey,
        { from: logsFrom, to: todayForLogs, limit: isJournalDeep ? 120 : 60 },
      )
      if (dailyLogsError) {
        console.error(`${path} daily_logs load failed:`, dailyLogsError)
      }
      let analysisReports = reports
      let analysisDailyLogs = dailyLogs
      if (isJournalDeep) {
        // Journal経由では質問だけでなく、日報自由記述を含む分析材料も外部AI送信前に
        // 同じ仮名化テーブルで処理する。原本・DBは変更しない。
        const privacySafe = sanitizeJournalAiPayload({
          message: rawQuestion,
          salesData: { reports, daily_logs: dailyLogs },
        })
        question = privacySafe.message
        const safeData = isRecord(privacySafe.salesData)
          ? privacySafe.salesData
          : {}
        analysisReports = Array.isArray(safeData.reports)
          ? safeData.reports as Array<Record<string, unknown>>
          : []
        analysisDailyLogs = Array.isArray(safeData.daily_logs)
          ? safeData.daily_logs as Array<Record<string, unknown>>
          : []
      }
      // 画面に表示中の単日レポート(viewing_report_id)を、特に日付指定のない質問のデフォルト対象日としてAIに伝える。
      // これが無いと、AIは全履歴のどの日の話かを画面と無関係に(会話文脈だけで)決めてしまい、時間軸がずれる。
      const viewingReportIdRaw = (body as { viewing_report_id?: unknown }).viewing_report_id
      const viewingReportId = viewingReportIdRaw != null ? String(viewingReportIdRaw) : ""
      const viewingReport = viewingReportId ? reports.find((r) => String((r as { id?: unknown }).id ?? "") === viewingReportId) : null
      const viewingDate = viewingReport ? fcSalesDate(viewingReport) : null
      try {
        const qaResult = await answerFoodCourtQuestion(
          analysisReports,
          baseName,
          question,
          groqApiKey,
          events,
          weather,
          supabase,
          storeKey,
          history,
          forecast,
          viewingDate,
          analysisDailyLogs,
          journalCoverage,
        )
        if (isJournalDeep && !String(qaResult.answer ?? "").trim()) {
          return json({
            error: "フードコート専門AIから有効な分析を取得できませんでした。",
            code: "foodcourt_empty_analysis",
            request_id: requestId,
          }, 502)
        }
        let answer = qaResult.answer || "回答を生成できませんでした。もう一度お試しください。"
        // 日報テーブル読込失敗時は回答末尾に注意を付与（AIは「日報なし」と誤認するため）。
        if (dailyLogsError) {
          answer += isJournalDeep
            ? "\n\n⚠️ システム注意: 現場日報の取得に失敗したため、施策記録は未参照です。"
            : `\n\n⚠️ システム注意: 現場日報の取得に失敗したため、施策記録は未参照です（${dailyLogsError}）。`
        }
        if (isJournalDeep) {
          const usedDates = reports.map((report) => fcSalesDate(report)).filter(Boolean).sort()
          const truncated = fetchedReports.length >= 500
          return json({
            ok: true,
            status: dailyLogsError || truncated || journalCoverage?.coverage_status === "partial"
              ? "partial"
              : "complete",
            request_id: requestId,
            store_key: "marugos",
            analysis: {
              text: answer,
              report_count: reports.length,
              loop_score: qaResult.loopScore,
              loop_count: qaResult.loopCount,
            },
            coverage: {
              ...journalCoverage,
              used_from: usedDates[0] ?? null,
              used_to: usedDates.at(-1) ?? null,
              report_count: reports.length,
              prompt_detail_days: Math.min(reports.length, 45),
              truncated,
            },
            diagnostics: {
              daily_logs_count: dailyLogsCount,
              daily_logs_error: dailyLogsError ? "unavailable" : null,
            },
            history_saved: false,
            usage: { tracking: "best_effort", surface: "foodcourt" },
          }, 200)
        }
        const { data: savedQa, error: saveQaError } = await supabase
          .from("foodcourt_qa_history")
          .insert({
            store_partition_key: storeKey,
            question,
            answer,
            loop_score: qaResult.loopScore,
            loop_count: qaResult.loopCount,
            // x_trend_brief: Grokが実際にXから取ってきた本文。統合AIが圧縮した後の
            // answer しか残らないと、Xの情報が薄いのか統合AIが潰したのかを切り分けられない。
            source_ref: {
              viewing_report_id: viewingReportId || null,
              viewing_date: viewingDate ?? null,
              x_trend_brief: qaResult.xTrendBrief ?? null,
            },
          })
          .select("id, created_at")
          .single()
        if (saveQaError) console.error("foodcourt/ask Q&A history save failed:", saveQaError.message)
        return json({
          answer,
          history_id: savedQa?.id ?? null,
          history_created_at: savedQa?.created_at ?? null,
          history_saved: !saveQaError,
          history_error: saveQaError?.message ?? null,
          reportCount: reports.length,
          loop_score: qaResult.loopScore,
          loop_count: qaResult.loopCount,
          daily_logs_count: dailyLogsCount,
          daily_logs_error: dailyLogsError,
        }, 200)
      } catch (e) {
        console.error(`${path} error:`, e)
        if (isJournalDeep) {
          return json({
            error: "フードコート専門分析を完了できませんでした。",
            code: "foodcourt_deep_analysis_failed",
            request_id: requestId,
          }, 502)
        }
        return json({
          answer: "⚠️ データの容量が大きい、または一時的な負荷のため、回答の生成に失敗しました。\n少し時間をおいてもう一度お試しいただくか、質問をもう少し短く・具体的にしてみてください。",
          reportCount: reports.length,
          loop_score: null,
          loop_count: 0,
          daily_logs_count: dailyLogsCount,
          daily_logs_error: dailyLogsError,
        }, 200)
      }
    }
    if (req.method === "GET" && path === "/foodcourt/qa-history") {
      const storeKey = String(url.searchParams.get("store_key") ?? url.searchParams.get("store") ?? "").trim()
      if (!storeKey) return json({ error: "store_key is required." }, 400)
      const rawLimit = Number(url.searchParams.get("limit") ?? "100")
      const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.trunc(rawLimit))) : 100
      const { data, error } = await supabase
        .from("foodcourt_qa_history")
        .select("id, question, answer, loop_score, loop_count, source_ref, created_at")
        .ilike("store_partition_key", storeKey)
        .order("created_at", { ascending: false })
        .limit(limit)
      if (error) return json({ error: error.message }, 500)
      return json({ items: data ?? [] }, 200)
    }
    if (req.method === "DELETE" && path === "/foodcourt/qa-history") {
      const storeKey = String(url.searchParams.get("store_key") ?? url.searchParams.get("store") ?? "").trim()
      const id = Number(url.searchParams.get("id") ?? "")
      if (!storeKey) return json({ error: "store_key is required." }, 400)
      if (!Number.isSafeInteger(id) || id <= 0) return json({ error: "id is required." }, 400)
      const { data, error } = await supabase
        .from("foodcourt_qa_history")
        .delete()
        .ilike("store_partition_key", storeKey)
        .eq("id", id)
        .select("id")
        .maybeSingle()
      if (error) return json({ error: error.message }, 500)
      if (!data) return json({ error: "Q&A履歴が見つかりません。" }, 404)
      return json({ ok: true, id }, 200)
    }
    // 各AIが希望プロバイダ/モデルで反応せずフォールバックした事象の一覧＋未確認件数。
    if (req.method === "GET" && path === "/foodcourt/ai-fallback-events") {
      const storeKey = String(url.searchParams.get("store_key") ?? url.searchParams.get("store") ?? "").trim()
      if (!storeKey) return json({ error: "store_key is required." }, 400)
      const rawLimit = Number(url.searchParams.get("limit") ?? "50")
      const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.trunc(rawLimit))) : 50
      const unackedOnly = String(url.searchParams.get("unacked") ?? "").trim() === "1"
      let listQuery = supabase
        .from("foodcourt_ai_fallback_events")
        .select("id, surface, role, preferred_provider, preferred_model, used_provider, used_model, outcome, attempts, acknowledged, created_at")
        .ilike("store_partition_key", storeKey)
        .order("created_at", { ascending: false })
        .limit(limit)
      if (unackedOnly) listQuery = listQuery.eq("acknowledged", false)
      const { data, error } = await listQuery
      if (error) return json({ error: error.message }, 500)
      // 未確認件数はバッジ用に別集計（一覧の limit に影響されない正確な件数）。
      const { count: unackedCount, error: countErr } = await supabase
        .from("foodcourt_ai_fallback_events")
        .select("id", { count: "exact", head: true })
        .ilike("store_partition_key", storeKey)
        .eq("acknowledged", false)
      if (countErr) return json({ error: countErr.message }, 500)
      return json({ items: data ?? [], unacked_count: unackedCount ?? 0 }, 200)
    }
    // フォールバック事象を「確認済み」にする。id 指定で1件、未指定なら店舗の未確認をすべて確認済みにする。
    if (req.method === "POST" && path === "/foodcourt/ai-fallback-events/ack") {
      let body: Record<string, unknown> = {}
      try {
        const raw = await parseJson(workReq)
        if (isRecord(raw)) body = raw
      } catch {
        body = {}
      }
      const storeKey = String(body.store_key ?? body.store ?? url.searchParams.get("store_key") ?? "").trim()
      if (!storeKey) return json({ error: "store_key is required." }, 400)
      const idRaw = body.id ?? url.searchParams.get("id")
      let ackQuery = supabase
        .from("foodcourt_ai_fallback_events")
        .update({ acknowledged: true })
        .ilike("store_partition_key", storeKey)
        .eq("acknowledged", false)
      if (idRaw != null && String(idRaw).trim() !== "") {
        const id = Number(idRaw)
        if (!Number.isSafeInteger(id) || id <= 0) return json({ error: "id is invalid." }, 400)
        ackQuery = ackQuery.eq("id", id)
      }
      const { data, error } = await ackQuery.select("id")
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true, acknowledged: (data ?? []).length }, 200)
    }
    // 学習進化トラッキング: foodcourt_forecast_history の全行を返す（foodcourt-evolution.html 用）。
    if (req.method === "GET" && path === "/foodcourt/evolution-history") {
      const storeKey = String(url.searchParams.get("store_key") ?? url.searchParams.get("store") ?? "marugoS").trim()
      const storeKeyNorm = storeKey.toLowerCase().replace(/[\s_\-]+/g, "")
      const tenantName = storeKeyNorm === "marugos" ? "MARUGO S" : storeKey
      const { data, error } = await supabase
        .from("foodcourt_forecast_history")
        .select("log_date, model_version, history_days, backtest_days, mape_guests, mape_sales, wape_guests, wape_sales, mae_guests, mae_sales, rolling_mape_guests, rolling_mape_sales, rolling_wape_guests, rolling_wape_sales, rolling_mae_guests, rolling_mae_sales, mean_guests, evaluation_version, created_at")
        .eq("tenant_name", tenantName)
        .order("log_date", { ascending: true })
      if (error) return json({ error: error.message }, 500)
      // model_selection detail from factors (single row per tenant)
      const { data: factors } = await supabase
        .from("foodcourt_forecast_factors")
        .select("model_selection, updated_at")
        .eq("tenant_name", tenantName)
        .maybeSingle()

      // line_admin_console_settings から foodcourt_evolution_passing_score を読み込む
      const { data: passSetting } = await supabase
        .from("line_admin_console_settings")
        .select("setting_value")
        .eq("setting_key", "foodcourt_evolution_passing_score")
        .maybeSingle()

      const passingScore = normalizeFoodCourtPassingScore(passSetting?.setting_value) ?? 65

      const { data: issuance, error: issuanceError } = await supabase
        .from("foodcourt_forecast_issuances")
        .select("id, issued_on, issued_at, evaluation_eligible, train_through, engine_version, chosen_model, evaluation, data_quality")
        .eq("tenant_name", tenantName)
        .order("issued_on", { ascending: false }).limit(1).maybeSingle()
      if (issuanceError) return json({ error: issuanceError.message }, 500)

      let upcomingForecasts: unknown[] = []
      if (issuance) {
        const { data: forecastRows, error: forecastError } = await supabase.from("foodcourt_forecast_snapshots")
          .select("target_date, horizon_days, guests, sales, guests_low, guests_high, sales_low, sales_high, input_snapshot")
          .eq("issuance_id", issuance.id).eq("model_version", issuance.chosen_model).order("target_date").limit(15)
        if (forecastError) return json({ error: forecastError.message }, 500)
        upcomingForecasts = forecastRows ?? []
      }

      return json({
        rows: data ?? [],
        model_selection: factors?.model_selection ?? null,
        passing_score: passingScore,
        forecast_audit: issuance ? { ...issuance, upcoming: upcomingForecasts } : null
      }, 200)
    }
    if (req.method === "GET" && path === "/foodcourt/ai-loop-runs") {
      const limit = Math.min(parseInt(String(url.searchParams.get("limit") ?? "30")), 50)
      const requestedStore = String(url.searchParams.get("store_key") ?? url.searchParams.get("store") ?? storeScope ?? "").trim()
      let runsQuery = supabase
        .from("foodcourt_ai_loop_runs")
        .select("id, surface, source_ref, final_score, returned_reason, created_at")
        .order("created_at", { ascending: false })
        .limit(limit)
      if (requestedStore) runsQuery = runsQuery.ilike("store_partition_key", requestedStore)
      const { data: runs, error: runsErr } = await runsQuery
      if (runsErr) return json({ error: runsErr.message }, 500)
      if (!runs || runs.length === 0) return json({ runs: [] }, 200)
      const runIds = runs.map((r: Record<string, unknown>) => r.id as string)
      const { data: iters, error: itersErr } = await supabase
        .from("foodcourt_ai_loop_iterations")
        .select("run_id, loop_index, total_score, score_accuracy, score_logic, score_expertise, score_practicality, score_evidence, passed, evaluation, created_at")
        .in("run_id", runIds)
        .order("loop_index", { ascending: true })
      if (itersErr) return json({ error: itersErr.message }, 500)
      const { data: feedbackRows, error: feedbackErr } = await supabase
        .from("foodcourt_ai_feedback")
        .select("run_id,rating,note,updated_at")
        .in("run_id", runIds)
      if (feedbackErr) return json({ error: feedbackErr.message }, 500)
      const itersByRun = new Map<string, unknown[]>()
      for (const it of (iters ?? [])) {
        const rid = (it as Record<string, unknown>).run_id as string
        if (!itersByRun.has(rid)) itersByRun.set(rid, [])
        itersByRun.get(rid)!.push(it)
      }
      const feedbackByRun = new Map<string, unknown>()
      for (const row of (feedbackRows ?? [])) {
        feedbackByRun.set(String((row as Record<string, unknown>).run_id ?? ""), row)
      }
      const result = runs.map((r: Record<string, unknown>) => ({
        ...r,
        iterations: itersByRun.get(r.id as string) ?? [],
        feedback: feedbackByRun.get(r.id as string) ?? null,
      }))
      return json({ runs: result }, 200)
    }
    if (req.method === "GET" && path === "/foodcourt/ai-rag") {
      const requestedStore = String(url.searchParams.get("store_key") ?? url.searchParams.get("store") ?? storeScope ?? "").trim()
      const surface = String(url.searchParams.get("surface") ?? "").trim()
      const allowedSurfaces = new Set(["ask", "daily_summary", "period_summary", "weekly_report"])
      if (surface && !allowedSurfaces.has(surface)) return json({ error: "Invalid surface." }, 400)
      const rawLimit = Number(url.searchParams.get("limit") ?? "100")
      const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.trunc(rawLimit))) : 100
      let ragQuery = supabase
        .from("foodcourt_ai_rag_documents")
        .select("source_run_id,surface,source_type,title,document_markdown,final_score,metadata,created_at,updated_at", { count: "exact" })
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(limit)
      if (requestedStore) ragQuery = ragQuery.ilike("store_partition_key", requestedStore)
      if (surface) ragQuery = ragQuery.eq("surface", surface)
      const { data, error, count } = await ragQuery
      if (error) return json({ error: error.message }, 500)
      return json({
        count: count ?? data?.length ?? 0,
        generated_at: new Date().toISOString(),
        documents: data ?? [],
      }, 200)
    }
    if (req.method === "GET" && path === "/foodcourt/evolution-readiness") {
      const requestedStore = String(url.searchParams.get("store_key") ?? url.searchParams.get("store") ?? storeScope ?? "").trim()
      let acceptedQuery = supabase
        .from("foodcourt_ai_rag_documents")
        .select("source_run_id,surface,source_type", { count: "exact" })
        .eq("is_active", true)
        .limit(1000)
      let humanHelpfulQuery = supabase
        .from("foodcourt_ai_rag_documents")
        .select("source_run_id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("source_type", "human_helpful")
      let dailyAcceptedQuery = supabase
        .from("foodcourt_ai_rag_documents")
        .select("source_run_id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("surface", "daily_summary")
      let totalRunsQuery = supabase
        .from("foodcourt_ai_loop_runs")
        .select("id", { count: "exact", head: true })
      let completedRunsQuery = supabase
        .from("foodcourt_ai_loop_runs")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed")
      if (requestedStore) {
        acceptedQuery = acceptedQuery.ilike("store_partition_key", requestedStore)
        humanHelpfulQuery = humanHelpfulQuery.ilike("store_partition_key", requestedStore)
        dailyAcceptedQuery = dailyAcceptedQuery.ilike("store_partition_key", requestedStore)
        totalRunsQuery = totalRunsQuery.ilike("store_partition_key", requestedStore)
        completedRunsQuery = completedRunsQuery.ilike("store_partition_key", requestedStore)
      }
      const [acceptedResult, humanResult, dailyResult, totalResult, completedResult] = await Promise.all([
        acceptedQuery,
        humanHelpfulQuery,
        dailyAcceptedQuery,
        totalRunsQuery,
        completedRunsQuery,
      ])
      const readinessError = acceptedResult.error ?? humanResult.error ?? dailyResult.error ?? totalResult.error ?? completedResult.error
      if (readinessError) return json({ error: readinessError.message }, 500)
      const acceptedRows = Array.isArray(acceptedResult.data) ? acceptedResult.data : []
      const acceptedSurfaces = new Set(acceptedRows.map((row) => String((row as Record<string, unknown>).surface ?? "")).filter(Boolean))
      const readiness = assessFoodCourtEvolutionReadiness({
        totalRuns: totalResult.count ?? 0,
        completedRuns: completedResult.count ?? 0,
        acceptedExamples: acceptedResult.count ?? acceptedRows.length,
        humanHelpfulExamples: humanResult.count ?? 0,
        dailyAcceptedExamples: dailyResult.count ?? 0,
        acceptedSurfaces: acceptedSurfaces.size,
      })
      return json({
        generated_at: new Date().toISOString(),
        store_key: requestedStore || null,
        ...readiness,
      }, 200)
    }
    // 自己進化 Phase 2: 本番に影響しない固定評価セットと手動候補の管理。
    // 評価セットは承認済みRAG教材の回答をスナップショットするだけで、AIモデル/本番プロンプトは変更しない。
    if (req.method === "GET" && path === "/foodcourt/prompt-evaluation-sets") {
      const requestedStore = String(url.searchParams.get("store_key") ?? url.searchParams.get("store") ?? storeScope ?? "").trim()
      let setQuery = supabase
        .from("foodcourt_prompt_evaluation_sets")
        .select("id,store_partition_key,name,status,source,baseline_model_version,case_count,created_at,updated_at")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
      let candidatesQuery = supabase
        .from("foodcourt_prompt_candidates")
        .select("id,name,surface,status,created_at,updated_at")
        .eq("status", "draft")
        .order("updated_at", { ascending: false })
        .limit(20)
      if (requestedStore) {
        setQuery = setQuery.ilike("store_partition_key", requestedStore)
        candidatesQuery = candidatesQuery.ilike("store_partition_key", requestedStore)
      }
      const [{ data: sets, error: setsError }, { data: candidates, error: candidatesError }] = await Promise.all([setQuery, candidatesQuery])
      const promptEvaluationError = setsError ?? candidatesError
      if (promptEvaluationError) return json({ error: promptEvaluationError.message }, 500)
      return json({
        store_key: requestedStore || null,
        active_set: sets?.[0] ?? null,
        candidates: candidates ?? [],
      }, 200)
    }
    if (req.method === "POST" && path === "/foodcourt/prompt-evaluation-sets/bootstrap") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) return json({ error: "Invalid JSON body." }, 400)
      const requestedStore = String(body.store_key ?? body.store ?? storeScope ?? "").trim()
      if (!requestedStore) return json({ error: "store_key is required." }, 400)
      if (storeScope && requestedStore.toLowerCase() !== storeScope.toLowerCase()) {
        return json({ error: "Forbidden for this store." }, 403)
      }
      const { data: existingSet, error: existingError } = await supabase
        .from("foodcourt_prompt_evaluation_sets")
        .select("id,store_partition_key,name,status,source,baseline_model_version,case_count,created_at,updated_at")
        .ilike("store_partition_key", requestedStore)
        .eq("status", "active")
        .maybeSingle()
      if (existingError) return json({ error: existingError.message }, 500)
      if (existingSet) return json({ ok: true, created: false, active_set: existingSet }, 200)

      const [acceptedResult, humanResult, dailyResult, totalResult, completedResult] = await Promise.all([
        supabase.from("foodcourt_ai_rag_documents")
          .select("source_run_id,surface,source_type,final_score,updated_at")
          .ilike("store_partition_key", requestedStore)
          .eq("is_active", true)
          .order("updated_at", { ascending: false })
          .limit(200),
        supabase.from("foodcourt_ai_rag_documents")
          .select("source_run_id", { count: "exact", head: true })
          .ilike("store_partition_key", requestedStore)
          .eq("is_active", true)
          .eq("source_type", "human_helpful"),
        supabase.from("foodcourt_ai_rag_documents")
          .select("source_run_id", { count: "exact", head: true })
          .ilike("store_partition_key", requestedStore)
          .eq("is_active", true)
          .eq("surface", "daily_summary"),
        supabase.from("foodcourt_ai_loop_runs")
          .select("id", { count: "exact", head: true })
          .ilike("store_partition_key", requestedStore),
        supabase.from("foodcourt_ai_loop_runs")
          .select("id", { count: "exact", head: true })
          .ilike("store_partition_key", requestedStore)
          .eq("status", "completed"),
      ])
      const bootstrapError = acceptedResult.error ?? humanResult.error ?? dailyResult.error ?? totalResult.error ?? completedResult.error
      if (bootstrapError) return json({ error: bootstrapError.message }, 500)
      const acceptedRows = (acceptedResult.data ?? []) as Record<string, unknown>[]
      const readiness = assessFoodCourtEvolutionReadiness({
        totalRuns: totalResult.count ?? 0,
        completedRuns: completedResult.count ?? 0,
        acceptedExamples: acceptedRows.length,
        humanHelpfulExamples: humanResult.count ?? 0,
        dailyAcceptedExamples: dailyResult.count ?? 0,
        acceptedSurfaces: new Set(acceptedRows.map((row) => String(row.surface ?? "")).filter(Boolean)).size,
      })
      if (!readiness.gates.promptCandidate.ready) {
        return json({ error: "プロンプト候補の比較評価を開始するための教材条件を満たしていません。", readiness }, 409)
      }
      const runIds = acceptedRows.map((row) => String(row.source_run_id ?? "")).filter(Boolean)
      const { data: runs, error: runsError } = await supabase
        .from("foodcourt_ai_loop_runs")
        .select("id,store_partition_key,surface,source_ref,user_input,model_version,final_score,final_answer,created_at")
        .in("id", runIds)
      if (runsError) return json({ error: runsError.message }, 500)
      const acceptedIds = new Set(runIds)
      const usableRuns = ((runs ?? []) as Record<string, unknown>[]).filter((run) =>
        acceptedIds.has(String(run.id ?? "")) &&
        String(run.store_partition_key ?? "").toLowerCase() === requestedStore.toLowerCase() &&
        String(run.final_answer ?? "").trim().length > 0,
      )
      if (usableRuns.length < 20) {
        return json({ error: "固定評価セットに必要な20件のベースライン回答を作成できません。" }, 409)
      }
      const jstDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date())
      const baselineVersions = [...new Set(usableRuns.map((run) => String(run.model_version ?? "")).filter(Boolean))]
      const { data: createdSet, error: createSetError } = await supabase
        .from("foodcourt_prompt_evaluation_sets")
        .insert({
          store_partition_key: requestedStore,
          name: `固定評価セット v1（${jstDate}）`,
          baseline_model_version: baselineVersions.length === 1 ? baselineVersions[0] : "mixed",
          case_count: 0,
        })
        .select("id,store_partition_key,name,status,source,baseline_model_version,case_count,created_at,updated_at")
        .single()
      if (createSetError) {
        if (createSetError.code === "23505") {
          const { data: racedSet } = await supabase
            .from("foodcourt_prompt_evaluation_sets")
            .select("id,store_partition_key,name,status,source,baseline_model_version,case_count,created_at,updated_at")
            .ilike("store_partition_key", requestedStore)
            .eq("status", "active")
            .maybeSingle()
          if (racedSet) return json({ ok: true, created: false, active_set: racedSet }, 200)
        }
        return json({ error: createSetError.message }, 500)
      }
      const caseRows = usableRuns.map((run) => ({
        evaluation_set_id: createdSet.id,
        source_run_id: String(run.id),
        surface: String(run.surface),
        source_ref: isRecord(run.source_ref) ? run.source_ref : {},
        user_input: typeof run.user_input === "string" ? run.user_input : null,
        baseline_answer: String(run.final_answer),
        baseline_score: run.final_score == null ? null : Number(run.final_score),
        baseline_model_version: String(run.model_version ?? "") || null,
        source_created_at: run.created_at ?? null,
      }))
      const { error: insertCasesError } = await supabase.from("foodcourt_prompt_evaluation_cases").insert(caseRows)
      if (insertCasesError) {
        await supabase.from("foodcourt_prompt_evaluation_sets").delete().eq("id", createdSet.id)
        return json({ error: insertCasesError.message }, 500)
      }
      const { data: activeSet, error: updateSetError } = await supabase
        .from("foodcourt_prompt_evaluation_sets")
        .update({ case_count: caseRows.length, updated_at: new Date().toISOString() })
        .eq("id", createdSet.id)
        .select("id,store_partition_key,name,status,source,baseline_model_version,case_count,created_at,updated_at")
        .single()
      if (updateSetError) return json({ error: updateSetError.message }, 500)
      return json({ ok: true, created: true, active_set: activeSet, readiness }, 201)
    }
    if (req.method === "POST" && path === "/foodcourt/prompt-candidates") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) return json({ error: "Invalid JSON body." }, 400)
      const requestedStore = String(body.store_key ?? body.store ?? storeScope ?? "").trim()
      if (!requestedStore) return json({ error: "store_key is required." }, 400)
      if (storeScope && requestedStore.toLowerCase() !== storeScope.toLowerCase()) {
        return json({ error: "Forbidden for this store." }, 403)
      }
      const name = String(body.name ?? "").trim().slice(0, 80)
      const surface = String(body.surface ?? "all").trim()
      const instructions = String(body.instructions ?? "").trim().slice(0, 8000)
      if (!name || !instructions) return json({ error: "候補名と候補プロンプトを入力してください。" }, 400)
      if (!new Set(["all", "ask", "daily_summary", "period_summary", "weekly_report"]).has(surface)) {
        return json({ error: "Invalid surface." }, 400)
      }
      const { data: activeSet, error: activeSetError } = await supabase
        .from("foodcourt_prompt_evaluation_sets")
        .select("id")
        .ilike("store_partition_key", requestedStore)
        .eq("status", "active")
        .maybeSingle()
      if (activeSetError) return json({ error: activeSetError.message }, 500)
      if (!activeSet) return json({ error: "先に固定評価セットを作成してください。" }, 409)
      const { data: candidate, error: candidateError } = await supabase
        .from("foodcourt_prompt_candidates")
        .insert({ store_partition_key: requestedStore, name, surface, instructions, status: "draft" })
        .select("id,name,surface,status,created_at,updated_at")
        .single()
      if (candidateError) return json({ error: candidateError.message }, 500)
      return json({ ok: true, candidate }, 201)
    }
    if (req.method === "GET" && path === "/foodcourt/ai-distillation-dataset") {
      const requestedStore = String(url.searchParams.get("store_key") ?? url.searchParams.get("store") ?? storeScope ?? "").trim()
      const surface = String(url.searchParams.get("surface") ?? "").trim()
      const allowedSurfaces = new Set(["ask", "daily_summary", "period_summary", "weekly_report"])
      if (surface && !allowedSurfaces.has(surface)) return json({ error: "Invalid surface." }, 400)
      const rawLimit = Number(url.searchParams.get("limit") ?? "100")
      const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.trunc(rawLimit))) : 100
      let acceptedQuery = supabase
        .from("foodcourt_ai_rag_documents")
        .select("source_run_id,surface,source_type,final_score,updated_at")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(limit)
      if (requestedStore) acceptedQuery = acceptedQuery.ilike("store_partition_key", requestedStore)
      if (surface) acceptedQuery = acceptedQuery.eq("surface", surface)
      const { data: acceptedRows, error: acceptedError } = await acceptedQuery
      if (acceptedError) return json({ error: acceptedError.message }, 500)
      if (!acceptedRows?.length) {
        return json({
          dataset_version: "foodcourt-distillation-v1",
          generated_at: new Date().toISOString(),
          count: 0,
          records: [],
        }, 200)
      }

      const runIds = acceptedRows.map((row) => String((row as Record<string, unknown>).source_run_id ?? "")).filter(Boolean)
      const [{ data: runs, error: runsError }, { data: iterations, error: iterationsError }, { data: feedbackRows, error: feedbackError }] = await Promise.all([
        supabase.from("foodcourt_ai_loop_runs")
          .select("id,store_partition_key,surface,source_ref,user_input,model_version,final_loop_index,best_loop_index,final_score,final_answer,returned_reason,created_at")
          .in("id", runIds),
        supabase.from("foodcourt_ai_loop_iterations")
          .select("run_id,loop_index,feedback_from_previous,integrated_answer,evaluation,total_score,passed,created_at")
          .in("run_id", runIds)
          .order("loop_index", { ascending: true }),
        supabase.from("foodcourt_ai_feedback")
          .select("run_id,rating,note,updated_at")
          .in("run_id", runIds),
      ])
      const datasetError = runsError ?? iterationsError ?? feedbackError
      if (datasetError) return json({ error: datasetError.message }, 500)

      const records = buildFoodCourtDistillationRecords(
        acceptedRows as Record<string, unknown>[],
        (runs ?? []) as Record<string, unknown>[],
        (iterations ?? []) as Record<string, unknown>[],
        (feedbackRows ?? []) as Record<string, unknown>[],
      )
      return json({
        dataset_version: "foodcourt-distillation-v1",
        generated_at: new Date().toISOString(),
        count: records.length,
        acceptance_rule: "quality_passed_or_human_helpful_excluding_not_helpful",
        records,
      }, 200)
    }
    if (req.method === "POST" && path === "/foodcourt/ai-loop-feedback") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) return json({ error: "Invalid JSON body." }, 400)
      const runId = String(body.run_id ?? "").trim()
      const rating = String(body.rating ?? "").trim()
      const note = String(body.note ?? "").trim().slice(0, 1000) || null
      if (!runId || !["helpful", "not_helpful"].includes(rating)) {
        return json({ error: "run_id and rating(helpful|not_helpful) are required." }, 400)
      }
      const { data: run, error: runErr } = await supabase
        .from("foodcourt_ai_loop_runs")
        .select("id,store_partition_key,surface")
        .eq("id", runId)
        .maybeSingle()
      if (runErr) return json({ error: runErr.message }, 500)
      if (!run) return json({ error: "AI loop run not found." }, 404)
      const runStore = String((run as Record<string, unknown>).store_partition_key ?? "")
      if (storeScope && runStore.toLowerCase() !== storeScope.toLowerCase()) {
        return json({ error: "Forbidden for this store." }, 403)
      }
      const { data, error } = await supabase.from("foodcourt_ai_feedback").upsert({
        run_id: runId,
        store_partition_key: runStore,
        surface: String((run as Record<string, unknown>).surface ?? ""),
        rating,
        note,
        updated_at: new Date().toISOString(),
      }, { onConflict: "run_id" }).select("run_id,rating,note,updated_at").single()
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true, feedback: data }, 200)
    }
    // 東京ドーム週次イベント配信（per-room）の設定を取得/保存（管理画面のカレンダー/予約タブから利用）。
    if (req.method === "GET" && path === "/foodcourt/dome-weekly") {
      const roomId = String(url.searchParams.get("room_id") ?? "").trim()
      if (!roomId) return json({ error: "room_id is required." }, 400)
      const { data, error } = await supabase
        .from("room_summary_settings")
        .select("room_id, room_name, dome_weekly_enabled, dome_weekly_dow, dome_weekly_hour, dome_weekly_minute")
        .eq("room_id", roomId)
        .maybeSingle()
      if (error) return json({ error: error.message }, 500)
      return json({ config: data ?? null }, 200)
    }
    if (req.method === "PUT" && path === "/foodcourt/dome-weekly") {
      const body = await workReq.json().catch(() => ({})) as Record<string, unknown>
      const roomId = String(body.room_id ?? "").trim()
      if (!roomId) return json({ error: "room_id is required." }, 400)
      const dowN = Number(body.dome_weekly_dow)
      const hourN = Number(body.dome_weekly_hour)
      const minN = Number(body.dome_weekly_minute)
      const upd: Record<string, unknown> = {
        dome_weekly_enabled: body.dome_weekly_enabled === true,
        dome_weekly_dow: (Number.isInteger(dowN) && dowN >= 0 && dowN <= 6) ? dowN : null,
        dome_weekly_hour: (Number.isInteger(hourN) && hourN >= 0 && hourN <= 23) ? hourN : null,
        dome_weekly_minute: (Number.isInteger(minN) && minN >= 0 && minN <= 59) ? minN : null,
        updated_at: new Date().toISOString(),
      }
      const { data, error } = await supabase
        .from("room_summary_settings")
        .update(upd)
        .eq("room_id", roomId)
        .select("room_id, dome_weekly_enabled, dome_weekly_dow, dome_weekly_hour, dome_weekly_minute")
        .maybeSingle()
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true, config: data ?? null }, 200)
    }
    // 東京ドームイベントの予想動員数を手入力で更新する（自動取得元に動員数が無いため）。
    // 来客予測モデル(foodcourt-forecast-cron)が「最強ドライバー」として使う唯一の入力経路。
    if (req.method === "PUT" && path === "/foodcourt/events/attendance") {
      const body = await workReq.json().catch(() => ({})) as Record<string, unknown>
      const eventDate = String(body.event_date ?? "").slice(0, 10)
      const venue = String(body.venue ?? "").trim()
      const title = String(body.title ?? "").trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !venue || !title) {
        return json({ error: "event_date, venue, title are required." }, 400)
      }
      let attendance: number | null = null
      if (body.expected_attendance !== null && body.expected_attendance !== undefined && body.expected_attendance !== "") {
        const v = Number(body.expected_attendance)
        if (!Number.isFinite(v) || v < 0) return json({ error: "expected_attendance must be a non-negative number." }, 400)
        attendance = Math.round(v)
      }
      const { data, error } = await supabase
        .from("tokyo_dome_events")
        .update({ expected_attendance: attendance, updated_at: new Date().toISOString() })
        .eq("event_date", eventDate)
        .eq("venue", venue)
        .eq("title", title)
        .select("event_date, venue, title, category, expected_attendance")
        .maybeSingle()
      if (error) return json({ error: error.message }, 500)
      if (!data) return json({ error: "event not found." }, 404)
      return json({ ok: true, event: data }, 200)
    }
    // フードコート日報 CRUD ────────────────────────────────────────────────
    if (req.method === "GET" && path === "/foodcourt/daily-logs") {
      const storeKey = String(url.searchParams.get("store_key") ?? url.searchParams.get("store") ?? "").trim()
      if (!storeKey) return json({ error: "store_key is required." }, 400)
      const from = String(url.searchParams.get("from") ?? "").slice(0, 10)
      const to = String(url.searchParams.get("to") ?? "").slice(0, 10)
      const limit = Math.min(parseInt(String(url.searchParams.get("limit") ?? "90")), 366)
      let q = supabase
        .from("foodcourt_daily_logs")
        .select("id, log_date, handler, actions, guest_impact, sales_impact, weather_note, event_note, issues, next_actions, memo, daily_attendance, created_at, updated_at")
        .ilike("store_partition_key", storeKey)
        .order("log_date", { ascending: false })
        .limit(limit)
      if (/^\d{4}-\d{2}-\d{2}$/.test(from)) q = q.gte("log_date", from)
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) q = q.lte("log_date", to)
      const { data, error } = await q
      if (error) return json({ error: error.message }, 500)
      return json({ logs: data ?? [] }, 200)
    }

    if (req.method === "PUT" && path === "/foodcourt/daily-logs") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) return json({ error: "Invalid JSON body." }, 400)
      const storeKey = String(body.store_key ?? body.store ?? url.searchParams.get("store_key") ?? "").trim()
      if (!storeKey) return json({ error: "store_key is required." }, 400)
      const logDate = String(body.log_date ?? "").slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) return json({ error: "log_date (YYYY-MM-DD) is required." }, 400)
      const actionInput = Array.isArray(body.actions) ? body.actions : []
      if (actionInput.length > 50) return json({ error: "actions must contain at most 50 items." }, 400)
      const allowedActionCategories = new Set(["promotion", "menu", "service", "environment", "staff", "other"])
      const actions: Array<{ cat: string; text: string }> = []
      for (const item of actionInput) {
        if (!isRecord(item)) return json({ error: "Each action must be an object." }, 400)
        const text = String(item.text ?? "").trim().slice(0, 2000)
        if (!text) continue
        const requestedCategory = String(item.cat ?? "other").trim()
        actions.push({
          cat: allowedActionCategories.has(requestedCategory) ? requestedCategory : "other",
          text,
        })
      }
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from("foodcourt_daily_logs")
        .upsert({
          store_partition_key: storeKey,
          log_date: logDate,
          handler: String(body.handler ?? "").slice(0, 100) || null,
          actions,
          guest_impact: String(body.guest_impact ?? "").slice(0, 2000) || null,
          sales_impact: String(body.sales_impact ?? "").slice(0, 2000) || null,
          weather_note: String(body.weather_note ?? "").slice(0, 500) || null,
          event_note: String(body.event_note ?? "").slice(0, 500) || null,
          issues: String(body.issues ?? "").slice(0, 2000) || null,
          next_actions: String(body.next_actions ?? "").slice(0, 2000) || null,
          memo: String(body.memo ?? "").slice(0, 3000) || null,
          daily_attendance: (body.daily_attendance !== null && body.daily_attendance !== undefined && body.daily_attendance !== "")
            ? (() => { const v = Number(body.daily_attendance); return Number.isFinite(v) && v >= 0 ? Math.round(v) : null })()
            : null,
          updated_at: now,
        }, { onConflict: "store_partition_key,log_date" })
        .select("id, log_date, handler, actions, guest_impact, sales_impact, weather_note, event_note, issues, next_actions, memo, daily_attendance, created_at, updated_at")
        .single()
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true, log: data }, 200)
    }

    if (req.method === "DELETE" && path === "/foodcourt/daily-logs") {
      const storeKey = String(url.searchParams.get("store_key") ?? url.searchParams.get("store") ?? "").trim()
      const logDate = String(url.searchParams.get("log_date") ?? "").slice(0, 10)
      if (!storeKey) return json({ error: "store_key is required." }, 400)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) return json({ error: "log_date is required." }, 400)
      const { error } = await supabase
        .from("foodcourt_daily_logs")
        .delete()
        .ilike("store_partition_key", storeKey)
        .eq("log_date", logDate)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true }, 200)
    }

    // 「レポート一覧」タブ用：週次レポートの一覧（本文は含まない軽量版。クリック時に
    // /foodcourt/weekly-report?week_start=... で本文を取得する）。
    if (req.method === "GET" && path === "/foodcourt/weekly-report/list") {
      const storeKey = String(url.searchParams.get("store_key") ?? url.searchParams.get("store") ?? "").trim()
      if (!storeKey) return json({ error: "store_key is required." }, 400)
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 52) || 52, 1), 260)
      const { data, error } = await supabase
        .from("foodcourt_weekly_reports")
        .select("week_start, week_end, loop_score, created_at")
        .ilike("store_partition_key", storeKey)
        .order("week_start", { ascending: false })
        .limit(limit)
      if (error) return json({ error: error.message }, 500)
      return json({ items: data ?? [] }, 200)
    }

    if (req.method === "GET" && path === "/foodcourt/weekly-report") {
      const storeKey = String(url.searchParams.get("store_key") ?? url.searchParams.get("store") ?? "").trim()
      const weekStart = String(url.searchParams.get("week_start") ?? "").slice(0, 10)
      if (!storeKey || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return json({ error: "store_key and week_start are required." }, 400)
      const { data, error } = await supabase.from("foodcourt_weekly_reports")
        .select("store_partition_key,week_start,week_end,ai_report,report_html,raw_data,loop_score,loop_count,created_at")
        .ilike("store_partition_key", storeKey).eq("week_start", weekStart).order("created_at", { ascending: false }).limit(1).maybeSingle()
      if (error) return json({ error: error.message }, 500)
      if (!data) return json({ error: "週次レポートが見つかりません。" }, 404)
      const row = data as Record<string, unknown>
      const report = String(row.ai_report ?? "")
      return json({ ...row, report_html: String(row.report_html ?? "") || weeklyReportHtml(report) }, 200)
    }

    // 月次振り返り（AI生成・キャッシュ済み）を単独で確認するための参照用エンドポイント。
    // 通常は日次分析生成が内部で自動的に取得・生成するため、これは検証・将来のUI表示用。
    if (req.method === "GET" && path === "/foodcourt/monthly-retrospective") {
      const storeKey = String(url.searchParams.get("store_key") ?? url.searchParams.get("store") ?? "").trim()
      const yearMonth = String(url.searchParams.get("year_month") ?? "").trim()
      if (!storeKey || !/^\d{4}-\d{2}$/.test(yearMonth)) return json({ error: "store_key and year_month(YYYY-MM) are required." }, 400)
      const { data, error } = await supabase.from("foodcourt_monthly_retrospective")
        .select("store_partition_key,year_month,month_start,month_end,summary_text,model_version,created_at")
        .ilike("store_partition_key", storeKey).eq("year_month", yearMonth).maybeSingle()
      if (error) return json({ error: error.message }, 500)
      if (!data) return json({ error: "月次振り返りが見つかりません（まだ生成されていません）。" }, 404)
      return json(data, 200)
    }

    // フードコート週次経営レポート生成（cron または管理画面から）。
    // cron: POST body { room_id, store_key, cron: true } + Authorization: Bearer <CRON_AUTH_TOKEN>
    // 手動: 同上 + x-admin-token。week_start/week_end 省略時は先週(月〜日 JST)。
    if (req.method === "POST" && path === "/foodcourt/weekly-report") {
      let body: Record<string, unknown> = {}
      try {
        const raw = await parseJson(workReq)
        if (isRecord(raw)) body = raw
      } catch {
        body = {}
      }
      const storeKey = String(body.store_key ?? body.store ?? url.searchParams.get("store_key") ?? "").trim()
      if (!storeKey) return json({ error: "store_key is required." }, 400)
      const weeklyStoreKey = storeKey.toLowerCase()
      const roomId = String(body.room_id ?? "").trim()
      const pushToLine = body.cron === true || body.push === true
      let weekStart = String(body.week_start ?? "").slice(0, 10)
      let weekEnd = String(body.week_end ?? "").slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !/^\d{4}-\d{2}-\d{2}$/.test(weekEnd)) {
        const w = lastWeekMonSunJst()
        weekStart = w.weekStart
        weekEnd = w.weekEnd
      }
      if (weekStart > weekEnd) {
        const t = weekStart
        weekStart = weekEnd
        weekEnd = t
      }

      // キャッシュヒット（同週・同店舗）
      const { data: cachedRow } = await supabase
        .from("foodcourt_weekly_reports")
        .select("id, ai_report, report_html, raw_data, loop_score, loop_count, created_at")
        .eq("store_partition_key", weeklyStoreKey)
        .eq("week_start", weekStart)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      const force = body.force === true
      if (!force && cachedRow && (cachedRow as { ai_report?: unknown }).ai_report) {
        const report = String((cachedRow as { ai_report: string }).ai_report)
        let linePush: { ok: boolean; error?: string } | null = null
        if (pushToLine && roomId) {
          if (await reserveFoodCourtWeeklyReportSend(supabase, roomId, weekStart)) {
            const token = resolveChannelAccessToken(storeKey)
            if (token) {
              const link = await buildFoodCourtWeeklyReportLink(supabase, storeKey, weekStart)
              linePush = await pushLineMessagesToTarget(roomId, [buildWeeklyReportFlexMessage(weekStart, weekEnd, link)], token)
            } else {
              linePush = { ok: false, error: "LINE channel access token not configured for store." }
            }
            if (!linePush.ok) {
              // 送信失敗時は予約行を取り消し、次回起動（cron再試行）で再送できるようにする
              await supabase.from("foodcourt_weekly_report_sends").delete().eq("room_id", roomId).eq("week_start", weekStart)
            }
          } else {
            linePush = { ok: false, error: "already_sent_this_week" }
          }
        }
        return json({
          ok: true,
          cached: true,
          store_key: storeKey,
          week_start: weekStart,
          week_end: weekEnd,
          report,
          report_html: String((cachedRow as { report_html?: unknown }).report_html ?? "") || weeklyReportHtml(report),
          raw_data: (cachedRow as { raw_data?: unknown }).raw_data ?? null,
          loop_score: (cachedRow as { loop_score?: unknown }).loop_score ?? null,
          loop_count: (cachedRow as { loop_count?: unknown }).loop_count ?? null,
          line_push: linePush,
        }, 200)
      }

      const groqApiKey = Deno.env.get("GROQ_API_KEY") ?? ""
      if (!groqApiKey) return json({ error: "GROQ_API_KEY is missing." }, 500)
      const { data, error } = await supabase
        .from("foodcourt_tenant_reports")
        .select("id, report_date, tenants, created_at, base_tenant_name")
        .ilike("store_partition_key", storeKey)
        .order("created_at", { ascending: false })
        .limit(90)
      if (error) return json({ error: error.message }, 500)
      const reports = Array.isArray(data) ? data as Array<Record<string, unknown>> : []
      if (!reports.length) {
        return json({ error: "まだフードコートレポートがありません。", store_key: storeKey, week_start: weekStart, week_end: weekEnd }, 200)
      }
      const baseName = String((reports[0] as { base_tenant_name?: unknown }).base_tenant_name ?? "MARUGO S")
      const events = await loadVenueEventsForReports(supabase, storeKey, reports)
      const weather = await loadWeatherForReports(supabase, storeKey, reports)
      const forecast = await loadForecastForStore(supabase, storeKey)
      const { logs: dailyLogs, error: dailyLogsError, count: dailyLogsCount } = await loadFoodCourtDailyLogs(
        supabase,
        storeKey,
        { from: weekStart, to: weekEnd, limit: 14 },
      )
      if (dailyLogsError) console.error("foodcourt/weekly-report daily_logs load failed:", dailyLogsError)

      let result: Awaited<ReturnType<typeof generateFoodCourtWeeklyReport>>
      try {
        result = await generateFoodCourtWeeklyReport(
          reports, baseName, weekStart, weekEnd, groqApiKey, events, weather, forecast, supabase, storeKey, dailyLogs,
        )
      } catch (e) {
        console.error("foodcourt/weekly-report generate error:", e)
        return json({
          error: "週次レポートの生成に失敗しました。",
          detail: e instanceof Error ? e.message : String(e),
          daily_logs_count: dailyLogsCount,
          daily_logs_error: dailyLogsError,
        }, 500)
      }
      if (!result.report) {
        return json({
          error: "週次レポートを生成できませんでした（期間内データ不足の可能性）。",
          store_key: storeKey,
          week_start: weekStart,
          week_end: weekEnd,
          daily_logs_count: dailyLogsCount,
          daily_logs_error: dailyLogsError,
          raw_data: result.rawData,
        }, 200)
      }

      const reportHtml = weeklyReportHtml(result.report)
      const { error: upErr } = await supabase.from("foodcourt_weekly_reports").upsert({
        store_partition_key: weeklyStoreKey,
        week_start: weekStart,
        week_end: weekEnd,
        ai_report: result.report,
        report_html: reportHtml,
        raw_data: result.rawData,
        loop_score: result.loopScore,
        loop_count: result.loopCount,
      }, { onConflict: "store_partition_key,week_start" })
      if (upErr) console.error("foodcourt_weekly_reports insert failed:", upErr.message)

      let linePush: { ok: boolean; error?: string } | null = null
      if (pushToLine && roomId) {
        if (await reserveFoodCourtWeeklyReportSend(supabase, roomId, weekStart)) {
          const token = resolveChannelAccessToken(storeKey)
          if (token) {
            const link = await buildFoodCourtWeeklyReportLink(supabase, storeKey, weekStart)
            linePush = await pushLineMessagesToTarget(roomId, [buildWeeklyReportFlexMessage(weekStart, weekEnd, link)], token)
            if (!linePush.ok) console.error("weekly-report LINE push failed:", linePush.error)
          } else {
            linePush = { ok: false, error: "LINE channel access token not configured for store." }
          }
          if (!linePush.ok) {
            // 送信失敗時は予約行を取り消し、次回起動（cron再試行）で再送できるようにする
            await supabase.from("foodcourt_weekly_report_sends").delete().eq("room_id", roomId).eq("week_start", weekStart)
          }
        } else {
          linePush = { ok: false, error: "already_sent_this_week" }
        }
      }

      return json({
        ok: true,
        cached: false,
        store_key: storeKey,
        week_start: weekStart,
        week_end: weekEnd,
        report: result.report,
        report_html: reportHtml,
        raw_data: result.rawData,
        loop_score: result.loopScore,
        loop_count: result.loopCount,
        daily_logs_count: dailyLogsCount,
        daily_logs_error: dailyLogsError,
        line_push: linePush,
      }, 200)
    }

    if (req.method === "POST" && path === "/petty-cash/receipt-image") {
      const result = await createPettyCashEntryFromReceiptImage(supabase, workReq, storeScope)
      return json(result, 200)
    }
    if (req.method === "POST" && path === "/petty-cash") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const result = await createPettyCashEntry(supabase, body)
      return json(result, 200)
    }
    if (req.method === "PATCH" && path === "/petty-cash") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const result = await updatePettyCashEntry(supabase, body, storeScope)
      return json(result, 200)
    }
    if (req.method === "DELETE" && path === "/petty-cash") {
      const result = await deletePettyCashEntry(supabase, url, storeScope)
      return json(result, 200)
    }

    if (req.method === "GET" && path === "/messages/search") {
      const messageSearchState = await fetchLineRoomMessageSearchState(supabase, url)
      return json(messageSearchState, 200)
    }

    if (req.method === "GET" && path === "/calendar-events/search") {
      const calendarSearchState = await fetchLineRoomCalendarSearchState(supabase, url)
      return json(calendarSearchState, 200)
    }
    if (req.method === "GET" && path === "/receipts/store-options") {
      const options = await fetchStorePartitionReceiptOptions(supabase)
      return json({ store_options: options }, 200)
    }

    if (req.method === "GET" && path === "/receipts/webhook-status") {
      const includeDetectedRooms = url.searchParams.get("include_detected_rooms") !== "0"
      const autoLinkDetected = url.searchParams.get("auto_link") !== "0"
      const { webhook_status, auto_link } = await fetchReceiptWebhookStatus(supabase, {
        includeDetectedRooms,
        autoLinkDetected,
      })
      return json({
        webhook_status,
        auto_link,
        room_auto_link_enabled: isReceiptRoomAutoLinkEnabled(),
        generated_at: new Date().toISOString(),
      }, 200)
    }

    if (req.method === "PUT" && path === "/receipts/store-receipt-phones") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const result = await updateStoreReceiptPhones(supabase, body)
      return json(result, 200)
    }

    if (req.method === "GET" && path === "/receipts/analysis-prompt") {
      const storeKey = toSafeString(url.searchParams.get("store_key")).trim()
      if (!storeKey || !/^[A-Za-z0-9_]{1,120}$/.test(storeKey)) {
        throw { status: 400, message: "store_key is required." } satisfies AppError
      }
      const { data, error } = await supabase
        .from("store_receipt_analysis_prompts")
        .select("prompt, enabled, updated_at")
        .eq("store_partition_key", storeKey)
        .maybeSingle()
      if (error) {
        throw { status: 500, message: `Failed to load analysis prompt: ${error.message}` } satisfies AppError
      }
      const row = data as { prompt?: string; enabled?: boolean; updated_at?: string } | null
      return json({
        store_key: storeKey,
        default_prompt: RECEIPT_VISION_SYSTEM_PROMPT_BASE,
        custom_prompt: row ? String(row.prompt ?? "") : "",
        enabled: row ? row.enabled !== false : true,
        max_chars: STORE_RECEIPT_PROMPT_MAX_CHARS,
        updated_at: row ? row.updated_at ?? null : null,
      }, 200)
    }

    if (req.method === "PUT" && path === "/receipts/analysis-prompt") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const storeKey = toSafeString(body.store_key).trim()
      if (!storeKey || !/^[A-Za-z0-9_]{1,120}$/.test(storeKey)) {
        throw { status: 400, message: "store_key is required." } satisfies AppError
      }
      const promptRaw = typeof body.prompt === "string" ? body.prompt : ""
      if (promptRaw.length > STORE_RECEIPT_PROMPT_MAX_CHARS) {
        throw { status: 400, message: `prompt must be <= ${STORE_RECEIPT_PROMPT_MAX_CHARS} chars.` } satisfies AppError
      }
      const enabled = body.enabled === undefined ? true : body.enabled === true
      const { error } = await supabase
        .from("store_receipt_analysis_prompts")
        .upsert({
          store_partition_key: storeKey,
          prompt: promptRaw,
          enabled,
          updated_at: new Date().toISOString(),
        }, { onConflict: "store_partition_key" })
      if (error) {
        throw { status: 500, message: `Failed to save analysis prompt: ${error.message}` } satisfies AppError
      }
      return json({ ok: true, store_key: storeKey, enabled }, 200)
    }

    if (req.method === "GET" && path === "/receipts/sales") {
      const receiptSalesState = await fetchStoreReceiptSalesState(supabase, url)
      return json(receiptSalesState, 200)
    }

    if (req.method === "GET" && path === "/receipts/competitors") {
      const storeKey = String(url.searchParams.get("store_key") ?? "").trim()
      const result = await fetchCompetitorReviewContext(supabase, storeKey)
      return json(result, 200)
    }

    if (req.method === "GET" && path === "/receipts/store-reviews") {
      const storeKey = String(url.searchParams.get("store_key") ?? "").trim()
      const result = await fetchStoreReviewContext(supabase, storeKey)
      return json(result, 200)
    }

    if (req.method === "PUT" && path === "/receipts/store-reviews") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const result = await upsertStoreReviewPlace(supabase, body)
      return json(result, 200)
    }

    if (req.method === "DELETE" && path === "/receipts/store-reviews") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const result = await deactivateStoreReviewPlace(supabase, body)
      return json(result, 200)
    }

    if (req.method === "POST" && path === "/receipts/store-reviews/refresh") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const result = await refreshStoreReview(supabase, body)
      return json(result, 200)
    }

    if (req.method === "POST" && path === "/receipts/store-reviews/profile/ensure") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const result = await ensureStoreReviewProfile(supabase, body)
      return json(result, 200)
    }

    if (req.method === "POST" && path === "/receipts/store-reviews/search") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const result = await searchStoreReviewPlaces(body)
      return json(result, 200)
    }

    if (req.method === "PUT" && path === "/receipts/competitors") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const result = await upsertCompetitorPlace(supabase, body)
      return json(result, 200)
    }

    if (req.method === "DELETE" && path === "/receipts/competitors") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const result = await deactivateCompetitorPlace(supabase, body)
      return json(result, 200)
    }

    if (req.method === "POST" && path === "/receipts/competitors/refresh") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const result = await refreshCompetitorReviews(supabase, body)
      return json(result, 200)
    }

    if (req.method === "POST" && path === "/receipts/competitors/nearby-search") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const result = await nearbySearchGooglePlaces(supabase, body)
      return json(result, 200)
    }

    if (req.method === "PUT" && path === "/receipts/sales-budget") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const result = await upsertStoreReceiptSalesBudget(supabase, body)
      return json(result, 200)
    }

    if (req.method === "GET" && path === "/receipts/sales-manual-months") {
      const result = await fetchStoreManualMonthsForYearState(supabase, url)
      return json(result, 200)
    }

    if (req.method === "PUT" && path === "/receipts/sales-manual-months") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const result = await upsertStoreManualMonthEntries(supabase, body)
      return json(result, 200)
    }

    if (req.method === "PUT" && path === "/receipts/sales-manual-days") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const result = await upsertManualDayEntries(supabase, body)
      return json(result, 200)
    }
    // 日別予算の直接入力（手動上書き）の保存。budget_yen が null/空の日は上書き解除（自動按分へ戻る）。
    if (req.method === "PUT" && path === "/receipts/sales-daily-budget") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const result = await upsertDailyBudgetEntries(supabase, body)
      return json(result, 200)
    }
    // 月次日別売上管理表（Excel/CSV）を解析し、日次の entries を返す（解析のみ・DB書込なし）。
    // フロントがプレビュー→店舗解決→下の import-commit で確定投入する。
    if (req.method === "POST" && path === "/receipts/sales-manual-days/import") {
      const result = await parseManualDaySalesImport(req)
      return json(result, 200)
    }
    // 解析した日次売上を「画像解析レシートと同等」に登録: 各日1件の合成レシートを line_receipt__店舗 へ upsert。
    if (req.method === "POST" && path === "/receipts/daily-receipts-import") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const result = await importDailyReceiptsCommit(supabase, body)
      return json(result, 200)
    }
    // 「月別売上の手入力」画面から、対象月の登録済みデータ（日別レシート・日別手入力・月合計手入力）をまとめて削除。
    if (req.method === "DELETE" && path === "/receipts/daily-receipts") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const key = toSafeString(body.store_key).trim().toLowerCase()
      if (!key || key === "__all__") {
        throw { status: 400, message: "store_key（店舗）を指定してください。" } satisfies AppError
      }
      const salesMonth = toSafeString(body.sales_month).trim().slice(0, 7)
      const result = await clearDailyReceiptsForMonth(supabase, key, salesMonth)
      return json(result, 200)
    }

    if (req.method === "GET" && path === "/analytics/monthly") {
      const result = await fetchStoreAnalyticsMonthly(supabase, url)
      return json(result, 200)
    }

    if (req.method === "GET" && path === "/analytics/holidays") {
      // 内閣府CSV（正本）から国民の祝日を取得。失敗時はハードコード表へフォールバック。
      const { map, source } = await fetchJapaneseHolidayMap()
      const dates: Record<string, string> = {}
      for (const [iso, name] of map) dates[iso] = name
      return json({ ok: true, source, count: map.size, dates }, 200)
    }

    if (req.method === "GET" && path === "/weather/daily") {
      const result = await fetchWeatherDailyState(supabase, url)
      return json(result, 200)
    }
    if (req.method === "GET" && path === "/usage/push-monthly") {
      const result = await fetchMonthlyPushUsageSummary(supabase)
      return json(result, 200)
    }

    if (req.method === "POST" && path === "/documents") {
      const created = await uploadDocumentFile(req, supabase)
      return json({ success: true, document: created }, 200)
    }
    if (req.method === "POST" && path === "/pos-journals/upload") {
      return json(await uploadPosJournalFiles(workReq, supabase, storeScope), 200)
    }
    if (req.method === "DELETE" && path === "/pos-journals/file") {
      return json(await deletePosJournalFile(supabase, workReq, storeScope), 200)
    }

    const permissionPath = parseDocumentPermissionPath(path)
    if (permissionPath != null) {
      if (req.method === "GET") {
        const permissionState = await fetchDocumentPermissionStateById(supabase, permissionPath)
        return json({ success: true, permissions: permissionState }, 200)
      }
      if (req.method === "PUT") {
        const body = await parseJson(workReq)
        if (!isRecord(body)) {
          throw { status: 400, message: "Invalid JSON body." } satisfies AppError
        }
        const permissionState = await updateDocumentPermissionStateById(supabase, permissionPath, body)
        return json({ success: true, permissions: permissionState }, 200)
      }
    }

    if (req.method === "PUT" && path === "/settings/media-upload-limit") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const maxMb = normalizeMediaUploadMaxMb(body.media_upload_max_mb)
      await fetchGlobalSettings(supabase)
      const updatedAt = new Date().toISOString()
      const { data, error } = await supabase
        .from("summary_settings")
        .update({
          media_upload_max_mb: maxMb,
          updated_at: updatedAt,
        })
        .eq("id", 1)
        .select("id, media_upload_max_mb, updated_at")
        .single()
      if (error) {
        throw { status: 500, message: `Failed to update media upload limit: ${error.message}` } satisfies AppError
      }
      return json({
        success: true,
        media_upload_max_mb: Number(data?.media_upload_max_mb ?? maxMb),
        updated_at: data?.updated_at ?? updatedAt,
      }, 200)
    }

    if (req.method === "PUT" && path === "/settings/console") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const settings = isRecord(body.settings) ? body.settings : null
      if (!settings) {
        throw { status: 400, message: "settings object is required." } satisfies AppError
      }
      const keys = Object.keys(settings)
      if (keys.length > 1000) {
        throw { status: 400, message: "Too many settings (max 1000)." } satisfies AppError
      }
      const now = new Date().toISOString()
      const rows: { setting_key: string; setting_value: string; updated_at: string }[] = []
      for (const rawKey of keys) {
        const key = String(rawKey).trim()
        if (!key || key.length > 200) continue
        const raw = settings[rawKey]
        let value = raw == null ? "" : (typeof raw === "string" ? raw : String(raw))
        if (key === "foodcourt_evolution_passing_score") {
          const score = normalizeFoodCourtPassingScore(value)
          if (score == null) {
            throw {
              status: 400,
              message: `foodcourt_evolution_passing_score must be an integer from ${FOODCOURT_PASSING_SCORE_MIN} to ${FOODCOURT_PASSING_SCORE_MAX}.`,
            } satisfies AppError
          }
          value = String(score)
        }
        if (value.length > 20000) continue
        rows.push({ setting_key: key, setting_value: value, updated_at: now })
      }
      if (rows.length === 0) {
        return json({ ok: true, saved: 0 }, 200)
      }
      const { error } = await supabase
        .from("line_admin_console_settings")
        .upsert(rows, { onConflict: "setting_key" })
      if (error) {
        throw { status: 500, message: `Failed to save console settings: ${error.message}` } satisfies AppError
      }
      return json({ ok: true, saved: rows.length }, 200)
    }

    if (req.method === "DELETE" && path.startsWith("/media/")) {
      const mediaIdRaw = path.replace("/media/", "")
      const mediaId = Number(mediaIdRaw)
      if (!Number.isInteger(mediaId) || mediaId <= 0) {
        throw { status: 400, message: "media_id must be a positive integer." } satisfies AppError
      }
      const deleted = await deleteMediaItemById(supabase, mediaId)
      return json({ success: true, deleted }, 200)
    }

    if (req.method === "DELETE" && path.startsWith("/documents/")) {
      const documentIdRaw = path.replace("/documents/", "")
      const documentId = Number(documentIdRaw)
      if (!Number.isInteger(documentId) || documentId <= 0) {
        throw { status: 400, message: "document_id must be a positive integer." } satisfies AppError
      }
      const deleted = await deleteDocumentById(supabase, documentId)
      return json({ success: true, deleted }, 200)
    }

    if (req.method === "PUT" && path === "/auth/token") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }

      const newToken = String(body.new_token ?? "").trim()
      if (newToken.length < 8) {
        throw { status: 400, message: "new_token must be at least 8 characters." } satisfies AppError
      }

      await fetchGlobalSettings(supabase)
      const tokenHash = await hashToken(newToken)
      const updatedAt = new Date().toISOString()
      const { error } = await supabase
        .from("summary_settings")
        .update({
          admin_dashboard_token_hash: tokenHash,
          admin_dashboard_token_updated_at: updatedAt,
          updated_at: updatedAt,
        })
        .eq("id", 1)

      if (error) {
        throw { status: 500, message: `Failed to update admin token: ${error.message}` } satisfies AppError
      }

      await revokeAllAdminDashboardAuthTokens(supabase)

      return json({
        success: true,
        token_updated_at: updatedAt,
      }, 200)
    }

    if (req.method === "PUT" && path === "/settings/global") {
      const body = await parseJson(workReq)
      const payload = buildGlobalSettingsPayload(body)
      const { data, error } = await supabase
        .from("summary_settings")
        .upsert({
          id: 1,
          delivery_hours: payload.delivery_hours,
          is_enabled: payload.is_enabled,
          message_cleanup_timing: payload.message_cleanup_timing,
          last_delivery_summary_mode: payload.last_delivery_summary_mode,
          message_retention_days: payload.message_retention_days,
          calendar_tomorrow_reminder_enabled: payload.calendar_tomorrow_reminder_enabled,
          calendar_tomorrow_reminder_hours: payload.calendar_tomorrow_reminder_hours,
          calendar_tomorrow_reminder_only_if_events: payload.calendar_tomorrow_reminder_only_if_events,
          calendar_tomorrow_reminder_max_items: payload.calendar_tomorrow_reminder_max_items,
          ...(payload.media_upload_max_mb != null ? { media_upload_max_mb: payload.media_upload_max_mb } : {}),
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" })
        .select("id, delivery_hours, is_enabled, message_cleanup_timing, last_delivery_summary_mode, message_retention_days, calendar_tomorrow_reminder_enabled, calendar_tomorrow_reminder_hours, calendar_tomorrow_reminder_only_if_events, calendar_tomorrow_reminder_max_items, media_upload_max_mb, updated_at")
        .single()

      if (error) {
        throw { status: 500, message: `Failed to update global settings: ${error.message}` } satisfies AppError
      }
      return json({ global_settings: data }, 200)
    }

    if (req.method === "PUT" && path === "/settings/rooms") {
      const body = await parseJson(workReq)
      const payload = buildRoomSettingsPayload(body)
      // 管理者専用: ルーム・セルフ設定の有効化＋アクセスパスワード（平文受領→ハッシュ化保存・空でクリア）。
      // ここはフル管理者セッションのみ到達する（room スコープは /settings/rooms に来られない）。
      const roomConfigExtra: Record<string, unknown> = {}
      if (isRecord(body)) {
        if ("room_config_access_enabled" in body) {
          roomConfigExtra.room_config_access_enabled =
            body.room_config_access_enabled === true || body.room_config_access_enabled === "true"
        }
        if ("room_config_password" in body) {
          const pw = String(body.room_config_password ?? "")
          roomConfigExtra.room_config_password_hash = pw ? await hashRoomConfigPassword(pw) : null
        }
      }
      console.log(
        "[admin-api] room settings upsert request:",
        JSON.stringify({
          room_id: payload.room_id,
          is_enabled: payload.is_enabled,
          bot_reply_enabled: payload.bot_reply_enabled,
          bot_reply_hard_mute_enabled: payload.bot_reply_hard_mute_enabled,
          message_search_enabled: payload.message_search_enabled,
          message_search_library_enabled: payload.message_search_library_enabled,
          media_file_access_enabled: payload.media_file_access_enabled,
          image_analysis_reply_enabled: payload.image_analysis_reply_enabled,
        }),
      )
      const { data, error } = await supabase
        .from("room_summary_settings")
        .upsert({
          room_id: payload.room_id,
          room_name: payload.room_name,
          is_enabled: payload.is_enabled,
          bot_reply_enabled: payload.bot_reply_enabled,
          bot_reply_hard_mute_enabled: payload.bot_reply_hard_mute_enabled,
          send_room_summary: payload.send_room_summary,
          receive_overall_summary_enabled: payload.receive_overall_summary_enabled,
          calendar_tomorrow_reminder_enabled: payload.calendar_tomorrow_reminder_enabled,
          calendar_ai_auto_create_enabled: payload.calendar_ai_auto_create_enabled,
          calendar_silent_auto_register_enabled: payload.calendar_silent_auto_register_enabled,
          calendar_low_confidence_confirm_reply_enabled: payload.calendar_low_confidence_confirm_reply_enabled,
          calendar_registration_reply_enabled: payload.calendar_registration_reply_enabled,
          message_search_enabled: payload.message_search_enabled,
          message_search_library_enabled: payload.message_search_library_enabled,
          media_file_access_enabled: payload.media_file_access_enabled,
          image_analysis_reply_enabled: payload.image_analysis_reply_enabled,
          receipt_reply_executive_detail_enabled: payload.receipt_reply_executive_detail_enabled,
          receipt_correction_reply_enabled: payload.receipt_correction_reply_enabled,
          non_receipt_image_reply_enabled: payload.non_receipt_image_reply_enabled,
          media_save_enabled: payload.media_save_enabled,
          review_alert_enabled: payload.review_alert_enabled,
          budget_entry_enabled: payload.budget_entry_enabled,
          petty_receipt_analysis_enabled: payload.petty_receipt_analysis_enabled,
          receipt_sales_registration_enabled: payload.receipt_sales_registration_enabled,
          gmail_reservation_alert_enabled: payload.gmail_reservation_alert_enabled,
          today_reservation_alert_enabled: payload.today_reservation_alert_enabled,
          today_reservation_alert_hour: payload.today_reservation_alert_hour,
          today_reservation_alert_minute: payload.today_reservation_alert_minute,
          gmail_alert_interval_minutes: payload.gmail_alert_interval_minutes,
          gmail_alert_anchor_hour: payload.gmail_alert_anchor_hour,
          gmail_alert_anchor_minute: payload.gmail_alert_anchor_minute,
          receipt_midreport_enabled: payload.receipt_midreport_enabled,
          receipt_monthend_report_enabled: payload.receipt_monthend_report_enabled,
          receipt_schedule_override: payload.receipt_schedule_override,
          receipt_midreport_day: payload.receipt_midreport_day,
          receipt_midreport_hour: payload.receipt_midreport_hour,
          receipt_midreport_minute: payload.receipt_midreport_minute,
          receipt_monthend_day: payload.receipt_monthend_day,
          receipt_monthend_hour: payload.receipt_monthend_hour,
          receipt_monthend_minute: payload.receipt_monthend_minute,
          receipt_report_store_partition_key: payload.receipt_report_store_partition_key,
          // 管理画面で店舗へ連携・保存した招待ルームは Bot 利用も許可する。
          // （auto_link は bot_access_approved=false のまま作るため、連携済みなのに「承認待ち」と返る事故を防ぐ）
          ...(payload.receipt_report_store_partition_key
            ? { bot_access_approved: true }
            : {}),
          room_sort_order: payload.room_sort_order,
          delivery_hours: payload.delivery_hours,
          message_cleanup_timing: payload.message_cleanup_timing,
          last_delivery_summary_mode: payload.last_delivery_summary_mode,
          ...roomConfigExtra,
          updated_at: new Date().toISOString(),
        }, { onConflict: "room_id" })
        .select("*")
        .single()

      if (error) {
        throw { status: 500, message: `Failed to update room settings: ${error.message}` } satisfies AppError
      }
      const adminSurface = resolveAdminSurface(req, url)
      const { error: undismissError } = await supabase
        .from("line_room_dismissed")
        .delete()
        .eq("room_id", payload.room_id)
        .eq("admin_surface", adminSurface)
      if (undismissError) {
        throw { status: 500, message: `Failed to restore dismissed room: ${undismissError.message}` } satisfies AppError
      }
      console.log(
        "[admin-api] room settings upsert result:",
        JSON.stringify({
          room_id: data.room_id,
          is_enabled: data.is_enabled,
          bot_reply_enabled: data.bot_reply_enabled,
          bot_reply_hard_mute_enabled: data.bot_reply_hard_mute_enabled,
          message_search_enabled: data.message_search_enabled,
          message_search_library_enabled: data.message_search_library_enabled,
          media_file_access_enabled: data.media_file_access_enabled,
          image_analysis_reply_enabled: data.image_analysis_reply_enabled,
          updated_at: data.updated_at,
        }),
      )
      return json({ room_settings: stripRoomConfigSecret(data) }, 200)
    }

    if (req.method === "PUT" && path === "/permissions/users") {
      const body = await parseJson(workReq)
      const payload = buildLineUserPermissionPayload(body)
      const { data, error } = await supabase
        .from("line_user_permissions")
        .upsert({
          line_user_id: payload.line_user_id,
          display_name: payload.display_name,
          is_active: payload.is_active,
          can_message_search: payload.can_message_search,
          can_library_search: payload.can_library_search,
          can_calendar_create: payload.can_calendar_create,
          can_calendar_update: payload.can_calendar_update,
          can_calendar_view: payload.can_calendar_view,
          can_media_access: payload.can_media_access,
          excluded_message_search_room_ids: payload.excluded_message_search_room_ids,
          assigned_store: payload.assigned_store,
          assigned_job_title: payload.assigned_job_title,
          updated_at: new Date().toISOString(),
        }, { onConflict: "line_user_id" })
        .select("line_user_id, display_name, is_active, can_message_search, can_library_search, can_calendar_create, can_calendar_update, can_calendar_view, can_media_access, excluded_message_search_room_ids, assigned_store, assigned_job_title, registration_source_store, updated_at")
        .single()
      if (error) {
        throw { status: 500, message: `Failed to upsert line user permission: ${error.message}` } satisfies AppError
      }
      return json({ user_permission: data }, 200)
    }

    if (req.method === "POST" && path === "/permissions/users/backfill") {
      const result = await backfillLineUserPermissionsFromMessages(supabase)
      return json({ success: true, backfill: result }, 200)
    }

    if (req.method === "POST" && path === "/rooms/refresh-names") {
      const body = await parseJson(workReq).catch(() => ({}))
      const roomId = isRecord(body) ? String(body.room_id ?? "").trim() : ""
      const result = await refreshRoomNamesFromLine(supabase, roomId || null)
      return json({ success: true, refresh: result }, 200)
    }

    if (req.method === "POST" && path === "/rooms/sync-chat-members") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const roomId = String(body.room_id ?? "").trim()
      if (!roomId) {
        throw { status: 400, message: "room_id is required." } satisfies AppError
      }
      const sync = await syncLineUserPermissionsFromChatMembers(supabase, roomId)
      return json({ success: true, sync }, 200)
    }

    if (req.method === "DELETE" && path.startsWith("/settings/rooms/")) {
      const roomId = decodeURIComponent(path.replace("/settings/rooms/", ""))
      if (!roomId) {
        throw { status: 400, message: "room_id is required." } satisfies AppError
      }

      const { error } = await supabase
        .from("room_summary_settings")
        .delete()
        .eq("room_id", roomId)

      if (error) {
        throw { status: 500, message: `Failed to delete room settings: ${error.message}` } satisfies AppError
      }
      return json({ success: true, room_id: roomId }, 200)
    }

    if (req.method === "DELETE" && path.startsWith("/permissions/users/")) {
      const lineUserId = decodeURIComponent(path.replace("/permissions/users/", "")).trim()
      if (!lineUserId) {
        throw { status: 400, message: "line_user_id is required." } satisfies AppError
      }
      const { error } = await supabase
        .from("line_user_permissions")
        .delete()
        .eq("line_user_id", lineUserId)
      if (error) {
        throw { status: 500, message: `Failed to delete line user permission: ${error.message}` } satisfies AppError
      }
      return json({ success: true, line_user_id: lineUserId }, 200)
    }

    if (req.method === "DELETE" && path.startsWith("/rooms/")) {
      const roomId = decodeURIComponent(path.replace("/rooms/", ""))
      if (!roomId) {
        throw { status: 400, message: "room_id is required." } satisfies AppError
      }

      const adminSurface = resolveAdminSurface(req, url)
      const unregister = await unregisterRoomFromAdmin(supabase, roomId, adminSurface)
      if (!unregister.ok) {
        throw { status: 500, message: unregister.message } satisfies AppError
      }

      return json({
        success: true,
        room_id: roomId,
        unregistered: unregister.unregistered,
        retained: unregister.retained,
      }, 200)
    }

    if (req.method === "POST" && path === "/rooms/purge") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      const roomId = String(body.room_id ?? "").trim()
      const confirmRoomId = String(body.confirm_room_id ?? "").trim()
      const purged = await purgeLineAdminRoom(supabase, roomId, confirmRoomId)
      return json({ success: true, ...purged }, 200)
    }

    if (req.method === "POST" && path === "/rooms/restore") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      const restored = await restoreLineAdminRoom(supabase, String(body.room_id ?? "").trim())
      return json({ success: true, ...restored }, 200)
    }

    if (req.method === "POST" && path === "/actions/run-summary") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      if (body.force != null && typeof body.force !== "boolean") {
        throw { status: 400, message: "force must be boolean when provided." } satisfies AppError
      }
      const forceRun = body.force == null ? true : body.force

      const { data: beforeLog } = await supabase
        .from("summary_delivery_logs")
        .select("id")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle()
      const beforeId = beforeLog?.id ?? 0

      const { error: invokeError } = await supabase.rpc("invoke_summary_cron", { force_run: forceRun })
      if (invokeError) {
        throw { status: 500, message: `Failed to invoke summary cron: ${invokeError.message}` } satisfies AppError
      }

      const latestLog = await waitForNewLog(supabase, beforeId)
      if (!latestLog) {
        return json({
          success: true,
          queued: true,
          forced: forceRun,
          before_log_id: beforeId,
          latest_log: null,
          warning: "手動実行を受け付けました。ログ反映まで時間がかかっています。",
        }, 200)
      }

      return json({
        success: true,
        queued: true,
        forced: forceRun,
        before_log_id: beforeId,
        latest_log: {
          id: latestLog.id,
          run_at: latestLog.run_at,
          status: latestLog.status,
          reason: latestLog.reason,
        },
      }, 200)
    }

    if (req.method === "POST" && path === "/actions/test-receipt-report") {
      const body = await parseJson(workReq)
      if (!isRecord(body)) {
        throw { status: 400, message: "Invalid JSON body." } satisfies AppError
      }
      const roomId = String(body.room_id ?? "").trim()
      if (!roomId) {
        throw { status: 400, message: "room_id is required." } satisfies AppError
      }
      const testKey = (Deno.env.get("RECEIPT_MIDREPORT_CRON_TEST_KEY") ?? "").trim()
      if (!testKey) {
        throw {
          status: 503,
          message:
            "レポートのテスト送信が未設定です。admin-api と receipt-midreport-cron の両方に Edge secret RECEIPT_MIDREPORT_CRON_TEST_KEY（同一の値）を設定してください。",
        } satisfies AppError
      }
      const reportKindRaw = String(body.report_kind ?? "mid_month").trim().toLowerCase()
      const reportKind = reportKindRaw === "month_end" ? "month_end" : "mid_month"
      let year: number | undefined
      let month: number | undefined
      if (body.year != null) {
        const yn = Number(body.year)
        if (Number.isInteger(yn) && yn >= 2000 && yn <= 2100) year = yn
      }
      if (body.month != null) {
        const mn = Number(body.month)
        if (Number.isInteger(mn) && mn >= 1 && mn <= 12) month = mn
      }
      let storePartitionKey: string | undefined
      if (body.store_partition_key != null) {
        const rawKey = String(body.store_partition_key ?? "").trim().toLowerCase()
        if (rawKey && /^[a-z0-9]{2,120}$/.test(rawKey) && rawKey !== RECEIPT_STORE_PARTITION_UNKNOWN) {
          storePartitionKey = rawKey
        }
      }

      const { status, payload } = await invokeReceiptMidreportCronTestSend({
        supabaseUrl,
        serviceRoleKey,
        testKey,
        roomId,
        reportKind,
        year,
        month,
        storePartitionKey,
      })
      return json(payload, status)
    }

    return json({ error: "Not found." }, 404)
  } catch (e) {
    const err = asAppError(e)
    return json({ error: err.message }, err.status)
  }
})

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function chatAdminRequireHeadquarters(authority: ChatAdminAuthority): void {
  if (!authority.isFullAdmin) {
    throw { status: 403, message: "委任管理者を設定できるのは本部管理者だけです。" } satisfies AppError
  }
}

function chatAdminRequireCapability(
  authority: ChatAdminAuthority,
  capability: ChatAdminCapability,
): void {
  if (!hasChatAdminCapability(authority, capability)) {
    throw { status: 403, message: "このM-talk管理操作は許可されていません。" } satisfies AppError
  }
}

async function chatAdminDelegationRpcAllowed(
  supabase: ReturnType<typeof createClient<any>>,
  authority: ChatAdminAuthority,
  rpc: string,
  args: Record<string, unknown>,
): Promise<boolean> {
  if (authority.isFullAdmin) return true
  if (!authority.delegationId) return false
  const { data, error } = await supabase.rpc(rpc, {
    p_delegation_id: authority.delegationId,
    ...args,
  })
  if (error) {
    console.error(`${rpc} failed:`, error.message)
    throw { status: 500, message: "M-talk管理範囲を確認できませんでした。" } satisfies AppError
  }
  return data === true
}

async function runChatAdminMutation(
  supabase: ReturnType<typeof createClient<any>>,
  authority: ChatAdminAuthority,
  operation: string,
  headquartersRpc: string,
  args: Record<string, unknown>,
): Promise<{ data: any; error: any }> {
  if (authority.isFullAdmin) return await supabase.rpc(headquartersRpc, args)
  if (!authority.delegationId) {
    throw { status: 403, message: "M-talk委任管理権限が無効です。" } satisfies AppError
  }
  return await supabase.rpc("chat_admin_delegated_execute", {
    p_delegation_id: authority.delegationId,
    p_operation: operation,
    p_args: args,
    p_actor: String(args.p_actor ?? "").slice(0, 200),
  })
}

async function assertChatAdminRoomScope(
  supabase: ReturnType<typeof createClient<any>>,
  authority: ChatAdminAuthority,
  groupId: number,
  capability: ChatAdminCapability,
): Promise<void> {
  chatAdminRequireCapability(authority, capability)
  const allowed = await chatAdminDelegationRpcAllowed(
    supabase,
    authority,
    "chat_admin_delegation_allows_room",
    { p_group_id: groupId, p_capability: capability },
  )
  if (!allowed) {
    throw { status: 403, message: "このルームは管理を許可された範囲外です。" } satisfies AppError
  }
}

async function assertChatAdminUserReadScope(
  supabase: ReturnType<typeof createClient<any>>,
  authority: ChatAdminAuthority,
  userId: string,
): Promise<void> {
  const allowed = await chatAdminDelegationRpcAllowed(
    supabase,
    authority,
    "chat_admin_delegation_allows_user_read",
    { p_user_id: userId },
  )
  if (!allowed) {
    throw { status: 403, message: "このユーザーは管理を許可された範囲外です。" } satisfies AppError
  }
}

async function assertChatAdminUserGlobalScope(
  supabase: ReturnType<typeof createClient<any>>,
  authority: ChatAdminAuthority,
  userId: string,
  capability: ChatAdminCapability,
): Promise<void> {
  chatAdminRequireCapability(authority, capability)
  const allowed = await chatAdminDelegationRpcAllowed(
    supabase,
    authority,
    "chat_admin_delegation_allows_user_global",
    { p_user_id: userId, p_capability: capability },
  )
  if (!allowed) {
    throw { status: 403, message: "全体ユーザー権限を変更できる範囲ではありません。" } satisfies AppError
  }
}

async function assertChatAdminBotScope(
  supabase: ReturnType<typeof createClient<any>>,
  authority: ChatAdminAuthority,
  botId: string,
  capability: ChatAdminCapability,
): Promise<void> {
  chatAdminRequireCapability(authority, capability)
  const allowed = await chatAdminDelegationRpcAllowed(
    supabase,
    authority,
    "chat_admin_delegation_allows_bot",
    { p_user_id: botId, p_capability: capability },
  )
  if (!allowed) {
    throw { status: 403, message: "このBotは管理を許可された範囲外です。" } satisfies AppError
  }
}

async function assertChatAdminAuditScope(
  supabase: ReturnType<typeof createClient<any>>,
  authority: ChatAdminAuthority,
  auditId: number,
  capability: ChatAdminCapability,
): Promise<void> {
  chatAdminRequireCapability(authority, capability)
  const allowed = await chatAdminDelegationRpcAllowed(
    supabase,
    authority,
    "chat_admin_delegation_allows_audit",
    { p_audit_id: auditId, p_capability: capability },
  )
  if (!allowed) {
    throw { status: 403, message: "この監査記録は管理を許可された範囲外です。" } satisfies AppError
  }
}

async function assertChatAdminTemplateScope(
  supabase: ReturnType<typeof createClient<any>>,
  authority: ChatAdminAuthority,
  body: Record<string, unknown>,
): Promise<void> {
  if (authority.isFullAdmin) return
  const groupIds = chatAdminIdList(body.group_ids, "group_ids", (item) => {
    const value = Number(item)
    return Number.isSafeInteger(value) && value > 0 ? value : null
  })
  // user_idsだけの指定は、そのユーザーが参加する範囲外ルームまで広がるため委任者には許可しない。
  if (!groupIds.length) {
    throw { status: 403, message: "委任管理者は対象ルームを明示してください。" } satisfies AppError
  }
  for (const groupId of groupIds) {
    await assertChatAdminRoomScope(supabase, authority, groupId, "manage_templates")
  }
}

function chatAdminOptionalBoolean(value: unknown, field: string): boolean | null {
  if (value === undefined) return null
  if (typeof value !== "boolean") {
    throw { status: 400, message: `${field} must be boolean.` } satisfies AppError
  }
  return value
}

function chatAdminOptionalTimestamp(value: unknown, field: string): string | null {
  if (value === null || String(value).trim() === "") return null
  const parsed = new Date(String(value))
  if (!Number.isFinite(parsed.getTime())) {
    throw { status: 400, message: `${field} must be a valid timestamp or null.` } satisfies AppError
  }
  return parsed.toISOString()
}

function chatAdminExpectedTimestamp(value: unknown): string {
  const raw = String(value ?? "").trim()
  if (!raw || !Number.isFinite(new Date(raw).getTime())) {
    throw { status: 400, message: "画面を再読み込みしてから保存してください。" } satisfies AppError
  }
  // DBのmicrosecondsを落とすと一致比較に失敗するため、検証後も元の文字列を渡す。
  return raw
}

// chat_admin_revert_audit のホワイトリストと同じ集合。復元不能な操作は含めない。
const CHAT_ADMIN_REVERTIBLE_ACTIONS = new Set<string>([
  "user_access_update",
  "user_remove",
  "member_permissions_update",
  "member_remove",
])
function chatAdminCanRevertAction(authority: ChatAdminAuthority, action: string): boolean {
  if (!hasChatAdminCapability(authority, "revert_audit")) return false
  if (action === "user_access_update" || action === "user_remove") {
    return hasChatAdminCapability(authority, "manage_users")
  }
  if (action === "member_permissions_update" || action === "member_remove") {
    return hasChatAdminCapability(authority, "manage_members")
  }
  return false
}
// chat_admin_apply_room_template の上限と同じ。変更するときは両方そろえる。
const CHAT_ADMIN_TEMPLATE_MAX_TARGETS = 100

async function fetchChatAdminState(
  supabase: ReturnType<typeof createClient<any>>,
  authority: ChatAdminAuthority,
): Promise<Record<string, unknown>> {
  const [usersResult, accessResult, groupsResult, membersResult, auditResult, userStoresResult, storeCatalogResult] = await Promise.all([
    supabase
      .from("chat_users")
      .select("id, username, icon_url, created_at, is_bot, store_key, bot_deleted_at, bot_deleted_by")
      .order("created_at", { ascending: true })
      .limit(5000),
    supabase
      .from("chat_user_access")
      .select("user_id, access_enabled, can_start_direct, can_create_group, can_browse_users, can_use_journal_ai, can_review_access, is_full_admin, default_can_send, signup_status, restriction_reason, restricted_until, deleted_at, updated_at, updated_by")
      .limit(5000),
    supabase
      .from("chat_groups")
      .select("id, group_name, icon_url, created_by, created_at, is_direct, is_store_room, store_key, trashed_at, trashed_by")
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("chat_group_members")
      .select("group_id, user_id, joined_at, can_view, can_send, can_invite, can_manage")
      .order("joined_at", { ascending: true })
      .limit(20000),
    supabase
      .from("chat_admin_audit_log")
      .select("id, actor, action, target_user_id, group_id, before_state, after_state, created_at, source_audit_id")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("chat_user_stores")
      .select("user_id, store_key")
      .limit(20000),
    supabase
      .from("chat_store_catalog")
      .select("store_key, display_name, sort_order")
      .order("sort_order", { ascending: true })
      .limit(500),
  ])

  const failures = [
    usersResult.error,
    accessResult.error,
    groupsResult.error,
    membersResult.error,
    auditResult.error,
    userStoresResult.error,
    storeCatalogResult.error,
  ]
    .filter(Boolean)
  if (failures.length) {
    throw {
      status: 500,
      message: `M-talk管理情報の取得に失敗しました: ${failures.map((error) => error?.message ?? "unknown").join(" / ")}`,
    } satisfies AppError
  }

  const allUserRows = (usersResult.data || []) as Array<Record<string, unknown>>
  const allAccessRows = (accessResult.data || []) as Array<Record<string, unknown>>
  const allGroupRows = (groupsResult.data || []) as Array<Record<string, unknown>>
  const allMemberRows = (membersResult.data || []) as Array<Record<string, unknown>>
  const allAuditRows = (auditResult.data || []) as Array<Record<string, unknown>>
  const allUserStoreRows = (userStoresResult.data || []) as Array<Record<string, unknown>>
  const allStoreCatalogRows = (storeCatalogResult.data || []) as Array<Record<string, unknown>>
  const storeKeysByUser = new Map<string, string[]>()
  for (const row of allUserStoreRows) {
    const userId = String(row.user_id ?? "")
    const storeKey = String(row.store_key ?? "").trim()
    if (!userId || !storeKey) continue
    if (!storeKeysByUser.has(userId)) storeKeysByUser.set(userId, [])
    storeKeysByUser.get(userId)?.push(storeKey)
  }
  const memberRoomIdsByUser = new Map<string, number[]>()
  for (const row of allMemberRows) {
    const userId = String(row.user_id ?? "")
    const groupId = Number(row.group_id)
    if (!userId || !Number.isSafeInteger(groupId) || groupId <= 0) continue
    if (!memberRoomIdsByUser.has(userId)) memberRoomIdsByUser.set(userId, [])
    memberRoomIdsByUser.get(userId)?.push(groupId)
  }
  const groupRows = allGroupRows.filter((row) => chatAdminAllowsRoom(authority, row))
  const scopedGroupIds = new Set(groupRows.map((row) => Number(row.id)))
  const scopedStoreKeys = authority.scopeMode === "all"
    ? null
    : new Set(
      authority.scopeMode === "stores"
        ? authority.storeKeys
        : groupRows.map((room) => String(room.store_key ?? "").trim()).filter(Boolean),
    )
  const userRows = allUserRows.filter((row) => {
    const userId = String(row.id ?? "")
    return chatAdminAllowsUser(
      authority,
      row,
      storeKeysByUser.get(userId) ?? [],
      memberRoomIdsByUser.get(userId) ?? [],
    )
  })
  const scopedUserIds = new Set(userRows.map((row) => String(row.id ?? "")))
  const accessRows = allAccessRows.filter((row) => scopedUserIds.has(String(row.user_id ?? "")))
  const memberRows = allMemberRows.filter((row) => (
    scopedGroupIds.has(Number(row.group_id)) && scopedUserIds.has(String(row.user_id ?? ""))
  ))
  const roomById = new Map<number, Record<string, unknown>>(
    allGroupRows.map((row) => [Number(row.id), row]),
  )
  const scopedAuditSourceRows = allAuditRows.filter((row) => chatAdminAllowsAudit(authority, row, roomById))
  const revertedAuditIds = new Set(
    scopedAuditSourceRows
      .map((row) => Number(row.source_audit_id ?? 0))
      .filter((value) => Number.isSafeInteger(value) && value > 0),
  )
  const auditRows = scopedAuditSourceRows.map((row) => ({
    ...row,
    // 復元可能な操作で、まだ復元されていないものだけUIへ「元に戻す」を出す。
    revertible: chatAdminCanRevertAction(authority, String(row.action ?? ""))
      && CHAT_ADMIN_REVERTIBLE_ACTIONS.has(String(row.action ?? ""))
      && row.before_state != null
      && row.after_state != null
      && !revertedAuditIds.has(Number(row.id ?? 0)),
  }))
  const accessByUser = new Map(accessRows.map((row) => [String(row.user_id ?? ""), row]))
  const userById = new Map(userRows.map((row) => [String(row.id ?? ""), row]))
  const membersByGroup = new Map<string, Array<Record<string, unknown>>>()
  const roomCounts = new Map<string, number>()

  for (const row of memberRows) {
    const groupId = String(row.group_id ?? "")
    const userId = String(row.user_id ?? "")
    if (!membersByGroup.has(groupId)) membersByGroup.set(groupId, [])
    membersByGroup.get(groupId)?.push(row)
    roomCounts.set(userId, (roomCounts.get(userId) ?? 0) + 1)
  }

  const users: Array<Record<string, unknown>> = userRows.map((row): Record<string, unknown> => {
    const userId = String(row.id ?? "")
    const access = accessByUser.get(userId) ?? {}
    return {
      ...row,
      store_keys: (storeKeysByUser.get(userId) ?? []).filter((storeKey) => (
        scopedStoreKeys === null || scopedStoreKeys.has(storeKey)
      )),
      room_count: roomCounts.get(userId) ?? 0,
      access: {
        access_enabled: access.access_enabled !== false,
        can_start_direct: access.can_start_direct !== false,
        can_create_group: access.can_create_group !== false,
        can_browse_users: access.can_browse_users !== false,
        can_use_journal_ai: access.can_use_journal_ai === true,
        can_review_access: access.can_review_access === true,
        is_full_admin: access.is_full_admin === true,
        default_can_send: access.default_can_send !== false,
        signup_status: String(access.signup_status || "approved"),
        restriction_reason: access.restriction_reason ?? null,
        restricted_until: access.restricted_until ?? null,
        deleted_at: access.deleted_at ?? null,
        updated_at: access.updated_at ?? null,
        updated_by: access.updated_by ?? null,
      },
    }
  }).sort((a, b) => String(a["username"] ?? "").localeCompare(String(b["username"] ?? ""), "ja"))

  const rooms: Array<Record<string, unknown>> = groupRows.map((group): Record<string, unknown> => {
    const groupId = String(group.id ?? "")
    const members = (membersByGroup.get(groupId) ?? []).map((member) => {
      const user = userById.get(String(member.user_id ?? "")) ?? {}
      const access = accessByUser.get(String(member.user_id ?? "")) ?? {}
      return {
        ...member,
        username: user.username ?? "不明なユーザー",
        icon_url: user.icon_url ?? null,
        is_bot: user.is_bot === true,
        bot_deleted_at: user.bot_deleted_at ?? null,
        user_deleted_at: access.deleted_at ?? null,
        user_access_enabled: access.access_enabled !== false,
      }
    })
    return { ...group, members, member_count: members.length }
  })

  const now = Date.now()
  const humanUsers = users.filter((user) => user["is_bot"] !== true)
  const botUsers = users.filter((user) => user["is_bot"] === true)
  const deletedBots = botUsers.filter((user) => Boolean(user["bot_deleted_at"]))
  const deletedUsers = humanUsers.filter((user) => Boolean((user.access as Record<string, unknown>).deleted_at))
  const suspendedUsers = humanUsers.filter((user) => {
    const access = user.access as Record<string, unknown>
    if (access.deleted_at) return false
    const restricted = access.restricted_until ? new Date(String(access.restricted_until)).getTime() > now : false
    return access.access_enabled === false || restricted
  })
  const activeUsers = humanUsers.length - deletedUsers.length - suspendedUsers.length
  const storeCatalog = allStoreCatalogRows.filter((row) => (
    scopedStoreKeys === null || scopedStoreKeys.has(String(row.store_key ?? ""))
  ))

  return {
    admin_authority: publicChatAdminAuthority(authority),
    summary: {
      active_users: activeUsers,
      suspended_users: suspendedUsers.length,
      deleted_users: deletedUsers.length,
      bot_users: botUsers.length - deletedBots.length,
      deleted_bot_users: deletedBots.length,
      group_rooms: rooms.filter((room) => room["is_direct"] !== true && !room["trashed_at"]).length,
      direct_rooms: rooms.filter((room) => room["is_direct"] === true && !room["trashed_at"]).length,
      trashed_rooms: rooms.filter((room) => Boolean(room["trashed_at"])).length,
    },
    users,
    rooms,
    store_catalog: storeCatalog,
    audit_logs: auditRows,
    revertible_actions: hasChatAdminCapability(authority, "revert_audit")
      ? [...CHAT_ADMIN_REVERTIBLE_ACTIONS]
      : [],
    generated_at: new Date().toISOString(),
  }
}

async function updateChatAdminUserAccess(
  supabase: ReturnType<typeof createClient<any>>,
  userId: string,
  body: Record<string, unknown>,
  actor: string,
  authority: ChatAdminAuthority,
): Promise<Record<string, unknown>> {
  const updateReason = Object.prototype.hasOwnProperty.call(body, "restriction_reason")
  const updateUntil = Object.prototype.hasOwnProperty.call(body, "restricted_until")
  const updateJournalAi = Object.prototype.hasOwnProperty.call(body, "can_use_journal_ai")
  const updateReviewAccess = Object.prototype.hasOwnProperty.call(body, "can_review_access")
  const updateFullAdmin = Object.prototype.hasOwnProperty.call(body, "is_full_admin")
  const updateSensitiveAccess = updateJournalAi || updateReviewAccess || updateFullAdmin
  if (updateSensitiveAccess && !authority.isFullAdmin) {
    throw { status: 403, message: "全権管理者・承認・電子ジャーナルAI権限を変更できるのは本部管理者だけです。" } satisfies AppError
  }
  if (updateFullAdmin) {
    const { data, error } = await supabase.rpc("chat_admin_set_full_admin", {
      p_user_id: userId,
      p_enabled: chatAdminOptionalBoolean(body.is_full_admin, "is_full_admin"),
      p_expected_updated_at: chatAdminExpectedTimestamp(body.expected_updated_at),
      p_actor: actor,
    })
    if (error) throw chatAdminRpcError(error)
    return { ok: true, access: data }
  }
  const reason = updateReason ? (String(body.restriction_reason ?? "").trim() || null) : null
  if (reason && reason.length > 500) {
    throw { status: 400, message: "制限理由は500文字以内にしてください。" } satisfies AppError
  }

  const args: Record<string, unknown> = {
    p_user_id: userId,
    p_access_enabled: chatAdminOptionalBoolean(body.access_enabled, "access_enabled"),
    p_can_start_direct: chatAdminOptionalBoolean(body.can_start_direct, "can_start_direct"),
    p_can_create_group: chatAdminOptionalBoolean(body.can_create_group, "can_create_group"),
    p_can_browse_users: chatAdminOptionalBoolean(body.can_browse_users, "can_browse_users"),
    p_restriction_reason: reason,
    p_restricted_until: updateUntil ? chatAdminOptionalTimestamp(body.restricted_until, "restricted_until") : null,
    p_update_restriction_reason: updateReason,
    p_update_restricted_until: updateUntil,
    p_expected_updated_at: chatAdminExpectedTimestamp(body.expected_updated_at),
    p_actor: actor,
  }
  if (updateSensitiveAccess) {
    args.p_can_use_journal_ai = updateJournalAi
      ? chatAdminOptionalBoolean(body.can_use_journal_ai, "can_use_journal_ai")
      : null
    args.p_can_review_access = updateReviewAccess
      ? chatAdminOptionalBoolean(body.can_review_access, "can_review_access")
      : null
  }
  const { data, error } = await runChatAdminMutation(
    supabase,
    authority,
    "update_user_access",
    updateSensitiveAccess ? "chat_admin_update_user_access_secure" : "chat_admin_update_user_access",
    args,
  )
  if (error) {
    throw chatAdminRpcError(error)
  }
  return { ok: true, access: data }
}

async function trashChatAdminRoom(
  supabase: ReturnType<typeof createClient<any>>,
  groupId: number,
  actor: string,
  authority: ChatAdminAuthority,
): Promise<Record<string, unknown>> {
  const { data, error } = await runChatAdminMutation(supabase, authority, "trash_group", "chat_admin_trash_group", {
    p_group_id: groupId,
    p_actor: actor,
  })
  if (error) throw chatAdminRpcError(error)
  return { ok: true, room: data }
}

async function restoreChatAdminRoom(
  supabase: ReturnType<typeof createClient<any>>,
  groupId: number,
  actor: string,
  authority: ChatAdminAuthority,
): Promise<Record<string, unknown>> {
  const { data, error } = await runChatAdminMutation(supabase, authority, "restore_group", "chat_admin_restore_group", {
    p_group_id: groupId,
    p_actor: actor,
  })
  if (error) throw chatAdminRpcError(error)
  return { ok: true, room: data }
}

async function purgeChatAdminRoom(
  supabase: ReturnType<typeof createClient<any>>,
  groupId: number,
  body: Record<string, unknown>,
  actor: string,
): Promise<Record<string, unknown>> {
  const { data: group, error } = await supabase
    .from("chat_groups")
    .select("id, group_name, created_by, is_direct, is_store_room, store_key, trashed_at")
    .eq("id", groupId)
    .maybeSingle()
  if (error) throw { status: 500, message: `ルームの確認に失敗しました: ${error.message}` } satisfies AppError
  if (!group) throw { status: 404, message: "ルームが見つかりません。" } satisfies AppError
  if (group.is_store_room) {
    throw { status: 403, message: "店舗固定ルームは削除できません。" } satisfies AppError
  }
  if (!group.trashed_at) {
    throw { status: 400, message: "先にゴミ箱へ入れてから完全削除してください。" } satisfies AppError
  }
  const roomName = String(group.group_name ?? "").trim() || String(groupId)
  const confirmName = String(body.confirm_name ?? "").trim()
  if (!confirmName || confirmName !== roomName) {
    throw { status: 400, message: "確認用のルーム名が一致しません。" } satisfies AppError
  }

  const purged = await purgeMtalkGroupAsAdmin(supabase, groupId)
  const { error: auditError } = await supabase.from("chat_admin_audit_log").insert({
    action: "room_purge",
    group_id: groupId,
    actor,
    before_state: group,
    after_state: { purged: true, counts: purged.counts },
  })
  if (auditError) {
    console.error("chat-admin room purge audit failed:", auditError.message)
  }
  return {
    ok: true,
    ...purged,
    audit_recorded: !auditError,
  }
}

async function removeChatAdminBot(
  supabase: ReturnType<typeof createClient<any>>,
  botId: string,
  body: Record<string, unknown>,
  actor: string,
  authority: ChatAdminAuthority,
): Promise<Record<string, unknown>> {
  const confirmUsername = String(body.confirm_username ?? "").trim()
  if (!confirmUsername) {
    throw { status: 400, message: "確認のためBot名を入力してください。" } satisfies AppError
  }
  const { data, error } = await runChatAdminMutation(supabase, authority, "remove_bot", "chat_admin_remove_bot", {
    p_user_id: botId,
    p_actor: actor,
    p_confirm_username: confirmUsername,
  })
  if (error) throw chatAdminRpcError(error)
  return { ok: true, bot: data, history_preserved: true, memberships_preserved: true }
}

async function restoreChatAdminBot(
  supabase: ReturnType<typeof createClient<any>>,
  botId: string,
  actor: string,
  authority: ChatAdminAuthority,
): Promise<Record<string, unknown>> {
  const { data, error } = await runChatAdminMutation(supabase, authority, "restore_bot", "chat_admin_restore_bot", {
    p_user_id: botId,
    p_actor: actor,
  })
  if (error) throw chatAdminRpcError(error)
  return { ok: true, bot: data }
}

async function removeChatAdminUser(
  supabase: ReturnType<typeof createClient<any>>,
  userId: string,
  body: Record<string, unknown>,
  actor: string,
  authority: ChatAdminAuthority,
): Promise<Record<string, unknown>> {
  const confirmUsername = String(body.confirm_username ?? "").trim()
  if (!confirmUsername) {
    throw { status: 400, message: "確認のため表示名を入力してください。" } satisfies AppError
  }
  const { data, error } = await runChatAdminMutation(supabase, authority, "remove_user", "chat_admin_remove_user", {
    p_user_id: userId,
    p_actor: actor,
    p_confirm_username: confirmUsername,
  })
  if (error) throw chatAdminRpcError(error)
  return { ok: true, access: data, history_preserved: true, auth_user_preserved: true }
}

async function restoreChatAdminUser(
  supabase: ReturnType<typeof createClient<any>>,
  userId: string,
  actor: string,
  authority: ChatAdminAuthority,
): Promise<Record<string, unknown>> {
  const { data, error } = await runChatAdminMutation(supabase, authority, "restore_user", "chat_admin_restore_user", {
    p_user_id: userId,
    p_actor: actor,
  })
  if (error) throw chatAdminRpcError(error)
  return { ok: true, access: data }
}

async function updateChatAdminMemberPermissions(
  supabase: ReturnType<typeof createClient<any>>,
  groupId: number,
  userId: string,
  body: Record<string, unknown>,
  actor: string,
  authority: ChatAdminAuthority,
): Promise<Record<string, unknown>> {
  const fields = ["can_view", "can_send", "can_invite", "can_manage"] as const
  if (!fields.some((field) => Object.prototype.hasOwnProperty.call(body, field))) {
    throw { status: 400, message: "変更するルーム権限を指定してください。" } satisfies AppError
  }
  const { data, error } = await runChatAdminMutation(supabase, authority, "update_member", "chat_admin_update_member_permissions", {
    p_group_id: groupId,
    p_user_id: userId,
    p_can_view: chatAdminOptionalBoolean(body.can_view, "can_view"),
    p_can_send: chatAdminOptionalBoolean(body.can_send, "can_send"),
    p_can_invite: chatAdminOptionalBoolean(body.can_invite, "can_invite"),
    p_can_manage: chatAdminOptionalBoolean(body.can_manage, "can_manage"),
    p_actor: actor,
  })
  if (error) throw chatAdminRpcError(error)
  return { ok: true, membership: data }
}

async function removeChatAdminMember(
  supabase: ReturnType<typeof createClient<any>>,
  groupId: number,
  userId: string,
  actor: string,
  authority: ChatAdminAuthority,
): Promise<Record<string, unknown>> {
  const { error } = await runChatAdminMutation(supabase, authority, "remove_member", "chat_admin_remove_member", {
    p_group_id: groupId,
    p_user_id: userId,
    p_actor: actor,
  })
  if (error) throw chatAdminRpcError(error)
  return { ok: true }
}

// M-talk管理RPCの失敗を、競合(40001)なら409、それ以外は400として返す。
function chatAdminRpcError(error: { code?: string | null; message?: string | null } | null): AppError {
  const code = String(error?.code ?? "")
  const conflict = code === "40001"
  const forbidden = code === "42501"
  return {
    status: conflict ? 409 : forbidden ? 403 : 400,
    message: conflict
      ? "別の管理者が先に更新しました。再読み込みしてやり直してください。"
      : forbidden
      ? "M-talk管理権限が停止、期限切れ、または対象範囲外です。"
      : String(error?.message ?? "M-talk管理操作に失敗しました。"),
  }
}

function chatAdminIdList<T>(
  value: unknown,
  field: string,
  parse: (item: unknown) => T | null,
  max = CHAT_ADMIN_TEMPLATE_MAX_TARGETS,
): T[] {
  if (value == null) return []
  if (!Array.isArray(value)) {
    throw { status: 400, message: `${field} は配列で指定してください。` } satisfies AppError
  }
  if (value.length > max) {
    throw { status: 400, message: `${field} は${max}件までです。` } satisfies AppError
  }
  const list: T[] = []
  for (const item of value) {
    const parsed = parse(item)
    if (parsed === null) {
      throw { status: 400, message: `${field} に不正な値が含まれています。` } satisfies AppError
    }
    list.push(parsed)
  }
  return [...new Set(list)]
}

function chatAdminDelegationStringList(value: unknown, field: string, max: number): string[] {
  if (!Array.isArray(value)) {
    throw { status: 400, message: `${field} は配列で指定してください。` } satisfies AppError
  }
  const values = [...new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))]
  if (values.length > max) {
    throw { status: 400, message: `${field} は${max}件までです。` } satisfies AppError
  }
  return values
}

async function normalizeChatAdminDelegationPayload(
  supabase: ReturnType<typeof createClient<any>>,
  body: Record<string, unknown>,
  current?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const label = Object.prototype.hasOwnProperty.call(body, "label")
    ? String(body.label ?? "").trim()
    : String(current?.label ?? "").trim()
  if (!label || label.length > 80) {
    throw { status: 400, message: "管理者名は1〜80文字で入力してください。" } satisfies AppError
  }
  const scopeMode = String(
    Object.prototype.hasOwnProperty.call(body, "scope_mode") ? body.scope_mode : current?.scope_mode,
  ).trim() as ChatAdminScopeMode
  if (!(["all", "stores", "rooms"] as string[]).includes(scopeMode)) {
    throw { status: 400, message: "管理範囲を選択してください。" } satisfies AppError
  }
  const rawStoreKeys = Object.prototype.hasOwnProperty.call(body, "store_keys")
    ? body.store_keys
    : (current?.store_keys ?? [])
  const rawRoomIds = Object.prototype.hasOwnProperty.call(body, "room_ids")
    ? body.room_ids
    : (current?.room_ids ?? [])
  const storeKeys = scopeMode === "stores"
    ? chatAdminDelegationStringList(rawStoreKeys, "store_keys", 50)
    : []
  const roomIds = scopeMode === "rooms"
    ? chatAdminIdList(rawRoomIds, "room_ids", (item) => {
      const value = Number(item)
      return Number.isSafeInteger(value) && value > 0 ? value : null
    }, 500)
    : []
  if (scopeMode === "stores" && !storeKeys.length) {
    throw { status: 400, message: "管理対象の店舗を1つ以上選択してください。" } satisfies AppError
  }
  if (scopeMode === "rooms" && !roomIds.length) {
    throw { status: 400, message: "管理対象のルームを1つ以上選択してください。" } satisfies AppError
  }

  const rawCapabilities = Object.prototype.hasOwnProperty.call(body, "capabilities")
    ? body.capabilities
    : (current?.capabilities ?? ["view"])
  const capabilities = chatAdminDelegationStringList(
    rawCapabilities,
    "capabilities",
    CHAT_ADMIN_CAPABILITIES.length,
  )
  if (!capabilities.includes("view") || capabilities.some((item) => (
    !CHAT_ADMIN_CAPABILITIES.includes(item as ChatAdminCapability)
  ))) {
    throw { status: 400, message: "許可する操作の指定が不正です。" } satisfies AppError
  }
  if (capabilities.includes("manage_users") && scopeMode !== "all") {
    throw { status: 400, message: "全体ユーザー管理はM-talk全体スコープだけに付与できます。" } satisfies AppError
  }
  if (capabilities.includes("manage_bots") && scopeMode === "rooms") {
    throw { status: 400, message: "Bot管理はM-talk全体または店舗スコープだけに付与できます。" } satisfies AppError
  }
  if (capabilities.includes("revert_audit") && !capabilities.includes("audit_read")) {
    throw { status: 400, message: "監査復元には監査ログ閲覧も必要です。" } satisfies AppError
  }
  if (capabilities.includes("manage_templates") && !capabilities.includes("manage_members")) {
    throw { status: 400, message: "一括設定にはメンバー権限管理も必要です。" } satisfies AppError
  }

  if (storeKeys.length) {
    const { data, error } = await supabase
      .from("chat_store_catalog")
      .select("store_key")
      .in("store_key", storeKeys)
    if (error) throw { status: 500, message: `店舗一覧を確認できませんでした: ${error.message}` } satisfies AppError
    const valid = new Set((data || []).map((row: Record<string, unknown>) => String(row.store_key ?? "")))
    if (storeKeys.some((key) => !valid.has(key))) {
      throw { status: 400, message: "存在しない店舗が含まれています。" } satisfies AppError
    }
  }
  if (roomIds.length) {
    const { data, error } = await supabase
      .from("chat_groups")
      .select("id")
      .in("id", roomIds)
    if (error) throw { status: 500, message: `ルーム一覧を確認できませんでした: ${error.message}` } satisfies AppError
    const valid = new Set((data || []).map((row: Record<string, unknown>) => Number(row.id)))
    if (roomIds.some((id) => !valid.has(id))) {
      throw { status: 400, message: "存在しないルームが含まれています。" } satisfies AppError
    }
  }

  const enabled = Object.prototype.hasOwnProperty.call(body, "enabled")
    ? body.enabled
    : (current?.enabled ?? true)
  if (typeof enabled !== "boolean") {
    throw { status: 400, message: "enabled はbooleanで指定してください。" } satisfies AppError
  }
  let expiresAt: string | null = current?.expires_at ? String(current.expires_at) : null
  if (Object.prototype.hasOwnProperty.call(body, "expires_at")) {
    const raw = String(body.expires_at ?? "").trim()
    if (!raw) {
      throw { status: 400, message: "委任管理権限には有効期限が必要です。" } satisfies AppError
    } else {
      const date = new Date(raw)
      if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now() + 60_000) {
        throw { status: 400, message: "有効期限は現在より後にしてください。" } satisfies AppError
      }
      expiresAt = date.toISOString()
    }
  }
  if (!expiresAt) {
    throw { status: 400, message: "委任管理権限には有効期限が必要です。" } satisfies AppError
  }
  if (enabled && new Date(expiresAt).getTime() <= Date.now()) {
    throw { status: 400, message: "期限切れの権限は有効化できません。" } satisfies AppError
  }
  return {
    label,
    enabled,
    scope_mode: scopeMode,
    store_keys: storeKeys,
    room_ids: roomIds,
    capabilities,
    expires_at: expiresAt,
  }
}

async function fetchChatAdminDelegations(
  supabase: ReturnType<typeof createClient<any>>,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from("chat_admin_delegations")
    .select("id, label, enabled, scope_mode, store_keys, room_ids, capabilities, expires_at, session_version, last_link_issued_at, created_by, updated_by, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) {
    throw { status: 500, message: `委任管理者の取得に失敗しました: ${error.message}` } satisfies AppError
  }
  return { delegations: data || [], capabilities: CHAT_ADMIN_CAPABILITIES }
}

async function createChatAdminDelegation(
  supabase: ReturnType<typeof createClient<any>>,
  body: Record<string, unknown>,
  actor: string,
): Promise<Record<string, unknown>> {
  const payload = await normalizeChatAdminDelegationPayload(supabase, body)
  const { data, error } = await supabase
    .from("chat_admin_delegations")
    .insert({ ...payload, created_by: actor, updated_by: actor })
    .select("id, label, enabled, scope_mode, store_keys, room_ids, capabilities, expires_at, session_version, created_at, updated_at")
    .single()
  if (error || !data) {
    throw { status: 400, message: `委任管理者を作成できませんでした: ${error?.message ?? "unknown"}` } satisfies AppError
  }
  await supabase.from("chat_admin_audit_log").insert({
    action: "delegation_create",
    actor,
    after_state: data,
  })
  const login = await issueChatAdminDelegationLoginLink(supabase, String(data.id), actor)
  return { ok: true, delegation: data, ...login }
}

async function updateChatAdminDelegation(
  supabase: ReturnType<typeof createClient<any>>,
  delegationId: string,
  body: Record<string, unknown>,
  actor: string,
): Promise<Record<string, unknown>> {
  const { data: current, error: currentError } = await supabase
    .from("chat_admin_delegations")
    .select("id, label, enabled, scope_mode, store_keys, room_ids, capabilities, expires_at, session_version, created_at, updated_at")
    .eq("id", delegationId)
    .maybeSingle()
  if (currentError) throw { status: 500, message: `委任管理者を確認できませんでした: ${currentError.message}` } satisfies AppError
  if (!current) throw { status: 404, message: "委任管理者が見つかりません。" } satisfies AppError
  const payload = await normalizeChatAdminDelegationPayload(supabase, body, current as Record<string, unknown>)
  const { data, error } = await supabase
    .from("chat_admin_delegations")
    .update({
      ...payload,
      updated_by: actor,
      updated_at: new Date().toISOString(),
    })
    .eq("id", delegationId)
    .eq("updated_at", String(current.updated_at))
    .select("id, label, enabled, scope_mode, store_keys, room_ids, capabilities, expires_at, session_version, created_at, updated_at")
    .maybeSingle()
  if (error) throw { status: 400, message: `委任管理者を更新できませんでした: ${error.message}` } satisfies AppError
  if (!data) {
    throw { status: 409, message: "別の管理者が先に変更しました。再読み込みしてください。" } satisfies AppError
  }
  await supabase.from("chat_admin_audit_log").insert({
    action: "delegation_update",
    actor,
    before_state: current,
    after_state: data,
  })
  return { ok: true, delegation: data }
}

async function issueChatAdminDelegationLoginLink(
  supabase: ReturnType<typeof createClient<any>>,
  delegationId: string,
  actor: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from("chat_admin_delegations")
    .select("id, label, enabled, expires_at, session_version")
    .eq("id", delegationId)
    .maybeSingle()
  if (error) throw { status: 500, message: `委任管理者を確認できませんでした: ${error.message}` } satisfies AppError
  if (!data) throw { status: 404, message: "委任管理者が見つかりません。" } satisfies AppError
  if (data.enabled !== true) throw { status: 403, message: "停止中の委任管理者にはリンクを発行できません。" } satisfies AppError
  if (data.expires_at && new Date(String(data.expires_at)).getTime() <= Date.now()) {
    throw { status: 403, message: "期限切れの委任管理者にはリンクを発行できません。" } satisfies AppError
  }
  const sessionVersion = Number(data.session_version)
  if (!Number.isSafeInteger(sessionVersion) || sessionVersion <= 0) {
    throw { status: 500, message: "委任管理者のセッション世代が不正です。" } satisfies AppError
  }
  const issued = await issueAdminDashboardLoginLinkToken(supabase, {
    scope: MTALK_ADMIN_SCOPE,
    chat_admin_delegation_id: delegationId,
    chat_admin_delegation_version: sessionVersion,
    source: "chat_admin_delegation",
  })
  await supabase
    .from("chat_admin_delegations")
    .update({ last_link_issued_at: new Date().toISOString(), updated_by: actor })
    .eq("id", delegationId)
  await supabase.from("chat_admin_audit_log").insert({
    action: "delegation_link_issue",
    actor,
    after_state: { delegation_id: delegationId, expires_at: issued.expires_at },
  })
  return {
    ok: true,
    delegation_id: delegationId,
    login_token: issued.token,
    login_expires_at: issued.expires_at,
  }
}

async function fetchChatAdminTemplates(
  supabase: ReturnType<typeof createClient<any>>,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from("chat_permission_templates")
    .select("key, label, description, can_view, can_send, can_invite, can_manage, is_builtin, sort_order")
    .order("sort_order", { ascending: true })
    .limit(200)
  if (error) {
    throw { status: 500, message: `権限テンプレートの取得に失敗しました: ${error.message}` } satisfies AppError
  }
  return { templates: data || [], max_targets: CHAT_ADMIN_TEMPLATE_MAX_TARGETS }
}

// dry_run は既定true。書き込むときだけ dry_run:false を明示させる。
async function applyChatAdminTemplate(
  supabase: ReturnType<typeof createClient<any>>,
  body: Record<string, unknown>,
  actor: string,
  authority: ChatAdminAuthority,
): Promise<Record<string, unknown>> {
  const templateKey = String(body.template_key ?? "").trim()
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(templateKey)) {
    throw { status: 400, message: "適用する権限テンプレートを選択してください。" } satisfies AppError
  }
  const groupIds = chatAdminIdList(body.group_ids, "group_ids", (item) => {
    const value = Number(item)
    return Number.isSafeInteger(value) && value > 0 ? value : null
  })
  const userIds = chatAdminIdList(body.user_ids, "user_ids", (item) => {
    const value = String(item ?? "").trim().toLowerCase()
    return isUuid(value) ? value : null
  })
  if (!groupIds.length && !userIds.length) {
    throw { status: 400, message: "適用対象のルームまたはユーザーを指定してください。" } satisfies AppError
  }
  const dryRun = body.dry_run !== false
  const { data, error } = await runChatAdminMutation(supabase, authority, "apply_template", "chat_admin_apply_room_template", {
    p_group_ids: groupIds,
    p_user_ids: userIds,
    p_template_key: templateKey,
    p_dry_run: dryRun,
    p_actor: actor,
  })
  if (error) throw chatAdminRpcError(error)
  return { ok: true, dry_run: dryRun, result: data }
}

async function fetchChatAdminUserAccess(
  supabase: ReturnType<typeof createClient<any>>,
  userId: string,
  limitParam: string | null,
  offsetParam: string | null,
  authority: ChatAdminAuthority,
): Promise<Record<string, unknown>> {
  const limit = Math.min(Math.max(Number(limitParam ?? 100) || 100, 1), 500)
  const offset = Math.max(Number(offsetParam ?? 0) || 0, 0)
  const { data, error } = await supabase.rpc("chat_admin_user_effective_access", {
    p_user_id: userId,
    p_limit: authority.isFullAdmin ? limit : 500,
    p_offset: authority.isFullAdmin ? offset : 0,
  })
  if (error) throw chatAdminRpcError(error)
  const result = (data ?? {}) as Record<string, unknown>
  if (authority.isFullAdmin) return result
  const scopedRooms = (Array.isArray(result.rooms) ? result.rooms : [])
    .filter((room) => isRecord(room) && chatAdminAllowsRoom(authority, {
      id: room.group_id,
      store_key: room.store_key,
    }))
  return {
    ...result,
    rooms: scopedRooms.slice(offset, offset + limit),
    total_rooms: scopedRooms.length,
    limit,
    offset,
  }
}

async function revertChatAdminAudit(
  supabase: ReturnType<typeof createClient<any>>,
  auditId: number,
  body: Record<string, unknown>,
  actor: string,
  authority: ChatAdminAuthority,
): Promise<Record<string, unknown>> {
  const dryRun = body.dry_run !== false
  const { data, error } = await runChatAdminMutation(supabase, authority, "revert_audit", "chat_admin_revert_audit", {
    p_audit_id: auditId,
    p_dry_run: dryRun,
    p_actor: actor,
  })
  if (error) throw chatAdminRpcError(error)
  return { ok: true, dry_run: dryRun, result: data }
}

async function authenticateChatMember(
  req: Request,
  supabase: ReturnType<typeof createClient<any>>,
  groupId: number,
  capability: "view" | "send" | "manage" | "journal_ai" = "view",
): Promise<string> {
  const jwt = /^Bearer\s+(.+)$/i.exec(String(req.headers.get("Authorization") ?? "").trim())?.[1]?.trim() ?? ""
  if (!jwt) {
    throw { status: 401, message: "ログインしてください。" } satisfies AppError
  }
  const { data, error } = await supabase.auth.getUser(jwt)
  const userId = String(data?.user?.id ?? "").trim()
  if (error || !userId) {
    throw { status: 401, message: "ログインしてください。" } satisfies AppError
  }
  const { data: access, error: accessError } = await supabase
    .from("chat_user_access")
    .select("access_enabled, restricted_until, deleted_at, can_use_journal_ai")
    .eq("user_id", userId)
    .maybeSingle()
  if (accessError) {
    throw { status: 500, message: `M-talk利用状態の確認に失敗しました: ${accessError.message}` } satisfies AppError
  }
  const restrictedUntil = access?.restricted_until ? new Date(String(access.restricted_until)).getTime() : 0
  if (!access || access.access_enabled !== true || access.deleted_at || restrictedUntil > Date.now()) {
    throw { status: 403, message: "M-talkの利用が停止されています。" } satisfies AppError
  }
  if (capability === "journal_ai" && access.can_use_journal_ai !== true) {
    throw { status: 403, message: "電子ジャーナルAIの利用権限がありません。管理者へ確認してください。" } satisfies AppError
  }

  const { data: member, error: memberError } = await supabase
    .from("chat_group_members")
    .select("user_id, can_view, can_send, can_manage")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle()
  if (memberError) {
    throw { status: 500, message: `メンバー確認に失敗しました: ${memberError.message}` } satisfies AppError
  }
  if (!member) {
    throw { status: 403, message: "このルームのメンバーではありません。" } satisfies AppError
  }
  if (member.can_view !== true) {
    throw { status: 403, message: "このルームを閲覧する権限がありません。" } satisfies AppError
  }
  if (capability === "send" && member.can_send !== true) {
    throw { status: 403, message: "このルームへ送信する権限がありません。" } satisfies AppError
  }
  if (capability === "manage" && member.can_manage !== true) {
    throw { status: 403, message: "このルームを管理する権限がありません。" } satisfies AppError
  }
  return userId
}

async function requireMtalkStoreAccess(
  supabase: ReturnType<typeof createClient<any>>,
  userId: string,
  storeKey: string | null,
): Promise<string> {
  const key = String(storeKey ?? "").trim()
  if (!key || !await mtalkUserCanAccessStore(supabase, userId, key)) {
    throw { status: 403, message: "この店舗の機能を利用する権限がありません。" } satisfies AppError
  }
  return key
}

async function requireMtalkRoomStoreBinding(
  supabase: ReturnType<typeof createClient<any>>,
  userId: string,
  groupId: number,
  storeKey: string | null,
): Promise<string> {
  const key = await requireMtalkStoreAccess(supabase, userId, storeKey)
  const currentRoomStore = await resolveMtalkRoomStoreKey(supabase, groupId)
  if (currentRoomStore.ambiguous || currentRoomStore.storeKey !== key) {
    throw { status: 403, message: "このルームの店舗Botと対象店舗が一致しません。" } satisfies AppError
  }
  return key
}

async function resolveChatMediaRoom(
  supabase: ReturnType<typeof createClient<any>>,
  groupId: number,
): Promise<{ roomId: string; storeKey: string | null } | null> {
  const { data, error } = await supabase
    .from("room_summary_settings")
    .select("room_id, receipt_report_store_partition_key")
    .eq("chat_group_id", groupId)
    .limit(2)
  if (error) throw { status: 500, message: `メディア対象ルームの確認に失敗しました: ${error.message}` } satisfies AppError
  const rooms = Array.isArray(data)
    ? data.map((row) => ({
      roomId: String(row?.room_id ?? "").trim(),
      storeKey: String(row?.receipt_report_store_partition_key ?? "").trim() || null,
    })).filter((row) => row.roomId)
    : []
  return rooms.length === 1 ? rooms[0] : null
}

async function archiveChatMedia(
  req: Request,
  workReq: Request,
  supabase: ReturnType<typeof createClient<any>>,
): Promise<Record<string, unknown>> {
  const body = await parseJson(workReq)
  if (!isRecord(body)) throw { status: 400, message: "Invalid JSON body." } satisfies AppError
  const groupId = Number(body.group_id)
  const messageId = Number(body.message_id)
  if (!Number.isSafeInteger(groupId) || groupId <= 0 || !Number.isSafeInteger(messageId) || messageId <= 0) {
    throw { status: 400, message: "group_id and message_id are required." } satisfies AppError
  }
  const userId = await authenticateChatMember(req, supabase, groupId, "send")
  const { data: message, error: messageError } = await supabase
    .from("chat_messages")
    .select("id, group_id, user_id, username, kind, payload")
    .eq("id", messageId)
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle()
  if (messageError) throw { status: 500, message: `送信画像の確認に失敗しました: ${messageError.message}` } satisfies AppError
  if (!message || String(message.kind ?? "") !== "image") {
    throw { status: 404, message: "送信した画像が見つかりません。" } satisfies AppError
  }
  const image = isRecord(message.payload) && isRecord(message.payload.image) ? message.payload.image : null
  const imagePath = String(image?.path ?? "").trim()
  if (!imagePath || !imagePath.startsWith(`groups/${groupId}/`)) {
    throw { status: 400, message: "画像保存先が不正です。" } satisfies AppError
  }
  const room = await resolveChatMediaRoom(supabase, groupId)
  if (!room) return { saved: false, reason: "not_linked_room" }
  await requireMtalkRoomStoreBinding(supabase, userId, groupId, room.storeKey)
  const { data: blob, error: downloadError } = await supabase.storage.from("chat-images").download(imagePath)
  if (downloadError || !blob) {
    throw { status: 500, message: `送信画像の取得に失敗しました: ${downloadError?.message ?? "unknown error"}` } satisfies AppError
  }
  const result = await saveMediaBytesToLibrary(supabase, {
    roomId: room.roomId,
    lineMessageId: `mtalk-${groupId}-${messageId}`,
    userId,
    senderDisplayName: String(message.username ?? "").trim() || null,
    mediaType: "image",
    storeKey: room.storeKey,
    fileName: null,
    contentType: blob.type || "image/jpeg",
    bytes: new Uint8Array(await blob.arrayBuffer()),
  })
  if (!result.saved && result.reason !== "already_saved") {
    throw { status: 500, message: `メディアライブラリへの保存に失敗しました: ${result.reason ?? "unknown error"}` } satisfies AppError
  }
  return { saved: true, room_id: room.roomId }
}

const MTALK_MENU_DRAFT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function mtalkMenuKnowledgeImageFileName(sourceMessageId: unknown, mimeType: string): string {
  const extension = new Map<string, string>([
    ["image/png", "png"],
    ["image/webp", "webp"],
    ["image/gif", "gif"],
    ["image/heic", "heic"],
    ["image/heif", "heif"],
  ]).get(String(mimeType || "").toLowerCase()) || "jpg"
  return `mtalk_menu_${toNonNegativeInteger(sourceMessageId) || "image"}.${extension}`
}

async function updateChatMenuKnowledgeCard(
  supabase: ReturnType<typeof createClient<any>>,
  draft: Record<string, unknown>,
  status: "registered" | "declined" | "failed",
  analysis: NonNullable<ReturnType<typeof normalizeMtalkMenuKnowledgeAnalysis>>,
  documentId: number | null = null,
): Promise<void> {
  const cardMessageId = toNonNegativeInteger(draft.card_message_id)
  const groupId = toNonNegativeInteger(draft.group_id)
  if (!cardMessageId || !groupId) return
  const draftId = toSafeString(draft.id)
  const card = buildMtalkMenuKnowledgeCard({ draftId, analysis, status, documentId })
  const content = status === "registered"
    ? `メニュー資料を登録しました: ${analysis.title}`
    : status === "declined"
    ? `今回はメニュー資料へ登録しませんでした: ${analysis.title}`
    : `メニュー資料の登録に失敗しました: ${analysis.title}`
  const bot = await loadMtalkStoreBot(supabase, toSafeString(draft.store_partition_key))
  if (!bot) {
    console.warn("chat menu card replacement skipped: store bot is missing")
    return
  }
  // chat_guard_message_edit intentionally freezes card payloads, including for
  // service-role calls. Preserve that invariant: insert the resolved card first,
  // repoint the draft, then remove the old interactive card.
  const { data: replacement, error: insertError } = await supabase
    .from("chat_messages")
    .insert({
      group_id: groupId,
      user_id: bot.id,
      username: bot.username,
      content: content.slice(0, 2000),
      kind: "card",
      payload: { v: 1, kind: "menu_knowledge_draft", cards: [card] },
    })
    .select("id")
    .single()
  if (insertError || !toNonNegativeInteger(replacement?.id)) {
    console.warn("chat menu card replacement failed:", insertError?.message || "missing message id")
    return
  }
  const replacementId = toNonNegativeInteger(replacement.id)
  const { error: draftError } = await supabase
    .from("chat_menu_knowledge_drafts")
    .update({ card_message_id: replacementId, updated_at: new Date().toISOString() })
    .eq("id", draftId)
    .eq("group_id", groupId)
  if (draftError) {
    console.warn("chat menu draft card pointer update failed:", draftError.message)
    return
  }
  const { error: deleteError } = await supabase
    .from("chat_messages")
    .delete()
    .eq("id", cardMessageId)
    .eq("group_id", groupId)
    .eq("kind", "card")
  if (deleteError) console.warn("old chat menu card removal failed:", deleteError.message)
}

async function postChatMenuKnowledgeDecisionReply(
  supabase: ReturnType<typeof createClient<any>>,
  groupId: number,
  storeKey: string,
  text: string,
): Promise<void> {
  const bot = await loadMtalkStoreBot(supabase, storeKey)
  if (!bot) return
  const { error } = await supabase.from("chat_messages").insert({
    group_id: groupId,
    user_id: bot.id,
    username: bot.username,
    content: text.slice(0, 2000),
    kind: "text",
  })
  if (error) console.warn("chat menu decision reply failed:", error.message)
}

async function decideChatMenuKnowledge(
  req: Request,
  workReq: Request,
  supabase: ReturnType<typeof createClient<any>>,
): Promise<Record<string, unknown>> {
  const body = await parseJson(workReq)
  if (!isRecord(body)) throw { status: 400, message: "Invalid JSON body." } satisfies AppError
  const groupId = toNonNegativeInteger(body.group_id)
  const draftId = toSafeString(body.draft_id).trim().toLowerCase()
  const decision = toSafeString(body.decision).trim().toLowerCase()
  if (!groupId || !MTALK_MENU_DRAFT_UUID_RE.test(draftId) || !["register", "decline"].includes(decision)) {
    throw { status: 400, message: "group_id, draft_id and decision are required." } satisfies AppError
  }
  const userId = await authenticateChatMember(req, supabase, groupId, "send")
  const room = await resolveMtalkRoomStoreKey(supabase, groupId)
  if (!room.storeKey || room.ambiguous) {
    throw { status: 403, message: "このトークの店舗を一意に確認できません。" } satisfies AppError
  }
  const storeKey = await requireMtalkRoomStoreBinding(supabase, userId, groupId, room.storeKey)

  const { data: rawDraft, error: draftError } = await supabase
    .from("chat_menu_knowledge_drafts")
    .select("*")
    .eq("id", draftId)
    .eq("group_id", groupId)
    .maybeSingle()
  if (draftError) {
    throw { status: 500, message: `解析下書きの確認に失敗しました: ${draftError.message}` } satisfies AppError
  }
  const draft = isRecord(rawDraft) ? rawDraft : null
  if (!draft || toSafeString(draft.store_partition_key).toLowerCase() !== storeKey.toLowerCase()) {
    throw { status: 404, message: "メニュー解析の下書きが見つかりません。" } satisfies AppError
  }
  if (toSafeString(draft.requested_by) !== userId) {
    throw { status: 403, message: "このメニュー解析を操作できるのは画像の投稿者本人だけです。" } satisfies AppError
  }
  const analysis = normalizeMtalkMenuKnowledgeAnalysis(draft.analysis)
  if (!analysis) {
    throw { status: 422, message: "メニュー解析結果が不完全なため登録できません。" } satisfies AppError
  }
  const currentStatus = toSafeString(draft.status)
  if (currentStatus === "registered") {
    return {
      ok: true,
      status: "registered",
      document_id: toNonNegativeInteger(draft.result_document_id),
      already_resolved: true,
    }
  }
  if (currentStatus === "declined") {
    return { ok: true, status: "declined", already_resolved: true }
  }
  if (new Date(toSafeString(draft.expires_at)).getTime() <= Date.now()) {
    throw { status: 410, message: "この確認は期限切れです。画像をもう一度送信してください。" } satisfies AppError
  }

  if (decision === "decline") {
    const now = new Date().toISOString()
    const { data: resolved, error } = await supabase
      .from("chat_menu_knowledge_drafts")
      .update({
        status: "declined",
        resolved_by: userId,
        resolved_at: now,
        updated_at: now,
        last_error: null,
      })
      .eq("id", draftId)
      .in("status", ["pending", "failed"])
      .select("id")
      .maybeSingle()
    if (error) throw { status: 500, message: `見送り処理に失敗しました: ${error.message}` } satisfies AppError
    if (!resolved) return { ok: true, status: currentStatus, already_resolved: true }
    const updatedDraft = { ...draft, status: "declined", resolved_by: userId }
    await updateChatMenuKnowledgeCard(supabase, updatedDraft, "declined", analysis)
    await postChatMenuKnowledgeDecisionReply(
      supabase,
      groupId,
      storeKey,
      `今回は「${analysis.title}」を店舗資料へ登録しませんでした。画像はM-talkのメディアには残ります。`,
    )
    return { ok: true, status: "declined" }
  }

  const claimTime = new Date().toISOString()
  const { data: claimed, error: claimError } = await supabase
    .from("chat_menu_knowledge_drafts")
    .update({
      status: "registering",
      resolved_by: userId,
      updated_at: claimTime,
      last_error: null,
    })
    .eq("id", draftId)
    .in("status", ["pending", "failed"])
    .select("id")
    .maybeSingle()
  if (claimError) throw { status: 500, message: `登録開始に失敗しました: ${claimError.message}` } satisfies AppError
  if (!claimed) {
    throw { status: 409, message: "このメニュー資料は別の操作で処理中です。" } satisfies AppError
  }

  let uploadedPath = ""
  let persistedDocumentId = 0
  try {
    const imagePath = toSafeString(draft.image_storage_path).trim()
    if (!imagePath.startsWith(`groups/${groupId}/`)) {
      throw { status: 400, message: "画像保存先が不正です。" } satisfies AppError
    }
    const { data: blob, error: downloadError } = await supabase.storage
      .from("chat-images")
      .download(imagePath)
    if (downloadError || !blob) {
      throw { status: 500, message: "元画像を取得できませんでした。" } satisfies AppError
    }
    const bytes = new Uint8Array(await blob.arrayBuffer())
    if (!bytes.length || bytes.length > STORE_KNOWLEDGE_MAX_FILE_BYTES) {
      throw { status: 400, message: "元画像のサイズが資料登録の上限外です。" } satisfies AppError
    }
    const digest = await crypto.subtle.digest("SHA-256", bytes)
    const sha256Hex = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
    const { data: duplicate, error: duplicateError } = await supabase
      .from("store_knowledge_documents")
      .select("id")
      .ilike("store_partition_key", storeKnowledgeStoreKeyPattern(storeKey))
      .eq("sha256_hex", sha256Hex)
      .eq("is_active", true)
      .maybeSingle()
    if (duplicateError) {
      throw { status: 500, message: `重複確認に失敗しました: ${duplicateError.message}` } satisfies AppError
    }
    let documentId = toNonNegativeInteger(duplicate?.id)
    if (!documentId) {
      const sourceFileName = imagePath.split("/").at(-1) || `mtalk_menu_${draft.source_message_id}.jpg`
      const mimeType = normalizeStoreKnowledgeUploadMime(
        sourceFileName,
        toSafeString(draft.image_mime_type) || blob.type || "image/jpeg",
      )
      const knowledgeFileName = mtalkMenuKnowledgeImageFileName(draft.source_message_id, mimeType)
      const safetyError = await validateStoreKnowledgePayloadSafety("image", bytes)
      if (safetyError) throw { status: 400, message: safetyError } satisfies AppError
      uploadedPath = `${normalizeStoreKnowledgeStoreKey(storeKey)}/${sha256Hex.slice(0, 12)}_${Date.now()}_${knowledgeFileName}`
      const { error: uploadError } = await supabase.storage
        .from(STORE_KNOWLEDGE_BUCKET)
        .upload(uploadedPath, bytes, { contentType: mimeType, upsert: false })
      if (uploadError) {
        throw { status: 500, message: `画像原本の保存に失敗しました: ${uploadError.message}` } satisfies AppError
      }
      const { data: actor } = await supabase
        .from("chat_users")
        .select("username")
        .eq("id", userId)
        .maybeSingle()
      const saved = await saveStoreKnowledge(supabase as unknown as ReturnType<typeof createClient>, {
        store_key: storeKey,
        category: "メニュー",
        title: analysis.title,
        summary: analysis.summary,
        body_text: analysis.body_text,
        tags: ["M-talk投稿", "AI画像解析", ...analysis.tags],
        storage_bucket: STORE_KNOWLEDGE_BUCKET,
        storage_path: uploadedPath,
        original_file_name: knowledgeFileName,
        mime_type: mimeType,
        file_size_bytes: bytes.length,
        sha256_hex: sha256Hex,
        source_type: "line_post",
        created_by: `${toSafeString(actor?.username) || "M-talk"}（M-talk）`,
      }, null, true)
      documentId = toNonNegativeInteger(saved.id)
    }
    if (!documentId) throw { status: 500, message: "資料IDを確認できませんでした。" } satisfies AppError
    // From this point the document is durable. Never remove its Storage object from
    // the error path even if synchronizing the M-talk draft/card later fails.
    persistedDocumentId = documentId

    const resolvedAt = new Date().toISOString()
    const { error: resolvedError } = await supabase
      .from("chat_menu_knowledge_drafts")
      .update({
        status: "registered",
        result_document_id: documentId,
        resolved_by: userId,
        resolved_at: resolvedAt,
        updated_at: resolvedAt,
        last_error: null,
      })
      .eq("id", draftId)
      .eq("status", "registering")
    if (resolvedError) {
      throw { status: 500, message: `登録結果の保存に失敗しました: ${resolvedError.message}` } satisfies AppError
    }
    const updatedDraft = { ...draft, status: "registered", result_document_id: documentId }
    await updateChatMenuKnowledgeCard(supabase, updatedDraft, "registered", analysis, documentId)
    await postChatMenuKnowledgeDecisionReply(
      supabase,
      groupId,
      storeKey,
      `✅ 「${analysis.title}」を店舗ナレッジ（資料）へ登録しました。Journal Reportの「資料」から確認できます。`,
    )
    return { ok: true, status: "registered", document_id: documentId }
  } catch (error) {
    if (uploadedPath && !persistedDocumentId) {
      await supabase.storage.from(STORE_KNOWLEDGE_BUCKET).remove([uploadedPath]).catch(() => {})
    }
    const appError = asAppError(error)
    const failedAt = new Date().toISOString()
    await supabase
      .from("chat_menu_knowledge_drafts")
      .update({
        status: "failed",
        result_document_id: persistedDocumentId || null,
        updated_at: failedAt,
        last_error: appError.message.slice(0, 1000),
      })
      .eq("id", draftId)
      .eq("status", "registering")
    await updateChatMenuKnowledgeCard(supabase, draft, "failed", analysis)
    throw appError
  }
}

/**
 * M-talk の1対1から、ジャーナルレポートへ入るためのワンタイムログインリンクを出す。
 *
 * 発行トークンには専用scopeを付け、専用交換APIで30分の短命セッションへ交換する。
 * 保存済み売上・商品分析・AI以外の予約、資料、店舗設定、書込APIには利用できない。
 *
 * 条件は M-talk 側と揃える。1対1であること、その部屋の参加者であること、
 * 店舗Botがいて店舗が一意に決まること。
 */
async function issueChatJournalLoginLink(
  req: Request,
  workReq: Request,
  supabase: ReturnType<typeof createClient<any>>,
): Promise<Record<string, unknown>> {
  const body = await parseJson(workReq)
  const groupId = Number(isRecord(body) ? body.group_id : 0)
  if (!Number.isSafeInteger(groupId) || groupId <= 0) {
    throw { status: 400, message: "group_id is required." } satisfies AppError
  }
  const userId = await authenticateChatMember(req, supabase, groupId, "journal_ai")

  // 売上の質問と回答が他の人間に見えるのを避けたいだけなので、判定は
  // is_direct フラグ（自動作成のDMかどうか）ではなく「人間メンバーが
  // 自分1人だけか」で行う。利用者が自分でBotを招待して作った2人部屋
  // （is_direct=false）も、参加している人間は自分だけなら同じ条件を満たす。
  const { data: memberRows, error: memberError } = await supabase
    .from("chat_group_members")
    .select("user_id, chat_users!inner(is_bot, bot_deleted_at)")
    .eq("group_id", groupId)
  if (memberError) {
    throw { status: 500, message: `Failed to load room members: ${memberError.message}` } satisfies AppError
  }
  const humanMemberIds = (Array.isArray(memberRows) ? memberRows : [])
    .filter((row) => (
      (row as { chat_users?: { is_bot?: unknown } }).chat_users?.is_bot !== true
    ))
    .map((row) => String((row as { user_id?: unknown }).user_id ?? ""))
  if (humanMemberIds.length !== 1 || humanMemberIds[0] !== userId) {
    throw {
      status: 403,
      message: "電子ジャーナルへの質問は、自分以外の人がいないトークでのみ使えます。",
    } satisfies AppError
  }

  const resolved = await resolveMtalkRoomStoreKey(supabase, groupId)
  if (!resolved.storeKey) {
    throw {
      status: 403,
      message: resolved.ambiguous
        ? "このトークには店舗Botが複数いるため、どの店舗か決められません。"
        : "このトークには店舗Botがいないため、電子ジャーナルへ質問できません。",
    } satisfies AppError
  }
  await requireMtalkStoreAccess(supabase, userId, resolved.storeKey)

  const issued = await issueAdminDashboardLoginLinkToken(supabase, {
    scope: CHAT_JOURNAL_AI_SCOPE,
    store_partition_key: resolved.storeKey,
    chat_user_id: userId,
    group_id: String(groupId),
    issued_via: "mtalk_journal_ai",
  }, { ttlSeconds: 5 * 60 })
  return {
    login_token: issued.token,
    expires_at: issued.expires_at,
    store_key: resolved.storeKey,
  }
}

async function exchangeChatJournalLoginLink(
  workReq: Request,
  supabase: ReturnType<typeof createClient<any>>,
): Promise<Record<string, unknown>> {
  const body = await parseJson(workReq)
  const loginToken = String(isRecord(body) ? body.login_token ?? "" : "").trim()
  if (!loginToken) throw { status: 400, message: "login_token is required." } satisfies AppError
  const issued = await exchangeAdminDashboardLoginLinkToken(supabase, loginToken, {
    rememberLogin: false,
    ttlSeconds: 30 * 60,
    requiredScopes: [CHAT_JOURNAL_AI_SCOPE],
    metadata: { exchanged_via: "chat_journal_ai" },
  })
  const session = await authenticateAdminDashboardSessionToken(supabase, issued.token)
  const groupId = Number(session.metadata.group_id)
  const chatUserId = String(session.metadata.chat_user_id ?? "").trim()
  const accessStillValid = session.ok && await validateChatScopedSessionAccess(
    supabase,
    session.metadata,
    { requireJournalAi: true },
  )
  if (
    !session.ok ||
    !accessStillValid ||
    session.scopeKind !== CHAT_JOURNAL_AI_SCOPE ||
    !session.storeScope ||
    !Number.isSafeInteger(groupId) ||
    groupId <= 0 ||
    !chatUserId
  ) {
    await revokeAdminDashboardSessionToken(supabase, issued.token)
    throw { status: 401, message: "このリンクは電子ジャーナルAI用ではありません。" } satisfies AppError
  }
  return {
    session_token: issued.token,
    expires_at: issued.expires_at,
    store_key: session.storeScope,
    group_id: groupId,
  }
}

async function issueChatMediaViewLink(req: Request, workReq: Request, supabase: ReturnType<typeof createClient<any>>): Promise<Record<string, unknown>> {
  const body = await parseJson(workReq)
  const groupId = Number(isRecord(body) ? body.group_id : 0)
  if (!Number.isSafeInteger(groupId) || groupId <= 0) throw { status: 400, message: "group_id is required." } satisfies AppError
  const userId = await authenticateChatMember(req, supabase, groupId, "view")
  const room = await resolveChatMediaRoom(supabase, groupId)
  if (!room) throw { status: 404, message: "このトークには対応するBotメディアが設定されていません。" } satisfies AppError
  await requireMtalkRoomStoreBinding(supabase, userId, groupId, room.storeKey)
  const issued = await issueAdminDashboardLoginLinkToken(supabase, {
    scope: CHAT_MEDIA_VIEW_SCOPE, group_id: String(groupId), room_id: room.roomId, store_partition_key: room.storeKey, chat_user_id: userId, capabilities: ["media_read"],
  }, { ttlSeconds: 5 * 60 })
  return { login_token: issued.token, expires_at: issued.expires_at }
}

async function exchangeChatMediaViewLink(workReq: Request, supabase: ReturnType<typeof createClient<any>>): Promise<Record<string, unknown>> {
  const body = await parseJson(workReq)
  const loginToken = String(isRecord(body) ? body.login_token ?? "" : "").trim()
  if (!loginToken) throw { status: 400, message: "login_token is required." } satisfies AppError
  const issued = await exchangeAdminDashboardLoginLinkToken(supabase, loginToken, {
    rememberLogin: false,
    ttlSeconds: 15 * 60,
    requiredScopes: [CHAT_MEDIA_VIEW_SCOPE],
  })
  const session = await authenticateAdminDashboardSessionToken(supabase, issued.token)
  const accessStillValid = session.ok && await validateChatScopedSessionAccess(supabase, session.metadata)
  if (!session.ok || !accessStillValid || session.scopeKind !== CHAT_MEDIA_VIEW_SCOPE || !session.roomScope || !session.storeScope) {
    await revokeAdminDashboardSessionToken(supabase, issued.token)
    throw { status: 401, message: "このリンクはM-talkメディア閲覧用ではありません。" } satisfies AppError
  }
  return { session_token: issued.token, expires_at: issued.expires_at }
}

async function fetchChatMediaView(req: Request, supabase: ReturnType<typeof createClient<any>>, url: URL): Promise<Record<string, unknown>> {
  const session = await authenticateAdminDashboardSessionToken(supabase, String(req.headers.get("x-admin-token") ?? "").trim())
  const accessStillValid = session.ok && await validateChatScopedSessionAccess(supabase, session.metadata)
  if (!session.ok || !accessStillValid || session.scopeKind !== CHAT_MEDIA_VIEW_SCOPE || !session.roomScope || !session.storeScope) {
    throw { status: 401, message: "メディア閲覧リンクが無効または期限切れです。" } satisfies AppError
  }
  const limit = clampInt(url.searchParams.get("limit"), 24, 1, 60)
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, 1000000)
  const mediaType = normalizeMediaType(url.searchParams.get("media_type"))
  let query = supabase
    .from("line_message_media")
    .select(
      "id, message_id, line_message_id, room_id, user_id, sender_display_name, media_type, storage_bucket, storage_path, original_file_name, mime_type, file_size_bytes, content_preview, created_at",
      { count: "exact" },
    )
    .eq("room_id", session.roomScope)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)
  if (mediaType) query = query.eq("media_type", mediaType)
  const { data, error, count } = await query
  if (error) throw { status: 500, message: `メディアの取得に失敗しました: ${error.message}` } satisfies AppError
  const rows = Array.isArray(data) ? data.map(normalizeMediaListRow).filter((row): row is MediaListRow => row !== null) : []
  // M-talk経由でも通常のメディア閲覧と同じ表示情報を返す。保存済みの
  // sender_display_name が空の場合だけ user_id から補完し、別店舗・別ルームは
  // ここへ混ぜない（上の room_id 完全一致を維持する）。
  const [roomNameMap, senderNameMap] = await Promise.all([
    fetchRoomNameMapForIds(supabase as ReturnType<typeof createClient>, rows.map((row) => row.room_id)),
    fetchSenderNameMapForUserIds(
      supabase as ReturnType<typeof createClient>,
      rows.filter((row) => !row.sender_display_name && row.user_id).map((row) => String(row.user_id)),
    ),
  ])
  const items = await Promise.all(rows.map(async (row) => ({
    ...row,
    room_name: roomNameMap.get(row.room_id) ?? row.room_name ?? null,
    sender_display_name: row.sender_display_name
      ?? (row.user_id ? senderNameMap.get(String(row.user_id)) ?? null : null),
    signed_url: await createSignedMediaUrl(supabase as ReturnType<typeof createClient>, row.storage_bucket, row.storage_path),
  })))
  const total = Number(count ?? items.length)
  return { items, total, has_more: offset + items.length < total, generated_at: new Date().toISOString() }
}

function slimChatScheduleReservation(item: Record<string, unknown>): Record<string, unknown> {
  const parsed = parseReservationCalendarDetail(toSafeString(item.reservation_detail))
  const anniversaryLabel = normalizeCalendarText(
    parsed?.anniversary ?? parsed?.birthday ?? parsed?.celebration ?? parsed?.occasion,
    120,
  ) || ""
  const requestNoteLabel = normalizeCalendarText(
    parsed?.requestNote ?? parsed?.request_note ?? parsed?.notes ?? parsed?.note,
    160,
  ) || ""
  const dislikesLabel = normalizeCalendarText(parsed?.dislikes, 120) || ""
  return {
    source: item.source ?? null,
    id: item.id ?? null,
    visit_at: item.visit_at ?? null,
    customer_name: item.customer_name_label || item.customer_name || "",
    customer_phone: item.customer_phone || "",
    visit_time_label: item.visit_time_label || "",
    party_size_label: item.party_size_label || "",
    plan_label: item.plan_label || "",
    allergy_label: item.allergy_label || "",
    anniversary_label: anniversaryLabel,
    request_note_label: requestNoteLabel,
    dislikes_label: dislikesLabel,
    route_label: item.route_label || "",
    store_name: item.store_name || "",
    visit_count: Number(item.visit_count) || 0,
  }
}

async function listChatScheduleRoomIds(
  supabase: ReturnType<typeof createClient>,
  groupId: number,
  storeKey: string | null,
): Promise<Set<string>> {
  const roomIds = new Set<string>()
  const mtalkRoomId = mtalkSyntheticRoomId(groupId)
  if (mtalkRoomId) roomIds.add(mtalkRoomId)
  if (storeKey) {
    const { data: rooms, error: roomsError } = await supabase
      .from("room_summary_settings")
      .select("room_id")
      .eq("receipt_report_store_partition_key", storeKey)
    if (roomsError) {
      throw { status: 500, message: `Failed to load linked rooms: ${roomsError.message}` } satisfies AppError
    }
    for (const row of rooms || []) {
      const roomId = String((row as { room_id?: string }).room_id ?? "").trim()
      if (roomId) roomIds.add(roomId)
    }
  }
  return roomIds
}

async function requireChatScheduleMember(
  req: Request,
  url: URL,
  supabase: ReturnType<typeof createClient>,
  body?: Record<string, unknown> | null,
  capability: "view" | "send" | "manage" = "view",
): Promise<{ groupId: number; storeKey: string | null; ambiguous: boolean; roomName: string | null }> {
  const groupId = Number(body?.group_id ?? url.searchParams.get("group_id") ?? "")
  if (!Number.isSafeInteger(groupId) || groupId <= 0) {
    throw { status: 400, message: "group_id is required." } satisfies AppError
  }
  const userId = await authenticateChatMember(req, supabase, groupId, capability)
  const resolved = await resolveMtalkRoomStoreKey(supabase, groupId)
  if (resolved.storeKey) {
    await requireMtalkStoreAccess(supabase, userId, resolved.storeKey)
  }
  return {
    groupId,
    storeKey: resolved.storeKey,
    ambiguous: Boolean(resolved.ambiguous),
    roomName: resolved.roomName ?? null,
  }
}

function requireChatScheduleStoreKey(ctx: { storeKey: string | null; ambiguous: boolean }): string {
  if (ctx.storeKey) return ctx.storeKey
  throw {
    status: 400,
    message: ctx.ambiguous
      ? "複数店舗のBotがいるため、予約を編集できません。"
      : "このルームに紐づく店舗予約がありません。",
  } satisfies AppError
}

function buildChatScheduleReservationDetail(
  body: Record<string, unknown>,
  existing: Record<string, unknown> | null,
): string {
  const detail: Record<string, unknown> = existing ? { ...existing } : {
    route: "手入力",
    reservationSite: "手入力",
  }
  const assign = (key: string, value: string) => {
    if (value) detail[key] = value
    else delete detail[key]
  }
  assign("customerName", toSafeString(body.customer_name))
  assign("partySize", toSafeString(body.party_size_label || body.party_size))
  assign("plan", toSafeString(body.plan_label || body.plan))
  assign("allergy", toSafeString(body.allergy_label || body.allergy))
  assign("anniversary", toSafeString(body.anniversary_label || body.anniversary))
  assign("requestNote", toSafeString(body.request_note_label || body.request_note))
  assign("dislikes", toSafeString(body.dislikes_label || body.dislikes))
  const visitAt = normalizeReservationVisitAtIso(body.visit_at)
  if (visitAt) {
    const time = buildCalendarVisitTimeLabel(null, visitAt)
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(visitAt))
    detail.visitDateTime = time ? `${day} ${time}` : day
  }
  if (!toSafeString(detail.route)) detail.route = "手入力"
  return JSON.stringify(detail)
}

async function parseChatScheduleBody(req: Request, workReq: Request): Promise<Record<string, unknown>> {
  if (req.method === "DELETE") return {}
  const body = await parseJson(workReq)
  if (!isRecord(body)) {
    throw { status: 400, message: "Invalid JSON body." } satisfies AppError
  }
  return body
}

async function handleChatSchedule(
  req: Request,
  url: URL,
  supabase: ReturnType<typeof createClient>,
): Promise<Response> {
  const ctx = await requireChatScheduleMember(req, url, supabase)
  const month = normalizeCalendarMonthParam(url.searchParams.get("month"))
  const storeKey = ctx.storeKey
  let reservations: Array<Record<string, unknown>> = []
  if (storeKey) {
    const calendarUrl = new URL("https://mtalk.local/reservations/calendar")
    calendarUrl.searchParams.set("month", month)
    calendarUrl.searchParams.set("store_key", storeKey)
    calendarUrl.searchParams.set("source", "all")
    const calendar = await fetchReservationCalendarState(supabase, calendarUrl)
    const items = Array.isArray(calendar.items) ? calendar.items : []
    reservations = items
      .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
      .map((row) => slimChatScheduleReservation(row))
  }

  const range = buildJstMonthRange(month)
  const roomIds = await listChatScheduleRoomIds(supabase, ctx.groupId, storeKey)
  let events: Array<Record<string, unknown>> = []
  if (roomIds.size > 0) {
    const { data, error } = await supabase
      .from("line_room_calendar_events")
      .select("id, room_id, event_title, event_description, starts_at, ends_at, source")
      .in("room_id", [...roomIds])
      .gte("starts_at", range.startIso)
      .lt("starts_at", range.endIso)
      .order("starts_at", { ascending: true })
      .limit(2000)
    if (error) {
      throw { status: 500, message: `Failed to load calendar events: ${error.message}` } satisfies AppError
    }
    events = (data || []).map((row: Record<string, unknown>) => ({
      id: row.id ?? null,
      title: String(row.event_title ?? "").trim(),
      description: String(row.event_description ?? "").trim(),
      starts_at: row.starts_at ?? null,
      ends_at: row.ends_at ?? null,
      source: String(row.source ?? "").trim(),
    }))
  }

  let reservationNote: string | null = null
  if (!storeKey) {
    reservationNote = ctx.ambiguous
      ? "複数店舗のBotがいるため、予約を表示できません。"
      : "このルームに紐づく店舗予約がありません。"
  }

  return json({
    group_id: ctx.groupId,
    room_name: ctx.roomName,
    store_key: storeKey,
    month,
    reservation_available: Boolean(storeKey),
    reservation_note: reservationNote,
    reservations,
    events,
  }, 200)
}

async function handleChatScheduleReservation(
  req: Request,
  workReq: Request,
  url: URL,
  supabase: ReturnType<typeof createClient>,
): Promise<Response> {
  const body = await parseChatScheduleBody(req, workReq)
  const ctx = await requireChatScheduleMember(req, url, supabase, body, "manage")
  const storeKey = requireChatScheduleStoreKey(ctx)

  if (req.method === "POST") {
    const visitAt = normalizeReservationVisitAtIso(body.visit_at)
    if (!visitAt) throw { status: 400, message: "来店日時を入力してください。" } satisfies AppError
    const name = toSafeString(body.customer_name)
    if (!name) throw { status: 400, message: "予約者名を入力してください。" } satisfies AppError
    const result = await createManualReservationEvent(supabase, {
      customer_name: name,
      customer_phone: toSafeString(body.customer_phone),
      visit_at: visitAt,
      reservation_type: toSafeString(body.reservation_type) || "unknown",
      reservation_detail: buildChatScheduleReservationDetail(body, null),
      manual_store_key: storeKey,
    }, storeKey)
    return json(result, 200)
  }

  const source = toSafeString(body.source || url.searchParams.get("source"))
  const id = Number(body.id ?? url.searchParams.get("id") ?? "")
  if (!reservationEventTableForSource(source) || !Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: "予約を特定できません。" } satisfies AppError
  }

  if (req.method === "DELETE" || body.cancel === true || body.manual_hidden === true) {
    const result = await updateReservationEvent(supabase, {
      source,
      id,
      manual_hidden: true,
      manual_hidden_reason: "cancel",
    }, storeKey)
    return json({ ...result, cancelled: true }, 200)
  }

  if (req.method !== "PATCH") {
    throw { status: 405, message: "Method not allowed." } satisfies AppError
  }

  const visitAt = normalizeReservationVisitAtIso(body.visit_at)
  if (!visitAt) throw { status: 400, message: "来店日時を入力してください。" } satisfies AppError
  const name = toSafeString(body.customer_name)
  if (!name) throw { status: 400, message: "予約者名を入力してください。" } satisfies AppError
  const table = reservationEventTableForSource(source)
  if (!table) throw { status: 400, message: "予約を特定できません。" } satisfies AppError
  const existing = await fetchReservationEventRecordForScopeCheck(supabase, table, id)
  const existingDetail = parseReservationCalendarDetail(toSafeString(existing.reservation_detail))
  const patch: Record<string, unknown> = {
    source,
    id,
    customer_name: name,
    customer_phone: toSafeString(body.customer_phone),
    visit_at: visitAt,
    reservation_detail: buildChatScheduleReservationDetail(body, existingDetail),
    manual_store_key: storeKey,
  }
  if (toSafeString(body.reservation_type)) patch.reservation_type = toSafeString(body.reservation_type)
  const result = await updateReservationEvent(supabase, patch, storeKey)
  return json(result, 200)
}

async function handleChatScheduleEvent(
  req: Request,
  workReq: Request,
  url: URL,
  supabase: ReturnType<typeof createClient>,
): Promise<Response> {
  const body = await parseChatScheduleBody(req, workReq)
  const ctx = await requireChatScheduleMember(req, url, supabase, body, "manage")
  const mtalkRoomId = mtalkSyntheticRoomId(ctx.groupId)
  if (!mtalkRoomId) {
    throw { status: 400, message: "ルームが指定されていません。" } satisfies AppError
  }
  const roomIds = await listChatScheduleRoomIds(supabase, ctx.groupId, ctx.storeKey)

  if (req.method === "POST") {
    await ensureMtalkRoomSettings(supabase, ctx.groupId)
    const title = toSafeString(body.title).slice(0, 120)
    if (!title) throw { status: 400, message: "予定の内容を入力してください。" } satisfies AppError
    const startsAt = normalizeReservationVisitAtIso(body.starts_at)
    if (!startsAt) throw { status: 400, message: "開始日時を入力してください。" } satisfies AppError
    const endsAt = body.ends_at ? normalizeReservationVisitAtIso(body.ends_at) : null
    if (body.ends_at && !endsAt) throw { status: 400, message: "終了日時が不正です。" } satisfies AppError
    if (endsAt && Date.parse(endsAt) < Date.parse(startsAt)) {
      throw { status: 400, message: "終了日時は開始日時より後にしてください。" } satisfies AppError
    }
    const { data, error } = await supabase
      .from("line_room_calendar_events")
      .insert({
        room_id: mtalkRoomId,
        event_title: title,
        event_description: toSafeString(body.description).slice(0, 500),
        starts_at: startsAt,
        ends_at: endsAt,
        source: "mtalk",
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single()
    if (error) {
      throw { status: 500, message: `Failed to create event: ${error.message}` } satisfies AppError
    }
    return json({ ok: true, id: (data as { id?: number } | null)?.id ?? null }, 200)
  }

  const id = Number(body.id ?? url.searchParams.get("id") ?? "")
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: "予定を特定できません。" } satisfies AppError
  }
  const { data: existing, error: loadError } = await supabase
    .from("line_room_calendar_events")
    .select("id, room_id")
    .eq("id", id)
    .maybeSingle()
  if (loadError) {
    throw { status: 500, message: `Failed to load event: ${loadError.message}` } satisfies AppError
  }
  const roomId = toSafeString((existing as { room_id?: string } | null)?.room_id)
  if (!isRecord(existing) || !roomId || !roomIds.has(roomId)) {
    throw { status: 404, message: "対象の予定が見つかりません。" } satisfies AppError
  }

  if (req.method === "DELETE" || body.cancel === true) {
    const { error } = await supabase.from("line_room_calendar_events").delete().eq("id", id)
    if (error) {
      throw { status: 500, message: `Failed to delete event: ${error.message}` } satisfies AppError
    }
    return json({ ok: true, id, cancelled: true }, 200)
  }

  if (req.method !== "PATCH") {
    throw { status: 405, message: "Method not allowed." } satisfies AppError
  }

  const title = toSafeString(body.title).slice(0, 120)
  if (!title) throw { status: 400, message: "予定の内容を入力してください。" } satisfies AppError
  const startsAt = normalizeReservationVisitAtIso(body.starts_at)
  if (!startsAt) throw { status: 400, message: "開始日時を入力してください。" } satisfies AppError
  const endsAt = body.ends_at ? normalizeReservationVisitAtIso(body.ends_at) : null
  if (body.ends_at && !endsAt) throw { status: 400, message: "終了日時が不正です。" } satisfies AppError
  if (endsAt && Date.parse(endsAt) < Date.parse(startsAt)) {
    throw { status: 400, message: "終了日時は開始日時より後にしてください。" } satisfies AppError
  }
  const { error } = await supabase
    .from("line_room_calendar_events")
    .update({
      event_title: title,
      event_description: toSafeString(body.description).slice(0, 500),
      starts_at: startsAt,
      ends_at: endsAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) {
    throw { status: 500, message: `Failed to update event: ${error.message}` } satisfies AppError
  }
  return json({ ok: true, id }, 200)
}

async function handleChatRoomPurge(
  req: Request,
  workReq: Request,
  supabase: ReturnType<typeof createClient>,
): Promise<Response> {
  const body = await parseJson(workReq)
  if (!isRecord(body)) throw { status: 400, message: "Invalid JSON body." } satisfies AppError
  const groupId = Number(body.group_id ?? "")
  if (!Number.isSafeInteger(groupId) || groupId <= 0) {
    throw { status: 400, message: "group_id is required." } satisfies AppError
  }
  const userId = await authenticateChatMember(req, supabase, groupId, "manage")
  const { data: group, error } = await supabase
    .from("chat_groups")
    .select("id, group_name, created_by, is_store_room, trashed_at")
    .eq("id", groupId)
    .maybeSingle()
  if (error) throw { status: 500, message: `ルームの確認に失敗しました: ${error.message}` } satisfies AppError
  if (!group) throw { status: 404, message: "ルームが見つかりません。" } satisfies AppError
  const confirmName = String(body.confirm_name ?? "").trim()
  const roomName = String((group as { group_name?: string }).group_name ?? "").trim() || String(groupId)
  if (!confirmName || confirmName !== roomName) {
    throw { status: 400, message: "確認用のルーム名が一致しません。" } satisfies AppError
  }
  const purged = await purgeMtalkGroup(supabase, groupId, userId)
  return json({ success: true, ...purged }, 200)
}

async function handleChatRoomConfig(
  req: Request,
  workReq: Request,
  url: URL,
  supabase: ReturnType<typeof createClient>,
): Promise<Response> {
  let groupId = Number(url.searchParams.get("group_id") ?? "")
  let putBody: Record<string, unknown> | null = null
  if (req.method === "PUT") {
    const body = await parseJson(workReq)
    if (!isRecord(body)) {
      throw { status: 400, message: "Invalid JSON body." } satisfies AppError
    }
    putBody = body
    if (Number.isSafeInteger(Number(body.group_id)) && Number(body.group_id) > 0) {
      groupId = Number(body.group_id)
    }
  }
  if (!Number.isSafeInteger(groupId) || groupId <= 0) {
    throw { status: 400, message: "group_id is required." } satisfies AppError
  }
  const userId = await authenticateChatMember(req, supabase, groupId, req.method === "GET" ? "view" : "manage")
  const resolved = await resolveMtalkRoomStoreKey(supabase, groupId)
  if (resolved.ambiguous) {
    throw { status: 403, message: "複数店舗のBotがいるルームは設定できません。" } satisfies AppError
  }
  if (resolved.storeKey) {
    await requireMtalkStoreAccess(supabase, userId, resolved.storeKey)
  }
  const ensured = await ensureMtalkRoomSettings(supabase, groupId)
  if (!ensured) throw { status: 500, message: "ルーム設定を作れませんでした。" } satisfies AppError
  if (req.method === "PUT") {
    const safe = buildRoomConfigSafePayload(putBody ?? {})
    const { data, error } = await supabase
      .from("room_summary_settings")
      .update({ ...safe, updated_at: new Date().toISOString() })
      .eq("room_id", ensured.roomId)
      .select(ROOM_CONFIG_SAFE_SELECT)
      .maybeSingle()
    if (error) throw { status: 500, message: `Failed to save room config: ${error.message}` } satisfies AppError
    if (!data) throw { status: 404, message: "Room not found." } satisfies AppError
    return json({ room_config: data }, 200)
  }
  const { data, error } = await supabase
    .from("room_summary_settings")
    .select(ROOM_CONFIG_SAFE_SELECT)
    .eq("room_id", ensured.roomId)
    .maybeSingle()
  if (error) throw { status: 500, message: `Failed to load room config: ${error.message}` } satisfies AppError
  return json({ room_config: data ?? null }, 200)
}

async function authenticate(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  fallbackToken: string,
): Promise<AdminAuthenticationResult> {
  const provided = req.headers.get("x-admin-token") ?? ""
  // cron から admin-api を叩く経路（週次レポート等）: Authorization: Bearer <CRON_AUTH_TOKEN|ADMIN_DASHBOARD_TOKEN>
  if (!provided) {
    const authHeader = req.headers.get("Authorization") ?? ""
    const bearer = /^Bearer\s+(.+)$/i.exec(authHeader)?.[1]?.trim() ?? ""
    if (bearer) {
      const cronTok = String(Deno.env.get("CRON_AUTH_TOKEN") ?? "").trim()
      if (cronTok && secureEqual(bearer, cronTok)) {
        return {
          ok: true, storeScope: null, roomScope: null, scopeKind: "cron",
          chatAdminAuthority: null, actorLabel: null,
        }
      }
      // DB cron は Vault のトークンを使う。Edge Function の環境変数が未同期でも、
      // service-role 経由で同じ Vault 値と照合できれば許可する（値はレスポンスに出さない）。
      try {
        const { data: vaultCronToken } = await supabase.rpc("resolve_edge_cron_auth_token")
        const dbCronToken = String(vaultCronToken ?? "").trim()
        if (dbCronToken && secureEqual(bearer, dbCronToken)) {
          return {
            ok: true, storeScope: null, roomScope: null, scopeKind: "cron",
            chatAdminAuthority: null, actorLabel: null,
          }
        }
      } catch (_err) {
        // Vault 未設定時は既存の環境変数・管理トークン照合を継続する。
      }
      // vault が ADMIN_DASHBOARD_TOKEN と同値で運用されている場合も許可
      if (fallbackToken && secureEqual(bearer, fallbackToken)) {
        return {
          ok: true, storeScope: null, roomScope: null, scopeKind: null,
          chatAdminAuthority: null, actorLabel: "本部",
        }
      }
    }
    return { ok: false, status: 401, message: "Unauthorized." }
  }

  const session = await authenticateAdminDashboardSessionToken(supabase, provided)
  if (session.ok) {
    // chat_media_view は /chat-media-view 専用。通常の管理APIへ横展開させない。
    if (session.scopeKind === CHAT_MEDIA_VIEW_SCOPE) {
      return { ok: false, status: 403, message: "この閲覧リンクではこの操作はできません。" }
    }
    if (session.scopeKind === MTALK_ADMIN_SCOPE) {
      const delegated = await loadMtalkAdminAuthority(supabase, session.metadata)
      if (!delegated.ok) {
        return { ok: false, status: 403, message: delegated.message }
      }
      return {
        ok: true,
        storeScope: null,
        roomScope: null,
        scopeKind: MTALK_ADMIN_SCOPE,
        chatAdminAuthority: delegated.authority,
        actorLabel: delegated.authority.label,
      }
    }
    if (
      session.scopeKind === CHAT_JOURNAL_AI_SCOPE &&
      !await validateChatScopedSessionAccess(supabase, session.metadata, { requireJournalAi: true })
    ) {
      return { ok: false, status: 403, message: "電子ジャーナルAI権限が失効しました。" }
    }
    if (
      session.scopeKind !== null &&
      session.scopeKind !== ROOM_CONFIG_SCOPE &&
      !STORE_LINK_SCOPES.has(session.scopeKind)
    ) {
      return { ok: false, status: 403, message: "この管理スコープは利用できません。" }
    }
    // 旧形式の「店舗だけ・用途なし」セッションは複数管理画面へ横展開できたため廃止。
    // 新規発行元は必ず用途別scopeを付ける。既発行トークンもここで即時無効化される。
    if (session.storeScope && session.scopeKind === null) {
      return { ok: false, status: 403, message: "この旧形式の店舗リンクは無効です。新しいリンクを発行してください。" }
    }
    if (session.scopeKind && STORE_LINK_SCOPES.has(session.scopeKind) && !session.storeScope) {
      return { ok: false, status: 403, message: "店舗情報のないリンクは利用できません。" }
    }
    if (session.scopeKind === ROOM_CONFIG_SCOPE && (!session.roomScope || session.storeScope)) {
      return { ok: false, status: 403, message: "ルーム情報のない設定リンクは利用できません。" }
    }
    // ログインリンク由来のセッションは storeScope か roomScope を持つ＝その店舗/ルームだけに制限。
    return {
      ok: true,
      storeScope: session.storeScope,
      roomScope: session.roomScope,
      scopeKind: session.scopeKind,
      chatAdminAuthority: null,
      actorLabel: null,
    }
  }

  const raw = await authenticateRawAdminToken(provided, supabase, fallbackToken)
  if (raw.ok) {
    return {
      ok: true, storeScope: null, roomScope: null, scopeKind: null,
      chatAdminAuthority: null, actorLabel: "本部",
    } // 生adminトークン＝全店アクセス
  }
  return raw
}

async function authenticateRawAdminToken(
  provided: string,
  supabase: ReturnType<typeof createClient>,
  fallbackToken: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const token = String(provided ?? "")
  if (!token) {
    return { ok: false, status: 401, message: "Unauthorized." }
  }

  const dbHashResult = await getStoredAdminTokenHash(supabase)
  if (!dbHashResult.ok) {
    return dbHashResult
  }

  if (dbHashResult.hash) {
    const providedHash = await hashToken(token)
    if (secureEqual(providedHash, dbHashResult.hash)) {
      return { ok: true }
    }
    return { ok: false, status: 401, message: "Unauthorized." }
  }

  if (!fallbackToken) {
    return { ok: false, status: 500, message: "ADMIN_DASHBOARD_TOKEN is not configured." }
  }

  if (!secureEqual(token, fallbackToken)) {
    return { ok: false, status: 401, message: "Unauthorized." }
  }

  return { ok: true }
}

async function getStoredAdminTokenHash(
  supabase: ReturnType<typeof createClient>,
): Promise<{ ok: true; hash: string | null } | { ok: false; status: number; message: string }> {
  const { data, error } = await supabase
    .from("summary_settings")
    .select("admin_dashboard_token_hash")
    .eq("id", 1)
    .maybeSingle()

  if (error) {
    return { ok: false, status: 500, message: `Failed to load admin token settings: ${error.message}` }
  }

  const hash = typeof data?.admin_dashboard_token_hash === "string"
    ? data.admin_dashboard_token_hash.trim()
    : ""
  return { ok: true, hash: hash || null }
}

async function hashToken(value: string): Promise<string> {
  const input = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", input)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

async function fetchState(
  supabase: ReturnType<typeof createClient>,
  url: URL,
  adminSurface: string,
) {
  const logsLimit = clampInt(url.searchParams.get("logs_limit"), 100, 10, 200)
  const logsFetchLimit = logsLimit * 8
  const webhookStoreKeyRaw = String(url.searchParams.get("webhook_store_key") ?? "").trim().toLowerCase()

  const globalSettings = await fetchGlobalSettings(supabase)
  let webhookLogsQuery = supabase
    .from("line_webhook_delivery_logs")
    .select("id, created_at, jst_hour, status, reason, method, context, line_send_attempted, line_send_success, line_http_status, target_room_id, store_partition_key, details")
    .order("id", { ascending: false })
    .limit(logsFetchLimit)
  if (webhookStoreKeyRaw) {
    webhookLogsQuery = webhookLogsQuery.eq("store_partition_key", webhookStoreKeyRaw)
  }

  const [roomSettingsRes, roomOverviewRes, logsRes, webhookLogsRes, storageUsageState, userPermissionsRes, pushUsageSummary, dismissedRes] =
    await Promise.all([
      supabase
        .from("room_summary_settings")
        .select("*")
        .order("updated_at", { ascending: false }),
      supabase.rpc("get_room_overview", { p_admin_surface: adminSurface }),
      supabase
        .from("summary_delivery_logs")
        .select("id, run_at, jst_hour, status, reason, should_send_overall, rooms_targeted, messages_in_queue, messages_marked_processed, line_send_attempted, line_send_success, line_http_status, target_room_id, details")
        .order("id", { ascending: false })
        .limit(logsFetchLimit),
      webhookLogsQuery,
      fetchStorageUsageState(supabase),
      supabase
        .from("line_user_permissions")
        .select("line_user_id, display_name, is_active, can_message_search, can_library_search, can_calendar_create, can_calendar_update, can_calendar_view, can_media_access, excluded_message_search_room_ids, assigned_store, assigned_job_title, registration_source_store, updated_at")
        .limit(USER_PERMISSION_SORT_FETCH_CAP),
      fetchMonthlyPushUsageSummary(supabase),
      supabase
        .from("line_room_dismissed")
        .select("room_id, dismissed_at, previous_store_partition_key")
        .eq("admin_surface", adminSurface)
        .order("dismissed_at", { ascending: false }),
    ])

  if (roomSettingsRes.error) {
    throw { status: 500, message: `Failed to fetch room settings: ${roomSettingsRes.error.message}` } satisfies AppError
  }
  if (roomOverviewRes.error) {
    throw { status: 500, message: `Failed to fetch room overview: ${roomOverviewRes.error.message}` } satisfies AppError
  }
  if (logsRes.error) {
    throw { status: 500, message: `Failed to fetch delivery logs: ${logsRes.error.message}` } satisfies AppError
  }
  if (webhookLogsRes.error) {
    throw { status: 500, message: `Failed to fetch webhook delivery logs: ${webhookLogsRes.error.message}` } satisfies AppError
  }
  if (userPermissionsRes.error) {
    throw { status: 500, message: `Failed to fetch user permissions: ${userPermissionsRes.error.message}` } satisfies AppError
  }
  if (dismissedRes.error) {
    throw { status: 500, message: `Failed to fetch trashed rooms: ${dismissedRes.error.message}` } satisfies AppError
  }

  const filteredLogs = (logsRes.data ?? [])
    .filter((row) => isActionableDeliveryLogStatus(row.status, row.details))
    .slice(0, logsLimit)

  const { data: consoleSettingsRows } = await supabase
    .from("line_admin_console_settings")
    .select("setting_key, setting_value")
  const consoleSettings: Record<string, string> = {}
  for (const row of (Array.isArray(consoleSettingsRows) ? consoleSettingsRows : [])) {
    const k = String((row as { setting_key?: unknown })?.setting_key ?? "").trim()
    if (k) consoleSettings[k] = String((row as { setting_value?: unknown })?.setting_value ?? "")
  }

  const roomSettingsAll = (roomSettingsRes.data ?? [])
    .filter((r) => !isMtalkSyntheticRoomId(String((r as { room_id?: unknown }).room_id ?? "")))
    .map((r) => stripRoomConfigSecret(r as Record<string, unknown>))
  const roomNameById = new Map<string, string>()
  const storeById = new Map<string, string>()
  const liveSettingsIds = new Set<string>()
  for (const row of roomSettingsAll) {
    const rid = String((row as { room_id?: unknown }).room_id ?? "").trim()
    if (!rid) continue
    liveSettingsIds.add(rid)
    const name = String((row as { room_name?: unknown }).room_name ?? "").trim()
    const store = String((row as { receipt_report_store_partition_key?: unknown }).receipt_report_store_partition_key ?? "").trim()
    if (name) roomNameById.set(rid, name)
    if (store) storeById.set(rid, store)
  }
  const trashedRooms = (Array.isArray(dismissedRes?.data) ? dismissedRes.data : [])
    .map((row) => {
      const roomId = String((row as { room_id?: unknown }).room_id ?? "").trim()
      if (!roomId || isMtalkSyntheticRoomId(roomId)) return null
      if (!liveSettingsIds.has(roomId)) return null
      const previousStore = String((row as { previous_store_partition_key?: unknown }).previous_store_partition_key ?? "").trim()
      return {
        room_id: roomId,
        room_name: roomNameById.get(roomId) || roomId,
        store_partition_key: previousStore || storeById.get(roomId) || "",
        dismissed_at: (row as { dismissed_at?: unknown }).dismissed_at ?? null,
      }
    })
    .filter(Boolean)

  return {
    global_settings: globalSettings,
    console_settings: consoleSettings,
    room_settings: roomSettingsAll,
    user_permissions: sortLineUserPermissionsForAdminDisplay(userPermissionsRes.data ?? []).slice(
      0,
      USER_PERMISSION_LIST_MAX_LIMIT,
    ),
    marugo_group_store_options: [...MARUGO_GROUP_STORE_OPTIONS],
    receipt_store_options: await fetchStorePartitionReceiptOptions(supabase),
    job_title_options: [...JOB_TITLE_OPTIONS],
    room_overview: roomOverviewRes.data ?? [],
    trashed_rooms: trashedRooms,
    delivery_logs: filteredLogs,
    webhook_delivery_logs: (webhookLogsRes.data ?? []).slice(0, logsLimit),
    push_usage_monthly: pushUsageSummary,
    storage_usage: storageUsageState.stats,
    storage_usage_error: storageUsageState.error,
    generated_at: new Date().toISOString(),
  }
}

function getCurrentJstMonthUtcBounds(): { monthLabel: string; startUtcIso: string; endUtcIso: string } {
  const now = new Date()
  const nowJstMs = now.getTime() + 9 * 60 * 60 * 1000
  const nowJst = new Date(nowJstMs)
  const y = nowJst.getUTCFullYear()
  const m = nowJst.getUTCMonth()
  const startUtc = new Date(Date.UTC(y, m, 1, 0, 0, 0) - (9 * 60 * 60 * 1000))
  const endUtc = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0) - (9 * 60 * 60 * 1000))
  return {
    monthLabel: `${String(y).padStart(4, "0")}-${String(m + 1).padStart(2, "0")}`,
    startUtcIso: startUtc.toISOString(),
    endUtcIso: endUtc.toISOString(),
  }
}

type PushUsageItem = { source: string; context: string; count: number }
type PushByStore = { store_key: string; push: number; reply: number; total: number }
type PushByRoom = { room_id: string; room_name: string; store_key: string; push: number; reply: number; total: number }

// 当月(JST)の LINE 送信量を「実際の全送信元テーブル」から集計する。
//  - LINE PUSH（定期・ジョブ・枠を消費）: gmail予約通知 / 本日の予約配信 / 東京ドーム週次 / レシート報告 /
//    line_webhook(method='push') / summary_delivery_logs(成功)。各テーブルに分散記録されているため全部見る。
//  - WEBHOOK PUSH（メッセージ受信による返信）: line_webhook_delivery_logs(method='reply', 成功)。返信は枠を消費しない。
//  - ルーム別・店舗別にもカウント（room_id→店舗は room_summary_settings で対応付け）。
async function fetchMonthlyPushUsageSummary(
  supabase: ReturnType<typeof createClient>,
): Promise<{
  month_jst: string
  total_push_rows: number
  webhook_push_rows: number
  summary_push_rows: number
  webhook_reply_rows: number
  webhook_success_rows: number
  free_quota_limit: number
  free_quota_remaining: number
  by_source_context: PushUsageItem[]
  by_store: PushByStore[]
  by_room: PushByRoom[]
}> {
  const bounds = getCurrentJstMonthUtcBounds()
  const lo = bounds.startUtcIso, hi = bounds.endUtcIso
  const [webhookRes, summaryRes, gmailRes, resvTodayRes, tomorrowRes, domeRes, receiptRes, roomMapRes] = await Promise.all([
    supabase.from("line_webhook_delivery_logs").select("method, target_room_id, store_partition_key, context")
      .eq("line_send_success", true).gte("created_at", lo).lt("created_at", hi),
    supabase.from("summary_delivery_logs").select("target_room_id, reason, details")
      .eq("line_send_attempted", true).eq("line_send_success", true).gte("run_at", lo).lt("run_at", hi),
    supabase.from("gmail_reservation_alert_logs").select("line_target_room_id")
      .not("line_message_sent_at", "is", null).gte("line_message_sent_at", lo).lt("line_message_sent_at", hi),
    supabase.from("reservation_today_alert_logs").select("room_id, store_partition_key").gte("sent_at", lo).lt("sent_at", hi),
    supabase.from("calendar_tomorrow_reminder_logs").select("room_id, store_partition_key").gte("sent_at", lo).lt("sent_at", hi),
    supabase.from("tokyo_dome_weekly_logs").select("room_id, store_partition_key").gte("sent_at", lo).lt("sent_at", hi),
    supabase.from("line_receipt_mid_reports").select("room_id, report_kind").gte("sent_at", lo).lt("sent_at", hi),
    supabase.from("room_summary_settings").select("room_id, room_name, receipt_report_store_partition_key"),
  ])
  const dataOf = (res: { data?: unknown }) => (Array.isArray(res?.data) ? res.data as Array<Record<string, unknown>> : [])

  const roomToStore = new Map<string, string>()
  const roomToName = new Map<string, string>()
  for (const r of dataOf(roomMapRes)) {
    const rid = String(r.room_id ?? "").trim()
    const sk = String(r.receipt_report_store_partition_key ?? "").trim().toLowerCase()
    const nm = String(r.room_name ?? "").trim()
    if (rid && sk) roomToStore.set(rid, sk)
    if (rid && nm) roomToName.set(rid, nm)
  }
  const storeOf = (roomId: unknown, storeKey: unknown): string => {
    const sk = String(storeKey ?? "").trim().toLowerCase()
    if (sk) return sk
    const rid = String(roomId ?? "").trim()
    return rid ? (roomToStore.get(rid) ?? "") : ""
  }

  const srcCounter = new Map<string, number>()
  const byRoom = new Map<string, { store: string; push: number; reply: number }>()
  const byStore = new Map<string, { push: number; reply: number }>()
  const addSrc = (source: string, context: string) => {
    const k = `${source}\t${context || "unknown"}`
    srcCounter.set(k, (srcCounter.get(k) ?? 0) + 1)
  }
  const add = (roomId: unknown, store: string, kind: "push" | "reply", source?: string, context?: string) => {
    const rid = String(roomId ?? "").trim()
    if (rid) {
      const e = byRoom.get(rid) ?? { store: store || "", push: 0, reply: 0 }
      e[kind] += 1
      if (store && !e.store) e.store = store
      byRoom.set(rid, e)
    }
    if (store) {
      const s = byStore.get(store) ?? { push: 0, reply: 0 }
      s[kind] += 1
      byStore.set(store, s)
    }
    if (kind === "push" && source) addSrc(source, context ?? "")
  }

  let pushTotal = 0, replyTotal = 0
  for (const r of dataOf(webhookRes)) {
    const method = String(r.method ?? "").trim()
    const store = storeOf(r.target_room_id, r.store_partition_key)
    if (method === "reply") { replyTotal += 1; add(r.target_room_id, store, "reply") }
    else { pushTotal += 1; add(r.target_room_id, store, "push", "LINE webhook", String(r.context ?? "").trim() || "push") }
  }
  for (const r of dataOf(summaryRes)) {
    const details = (r.details && typeof r.details === "object") ? r.details as Record<string, unknown> : {}
    const source = String(details.source ?? "summary").trim() || "summary"
    const context = String(details.context ?? "").trim() || String(r.reason ?? "").trim() || "summary"
    pushTotal += 1; add(r.target_room_id, storeOf(r.target_room_id, ""), "push", source, context)
  }
  for (const r of dataOf(gmailRes)) {
    pushTotal += 1; add(r.line_target_room_id, storeOf(r.line_target_room_id, ""), "push", "Gmail予約通知", "予約メール")
  }
  for (const r of dataOf(resvTodayRes)) {
    pushTotal += 1; add(r.room_id, storeOf(r.room_id, r.store_partition_key), "push", "本日の予約配信", "daily")
  }
  for (const r of dataOf(tomorrowRes)) {
    pushTotal += 1; add(r.room_id, storeOf(r.room_id, r.store_partition_key), "push", "明日の予定配信", "daily")
  }
  for (const r of dataOf(domeRes)) {
    pushTotal += 1; add(r.room_id, storeOf(r.room_id, r.store_partition_key), "push", "東京ドーム週次配信", "weekly")
  }
  for (const r of dataOf(receiptRes)) {
    pushTotal += 1; add(r.room_id, storeOf(r.room_id, ""), "push", "レシートレポート", String(r.report_kind ?? "").trim() || "report")
  }

  const bySourceContext: PushUsageItem[] = Array.from(srcCounter.entries())
    .map(([k, count]) => { const [source, context] = k.split("\t"); return { source: source || "unknown", context: context || "unknown", count } })
    .sort((a, b) => (b.count - a.count) || a.source.localeCompare(b.source))
  const byStoreArr: PushByStore[] = Array.from(byStore.entries())
    .map(([store_key, v]) => ({ store_key, push: v.push, reply: v.reply, total: v.push + v.reply }))
    .sort((a, b) => b.total - a.total)
  const byRoomArr: PushByRoom[] = Array.from(byRoom.entries())
    .map(([room_id, v]) => ({ room_id, room_name: roomToName.get(room_id) ?? "", store_key: v.store, push: v.push, reply: v.reply, total: v.push + v.reply }))
    .sort((a, b) => b.total - a.total)

  return {
    month_jst: bounds.monthLabel,
    total_push_rows: pushTotal,       // LINE PUSH（定期・ジョブ＝枠を消費）
    webhook_push_rows: replyTotal,    // WEBHOOK PUSH（メッセージ受信による返信）
    summary_push_rows: pushTotal,     // 後方互換（合計push）
    webhook_reply_rows: replyTotal,
    webhook_success_rows: pushTotal + replyTotal,
    free_quota_limit: 200,
    free_quota_remaining: Math.max(0, 200 - pushTotal),
    by_source_context: bySourceContext,
    by_store: byStoreArr,
    by_room: byRoomArr,
  }
}

async function fetchLineUserPermissions(
  supabase: ReturnType<typeof createClient>,
  url: URL,
) {
  const limit = clampInt(url.searchParams.get("limit"), USER_PERMISSION_LIST_DEFAULT_LIMIT, 1, USER_PERMISSION_LIST_MAX_LIMIT)
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, 1000000)
  const q = String(url.searchParams.get("q") ?? "").trim()

  let query = supabase
    .from("line_user_permissions")
    .select("line_user_id, display_name, is_active, can_message_search, can_library_search, can_calendar_create, can_calendar_update, can_calendar_view, can_media_access, excluded_message_search_room_ids, assigned_store, assigned_job_title, registration_source_store, updated_at", { count: "exact" })
    .limit(USER_PERMISSION_SORT_FETCH_CAP)

  if (q) {
    const escaped = q.replaceAll("%", "\\%").replaceAll("_", "\\_")
    query = query.or(`line_user_id.ilike.%${escaped}%,display_name.ilike.%${escaped}%`)
  }

  const { data, error, count } = await query
  if (error) {
    throw { status: 500, message: `Failed to fetch user permissions: ${error.message}` } satisfies AppError
  }

  const rows = Array.isArray(data) ? data : []
  const sorted = sortLineUserPermissionsForAdminDisplay(rows)
  const paged = sorted.slice(offset, offset + limit)
  const safeTotal = Number.isFinite(Number(count)) ? Number(count) : sorted.length
  const nextOffset = offset + paged.length
  return {
    items: paged,
    total: safeTotal,
    limit,
    offset,
    has_more: nextOffset < safeTotal,
    next_offset: nextOffset < safeTotal ? nextOffset : null,
    generated_at: new Date().toISOString(),
  }
}

async function backfillLineUserPermissionsFromMessages(
  supabase: ReturnType<typeof createClient>,
) {
  const pageSize = 1000
  const userIds = new Set<string>()
  const latestRoomIdByUserId = new Map<string, string>()
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from("line_messages")
      .select("user_id, room_id, id")
      .not("user_id", "is", null)
      .neq("user_id", "")
      .order("id", { ascending: false })
      .range(offset, offset + pageSize - 1)
    if (error) {
      throw { status: 500, message: `Failed to scan line_messages users: ${error.message}` } satisfies AppError
    }
    const rows = Array.isArray(data) ? data : []
    if (rows.length === 0) break
    for (const row of rows) {
      const userId = String((row as { user_id?: unknown })?.user_id ?? "").trim()
      if (!userId) continue
      userIds.add(userId)
      if (!latestRoomIdByUserId.has(userId)) {
        const roomId = String((row as { room_id?: unknown })?.room_id ?? "").trim()
        if (roomId) latestRoomIdByUserId.set(userId, roomId)
      }
    }
    if (rows.length < pageSize) break
    offset += pageSize
  }

  // Include users that already exist in permission table (for display-name recovery).
  offset = 0
  while (true) {
    const { data, error } = await supabase
      .from("line_user_permissions")
      .select("line_user_id")
      .range(offset, offset + pageSize - 1)
    if (error) {
      throw { status: 500, message: `Failed to scan line_user_permissions users: ${error.message}` } satisfies AppError
    }
    const rows = Array.isArray(data) ? data : []
    if (rows.length === 0) break
    for (const row of rows) {
      const lineUserId = String((row as { line_user_id?: unknown })?.line_user_id ?? "").trim()
      if (lineUserId) userIds.add(lineUserId)
    }
    if (rows.length < pageSize) break
    offset += pageSize
  }

  const allUserIds = Array.from(userIds)
  if (allUserIds.length === 0) {
    return {
      scanned_user_ids: 0,
      inserted: 0,
      already_existing: 0,
      display_name_updated: 0,
    }
  }

  const existingNameByUserId = new Map<string, string | null>()
  for (let i = 0; i < allUserIds.length; i += pageSize) {
    const chunk = allUserIds.slice(i, i + pageSize)
    const { data: existingRows, error: existingError } = await supabase
      .from("line_user_permissions")
      .select("line_user_id, display_name")
      .in("line_user_id", chunk)
    if (existingError) {
      throw { status: 500, message: `Failed to inspect existing user permissions: ${existingError.message}` } satisfies AppError
    }
    for (const row of existingRows ?? []) {
      const lineUserId = String((row as { line_user_id?: unknown })?.line_user_id ?? "").trim()
      if (!lineUserId) continue
      const displayName = String((row as { display_name?: unknown })?.display_name ?? "").trim()
      existingNameByUserId.set(lineUserId, displayName || null)
    }
  }

  const existingSet = new Set(Array.from(existingNameByUserId.keys()))
  const lineAccessToken = String(Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "").trim()
  const idsNeedingDisplayName = allUserIds.filter((lineUserId) => {
    const displayName = existingNameByUserId.get(lineUserId)
    return !displayName
  })
  const fetchedDisplayNameByUserId = lineAccessToken
    ? await fetchLineDisplayNamesByUserIds(idsNeedingDisplayName, latestRoomIdByUserId, lineAccessToken)
    : new Map<string, string>()

  const now = new Date().toISOString()
  const inserts = allUserIds
    .filter((id) => !existingSet.has(id))
    .map((lineUserId) => ({
      line_user_id: lineUserId,
      display_name: fetchedDisplayNameByUserId.get(lineUserId) ?? null,
      is_active: true,
      can_message_search: true,
      can_library_search: true,
      can_calendar_create: true,
      can_calendar_update: true,
      can_calendar_view: true,
      can_media_access: true,
      assigned_store: null,
      assigned_job_title: null,
      updated_at: now,
    }))

  if (inserts.length > 0) {
    const { error: insertError } = await supabase
      .from("line_user_permissions")
      .insert(inserts, { defaultToNull: false, ignoreDuplicates: true })
    if (insertError) {
      throw { status: 500, message: `Failed to backfill user permissions: ${insertError.message}` } satisfies AppError
    }
  }

  let displayNameUpdated = 0
  const existingNeedDisplayNameIds = allUserIds.filter((lineUserId) => {
    if (!existingSet.has(lineUserId)) return false
    const currentName = existingNameByUserId.get(lineUserId)
    return !currentName && !!fetchedDisplayNameByUserId.get(lineUserId)
  })
  for (const lineUserId of existingNeedDisplayNameIds) {
    const displayName = fetchedDisplayNameByUserId.get(lineUserId)
    if (!displayName) continue
    const { error: updateError } = await supabase
      .from("line_user_permissions")
      .update({
        display_name: displayName,
        updated_at: new Date().toISOString(),
      })
      .eq("line_user_id", lineUserId)
    if (updateError) {
      throw { status: 500, message: `Failed to update display_name for ${lineUserId}: ${updateError.message}` } satisfies AppError
    }
    displayNameUpdated += 1
  }

  return {
    scanned_user_ids: allUserIds.length,
    inserted: inserts.length,
    already_existing: allUserIds.length - inserts.length,
    display_name_updated: displayNameUpdated,
  }
}

async function fetchLineDisplayNamesByUserIds(
  lineUserIds: string[],
  latestRoomIdByUserId: Map<string, string>,
  lineAccessToken: string,
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  for (const lineUserId of lineUserIds) {
    const userId = String(lineUserId ?? "").trim()
    if (!userId) continue
    const roomId = String(latestRoomIdByUserId.get(userId) ?? "").trim()
    const displayName = await fetchLineDisplayNameByUserId(userId, roomId, lineAccessToken)
    if (displayName) {
      result.set(userId, displayName)
    }
  }
  return result
}

async function fetchLineDisplayNameByUserId(
  lineUserId: string,
  roomId: string,
  lineAccessToken: string,
): Promise<string | null> {
  if (roomId.startsWith("C")) {
    const byGroupMember = await fetchLineDisplayNameByUrl(
      `https://api.line.me/v2/bot/group/${encodeURIComponent(roomId)}/member/${encodeURIComponent(lineUserId)}`,
      lineAccessToken,
    )
    if (byGroupMember) return byGroupMember
  } else if (roomId.startsWith("R")) {
    const byRoomMember = await fetchLineDisplayNameByUrl(
      `https://api.line.me/v2/bot/room/${encodeURIComponent(roomId)}/member/${encodeURIComponent(lineUserId)}`,
      lineAccessToken,
    )
    if (byRoomMember) return byRoomMember
  }

  return await fetchLineDisplayNameByUrl(
    `https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`,
    lineAccessToken,
  )
}

async function fetchLineDisplayNameByUrl(
  url: string,
  lineAccessToken: string,
): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${lineAccessToken}`,
      },
    })
    if (!response.ok) {
      return null
    }
    const body = await response.json()
    const displayName = String(body?.displayName ?? "").trim()
    return displayName || null
  } catch {
    return null
  }
}

async function fetchLineChatMemberIdsPaginated(
  roomId: string,
  lineAccessToken: string,
): Promise<string[]> {
  const rid = String(roomId ?? "").trim()
  if (!rid) {
    throw { status: 400, message: "room_id is required." } satisfies AppError
  }
  let baseUrl: string
  if (rid.startsWith("C")) {
    baseUrl = `https://api.line.me/v2/bot/group/${encodeURIComponent(rid)}/members/ids`
  } else if (rid.startsWith("R")) {
    baseUrl = `https://api.line.me/v2/bot/room/${encodeURIComponent(rid)}/members/ids`
  } else {
    throw {
      status: 400,
      message: "room_id must be a LINE group (C...) or multi-person chat room (R...).",
    } satisfies AppError
  }

  const all: string[] = []
  let start: string | undefined
  for (let page = 0; page < 500; page++) {
    const url = start ? `${baseUrl}?start=${encodeURIComponent(start)}` : baseUrl
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${lineAccessToken}`,
      },
    })
    const errorText = await response.text()
    if (!response.ok) {
      const detail = errorText.trim().slice(0, 400)
      if (response.status === 403) {
        let lineApiMessage = ""
        try {
          const j = JSON.parse(errorText) as { message?: unknown }
          if (typeof j?.message === "string") lineApiMessage = j.message.trim()
        } catch {
          // ignore
        }
        throw {
          status: 403,
          message: [
            "LINE の「グループ／トークのメンバー ID 一覧（members/ids）」は、このチャネルでは利用できません（403）。",
            "公式ドキュメント上、この API は認証済みアカウントまたはプレミアムアカウントの LINE 公式アカウントに限定されています。未認証の通常アカウントではメンバー同期は実行できません。",
            "代替: メンバーがトークでメッセージを送るたびに Webhook で userId が取得できるため、従来どおり「既存ユーザー取込」や運用でユーザー権限に反映できます。",
            "参考: https://developers.line.biz/en/docs/messaging-api/getting-user-ids/",
            lineApiMessage ? `（LINE API: ${lineApiMessage}）` : (detail ? `（応答: ${detail.slice(0, 240)}）` : ""),
          ].filter((s) => s.length > 0).join("\n"),
        } satisfies AppError
      }
      throw {
        status: response.status === 404 ? 404 : 502,
        message: `LINE members/ids failed (${response.status}): ${detail || response.statusText}`,
      } satisfies AppError
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(errorText)
    } catch {
      throw { status: 502, message: "LINE members/ids returned invalid JSON." } satisfies AppError
    }
    const body = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
    const idsRaw = body.memberIds
    const ids = Array.isArray(idsRaw) ? idsRaw : []
    for (const id of ids) {
      const u = String(id ?? "").trim()
      if (u) all.push(u)
    }
    const next = body.next
    if (typeof next === "string" && next.length > 0) {
      start = next
      continue
    }
    break
  }
  return Array.from(new Set(all))
}

async function syncLineUserPermissionsFromChatMembers(
  supabase: ReturnType<typeof createClient>,
  roomId: string,
): Promise<{
  room_id: string
  chat_kind: "group" | "room"
  member_ids: number
  inserted: number
  updated: number
  display_name_missing: number
  errors: string[]
}> {
  const normalizedRoomId = String(roomId ?? "").trim()
  const lineAccessToken = String(Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "").trim()
  if (!lineAccessToken) {
    throw { status: 500, message: "LINE_CHANNEL_ACCESS_TOKEN is not set." } satisfies AppError
  }

  const memberIds = await fetchLineChatMemberIdsPaginated(normalizedRoomId, lineAccessToken)
  const chatKind: "group" | "room" = normalizedRoomId.startsWith("C") ? "group" : "room"
  let inserted = 0
  let updated = 0
  let displayNameMissing = 0
  const errors: string[] = []
  const now = new Date().toISOString()

  for (const lineUserId of memberIds) {
    const displayName = await fetchLineDisplayNameByUserId(lineUserId, normalizedRoomId, lineAccessToken)
    if (!displayName) {
      displayNameMissing += 1
    }

    const { data: existing, error: selErr } = await supabase
      .from("line_user_permissions")
      .select("line_user_id")
      .eq("line_user_id", lineUserId)
      .maybeSingle()

    if (selErr) {
      errors.push(`${lineUserId}: ${selErr.message}`)
      continue
    }

    if (existing?.line_user_id) {
      const patch: Record<string, unknown> = { updated_at: now }
      if (displayName) {
        patch.display_name = displayName
      }
      const { error: upErr } = await supabase
        .from("line_user_permissions")
        .update(patch)
        .eq("line_user_id", lineUserId)
      if (upErr) {
        errors.push(`${lineUserId}: ${upErr.message}`)
        continue
      }
      updated += 1
    } else {
      const { error: insErr } = await supabase
        .from("line_user_permissions")
        .insert({
          line_user_id: lineUserId,
          display_name: displayName,
          is_active: false,
          can_message_search: false,
          can_library_search: false,
          can_calendar_create: false,
          can_calendar_update: false,
          can_calendar_view: false,
          can_media_access: false,
          excluded_message_search_room_ids: [],
          assigned_store: null,
          assigned_job_title: null,
          updated_at: now,
        })
      if (insErr) {
        errors.push(`${lineUserId}: ${insErr.message}`)
        continue
      }
      inserted += 1
    }
  }

  return {
    room_id: normalizedRoomId,
    chat_kind: chatKind,
    member_ids: memberIds.length,
    inserted,
    updated,
    display_name_missing: displayNameMissing,
    errors,
  }
}

/**
 * 設定済みの LINE チャネルアクセストークンを全て収集する。
 * ユーザー/グループは店舗Bot・承認Botなど別チャネルを友だち追加していることがあり、
 * 単一トークンだと /profile・/summary が 404 になる。全トークンで順に試すために使う。
 * env: LINE_CHANNEL_ACCESS_TOKEN（全体）＋ LINE_CHANNEL_ACCESS_TOKEN__{店舗キー}
 */
function collectAllLineChannelTokens(): string[] {
  const env = Deno.env.toObject()
  const tokens: string[] = []
  const seen = new Set<string>()
  const globalToken = String(env["LINE_CHANNEL_ACCESS_TOKEN"] ?? "").trim()
  if (globalToken) {
    seen.add(globalToken)
    tokens.push(globalToken)
  }
  for (const [key, value] of Object.entries(env)) {
    if (!/^LINE_CHANNEL_ACCESS_TOKEN__.+/.test(key)) continue
    const token = String(value ?? "").trim()
    if (token && !seen.has(token)) {
      seen.add(token)
      tokens.push(token)
    }
  }
  return tokens
}

async function refreshRoomNamesFromLine(
  supabase: ReturnType<typeof createClient>,
  roomId: string | null,
) {
  const lineAccessTokens = collectAllLineChannelTokens()
  if (lineAccessTokens.length === 0) {
    throw { status: 500, message: "LINE_CHANNEL_ACCESS_TOKEN is not set." } satisfies AppError
  }

  const roomIds = new Set<string>()
  if (roomId) {
    roomIds.add(roomId)
  } else {
    const { data, error } = await supabase.rpc("get_room_overview")
    if (error) {
      throw { status: 500, message: `Failed to fetch room overview for name refresh: ${error.message}` } satisfies AppError
    }
    const rows = Array.isArray(data) ? data : []
    for (const row of rows) {
      const id = String((row as { room_id?: unknown })?.room_id ?? "").trim()
      if (id) roomIds.add(id)
    }
  }

  let refreshed = 0
  let attempted = 0
  let notFound = 0
  const now = new Date().toISOString()
  for (const id of roomIds) {
    attempted += 1
    // 友だち追加先のチャネルが店舗ごとに異なるため、全トークンで順に試す
    let name: string | null = null
    for (const token of lineAccessTokens) {
      name = await fetchLineConversationNameByRoomId(id, token)
      if (name) break
    }
    if (!name) {
      notFound += 1
      continue
    }

    const { error: settingsError } = await supabase
      .from("room_summary_settings")
      .update({
        room_name: name,
        updated_at: now,
      })
      .eq("room_id", id)
    if (settingsError) {
      throw { status: 500, message: `Failed to refresh room name in settings (${id}): ${settingsError.message}` } satisfies AppError
    }

    const { error: cacheError } = await supabase
      .from("line_room_names")
      .upsert({
        room_id: id,
        room_name: name,
        updated_at: now,
      }, { onConflict: "room_id" })
    if (cacheError) {
      throw { status: 500, message: `Failed to refresh room name in cache (${id}): ${cacheError.message}` } satisfies AppError
    }

    refreshed += 1
  }

  return {
    attempted,
    refreshed,
    not_found: notFound,
    generated_at: now,
  }
}

async function fetchLineConversationNameByRoomId(
  roomId: string,
  lineAccessToken: string,
): Promise<string | null> {
  const normalizedRoomId = String(roomId ?? "").trim()
  if (!normalizedRoomId) return null

  if (normalizedRoomId.startsWith("C")) {
    return await fetchLineConversationNameByUrl(
      `https://api.line.me/v2/bot/group/${encodeURIComponent(normalizedRoomId)}/summary`,
      lineAccessToken,
      "groupName",
    )
  }
  if (normalizedRoomId.startsWith("R")) {
    return await fetchLineConversationNameByUrl(
      `https://api.line.me/v2/bot/room/${encodeURIComponent(normalizedRoomId)}/summary`,
      lineAccessToken,
      "roomName",
    )
  }
  if (normalizedRoomId.startsWith("U")) {
    return await fetchLineConversationNameByUrl(
      `https://api.line.me/v2/bot/profile/${encodeURIComponent(normalizedRoomId)}`,
      lineAccessToken,
      "displayName",
    )
  }
  return null
}

async function fetchLineConversationNameByUrl(
  url: string,
  lineAccessToken: string,
  key: "groupName" | "roomName" | "displayName",
): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${lineAccessToken}`,
      },
    })
    if (!response.ok) {
      return null
    }
    const body = await response.json()
    const value = String(body?.[key] ?? "").trim()
    return value || null
  } catch {
    return null
  }
}

type ReceiptSheetsPilotLinkState = {
  configured: boolean
  spreadsheet_id: string | null
  spreadsheet_url: string | null
  store_partition_key: string | null
  store_display_name: string | null
  suggested_google_user: string | null
  access_note: string
}

async function fetchReceiptSheetsPilotLinkState(): Promise<ReceiptSheetsPilotLinkState> {
  const spreadsheetId = String(Deno.env.get("RECEIPT_SHEETS_PILOT_SPREADSHEET_ID") ?? "").trim()
  const suggestedGoogleUser = String(Deno.env.get("RECEIPT_SHEETS_PILOT_SUGGESTED_GOOGLE_USER") ?? "").trim() || null
  const accessNote =
    "Google スプレッドシート連携は **全店舗** 対応です。" +
    "スプレッドシート内の `{店舗キー}_月間予算` / `{店舗キー}_過去売上` / `{店舗キー}_日次売上` タブごとに同期されます。" +
    "シートはブラウザにログイン中の Google アカウントで開きます。編集にはシートの共有（編集者）が必要です。"

  if (!spreadsheetId) {
    return {
      configured: false,
      spreadsheet_id: null,
      spreadsheet_url: null,
      store_partition_key: null,
      store_display_name: null,
      suggested_google_user: null,
      access_note: "サーバーに RECEIPT_SHEETS_PILOT_SPREADSHEET_ID が未設定のため、リンクを出せません。",
    }
  }

  let spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`
  if (suggestedGoogleUser) {
    spreadsheetUrl += `?authuser=${encodeURIComponent(suggestedGoogleUser)}`
  }

  return {
    configured: true,
    spreadsheet_id: spreadsheetId,
    spreadsheet_url: spreadsheetUrl,
    store_partition_key: null,
    store_display_name: "全店舗",
    suggested_google_user: suggestedGoogleUser,
    access_note: accessNote,
  }
}

async function fetchGmailLinkedAccountState(): Promise<GmailLinkedAccountState> {
  const checkedAt = new Date().toISOString()
  const clientId = String(Deno.env.get("GMAIL_CLIENT_ID") ?? "").trim()
  const clientSecret = String(Deno.env.get("GMAIL_CLIENT_SECRET") ?? "").trim()
  const refreshToken = String(Deno.env.get("GMAIL_REFRESH_TOKEN") ?? "").trim()

  const hasAnyCredential = !!clientId || !!clientSecret || !!refreshToken
  const enabled = parseBooleanEnv(Deno.env.get("GMAIL_ALERT_ENABLED"), hasAnyCredential)
  const configured = !!clientId && !!clientSecret && !!refreshToken

  if (!enabled) {
    return {
      enabled: false,
      configured,
      email_address: null,
      history_id: null,
      checked_at: checkedAt,
      error: null,
    }
  }

  if (!configured) {
    const missing: string[] = []
    if (!clientId) missing.push("GMAIL_CLIENT_ID")
    if (!clientSecret) missing.push("GMAIL_CLIENT_SECRET")
    if (!refreshToken) missing.push("GMAIL_REFRESH_TOKEN")
    return {
      enabled: true,
      configured: false,
      email_address: null,
      history_id: null,
      checked_at: checkedAt,
      error: `Missing Gmail secrets: ${missing.join(", ")}`,
    }
  }

  const tokenState = await fetchGmailAccessTokenByRefreshToken(clientId, clientSecret, refreshToken)
  if (!tokenState.ok) {
    return {
      enabled: true,
      configured: true,
      email_address: null,
      history_id: null,
      checked_at: checkedAt,
      error: tokenState.error,
    }
  }

  const profileState = await fetchGmailProfile(tokenState.accessToken)
  if (!profileState.ok) {
    return {
      enabled: true,
      configured: true,
      email_address: null,
      history_id: null,
      checked_at: checkedAt,
      error: profileState.error,
    }
  }

  return {
    enabled: true,
    configured: true,
    email_address: profileState.emailAddress,
    history_id: profileState.historyId,
    checked_at: checkedAt,
    error: null,
  }
}

async function fetchGmailAccessTokenByRefreshToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ ok: true; accessToken: string } | { ok: false; error: string }> {
  try {
    const body = new URLSearchParams()
    body.set("client_id", clientId)
    body.set("client_secret", clientSecret)
    body.set("refresh_token", refreshToken)
    body.set("grant_type", "refresh_token")

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    })
    const text = await response.text()
    if (!response.ok) {
      return {
        ok: false,
        error: `Gmail token取得エラー (${response.status}): ${extractGoogleApiErrorMessage(text)}`,
      }
    }

    const data = parseJsonObjectSafe(text)
    const accessToken = typeof data?.access_token === "string" ? data.access_token.trim() : ""
    if (!accessToken) {
      return { ok: false, error: "Gmail token取得エラー: access_token が空です。" }
    }
    return { ok: true, accessToken }
  } catch (error) {
    return {
      ok: false,
      error: `Gmail token取得エラー: ${sanitizeSingleLine(error instanceof Error ? error.message : String(error))}`,
    }
  }
}

async function fetchGmailProfile(
  accessToken: string,
): Promise<{ ok: true; emailAddress: string | null; historyId: string | null } | { ok: false; error: string }> {
  try {
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })
    const text = await response.text()
    if (!response.ok) {
      return {
        ok: false,
        error: `Gmail profile取得エラー (${response.status}): ${extractGoogleApiErrorMessage(text)}`,
      }
    }

    const data = parseJsonObjectSafe(text)
    const emailAddress = typeof data?.emailAddress === "string" ? data.emailAddress.trim() : ""
    const historyId = data?.historyId == null ? "" : String(data.historyId).trim()
    return {
      ok: true,
      emailAddress: emailAddress || null,
      historyId: historyId || null,
    }
  } catch (error) {
    return {
      ok: false,
      error: `Gmail profile取得エラー: ${sanitizeSingleLine(error instanceof Error ? error.message : String(error))}`,
    }
  }
}

function extractGoogleApiErrorMessage(responseText: string): string {
  const raw = String(responseText ?? "").trim()
  if (!raw) return "unknown error"
  const parsed = parseJsonObjectSafe(raw)
  const nestedMessage = parsed?.error?.message
  if (typeof nestedMessage === "string" && nestedMessage.trim()) {
    return sanitizeSingleLine(nestedMessage)
  }
  const description = parsed?.error_description
  if (typeof description === "string" && description.trim()) {
    return sanitizeSingleLine(description)
  }
  return sanitizeSingleLine(raw)
}

function parseJsonObjectSafe(value: string): Record<string, any> | null {
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function sanitizeSingleLine(value: string): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
}

async function fetchMediaState(
  supabase: ReturnType<typeof createClient>,
  url: URL,
) {
  const limit = clampInt(url.searchParams.get("limit"), MEDIA_LIST_DEFAULT_LIMIT, 1, MEDIA_LIST_MAX_LIMIT)
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, 1000000)
  const roomId = String(url.searchParams.get("room_id") ?? "").trim()
  const mediaType = normalizeMediaType(url.searchParams.get("media_type"))
  const storePartitionKeyRaw = String(url.searchParams.get("store_partition_key") ?? "").trim()
  const storePartitionKey = /^[A-Za-z0-9_]{1,120}$/.test(storePartitionKeyRaw) ? storePartitionKeyRaw : ""

  let query = supabase
    .from("line_message_media")
    .select(
      "id, message_id, line_message_id, room_id, user_id, sender_display_name, media_type, storage_bucket, storage_path, original_file_name, mime_type, file_size_bytes, content_preview, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (storePartitionKey) {
    query = query.eq("store_partition_key", storePartitionKey)
  }
  if (roomId) {
    query = query.eq("room_id", roomId)
  }
  if (mediaType) {
    query = query.eq("media_type", mediaType)
  }

  const [listRes, filteredUsageRes, allUsageRes, mediaUploadMaxMb, storeMediaCounts] = await Promise.all([
    query,
    storePartitionKey
      ? fetchStoreMediaUsage(supabase, storePartitionKey, mediaType)
      : fetchLineMediaUsageStats(supabase, roomId || null, mediaType),
    fetchLineMediaUsageStats(supabase, null, null),
    fetchMediaUploadMaxMb(supabase),
    fetchMediaCountByStore(supabase),
  ])

  const { data, error, count } = listRes
  if (error) {
    throw { status: 500, message: `Failed to fetch media list: ${error.message}` } satisfies AppError
  }
  if (!filteredUsageRes.ok) {
    throw { status: 500, message: filteredUsageRes.message } satisfies AppError
  }
  if (!allUsageRes.ok) {
    throw { status: 500, message: allUsageRes.message } satisfies AppError
  }

  const rows = Array.isArray(data) ? data.map((item) => normalizeMediaListRow(item)).filter((item): item is MediaListRow => item !== null) : []
  const roomNameMap = await fetchRoomNameMapForIds(supabase, rows.map((row) => row.room_id))
  const mediaContextMap = await fetchMediaContextMap(supabase, rows)
  // 既存行（保存時に名前未取得）向け: sender_display_name が空のものだけ user_id から補完。
  const senderNameMap = await fetchSenderNameMapForUserIds(
    supabase,
    rows.filter((row) => !row.sender_display_name && row.user_id).map((row) => String(row.user_id)),
  )
  const items = await Promise.all(rows.map(async (row) => {
    const signedUrl = await createSignedMediaUrl(supabase, row.storage_bucket, row.storage_path)
    const downloadUrl = await createSignedMediaDownloadUrl(
      supabase,
      row.storage_bucket,
      row.storage_path,
      row.original_file_name ?? `${row.line_message_id}`,
    )
    const context = mediaContextMap.get(row.id) ?? null
    return {
      ...row,
      sender_display_name: row.sender_display_name
        ?? (row.user_id ? senderNameMap.get(String(row.user_id)) ?? null : null),
      room_name: roomNameMap.get(row.room_id) ?? row.room_name ?? null,
      context_before_text: context?.before_text ?? null,
      context_before_at: context?.before_at ?? null,
      context_after_text: context?.after_text ?? null,
      context_after_at: context?.after_at ?? null,
      signed_url: signedUrl,
      download_url: downloadUrl ?? signedUrl,
      line_message_tag: formatLineMediaTag(row.line_message_id),
    }
  }))
  const safeTotal = Number.isFinite(Number(count)) ? Number(count) : items.length
  const nextOffset = offset + items.length
  return {
    items,
    total: safeTotal,
    store_media_counts: storeMediaCounts,
    total_file_bytes: filteredUsageRes.stats.total_bytes,
    total_file_count: filteredUsageRes.stats.total_files,
    all_file_bytes: allUsageRes.stats.total_bytes,
    all_file_count: allUsageRes.stats.total_files,
    media_storage_cap_bytes: MEDIA_STORAGE_CAP_BYTES,
    media_storage_usage_ratio: MEDIA_STORAGE_CAP_BYTES > 0
      ? Math.min(1, allUsageRes.stats.total_bytes / MEDIA_STORAGE_CAP_BYTES)
      : 0,
    media_upload_max_mb: mediaUploadMaxMb,
    limit,
    offset,
    has_more: nextOffset < safeTotal,
    next_offset: nextOffset < safeTotal ? nextOffset : null,
    generated_at: new Date().toISOString(),
  }
}

async function fetchDocumentState(
  supabase: ReturnType<typeof createClient>,
  url: URL,
) {
  const limit = clampInt(url.searchParams.get("limit"), DOCUMENT_LIST_DEFAULT_LIMIT, 1, DOCUMENT_LIST_MAX_LIMIT)
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, 1000000)
  const roomId = String(url.searchParams.get("room_id") ?? "").trim()

  let query = supabase
    .from("line_search_documents")
    .select(
      "id, room_id, room_name, storage_bucket, storage_path, original_file_name, mime_type, file_size_bytes, extracted_text, source, created_at, updated_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (roomId) {
    query = query.eq("room_id", roomId)
  }

  const [listRes, filteredUsageRes, allUsageRes] = await Promise.all([
    query,
    fetchLineDocumentUsageStats(supabase, roomId || null),
    fetchLineDocumentUsageStats(supabase, null),
  ])
  const { data, error, count } = listRes
  if (error) {
    throw { status: 500, message: `Failed to fetch document list: ${error.message}` } satisfies AppError
  }
  if (!filteredUsageRes.ok) {
    throw { status: 500, message: filteredUsageRes.message } satisfies AppError
  }
  if (!allUsageRes.ok) {
    throw { status: 500, message: allUsageRes.message } satisfies AppError
  }

  const rows = Array.isArray(data)
    ? data.map((item) => normalizeDocumentListRow(item)).filter((item): item is DocumentListRow => item !== null)
    : []
  const roomNameMap = await fetchRoomNameMapForIds(
    supabase,
    rows.map((row) => row.room_id || "").filter((value) => value.length > 0),
  )
  const items = await Promise.all(rows.map(async (row) => {
    const signedUrl = await createSignedMediaDownloadUrl(
      supabase,
      row.storage_bucket,
      row.storage_path,
      row.original_file_name,
    )
    const normalizedRoomId = row.room_id || null
    const latestRoomName = normalizedRoomId ? (roomNameMap.get(normalizedRoomId) ?? "") : ""
    const normalizedRoomName = latestRoomName
      || (row.room_name ? String(row.room_name) : (normalizedRoomId || null))
    const snippet = buildDocumentSnippet(row.extracted_text, DOCUMENT_PREVIEW_MAX_CHARS)
    return {
      ...row,
      room_id: normalizedRoomId,
      room_name: normalizedRoomName,
      snippet,
      signed_url: signedUrl,
      has_extracted_text: row.extracted_text.length > 0,
      extracted_char_count: row.extracted_text.length,
    }
  }))
  const permissionSummaries = await fetchDocumentPermissionSummaries(supabase, rows.map((row) => row.id))

  const safeTotal = Number.isFinite(Number(count)) ? Number(count) : items.length
  const nextOffset = offset + items.length
  return {
    items: items.map((item) => {
      const summary = permissionSummaries.get(item.id)
      return {
        ...item,
        permission_mode: summary?.mode ?? "public",
        allowed_user_count: summary?.allowed_user_count ?? 0,
      }
    }),
    total: safeTotal,
    total_file_bytes: filteredUsageRes.stats.total_bytes,
    total_file_count: filteredUsageRes.stats.total_files,
    all_file_bytes: allUsageRes.stats.total_bytes,
    all_file_count: allUsageRes.stats.total_files,
    limit,
    offset,
    has_more: nextOffset < safeTotal,
    next_offset: nextOffset < safeTotal ? nextOffset : null,
    generated_at: new Date().toISOString(),
  }
}

async function fetchReservationCalendarState(
  supabase: ReturnType<typeof createClient>,
  url: URL,
) {
  const targetMonth = normalizeCalendarMonthParam(url.searchParams.get("month"))
  const sourceFilter = normalizeReservationSourceFilter(url.searchParams.get("source"))
  const storeScope = normalizeReservationStoreScope(url.searchParams.get("store_key") ?? url.searchParams.get("store"))
  // 非表示（ソフト削除）の行は既定で除外。include_hidden=1 のときだけ含める（確認・復元用）。
  const includeHidden = url.searchParams.get("include_hidden") === "1"
  const range = buildJstMonthRange(targetMonth)
  const baseSources: Array<"tabelog" | "ikyu"> = sourceFilter === "all"
    ? ["tabelog", "ikyu"]
    : (sourceFilter === "tabelog" || sourceFilter === "ikyu" ? [sourceFilter] : [])
  const includeManual = sourceFilter === "all" || sourceFilter === "manual"
  const items: Array<Record<string, unknown>> = []
  const sourceCounts: Record<string, number> = {
    tabelog: 0,
    ikyu: 0,
    manual: 0,
  }

  for (const source of baseSources) {
    const { eventTable, summaryTable } = getReservationSourceTables(source)

    const [eventsRes, summariesRes] = await Promise.all([
      supabase
        .from(eventTable)
        .select(RESERVATION_EVENT_SELECT_COLUMNS)
        .gte("visit_at", range.startIso)
        .lt("visit_at", range.endIso)
        .order("visit_at", { ascending: true })
        .limit(2000),
      supabase
        .from(summaryTable)
        .select("customer_name, customer_phone, visit_count, last_visit_at")
        .limit(5000),
    ])

    if (eventsRes.error) {
      throw { status: 500, message: `Failed to fetch ${source} reservation events: ${eventsRes.error.message}` } satisfies AppError
    }
    if (summariesRes.error) {
      throw { status: 500, message: `Failed to fetch ${source} reservation summaries: ${summariesRes.error.message}` } satisfies AppError
    }

    const summaryByCustomer = await buildReservationEffectiveSummaryLookup(
      supabase,
      eventTable,
      eventsRes.data,
      summariesRes.data,
    )

    for (const row of eventsRes.data ?? []) {
      const record = row as Record<string, unknown>
      if (!includeHidden && record.manual_hidden === true) continue
      const item = buildReservationCalendarItem(source, record, summaryByCustomer)
      if (!item) continue
      if (!reservationCalendarItemMatchesStoreScope(item, storeScope)) continue
      items.push(item)
      sourceCounts[source] += 1
    }
  }

  // 手入力（新規）予約: gmail_message_id もサマリも持たないため別途読み込む。
  if (includeManual) {
    const { data: manualRows, error: manualErr } = await supabase
      .from("manual_reservation_visit_events")
      .select(MANUAL_RESERVATION_SELECT_COLUMNS)
      .gte("visit_at", range.startIso)
      .lt("visit_at", range.endIso)
      .order("visit_at", { ascending: true })
      .limit(2000)
    if (manualErr) {
      throw { status: 500, message: `Failed to fetch manual reservation events: ${manualErr.message}` } satisfies AppError
    }
    for (const row of manualRows ?? []) {
      const record = row as Record<string, unknown>
      if (!includeHidden && record.manual_hidden === true) continue
      const item = buildReservationCalendarItem("manual", record, null)
      if (!item) continue
      if (!reservationCalendarItemMatchesStoreScope(item, storeScope)) continue
      items.push(item)
      sourceCounts.manual += 1
    }
  }

  items.sort((a, b) => String(a.visit_at ?? "").localeCompare(String(b.visit_at ?? "")))

  return {
    month: targetMonth,
    month_start_iso: range.startIso,
    month_end_iso: range.endIso,
    source_filter: sourceFilter,
    include_hidden: includeHidden,
    total: items.length,
    source_counts: sourceCounts,
    items,
    generated_at: new Date().toISOString(),
  }
}

async function fetchReservationSearchState(
  supabase: ReturnType<typeof createClient>,
  url: URL,
) {
  const query = normalizeReservationSearchQuery(url.searchParams.get("q"))
  if (!query) {
    throw { status: 400, message: "q is required." } satisfies AppError
  }

  const sourceFilter = normalizeReservationSourceFilter(url.searchParams.get("source"))
  const storeScope = normalizeReservationStoreScope(url.searchParams.get("store_key") ?? url.searchParams.get("store"))
  const limit = clampInt(
    url.searchParams.get("limit"),
    RESERVATION_SEARCH_DEFAULT_LIMIT,
    1,
    RESERVATION_SEARCH_MAX_LIMIT,
  )
  const includeHidden = url.searchParams.get("include_hidden") === "1"
  const baseSources: Array<"tabelog" | "ikyu"> = sourceFilter === "all"
    ? ["tabelog", "ikyu"]
    : (sourceFilter === "tabelog" || sourceFilter === "ikyu" ? [sourceFilter] : [])
  const includeManual = sourceFilter === "all" || sourceFilter === "manual"
  const sourceFetchLimit = Math.min(
    RESERVATION_SEARCH_SOURCE_FETCH_CAP,
    Math.max(limit, Math.ceil(limit * 2)),
  )
  const searchPatterns = buildReservationNameSearchPatterns(query)
  const escapedPatterns = searchPatterns
    .map((pattern) => escapeLikePattern(pattern))
    .filter((pattern) => pattern.length > 0)
  // 氏名 or 詳細(JSON文字列)に対する ilike OR フィルタ（tabelog/ikyu/手入力で共通利用）。
  const orFilter = (() => {
    if (escapedPatterns.length === 0) return ""
    const filters: string[] = []
    for (const pattern of escapedPatterns) {
      filters.push(`customer_name.ilike.%${pattern}%`)
      filters.push(`reservation_detail.ilike.%${pattern}%`)
    }
    return filters.join(",")
  })()

  const items: Array<Record<string, unknown>> = []
  const sourceCounts: Record<string, number> = {
    tabelog: 0,
    ikyu: 0,
    manual: 0,
  }
  const sourceLimitReached: Record<string, boolean> = {
    tabelog: false,
    ikyu: false,
    manual: false,
  }

  for (const source of baseSources) {
    const { eventTable, summaryTable } = getReservationSourceTables(source)

    let eventsQuery = supabase
      .from(eventTable)
      .select(RESERVATION_EVENT_SELECT_COLUMNS)
      .order("visit_at", { ascending: false })
      .limit(sourceFetchLimit)
    if (orFilter) eventsQuery = eventsQuery.or(orFilter)

    const [{ data, error }, summariesRes] = await Promise.all([
      eventsQuery,
      supabase
        .from(summaryTable)
        .select("customer_name, customer_phone, visit_count, last_visit_at")
        .limit(5000),
    ])

    if (error) {
      throw { status: 500, message: `Failed to search ${source} reservations: ${error.message}` } satisfies AppError
    }
    if (summariesRes.error) {
      throw { status: 500, message: `Failed to fetch ${source} reservation summaries: ${summariesRes.error.message}` } satisfies AppError
    }

    const eventRows = Array.isArray(data) ? data : []
    const summaryByCustomer = await buildReservationEffectiveSummaryLookup(
      supabase,
      eventTable,
      eventRows,
      summariesRes.data,
    )
    if (eventRows.length >= sourceFetchLimit) {
      sourceLimitReached[source] = true
    }

    for (const row of eventRows) {
      const record = row as Record<string, unknown>
      if (!includeHidden && record.manual_hidden === true) continue
      const item = buildReservationCalendarItem(source, record, summaryByCustomer)
      if (!item) continue
      if (!reservationCalendarItemMatchesStoreScope(item, storeScope)) continue
      if (!matchesReservationSearchItem(item, query)) continue
      items.push(item)
      sourceCounts[source] += 1
    }
  }

  if (includeManual) {
    let manualQuery = supabase
      .from("manual_reservation_visit_events")
      .select(MANUAL_RESERVATION_SELECT_COLUMNS)
      .order("visit_at", { ascending: false })
      .limit(sourceFetchLimit)
    if (orFilter) manualQuery = manualQuery.or(orFilter)
    const { data: manualRows, error: manualErr } = await manualQuery
    if (manualErr) {
      throw { status: 500, message: `Failed to search manual reservations: ${manualErr.message}` } satisfies AppError
    }
    const manualList = Array.isArray(manualRows) ? manualRows : []
    if (manualList.length >= sourceFetchLimit) sourceLimitReached.manual = true
    for (const row of manualList) {
      const record = row as Record<string, unknown>
      if (!includeHidden && record.manual_hidden === true) continue
      const item = buildReservationCalendarItem("manual", record, null)
      if (!item) continue
      if (!reservationCalendarItemMatchesStoreScope(item, storeScope)) continue
      if (!matchesReservationSearchItem(item, query)) continue
      items.push(item)
      sourceCounts.manual += 1
    }
  }

  items.sort((a, b) => String(b.visit_at ?? "").localeCompare(String(a.visit_at ?? "")))
  const truncated = items.length > limit ||
    sourceLimitReached.tabelog || sourceLimitReached.ikyu || sourceLimitReached.manual

  return {
    query,
    source_filter: sourceFilter,
    include_hidden: includeHidden,
    limit,
    total: items.length,
    truncated,
    source_counts: sourceCounts,
    items: items.slice(0, limit),
    generated_at: new Date().toISOString(),
  }
}

/**
 * Journal Report AI チャット向け予約確定事実。
 * - 氏名は載せる / 電話はレスポンスに含めない
 * - visit_count はチャネル別ネット予約回数（POS来店回数ではない）
 * - 手入力も summary lookup を付けて新規/リピートを返す（カレンダー経路は従来どおり）
 */
async function fetchReservationAiFactsLive(
  supabase: ReturnType<typeof createClient>,
  url: URL,
  options: { allStores?: boolean } = {},
) {
  const storeScope = normalizeReservationStoreScope(
    url.searchParams.get("store_key") ?? url.searchParams.get("store"),
  )
  const allStores = options.allStores === true
  if (!storeScope && !allStores) {
    throw { status: 400, message: "store_key is required." } satisfies AppError
  }
  // normalizeCalendarMonthParam は未指定だと「現在月」を返す。黙って現在月にすると
  // 呼び出し側の指定漏れに気付けないため、生の値が空かどうかで必須チェックを行う。
  const rawMonthFrom = String(
    url.searchParams.get("month_from") ?? url.searchParams.get("month") ?? "",
  ).trim()
  if (!rawMonthFrom) {
    throw { status: 400, message: "month_from is required." } satisfies AppError
  }
  const rawMonthTo = String(url.searchParams.get("month_to") ?? "").trim() || rawMonthFrom
  const monthFrom = normalizeCalendarMonthParam(rawMonthFrom)
  const monthTo = normalizeCalendarMonthParam(rawMonthTo)
  const months = listCalendarMonthsInclusive(monthFrom, monthTo, RESERVATION_AI_FACTS_MAX_MONTHS)
  if (months.length === 0) {
    throw { status: 400, message: "month_from / month_to is invalid." } satisfies AppError
  }
  const sourceFilter = normalizeReservationSourceFilter(url.searchParams.get("source"))
  const limit = clampInt(
    url.searchParams.get("limit"),
    RESERVATION_AI_FACTS_DEFAULT_LIMIT,
    1,
    RESERVATION_AI_FACTS_MAX_LIMIT,
  )
  const includeHidden = url.searchParams.get("include_hidden") === "1"
  const internalUnbounded = url.searchParams.get("internal_unbounded") === "1"
  const requestedDateFrom = toSafeString(url.searchParams.get("date_from"))
  const requestedDateToExclusive = toSafeString(url.searchParams.get("date_to_exclusive"))
  const baseSources: Array<"tabelog" | "ikyu"> = sourceFilter === "all"
    ? ["tabelog", "ikyu"]
    : (sourceFilter === "tabelog" || sourceFilter === "ikyu" ? [sourceFilter] : [])
  const includeManual = sourceFilter === "all" || sourceFilter === "manual"

  const rawItems: Array<Record<string, unknown>> = []
  const chronologyRows: ReservationChronologyItem[] = []

  // 走査対象チャネル。tabelog / ikyu は共通ヘルパ、manual は専用テーブル。
  const scanTargets: Array<{
    source: "tabelog" | "ikyu" | "manual"
    eventTable:
      | "tabelog_reservation_visit_events"
      | "ikyu_reservation_visit_events"
      | "manual_reservation_visit_events"
    summaryTable: string
    selectColumns: string
  }> = []
  for (const source of baseSources) {
    const { eventTable, summaryTable } = getReservationSourceTables(source)
    scanTargets.push({ source, eventTable, summaryTable, selectColumns: RESERVATION_EVENT_SELECT_COLUMNS })
  }
  if (includeManual) {
    scanTargets.push({
      source: "manual",
      eventTable: "manual_reservation_visit_events",
      summaryTable: "manual_reservation_visit_summaries",
      selectColumns: MANUAL_RESERVATION_SELECT_COLUMNS,
    })
  }
  const chronologyTargets: typeof scanTargets = [
    {
      source: "tabelog",
      eventTable: "tabelog_reservation_visit_events",
      summaryTable: "tabelog_reservation_visit_summaries",
      selectColumns: RESERVATION_EVENT_SELECT_COLUMNS,
    },
    {
      source: "ikyu",
      eventTable: "ikyu_reservation_visit_events",
      summaryTable: "ikyu_reservation_visit_summaries",
      selectColumns: RESERVATION_EVENT_SELECT_COLUMNS,
    },
    {
      source: "manual",
      eventTable: "manual_reservation_visit_events",
      summaryTable: "manual_reservation_visit_summaries",
      selectColumns: MANUAL_RESERVATION_SELECT_COLUMNS,
    },
  ]

  for (const target of scanTargets) {
    const monthEvents: Array<Record<string, unknown>> = []
    for (const month of months) {
      const range = buildJstMonthRange(month)
      const rangeStartIso = requestedDateFrom && requestedDateFrom > range.startIso
        ? requestedDateFrom
        : range.startIso
      const rangeEndIso = requestedDateToExclusive && requestedDateToExclusive < range.endIso
        ? requestedDateToExclusive
        : range.endIso
      if (rangeStartIso >= rangeEndIso) continue
      monthEvents.push(...await fetchReservationEventRowsPaged(
        supabase,
        target.eventTable,
        target.selectColumns,
        { fromIso: rangeStartIso, toIsoExclusive: rangeEndIso },
      ))
    }
    if (monthEvents.length === 0) continue

    const summariesRes = await supabase
      .from(target.summaryTable)
      .select("customer_name, customer_phone, visit_count, last_visit_at")
      .limit(5000)
    if (summariesRes.error) {
      throw {
        status: 500,
        message: `Failed to fetch ${target.source} reservation summaries: ${summariesRes.error.message}`,
      } satisfies AppError
    }
    const summaryByCustomer = await buildReservationEffectiveSummaryLookup(
      supabase,
      target.eventTable,
      monthEvents,
      summariesRes.data,
    )
    for (const record of monthEvents) {
      if (!includeHidden && record.manual_hidden === true) continue
      const item = buildReservationCalendarItem(target.source, record, summaryByCustomer)
      if (!item) continue
      if (!allStores && !reservationCalendarItemMatchesStoreScope(item, storeScope)) continue
      rawItems.push({ ...item, _is_cancelled: isReservationCancellationRow(record) })
    }
  }

  // 対象予約より前の履歴も含め、3チャネル横断で「予約時点の店舗別回数」を算出する。
  if (rawItems.length) {
    for (const target of chronologyTargets) {
      const historyRows = await fetchReservationEventRowsPaged(
        supabase,
        target.eventTable,
        target.selectColumns,
        {
          toIsoExclusive: requestedDateToExclusive || buildJstMonthRange(months[months.length - 1]).endIso,
        },
      )
      for (const record of historyRows) {
        const item = buildReservationCalendarItem(target.source, record, null)
        if (!item) continue
        const resolvedStoreKey = resolveReservationCalendarItemStoreKey(item)
        if (!resolvedStoreKey) continue
        chronologyRows.push({
          source: target.source,
          id: Number(record.id ?? 0),
          store_key: resolvedStoreKey,
          customer_name: toSafeString(record.customer_name),
          customer_phone: toSafeString(record.customer_phone),
          visit_at: toSafeString(record.visit_at) || toSafeString(record.created_at),
          is_cancelled: isReservationCancellationRow(record),
          is_hidden: record.manual_hidden === true,
          reservation_key: extractReservationNoFromReservationRow(record) ||
            toSafeString(record.gmail_message_id) ||
            `${target.source}:${Number(record.id ?? 0)}`,
        })
      }
    }
  }

  rawItems.sort((a, b) => String(a.visit_at ?? "").localeCompare(String(b.visit_at ?? "")))

  const byChannel = { tabelog: 0, ikyu: 0, manual: 0 }
  let reservationCount = 0
  let cancelledCount = 0
  let newCount = 0
  let repeatCount = 0
  let unknownCount = 0
  let allergyNotedCount = 0
  // 予約人数の合計。AI 側に「2名」「3」を数えさせるとキャンセル・件数上限で狂うため、
  // サーバで数値化して合計まで出す（ウォークイン推定＝POS客数−予約人数 に使う）。
  let guestTotal = 0
  let guestUnknownCount = 0
  // 月次予約集計（明細上限で切れても totals / by_month は全件ベース）。
  // クライアントが POS 月次と突き合わせて飛び込み推定表を作る。
  const byMonthMap = new Map<string, {
    year_month: string
    reservation_count: number
    cancelled_count: number
    guest_total: number
    guest_unknown_count: number
    new_count: number
    repeat_count: number
    unknown_count: number
    by_channel: { tabelog: number; ikyu: number; manual: number }
  }>()

  const chronologyByEvent = annotateReservationChronology(chronologyRows)
  const mapped = rawItems.map((item) => {
    const source = String(item.source ?? "") as "tabelog" | "ikyu" | "manual"
    const isCancelled = item._is_cancelled === true
    const partySize = parseReservationPartySize(item.party_size_label)
    const chronology = chronologyByEvent.get(`${source}:${Number(item.id ?? 0)}`)
    // AI用は「この予約時点・この店舗・全チャネル横断」の予約回数を正本にする。
    const visitCount = chronology?.visit_count ?? 0
    const guestType = chronology?.guest_type ?? "unknown"
    const yearMonth = toSafeString(item.visit_month) ||
      buildCalendarVisitMonthLabel(toSafeString(item.visit_at)) ||
      ""

    // 集計の分母は「キャンセルを除いた予約」で統一する。
    // by_channel や new/repeat だけがキャンセルを含むと、
    // 「予約10件」なのに内訳合計が13件、という食い違いがそのままAIの回答に出る。
    if (isCancelled) {
      cancelledCount += 1
      if (yearMonth) {
        const m = byMonthMap.get(yearMonth) || {
          year_month: yearMonth,
          reservation_count: 0,
          cancelled_count: 0,
          guest_total: 0,
          guest_unknown_count: 0,
          new_count: 0,
          repeat_count: 0,
          unknown_count: 0,
          by_channel: { tabelog: 0, ikyu: 0, manual: 0 },
        }
        m.cancelled_count += 1
        byMonthMap.set(yearMonth, m)
      }
    } else {
      reservationCount += 1
      if (source === "tabelog" || source === "ikyu" || source === "manual") {
        byChannel[source] += 1
      }
      if (guestType === "new") newCount += 1
      else if (guestType === "repeat") repeatCount += 1
      else unknownCount += 1
      if (toSafeString(item.allergy_label)) allergyNotedCount += 1
      if (partySize === null) guestUnknownCount += 1
      else guestTotal += partySize

      if (yearMonth) {
        const m = byMonthMap.get(yearMonth) || {
          year_month: yearMonth,
          reservation_count: 0,
          cancelled_count: 0,
          guest_total: 0,
          guest_unknown_count: 0,
          new_count: 0,
          repeat_count: 0,
          unknown_count: 0,
          by_channel: { tabelog: 0, ikyu: 0, manual: 0 },
        }
        m.reservation_count += 1
        if (source === "tabelog" || source === "ikyu" || source === "manual") {
          m.by_channel[source] += 1
        }
        if (guestType === "new") m.new_count += 1
        else if (guestType === "repeat") m.repeat_count += 1
        else m.unknown_count += 1
        if (partySize === null) m.guest_unknown_count += 1
        else m.guest_total += partySize
        byMonthMap.set(yearMonth, m)
      }
    }

    return {
      source,
      id: Number(item.id ?? 0),
      visit_at: toSafeString(item.visit_at),
      customer_name: toSafeString(item.customer_name_label) || toSafeString(item.customer_name),
      party_size_label: toSafeString(item.party_size_label) || null,
      party_size: partySize,
      plan_label: toSafeString(item.plan_label) || null,
      allergy_label: toSafeString(item.allergy_label) || null,
      channel: toSafeString(item.route_label) || source,
      store_name: toSafeString(item.store_name) || null,
      store_key: resolveReservationCalendarItemStoreKey(item),
      visit_count: visitCount,
      last_visit_at: chronology?.last_visit_at || null,
      guest_type: guestType,
      is_cancelled: isCancelled,
    }
  })

  const byMonth = [...byMonthMap.values()].sort((a, b) =>
    a.year_month.localeCompare(b.year_month)
  )

  const truncated = mapped.length > limit
  return {
    store_key: allStores ? null : storeScope,
    period: { month_from: months[0], month_to: months[months.length - 1] },
    source_filter: sourceFilter,
    totals: {
      reservation_count: reservationCount,
      cancelled_count: cancelledCount,
      new_count: newCount,
      repeat_count: repeatCount,
      unknown_count: unknownCount,
      by_channel: byChannel,
      allergy_noted_count: allergyNotedCount,
      // 予約人数の合計（キャンセル除外）。組数は reservation_count と同じ。
      guest_total: guestTotal,
      guest_unknown_count: guestUnknownCount,
    },
    by_month: byMonth,
    items: internalUnbounded ? mapped : mapped.slice(0, limit),
    truncated: internalUnbounded ? false : truncated,
    generated_at: new Date().toISOString(),
    notes: [
      "visit_count はチャネル別の予約ネット回数（POS来店回数ではない）",
      "予約人数 ≠ 会計客数。ウォークインは含まれない",
      "電話番号は確定集計に含めない（氏名のみ）",
      "by_channel・新規/リピート/回数不明・アレルギー記載はキャンセルを除いた件数。合計は reservation_count と一致する",
      "guest_total は予約人数の合計（キャンセル除外）。予約組数は reservation_count と同じ。guest_unknown_count は人数が読み取れなかった予約件数で、その分 guest_total は少なめに出る",
      "by_month は明細上限の影響を受けない月次予約集計。POS月次と突き合わせて飛び込み推定に使う",
      "ウォークイン（飛び込み）は POS客数 − guest_total ／ POS会計組数 − reservation_count で推定できる。ただし一致はしないので必ず『推定』と述べること",
      "取り込み経路: 食べログ・一休は予約通知メールからの自動取り込み。それ以外（電話・直接来店の予約など）は LINE に送られた予約スクショを AI が読み取って登録した分だけが manual に入る",
      "したがって、スクショを送り忘れた予約・通知メールが届かなかった予約は丸ごと欠落し、その分はウォークイン側に計上される（ウォークインが過大に出る）",
      "スクショ経由は画像認識のため、人数・氏名・日時の読み違いが混じることがある",
      "推定がずれるその他の要因: ノーショー（予約は残るが会計が無い＝ウォークインを過少に見せる）、予約人数と実来店人数の相違、1予約が複数会計に分かれる、予約は visit_at・売上は営業日付のため深夜会計が前日扱いになる月境界のズレ",
    ],
  }
}

function jstTodayDateKey(base = new Date()): string {
  const jst = new Date(base.getTime() + 9 * 60 * 60 * 1000)
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}-${String(jst.getUTCDate()).padStart(2, "0")}`
}

function addReservationDateDays(dateKey: string, days: number): string {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!matched) return dateKey
  const shifted = new Date(Date.UTC(
    Number(matched[1]),
    Number(matched[2]) - 1,
    Number(matched[3]) + days,
  ))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`
}

function reservationDateStartIso(dateKey: string): string {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!matched) return ""
  return new Date(Date.UTC(
    Number(matched[1]),
    Number(matched[2]) - 1,
    Number(matched[3]),
    -9,
    0,
    0,
  )).toISOString()
}

function reservationMonthFromDateKey(dateKey: string): string {
  return /^\d{4}-\d{2}/.test(dateKey) ? dateKey.slice(0, 7) : ""
}

function reservationCacheWindowStart(today: string, months: number): string {
  const matched = /^(\d{4})-(\d{2})-\d{2}$/.exec(today)
  if (!matched) return today
  const shifted = new Date(Date.UTC(
    Number(matched[1]),
    Number(matched[2]) - 1 - Math.max(0, Math.floor(months) - 1),
    1,
  ))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-01`
}

function reservationAiBaseNotes(): string[] {
  return [
    "visit_count はチャネル別の予約ネット回数（POS来店回数ではない）",
    "予約人数 ≠ 会計客数。ウォークインは含まれない",
    "電話番号は確定集計に含めない（氏名のみ）",
    "by_channel・新規/リピート/回数不明・アレルギー記載はキャンセルを除いた件数。合計は reservation_count と一致する",
    "guest_total は予約人数の合計（キャンセル除外）。予約組数は reservation_count と同じ。guest_unknown_count は人数が読み取れなかった予約件数で、その分 guest_total は少なめに出る",
    "ウォークイン（飛び込み）は POS客数 − guest_total ／ POS会計組数 − reservation_count で推定できる。ただし一致はしないので必ず『推定』と述べること",
    "取り込み経路: 食べログ・一休は予約通知メールからの自動取り込み。それ以外（電話・直接来店の予約など）は LINE に送られた予約スクショを AI が読み取って登録した分だけが manual に入る",
    "したがって、スクショを送り忘れた予約・通知メールが届かなかった予約は丸ごと欠落し、その分はウォークイン側に計上される（ウォークインが過大に出る）",
    "スクショ経由は画像認識のため、人数・氏名・日時の読み違いが混じることがある",
    "推定がずれるその他の要因: ノーショー（予約は残るが会計が無い＝ウォークインを過少に見せる）、予約人数と実来店人数の相違、1予約が複数会計に分かれる、予約は visit_at・売上は営業日付のため深夜会計が前日扱いになる月境界のズレ",
  ]
}

async function fetchReservationEventRowsPaged(
  supabase: ReturnType<typeof createClient>,
  table: ReservationEventTable,
  selectColumns: string,
  options: {
    fromIso?: string
    toIsoExclusive?: string
  } = {},
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  for (let offset = 0; offset < RESERVATION_EVENT_FETCH_MAX_ROWS; offset += RESERVATION_EVENT_PAGE_SIZE) {
    let query = supabase
      .from(table)
      .select(selectColumns)
      .order("visit_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + RESERVATION_EVENT_PAGE_SIZE - 1)
    if (options.fromIso) query = query.gte("visit_at", options.fromIso)
    if (options.toIsoExclusive) query = query.lt("visit_at", options.toIsoExclusive)
    const { data, error } = await query
    if (error) {
      throw {
        status: 500,
        message: `Failed to fetch reservation rows from ${table}: ${error.message}`,
      } satisfies AppError
    }
    const rows: Record<string, unknown>[] = []
    for (const row of (Array.isArray(data) ? data as unknown[] : [])) {
      if (isRecord(row)) rows.push(row)
    }
    out.push(...rows)
    if (rows.length < RESERVATION_EVENT_PAGE_SIZE) return out
  }
  throw {
    status: 500,
    message: `Reservation history exceeds the safe fetch cap for ${table}.`,
  } satisfies AppError
}

function buildReservationLiveUrl(
  storeKey: string,
  monthFrom: string,
  monthTo: string,
  dateFromIso?: string,
  dateToExclusiveIso?: string,
): URL {
  const url = new URL("https://internal.invalid/reservations/ai-facts")
  url.searchParams.set("store_key", storeKey)
  url.searchParams.set("month_from", monthFrom)
  url.searchParams.set("month_to", monthTo)
  url.searchParams.set("limit", String(RESERVATION_AI_FACTS_MAX_LIMIT))
  url.searchParams.set("internal_unbounded", "1")
  if (dateFromIso) url.searchParams.set("date_from", dateFromIso)
  if (dateToExclusiveIso) url.searchParams.set("date_to_exclusive", dateToExclusiveIso)
  return url
}

async function fetchReservationAiFacts(
  supabase: ReturnType<typeof createClient>,
  url: URL,
) {
  const storeKey = normalizeReservationStoreScope(
    url.searchParams.get("store_key") ?? url.searchParams.get("store"),
  )
  if (!storeKey) {
    throw { status: 400, message: "store_key is required." } satisfies AppError
  }
  const rawMonthFrom = toSafeString(url.searchParams.get("month_from") ?? url.searchParams.get("month"))
  if (!rawMonthFrom) {
    throw { status: 400, message: "month_from is required." } satisfies AppError
  }
  const monthFrom = normalizeCalendarMonthParam(rawMonthFrom)
  const monthTo = normalizeCalendarMonthParam(
    toSafeString(url.searchParams.get("month_to")) || monthFrom,
  )
  const months = listCalendarMonthsInclusive(monthFrom, monthTo, RESERVATION_AI_FACTS_MAX_MONTHS)
  if (months.length === 0) {
    throw { status: 400, message: "month_from / month_to is invalid." } satisfies AppError
  }
  const limit = clampInt(
    url.searchParams.get("limit"),
    RESERVATION_AI_FACTS_DEFAULT_LIMIT,
    1,
    RESERVATION_AI_FACTS_MAX_LIMIT,
  )
  // 日次キャッシュは全チャネル・非表示除外の標準形だけを保持する。
  // 管理用のチャネル指定/非表示確認は従来どおりDBを直接読み、API互換を維持する。
  if (
    normalizeReservationSourceFilter(url.searchParams.get("source")) !== "all" ||
    url.searchParams.get("include_hidden") === "1"
  ) {
    return await fetchReservationAiFactsLive(supabase, url)
  }
  const includeItems = url.searchParams.get("include_items") !== "0"
  const { data: lastRunRows, error: lastRunError } = await supabase
    .from("reservation_ai_cache_runs")
    .select("finished_at")
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(1)
  if (lastRunError) {
    console.error("reservation cache run status load failed:", lastRunError.message)
  }
  const lastSuccessAt = toSafeString(
    Array.isArray(lastRunRows) && lastRunRows[0]
      ? (lastRunRows[0] as Record<string, unknown>).finished_at
      : "",
  )
  const lastSuccessMs = Date.parse(lastSuccessAt)
  const cacheStale = !Number.isFinite(lastSuccessMs) ||
    Date.now() - lastSuccessMs > RESERVATION_AI_CACHE_STALE_MS

  const today = jstTodayDateKey()
  const requestStartDate = `${months[0]}-01`
  const requestEndDateExclusive = addReservationDateDays(
    `${months[months.length - 1]}-01`,
    new Date(Date.UTC(
      Number(months[months.length - 1].slice(0, 4)),
      Number(months[months.length - 1].slice(5, 7)),
      0,
    )).getUTCDate(),
  )
  const payloads: ReservationAiFactsPayload[] = []
  let cacheDays = 0
  let expectedPastDays = 0
  let liveFallbackDays = 0
  let futureLive = false

  const pastEndExclusive = requestEndDateExclusive < today ? requestEndDateExclusive : today
  if (requestStartDate < pastEndExclusive && !cacheStale) {
    const pastDateKeys = enumerateReservationDateKeys(requestStartDate, pastEndExclusive)
    expectedPastDays = pastDateKeys.length
    const { data: coverageRow, error: coverageError } = await supabase
      .from("reservation_ai_cache_coverage")
      .select("covered_from, covered_to")
      .eq("store_partition_key", storeKey)
      .maybeSingle()
    if (coverageError) console.error("reservation cache coverage load failed:", coverageError.message)
    const coveredFrom = toSafeString((coverageRow as Record<string, unknown> | null)?.covered_from)
    const coveredTo = toSafeString((coverageRow as Record<string, unknown> | null)?.covered_to)
    const { data: cachedRows, error: cacheError } = await supabase
      .from(RESERVATION_AI_CACHE_TABLE)
      .select(includeItems ? "fact_date, facts" : "fact_date, summary_facts")
      .eq("store_partition_key", storeKey)
      .gte("fact_date", requestStartDate)
      .lt("fact_date", pastEndExclusive)
      .order("fact_date", { ascending: true })
    if (cacheError) {
      console.error("reservation AI cache load failed:", cacheError.message)
    }
    const cachedByDate = new Map<string, ReservationAiFactsPayload>()
    for (const row of (Array.isArray(cachedRows) ? cachedRows : [])) {
      const dateKey = toSafeString((row as Record<string, unknown>).fact_date)
      const facts = includeItems
        ? (row as Record<string, unknown>).facts
        : (row as Record<string, unknown>).summary_facts
      if (dateKey && isRecord(facts)) cachedByDate.set(dateKey, facts as ReservationAiFactsPayload)
    }
    const missingDates: string[] = []
    for (const dateKey of pastDateKeys) {
      const payload = cachedByDate.get(dateKey)
      if (payload) {
        payloads.push(payload)
        cacheDays += 1
      } else if (coveredFrom && coveredTo && dateKey >= coveredFrom && dateKey <= coveredTo) {
        // coverage内で行が無い日は「予約0件」。空行を物理保存しない。
        payloads.push({ totals: emptyReservationAiTotals(), by_month: [], items: [], truncated: false, notes: [] })
        cacheDays += 1
      } else {
        missingDates.push(dateKey)
      }
    }
    if (missingDates.length) {
      const livePast = await fetchReservationAiFactsLive(
        supabase,
        buildReservationLiveUrl(
          storeKey,
          reservationMonthFromDateKey(requestStartDate),
          reservationMonthFromDateKey(addReservationDateDays(pastEndExclusive, -1)),
          reservationDateStartIso(missingDates[0]),
          reservationDateStartIso(addReservationDateDays(missingDates[missingDates.length - 1], 1)),
        ),
      )
      const missingSet = new Set(missingDates)
      const items = (Array.isArray(livePast.items) ? livePast.items : [])
        .filter((item: ReservationAiFactItem) => {
          const dateKey = reservationJstDateKey(item.visit_at)
          return !!dateKey && missingSet.has(dateKey)
        })
      payloads.push({
        totals: aggregateReservationAiItems(items),
        by_month: aggregateReservationAiItemsByMonth(items),
        items: includeItems ? items : [],
        truncated: livePast.truncated === true,
        notes: Array.isArray(livePast.notes) ? livePast.notes : [],
      })
      liveFallbackDays = missingDates.length
    }
  }
  if (requestStartDate < pastEndExclusive && cacheStale) {
    const livePast = await fetchReservationAiFactsLive(
      supabase,
      buildReservationLiveUrl(
        storeKey,
        reservationMonthFromDateKey(requestStartDate),
        reservationMonthFromDateKey(addReservationDateDays(pastEndExclusive, -1)),
        reservationDateStartIso(requestStartDate),
        reservationDateStartIso(pastEndExclusive),
      ),
    )
    payloads.push({
      ...(livePast as ReservationAiFactsPayload),
      items: includeItems && Array.isArray(livePast.items) ? livePast.items : [],
    })
    liveFallbackDays = enumerateReservationDateKeys(requestStartDate, pastEndExclusive).length
  }

  const futureStartDate = requestStartDate > today ? requestStartDate : today
  if (futureStartDate < requestEndDateExclusive) {
    const futurePayload = await fetchReservationAiFactsLive(
      supabase,
      buildReservationLiveUrl(
        storeKey,
        reservationMonthFromDateKey(futureStartDate),
        reservationMonthFromDateKey(addReservationDateDays(requestEndDateExclusive, -1)),
        reservationDateStartIso(futureStartDate),
        reservationDateStartIso(requestEndDateExclusive),
      ),
    )
    payloads.push(futurePayload as ReservationAiFactsPayload)
    futureLive = true
  }

  const merged = mergeReservationAiFactsPayloads(payloads, limit)
  return {
    store_key: storeKey,
    period: { month_from: months[0], month_to: months[months.length - 1] },
    source_filter: "all",
    totals: merged.totals,
    by_month: merged.by_month,
    items: includeItems ? merged.items : [],
    truncated: merged.truncated,
    generated_at: new Date().toISOString(),
    notes: [
      ...reservationAiBaseNotes(),
      `過去予約キャッシュ: ${cacheDays}/${expectedPastDays}日`,
      liveFallbackDays
        ? `キャッシュ未作成の過去${liveFallbackDays}日分はDBを直接参照`
        : "過去予約は日次確定キャッシュを参照",
      futureLive ? "本日以降の予約は最新DBを直接参照" : "未来予約のDB直接参照なし",
      includeItems
        ? "氏名入り予約明細を取得"
        : "通常分析のため氏名入り明細を省略し、集計のみ取得",
    ],
    cache: {
      mode: futureLive ? "past_cache_plus_live_future" : "past_cache",
      cached_days: cacheDays,
      expected_past_days: expectedPastDays,
      live_fallback_days: liveFallbackDays,
      future_live: futureLive,
      cutoff_date_jst: today,
      stale: cacheStale,
      last_success_at: lastSuccessAt || null,
    },
  }
}

async function rebuildReservationAiDailyCache(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
) {
  const startedAtMs = Date.now()
  const { data: runRow, error: runInsertError } = await supabase
    .from("reservation_ai_cache_runs")
    .insert({ status: "running", started_at: new Date(startedAtMs).toISOString() })
    .select("id")
    .single()
  if (runInsertError) {
    throw { status: 500, message: `Failed to start reservation cache run: ${runInsertError.message}` } satisfies AppError
  }
  const runId = Number((runRow as Record<string, unknown> | null)?.id ?? 0)
  try {
  const today = jstTodayDateKey()
  const defaultFrom = reservationCacheWindowStart(today, RESERVATION_AI_CACHE_MONTHS)
  const requestedStore = normalizeReservationStoreScope(body.store_key)
  const forceFull = body.force_full === true
  const storeKeys = requestedStore
    ? [requestedStore]
    : listReceiptSheetsStores().map((store) => store.storePartitionKey.toLowerCase())
  const generatedAt = new Date().toISOString()
  const results: Array<Record<string, unknown>> = []
  const dirtyDateSet = new Set<string>()
  if (!forceFull) {
    const { data: dirtyRows, error: dirtyError } = await supabase
      .from("reservation_ai_cache_dirty_dates")
      .select("fact_date")
      .lt("fact_date", today)
      .gte("fact_date", defaultFrom)
      .order("fact_date", { ascending: true })
    if (dirtyError) {
      throw { status: 500, message: `Failed to inspect dirty reservation dates: ${dirtyError.message}` } satisfies AppError
    }
    for (const row of (Array.isArray(dirtyRows) ? dirtyRows : [])) {
      const dateKey = toSafeString((row as Record<string, unknown>).fact_date)
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) dirtyDateSet.add(dateKey)
    }
  }

  let globalFromDate = forceFull ? defaultFrom : addReservationDateDays(today, -1)
  if (dirtyDateSet.size) globalFromDate = [...dirtyDateSet].sort()[0]
  if (!forceFull) {
    const { data: cacheStoreRows, error: cacheStoreError } = await supabase
      .from(RESERVATION_AI_CACHE_TABLE)
      .select("store_partition_key")
      .in("store_partition_key", storeKeys)
    if (cacheStoreError) {
      throw { status: 500, message: `Failed to inspect reservation cache: ${cacheStoreError.message}` } satisfies AppError
    }
    const cachedStores = new Set(
      (Array.isArray(cacheStoreRows) ? cacheStoreRows : [])
        .map((row) => normalizeReservationStoreScope((row as Record<string, unknown>).store_partition_key))
        .filter(Boolean),
    )
    if (storeKeys.some((storeKey) => !cachedStores.has(storeKey))) globalFromDate = defaultFrom
  }

  const globalLiveUrl = buildReservationLiveUrl(
    storeKeys[0] || "all",
    reservationMonthFromDateKey(globalFromDate),
    reservationMonthFromDateKey(addReservationDateDays(today, -1)),
    reservationDateStartIso(globalFromDate),
    reservationDateStartIso(today),
  )
  globalLiveUrl.searchParams.delete("store_key")
  const globalLive = await fetchReservationAiFactsLive(supabase, globalLiveUrl, { allStores: true })
  const groupedByStoreDate = new Map<string, ReservationAiFactItem[]>()
  for (const item of (Array.isArray(globalLive.items) ? globalLive.items : [])) {
    const itemStoreKey = normalizeReservationStoreScope(item.store_key)
    const dateKey = reservationJstDateKey(item.visit_at)
    if (!itemStoreKey || !dateKey || dateKey < globalFromDate || dateKey >= today) continue
    const mapKey = `${itemStoreKey}__${dateKey}`
    const list = groupedByStoreDate.get(mapKey) ?? []
    list.push(item)
    groupedByStoreDate.set(mapKey, list)
  }

  for (const storeKey of storeKeys) {
    let fromDate = globalFromDate

    const dateKeys = enumerateReservationDateKeys(fromDate, today)
    const rows = dateKeys.map((dateKey) => {
      const items = groupedByStoreDate.get(`${storeKey}__${dateKey}`) ?? []
      const totals = aggregateReservationAiItems(items)
      return {
        store_partition_key: storeKey,
        fact_date: dateKey,
        facts: {
          totals,
          by_month: aggregateReservationAiItemsByMonth(items),
          items,
          truncated: globalLive.truncated === true,
          notes: reservationAiBaseNotes(),
        },
        summary_facts: {
          totals,
          by_month: aggregateReservationAiItemsByMonth(items),
          truncated: globalLive.truncated === true,
          notes: reservationAiBaseNotes(),
        },
        rag_text: buildReservationDailyRagText(storeKey, dateKey, totals, items),
        source_row_count: items.length,
        generated_at: generatedAt,
        source_max_updated_at: generatedAt,
      }
    })
    const nonEmptyRows = rows.filter((row) => Number(row.source_row_count) > 0)
    if (nonEmptyRows.length) {
      const { error: upsertError } = await supabase
        .from(RESERVATION_AI_CACHE_TABLE)
        .upsert(nonEmptyRows, { onConflict: "store_partition_key,fact_date" })
      if (upsertError) {
        throw { status: 500, message: `Failed to upsert reservation cache (${storeKey}): ${upsertError.message}` } satisfies AppError
      }
    }
    const { error: clearEmptyError } = await supabase
      .from(RESERVATION_AI_CACHE_TABLE)
      .delete()
      .eq("store_partition_key", storeKey)
      .gte("fact_date", fromDate)
      .lt("fact_date", today)
      .eq("source_row_count", 0)
    if (clearEmptyError) {
      throw { status: 500, message: `Failed to compact reservation cache (${storeKey}): ${clearEmptyError.message}` } satisfies AppError
    }
    const { error: coverageUpsertError } = await supabase
      .from("reservation_ai_cache_coverage")
      .upsert({
        store_partition_key: storeKey,
        covered_from: defaultFrom,
        covered_to: addReservationDateDays(today, -1),
        last_success_at: generatedAt,
        updated_at: generatedAt,
      }, { onConflict: "store_partition_key" })
    if (coverageUpsertError) {
      throw { status: 500, message: `Failed to save reservation cache coverage (${storeKey}): ${coverageUpsertError.message}` } satisfies AppError
    }
    results.push({
      store_key: storeKey,
      from_date: fromDate,
      to_date_exclusive: today,
      cached_days: nonEmptyRows.length,
      reservation_rows: rows.reduce((sum, row) => sum + Number(row.source_row_count || 0), 0),
      truncated: globalLive.truncated === true,
      dirty_dates_rebuilt: dirtyDateSet.size,
    })
  }

  if (!requestedStore && dirtyDateSet.size) {
    const { error: clearDirtyError } = await supabase
      .from("reservation_ai_cache_dirty_dates")
      .delete()
      .in("fact_date", [...dirtyDateSet])
    if (clearDirtyError) {
      throw { status: 500, message: `Failed to clear dirty reservation dates: ${clearDirtyError.message}` } satisfies AppError
    }
  }

  const response = {
    ok: true,
    cutoff_date_jst: today,
    generated_at: generatedAt,
    stores: results,
  }
  const cachedDayCount = results.reduce((sum, row) => sum + Number(row.cached_days ?? 0), 0)
  const reservationRowCount = results.reduce((sum, row) => sum + Number(row.reservation_rows ?? 0), 0)
  const finishedAt = new Date().toISOString()
  const { error: runSuccessError } = await supabase
    .from("reservation_ai_cache_runs")
    .update({
      status: "success",
      finished_at: finishedAt,
      cutoff_date_jst: today,
      store_count: results.length,
      cached_day_count: cachedDayCount,
      reservation_row_count: reservationRowCount,
      duration_ms: Date.now() - startedAtMs,
      details: response,
    })
    .eq("id", runId)
  if (runSuccessError) {
    throw { status: 500, message: `Failed to finish reservation cache run: ${runSuccessError.message}` } satisfies AppError
  }
  return response
  } catch (error) {
    const err = asAppError(error)
    if (runId > 0) {
      const { error: runFailureError } = await supabase
        .from("reservation_ai_cache_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAtMs,
          error_message: err.message.slice(0, 2000),
        })
        .eq("id", runId)
      if (runFailureError) console.error("Failed to record reservation cache failure:", runFailureError.message)
    }
    throw error
  }
}

/**
 * 予約人数ラベルを数値へ。実データは "2名" / "3" / null が混在する。
 * 「4〜6名」のような幅表記は先頭の数値（下限）を採る。数値が無ければ null。
 */
function parseReservationPartySize(label: unknown): number | null {
  const raw = toSafeString(label)
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  const matched = raw.match(/\d+/)
  if (!matched) return null
  const n = Number(matched[0])
  if (!Number.isFinite(n) || n <= 0 || n > 999) return null
  return Math.floor(n)
}

function listCalendarMonthsInclusive(
  monthFrom: string,
  monthTo: string,
  maxMonths: number,
): string[] {
  const start = normalizeCalendarMonthParam(monthFrom)
  const end = normalizeCalendarMonthParam(monthTo)
  const from = start <= end ? start : end
  const to = start <= end ? end : start
  const matchedFrom = from.match(/^(\d{4})-(\d{2})$/)
  const matchedTo = to.match(/^(\d{4})-(\d{2})$/)
  if (!matchedFrom || !matchedTo) return []
  let y = Number(matchedFrom[1])
  let m = Number(matchedFrom[2])
  const endY = Number(matchedTo[1])
  const endM = Number(matchedTo[2])
  const out: string[] = []
  while (out.length < maxMonths) {
    out.push(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`)
    if (y === endY && m === endM) break
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
    if (y > endY || (y === endY && m > endM)) break
  }
  return out
}

// 手入力（新規）予約を作成。reservation_detail はフロントが組み立てたJSON文字列をそのまま保存する。
async function createManualReservationEvent(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  enforcedStoreScope?: string | null,
) {
  const visitAtIso = normalizeReservationVisitAtIso(body.visit_at)
  if (!visitAtIso) {
    throw { status: 400, message: "visit_at is required (ISO datetime)." } satisfies AppError
  }
  const enforcedStoreKey = normalizeReservationStoreScope(enforcedStoreScope)
  const insertRow = {
    customer_name: toSafeString(body.customer_name) || null,
    customer_phone: toSafeString(body.customer_phone) || null,
    visit_at: visitAtIso,
    reservation_type: toSafeString(body.reservation_type) || null,
    reservation_detail: toSafeString(body.reservation_detail) || null,
    manual_store_key: enforcedStoreKey || toSafeString(body.manual_store_key) || null,
  }
  const { data, error } = await supabase
    .from("manual_reservation_visit_events")
    .insert(insertRow)
    .select("id")
    .single()
  if (error) {
    throw { status: 500, message: `Failed to create reservation: ${error.message}` } satisfies AppError
  }
  return { ok: true, source: "manual", id: (data as { id?: number } | null)?.id ?? null }
}

// 既存/手入力の予約を編集・非表示(ソフト削除)・復元。body に含まれたフィールドだけを更新する。
async function updateReservationEvent(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  enforcedStoreScope?: string | null,
) {
  const source = toSafeString(body.source)
  const table = reservationEventTableForSource(source)
  if (!table) {
    throw { status: 400, message: "source must be one of tabelog|ikyu|manual." } satisfies AppError
  }
  const id = Number(body.id)
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: "id is required." } satisfies AppError
  }
  const enforcedStoreKey = normalizeReservationStoreScope(enforcedStoreScope)
  if (enforcedStoreKey) {
    const record = await fetchReservationEventRecordForScopeCheck(supabase, table, id)
    assertReservationEventMatchesStoreScope(source, record, enforcedStoreKey)
  }
  const isManualTable = table === "manual_reservation_visit_events"
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)

  const patch: Record<string, unknown> = {}
  if (has("customer_name")) patch.customer_name = toSafeString(body.customer_name) || null
  if (has("customer_phone")) patch.customer_phone = toSafeString(body.customer_phone) || null
  if (has("visit_at")) {
    const iso = normalizeReservationVisitAtIso(body.visit_at)
    if (!iso) throw { status: 400, message: "visit_at is invalid." } satisfies AppError
    patch.visit_at = iso
  }
  if (has("reservation_type")) patch.reservation_type = toSafeString(body.reservation_type) || null
  if (has("reservation_detail")) patch.reservation_detail = toSafeString(body.reservation_detail) || null
  if (has("manual_store_key")) {
    patch.manual_store_key = enforcedStoreKey || toSafeString(body.manual_store_key) || null
  } else if (enforcedStoreKey && isManualTable) {
    patch.manual_store_key = enforcedStoreKey
  }
  if (has("manual_hidden")) {
    const hidden = body.manual_hidden === true || body.manual_hidden === "true"
    patch.manual_hidden = hidden
    if (hidden) {
      const reason = toSafeString(body.manual_hidden_reason).toLowerCase()
      patch.manual_hidden_reason = RESERVATION_MANUAL_HIDDEN_REASONS.has(reason) ? reason : "cancel"
    } else {
      patch.manual_hidden_reason = null
    }
  }

  if (Object.keys(patch).length === 0) {
    throw { status: 400, message: "No fields to update." } satisfies AppError
  }
  // 監査用タイムスタンプ。手入力表は updated_at、既存表は manual_edited_at に記録する。
  if (isManualTable) patch.updated_at = new Date().toISOString()
  else patch.manual_edited_at = new Date().toISOString()

  const { error } = await supabase.from(table).update(patch).eq("id", id)
  if (error) {
    throw { status: 500, message: `Failed to update reservation: ${error.message}` } satisfies AppError
  }
  return { ok: true, source, id }
}

// 氏名/電話のサジェスト: 入力語で3つの予約表を横断検索し、顧客（氏名+電話）単位に集約して返す。
// 検索語は URL ではなく POST ボディで受け取り、ログ/URL に PII を残さない。
async function suggestReservationCustomers(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  enforcedStoreScope?: string | null,
) {
  const q = toSafeString(body.q).trim()
  const field = toSafeString(body.field).toLowerCase() === "phone" ? "phone" : "name"
  const limit = clampInt(String(body.limit ?? ""), 8, 1, 20)
  const enforcedStoreKey = normalizeReservationStoreScope(enforcedStoreScope)
  if (q.length < 1) return { ok: true, field, suggestions: [] as Array<Record<string, unknown>> }

  const col = field === "phone" ? "customer_phone" : "customer_name"
  const pat = escapeLikePattern(q)
  const tables: Array<{ t: string; source: string }> = [
    { t: "tabelog_reservation_visit_events", source: "tabelog" },
    { t: "ikyu_reservation_visit_events", source: "ikyu" },
    { t: "manual_reservation_visit_events", source: "manual" },
  ]
  const byKey = new Map<string, Record<string, unknown>>()
  for (const { t, source } of tables) {
    const { data, error } = await supabase
      .from(t)
      .select("customer_name, customer_phone, visit_at, manual_store_key, reservation_detail")
      .ilike(col, `%${pat}%`)
      .order("visit_at", { ascending: false })
      .limit(60)
    if (error) {
      console.error(`customer-suggest query failed (${t}):`, error.message)
      continue
    }
    for (const row of (Array.isArray(data) ? data : [])) {
      if (!isRecord(row)) continue
      if (enforcedStoreKey && !reservationEventRecordMatchesStoreScope(source, row, enforcedStoreKey)) continue
      const name = toSafeString(row.customer_name)
      const phone = toSafeString(row.customer_phone)
      if (!name && !phone) continue
      const key = `${name}__${phone}`
      const visitAt = toSafeString(row.visit_at)
      const existing = byKey.get(key)
      if (existing) {
        existing.count = Number(existing.count ?? 0) + 1
        if (visitAt && visitAt > toSafeString(existing.last_visit_at)) existing.last_visit_at = visitAt
        continue
      }
      const parsed = parseReservationCalendarDetail(toSafeString(row.reservation_detail))
      byKey.set(key, {
        customer_name: name,
        customer_phone: phone,
        last_visit_at: visitAt || null,
        manual_store_key: toSafeString(row.manual_store_key) || null,
        store_name: normalizeCalendarText(parsed?.storeName, 90),
        source,
        count: 1,
      })
    }
  }
  const suggestions = [...byKey.values()]
    .sort((a, b) => String(b.last_visit_at ?? "").localeCompare(String(a.last_visit_at ?? "")))
    .slice(0, limit)
  return { ok: true, field, suggestions }
}

// 予約の完全削除（ハードデリート）。非表示(ソフト削除)と違い行を物理削除する。
// 取込予約(tabelog/ikyu)は reservation_customer_visit_history にも複製があるため、
// 「履歴も残さない」ため gmail_message_id を辿って履歴行も併せて削除する。
async function deleteReservationEvent(
  supabase: ReturnType<typeof createClient>,
  url: URL,
  enforcedStoreScope?: string | null,
) {
  const source = toSafeString(url.searchParams.get("source"))
  const table = reservationEventTableForSource(source)
  if (!table) {
    throw { status: 400, message: "source must be one of tabelog|ikyu|manual." } satisfies AppError
  }
  const id = Number(url.searchParams.get("id"))
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: "id is required." } satisfies AppError
  }
  const enforcedStoreKey = normalizeReservationStoreScope(enforcedStoreScope)

  const selectColumns = table === "manual_reservation_visit_events"
    ? "customer_name, customer_phone, reservation_detail, manual_store_key, created_at, visit_at"
    : "gmail_message_id, customer_name, customer_phone, reservation_detail, manual_store_key, created_at, visit_at"
  const { data: row } = await supabase.from(table).select(selectColumns).eq("id", id).maybeSingle()
  if (enforcedStoreKey) {
    assertReservationEventMatchesStoreScope(source, row, enforcedStoreKey)
  }
  const gmid = toSafeString((row as { gmail_message_id?: string } | null)?.gmail_message_id)
  const customerName = toSafeString((row as { customer_name?: string } | null)?.customer_name)
  const customerPhone = toSafeString((row as { customer_phone?: string } | null)?.customer_phone)

  if (table === "manual_reservation_visit_events") {
    const { error: histErr } = await supabase
      .from("reservation_customer_visit_history")
      .delete()
      .eq("partner", "manual")
      .eq("gmail_message_id", `manual:${id}`)
    if (histErr) console.error("Failed to delete manual reservation visit history:", histErr.message)
  } else if (gmid) {
    const { error: histErr } = await supabase
      .from("reservation_customer_visit_history")
      .delete()
      .eq("partner", source)
      .eq("gmail_message_id", gmid)
    if (histErr) console.error("Failed to delete reservation visit history:", histErr.message)
  }

  const { error } = await supabase.from(table).delete().eq("id", id)
  if (error) {
    throw { status: 500, message: `Failed to delete reservation: ${error.message}` } satisfies AppError
  }
  await rebuildReservationSummaryForCustomer(supabase, source, customerName, customerPhone)
  return { ok: true, source, id, deleted: true }
}

// ── 小口現金（出金/経費）台帳 ──
const PETTY_CASH_CATEGORIES = ["消耗品費", "食材・仕入", "雑費", "衛生用品", "修繕費", "その他"] as const

// 勘定科目（品目ごと）。3科目固定。未知キーは「未分類」フォールバック（通常は出ない）。
const PETTY_ACCT_KEYS = new Set(["shokuzai", "shomohin", "alcohol"])
const PETTY_ACCT_NAMES: Record<string, string> = { shokuzai: "食材", shomohin: "消耗品", alcohol: "アルコール" }
type PettyItem = { n: string; p: number; acct: string; rate: number }
type PettyTaxMode = "ex" | "in"

// items 配列を正規化（[{n,p,acct,rate}]）。各品目: 税抜価格 p(int≥0)、acct∈3科目、rate∈{8,10}。
// 空行（名前も価格も無い）は除去。1件も無ければ null（＝従来の単一フィールド経路にフォールバック）。
function normalizePettyItems(raw: unknown): PettyItem[] | null {
  if (!Array.isArray(raw)) return null
  const items: PettyItem[] = []
  for (const el of raw) {
    if (!el || typeof el !== "object") continue
    const o = el as Record<string, unknown>
    const n = toSafeString(o.n ?? (o as { name?: unknown }).name).trim()
    const pNum = Math.floor(Number(o.p ?? (o as { price?: unknown }).price))
    const p = Number.isFinite(pNum) && pNum > 0 ? pNum : 0
    let acct = toSafeString(o.acct).trim().toLowerCase()
    if (!PETTY_ACCT_KEYS.has(acct)) acct = "shokuzai"
    let rate = Math.floor(Number(o.rate))
    if (rate !== 8 && rate !== 10) rate = acct === "shokuzai" ? 8 : 10
    if (!n && p <= 0) continue
    items.push({ n: n || "(品目)", p, acct, rate })
    if (items.length >= 60) break
  }
  return items.length ? items : null
}

// items から 本体(Σp)・税・出金額(本体+税) を導出。
// 消費税は「税率ごとに税抜小計をまとめてから 1円未満切り捨て(floor)」で算出（税率別に1回・端数切り捨て）。
function pettyTotalsFromItems(items: PettyItem[]): { base: number; tax: number; amount: number } {
  let base = 0
  let base8 = 0
  let base10 = 0
  for (const it of items) {
    base += it.p
    if (it.rate === 8) base8 += it.p
    else base10 += it.p
  }
  const tax = Math.floor((base8 * 8) / 100) + Math.floor((base10 * 10) / 100)
  return { base, tax, amount: base + tax }
}

function normalizePettyTaxMode(raw: unknown): PettyTaxMode {
  return String(raw ?? "").trim().toLowerCase() === "in" ? "in" : "ex"
}

// 検索/旧表示用の品目テキスト（複数は「・名 ¥価格」改行、1件はそのまま）。
function pettyItemText(items: PettyItem[]): string {
  const lines = items.map((it) => `${it.n}${it.p > 0 ? " ¥" + it.p.toLocaleString("ja-JP") : ""}`.trim()).filter(Boolean)
  if (!lines.length) return ""
  return lines.length > 1 ? lines.map((s) => "・" + s).join("\n") : lines[0]
}

// 旧 category 列向け（科目名の重複排除を「・」連結。例: 食材・消耗品）。
function pettyCategoryLabel(items: PettyItem[]): string {
  const names = [...new Set(items.map((it) => PETTY_ACCT_NAMES[it.acct] ?? "未分類"))]
  return names.join("・")
}

// 一覧（店舗・月で絞り込み）＋ 月合計・勘定科目別合計を返す。
async function fetchPettyCashState(
  supabase: ReturnType<typeof createClient>,
  url: URL,
) {
  const storeKey = toSafeString(url.searchParams.get("store")).trim()
  const month = toSafeString(url.searchParams.get("month")).trim() // "YYYY-MM"（任意）
  const monthValid = /^\d{4}-\d{2}$/.test(month)

  let query = supabase
    .from("petty_cash_entries")
    .select("id, store_partition_key, spent_on, item, category, amount_yen, tax_yen, tax_mode, items, handler, source, note, line_message_id, created_at")
    .eq("hidden", false)
    .order("spent_on", { ascending: false })
    .order("id", { ascending: false })
    .limit(3000)
  if (storeKey) query = query.eq("store_partition_key", storeKey)
  if (monthValid) {
    const [y, m] = month.split("-").map((n) => Number(n))
    const start = `${month}-01`
    const endY = m === 12 ? y + 1 : y
    const endM = m === 12 ? 1 : m + 1
    const end = `${endY}-${String(endM).padStart(2, "0")}-01`
    query = query.gte("spent_on", start).lt("spent_on", end)
  }

  const { data, error } = await query
  if (error) {
    throw { status: 500, message: `Failed to load petty cash: ${error.message}` } satisfies AppError
  }
  const rows = Array.isArray(data) ? data : []

  let total = 0
  let taxTotal = 0
  const byCategory = new Map<string, number>()
  for (const r of rows) {
    const amt = Math.max(0, Math.floor(Number((r as { amount_yen?: unknown }).amount_yen ?? 0)))
    const tax = Math.max(0, Math.floor(Number((r as { tax_yen?: unknown }).tax_yen ?? 0)))
    total += amt
    taxTotal += tax
    const cat = toSafeString((r as { category?: unknown }).category) || "未分類"
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + amt)
  }

  return {
    ok: true,
    store_key: storeKey || null,
    month: monthValid ? month : null,
    categories: PETTY_CASH_CATEGORIES,
    entries: rows,
    total_yen: total,
    tax_total_yen: taxTotal,
    base_total_yen: Math.max(0, total - taxTotal),
    by_category: [...byCategory.entries()]
      .map(([category, amount_yen]) => ({ category, amount_yen }))
      .sort((a, b) => b.amount_yen - a.amount_yen),
    count: rows.length,
  }
}

// 出金(レシート画像由来)に紐づく元レシート画像の署名URLを返す。
// line_message_id でメディア(line_message_media)を引く。店舗スコープ付きセッションは
// 対象 entry が自店舗のものでなければ 404（他店のレシートを開けない）。
async function fetchPettyCashReceiptMedia(
  supabase: ReturnType<typeof createClient>,
  url: URL,
  enforcedStoreKey?: string | null,
) {
  const id = Number(url.searchParams.get("id"))
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: "id is required." } satisfies AppError
  }
  let entryQuery = supabase
    .from("petty_cash_entries")
    .select("id, store_partition_key, line_message_id, source")
    .eq("id", id)
  if (enforcedStoreKey) entryQuery = entryQuery.eq("store_partition_key", enforcedStoreKey)
  const { data: entry, error: entryErr } = await entryQuery.maybeSingle()
  if (entryErr) {
    throw { status: 500, message: `Failed to load entry: ${entryErr.message}` } satisfies AppError
  }
  if (!entry) {
    throw { status: 404, message: "対象の出金が見つかりません。" } satisfies AppError
  }
  const lineMessageId = toSafeString((entry as { line_message_id?: unknown }).line_message_id)
  if (!lineMessageId) {
    throw { status: 404, message: "この出金にはレシート画像が紐づいていません（手入力など）。" } satisfies AppError
  }
  // line_message_id は LINE メッセージ単位で一意。entry は上で店舗確認済みなので店舗安全。
  const { data: media, error: mediaErr } = await supabase
    .from("line_message_media")
    .select("media_type, storage_bucket, storage_path, original_file_name, created_at")
    .eq("line_message_id", lineMessageId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (mediaErr) {
    throw { status: 500, message: `Failed to load receipt media: ${mediaErr.message}` } satisfies AppError
  }
  if (!media) {
    throw { status: 404, message: "レシート画像が保存されていません（保存前/削除済みの可能性）。" } satisfies AppError
  }
  const signedUrl = await createSignedMediaUrl(
    supabase,
    toSafeString((media as { storage_bucket?: unknown }).storage_bucket) || "line-media",
    toSafeString((media as { storage_path?: unknown }).storage_path),
  )
  if (!signedUrl) {
    throw { status: 502, message: "レシート画像のURL生成に失敗しました。" } satisfies AppError
  }
  return {
    ok: true,
    id,
    line_message_id: lineMessageId,
    media_type: toSafeString((media as { media_type?: unknown }).media_type) || "image",
    original_file_name: toSafeString((media as { original_file_name?: unknown }).original_file_name) || null,
    created_at: (media as { created_at?: unknown }).created_at ?? null,
    signed_url: signedUrl,
  }
}

// 追加（手入力）。
async function createPettyCashEntry(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
) {
  const storeKey = toSafeString(body.store_partition_key).trim()
  if (!storeKey) {
    throw { status: 400, message: "store_partition_key is required." } satisfies AppError
  }
  const spentOn = toSafeString(body.spent_on).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(spentOn)) {
    throw { status: 400, message: "spent_on must be YYYY-MM-DD." } satisfies AppError
  }
  // 新方式: items（品目ごとの勘定科目・税率）があれば、本体/税/出金額はサーバ側で導出して保存（パリティ保証）。
  const items = normalizePettyItems(body.items)
  const taxMode = normalizePettyTaxMode(body.tax_mode)
  let insertRow: Record<string, unknown>
  if (items) {
    const t = pettyTotalsFromItems(items)
    if (t.amount <= 0) {
      throw { status: 400, message: "items must total a positive amount." } satisfies AppError
    }
    insertRow = {
      store_partition_key: storeKey,
      spent_on: spentOn,
      item: pettyItemText(items),
      category: pettyCategoryLabel(items),
      amount_yen: t.amount,
      tax_yen: t.tax,
      tax_mode: taxMode,
      items,
      handler: toSafeString(body.handler) || null,
      note: toSafeString(body.note) || null,
      source: "manual",
    }
  } else {
    // 旧方式（単一フィールド）。LINE取込や後方互換のためフォールバックとして残す。
    const amount = Math.floor(Number(body.amount_yen))
    if (!Number.isFinite(amount) || amount < 0) {
      throw { status: 400, message: "amount_yen must be a non-negative number." } satisfies AppError
    }
    const taxParsed = (body.tax_yen == null || body.tax_yen === "") ? 0 : Math.floor(Number(body.tax_yen))
    const tax = Number.isFinite(taxParsed) ? Math.max(0, taxParsed) : 0
    if (tax > amount) {
      throw { status: 400, message: "tax_yen must not exceed amount_yen (out-of-pocket total)." } satisfies AppError
    }
    insertRow = {
      store_partition_key: storeKey,
      spent_on: spentOn,
      item: toSafeString(body.item) || null,
      category: toSafeString(body.category) || null,
      amount_yen: amount,
      tax_yen: tax,
      tax_mode: taxMode,
      handler: toSafeString(body.handler) || null,
      note: toSafeString(body.note) || null,
      source: "manual",
    }
  }
  const { data, error } = await supabase
    .from("petty_cash_entries")
    .insert(insertRow)
    .select("id")
    .single()
  if (error) {
    throw { status: 500, message: `Failed to create petty cash entry: ${error.message}` } satisfies AppError
  }
  return { ok: true, id: (data as { id?: number } | null)?.id ?? null }
}

function normalizePettyCashReceiptImageMime(fileType: string, fileName: string): string | null {
  const type = String(fileType || "").split(";")[0].trim().toLowerCase()
  if (type === "image/jpeg" || type === "image/jpg") return "image/jpeg"
  if (type === "image/png") return "image/png"
  const ext = extractFileExt(fileName).toLowerCase()
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
  if (ext === "png") return "image/png"
  return null
}

function receiptImageStorageExt(mimeType: string): string {
  return mimeType === "image/png" ? "png" : "jpg"
}

async function recordPettyCashWebAiUsage(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
  lineMessageId: string,
  usage: LineImageVisionUsage | null | undefined,
  provider: "azure_openai" | "gemini" = "azure_openai",
  model = AZURE_RECEIPT_MODEL,
): Promise<void> {
  if (!usage) return
  try {
    const { error } = await supabase.from("ai_usage_events").insert({
      store_partition_key: storeKey,
      provider,
      model,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      thinking_tokens: usage.thinkingTokens,
      total_tokens: usage.totalTokens,
      line_message_id: lineMessageId,
    })
    if (error) console.error("petty cash web ai_usage_events insert failed:", error.message)
  } catch (e) {
    console.error("petty cash web ai_usage_events insert threw:", e instanceof Error ? e.message : String(e))
  }
}

async function uploadPettyCashWebReceiptImage(
  supabase: ReturnType<typeof createClient>,
  params: {
    storeKey: string
    lineMessageId: string
    fileName: string
    mimeType: string
    bytes: Uint8Array
  },
): Promise<{ storagePath: string }> {
  const storePath = sanitizeStoragePathSegment(params.storeKey)
  const idPath = sanitizeStoragePathSegment(params.lineMessageId)
  const storagePath = `web-petty-cash/${storePath}/${idPath}.${receiptImageStorageExt(params.mimeType)}`
  const uploaded = await supabase.storage.from(PETTY_CASH_RECEIPT_IMAGE_BUCKET).upload(storagePath, params.bytes, {
    contentType: params.mimeType,
    upsert: true,
  })
  if (uploaded?.error) {
    throw { status: 500, message: `レシート画像の保存に失敗しました: ${uploaded.error.message}` } satisfies AppError
  }
  const inserted = await supabase.from("line_message_media").insert({
    message_id: null,
    line_message_id: params.lineMessageId,
    room_id: `web_upload:${params.storeKey}`,
    user_id: null,
    sender_display_name: "Webアップロード",
    media_type: "image",
    store_partition_key: params.storeKey,
    storage_bucket: PETTY_CASH_RECEIPT_IMAGE_BUCKET,
    storage_path: storagePath,
    original_file_name: params.fileName,
    mime_type: params.mimeType,
    file_size_bytes: params.bytes.byteLength,
    content_preview: null,
    created_at: new Date().toISOString(),
  })
  if (inserted?.error) {
    try { await supabase.storage.from(PETTY_CASH_RECEIPT_IMAGE_BUCKET).remove([storagePath]) } catch (_) { /* ignore */ }
    throw { status: 500, message: `レシート画像情報の保存に失敗しました: ${inserted.error.message}` } satisfies AppError
  }
  return { storagePath }
}

// Web画面からアップロードされたレシート画像を、LINEの小口現金解析と同じロジックで解析して登録する。
async function createPettyCashEntryFromReceiptImage(
  supabase: ReturnType<typeof createClient>,
  req: Request,
  enforcedStoreKey?: string | null,
) {
  const contentLength = Number(req.headers.get("content-length") ?? "")
  if (Number.isFinite(contentLength) && contentLength > PETTY_CASH_RECEIPT_IMAGE_MAX_BYTES + 1024 * 1024) {
    throw { status: 400, message: "画像が大きすぎます。3MB以下のJPEG/PNGにしてアップロードしてください。" } satisfies AppError
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    throw { status: 400, message: "Upload request must be multipart/form-data." } satisfies AppError
  }

  const rawStoreKey = toSafeString(formData.get("store_partition_key") ?? formData.get("store") ?? formData.get("store_key"))
  if (enforcedStoreKey && rawStoreKey && rawStoreKey.toLowerCase() !== enforcedStoreKey.toLowerCase()) {
    throw { status: 403, message: "他店舗のデータには登録できません。" } satisfies AppError
  }
  const storeKey = (enforcedStoreKey || rawStoreKey).trim()
  if (!storeKey) {
    throw { status: 400, message: "store_partition_key is required." } satisfies AppError
  }

  const fileValue = formData.get("image") ?? formData.get("file")
  if (!(fileValue instanceof File)) {
    throw { status: 400, message: "image file is required." } satisfies AppError
  }
  if (!Number.isFinite(fileValue.size) || fileValue.size <= 0) {
    throw { status: 400, message: "image file must not be empty." } satisfies AppError
  }
  if (fileValue.size > PETTY_CASH_RECEIPT_IMAGE_MAX_BYTES) {
    throw { status: 400, message: "画像が大きすぎます。3MB以下のJPEG/PNGにしてアップロードしてください。" } satisfies AppError
  }

  const originalFileName = sanitizeUploadFileName(
    toSafeString(formData.get("original_file_name")) || fileValue.name || "receipt.jpg",
  )
  const mimeType = normalizePettyCashReceiptImageMime(fileValue.type || "", originalFileName)
  if (!mimeType) {
    throw { status: 400, message: "JPEGまたはPNG画像だけアップロードできます。" } satisfies AppError
  }

  const azureFoundryProjectEndpoint = String(Deno.env.get("AZURE_FOUNDRY_PROJECT_ENDPOINT") ?? "").trim()
  const azureFoundryApiKey = String(Deno.env.get("AZURE_FOUNDRY_API_KEY") ?? "").trim()
  const azureFoundryDeployment = String(Deno.env.get("AZURE_FOUNDRY_VISION_DEPLOYMENT") ?? "").trim() || AZURE_RECEIPT_MODEL
  if (!azureFoundryProjectEndpoint || !azureFoundryApiKey) {
    throw { status: 500, message: "Azure Foundry receipt-analysis configuration is missing." } satisfies AppError
  }

  const bytes = new Uint8Array(await fileValue.arrayBuffer())
  const webMessageId = `web-petty-cash:${crypto.randomUUID()}`
  const geminiApiKey = resolveGeminiApiKey()
  const geminiFlashModel = resolveReceiptGeminiFlashModel()
  const geminiProModel = resolveReceiptGeminiModel()
  // 小口レシートはFlashを通常経路にし、金額・税率・明細が不完全な場合だけProへ昇格する。
  // AzureはGemini障害時だけの退避先で、売上・分析系のAzure利用には影響しない。
  let analyzed: Awaited<ReturnType<typeof analyzeLineImageWithGemini>> | Awaited<ReturnType<typeof analyzeExpenseReceiptWithAzureFoundry>>
  if (geminiApiKey) {
    analyzed = await analyzeLineImageWithGemini(
      bytes,
      mimeType,
      originalFileName,
      geminiApiKey,
      EXPENSE_RECEIPT_PROMPT_ADDITION,
      geminiFlashModel,
    )
    await recordPettyCashWebAiUsage(supabase, storeKey, webMessageId, analyzed.usage, "gemini", geminiFlashModel)
    if (needsGeminiProPettyCashReview(analyzed.analysis) || !extractExpenseFromReceipt(analyzed.analysis?.receipt ?? null)) {
      console.info("petty cash Flash result needs Pro review")
      const proReview = await analyzeLineImageWithGemini(
        bytes,
        mimeType,
        `${originalFileName}#pro-review`,
        geminiApiKey,
        EXPENSE_RECEIPT_PROMPT_ADDITION,
        geminiProModel,
      )
      await recordPettyCashWebAiUsage(supabase, storeKey, webMessageId, proReview.usage, "gemini", geminiProModel)
      if (proReview.analysis || !analyzed.analysis || shouldFallbackLineImageVisionFailure(proReview.failure)) {
        analyzed = proReview
      }
    }
    if (!analyzed.analysis && shouldFallbackLineImageVisionFailure(analyzed.failure)) {
      console.error("petty cash Gemini analysis failed; retrying with Azure:", analyzed.failure?.stage ?? "unknown")
      analyzed = await analyzeExpenseReceiptWithAzureFoundry(
        bytes,
        mimeType,
        originalFileName,
        azureFoundryProjectEndpoint,
        azureFoundryApiKey,
        azureFoundryDeployment,
        EXPENSE_RECEIPT_PROMPT_ADDITION,
      )
      await recordPettyCashWebAiUsage(supabase, storeKey, webMessageId, analyzed.usage, "azure_openai", AZURE_RECEIPT_MODEL)
    }
  } else {
    analyzed = await analyzeExpenseReceiptWithAzureFoundry(
      bytes,
      mimeType,
      originalFileName,
      azureFoundryProjectEndpoint,
      azureFoundryApiKey,
      azureFoundryDeployment,
      EXPENSE_RECEIPT_PROMPT_ADDITION,
    )
    await recordPettyCashWebAiUsage(supabase, storeKey, webMessageId, analyzed.usage, "azure_openai", AZURE_RECEIPT_MODEL)
  }
  if (analyzed.failure) {
    throw { status: 422, message: `レシート画像を解析できませんでした: ${analyzed.failure.message}` } satisfies AppError
  }
  const expense = extractExpenseFromReceipt(analyzed.analysis?.receipt ?? null)
  if (!expense) {
    throw { status: 422, message: "レシートの金額を読み取れませんでした。画像を撮り直すか手入力してください。" } satisfies AppError
  }

  let storagePath: string | null = null
  try {
    const media = await uploadPettyCashWebReceiptImage(supabase, {
      storeKey,
      lineMessageId: webMessageId,
      fileName: originalFileName,
      mimeType,
      bytes,
    })
    storagePath = media.storagePath

    const items = normalizePettyItems(expense.items) ?? null
    const { data, error } = await supabase
      .from("petty_cash_entries")
      .insert({
        store_partition_key: storeKey,
        spent_on: expense.spentOn,
        item: items ? pettyItemText(items) : expense.item,
        category: items ? pettyCategoryLabel(items) : null,
        amount_yen: expense.amount,
        tax_yen: Math.min(expense.amount, Math.max(0, expense.tax)),
        tax_mode: expense.taxMode,
        items,
        handler: toSafeString(formData.get("handler")) || null,
        note: expense.supplier ? `仕入先: ${expense.supplier}` : null,
        source: "web_image",
        line_message_id: webMessageId,
      })
      .select("id, store_partition_key, spent_on, item, category, amount_yen, tax_yen, tax_mode, items, handler, source, note, line_message_id, created_at")
      .single()
    if (error) {
      throw { status: 500, message: `Failed to create petty cash entry: ${error.message}` } satisfies AppError
    }
    return {
      ok: true,
      id: (data as { id?: number } | null)?.id ?? null,
      entry: data,
      receipt: {
        summary: analyzed.analysis?.summary ?? "",
        supplier: expense.supplier,
        spent_on: expense.spentOn,
        amount_yen: expense.amount,
        tax_yen: expense.tax,
      },
    }
  } catch (e) {
    if (storagePath) {
      try { await supabase.storage.from(PETTY_CASH_RECEIPT_IMAGE_BUCKET).remove([storagePath]) } catch (_) { /* ignore */ }
      try { await supabase.from("line_message_media").delete().eq("line_message_id", webMessageId) } catch (_) { /* ignore */ }
    }
    throw e
  }
}

// 既存の小口現金行を編集（body に含めたフィールドだけ更新）。
async function updatePettyCashEntry(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  enforcedStoreKey?: string | null,
) {
  const id = Number(body.id)
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: "id is required." } satisfies AppError
  }
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)
  const patch: Record<string, unknown> = {}
  if (has("spent_on")) {
    const s = toSafeString(body.spent_on).trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      throw { status: 400, message: "spent_on must be YYYY-MM-DD." } satisfies AppError
    }
    patch.spent_on = s
  }
  if (has("handler")) patch.handler = toSafeString(body.handler) || null
  if (has("note")) patch.note = toSafeString(body.note) || null
  if (has("tax_mode")) patch.tax_mode = normalizePettyTaxMode(body.tax_mode)
  // 新方式: items を指定したら 本体/税/品目テキスト/科目ラベル をサーバ側で再導出（item/category/amount/tax は items が優先）。
  if (has("items")) {
    const items = normalizePettyItems(body.items)
    if (!items) {
      throw { status: 400, message: "items must contain at least one valid line item." } satisfies AppError
    }
    const t = pettyTotalsFromItems(items)
    if (t.amount <= 0) {
      throw { status: 400, message: "items must total a positive amount." } satisfies AppError
    }
    patch.items = items
    patch.amount_yen = t.amount
    patch.tax_yen = t.tax
    patch.item = pettyItemText(items)
    patch.category = pettyCategoryLabel(items)
  } else {
    // 旧方式（単一フィールド）。
    if (has("item")) patch.item = toSafeString(body.item) || null
    if (has("category")) patch.category = toSafeString(body.category) || null
    let nextAmount: number | null = null
    let nextTax: number | null = null
    if (has("amount_yen")) {
      const a = Math.floor(Number(body.amount_yen))
      if (!Number.isFinite(a) || a < 0) {
        throw { status: 400, message: "amount_yen must be a non-negative number." } satisfies AppError
      }
      patch.amount_yen = a
      nextAmount = a
    }
    if (has("tax_yen")) {
      const t = Math.floor(Number(body.tax_yen))
      if (!Number.isFinite(t) || t < 0) {
        throw { status: 400, message: "tax_yen must be a non-negative number." } satisfies AppError
      }
      patch.tax_yen = t
      nextTax = t
    }
    if (nextAmount != null && nextTax != null && nextTax > nextAmount) {
      throw { status: 400, message: "tax_yen must not exceed amount_yen." } satisfies AppError
    }
  }
  if (Object.keys(patch).length === 0) {
    throw { status: 400, message: "No fields to update." } satisfies AppError
  }
  patch.updated_at = new Date().toISOString()
  let upd = supabase.from("petty_cash_entries").update(patch).eq("id", id)
  // 店舗スコープ付きセッションは自店舗の行だけ編集可（他店舗idを指定しても0件更新→403）。
  if (enforcedStoreKey) upd = upd.eq("store_partition_key", enforcedStoreKey)
  const { data: updated, error } = await upd.select("id")
  if (error) {
    throw { status: 500, message: `Failed to update petty cash entry: ${error.message}` } satisfies AppError
  }
  if (enforcedStoreKey && (!Array.isArray(updated) || updated.length === 0)) {
    throw { status: 403, message: "他店舗のデータは編集できません。" } satisfies AppError
  }
  return { ok: true, id }
}

// 論理削除（hidden=true）。
async function deletePettyCashEntry(
  supabase: ReturnType<typeof createClient>,
  url: URL,
  enforcedStoreKey?: string | null,
) {
  const id = Number(url.searchParams.get("id"))
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: "id is required." } satisfies AppError
  }
  let del = supabase
    .from("petty_cash_entries")
    .update({ hidden: true, updated_at: new Date().toISOString() })
    .eq("id", id)
  // 店舗スコープ付きセッションは自店舗の行だけ削除可（他店舗idを指定しても0件→403）。
  if (enforcedStoreKey) del = del.eq("store_partition_key", enforcedStoreKey)
  const { data: deleted, error } = await del.select("id")
  if (error) {
    throw { status: 500, message: `Failed to delete petty cash entry: ${error.message}` } satisfies AppError
  }
  if (enforcedStoreKey && (!Array.isArray(deleted) || deleted.length === 0)) {
    throw { status: 403, message: "他店舗のデータは削除できません。" } satisfies AppError
  }
  return { ok: true, id, deleted: true }
}

function normalizeBudgetStoreKey(raw: string): string {
  const s = String(raw ?? "").trim().toLowerCase()
  return s || "__all__"
}

type ReceiptStoreOption = {
  store_key: string
  store_name: string
}


function parsePositiveWeight(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return n
}

type SalesBudgetRow = {
  budget_yen: number
  mon_weight: number
  tue_weight: number
  wed_weight: number
  thu_weight: number
  fri_weight: number
  sat_weight: number
  sun_weight: number
  store_closed_dates: string[]
}

async function fetchStoreClosedDatesFromTable(
  supabase: ReturnType<typeof createClient>,
  store_partition_key: string,
  month: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("line_sales_month_store_closed_days")
    .select("closed_on")
    .eq("store_partition_key", store_partition_key)
    .eq("target_month", month)

  if (error) {
    throw { status: 500, message: `Failed to fetch store closed days: ${error.message}` } satisfies AppError
  }
  const allowed = new Set(enumerateMonthDates(month))
  const out: string[] = []
  for (const row of Array.isArray(data) ? data : []) {
    const r = row as { closed_on?: unknown }
    const s = String(r.closed_on ?? "").trim().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) continue
    if (!allowed.has(s)) continue
    out.push(s)
  }
  return [...new Set(out)].sort()
}

async function replaceStoreClosedDatesInTable(
  supabase: ReturnType<typeof createClient>,
  store_partition_key: string,
  month: string,
  dates: string[],
) {
  const { error: delErr } = await supabase
    .from("line_sales_month_store_closed_days")
    .delete()
    .eq("store_partition_key", store_partition_key)
    .eq("target_month", month)
  if (delErr) {
    throw { status: 500, message: `Failed to clear store closed days: ${delErr.message}` } satisfies AppError
  }
  if (dates.length === 0) return
  const rows = dates.map((closed_on) => ({
    store_partition_key,
    target_month: month,
    closed_on,
  }))
  const { error: insErr } = await supabase.from("line_sales_month_store_closed_days").insert(rows)
  if (insErr) {
    throw { status: 500, message: `Failed to save store closed days: ${insErr.message}` } satisfies AppError
  }
}

async function fetchSalesBudgetRow(
  supabase: ReturnType<typeof createClient>,
  storeKeyQueryParam: string,
  month: string,
): Promise<SalesBudgetRow | null> {
  const store_partition_key = normalizeBudgetStoreKey(storeKeyQueryParam)
  const { data, error } = await supabase
    .from("line_sales_month_budgets")
    .select("budget_yen, mon_weight, tue_weight, wed_weight, thu_weight, fri_weight, sat_weight, sun_weight, store_closed_dates")
    .eq("store_partition_key", store_partition_key)
    .eq("target_month", month)
    .maybeSingle()

  if (error) {
    throw { status: 500, message: `Failed to fetch sales budget: ${error.message}` } satisfies AppError
  }
  if (!data) return null
  const row = data as {
    budget_yen?: unknown
    mon_weight?: unknown
    tue_weight?: unknown
    wed_weight?: unknown
    thu_weight?: unknown
    fri_weight?: unknown
    sat_weight?: unknown
    sun_weight?: unknown
    store_closed_dates?: unknown
  }
  const budgetYen = toNonNegativeInteger(row.budget_yen)
  if (budgetYen <= 0) return null
  const fromTable = await fetchStoreClosedDatesFromTable(supabase, store_partition_key, month)
  const store_closed_dates = mergeStoreClosedDateLists(fromTable, row.store_closed_dates, month)
  return {
    budget_yen: budgetYen,
    mon_weight: parsePositiveWeight(row.mon_weight, 1),
    tue_weight: parsePositiveWeight(row.tue_weight, 1),
    wed_weight: parsePositiveWeight(row.wed_weight, 1),
    thu_weight: parsePositiveWeight(row.thu_weight, 1),
    fri_weight: parsePositiveWeight(row.fri_weight, 1),
    sat_weight: parsePositiveWeight(row.sat_weight, 1.5),
    sun_weight: parsePositiveWeight(row.sun_weight, 2),
    store_closed_dates,
  }
}

async function upsertReceiptSalesBudget(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
) {
  const store_partition_key = normalizeBudgetStoreKey(toSafeString(body.store_key))
  const month = normalizeCalendarMonthParam(toSafeString(body.month))
  const rawBudget = body.budget_yen

  const clearAndReturn = async () => {
    const { error: delClosedErr } = await supabase
      .from("line_sales_month_store_closed_days")
      .delete()
      .eq("store_partition_key", store_partition_key)
      .eq("target_month", month)
    if (delClosedErr) {
      throw { status: 500, message: `Failed to clear store closed days: ${delClosedErr.message}` } satisfies AppError
    }
    const { error } = await supabase
      .from("line_sales_month_budgets")
      .delete()
      .eq("store_partition_key", store_partition_key)
      .eq("target_month", month)
    if (error) {
      throw { status: 500, message: `Failed to clear sales budget: ${error.message}` } satisfies AppError
    }
    return {
      month_budget_yen: null as number | null,
      mon_weight: null as number | null,
      tue_weight: null as number | null,
      wed_weight: null as number | null,
      thu_weight: null as number | null,
      fri_weight: null as number | null,
      sat_weight: null as number | null,
      sun_weight: null as number | null,
      store_closed_dates: null as string[] | null,
      store_partition_key,
      month,
    }
  }

  if (rawBudget === null || rawBudget === undefined || rawBudget === "") {
    return await clearAndReturn()
  }

  const budgetYen = toNonNegativeInteger(rawBudget)
  if (budgetYen <= 0) {
    return await clearAndReturn()
  }

  const monW = parsePositiveWeight(body.mon_weight, 1)
  const tueW = parsePositiveWeight(body.tue_weight, 1)
  const wedW = parsePositiveWeight(body.wed_weight, 1)
  const thuW = parsePositiveWeight(body.thu_weight, 1)
  const friW = parsePositiveWeight(body.fri_weight, 1)
  const satW = parsePositiveWeight(body.sat_weight, 1.5)
  const sunW = parsePositiveWeight(body.sun_weight, 2)
  const closedDates = parseStoreClosedDatesForMonth(body.store_closed_dates, month)

  const updatedAt = new Date().toISOString()
  const { data, error } = await supabase
    .from("line_sales_month_budgets")
    .upsert(
      {
        store_partition_key,
        target_month: month,
        budget_yen: budgetYen,
        mon_weight: monW,
        tue_weight: tueW,
        wed_weight: wedW,
        thu_weight: thuW,
        fri_weight: friW,
        sat_weight: satW,
        sun_weight: sunW,
        store_closed_dates: closedDates,
        updated_at: updatedAt,
      },
      { onConflict: "store_partition_key,target_month" },
    )
    .select("budget_yen, mon_weight, tue_weight, wed_weight, thu_weight, fri_weight, sat_weight, sun_weight, store_closed_dates")
    .maybeSingle()

  if (error) {
    throw { status: 500, message: `Failed to save sales budget: ${error.message}` } satisfies AppError
  }

  await replaceStoreClosedDatesInTable(supabase, store_partition_key, month, closedDates)

  let row = data as {
    budget_yen?: unknown
    mon_weight?: unknown
    tue_weight?: unknown
    wed_weight?: unknown
    thu_weight?: unknown
    fri_weight?: unknown
    sat_weight?: unknown
    sun_weight?: unknown
    store_closed_dates?: unknown
  } | null
  let parsedClosed = await fetchStoreClosedDatesFromTable(supabase, store_partition_key, month)
  if (parsedClosed.length === 0) {
    parsedClosed = parseStoreClosedDatesForMonth(row?.store_closed_dates, month)
  }
  if (parsedClosed.length === 0 && closedDates.length > 0) {
    parsedClosed = [...closedDates]
  }
  const out = row != null ? toNonNegativeInteger(row.budget_yen) : budgetYen
  return {
    month_budget_yen: out > 0 ? out : null,
    mon_weight: parsePositiveWeight(row?.mon_weight, monW),
    tue_weight: parsePositiveWeight(row?.tue_weight, tueW),
    wed_weight: parsePositiveWeight(row?.wed_weight, wedW),
    thu_weight: parsePositiveWeight(row?.thu_weight, thuW),
    fri_weight: parsePositiveWeight(row?.fri_weight, friW),
    sat_weight: parsePositiveWeight(row?.sat_weight, satW),
    sun_weight: parsePositiveWeight(row?.sun_weight, sunW),
    store_closed_dates: parsedClosed,
    store_partition_key,
    month,
  }
}

function parseCompareYearQueryParam(raw: string | null, displayMonth: string): number {
  const parsed = Number(raw)
  if (Number.isFinite(parsed) && parsed >= 1900 && parsed <= 2100) {
    return Math.floor(parsed)
  }
  const parts = displayMonth.split("-")
  const y = Number(parts[0])
  if (Number.isFinite(y)) return y - 1
  return new Date().getUTCFullYear() - 1
}

function comparisonSalesMonth(displayMonth: string, compareYear: number): string {
  const mm = displayMonth.slice(5, 7)
  return `${compareYear}-${mm}`
}

async function fetchManualMonthGross(
  supabase: ReturnType<typeof createClient>,
  storeKeyQueryParam: string,
  salesMonth: string,
): Promise<number | null> {
  const store_partition_key = normalizeBudgetStoreKey(storeKeyQueryParam)
  const sm = normalizeCalendarMonthParam(salesMonth)
  const record = await fetchManualMonthSales(supabase, store_partition_key, sm)
  return record?.gross_sales_yen ?? null
}

async function fetchManualMonthsForYearState(
  supabase: ReturnType<typeof createClient>,
  url: URL,
) {
  const store_partition_key = normalizeBudgetStoreKey(toSafeString(url.searchParams.get("store_key")))
  const year = Number(url.searchParams.get("year"))
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw { status: 400, message: "year must be an integer 1900-2100." } satisfies AppError
  }
  const start = `${year}-01`
  const endExclusive = `${year + 1}-01`
  const { data, error } = await supabase
    .from("line_sales_manual_month_gross")
    .select("sales_month, gross_sales_yen, net_sales_yen, tax_amount_yen, party_count, guest_count, operating_days_count")
    .eq("store_partition_key", store_partition_key)
    .gte("sales_month", start)
    .lt("sales_month", endExclusive)

  if (error) {
    throw { status: 500, message: `Failed to list manual month gross: ${error.message}` } satisfies AppError
  }

  const months: Record<string, {
    gross_sales_yen: number
    net_sales_yen: number | null
    tax_amount_yen: number | null
    party_count: number | null
    guest_count: number | null
    operating_days_count: number | null
  }> = {}
  for (const row of Array.isArray(data) ? data : []) {
    const r = row as Record<string, unknown>
    const sm = toSafeString(r.sales_month)
    if (!/^\d{4}-\d{2}$/.test(sm)) continue
    const gross = toNonNegativeInteger(r.gross_sales_yen)
    const netRaw = r.net_sales_yen
    const taxRaw = r.tax_amount_yen
    const partyRaw = r.party_count
    const guestRaw = r.guest_count
    const party = partyRaw === null || partyRaw === undefined || partyRaw === ""
      ? null
      : toNonNegativeInteger(partyRaw)
    const guest = guestRaw === null || guestRaw === undefined || guestRaw === ""
      ? null
      : toNonNegativeInteger(guestRaw)
    const opRaw = r.operating_days_count
    const operating_days_count = opRaw === null || opRaw === undefined || opRaw === ""
      ? null
      : toNonNegativeInteger(opRaw)
    months[sm] = {
      gross_sales_yen: gross,
      net_sales_yen: netRaw === null || netRaw === undefined || netRaw === "" ? null : toNonNegativeInteger(netRaw),
      tax_amount_yen: taxRaw === null || taxRaw === undefined || taxRaw === "" ? null : toNonNegativeInteger(taxRaw),
      party_count: party,
      guest_count: guest,
      operating_days_count: operating_days_count != null && operating_days_count > 0 ? operating_days_count : null,
    }
  }

  return {
    year,
    store_partition_key,
    months,
    generated_at: new Date().toISOString(),
  }
}

async function upsertManualMonthEntries(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
) {
  const store_partition_key = normalizeBudgetStoreKey(toSafeString(body.store_key))
  const entriesRaw = body.entries
  if (!Array.isArray(entriesRaw)) {
    throw { status: 400, message: "entries must be an array." } satisfies AppError
  }

  const upsertPayload: Array<{
    sales_month: string
    gross_sales_yen: number | null
    party_count?: number | null
    guest_count?: number | null
    operating_days_count?: number | null
    net_sales_yen?: number | null
    tax_amount_yen?: number | null
  }> = []
  let applied = 0

  for (const entry of entriesRaw) {
    if (!isRecord(entry)) continue
    const sales_month = normalizeCalendarMonthParam(toSafeString(entry.sales_month))
    const raw = entry.gross_sales_yen

    if (raw === null || raw === undefined || raw === "") {
      upsertPayload.push({ sales_month, gross_sales_yen: null })
    } else {
      const yenVal = toNonNegativeInteger(raw)
      const partyRaw = entry.party_count
      const guestRaw = entry.guest_count
      const party = partyRaw === null || partyRaw === undefined || partyRaw === ""
        ? null
        : toNonNegativeInteger(partyRaw)
      const guest = guestRaw === null || guestRaw === undefined || guestRaw === ""
        ? null
        : toNonNegativeInteger(guestRaw)
      const opRaw = entry.operating_days_count
      const netRaw = entry.net_sales_yen
      const taxRaw = entry.tax_amount_yen
      const operatingDays = opRaw === null || opRaw === undefined || opRaw === ""
        ? null
        : toNonNegativeInteger(opRaw)
      const net = netRaw === null || netRaw === undefined || netRaw === ""
        ? null
        : toNonNegativeInteger(netRaw)
      const tax = taxRaw === null || taxRaw === undefined || taxRaw === ""
        ? null
        : toNonNegativeInteger(taxRaw)
      upsertPayload.push({
        sales_month,
        gross_sales_yen: yenVal,
        net_sales_yen: net,
        tax_amount_yen: tax,
        party_count: party,
        guest_count: guest,
        operating_days_count: operatingDays != null && operatingDays > 0 ? operatingDays : null,
      })
    }
    applied += 1
  }

  try {
    await upsertManualMonthSalesEntries(supabase, store_partition_key, upsertPayload)
  } catch (e) {
    throw {
      status: 500,
      message: `Failed to save manual month sales: ${String(e)}`,
    } satisfies AppError
  }

  return {
    ok: true as const,
    store_partition_key,
    applied,
    generated_at: new Date().toISOString(),
  }
}

/** 日次売上の手入力上書き（売上分析の日次表からのインライン編集）。各フィールドは
 *  - キー無し: 変更しない / null|"": その列の上書き解除 / 数値: 上書き。3列とも空になればその日の手入力を削除。 */
// 先頭が ZIP シグネチャ(PK\x03\x04)なら xlsx、それ以外は CSV とみなす。
// 月次日別売上管理表（Excel/CSV）を解析して entries を返す（解析のみ）。実処理は _shared/daily_sales_import.ts。
async function parseManualDaySalesImport(req: Request) {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch (_e) {
    throw { status: 400, message: "multipart/form-data でファイルを送信してください。" } satisfies AppError
  }
  const fileValue = formData.get("file")
  if (!(fileValue instanceof File)) {
    throw { status: 400, message: "file フィールドにファイルがありません。" } satisfies AppError
  }
  const bytes = new Uint8Array(await fileValue.arrayBuffer())
  const parsed = parseMonthlyDailySalesWorkbook(bytes, fileValue.name)
  if (!parsed.recognized) {
    throw { status: 400, message: parsed.error || "月次日別売上管理表として読み取れませんでした。" } satisfies AppError
  }
  return {
    ok: true,
    file_name: fileValue.name,
    import_mode: parsed.import_mode,
    store_name: parsed.store_name,
    store_key: parsed.store_key,
    period: parsed.period,
    manual_month_entry: parsed.manual_month_entry,
    entries: parsed.entries,
    covered_dates: parsed.covered_dates,
    day_count: parsed.day_count,
    total_gross_yen: parsed.total_gross_yen,
    skipped_zero_count: parsed.skipped_zero_count,
    warnings: parsed.warnings,
  }
}

// 解析した日次売上を「画像解析レシートと同等」に登録（上書き）。実処理は _shared/daily_sales_import.ts。
async function importDailyReceiptsCommit(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
) {
  const key = toSafeString(body.store_key).trim().toLowerCase()
  if (!key || key === "__all__") {
    throw { status: 400, message: "store_key（店舗）を指定してください。" } satisfies AppError
  }
  const entriesRaw = body.entries
  const importMode = toSafeString(body.import_mode).trim()
  if (importMode === "manual_month") {
    const raw = isRecord(body.manual_month_entry) ? body.manual_month_entry : null
    if (!raw) throw { status: 400, message: "manual_month_entry is required." } satisfies AppError
    const salesMonth = toSafeString(raw.sales_month).trim().slice(0, 7)
    const gross = toNonNegativeInteger(raw.gross_sales_yen)
    if (!/^\d{4}-\d{2}$/.test(salesMonth) || gross == null || gross <= 0) {
      throw { status: 400, message: "manual_month_entry is invalid." } satisfies AppError
    }
    const entry: ManualMonthImportEntry = {
      sales_month: salesMonth,
      gross_sales_yen: gross,
      tax_amount_yen: raw.tax_amount_yen == null || raw.tax_amount_yen === "" ? null : toNonNegativeInteger(raw.tax_amount_yen),
      net_sales_yen: raw.net_sales_yen == null || raw.net_sales_yen === "" ? null : toNonNegativeInteger(raw.net_sales_yen),
      party_count: raw.party_count == null || raw.party_count === "" ? null : toNonNegativeInteger(raw.party_count),
      guest_count: raw.guest_count == null || raw.guest_count === "" ? null : toNonNegativeInteger(raw.guest_count),
      operating_days_count: raw.operating_days_count == null || raw.operating_days_count === "" ? null : toNonNegativeInteger(raw.operating_days_count),
    }
    const coveredDates = (Array.isArray(body.covered_dates) ? body.covered_dates : [])
      .map((d) => toSafeString(d).trim().slice(0, 10))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d.slice(0, 7) === salesMonth)
    if (body.confirm_overwrite !== true) {
      const resolved = await resolveReceiptTableForStore(supabase, key)
      if (resolved) {
        const existing = await countExistingReceiptsForDates(supabase, resolved.receiptTable, coveredDates)
        if (existing > 0) {
          return {
            ok: false,
            needs_confirm: true,
            existing_count: existing,
            store_key: key,
            day_count: 0,
            message: `対象月には既に ${existing} 件の日別データがあります。取込むと削除され、月合計として上書きされます。`,
          }
        }
      }
    }
    return await importManualMonthSalesOverwrite(supabase, key, entry, coveredDates)
  }
  if (!Array.isArray(entriesRaw)) {
    throw { status: 400, message: "entries must be an array." } satisfies AppError
  }
  const entries: DailySalesImportEntry[] = []
  for (const e of entriesRaw) {
    if (!isRecord(e)) continue
    const sales_date = toSafeString(e.sales_date).trim().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sales_date)) continue
    const gross = toNonNegativeInteger(e.gross_sales_yen)
    if (gross == null || gross <= 0) continue
    entries.push({
      sales_date,
      gross_sales_yen: gross,
      party_count: (e.party_count == null || e.party_count === "") ? null : toNonNegativeInteger(e.party_count),
      guest_count: (e.guest_count == null || e.guest_count === "") ? null : toNonNegativeInteger(e.guest_count),
    })
  }
  // ファイルに載っていた全日付（0=休業の日も含む）。期間まるごと置換のため、この全日付の既存をクリアする。
  const coveredDates = (Array.isArray(body.covered_dates) ? body.covered_dates : [])
    .map((d) => toSafeString(d).trim().slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  // 上書き確認ゲート: 対象日に既存データがあり、confirm_overwrite 未指定なら削除せず確認を求める（誤上書き防止）。
  // フロントは needs_confirm を受けてユーザーに確認し、confirm_overwrite:true で再送する。
  if (body.confirm_overwrite !== true) {
    const resolved = await resolveReceiptTableForStore(supabase, key)
    if (resolved) {
      const clearDates = [...new Set([...coveredDates, ...entries.map((e) => e.sales_date)])]
      const existing = await countExistingReceiptsForDates(supabase, resolved.receiptTable, clearDates)
      if (existing > 0) {
        return {
          ok: false,
          needs_confirm: true,
          existing_count: existing,
          store_key: key,
          day_count: entries.length,
          message: `対象期間には既に ${existing} 件のデータがあります。取込むと削除され、今回の内容で上書きされます。`,
        }
      }
    }
  }
  return await importDailyReceiptsOverwrite(supabase, key, entries, coveredDates)
}

// 日別予算の直接入力（手動上書き）を保存。body: { store_key, entries:[{sales_date, budget_yen|null}] }
// budget_yen が null/空 の日は上書き解除（その日は自動按分へ戻る）。
async function upsertDailyBudgetEntries(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
) {
  const store_partition_key = normalizeBudgetStoreKey(toSafeString(body.store_key))
  const entriesRaw = body.entries
  if (!Array.isArray(entriesRaw)) {
    throw { status: 400, message: "entries must be an array." } satisfies AppError
  }
  const payload: Array<{ sales_date: string; budget_yen: number | null }> = []
  for (const entry of entriesRaw) {
    if (!isRecord(entry)) continue
    const sales_date = toSafeString(entry.sales_date).trim().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sales_date)) continue
    const raw = entry.budget_yen
    const budget_yen = (raw === null || raw === undefined || raw === "") ? null : toNonNegativeInteger(raw)
    payload.push({ sales_date, budget_yen })
  }
  let applied = 0
  try {
    applied = await upsertManualDayBudgetEntries(supabase, store_partition_key, payload)
  } catch (e) {
    throw { status: 500, message: e instanceof Error ? e.message : String(e) } satisfies AppError
  }
  return { ok: true, applied, store_key: store_partition_key }
}

async function upsertManualDayEntries(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
) {
  const store_partition_key = normalizeBudgetStoreKey(toSafeString(body.store_key))
  const entriesRaw = body.entries
  if (!Array.isArray(entriesRaw)) {
    throw { status: 400, message: "entries must be an array." } satisfies AppError
  }

  const resolveField = (entry: Record<string, unknown>, prop: string):
    number | null | undefined => {
    if (!(prop in entry)) return undefined
    const raw = entry[prop]
    if (raw === null || raw === undefined || raw === "") return null
    return toNonNegativeInteger(raw)
  }

  const upsertPayload: Array<{
    sales_date: string
    gross_sales_yen?: number | null
    party_count?: number | null
    guest_count?: number | null
  }> = []

  for (const entry of entriesRaw) {
    if (!isRecord(entry)) continue
    const sales_date = toSafeString(entry.sales_date).trim().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sales_date)) continue
    upsertPayload.push({
      sales_date,
      gross_sales_yen: resolveField(entry, "gross_sales_yen"),
      party_count: resolveField(entry, "party_count"),
      guest_count: resolveField(entry, "guest_count"),
    })
  }

  let applied = 0
  try {
    applied = await upsertManualDaySalesEntries(supabase, store_partition_key, upsertPayload)
  } catch (e) {
    throw {
      status: 500,
      message: `Failed to save manual day sales: ${String(e)}`,
    } satisfies AppError
  }

  return {
    ok: true as const,
    store_partition_key,
    applied,
    generated_at: new Date().toISOString(),
  }
}



function resolveReceiptEntryDateKeyForMonth(
  receiptDateValue: unknown,
  month: string,
): string | null {
  const receiptDate = toSafeString(receiptDateValue)
  if (/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(receiptDate) && receiptDate.startsWith(`${month}-`)) {
    return receiptDate
  }
  return null
}

function toJstDateKeyFromIso(value: unknown): string | null {
  const iso = toSafeString(value)
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const year = parts.find((part) => part.type === "year")?.value
  const month = parts.find((part) => part.type === "month")?.value
  const day = parts.find((part) => part.type === "day")?.value
  if (!year || !month || !day) return null
  return `${year}-${month}-${day}`
}

function buildJstDateKeysForMonth(month: string): string[] {
  const matched = month.match(/^(\d{4})-(\d{2})$/)
  if (!matched) return []
  const year = Number(matched[1])
  const monthNum = Number(matched[2])
  if (!Number.isInteger(year) || !Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) return []
  const lastDay = new Date(Date.UTC(year, monthNum, 0)).getUTCDate()
  const keys: string[] = []
  for (let day = 1; day <= lastDay; day += 1) {
    keys.push(`${String(year).padStart(4, "0")}-${String(monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`)
  }
  return keys
}

function roundToScale(value: number, scale = 2): number {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** Math.max(0, Math.floor(scale))
  return Math.round(value * factor) / factor
}

function getReservationSourceTables(
  source: "tabelog" | "ikyu",
): { eventTable: "tabelog_reservation_visit_events" | "ikyu_reservation_visit_events"; summaryTable: "tabelog_reservation_visit_summaries" | "ikyu_reservation_visit_summaries" } {
  if (source === "tabelog") {
    return {
      eventTable: "tabelog_reservation_visit_events",
      summaryTable: "tabelog_reservation_visit_summaries",
    }
  }
  return {
    eventTable: "ikyu_reservation_visit_events",
    summaryTable: "ikyu_reservation_visit_summaries",
  }
}

function getReservationSummarySource(
  source: string,
): "tabelog" | "ikyu" | "manual" | null {
  if (source === "tabelog" || source === "ikyu" || source === "manual") return source
  return null
}

async function rebuildReservationSummaryForCustomer(
  supabase: ReturnType<typeof createClient>,
  source: string,
  customerName: string | null,
  customerPhone: string | null,
) {
  const partner = getReservationSummarySource(source)
  const name = toSafeString(customerName)
  const phone = toSafeString(customerPhone)
  if (!partner || !name || !phone) return
  const { error } = await supabase.rpc("rebuild_partner_reservation_summary", {
    p_partner: partner,
    p_customer_name: name,
    p_customer_phone: phone,
  })
  if (error) {
    console.error(`Failed to rebuild ${partner} reservation summary for ${name}/${phone}:`, error.message)
  }
}

function buildReservationSummaryLookup(rows: unknown): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>()
  const list = Array.isArray(rows) ? rows : []
  for (const row of list) {
    if (!isRecord(row)) continue
    const name = toSafeString(row.customer_name)
    const phone = toSafeString(row.customer_phone)
    if (!name || !phone) continue
    map.set(`${name}__${phone}`, row)
  }
  return map
}

function extractReservationNoFromReservationRow(row: Record<string, unknown>): string | null {
  const reservationDetail = toSafeString(row.reservation_detail)
  if (!reservationDetail) return null
  const parsedDetail = parseReservationCalendarDetail(reservationDetail)
  const reservationNo = toSafeString(parsedDetail?.reservationNo)
  return reservationNo || null
}

function buildReservationCountDedupeKey(
  name: string,
  phone: string,
  row: Record<string, unknown>,
): string | null {
  const reservationNo = extractReservationNoFromReservationRow(row)
  if (!reservationNo) return null
  return `${name}__${phone}__${isReservationCancellationRow(row) ? "cancel" : "active"}__${reservationNo}`
}

async function buildReservationEffectiveSummaryLookup(
  supabase: ReturnType<typeof createClient>,
  eventTable:
    | "tabelog_reservation_visit_events"
    | "ikyu_reservation_visit_events"
    | "manual_reservation_visit_events",
  seedRows: unknown,
  fallbackRows: unknown,
): Promise<Map<string, Record<string, unknown>>> {
  const fallbackMap = buildReservationSummaryLookup(fallbackRows)
  const seedList = Array.isArray(seedRows) ? seedRows : []
  const names = new Set<string>()
  const phones = new Set<string>()

  for (const row of seedList) {
    if (!isRecord(row)) continue
    const name = toSafeString(row.customer_name)
    const phone = toSafeString(row.customer_phone)
    if (!name || !phone) continue
    names.add(name)
    phones.add(phone)
  }

  if (names.size === 0 || phones.size === 0) {
    return fallbackMap
  }

  const { data, error } = await supabase
    .from(eventTable)
    .select("customer_name, customer_phone, visit_at, created_at, reservation_type, reservation_detail")
    .in("customer_name", [...names])
    .in("customer_phone", [...phones])
    .order("visit_at", { ascending: false })
    .limit(RESERVATION_CUSTOMER_HISTORY_FETCH_CAP)

  if (error) {
    console.error(`Failed to fetch reservation customer history from ${eventTable}:`, error.message)
    return fallbackMap
  }

  const map = new Map<string, Record<string, unknown>>()
  const seenReservationKeys = new Set<string>()
  const rows = Array.isArray(data) ? data : []
  for (const row of rows) {
    if (!isRecord(row)) continue
    const name = toSafeString(row.customer_name)
    const phone = toSafeString(row.customer_phone)
    if (!name || !phone) continue
    const dedupeKey = buildReservationCountDedupeKey(name, phone, row)
    if (dedupeKey && seenReservationKeys.has(dedupeKey)) continue
    if (dedupeKey) seenReservationKeys.add(dedupeKey)
    const key = `${name}__${phone}`
    const prev = map.get(key)
    const isCancellation = isReservationCancellationRow(row)
    const delta = isCancellation ? -1 : 1
    const nextCount = Math.max(0, toNonNegativeInteger(prev?.visit_count) + delta)
    const candidateLastVisitAt = isCancellation
      ? null
      : (toSafeString(row.visit_at) || toSafeString(row.created_at) || null)
    const prevLastVisitAt = toSafeString(prev?.last_visit_at) || null
    const lastVisitAt = chooseLaterIso(prevLastVisitAt, candidateLastVisitAt)
    map.set(key, {
      customer_name: name,
      customer_phone: phone,
      visit_count: nextCount,
      last_visit_at: lastVisitAt,
    })
  }

  for (const [key, row] of fallbackMap.entries()) {
    if (!map.has(key)) map.set(key, row)
  }
  return map
}

function isReservationCancellationRow(row: Record<string, unknown>): boolean {
  const reservationType = toSafeString(row.reservation_type)
  const reservationDetail = toSafeString(row.reservation_detail)
  const parsedDetail = parseReservationCalendarDetail(reservationDetail)
  if (RESERVATION_CANCELLATION_RE.test(reservationType)) return true
  if (parsedDetail && reservationParsedDetailLooksCancelled(parsedDetail)) return true
  return RESERVATION_CANCELLATION_RE.test(reservationDetail)
}

function reservationParsedDetailLooksCancelled(detail: Record<string, unknown>): boolean {
  const candidateKeys = [
    "status",
    "reservationStatus",
    "action",
    "eventType",
    "mailType",
    "subject",
    "title",
    "summary",
    "note",
  ]
  for (const key of candidateKeys) {
    if (RESERVATION_CANCELLATION_RE.test(toSafeString(detail[key]))) return true
  }
  return false
}

function chooseLaterIso(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  const aMs = Date.parse(a)
  const bMs = Date.parse(b)
  if (!Number.isFinite(aMs)) return b
  if (!Number.isFinite(bMs)) return a
  return bMs > aMs ? b : a
}

function buildReservationCalendarItem(
  source: "tabelog" | "ikyu" | "manual",
  event: Record<string, unknown>,
  summaryByCustomer: Map<string, Record<string, unknown>> | null,
): Record<string, unknown> | null {
  const name = String(event.customer_name ?? "").trim()
  const phone = String(event.customer_phone ?? "").trim()
  const visitAt = toSafeString(event.visit_at)
  const createdAt = toSafeString(event.created_at)
  if (!visitAt && !createdAt) return null

  const defaultSourceLabel = source === "tabelog"
    ? "食べログ"
    : source === "ikyu"
    ? "一休.comレストラン"
    : "手入力"
  const visitAtValue = visitAt || createdAt
  const createdAtValue = createdAt || visitAt
  const reservationType = toSafeString(event.reservation_type) || "unknown"
  const reservationDetail = toSafeString(event.reservation_detail)
  const parsedDetail = parseReservationCalendarDetail(reservationDetail)
  const routeLabel = normalizeCalendarText(
    parsedDetail?.route ??
      parsedDetail?.reservationSite ??
      defaultSourceLabel,
    80,
  ) ?? defaultSourceLabel
  const customerNameLabel = normalizeCalendarText(parsedDetail?.customerName, 80) ?? (name || null)
  const planLabel = normalizeCalendarText(parsedDetail?.plan, 220) ??
    (parsedDetail ? null : normalizeCalendarText(reservationDetail, 220))
  const partySizeLabel = normalizeCalendarPartySize(parsedDetail?.partySize)
  const allergyLabel = normalizeCalendarAllergy(parsedDetail?.allergy)
  const visitTimeLabel = buildCalendarVisitTimeLabel(parsedDetail?.visitDateTime, visitAtValue)
  const visitMonth = buildCalendarVisitMonthLabel(visitAtValue)
  const storeNameLabel = normalizeCalendarText(parsedDetail?.storeName, 90)
  const summary = summaryByCustomer?.get(`${name}__${phone}`)
  const visitCount = Number(summary?.visit_count ?? 0)

  return {
    source,
    id: Number(event.id ?? 0),
    gmail_message_id: toSafeString(event.gmail_message_id),
    customer_name: name,
    customer_phone: phone,
    visit_at: visitAtValue,
    visit_month: visitMonth,
    created_at: createdAtValue,
    visit_count: Number.isFinite(visitCount) && visitCount > 0 ? Math.floor(visitCount) : 0,
    last_visit_at: toSafeString(summary?.last_visit_at),
    reservation_type: reservationType,
    reservation_detail: reservationDetail,
    route_label: routeLabel,
    customer_name_label: customerNameLabel,
    visit_time_label: visitTimeLabel,
    plan_label: planLabel,
    party_size_label: partySizeLabel,
    allergy_label: allergyLabel,
    store_name: storeNameLabel,
    is_manual: source === "manual",
    manual_hidden: event.manual_hidden === true,
    manual_hidden_reason: toSafeString(event.manual_hidden_reason) || null,
    manual_store_key: toSafeString(event.manual_store_key) || null,
    manual_edited_at: toSafeString(event.manual_edited_at) || toSafeString(event.updated_at) || null,
  }
}

function normalizeReservationStoreScope(value: unknown): string | null {
  const raw = String(value ?? "").trim()
  return raw ? raw.toLowerCase() : null
}

function resolveReservationCalendarItemStoreKey(item: Record<string, unknown>): string | null {
  const manualStoreKey = String(item.manual_store_key ?? "").trim()
  if (manualStoreKey) return manualStoreKey.toLowerCase()
  const storeName = String(item.store_name ?? "").trim()
  if (!storeName) return null
  const resolved = resolveReceiptNamePartitionKey(storeName)
  return resolved ? String(resolved).trim().toLowerCase() : null
}

function reservationCalendarItemMatchesStoreScope(
  item: Record<string, unknown>,
  storeScope: string | null,
): boolean {
  if (!storeScope) return true
  return resolveReservationCalendarItemStoreKey(item) === storeScope
}

function reservationEventRecordMatchesStoreScope(
  source: "tabelog" | "ikyu" | "manual",
  record: unknown,
  storeScope: string | null,
): boolean {
  if (!storeScope || !isRecord(record)) return true
  const item = buildReservationCalendarItem(source, record, null)
  if (!item) return false
  return reservationCalendarItemMatchesStoreScope(item, storeScope)
}

async function fetchReservationEventRecordForScopeCheck(
  supabase: ReturnType<typeof createClient>,
  table: string,
  id: number,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from(table)
    .select("id, reservation_detail, manual_store_key, created_at, visit_at")
    .eq("id", id)
    .maybeSingle()
  if (error) {
    throw { status: 500, message: `Failed to verify reservation scope: ${error.message}` } satisfies AppError
  }
  if (!isRecord(data)) {
    throw { status: 404, message: "対象の予約が見つかりません。" } satisfies AppError
  }
  return data
}

function assertReservationEventMatchesStoreScope(
  source: string,
  record: unknown,
  storeScope: string | null,
) {
  const normalizedScope = normalizeReservationStoreScope(storeScope)
  const normalizedSource = source === "tabelog" || source === "ikyu" || source === "manual"
    ? source
    : null
  if (!normalizedScope || !normalizedSource) return
  if (!reservationEventRecordMatchesStoreScope(normalizedSource, record, normalizedScope)) {
    throw { status: 403, message: "他店舗の予約は編集できません。" } satisfies AppError
  }
}

function parseReservationCalendarDetail(detail: string): Record<string, unknown> | null {
  const text = String(detail ?? "").trim()
  if (!text || !text.startsWith("{")) return null
  try {
    const parsed = JSON.parse(text)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function normalizeCalendarText(value: unknown, maxLength = 160): string | null {
  const normalized = toSafeString(value)
  if (!normalized) return null
  if (normalized === "不明" || normalized === "なし") return null
  if (normalized.length > maxLength) return `${normalized.slice(0, maxLength)}...`
  return normalized
}

function normalizeCalendarPartySize(value: unknown): string | null {
  const text = normalizeCalendarText(value, 40)
  if (!text) return null
  const numberHit = text.match(/([0-9０-９]+)/)
  if (!numberHit) return text
  const digits = numberHit[1].replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
  return `${digits}名`
}

function normalizeCalendarAllergy(value: unknown): string | null {
  const text = normalizeCalendarText(value, 120)
  if (!text) return null
  if (/^(なし|無|無し|ありません|特になし|該当なし|なしです|不要|記載なし)$/i.test(text)) return null
  return text
}

function buildCalendarVisitTimeLabel(visitDateTime: unknown, visitAtIso: string): string | null {
  const rawVisitDateTime = toSafeString(visitDateTime)
  if (rawVisitDateTime) {
    const hit = rawVisitDateTime.match(/([0-2]?\d):([0-5]\d)/)
    if (hit) return `${String(Number(hit[1])).padStart(2, "0")}:${hit[2]}`
  }

  const fallback = toSafeString(visitAtIso)
  if (!fallback) return null
  const date = new Date(fallback)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date)
  const hour = parts.find((part) => part.type === "hour")?.value
  const minute = parts.find((part) => part.type === "minute")?.value
  if (!hour || !minute) return null
  return `${hour}:${minute}`
}

function buildCalendarVisitMonthLabel(visitAtIso: string): string | null {
  const iso = toSafeString(visitAtIso)
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date)
  const year = parts.find((part) => part.type === "year")?.value
  const month = parts.find((part) => part.type === "month")?.value
  if (!year || !month) return null
  return `${year}-${month}`
}

function normalizeReservationSearchQuery(value: string | null): string {
  const query = toSafeString(value).replace(/\u3000/g, " ").replace(/\s+/g, " ").trim()
  return query
}

function buildReservationNameSearchPatterns(query: string): string[] {
  const compact = query.replace(/\s+/g, "").replace(/様/g, "").trim()
  const noHonorific = query.replace(/様/g, "").trim()
  return [...new Set([
    query,
    noHonorific,
    compact,
  ].map((value) => value.trim()).filter((value) => value.length > 0))]
}

function normalizeReservationNameSearchKey(value: unknown): string {
  const raw = toSafeString(value)
  if (!raw) return ""
  return raw
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, "")
    .replace(/様/g, "")
    .trim()
    .toLowerCase()
}

function matchesReservationSearchItem(item: Record<string, unknown>, query: string): boolean {
  const queryKey = normalizeReservationNameSearchKey(query)
  if (!queryKey) return true
  const candidates = [
    item.customer_name,
    item.customer_name_label,
    item.reservation_detail,
  ]
  return candidates.some((candidate) => {
    const candidateKey = normalizeReservationNameSearchKey(candidate)
    return candidateKey.includes(queryKey)
  })
}

function escapeLikePattern(value: string): string {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_")
}

function normalizeCalendarMonthParam(value: string | null): string {
  const src = String(value ?? "").trim()
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(src)) return src
  // 2026-5 のような 1 桁月や trim 漏れで「現在月」に落ちると、店舗休日が対象月と不一致で全除外される
  const loose = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/.exec(src)
  if (loose) {
    const y = Number(loose[1])
    const moRaw = Number(loose[2])
    if (Number.isFinite(y) && y >= 1900 && y <= 2100 && Number.isFinite(moRaw)) {
      const mo = Math.min(12, Math.max(1, Math.floor(moRaw)))
      return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}`
    }
  }
  const now = new Date()
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  })
  const parts = formatter.formatToParts(now)
  const year = parts.find((part) => part.type === "year")?.value ?? String(now.getUTCFullYear())
  const month = parts.find((part) => part.type === "month")?.value ?? "01"
  return `${year}-${month}`
}

function normalizeReservationSourceFilter(value: string | null): "all" | "tabelog" | "ikyu" | "manual" {
  const normalized = String(value ?? "").trim().toLowerCase()
  if (normalized === "tabelog") return "tabelog"
  if (normalized === "ikyu") return "ikyu"
  if (normalized === "manual") return "manual"
  return "all"
}

// 予約イベントのソース → 物理テーブル名（手入力含む）。
function reservationEventTableForSource(source: string): string | null {
  if (source === "tabelog") return "tabelog_reservation_visit_events"
  if (source === "ikyu") return "ikyu_reservation_visit_events"
  if (source === "manual") return "manual_reservation_visit_events"
  return null
}

// 既存イベント表（tabelog/ikyu）が手動編集用に追加した列を含めた SELECT 列。
const RESERVATION_EVENT_SELECT_COLUMNS =
  "id, gmail_message_id, customer_name, customer_phone, visit_at, created_at, reservation_type, reservation_detail, manual_hidden, manual_hidden_reason, manual_store_key, manual_edited_at"

// 手入力予約表の SELECT 列（gmail_message_id を持たない）。
const MANUAL_RESERVATION_SELECT_COLUMNS =
  "id, customer_name, customer_phone, visit_at, created_at, reservation_type, reservation_detail, manual_hidden, manual_hidden_reason, manual_store_key, updated_at"

const RESERVATION_MANUAL_HIDDEN_REASONS = new Set(["cancel", "mistake", "other"])

// 来店日時の入力（"2026-06-04T18:30" 等）を ISO 文字列へ正規化。妥当でなければ null。
function normalizeReservationVisitAtIso(value: unknown): string | null {
  const raw = String(value ?? "").trim()
  if (!raw) return null
  const ms = Date.parse(raw)
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toISOString()
}

function buildJstMonthRange(month: string): { startIso: string; endIso: string } {
  const matched = month.match(/^(\d{4})-(\d{2})$/)
  if (!matched) {
    const fallbackStart = new Date()
    const fallbackEnd = new Date(fallbackStart.getTime() + 31 * 24 * 60 * 60 * 1000)
    return {
      startIso: fallbackStart.toISOString(),
      endIso: fallbackEnd.toISOString(),
    }
  }
  const year = Number(matched[1])
  const monthNumber = Number(matched[2])
  const startUtc = Date.UTC(year, monthNumber - 1, 1, -9, 0, 0)
  const endUtc = Date.UTC(year, monthNumber, 1, -9, 0, 0)
  return {
    startIso: new Date(startUtc).toISOString(),
    endIso: new Date(endUtc).toISOString(),
  }
}

async function fetchLineDocumentUsageStats(
  supabase: ReturnType<typeof createClient>,
  roomId: string | null,
): Promise<{ ok: true; stats: MediaUsageStats } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc("get_line_document_usage_stats", {
    filter_room_id: roomId,
  })
  if (error) {
    return { ok: false, message: `Failed to fetch document usage stats: ${error.message}` }
  }
  const row = Array.isArray(data) ? data[0] : null
  const totalFiles = toNonNegativeInteger((row as any)?.total_files)
  const totalBytes = toNonNegativeInteger((row as any)?.total_bytes)
  return {
    ok: true,
    stats: {
      total_files: totalFiles,
      total_bytes: totalBytes,
    },
  }
}

function normalizeDocumentListRow(value: unknown): DocumentListRow | null {
  if (!isRecord(value)) return null
  const idNum = Number(value.id)
  if (!Number.isFinite(idNum) || idNum <= 0) return null

  const storageBucket = toSafeString(value.storage_bucket)
  const storagePath = toSafeString(value.storage_path)
  const originalFileName = toSafeString(value.original_file_name)
  if (!storageBucket || !storagePath || !originalFileName) return null

  const mimeType = normalizeDocumentMimeType(String(value.mime_type ?? ""), originalFileName)
  if (!mimeType) return null

  return {
    id: Math.floor(idNum),
    room_id: value.room_id == null ? null : toSafeString(value.room_id) || null,
    room_name: value.room_name == null ? null : String(value.room_name),
    storage_bucket: storageBucket,
    storage_path: storagePath,
    original_file_name: originalFileName,
    mime_type: mimeType,
    file_size_bytes: toNonNegativeInteger(value.file_size_bytes),
    extracted_text: normalizeExtractedText(String(value.extracted_text ?? "")),
    source: toSafeString(value.source) || "manual_upload",
    created_at: String(value.created_at ?? ""),
    updated_at: String(value.updated_at ?? ""),
  }
}

async function uploadDocumentFile(
  req: Request,
  supabase: ReturnType<typeof createClient>,
) {
  const contentLength = Number(req.headers.get("content-length") ?? "")
  if (Number.isFinite(contentLength) && contentLength > DOCUMENT_UPLOAD_MAX_BYTES + 1024 * 1024) {
    throw { status: 400, message: "payload is too large." } satisfies AppError
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    throw {
      status: 400,
      message: "Upload request must be multipart/form-data.",
    } satisfies AppError
  }

  const fileValue = formData.get("file")
  if (!(fileValue instanceof File)) {
    throw { status: 400, message: "file is required." } satisfies AppError
  }
  if (!Number.isFinite(fileValue.size) || fileValue.size <= 0) {
    throw { status: 400, message: "file must not be empty." } satisfies AppError
  }
  if (fileValue.size >= DOCUMENT_UPLOAD_MAX_BYTES) {
    throw {
      status: 400,
      message: `file must be smaller than ${Math.floor(DOCUMENT_UPLOAD_MAX_BYTES / (1024 * 1024))}MB.`,
    } satisfies AppError
  }

  const roomIdRaw = toSafeString(formData.get("room_id"))
  const roomId = roomIdRaw || null
  let roomName = toSafeString(formData.get("room_name")) || null

  const originalFileName = sanitizeUploadFileName(fileValue.name || "document")
  const mimeType = normalizeDocumentMimeType(fileValue.type || "", originalFileName)
  if (!mimeType) {
    throw { status: 400, message: "Only TXT/PDF/DOCX/XLSX files can be uploaded." } satisfies AppError
  }

  const buffer = await fileValue.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const validationError = await validateDocumentPayloadSafety(bytes, mimeType)
  if (validationError) {
    throw { status: 400, message: validationError } satisfies AppError
  }
  const fallbackExtractedText = mimeType === "text/plain"
    ? tryDecodeText(bytes)
    : mimeType === "application/pdf"
      ? await extractPdfText(bytes)
      : mimeType === DOCX_MIME_TYPE
        ? await extractDocxText(bytes)
        : mimeType === XLSX_MIME_TYPE
          ? await extractXlsxText(bytes)
      : ""
  const extractedText = normalizeExtractedText(fallbackExtractedText)
  const nowIso = new Date().toISOString()
  const storagePath = buildDocumentStoragePath(roomId, originalFileName)

  const uploadRes = await supabase
    .storage
    .from(LINE_DOCUMENT_BUCKET)
    .upload(storagePath, bytes, {
      contentType: mimeType,
      upsert: false,
    })
  if (uploadRes.error) {
    throw { status: 500, message: `Failed to upload document: ${uploadRes.error.message}` } satisfies AppError
  }

  if (roomId && !roomName) {
    const { data: roomRow } = await supabase
      .from("room_summary_settings")
      .select("room_name")
      .eq("room_id", roomId)
      .maybeSingle()
    roomName = toSafeString(roomRow?.room_name) || null
  }

  const insertPayload = {
    room_id: roomId,
    room_name: roomName,
    storage_bucket: LINE_DOCUMENT_BUCKET,
    storage_path: storagePath,
    original_file_name: originalFileName,
    mime_type: mimeType,
    file_size_bytes: bytes.byteLength,
    extracted_text: extractedText,
    source: "manual_upload",
    created_at: nowIso,
    updated_at: nowIso,
  }
  const { data: inserted, error: insertError } = await supabase
    .from("line_search_documents")
    .insert(insertPayload)
    .select("id, room_id, room_name, storage_bucket, storage_path, original_file_name, mime_type, file_size_bytes, extracted_text, source, created_at, updated_at")
    .single()

  if (insertError) {
    await supabase.storage.from(LINE_DOCUMENT_BUCKET).remove([storagePath])
    throw { status: 500, message: `Failed to save document metadata: ${insertError.message}` } satisfies AppError
  }

  const normalized = normalizeDocumentListRow(inserted)
  if (!normalized) {
    await supabase.storage.from(LINE_DOCUMENT_BUCKET).remove([storagePath])
    throw { status: 500, message: "Saved document row is invalid." } satisfies AppError
  }

  const signedUrl = await createSignedMediaDownloadUrl(
    supabase,
    normalized.storage_bucket,
    normalized.storage_path,
    normalized.original_file_name,
  )
  return {
    ...normalized,
    snippet: buildDocumentSnippet(normalized.extracted_text, DOCUMENT_PREVIEW_MAX_CHARS),
    signed_url: signedUrl,
    has_extracted_text: normalized.extracted_text.length > 0,
    extracted_char_count: normalized.extracted_text.length,
  }
}

function normalizeDocumentMimeType(rawMimeType: string, fileName: string): DocumentMimeType | null {
  const normalizedMimeType = String(rawMimeType ?? "").split(";")[0].trim().toLowerCase()
  if (normalizedMimeType === "text/plain") return "text/plain"
  if (normalizedMimeType === "application/pdf") return "application/pdf"
  if (normalizedMimeType === DOCX_MIME_TYPE) return DOCX_MIME_TYPE
  if (normalizedMimeType === XLSX_MIME_TYPE) return XLSX_MIME_TYPE

  const ext = extractFileExt(fileName)
  if (ext === "txt" || ext === "log" || ext === "md" || ext === "csv") {
    return "text/plain"
  }
  if (ext === "pdf") return "application/pdf"
  if (ext === "docx") return DOCX_MIME_TYPE
  if (ext === "xlsx") return XLSX_MIME_TYPE
  return null
}

function parseDocumentPermissionPath(path: string): number | null {
  const match = path.match(/^\/documents\/(\d+)\/permissions$/)
  if (!match || !match[1]) return null
  const documentId = Number(match[1])
  if (!Number.isInteger(documentId) || documentId <= 0) return null
  return documentId
}

async function ensureDocumentExists(
  supabase: ReturnType<typeof createClient>,
  documentId: number,
): Promise<void> {
  const { data, error } = await supabase
    .from("line_search_documents")
    .select("id")
    .eq("id", documentId)
    .maybeSingle()
  if (error) {
    throw { status: 500, message: `Failed to fetch document row: ${error.message}` } satisfies AppError
  }
  if (!data?.id) {
    throw { status: 404, message: "Document not found." } satisfies AppError
  }
}

async function fetchDocumentPermissionStateById(
  supabase: ReturnType<typeof createClient>,
  documentId: number,
): Promise<DocumentViewerPermissionState> {
  await ensureDocumentExists(supabase, documentId)
  const { data, error } = await supabase
    .from("line_search_document_viewers")
    .select("line_user_id")
    .eq("document_id", documentId)
    .order("line_user_id", { ascending: true })
  if (error) {
    throw { status: 500, message: `Failed to fetch document permissions: ${error.message}` } satisfies AppError
  }
  const ids = Array.isArray(data)
    ? data.map((row) => toSafeString(row?.line_user_id)).filter((value) => value.length > 0)
    : []
  return {
    document_id: documentId,
    mode: ids.length > 0 ? "restricted" : "public",
    allowed_user_ids: ids,
  }
}

function normalizeDocumentPermissionUserIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of raw) {
    const normalized = String(value ?? "").trim()
    if (!normalized || normalized.length > 191) continue
    if (seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
    if (out.length >= 300) break
  }
  return out
}

async function updateDocumentPermissionStateById(
  supabase: ReturnType<typeof createClient>,
  documentId: number,
  body: Record<string, unknown>,
): Promise<DocumentViewerPermissionState> {
  await ensureDocumentExists(supabase, documentId)

  const modeRaw = String(body.mode ?? "").trim().toLowerCase()
  const requestedIds = normalizeDocumentPermissionUserIds(body.line_user_ids)
  const shouldRestrict = modeRaw === "restricted" || (modeRaw !== "public" && requestedIds.length > 0)
  if (shouldRestrict && requestedIds.length === 0) {
    throw { status: 400, message: "restricted mode requires line_user_ids." } satisfies AppError
  }

  const { error: deleteError } = await supabase
    .from("line_search_document_viewers")
    .delete()
    .eq("document_id", documentId)
  if (deleteError) {
    throw { status: 500, message: `Failed to clear existing document permissions: ${deleteError.message}` } satisfies AppError
  }

  if (shouldRestrict) {
    const rows = requestedIds.map((lineUserId) => ({
      document_id: documentId,
      line_user_id: lineUserId,
    }))
    const { error: insertError } = await supabase
      .from("line_search_document_viewers")
      .insert(rows)
    if (insertError) {
      throw { status: 500, message: `Failed to save document permissions: ${insertError.message}` } satisfies AppError
    }
  }

  return await fetchDocumentPermissionStateById(supabase, documentId)
}

async function fetchDocumentPermissionSummaries(
  supabase: ReturnType<typeof createClient>,
  documentIds: number[],
): Promise<Map<number, { mode: "public" | "restricted"; allowed_user_count: number }>> {
  const out = new Map<number, { mode: "public" | "restricted"; allowed_user_count: number }>()
  const ids = Array.from(new Set(documentIds.filter((value) => Number.isInteger(value) && value > 0)))
  if (ids.length === 0) return out

  const { data, error } = await supabase
    .from("line_search_document_viewers")
    .select("document_id, line_user_id")
    .in("document_id", ids)
  if (error) {
    console.error("Failed to fetch document permission summaries:", error.message)
    return out
  }

  const counts = new Map<number, number>()
  for (const row of Array.isArray(data) ? data : []) {
    const documentId = Number((row as any)?.document_id)
    if (!Number.isInteger(documentId) || documentId <= 0) continue
    counts.set(documentId, (counts.get(documentId) || 0) + 1)
  }
  for (const documentId of ids) {
    const count = counts.get(documentId) || 0
    out.set(documentId, {
      mode: count > 0 ? "restricted" : "public",
      allowed_user_count: count,
    })
  }
  return out
}

function sanitizeUploadFileName(value: string): string {
  const safe = String(value ?? "")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
  if (!safe) return "document.txt"
  return safe.length <= 180 ? safe : safe.slice(0, 180).trimEnd()
}

function extractFileExt(fileName: string): string {
  const safe = sanitizeUploadFileName(fileName)
  const idx = safe.lastIndexOf(".")
  if (idx < 0 || idx === safe.length - 1) return ""
  return safe
    .slice(idx + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

function normalizeYearMonth(value: unknown): string {
  const month = String(value ?? "").trim()
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw { status: 400, message: "month must be YYYY-MM." } satisfies AppError
  }
  return month
}

function normalizePosJournalStoreKey(value: unknown): string {
  const key = String(value ?? "").trim().toLowerCase()
  if (!key || key === "__all__") {
    throw {
      status: 400,
      message: "store_key（店舗）を指定してください。",
    } satisfies AppError
  }
  return key
}

function posJournalFileRow(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null
  const id = Number(value.id)
  const businessDate = String(value.business_date ?? "").slice(0, 10)
  if (
    !Number.isInteger(id) || id <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)
  ) return null
  const parsedData = isRecord(value.parsed_data) ? value.parsed_data : {}
  return {
    id,
    store_key: toSafeString(value.store_partition_key),
    store_code: toSafeString(value.store_code),
    business_date: businessDate,
    month: toSafeString(value.year_month) || businessDate.slice(0, 7),
    original_file_name: toSafeString(value.original_file_name),
    inner_file_name: value.inner_file_name == null
      ? null
      : toSafeString(value.inner_file_name),
    file_size_bytes: toNonNegativeInteger(value.file_size_bytes),
    sha256_hex: toSafeString(value.sha256_hex),
    net_sales: toNonNegativeInteger(value.net_sales),
    tax: toNonNegativeInteger(value.tax_yen),
    gross_sales: toNonNegativeInteger(value.gross_sales),
    groups: toNonNegativeInteger(value.groups_count),
    guests: toNonNegativeInteger(value.guests_count),
    receipts_count: toNonNegativeInteger(value.receipts_count),
    parsed_complete: parsedData.parsed_complete === true,
    uploaded_at: String(value.uploaded_at ?? ""),
    parsed_data: parsedData,
  }
}

async function fetchPosJournalRows(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
  month: string,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from("pos_journal_files")
    .select(
      "id, store_partition_key, store_code, business_date, year_month, original_file_name, inner_file_name, file_size_bytes, sha256_hex, parsed_data, net_sales, tax_yen, gross_sales, groups_count, guests_count, receipts_count, storage_deleted_at, storage_delete_error, uploaded_at",
    )
    .eq("store_partition_key", storeKey)
    .eq("year_month", month)
    .is("storage_deleted_at", null)
    .order("business_date", { ascending: true })
    .order("id", { ascending: true })
  if (error) {
    throw {
      status: 500,
      message: `電子ジャーナル一覧の取得に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  return (Array.isArray(data) ? data : [])
    .map(posJournalFileRow)
    .filter((row): row is Record<string, unknown> => row !== null)
}

type SharedJournalReportState = {
  days: PosJournalDay[]
  reportCount: number
  error: string | null
}

function savedReportCandidateMatchesMonth(
  row: Record<string, unknown>,
  month: string,
): boolean {
  const sourceMonths = Array.isArray(row.sourceMonths)
    ? row.sourceMonths.map((value) => toSafeString(value)).filter(Boolean)
    : []
  if (sourceMonths.includes(month)) return true
  const [year, monthText] = month.split("-")
  const monthNumber = Number(monthText)
  if (!year || !Number.isInteger(monthNumber)) return false
  const text = `${toSafeString(row.title)} ${toSafeString(row.period)}`
    .normalize("NFKC")
  return text.includes(month) ||
    text.includes(`${year}/${monthNumber}`) ||
    new RegExp(`${year}\\s*年\\s*0?${monthNumber}\\s*月`).test(text)
}

/**
 * Journal Report（public/jnm）が保存したレポートを、同店舗・同月の
 * 電子ジャーナル画面から共有参照する。
 *
 * 一覧では JSONB 全体を読まず候補だけ選び、最大8件の詳細を順番に確認して
 * sales を持つ最良の1件を採用する。複数月の合算レポートより単月を優先し、
 * 不完全な再取込より総売上・伝票数が大きい候補を優先する。
 */
async function fetchSharedJournalReportState(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
  month: string,
): Promise<SharedJournalReportState> {
  const summarySelect = [
    "id",
    "title",
    "period",
    "created_at",
    "sourceMonths:data->sourceMonths",
    "salesCount:data->salesCount",
    "total:data->total",
    "totalSales:data->totalSales",
  ].join(", ")
  const { data: candidatesData, error: candidatesError } = await supabase
    .from("saved_reports")
    .select(summarySelect)
    .eq("store_partition_key", storeKey)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(2000)
  if (candidatesError) {
    console.error(
      "Journal Report shared reference list failed:",
      storeKey,
      month,
      candidatesError.message,
    )
    return { days: [], reportCount: 0, error: candidatesError.message }
  }
  const candidates = (Array.isArray(candidatesData) ? candidatesData : [])
    .map((value) => isRecord(value) ? value as Record<string, unknown> : null)
    .filter((row): row is Record<string, unknown> => row !== null)
    .filter((row) => savedReportCandidateMatchesMonth(row, month))
    .map((row) => {
      const sourceMonths = Array.isArray(row.sourceMonths)
        ? row.sourceMonths.map((value) => toSafeString(value)).filter(Boolean)
        : []
      return {
        id: toSafeString(row.id),
        title: toSafeString(row.title),
        createdAt: String(row.created_at ?? ""),
        sourceMonths,
        singleMonth: sourceMonths.length === 1 && sourceMonths[0] === month,
        monthly: isMonthlyReportTitleForList(toSafeString(row.title)),
        salesCount: toNonNegativeInteger(row.salesCount),
        total: Math.max(
          toNonNegativeInteger(row.total),
          toNonNegativeInteger(row.totalSales),
        ),
      }
    })
    .filter((row) => !!row.id)
    .sort((a, b) =>
      Number(b.singleMonth) - Number(a.singleMonth) ||
      b.total - a.total ||
      b.salesCount - a.salesCount ||
      Number(b.monthly) - Number(a.monthly) ||
      b.createdAt.localeCompare(a.createdAt)
    )

  let lastError: string | null = null
  const canonicalCandidates = candidates.filter((candidate) =>
    candidate.singleMonth && candidate.monthly
  )
  for (const candidate of canonicalCandidates.slice(0, 8)) {
    const { data, error } = await supabase
      .from("saved_reports")
      .select("id, data, created_at")
      .eq("id", candidate.id)
      .eq("store_partition_key", storeKey)
      .is("deleted_at", null)
      .maybeSingle()
    if (error) {
      lastError = error.message
      continue
    }
    if (!data) continue
    const days = buildPosJournalDaysFromSavedReports([data], month)
    if (days.length) {
      return { days, reportCount: 1, error: null }
    }
  }
  // 月間レポートが無い旧データでは、日別レポートを最大62営業日分まとめる。
  // 1件だけ返すと最初の営業日しか共有されないため、一括取得して日付ごとに統合する。
  const canonicalIds = new Set(canonicalCandidates.map((candidate) => candidate.id))
  const fallbackIds = candidates
    .filter((candidate) => !canonicalIds.has(candidate.id))
    .slice(0, 80)
    .map((candidate) => candidate.id)
  if (fallbackIds.length) {
    const { data, error } = await supabase
      .from("saved_reports")
      .select("id, data, created_at")
      .eq("store_partition_key", storeKey)
      .is("deleted_at", null)
      .in("id", fallbackIds)
    if (error) {
      lastError = error.message
    } else {
      const reports = (Array.isArray(data) ? data : [])
        .map((value) => isRecord(value) ? value as Record<string, unknown> : null)
        .filter((row): row is Record<string, unknown> => row !== null)
      const days = buildPosJournalDaysFromSavedReports(reports, month)
      if (days.length) {
        return { days, reportCount: reports.length, error: null }
      }
    }
  }
  if (lastError) {
    console.error(
      "Journal Report shared reference detail failed:",
      storeKey,
      month,
      lastError,
    )
  }
  return {
    days: [],
    reportCount: 0,
    error: lastError,
  }
}

function posJournalMonthBounds(month: string): { from: string; to: string } {
  const [year, mon] = String(month).split("-").map(Number)
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate()
  return {
    from: `${month}-01`,
    to: `${month}-${String(last).padStart(2, "0")}`,
  }
}

/** POS天候入力が無い日だけ、売上分析と同じ line_weather_daily / Open-Meteo で補完する。 */
async function fillPosJournalDaysWeather(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
  month: string,
  days: PosJournalDay[],
): Promise<PosJournalDay[]> {
  const list = Array.isArray(days) ? days : []
  if (!list.length) return list
  if (!list.some((day) =>
    posJournalDayNeedsWeather(day as {
      weather?: unknown
      temp_c?: unknown
      tempC?: unknown
    })
  )) return list
  const coords = STORE_COORDINATES[storeKey]
  if (!coords) return applyCachedWeatherToPosJournalDays(list, {})
  const { from, to } = posJournalMonthBounds(month)
  try {
    const result = await fetchWeatherDailyRange(supabase, {
      storeKey,
      lat: coords.lat,
      lon: coords.lon,
      from,
      to,
      includeForecast: false,
    })
    return applyCachedWeatherToPosJournalDays(list, result.map)
  } catch (error) {
    console.error("pos journal weather fill failed:", error)
    return applyCachedWeatherToPosJournalDays(list, {})
  }
}

async function fetchPosJournalState(
  supabase: ReturnType<typeof createClient>,
  url: URL,
) {
  const storeKey = normalizePosJournalStoreKey(
    url.searchParams.get("store_key") || url.searchParams.get("store"),
  )
  const month = normalizeYearMonth(url.searchParams.get("month"))
  const rows = await fetchPosJournalRows(supabase, storeKey, month)
  const storedDays = rows
    .map((row) =>
      isRecord(row.parsed_data) ? row.parsed_data as PosJournalDay : null
    )
    .filter((day): day is PosJournalDay =>
      day !== null && typeof day.business_date === "string" &&
      Array.isArray(day.receipts)
    )
  const shared = await fetchSharedJournalReportState(supabase, storeKey, month)
  const storedDateSet = new Set(storedDays.map((day) => day.business_date))
  const sharedOnlyDays = shared.days.filter((day) =>
    !storedDateSet.has(day.business_date)
  )
  // 同じ営業日は原本LZHの日計を正本としつつ、原本側の会計明細が日計へ
  // 一致しない場合は保存レポートの検証済み明細を維持する。
  // 自前の配列結合だと不完全なraw receiptsがAI回復経路へ漏れるため、
  // 自動月報生成と同じ共通マージ関数を必ず通す。
  const mergedDays = mergePosJournalDaysPreferPrimary(storedDays, shared.days)
  const days = await fillPosJournalDaysWeather(
    supabase,
    storeKey,
    month,
    mergedDays,
  )
  const storeCode = toSafeString(rows[0]?.store_code)
  // 店舗コードは「この月の原本」由来を最優先しつつ、原本が1件も無い
  // （Journal Report共有参照だけの）月でも店舗キーから逆引きして補う。
  // Bistro CAVACAVA 固定だった旧実装ではマルゴエス等が店舗キーのまま表示されていた。
  const mappedStore = resolvePosJournalStoreByKey(storeKey)
  const knownStore = resolvePosJournalStore(storeCode) ?? mappedStore ??
    await lookupPosJournalStoreCodeByKey(supabase, storeKey)
  const resolvedStoreCode = storeCode || mappedStore?.storeCodes[0] || ""
  const storeName = knownStore?.storeName || storeKey
  const storeCodes = Array.from(
    new Set([
      ...(mappedStore?.storeCodes ?? []),
      ...rows.map((row) => toSafeString(row.store_code)).filter(Boolean),
      ...(resolvedStoreCode ? [resolvedStoreCode] : []),
    ]),
  ).sort()
  const categoryOverrides = await fetchPosJournalCategoryOverrides(
    supabase,
    storeKey,
  )
  // ブラウザの欠落月回復へはraw summary.daysを直接使わせず、自動月報と同じ
  // 日計照合・会計値調整・不一致日のsummary退避を通した安全なデータを返す。
  const recoveryReport = buildJournalSavedReportsFromPosDays({
    storeKey,
    storeName,
    storeCode: resolvedStoreCode,
    month,
    days,
    journalIds: rows.map((row) => Number(row.id)).filter((id) =>
      Number.isSafeInteger(id) && id > 0
    ),
    categoryOverrides,
  }).find((report) => /月間/.test(report.title)) ?? null
  const summary = buildPosJournalSummary({
    storeKey,
    storeName,
    storeCode: resolvedStoreCode,
    month,
    days,
    fileCount: rows.length + shared.reportCount,
    categoryOverrides,
  })
  summary.meta.storage_file_count = rows.length
  summary.meta.storage_day_count = storedDays.length
  summary.meta.shared_report_count = shared.reportCount
  summary.meta.shared_day_count = shared.days.length
  summary.meta.shared_only_day_count = sharedOnlyDays.length
  summary.meta.shared_reference_error = shared.error
  summary.meta.storage_mode = rows.length && sharedOnlyDays.length
    ? "storage_and_shared"
    : rows.length
    ? "storage"
    : shared.days.length
    ? "shared_reports"
    : "empty"
  summary.meta.store_codes = storeCodes
  return {
    ok: true,
    store_key: storeKey,
    store_name: storeName,
    store_codes: storeCodes,
    month,
    files: rows.map(({ parsed_data: _parsedData, ...row }) => row),
    shared_reference: {
      report_count: shared.reportCount,
      day_count: shared.days.length,
      added_day_count: sharedOnlyDays.length,
      error: shared.error,
    },
    recovery_report: recoveryReport
      ? {
        id: recoveryReport.id,
        title: recoveryReport.title,
        period: recoveryReport.period,
        data: recoveryReport.data,
      }
      : null,
    summary,
  }
}

/** POS商品名を半角カナ混在でも照合できるよう正規化する */
function normalizePosProductSearchText(value: unknown): string {
  return normalizePosProductSearchTextShared(value)
}

function parseOptionalNonNegativeInt(value: unknown): number | null {
  if (value == null || value === "") return null
  const n = Number(String(value).replace(/[,，]/g, "").trim())
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n)
}

type PosProductSearchFilter = {
  rawQ: string
  codeQ: string
  tokens: string[]
  joinedQ: string
  codeNorm: string
  unitMin: number | null
  unitMax: number | null
}

function parsePosProductSearchFilter(url: URL): PosProductSearchFilter {
  const rawQ = String(url.searchParams.get("q") ?? "").trim()
  const codeQ = String(url.searchParams.get("code") ?? "").trim()
  const unitMin = parseOptionalNonNegativeInt(url.searchParams.get("unit_min"))
  const unitMax = parseOptionalNonNegativeInt(url.searchParams.get("unit_max"))
  const unitExact = parseOptionalNonNegativeInt(url.searchParams.get("unit"))
  const effectiveMin = unitExact != null ? unitExact : unitMin
  const effectiveMax = unitExact != null ? unitExact : unitMax
  const tokens = rawQ
    .split(/[\s　,、/|]+/)
    .map((t) => normalizePosProductSearchText(t))
    .filter((t) => t.length >= 1 && !/^\d+$/.test(t))
  const joinedQ = normalizePosProductSearchText(rawQ).replace(/\d+/g, "")
  // code 未指定でも q が数字だけなら商品コード（下4桁）として扱う
  let codeNorm = codeQ.replace(/\D/g, "")
  if (!codeNorm) {
    const qDigits = rawQ.replace(/\D/g, "")
    if (
      qDigits.length >= 4 &&
      qDigits.length <= 13 &&
      !/^20[0-3]\d$/.test(qDigits) &&
      /^\d+$/.test(rawQ.replace(/[\s　]/g, ""))
    ) {
      codeNorm = qDigits.length > 4 ? qDigits.slice(-4) : qDigits
    }
  } else if (codeNorm.length > 4) {
    // ゼロ埋めフルコードは下4桁でも照合できるよう末尾4桁を正本にする
    codeNorm = codeNorm.slice(-4)
  }
  if (
    !tokens.length && !joinedQ && !codeNorm &&
    effectiveMin == null && effectiveMax == null
  ) {
    throw {
      status: 400,
      message: "q（商品名）・code・unit のいずれかを指定してください。",
    } satisfies AppError
  }
  return {
    rawQ,
    codeQ: codeQ || codeNorm,
    tokens,
    joinedQ,
    codeNorm,
    unitMin: effectiveMin,
    unitMax: effectiveMax,
  }
}

function itemMatchesPosProductFilter(
  name: string,
  code: string,
  unit: number,
  filter: PosProductSearchFilter,
): boolean {
  const nameNorm = normalizePosProductSearchText(name)
  if (filter.codeNorm) {
    const itemCodeDigits = code.replace(/\D/g, "")
    if (
      !itemCodeDigits.endsWith(filter.codeNorm) &&
      itemCodeDigits !== filter.codeNorm
    ) {
      return false
    }
  }
  if (filter.unitMin != null && unit < filter.unitMin) return false
  if (filter.unitMax != null && unit > filter.unitMax) return false
  if (filter.tokens.length || filter.joinedQ) {
    const tokenOk = filter.tokens.length
      ? filter.tokens.every((t) => nameNorm.includes(t))
      : false
    const joinedOk = filter.joinedQ.length >= 2
      ? nameNorm.includes(filter.joinedQ)
      : false
    const wantsCourse =
      filter.tokens.some((t) => t.includes("コ-ス") || t.includes("course")) ||
      /コ-ス|course/.test(filter.joinedQ)
    // 短い別名トークン＋コース語幹（店舗ごとの SP/季節/限定 等）を緩く許容
    const aliasTokens = filter.tokens.filter((t) =>
      t.length >= 1 &&
      t.length <= 8 &&
      !t.includes("コ-ス") &&
      t !== "course" &&
      !/^\d+$/.test(t)
    )
    const looseAliasCourse = wantsCourse && aliasTokens.some((t) =>
      nameNorm.includes(t) &&
      (nameNorm.includes("コ-ス") || nameNorm.includes("course"))
    )
    if (!tokenOk && !joinedOk && !looseAliasCourse) return false
  }
  return true
}

function parseOptionalYearMonthParam(
  value: unknown,
  label: string,
): string | null {
  const raw = String(value ?? "").trim()
  if (!raw) return null
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) {
    throw {
      status: 400,
      message: `${label} must be YYYY-MM.`,
    } satisfies AppError
  }
  return raw
}

const POS_JOURNAL_SCAN_PAGE_SIZE = 500
const POS_JOURNAL_SCAN_MAX_ROWS = 100_000

type PosJournalParsedRow = {
  id: unknown
  business_date: unknown
  year_month: unknown
  parsed_data: unknown
  gross_sales: unknown
  groups_count: unknown
}

async function scanPosJournalParsedRows(
  supabase: ReturnType<typeof createClient>,
  options: {
    storeKey: string
    monthFrom?: string | null
    monthTo?: string | null
    errorLabel: string
  },
  visitPage: (rows: readonly PosJournalParsedRow[]) => void | Promise<void>,
): Promise<AscendingIdScanResult> {
  const { storeKey, monthFrom, monthTo, errorLabel } = options
  try {
    return await scanRowsByAscendingId<PosJournalParsedRow>(
      async (afterId, pageSize) => {
        let query = supabase
          .from("pos_journal_files")
          .select(
            "id, business_date, year_month, parsed_data, gross_sales, groups_count",
          )
          .eq("store_partition_key", storeKey)
          .is("storage_deleted_at", null)
          .not("parsed_data", "is", null)
          .gt("id", afterId)
          .order("id", { ascending: true })
          .limit(pageSize)
        if (monthFrom) query = query.gte("year_month", monthFrom)
        if (monthTo) query = query.lte("year_month", monthTo)
        const { data, error } = await query
        if (error) {
          throw {
            status: 500,
            message: `${errorLabel}: ${error.message}`,
          } satisfies AppError
        }
        return Array.isArray(data) ? data as PosJournalParsedRow[] : []
      },
      visitPage,
      {
        pageSize: POS_JOURNAL_SCAN_PAGE_SIZE,
        maxRows: POS_JOURNAL_SCAN_MAX_ROWS,
      },
    )
  } catch (error) {
    if (
      isRecord(error) &&
      Number.isInteger(Number(error.status)) &&
      String(error.message ?? "").trim()
    ) {
      throw error
    }
    throw {
      status: 500,
      message: `${errorLabel}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    } satisfies AppError
  }
}

function reconcilePosJournalParsedRow(
  row: PosJournalParsedRow,
): JournalProductDayDetail | null {
  const businessDate = String(row.business_date ?? "").slice(0, 10)
  const yearMonth = String(row.year_month ?? businessDate.slice(0, 7))
  return reconcileParsedJournalDayDetail(
    row.parsed_data,
    businessDate,
    yearMonth,
    {
      grossSales: row.gross_sales,
      groups: row.groups_count,
    },
  )
}

type JournalProductCoverageResponse = JournalProductDetailCoverage & {
  by_month: Array<JournalProductDetailCoverage & { year_month: string }>
}

function combineJournalProductDetailCoverage(
  rows: Array<JournalProductDetailCoverage & { year_month: string }>,
): JournalProductCoverageResponse {
  const sorted = [...rows].sort((a, b) =>
    a.year_month.localeCompare(b.year_month)
  )
  const completeDays = sorted.reduce(
    (sum, row) => sum + row.detail_complete_days,
    0,
  )
  const incompleteDays = sorted.reduce(
    (sum, row) => sum + row.detail_incomplete_days,
    0,
  )
  return {
    status: incompleteDays === 0
      ? "complete"
      : (completeDays === 0 ? "incomplete" : "partial"),
    policy: "receipt_and_item_totals_match_gross_sales",
    scanned_days: completeDays + incompleteDays,
    detail_complete_days: completeDays,
    detail_incomplete_days: incompleteDays,
    gross_mismatch_days: sorted.reduce(
      (sum, row) => sum + row.gross_mismatch_days,
      0,
    ),
    item_mismatch_days: sorted.reduce(
      (sum, row) => sum + row.item_mismatch_days,
      0,
    ),
    item_mismatch_receipts: sorted.reduce(
      (sum, row) => sum + row.item_mismatch_receipts,
      0,
    ),
    complete_gross_sales: sorted.reduce(
      (sum, row) => sum + row.complete_gross_sales,
      0,
    ),
    excluded_gross_sales: sorted.reduce(
      (sum, row) => sum + row.excluded_gross_sales,
      0,
    ),
    incomplete_dates: sorted.flatMap((row) => row.incomplete_dates).sort(),
    by_month: sorted,
  }
}

async function loadJournalProductDetailCoverage(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
): Promise<JournalProductCoverageResponse> {
  const { data, error } = await supabase
    .from("journal_product_detail_coverage")
    .select(
      "year_month, status, policy, scanned_days, detail_complete_days, detail_incomplete_days, gross_mismatch_days, item_mismatch_days, item_mismatch_receipts, complete_gross_sales, excluded_gross_sales, incomplete_dates",
    )
    .eq("store_partition_key", storeKey)
    .order("year_month", { ascending: true })
  if (error) {
    throw {
      status: 500,
      message: `商品明細coverageの取得に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  const rows = (Array.isArray(data) ? data : []).map((row) => {
    const value: Record<string, unknown> = isRecord(row) ? row : {}
    const completeDays = toNonNegativeInteger(value.detail_complete_days)
    const incompleteDays = toNonNegativeInteger(value.detail_incomplete_days)
    return {
      year_month: String(value.year_month ?? ""),
      status: incompleteDays === 0
        ? "complete" as const
        : (completeDays === 0 ? "incomplete" as const : "partial" as const),
      policy: "receipt_and_item_totals_match_gross_sales" as const,
      scanned_days: completeDays + incompleteDays,
      detail_complete_days: completeDays,
      detail_incomplete_days: incompleteDays,
      gross_mismatch_days: toNonNegativeInteger(value.gross_mismatch_days),
      item_mismatch_days: toNonNegativeInteger(value.item_mismatch_days),
      item_mismatch_receipts: toNonNegativeInteger(
        value.item_mismatch_receipts,
      ),
      complete_gross_sales: toNonNegativeInteger(value.complete_gross_sales),
      excluded_gross_sales: toNonNegativeInteger(value.excluded_gross_sales),
      incomplete_dates: Array.isArray(value.incomplete_dates)
        ? value.incomplete_dates.map((date: unknown) =>
          String(date).slice(0, 10)
        ).filter(
          (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date),
        )
        : [],
    }
  }).filter((row) => /^\d{4}-(0[1-9]|1[0-2])$/.test(row.year_month))
  return combineJournalProductDetailCoverage(rows)
}

async function buildJournalProductIndexMonthSnapshot(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
  month: string,
): Promise<{
  aggregated: ReturnType<typeof aggregateJournalProductMonthlyRows>
  coverage: JournalProductDetailCoverage
}> {
  const lines: JournalProductLineItem[] = []
  const dayDetails: JournalProductDayDetail[] = []
  await scanPosJournalParsedRows(
    supabase,
    {
      storeKey,
      monthFrom: month,
      monthTo: month,
      errorLabel: "商品インデックス再構築用ジャーナルの取得に失敗しました",
    },
    (rows) => {
      for (const row of rows) {
        if (!isRecord(row)) continue
        const detail = reconcilePosJournalParsedRow(row)
        if (!detail) continue
        dayDetails.push(detail)
        if (!detail.detail_complete) continue
        lines.push(
          ...extractProductLinesFromParsedDay(
            row.parsed_data,
            detail.business_date,
            detail.year_month,
            { grossSales: row.gross_sales, groups: row.groups_count },
          ),
        )
      }
    },
  )
  return {
    aggregated: aggregateJournalProductMonthlyRows(storeKey, lines),
    coverage: summarizeJournalProductDetailCoverage(dayDetails),
  }
}

async function rebuildJournalProductIndexMonth(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
  yearMonth: string,
  options: { dryRun?: boolean } = {},
): Promise<{
  year_month: string
  rows: number
  dry_run: boolean
  dirty_cleared: boolean
  stale_snapshot: boolean
  detail_coverage: JournalProductDetailCoverage
}> {
  const month = String(yearMonth || "").trim()
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw { status: 400, message: "year_month must be YYYY-MM." } satisfies AppError
  }
  let dirtyMarker: string | null = null
  if (options.dryRun !== true) {
    // clean月の手動force rebuildでも、DELETEやupsert失敗中に旧indexを
    // 確定値として読ませない。全処理成功後にだけ末尾でdirtyを解除する。
    dirtyMarker = await markJournalProductIndexMonthDirty(
      supabase,
      storeKey,
      month,
    )
  }
  const { aggregated, coverage } = await buildJournalProductIndexMonthSnapshot(
    supabase,
    storeKey,
    month,
  )
  if (options.dryRun === true) {
    return {
      year_month: month,
      rows: aggregated.length,
      dry_run: true,
      dirty_cleared: false,
      stale_snapshot: false,
      detail_coverage: coverage,
    }
  }
  if (!dirtyMarker) {
    throw {
      status: 500,
      message: "商品index月のdirty markerがないため安全に置換できません。",
    } satisfies AppError
  }
  // snapshot作成後のupload/reparseと競合しても、古いsnapshotを新しいindexへ
  // 上書きしない。DB側でmarker照合・index/coverage置換・dirty解除を
  // advisory lock付きの1トランザクションとして実行する。
  const { data: snapshotApplied, error: applySnapshotError } = await supabase
    .rpc("apply_journal_product_index_snapshot", {
      p_store_partition_key: storeKey,
      p_year_month: month,
      p_expected_touched_at: dirtyMarker,
      p_index_rows: aggregated,
      p_coverage: coverage,
    })
  if (applySnapshotError) {
    throw {
      status: 500,
      message: `商品index月の原子的置換に失敗しました: ${applySnapshotError.message}`,
    } satisfies AppError
  }
  const applied = snapshotApplied === true
  return {
    year_month: month,
    rows: aggregated.length,
    dry_run: false,
    dirty_cleared: applied,
    stale_snapshot: !applied,
    detail_coverage: coverage,
  }
}

async function rebuildJournalProductMonthlyIndex(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  storeScope: string | null,
) {
  const requestedStore = toSafeString(body.store_key || body.store)
  const storeKey = normalizePosJournalStoreKey(storeScope || requestedStore)
  if (!storeKey) {
    throw { status: 400, message: "store_key is required." } satisfies AppError
  }
  if (
    storeScope && requestedStore &&
    requestedStore.toLowerCase() !== storeScope.toLowerCase()
  ) {
    throw {
      status: 403,
      message: "他店舗のデータにはアクセスできません。",
    } satisfies AppError
  }

  const forceFull = body.force_full === true || body.force_full === "true"
  const dryRun = body.dry_run === true || body.dry_run === "true"
  const months = new Set<string>()
  const explicitMonth = parseOptionalYearMonthParam(body.year_month || body.month, "year_month")
  if (explicitMonth) months.add(explicitMonth)

  if (!months.size && !forceFull) {
    const { data: dirty, error: dirtyError } = await supabase
      .from("journal_product_index_dirty_months")
      .select("year_month")
      .eq("store_partition_key", storeKey)
      .order("year_month", { ascending: true })
      .limit(120)
    if (dirtyError) {
      throw {
        status: 500,
        message: `dirty月の取得に失敗しました: ${dirtyError.message}`,
      } satisfies AppError
    }
    for (const row of dirty || []) {
      const ym = String((row as { year_month?: string }).year_month || "")
      if (/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) months.add(ym)
    }
  }

  if (!months.size || forceFull) {
    await scanPosJournalParsedRows(
      supabase,
      {
        storeKey,
        errorLabel: "商品インデックス対象月の列挙に失敗しました",
      },
      (rows) => {
        for (const row of rows) {
          const businessDate = String(row.business_date ?? "").slice(0, 10)
          const ym = String(row.year_month ?? businessDate.slice(0, 7))
          if (/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) months.add(ym)
        }
      },
    )
  }

  const rebuilt: Array<{
    year_month: string
    rows: number
    dry_run: boolean
    dirty_cleared: boolean
    stale_snapshot: boolean
    detail_coverage: JournalProductDetailCoverage
  }> = []
  for (const month of [...months].sort()) {
    rebuilt.push(
      await rebuildJournalProductIndexMonth(supabase, storeKey, month, {
        dryRun,
      }),
    )
  }
  return {
    ok: true,
    store_key: storeKey,
    force_full: forceFull,
    dry_run: dryRun,
    rebuilt_months: rebuilt.length,
    source_months_found: months.size,
    warning: months.size === 0
      ? "対象店舗の電子ジャーナル月が見つかりませんでした。"
      : null,
    detail_coverage: combineJournalProductDetailCoverage(
      rebuilt.map((row) => ({
        year_month: row.year_month,
        ...row.detail_coverage,
      })),
    ),
    results: rebuilt,
  }
}

async function ensureJournalProductIndexMonths(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
  yearMonths: Iterable<string>,
): Promise<void> {
  const targets = [...new Set(
    [...yearMonths].filter((ym) => /^\d{4}-(0[1-9]|1[0-2])$/.test(ym)),
  )]
  for (const month of targets) {
    try {
      await markJournalProductIndexMonthDirty(supabase, storeKey, month)
      if (await journalProductMonthHasUnsafeParserRows(
        supabase,
        storeKey,
        month,
      )) continue
      await rebuildJournalProductIndexMonth(supabase, storeKey, month)
    } catch (err) {
      console.warn("journal product index rebuild failed:", storeKey, month, err)
    }
  }
}

async function markJournalProductIndexMonthDirty(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
  month: string,
): Promise<string> {
  const { data, error } = await supabase
    .rpc("touch_journal_product_index_dirty_month", {
      p_store_partition_key: storeKey,
      p_year_month: month,
    })
  if (error) {
    throw new Error(`商品index月をdirty化できませんでした: ${error.message}`)
  }
  const storedMarker = String(data ?? "").trim()
  if (!storedMarker) {
    throw new Error("商品index月のdirty markerを確認できませんでした。")
  }
  return storedMarker
}

async function journalProductMonthHasUnsafeParserRows(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
  month: string,
): Promise<boolean> {
  let unsafeRowsRemain = false
  await scanPosJournalParsedRows(
    supabase,
    {
      storeKey,
      monthFrom: month,
      monthTo: month,
      errorLabel: "商品index月の未完了確認に失敗しました",
    },
    (rows) => {
      if (
        rows.some((row) =>
          isPosJournalStaleParserRow(row) ||
          isPosJournalDetailMismatchRow(row)
        )
      ) unsafeRowsRemain = true
    },
  )
  return unsafeRowsRemain
}

async function storeHasJournalProductIndex(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
): Promise<boolean> {
  // dirty月が1件でも残る間は、古いderived indexを確定値として使わず
  // 日計照合付きlive scanへフォールバックする。
  const { count: dirtyCount, error: dirtyError } = await supabase
    .from("journal_product_index_dirty_months")
    .select("year_month", { count: "exact", head: true })
    .eq("store_partition_key", storeKey)
  if (dirtyError) {
    console.warn("journal product dirty count failed:", dirtyError.message)
    return false
  }
  if ((dirtyCount || 0) > 0) return false
  const { count, error } = await supabase
    .from("journal_product_monthly_index")
    .select("id", { count: "exact", head: true })
    .eq("store_partition_key", storeKey)
  if (error) {
    console.warn("journal product index count failed:", error.message)
    return false
  }
  return (count || 0) > 0
}

async function searchPosJournalProductsFromIndex(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
  filter: PosProductSearchFilter,
) {
  const detailCoverage = await loadJournalProductDetailCoverage(
    supabase,
    storeKey,
  )
  type IndexHit = {
    year_month: string
    display_name: string
    product_code: string
    unit_price: number
    qty: number
    amount: number
    day_count: number
    first_date: string | null
    last_date: string | null
    product_name_norm: string
  }
  const hits: IndexHit[] = []
  const primaryToken = [...filter.tokens]
    .sort((a, b) => b.length - a.length)[0] || filter.joinedQ

  let afterId = 0
  for (let page = 0; page < 200; page++) {
    let query = supabase
      .from("journal_product_monthly_index")
      .select(
        "id, year_month, product_name_norm, display_name, product_code, unit_price, qty, amount, day_count, first_date, last_date",
      )
      .eq("store_partition_key", storeKey)
      .gt("id", afterId)
      .order("id", { ascending: true })
      .limit(500)
    if (filter.unitMin != null) query = query.gte("unit_price", filter.unitMin)
    if (filter.unitMax != null) query = query.lte("unit_price", filter.unitMax)
    if (filter.codeNorm) {
      query = query.ilike("product_code", `%${filter.codeNorm}%`)
    }
    if (primaryToken) {
      query = query.ilike("product_name_norm", `%${primaryToken}%`)
    }
    const { data, error } = await query
    if (error) {
      throw {
        status: 500,
        message: `商品インデックス検索に失敗しました: ${error.message}`,
      } satisfies AppError
    }
    const rows = Array.isArray(data) ? data : []
    if (!rows.length) break
    for (const row of rows) {
      if (!isRecord(row)) continue
      afterId = Math.max(afterId, toNonNegativeInteger(row.id))
      const candidate = {
        product_name_norm: String(row.product_name_norm || ""),
        product_code: String(row.product_code || ""),
        unit_price: toNonNegativeInteger(row.unit_price),
      }
      if (!indexRowMatchesProductFilter(candidate, filter)) continue
      hits.push({
        year_month: String(row.year_month || ""),
        display_name: String(row.display_name || ""),
        product_code: candidate.product_code,
        unit_price: candidate.unit_price,
        qty: toNonNegativeInteger(row.qty),
        amount: toNonNegativeInteger(row.amount),
        day_count: toNonNegativeInteger(row.day_count),
        first_date: row.first_date == null ? null : String(row.first_date).slice(0, 10),
        last_date: row.last_date == null ? null : String(row.last_date).slice(0, 10),
        product_name_norm: candidate.product_name_norm,
      })
    }
    if (rows.length < 500) break
  }

  hits.sort((a, b) =>
    String(a.first_date || a.year_month).localeCompare(String(b.first_date || b.year_month)) ||
    a.year_month.localeCompare(b.year_month) ||
    a.unit_price - b.unit_price
  )

  const byMonthMap = new Map<string, {
    year_month: string
    qty: number
    amount: number
    day_count: number
    names: Map<string, number>
    codes: Map<string, number>
    units: Map<number, number>
  }>()
  const unitBandMap = new Map<number, {
    unit: number
    qty: number
    amount: number
    first_month: string
    last_month: string
    first_date: string
    last_date: string
  }>()
  const variantMap = new Map<string, {
    name: string
    code: string
    unit: number
    qty: number
    amount: number
    first_month: string
    last_month: string
    first_date: string
    last_date: string
    day_count: number
  }>()

  for (const hit of hits) {
    let month = byMonthMap.get(hit.year_month)
    if (!month) {
      month = {
        year_month: hit.year_month,
        qty: 0,
        amount: 0,
        day_count: 0,
        names: new Map(),
        codes: new Map(),
        units: new Map(),
      }
      byMonthMap.set(hit.year_month, month)
    }
    month.qty += hit.qty
    month.amount += hit.amount
    month.day_count += hit.day_count
    month.names.set(hit.display_name, (month.names.get(hit.display_name) || 0) + hit.qty)
    if (hit.product_code) {
      month.codes.set(hit.product_code, (month.codes.get(hit.product_code) || 0) + hit.qty)
    }
    month.units.set(hit.unit_price, (month.units.get(hit.unit_price) || 0) + hit.qty)

    const firstDate = hit.first_date || `${hit.year_month}-01`
    const lastDate = hit.last_date || firstDate
    let band = unitBandMap.get(hit.unit_price)
    if (!band) {
      band = {
        unit: hit.unit_price,
        qty: 0,
        amount: 0,
        first_month: hit.year_month,
        last_month: hit.year_month,
        first_date: firstDate,
        last_date: lastDate,
      }
      unitBandMap.set(hit.unit_price, band)
    }
    band.qty += hit.qty
    band.amount += hit.amount
    if (firstDate < band.first_date) {
      band.first_date = firstDate
      band.first_month = hit.year_month
    }
    if (lastDate > band.last_date) {
      band.last_date = lastDate
      band.last_month = hit.year_month
    }

    const variantKey = `${hit.display_name}|${hit.unit_price}|${hit.product_code}`
    let variant = variantMap.get(variantKey)
    if (!variant) {
      variant = {
        name: hit.display_name,
        code: hit.product_code,
        unit: hit.unit_price,
        qty: 0,
        amount: 0,
        first_month: hit.year_month,
        last_month: hit.year_month,
        first_date: firstDate,
        last_date: lastDate,
        day_count: 0,
      }
      variantMap.set(variantKey, variant)
    }
    variant.qty += hit.qty
    variant.amount += hit.amount
    variant.day_count += hit.day_count
    if (firstDate < variant.first_date) {
      variant.first_date = firstDate
      variant.first_month = hit.year_month
    }
    if (lastDate > variant.last_date) {
      variant.last_date = lastDate
      variant.last_month = hit.year_month
    }
  }

  const byMonth = [...byMonthMap.values()]
    .sort((a, b) => a.year_month.localeCompare(b.year_month))
    .map((m) => ({
      year_month: m.year_month,
      qty: m.qty,
      amount: m.amount,
      day_count: m.day_count,
      names: [...m.names.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, qty]) => ({ name, qty })),
      codes: [...m.codes.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([code, qty]) => ({ code, qty })),
      units: [...m.units.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([unit, qty]) => ({ unit, qty })),
    }))

  const first = hits[0] || null
  const last = hits.length ? hits[hits.length - 1] : null
  const nameVariants = [...new Set(hits.map((h) => h.display_name))].slice(0, 20)

  // 同一商品コードで名称が変わった過去行（例: 2103=八つ星→季の美）。
  // 質問名称の by_month には混ぜず、別フィールドで返す。
  const matchedNorms = new Set(hits.map((h) => h.product_name_norm).filter(Boolean))
  const codes = [...new Set(
    hits.map((h) => String(h.product_code || "").trim()).filter((c) => c.length >= 4),
  )].slice(0, 8)
  type CodeLinkedAlias = {
    name: string
    code: string
    unit: number
    total_qty: number
    total_amount: number
    first_month: string
    last_month: string
    by_month: Array<{ year_month: string; qty: number; amount: number }>
  }
  const codeLinkedMap = new Map<string, CodeLinkedAlias>()
  for (const code of codes) {
    const codeDigits = code.replace(/\D/g, "")
    if (codeDigits.length < 4) continue
    const { data: linkedRows, error: linkedError } = await supabase
      .from("journal_product_monthly_index")
      .select(
        "year_month, product_name_norm, display_name, product_code, unit_price, qty, amount",
      )
      .eq("store_partition_key", storeKey)
      .ilike("product_code", `%${codeDigits.slice(-6)}%`)
      .order("year_month", { ascending: true })
      .limit(200)
    if (linkedError) {
      console.warn("code-linked alias lookup failed:", linkedError.message)
      continue
    }
    for (const row of linkedRows || []) {
      if (!isRecord(row)) continue
      const norm = String(row.product_name_norm || "")
      const display = String(row.display_name || "")
      const rowCode = String(row.product_code || "")
      const rowDigits = rowCode.replace(/\D/g, "")
      if (
        !rowDigits.endsWith(codeDigits) &&
        rowDigits !== codeDigits &&
        !codeDigits.endsWith(rowDigits)
      ) {
        continue
      }
      if (matchedNorms.has(norm)) continue
      if (filter.joinedQ && norm.includes(filter.joinedQ)) continue
      const unit = toNonNegativeInteger(row.unit_price)
      const key = `${display}|${rowCode}|${unit}`
      let alias = codeLinkedMap.get(key)
      if (!alias) {
        alias = {
          name: display || norm,
          code: rowCode,
          unit,
          total_qty: 0,
          total_amount: 0,
          first_month: String(row.year_month || ""),
          last_month: String(row.year_month || ""),
          by_month: [],
        }
        codeLinkedMap.set(key, alias)
      }
      const ym = String(row.year_month || "")
      const qty = toNonNegativeInteger(row.qty)
      const amount = toNonNegativeInteger(row.amount)
      alias.total_qty += qty
      alias.total_amount += amount
      if (ym && ym < alias.first_month) alias.first_month = ym
      if (ym && ym > alias.last_month) alias.last_month = ym
      const monthRow = alias.by_month.find((m) => m.year_month === ym)
      if (monthRow) {
        monthRow.qty += qty
        monthRow.amount += amount
      } else if (ym) {
        alias.by_month.push({ year_month: ym, qty, amount })
      }
    }
  }
  const codeLinkedAliases = [...codeLinkedMap.values()]
    .map((a) => ({
      ...a,
      by_month: a.by_month.sort((x, y) => x.year_month.localeCompare(y.year_month)),
    }))
    .sort((a, b) => b.total_qty - a.total_qty)
    .slice(0, 12)

  return {
    ok: true,
    store_key: storeKey,
    source: "monthly_index" as const,
    detail_coverage: detailCoverage,
    query: {
      q: filter.rawQ,
      code: filter.codeQ,
      unit_min: filter.unitMin,
      unit_max: filter.unitMax,
    },
    scanned_files: 0,
    match_count: hits.reduce((s, h) => s + h.day_count, 0) || hits.length,
    total_qty: hits.reduce((s, h) => s + h.qty, 0),
    total_amount: hits.reduce((s, h) => s + h.amount, 0),
    first_seen: first
      ? {
        business_date: first.first_date || `${first.year_month}-01`,
        year_month: first.year_month,
        name: first.display_name,
        code: first.product_code,
        unit: first.unit_price,
        amount: first.amount,
      }
      : null,
    last_seen: last
      ? {
        business_date: last.last_date || last.first_date || `${last.year_month}-01`,
        year_month: last.year_month,
        name: last.display_name,
        code: last.product_code,
        unit: last.unit_price,
        amount: last.amount,
      }
      : null,
    name_variants: nameVariants,
    unit_bands: [...unitBandMap.values()]
      .sort((a, b) => b.qty - a.qty || a.unit - b.unit),
    variants: [...variantMap.values()]
      .sort((a, b) => b.amount - a.amount || b.qty - a.qty)
      .slice(0, 40),
    by_month: byMonth,
    code_linked_aliases: codeLinkedAliases,
  }
}

/**
 * 店舗の全電子ジャーナル（parsed_data）を横断し、商品名・コード・単価帯の初出月を返す。
 * 月次インデックスがあればそれを使い、未構築時のみフルスキャンへフォールバックする。
 */
async function searchPosJournalProducts(
  supabase: ReturnType<typeof createClient>,
  url: URL,
) {
  const storeKey = normalizePosJournalStoreKey(
    url.searchParams.get("store_key") || url.searchParams.get("store"),
  )
  const filter = parsePosProductSearchFilter(url)
  const forceLive = url.searchParams.get("live") === "1" ||
    url.searchParams.get("source") === "live"

  if (!forceLive && await storeHasJournalProductIndex(supabase, storeKey)) {
    return await searchPosJournalProductsFromIndex(supabase, storeKey, filter)
  }

  type Hit = {
    file_id: number
    item_order: number
    business_date: string
    year_month: string
    name: string
    code: string
    unit: number
    qty: number
    amount: number
  }
  const hits: Hit[] = []
  const dayDetails: JournalProductDayDetail[] = []
  let itemOrder = 0
  const scan = await scanPosJournalParsedRows(
    supabase,
    {
      storeKey,
      errorLabel: "商品検索用ジャーナルの取得に失敗しました",
    },
    (rows) => {
      for (const row of rows) {
        if (!isRecord(row)) continue
        const fileId = toNonNegativeInteger(row.id)
        const businessDate = String(row.business_date ?? "").slice(0, 10)
        const yearMonth = String(row.year_month ?? businessDate.slice(0, 7))
        const detail = reconcilePosJournalParsedRow(row)
        if (!detail) continue
        dayDetails.push(detail)
        if (!detail.detail_complete) continue
        for (const receipt of detail.receipts) {
          if (!isRecord(receipt) || !Array.isArray(receipt.items)) continue
          for (const item of extractNetProductItemsFromReceipt(receipt)) {
            if (!itemMatchesPosProductFilter(
              item.name,
              item.code,
              item.unit,
              filter,
            )) continue
            hits.push({
              file_id: fileId,
              item_order: itemOrder++,
              business_date: businessDate,
              year_month: yearMonth,
              name: item.name,
              code: item.code,
              unit: item.unit,
              qty: item.qty,
              amount: item.amount,
            })
          }
        }
      }
    },
  )
  hits.sort((a, b) =>
    a.business_date.localeCompare(b.business_date) ||
    a.file_id - b.file_id ||
    a.item_order - b.item_order
  )

  const byMonthMap = new Map<string, {
    year_month: string
    qty: number
    amount: number
    receipt_days: Set<string>
    names: Map<string, number>
    codes: Map<string, number>
    units: Map<number, number>
  }>()
  const unitBandMap = new Map<number, {
    unit: number
    qty: number
    amount: number
    first_month: string
    last_month: string
    first_date: string
    last_date: string
  }>()
  const variantMap = new Map<string, {
    name: string
    code: string
    unit: number
    qty: number
    amount: number
    first_month: string
    last_month: string
    first_date: string
    last_date: string
    days: Set<string>
  }>()

  for (const hit of hits) {
    let month = byMonthMap.get(hit.year_month)
    if (!month) {
      month = {
        year_month: hit.year_month,
        qty: 0,
        amount: 0,
        receipt_days: new Set(),
        names: new Map(),
        codes: new Map(),
        units: new Map(),
      }
      byMonthMap.set(hit.year_month, month)
    }
    month.qty += hit.qty
    month.amount += hit.amount
    month.receipt_days.add(hit.business_date)
    month.names.set(hit.name, (month.names.get(hit.name) || 0) + hit.qty)
    if (hit.code) {
      month.codes.set(hit.code, (month.codes.get(hit.code) || 0) + hit.qty)
    }
    month.units.set(hit.unit, (month.units.get(hit.unit) || 0) + hit.qty)

    let band = unitBandMap.get(hit.unit)
    if (!band) {
      band = {
        unit: hit.unit,
        qty: 0,
        amount: 0,
        first_month: hit.year_month,
        last_month: hit.year_month,
        first_date: hit.business_date,
        last_date: hit.business_date,
      }
      unitBandMap.set(hit.unit, band)
    }
    band.qty += hit.qty
    band.amount += hit.amount
    if (hit.business_date < band.first_date) {
      band.first_date = hit.business_date
      band.first_month = hit.year_month
    }
    if (hit.business_date > band.last_date) {
      band.last_date = hit.business_date
      band.last_month = hit.year_month
    }

    const variantKey = `${hit.name}|${hit.unit}|${hit.code}`
    let variant = variantMap.get(variantKey)
    if (!variant) {
      variant = {
        name: hit.name,
        code: hit.code,
        unit: hit.unit,
        qty: 0,
        amount: 0,
        first_month: hit.year_month,
        last_month: hit.year_month,
        first_date: hit.business_date,
        last_date: hit.business_date,
        days: new Set(),
      }
      variantMap.set(variantKey, variant)
    }
    variant.qty += hit.qty
    variant.amount += hit.amount
    variant.days.add(hit.business_date)
    if (hit.business_date < variant.first_date) {
      variant.first_date = hit.business_date
      variant.first_month = hit.year_month
    }
    if (hit.business_date > variant.last_date) {
      variant.last_date = hit.business_date
      variant.last_month = hit.year_month
    }
  }

  const byMonth = [...byMonthMap.values()]
    .sort((a, b) => a.year_month.localeCompare(b.year_month))
    .map((m) => ({
      year_month: m.year_month,
      qty: m.qty,
      amount: m.amount,
      day_count: m.receipt_days.size,
      names: [...m.names.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, qty]) => ({ name, qty })),
      codes: [...m.codes.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([code, qty]) => ({ code, qty })),
      units: [...m.units.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([unit, qty]) => ({ unit, qty })),
    }))

  const unitBands = [...unitBandMap.values()]
    .sort((a, b) => b.qty - a.qty || a.unit - b.unit)

  const first = hits[0] || null
  const last = hits.length ? hits[hits.length - 1] : null
  const nameVariants = [...new Set(hits.map((h) => h.name))].slice(0, 20)

  return {
    ok: true,
    store_key: storeKey,
    source: "live_scan" as const,
    detail_coverage: combineJournalProductDetailCoverage(
      [...new Map(dayDetails.map((day) => [
        day.year_month,
        day.year_month,
      ])).keys()].map((month) => ({
        year_month: month,
        ...summarizeJournalProductDetailCoverage(
          dayDetails.filter((day) => day.year_month === month),
        ),
      })),
    ),
    query: {
      q: filter.rawQ,
      code: filter.codeQ,
      unit_min: filter.unitMin,
      unit_max: filter.unitMax,
    },
    scanned_files: scan.scannedRows,
    match_count: hits.length,
    total_qty: hits.reduce((s, h) => s + h.qty, 0),
    total_amount: hits.reduce((s, h) => s + h.amount, 0),
    first_seen: first
      ? {
        business_date: first.business_date,
        year_month: first.year_month,
        name: first.name,
        code: first.code,
        unit: first.unit,
        amount: first.amount,
      }
      : null,
    last_seen: last
      ? {
        business_date: last.business_date,
        year_month: last.year_month,
        name: last.name,
        code: last.code,
        unit: last.unit,
        amount: last.amount,
      }
      : null,
    name_variants: nameVariants,
    unit_bands: unitBands,
    variants: [...variantMap.values()]
      .sort((a, b) => b.amount - a.amount || b.qty - a.qty)
      .slice(0, 40)
      .map((v) => ({
        name: v.name,
        code: v.code,
        unit: v.unit,
        qty: v.qty,
        amount: v.amount,
        day_count: v.days.size,
        first_month: v.first_month,
        last_month: v.last_month,
        first_date: v.first_date,
        last_date: v.last_date,
      })),
    by_month: byMonth,
  }
}

type CohortBucket = {
  receipt_count: number
  guests: number
  total_sales: number
  lunch_receipts: number
  dinner_receipts: number
  lunch_guests: number
  dinner_guests: number
  lunch_sales: number
  dinner_sales: number
  items: Map<string, { name: string; code: string; qty: number; amount: number }>
}

function emptyCohortBucket(): CohortBucket {
  return {
    receipt_count: 0,
    guests: 0,
    total_sales: 0,
    lunch_receipts: 0,
    dinner_receipts: 0,
    lunch_guests: 0,
    dinner_guests: 0,
    lunch_sales: 0,
    dinner_sales: 0,
    items: new Map(),
  }
}

function addReceiptToCohort(
  bucket: CohortBucket,
  receipt: Record<string, unknown>,
  businessDate: string,
) {
  const guests = Math.max(0, toNonNegativeInteger(receipt.guests))
  const total = toNonNegativeInteger(receipt.total)
  const time = String(receipt.time ?? "")
  const hourMatch = time.match(/(\d{1,2})/)
  const hour = hourMatch ? Number(hourMatch[1]) : 18
  const isLunch = Number.isFinite(hour) && hour < 16
  bucket.receipt_count += 1
  bucket.guests += guests
  bucket.total_sales += total
  if (isLunch) {
    bucket.lunch_receipts += 1
    bucket.lunch_guests += guests
    bucket.lunch_sales += total
  } else {
    bucket.dinner_receipts += 1
    bucket.dinner_guests += guests
    bucket.dinner_sales += total
  }
  for (const item of extractNetProductItemsFromReceipt(receipt)) {
    const key = `${item.code}|${item.name}`
    const prev = bucket.items.get(key) || {
      name: item.name,
      code: item.code,
      qty: 0,
      amount: 0,
    }
    prev.qty += item.qty
    prev.amount += item.amount
    bucket.items.set(key, prev)
  }
  void businessDate
}

function serializeCohortBucket(bucket: CohortBucket) {
  const items = [...bucket.items.values()]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 40)
  return {
    receipt_count: bucket.receipt_count,
    guests: bucket.guests,
    total_sales: bucket.total_sales,
    avg_spend: bucket.guests > 0
      ? Math.round(bucket.total_sales / bucket.guests)
      : 0,
    lunch_receipts: bucket.lunch_receipts,
    dinner_receipts: bucket.dinner_receipts,
    lunch_guests: bucket.lunch_guests,
    dinner_guests: bucket.dinner_guests,
    lunch_sales: bucket.lunch_sales,
    dinner_sales: bucket.dinner_sales,
    lunch_avg_spend: bucket.lunch_guests > 0
      ? Math.round(bucket.lunch_sales / bucket.lunch_guests)
      : 0,
    dinner_avg_spend: bucket.dinner_guests > 0
      ? Math.round(bucket.dinner_sales / bucket.dinner_guests)
      : 0,
    items,
  }
}

function filterFromProductSearchObject(value: unknown): PosProductSearchFilter {
  if (!isRecord(value)) {
    throw {
      status: 400,
      message: "item / item_a / item_b はオブジェクトで指定してください。",
    } satisfies AppError
  }
  const rawQ = String(value.q ?? value.name ?? "").trim()
  const codeQ = String(value.code ?? "").trim()
  const unitMin = parseOptionalNonNegativeInt(value.unit_min ?? value.unitMin)
  const unitMax = parseOptionalNonNegativeInt(value.unit_max ?? value.unitMax)
  const unitExact = parseOptionalNonNegativeInt(value.unit)
  const effectiveMin = unitExact != null ? unitExact : unitMin
  const effectiveMax = unitExact != null ? unitExact : unitMax
  const tokens = rawQ
    .split(/[\s　,、/|]+/)
    .map((t) => normalizePosProductSearchText(t))
    .filter((t) => t.length >= 1 && !/^\d+$/.test(t))
  const joinedQ = normalizePosProductSearchText(rawQ).replace(/\d+/g, "")
  let codeNorm = codeQ.replace(/\D/g, "")
  if (!codeNorm) {
    const qDigits = rawQ.replace(/\D/g, "")
    if (
      qDigits.length >= 4 &&
      qDigits.length <= 13 &&
      !/^20[0-3]\d$/.test(qDigits) &&
      /^\d+$/.test(rawQ.replace(/[\s　]/g, ""))
    ) {
      codeNorm = qDigits.length > 4 ? qDigits.slice(-4) : qDigits
    }
  } else if (codeNorm.length > 4) {
    codeNorm = codeNorm.slice(-4)
  }
  if (
    !tokens.length && !joinedQ && !codeNorm &&
    effectiveMin == null && effectiveMax == null
  ) {
    throw {
      status: 400,
      message: "商品条件に q / code / unit のいずれかを指定してください。",
    } satisfies AppError
  }
  return {
    rawQ,
    codeQ: codeQ || codeNorm,
    tokens,
    joinedQ,
    codeNorm,
    unitMin: effectiveMin,
    unitMax: effectiveMax,
  }
}

function receiptHasMatchingItem(
  receipt: Record<string, unknown>,
  filter: PosProductSearchFilter,
): boolean {
  for (const item of extractNetProductItemsFromReceipt(receipt)) {
    if (itemMatchesPosProductFilter(item.name, item.code, item.unit, filter)) {
      return true
    }
  }
  return false
}

function receiptHasItemClass(
  receipt: Record<string, unknown>,
  itemClass: string,
): boolean {
  const cls = String(itemClass || "").trim().toLowerCase()
  for (const item of extractNetProductItemsFromReceipt(receipt)) {
    const n = normalizePosProductSearchText(item.name)
    if (cls === "course") {
      if (
        n.includes("コ-ス") || n.includes("course") ||
        /おまかせ\d*皿/.test(n) ||
        (n.includes("sp") && n.includes("コ-ス"))
      ) return true
    } else if (cls === "bottle_wine" || cls === "bottle") {
      if (
        (n.includes("ボトル") || n.includes("bottle")) &&
        (n.includes("ワイン") || n.includes("wine") || n.includes("シャンパ") ||
          n.includes("スパーク"))
      ) return true
      if (n.includes("bottlewine") || n.includes("ボトルワイン")) return true
    } else if (cls === "glass_wine" || cls === "glass") {
      if (
        (n.includes("グラス") || n.includes("glass")) &&
        (n.includes("ワイン") || n.includes("wine"))
      ) return true
      if (n.includes("glasswine") || n.includes("グラスワイン")) return true
    } else if (cls === "pairing") {
      if (n.includes("ペアリング") || n.includes("pairing")) return true
    } else if (cls === "drink_name") {
      if (
        /ワイン|wine|ドリンク|drink|ビール|beer|カクテル|cocktail|whisky|ウィスキー|ハイボール|ソフト|ジュース|コーヒー|お茶|シャンパ|スパーク|ペアリング/
          .test(n)
      ) return true
    } else {
      throw {
        status: 400,
        message:
          `未対応の item_class: ${itemClass}（course / bottle_wine / glass_wine / pairing / drink_name）`,
      } satisfies AppError
    }
  }
  return false
}

function receiptMealSide(receipt: Record<string, unknown>): "lunch" | "dinner" {
  const time = String(receipt.time ?? "")
  const hourMatch = time.match(/(\d{1,2})/)
  const hour = hourMatch ? Number(hourMatch[1]) : 18
  return Number.isFinite(hour) && hour < 16 ? "lunch" : "dinner"
}

function isWeekendBusinessDate(businessDate: string): boolean {
  const d = new Date(`${businessDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return false
  const dow = d.getDay()
  return dow === 0 || dow === 6
}

type CohortSideChoice = "left" | "right" | "skip"

type NormalizedCohortComparison = {
  id: string
  label: string
  axis: string
  partition: boolean
  leftLabel: string
  rightLabel: string
  decide: (
    receipt: Record<string, unknown>,
    businessDate: string,
  ) => CohortSideChoice
}

function normalizeCohortComparisonSpec(
  value: unknown,
  index: number,
): NormalizedCohortComparison {
  if (!isRecord(value)) {
    throw {
      status: 400,
      message: `comparisons[${index}] はオブジェクトである必要があります。`,
    } satisfies AppError
  }
  const axis = String(value.axis ?? value.type ?? "").trim().toLowerCase()
  const id = String(value.id ?? `cmp_${index + 1}`).trim() || `cmp_${index + 1}`
  const label = String(value.label ?? "").trim()

  if (axis === "item_presence" || axis === "product_with_without") {
    const filter = filterFromProductSearchObject(value.item ?? value)
    const unitBit = filter.unitMin != null
      ? `${filter.unitMin}${
        filter.unitMax != null && filter.unitMax !== filter.unitMin
          ? `〜${filter.unitMax}`
          : ""
      }円`
      : ""
    const nameBit = filter.rawQ || filter.codeQ || "対象商品"
    return {
      id,
      label: label || `${nameBit}${unitBit ? `（${unitBit}）` : ""} 利用 vs 非利用`,
      axis: "item_presence",
      partition: true,
      leftLabel: "利用あり",
      rightLabel: "利用なし",
      decide: (receipt) =>
        receiptHasMatchingItem(receipt, filter) ? "left" : "right",
    }
  }

  if (axis === "item_class") {
    const itemClass = String(value.item_class ?? value.itemClass ?? "").trim()
    const classLabels: Record<string, string> = {
      course: "コース",
      bottle_wine: "ボトルワイン",
      bottle: "ボトルワイン",
      glass_wine: "グラスワイン",
      glass: "グラスワイン",
      pairing: "ペアリング",
      drink_name: "ドリンク系商品",
    }
    const nice = classLabels[itemClass.toLowerCase()] || itemClass
    return {
      id,
      label: label || `${nice}利用 vs 非利用`,
      axis: "item_class",
      partition: true,
      leftLabel: `${nice}利用あり`,
      rightLabel: `${nice}利用なし`,
      decide: (receipt) =>
        receiptHasItemClass(receipt, itemClass) ? "left" : "right",
    }
  }

  if (axis === "item_vs_item" || axis === "product_vs_product") {
    const filterA = filterFromProductSearchObject(value.item_a ?? value.a)
    const filterB = filterFromProductSearchObject(value.item_b ?? value.b)
    const exclusive = value.exclusive !== false
    return {
      id,
      label: label ||
        `${filterA.rawQ || "商品A"} vs ${filterB.rawQ || "商品B"}`,
      axis: "item_vs_item",
      partition: false,
      leftLabel: filterA.rawQ || "商品A",
      rightLabel: filterB.rawQ || "商品B",
      decide: (receipt) => {
        const hasA = receiptHasMatchingItem(receipt, filterA)
        const hasB = receiptHasMatchingItem(receipt, filterB)
        if (exclusive) {
          if (hasA && !hasB) return "left"
          if (hasB && !hasA) return "right"
          return "skip"
        }
        if (hasA && hasB) return "skip"
        if (hasA) return "left"
        if (hasB) return "right"
        return "skip"
      },
    }
  }

  if (axis === "item_class_vs_class" || axis === "class_vs_class") {
    const classA = String(value.item_class_a ?? value.class_a ?? "").trim()
    const classB = String(value.item_class_b ?? value.class_b ?? "").trim()
    if (!classA || !classB) {
      throw {
        status: 400,
        message: "item_class_vs_class には item_class_a と item_class_b が必要です。",
      } satisfies AppError
    }
    const classLabels: Record<string, string> = {
      course: "コース",
      bottle_wine: "ボトルワイン",
      bottle: "ボトルワイン",
      glass_wine: "グラスワイン",
      glass: "グラスワイン",
      pairing: "ペアリング",
      drink_name: "ドリンク系商品",
    }
    const niceA = classLabels[classA.toLowerCase()] || classA
    const niceB = classLabels[classB.toLowerCase()] || classB
    const exclusive = value.exclusive !== false
    return {
      id,
      label: label || `${niceA} vs ${niceB}`,
      axis: "item_class_vs_class",
      partition: false,
      leftLabel: niceA,
      rightLabel: niceB,
      decide: (receipt) => {
        const hasA = receiptHasItemClass(receipt, classA)
        const hasB = receiptHasItemClass(receipt, classB)
        if (exclusive) {
          if (hasA && !hasB) return "left"
          if (hasB && !hasA) return "right"
          return "skip"
        }
        if (hasA && hasB) return "skip"
        if (hasA) return "left"
        if (hasB) return "right"
        return "skip"
      },
    }
  }

  if (axis === "meal") {
    return {
      id,
      label: label || "ランチ vs ディナー",
      axis: "meal",
      partition: true,
      leftLabel: "ランチ",
      rightLabel: "ディナー",
      decide: (receipt) =>
        receiptMealSide(receipt) === "lunch" ? "left" : "right",
    }
  }

  if (axis === "weekday_weekend" || axis === "weekend") {
    return {
      id,
      label: label || "平日 vs 週末",
      axis: "weekday_weekend",
      partition: true,
      leftLabel: "平日",
      rightLabel: "週末",
      decide: (_receipt, businessDate) =>
        isWeekendBusinessDate(businessDate) ? "right" : "left",
    }
  }

  if (axis === "guest_size" || axis === "party_size") {
    const threshold = parseOptionalNonNegativeInt(
      value.guest_threshold ?? value.threshold ?? 4,
    ) || 4
    return {
      id,
      label: label || `少人数（〜${threshold - 1}名） vs 多人数（${threshold}名〜）`,
      axis: "guest_size",
      partition: true,
      leftLabel: `${threshold - 1}名以下`,
      rightLabel: `${threshold}名以上`,
      decide: (receipt) => {
        const guests = toNonNegativeInteger(receipt.guests)
        if (guests <= 0) return "skip"
        return guests < threshold ? "left" : "right"
      },
    }
  }

  if (axis === "unit_band_among") {
    const filter = filterFromProductSearchObject(value.item ?? value)
    const split = parseOptionalNonNegativeInt(
      value.unit_split ?? value.split ?? 7000,
    ) || 7000
    return {
      id,
      label: label ||
        `${filter.rawQ || "対象"} 単価${split}円未満 vs ${split}円以上`,
      axis: "unit_band_among",
      partition: false,
      leftLabel: `${split}円未満`,
      rightLabel: `${split}円以上`,
      decide: (receipt) => {
        let low = false
        let high = false
        for (const item of extractNetProductItemsFromReceipt(receipt)) {
          if (!itemMatchesPosProductFilter(
            item.name,
            item.code,
            item.unit,
            filter,
          )) continue
          if (item.unit < split) low = true
          else high = true
        }
        if (low && !high) return "left"
        if (high && !low) return "right"
        return "skip"
      },
    }
  }

  throw {
    status: 400,
    message:
      `未対応の比較軸 comparisons[${index}].axis=${axis || "(空)"}。対応: item_presence / item_class / item_vs_item / item_class_vs_class / meal / weekday_weekend / guest_size / unit_band_among`,
  } satisfies AppError
}

function slimCohortMonthSide(bucket: CohortBucket) {
  return {
    receipt_count: bucket.receipt_count,
    guests: bucket.guests,
    total_sales: bucket.total_sales,
    avg_spend: bucket.guests > 0
      ? Math.round(bucket.total_sales / bucket.guests)
      : 0,
  }
}

/**
 * 汎用: 複数の比較軸をジャーナル1回走査で集計する。
 * 利用/非利用・昼夜・平日週末・人数帯・商品A vs B などに対応。
 */
async function comparePosJournalCohortsGeneral(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  storeScope: string | null,
) {
  const storeKey = normalizePosJournalStoreKey(
    body.store_key || body.store || storeScope,
  )
  if (storeScope && storeKey.toLowerCase() !== storeScope.toLowerCase()) {
    throw {
      status: 403,
      message: "他店舗のデータにはアクセスできません。",
    } satisfies AppError
  }
  const monthFrom = parseOptionalYearMonthParam(body.month_from, "month_from")
  const monthTo = parseOptionalYearMonthParam(body.month_to, "month_to")
  const rawList = Array.isArray(body.comparisons)
    ? body.comparisons
    : (isRecord(body.comparison) ? [body.comparison] : [])
  if (!rawList.length) {
    throw {
      status: 400,
      message: "comparisons 配列（または comparison）を指定してください。",
    } satisfies AppError
  }
  if (rawList.length > 6) {
    throw {
      status: 400,
      message: "comparisons は最大6件までです。",
    } satisfies AppError
  }
  const specs = rawList.map((item, i) => normalizeCohortComparisonSpec(item, i))

  const states = specs.map((spec) => ({
    spec,
    left: emptyCohortBucket(),
    right: emptyCohortBucket(),
    byMonth: new Map<string, { left: CohortBucket; right: CohortBucket }>(),
  }))
  let scannedReceipts = 0
  const dayDetails: JournalProductDayDetail[] = []

  const scan = await scanPosJournalParsedRows(
    supabase,
    {
      storeKey,
      monthFrom,
      monthTo,
      errorLabel: "汎用コホート用ジャーナルの取得に失敗しました",
    },
    (rows) => {
      for (const row of rows) {
        if (!isRecord(row)) continue
        const businessDate = String(row.business_date ?? "").slice(0, 10)
        const yearMonth = String(row.year_month ?? businessDate.slice(0, 7))
        const detail = reconcilePosJournalParsedRow(row)
        if (!detail) continue
        dayDetails.push(detail)
        if (!detail.detail_complete) continue
        for (const receipt of detail.receipts) {
          if (!isRecord(receipt) || !Array.isArray(receipt.items)) continue
          scannedReceipts += 1
          for (const state of states) {
            const side = state.spec.decide(receipt, businessDate)
            if (side === "skip") continue
            let monthBuckets = state.byMonth.get(yearMonth)
            if (!monthBuckets) {
              monthBuckets = {
                left: emptyCohortBucket(),
                right: emptyCohortBucket(),
              }
              state.byMonth.set(yearMonth, monthBuckets)
            }
            const target = side === "left" ? state.left : state.right
            const monthTarget = side === "left"
              ? monthBuckets.left
              : monthBuckets.right
            addReceiptToCohort(target, receipt, businessDate)
            addReceiptToCohort(monthTarget, receipt, businessDate)
          }
        }
      }
    },
  )

  return {
    ok: true,
    store_key: storeKey,
    month_from: monthFrom,
    month_to: monthTo,
    scanned_files: scan.scannedRows,
    scanned_receipts: scannedReceipts,
    detail_coverage: combineJournalProductDetailCoverage(
      [...new Set(dayDetails.map((day) => day.year_month))].map((month) => ({
        year_month: month,
        ...summarizeJournalProductDetailCoverage(
          dayDetails.filter((day) => day.year_month === month),
        ),
      })),
    ),
    comparisons: states.map((state) => ({
      id: state.spec.id,
      label: state.spec.label,
      axis: state.spec.axis,
      partition: state.spec.partition,
      left_label: state.spec.leftLabel,
      right_label: state.spec.rightLabel,
      left: serializeCohortBucket(state.left),
      right: serializeCohortBucket(state.right),
      by_month: [...state.byMonth.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([year_month, buckets]) => ({
          year_month,
          left: slimCohortMonthSide(buckets.left),
          right: slimCohortMonthSide(buckets.right),
        })),
    })),
  }
}

/**
 * 対象商品を含む会計 vs 含まない会計（後方互換の専用エンドポイント）。
 * 内部は汎用コホート比較エンジンを使う。
 */
async function comparePosJournalProductCohorts(
  supabase: ReturnType<typeof createClient>,
  url: URL,
) {
  const storeKey = normalizePosJournalStoreKey(
    url.searchParams.get("store_key") || url.searchParams.get("store"),
  )
  const filter = parsePosProductSearchFilter(url)
  const monthFrom = parseOptionalYearMonthParam(
    url.searchParams.get("month_from"),
    "month_from",
  )
  const monthTo = parseOptionalYearMonthParam(
    url.searchParams.get("month_to"),
    "month_to",
  )
  const general = await comparePosJournalCohortsGeneral(supabase, {
    store_key: storeKey,
    month_from: monthFrom,
    month_to: monthTo,
    comparisons: [{
      id: "product_with_without",
      axis: "item_presence",
      item: {
        q: filter.rawQ,
        code: filter.codeQ,
        unit_min: filter.unitMin,
        unit_max: filter.unitMax,
      },
    }],
  }, null)
  const cmp = Array.isArray(general.comparisons) ? general.comparisons[0] : null
  return {
    ok: true,
    store_key: storeKey,
    query: {
      q: filter.rawQ,
      code: filter.codeQ,
      unit_min: filter.unitMin,
      unit_max: filter.unitMax,
      month_from: monthFrom,
      month_to: monthTo,
    },
    scanned_files: general.scanned_files,
    scanned_receipts: general.scanned_receipts,
    detail_coverage: general.detail_coverage,
    with_product: cmp?.left || serializeCohortBucket(emptyCohortBucket()),
    without_product: cmp?.right || serializeCohortBucket(emptyCohortBucket()),
    by_month: (cmp?.by_month || []).map((m: {
      year_month: string
      left: ReturnType<typeof slimCohortMonthSide>
      right: ReturnType<typeof slimCohortMonthSide>
    }) => ({
      year_month: m.year_month,
      with_product: m.left,
      without_product: m.right,
    })),
  }
}


async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const stableBytes = new Uint8Array(bytes.byteLength)
  stableBytes.set(bytes)
  const digest = await crypto.subtle.digest("SHA-256", stableBytes.buffer)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

function buildPosJournalStoragePath(
  storeKey: string,
  businessDate: string,
  hash: string,
  originalFileName: string,
): string {
  const month = businessDate.slice(0, 7)
  const safeName = sanitizeUploadFileName(originalFileName || "journal.lzh")
  return `${storeKey}/${month}/${businessDate}/${
    hash.slice(0, 16)
  }-${crypto.randomUUID()}-${safeName}`
}

/** 電子ジャーナルの不完全行（会計明細なし）＝再アップロードで修復可能 */
function isPosJournalPlaceholderRow(row: Record<string, unknown>): boolean {
  const receiptsCount = toNonNegativeInteger(row.receipts_count)
  const parsed = isRecord(row.parsed_data) ? row.parsed_data : {}
  const receipts = Array.isArray(parsed.receipts) ? parsed.receipts : []
  const parsedComplete = parsed.parsed_complete === true
  return !parsedComplete && (receiptsCount <= 0 || receipts.length === 0)
}

function isPosJournalStaleParserRow(row: Record<string, unknown>): boolean {
  const parsed = isRecord(row.parsed_data) ? row.parsed_data : {}
  return toSafeString(parsed.parser_version) !== POS_JOURNAL_REPORT_PARSER_VERSION
}

function isPosJournalDetailMismatchRow(row: Record<string, unknown>): boolean {
  const businessDate = toSafeString(row.business_date ||
    (isRecord(row.parsed_data) ? row.parsed_data.business_date : ""))
  const detail = reconcileParsedJournalDayDetail(
    row.parsed_data,
    businessDate,
    toSafeString(row.year_month) || businessDate.slice(0, 7),
    {
      grossSales: row.gross_sales,
      groups: row.groups_count,
    },
  )
  return detail == null || !detail.detail_complete
}

function buildPosJournalRepairPayload(
  day: {
    net_sales?: unknown
    tax?: unknown
    gross_sales?: unknown
    groups?: unknown
    guests?: unknown
    receipts?: unknown
  },
  originalFileName: string,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  const now = new Date().toISOString()
  return {
    original_file_name: originalFileName,
    inner_file_name: originalFileName.replace(/\.lzh$/i, ".jnl"),
    parsed_data: day,
    net_sales: Number(day.net_sales) || 0,
    tax_yen: Number(day.tax) || 0,
    gross_sales: Number(day.gross_sales) || 0,
    groups_count: Number(day.groups) || 0,
    guests_count: Number(day.guests) || 0,
    receipts_count: Array.isArray(day.receipts) ? day.receipts.length : 0,
    // 修復後に一覧で「最新」として並ぶよう、アップロード時刻も更新する
    uploaded_at: now,
    updated_at: now,
    ...extras,
  }
}

type PosJournalAutoReportResult = {
  ok: boolean
  months: string[]
  created_count: number
  updated_count: number
  report_count: number
  reports: Array<{
    id: string
    title: string
    month: string
    kind: "daily" | "monthly"
    action: "created" | "updated"
  }>
  failures: Array<{ month: string; error: string }>
}

/**
 * 店舗ごとの商品コード範囲を読む。行が無ければ null を返し、
 * pos_journal.ts のコード内既定値へフォールバックする（既存店舗は無変更）。
 */
async function fetchPosJournalCategoryRules(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
): Promise<PosJournalCategoryRules | null> {
  const { data, error } = await supabase
    .from("pos_journal_category_rules")
    .select("food_codes, drink_codes, room_codes, charge_codes")
    .eq("store_partition_key", storeKey)
    .maybeSingle()
  if (error) {
    // 設定が読めないだけで日次レポート生成を止めない。既定値で続行する。
    console.error(
      "POS journal category rules fetch failed:",
      storeKey,
      error.message,
    )
    return null
  }
  return buildPosJournalCategoryRules(
    data as Record<string, unknown> | null,
  )
}

async function fetchPosJournalCategoryOverrides(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
): Promise<Record<string, unknown>> {
  const ids = [
    `jnl2txt_category_overrides_v1__${storeKey.toLowerCase()}`,
    ...(storeKey.toLowerCase() === "bistrocavacava"
      ? ["jnl2txt_category_overrides_v1"]
      : []),
  ]
  const { data, error } = await supabase
    .from("saved_reports")
    .select("id, data")
    .eq("store_partition_key", storeKey)
    .is("deleted_at", null)
    .in("id", ids)
  if (error) {
    console.error(
      "POS journal auto report category overrides failed:",
      storeKey,
      error.message,
    )
    return {}
  }
  const rows = Array.isArray(data) ? data : []
  for (const id of ids) {
    const row = rows.find((candidate) =>
      toSafeString((candidate as { id?: unknown })?.id) === id
    )
    const reportData = row && isRecord(row.data) ? row.data : {}
    if (isRecord(reportData.overrides)) return reportData.overrides
  }
  return {}
}

function savedReportSourceMonths(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((month) => toSafeString(month)).filter((month) =>
    /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
  )
}

function legacySavedReportIsSingleMonth(
  row: Record<string, unknown>,
  month: string,
): boolean {
  const period = toSafeString(row.period)
  const periodDates = period.match(/\d{4}-\d{2}-\d{2}/g) ?? []
  if (periodDates.length) {
    return periodDates.every((date) => date.slice(0, 7) === month)
  }
  const title = toSafeString(row.title).normalize("NFKC")
  const text = `${title} ${period}`.normalize("NFKC")
  if (/合算|〜|～|から|まで/.test(text)) return false
  const [year, monthText] = month.split("-")
  const monthNumber = Number(monthText)
  return text.includes(month) ||
    text.includes(`${year}/${monthNumber}`) ||
    new RegExp(`${year}\\s*年\\s*0?${monthNumber}\\s*月`).test(text)
}

function isCanonicalSavedReportForMonth(
  row: Record<string, unknown>,
  month: string,
  kind: "daily" | "monthly",
): boolean {
  const title = toSafeString(row.title)
  if (/合算/.test(title)) return false
  const sourceMonths = savedReportSourceMonths(row.sourceMonths)
  const kindMatches = kind === "daily"
    ? /日別/.test(title)
    : isMonthlyReportTitleForList(title)
  if (!kindMatches) return false
  if (sourceMonths.length) {
    return sourceMonths.length === 1 && sourceMonths[0] === month
  }
  return savedReportCandidateMatchesMonth(row, month) &&
    legacySavedReportIsSingleMonth(row, month)
}

async function fetchSavedReportCandidatesForAutoBuild(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
  month: string,
): Promise<Array<Record<string, unknown>>> {
  // まず軽量一覧で絞る。sourceMonthsを持たない旧レポートも
  // タイトル／periodから拾い、巨大dataは該当ID分だけ取得する。
  const { data: summaryData, error: summaryError } = await supabase
    .from("saved_reports")
    .select(
      "id, title, period, created_at, updated_at, sourceMonths:data->sourceMonths",
    )
    .eq("store_partition_key", storeKey)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(5000)
  if (summaryError) {
    throw new Error(`既存レポート確認に失敗しました: ${summaryError.message}`)
  }
  const summaries: Record<string, unknown>[] = []
  for (const row of Array.isArray(summaryData) ? summaryData : []) {
    if (!isRecord(row)) continue
    if (savedReportCandidateMatchesMonth(row, month)) summaries.push(row)
  }
  const ids = summaries.map((row) => toSafeString(row.id)).filter(Boolean)
  if (!ids.length) return []

  const detailsById = new Map<string, Record<string, unknown>>()
  for (let offset = 0; offset < ids.length; offset += 50) {
    const idChunk = ids.slice(offset, offset + 50)
    const { data: detailData, error: detailError } = await supabase
      .from("saved_reports")
      .select("id, data")
      .eq("store_partition_key", storeKey)
      .is("deleted_at", null)
      .in("id", idChunk)
    if (detailError) {
      throw new Error(`既存レポート詳細の取得に失敗しました: ${detailError.message}`)
    }
    for (const row of Array.isArray(detailData) ? detailData : []) {
      if (!isRecord(row)) continue
      const id = toSafeString(row.id)
      if (id) detailsById.set(id, row)
    }
  }
  const rows: Record<string, unknown>[] = []
  for (const summary of summaries) {
    const id = toSafeString(summary.id)
    const detail = detailsById.get(id)
    if (detail) rows.push({ ...summary, data: detail.data })
  }
  return rows
}

async function upsertPosJournalAutoReports(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
  months: string[],
): Promise<PosJournalAutoReportResult> {
  const monthList = [...new Set(
    months.map((month) => String(month || "").trim()).filter((month) =>
      /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
    ),
  )].sort()
  const result: PosJournalAutoReportResult = {
    ok: true,
    months: monthList,
    created_count: 0,
    updated_count: 0,
    report_count: 0,
    reports: [],
    failures: [],
  }
  if (!monthList.length) return result

  const categoryOverrides = await fetchPosJournalCategoryOverrides(
    supabase,
    storeKey,
  )
  const categoryRules = await fetchPosJournalCategoryRules(supabase, storeKey)
  for (const month of monthList) {
    try {
      const rows = await fetchPosJournalRows(supabase, storeKey, month)
      const storedDays = rows
        .map((row) =>
          isRecord(row.parsed_data) ? row.parsed_data as PosJournalDay : null
        )
        .filter((day): day is PosJournalDay =>
          day !== null &&
          typeof day.business_date === "string" &&
          Array.isArray(day.receipts)
        )
      if (!storedDays.length) continue
      const existingRows = await fetchSavedReportCandidatesForAutoBuild(
        supabase,
        storeKey,
        month,
      )
      const savedDays = pickBestJournalSavedReportDays(
        existingRows.map((row) => ({
          id: row.id,
          data: row.data,
          created_at: row.created_at,
        })),
        month,
      )
      // 保存済みレポートが月全体を持つ場合は、それを土台にし、
      // 今回存在するLZH原本の日だけ正本として差し替える。部分原本で月を縮めない。
      const days = mergePosJournalDaysPreferPrimary(storedDays, savedDays)
      const mappedStore = resolvePosJournalStoreByKey(storeKey)
      const storeCode = toSafeString(rows[0]?.store_code) ||
        mappedStore?.storeCodes[0] || ""
      const knownStore = resolvePosJournalStore(storeCode) ?? mappedStore
      const reports = buildJournalSavedReportsFromPosDays({
        storeKey,
        storeName: knownStore?.storeName || storeKey,
        storeCode,
        month,
        days,
        journalIds: rows.map((row) => Number(row.id)).filter((id) =>
          Number.isSafeInteger(id) && id > 0
        ),
        categoryOverrides,
        categoryRules,
      })
      if (!reports.length) continue
      const now = new Date().toISOString()
      const actions: Array<{
        report: typeof reports[number]
        id: string
        action: "created" | "updated"
        existingCreatedAt: string
      }> = reports.map((report) => {
        const kind: "daily" | "monthly" = /日別/.test(report.title)
          ? "daily"
          : "monthly"
        const deterministic = existingRows.find((row) =>
          toSafeString(row.id) === report.id
        )
        const canonical = existingRows.find((row) =>
          isCanonicalSavedReportForMonth(row, month, kind)
        )
        const existing = deterministic || canonical
        return {
          report,
          id: toSafeString(existing?.id) || report.id,
          action: existing ? "updated" : "created",
          existingCreatedAt: String(existing?.created_at ?? ""),
        }
      })
      const payloads = actions.map((entry) => {
        const { report, id, existingCreatedAt } = entry
        const html = buildJournalSavedReportHtml({
          ...report,
          data: { ...report.data, id, title: report.title },
        })
        const storagePath = buildSavedReportHtmlStoragePath(storeKey, id)
        const htmlBytes = new TextEncoder().encode(html)
        const reportData = {
          ...report.data,
          id,
          title: report.title,
          ...(htmlBytes.length <= POS_REPORT_HTML_MAX_BYTES
            ? { htmlStoragePath: storagePath, htmlBytes: htmlBytes.length }
            : {}),
        }
        const sanitizedData = sanitizeSavedReportDataForStorage(
          reportData as unknown as Record<string, unknown>,
          id,
        )
        return {
          id,
          title: report.title,
          period: report.period,
          data: {
            ...sanitizedData,
            autoGeneratedFromPosJournal: true,
            autoGeneratedAt: now,
            autoGeneratedSource: POS_JOURNAL_AUTO_REPORT_SOURCE,
          },
          store_partition_key: storeKey,
          deleted_at: null,
          ...(existingCreatedAt ? { created_at: existingCreatedAt } : {}),
          updated_at: now,
        }
      })
      const { error: upsertError } = await supabase
        .from("saved_reports")
        .upsert(payloads, { onConflict: "id" })
      if (upsertError) {
        throw new Error(`日別・月間レポートの保存に失敗しました: ${upsertError.message}`)
      }
      for (const entry of actions) {
        try {
          const html = buildJournalSavedReportHtml({
            ...entry.report,
            data: {
              ...entry.report.data,
              id: entry.id,
              title: entry.report.title,
            },
          })
          const bytes = new TextEncoder().encode(html)
          if (bytes.length > POS_REPORT_HTML_MAX_BYTES) continue
          const { error: htmlError } = await supabase.storage
            .from(POS_REPORT_HTML_BUCKET)
            .upload(
              buildSavedReportHtmlStoragePath(storeKey, entry.id),
              bytes,
              { contentType: "text/html", upsert: true },
            )
          if (htmlError) {
            console.error(
              "POS journal auto report HTML save failed:",
              entry.id,
              htmlError.message,
            )
          }
        } catch (error) {
          console.error(
            "POS journal auto report HTML build failed:",
            entry.id,
            error instanceof Error ? error.message : String(error),
          )
        }
      }
      for (const entry of actions) {
        const { report, id, action } = entry
        if (action === "created") result.created_count += 1
        else result.updated_count += 1
        result.reports.push({
          id,
          title: report.title,
          month,
          kind: /日別/.test(report.title) ? "daily" : "monthly",
          action,
        })
      }
      result.report_count += reports.length
      // 月次レポート1件だけで過去売上同期を行う。日別・月間の両方で
      // 同じ日を二重同期しない（upsert自体は冪等だがログを一度に保つ）。
      const monthlyEntry = actions.find((entry) =>
        /月間/.test(entry.report.title)
      )
      if (monthlyEntry) {
        try {
          await syncJournalSalesFromReport(
            supabase,
            storeKey,
            { ...monthlyEntry.report.data, id: monthlyEntry.id },
          )
        } catch (error) {
          console.error(
            "POS journal auto report sales sync failed:",
            storeKey,
            month,
            error instanceof Error ? error.message : String(error),
          )
        }
      }
    } catch (error) {
      result.ok = false
      result.failures.push({
        month,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return result
}

/** 修復時: パス未保管、または中身ハッシュが変わった場合は新しい LZH を保存する */
async function ensurePosJournalStorageForRepair(
  supabase: ReturnType<typeof createClient>,
  args: {
    storeKey: string
    businessDate: string
    hash: string
    originalFileName: string
    bytes: Uint8Array
    existingStoragePath: string
    existingShaHex: string
  },
): Promise<{ storagePath: string; previousPath: string }> {
  const existingPath = toSafeString(args.existingStoragePath)
  const existingSha = toSafeString(args.existingShaHex)
  if (existingPath && existingSha && existingSha === args.hash) {
    return { storagePath: existingPath, previousPath: "" }
  }
  const storagePath = buildPosJournalStoragePath(
    args.storeKey,
    args.businessDate,
    args.hash,
    args.originalFileName,
  )
  const { error: uploadError } = await supabase.storage.from(POS_JOURNAL_BUCKET)
    .upload(storagePath, args.bytes, {
      contentType: "application/x-lzh-compressed",
      upsert: false,
    })
  if (uploadError) {
    throw new Error(`原本の保存に失敗しました: ${uploadError.message}`)
  }
  return {
    storagePath,
    previousPath: existingPath && existingPath !== storagePath ? existingPath : "",
  }
}

/**
 * pos_journal_store_codes から「レジ店舗コード → 店舗」を引く。
 * コード内の POS_JOURNAL_STORE_CODE_MAP に無い店舗を、デプロイなしで
 * 増やせるようにするための後段。見つからなければ null。
 */
async function lookupPosJournalStoreCode(
  supabase: ReturnType<typeof createClient>,
  storeCode: string,
): Promise<{ storeKey: string; storeName: string } | null> {
  const code = String(storeCode || "").trim()
  if (!/^\d{4}$/.test(code)) return null
  try {
    const { data, error } = await supabase
      .from("pos_journal_store_codes")
      .select("store_partition_key, store_name")
      .eq("store_code", code)
      .maybeSingle()
    if (error) {
      console.error("lookupPosJournalStoreCode failed:", error.message)
      return null
    }
    const storeKey = String(
      (data as { store_partition_key?: unknown } | null)?.store_partition_key ?? "",
    ).trim()
    const storeName = String(
      (data as { store_name?: unknown } | null)?.store_name ?? "",
    ).trim()
    if (!storeKey) return null
    return { storeKey, storeName: storeName || storeKey }
  } catch (e) {
    console.error("lookupPosJournalStoreCode threw:", e instanceof Error ? e.message : String(e))
    return null
  }
}

/**
 * `lookupPosJournalStoreCode` の逆引き。店舗キーから店名と割当コードを引く。
 * コード内定数に無い店舗（pos_journal_store_codes へ後から insert しただけの店舗）でも
 * 電子ジャーナル画面に正しい店名・店舗コードを出せるようにする。
 */
async function lookupPosJournalStoreCodeByKey(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
): Promise<{ storeKey: string; storeName: string; storeCodes: string[] } | null> {
  const key = String(storeKey || "").trim().toLowerCase()
  // 大文字小文字ゆらぎ(marugoS)を吸収するため ilike で引くが、LIKEのワイルドカード
  // (% _ *)を含むキーは他店舗まで巻き込むため、英数字キー以外は照合しない。
  if (!/^[a-z0-9]+$/.test(key)) return null
  try {
    const { data, error } = await supabase
      .from("pos_journal_store_codes")
      .select("store_code, store_partition_key, store_name")
      .ilike("store_partition_key", key)
    if (error) {
      console.error("lookupPosJournalStoreCodeByKey failed:", error.message)
      return null
    }
    const rows = (Array.isArray(data) ? data : [])
      .map((value) => isRecord(value) ? value : null)
      .filter((row): row is Record<string, unknown> => row !== null)
      .filter((row) =>
        toSafeString(row.store_partition_key).trim().toLowerCase() === key
      )
    if (!rows.length) return null
    const storeCodes = Array.from(
      new Set(rows.map((row) => toSafeString(row.store_code)).filter(Boolean)),
    ).sort()
    const storeName = toSafeString(rows.find((row) =>
      toSafeString(row.store_name)
    )?.store_name) || key
    return { storeKey: key, storeName, storeCodes }
  } catch (e) {
    console.error(
      "lookupPosJournalStoreCodeByKey threw:",
      e instanceof Error ? e.message : String(e),
    )
    return null
  }
}

/**
 * store_partition_key の distinct 値を、PostgREST の GROUP BY 無しで数クエリだけ読む。
 * 「1件だけ昇順で読み、次は直前のキーより大きいものを1件」を繰り返す loose index scan。
 * 行数ではなく店舗数に比例するため、原本が何万件になっても軽いまま。
 */
async function listDistinctPosJournalStoreKeys(
  supabase: ReturnType<typeof createClient>,
  table: "pos_journal_files" | "saved_reports",
  maxStores = 60,
): Promise<string[]> {
  const keys: string[] = []
  let cursor = ""
  for (let i = 0; i < maxStores; i++) {
    const base = supabase.from(table).select("store_partition_key")
    let query = table === "saved_reports"
      ? base.is("deleted_at", null)
      : base.is("storage_deleted_at", null)
    if (cursor) query = query.gt("store_partition_key", cursor)
    const { data, error } = await query
      .order("store_partition_key", { ascending: true })
      .limit(1)
    if (error) {
      console.error(
        "listDistinctPosJournalStoreKeys failed:",
        table,
        error.message,
      )
      break
    }
    const row = Array.isArray(data) && isRecord(data[0]) ? data[0] : null
    const key = toSafeString(row?.store_partition_key).trim()
    if (!key) break
    keys.push(key)
    cursor = key
  }
  return keys
}

/** 保存済みレポート1行から、そのレポートが対象にしている年月を取り出す */
function savedReportMonths(row: Record<string, unknown>): string[] {
  const months = new Set<string>()
  const sourceMonths = Array.isArray(row.sourceMonths) ? row.sourceMonths : []
  for (const value of sourceMonths) {
    const month = toSafeString(value).trim()
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) months.add(month)
  }
  const text = `${toSafeString(row.title)} ${toSafeString(row.period)}`
    .normalize("NFKC")
  for (const match of text.matchAll(/(\d{4})[-\/年](\d{1,2})/g)) {
    const monthNumber = Number(match[2])
    if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
      continue
    }
    months.add(`${match[1]}-${String(monthNumber).padStart(2, "0")}`)
  }
  return Array.from(months)
}

/**
 * 電子ジャーナル画面の店舗プルダウン用。LZH原本（pos_journal_files）と
 * Journal Reportの保存済みレポート（saved_reports）の「どちらかにデータがある」店舗を
 * 1つの一覧にまとめて返す。片側だけに保存された店舗も必ず選べるようにするための正本。
 */
async function fetchPosJournalStoreDirectory(
  supabase: ReturnType<typeof createClient>,
  storeScope: string | null,
) {
  const scope = String(storeScope ?? "").trim().toLowerCase()
  const candidates = new Map<string, { storeName: string; storeCodes: Set<string> }>()
  const addCandidate = (rawKey: unknown, storeName: unknown, storeCode?: unknown) => {
    const key = toSafeString(rawKey).trim().toLowerCase()
    if (!key || key === "__all__") return
    if (scope && key !== scope) return
    const entry = candidates.get(key) ??
      { storeName: "", storeCodes: new Set<string>() }
    const name = toSafeString(storeName).trim()
    if (name && !entry.storeName) entry.storeName = name
    const code = toSafeString(storeCode).trim()
    if (/^\d{4}$/.test(code)) entry.storeCodes.add(code)
    candidates.set(key, entry)
  }

  for (const [code, store] of Object.entries(POS_JOURNAL_STORE_CODE_MAP)) {
    addCandidate(store.storeKey, store.storeName, code)
  }
  const { data: codeRows, error: codeError } = await supabase
    .from("pos_journal_store_codes")
    .select("store_code, store_partition_key, store_name")
  if (codeError) {
    console.error("pos journal store code list failed:", codeError.message)
  }
  for (const row of Array.isArray(codeRows) ? codeRows : []) {
    if (!isRecord(row)) continue
    addCandidate(row.store_partition_key, row.store_name, row.store_code)
  }
  // レジ店舗コードが未登録でも、Journal Report側だけにデータがある店舗は拾う。
  for (
    const table of ["pos_journal_files", "saved_reports"] as const
  ) {
    for (const key of await listDistinctPosJournalStoreKeys(supabase, table)) {
      addCandidate(key, "", "")
    }
  }

  const stores: Record<string, unknown>[] = []
  for (const [storeKey, entry] of candidates) {
    const [fileCountResult, reportCountResult, monthRowsResult, reportRowsResult] =
      await Promise.all([
      supabase
        .from("pos_journal_files")
        .select("id", { count: "exact", head: true })
        .eq("store_partition_key", storeKey)
        .is("storage_deleted_at", null),
      supabase
        .from("saved_reports")
        .select("id", { count: "exact", head: true })
        .eq("store_partition_key", storeKey)
        .is("deleted_at", null),
      supabase
        .from("pos_journal_files")
        .select("year_month, store_code")
        .eq("store_partition_key", storeKey)
        .is("storage_deleted_at", null)
        .order("business_date", { ascending: false })
        .limit(1000),
      supabase
        .from("saved_reports")
        .select("title, period, sourceMonths:data->sourceMonths")
        .eq("store_partition_key", storeKey)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500),
    ])
    if (fileCountResult.error) {
      console.error(
        "pos journal store file count failed:",
        storeKey,
        fileCountResult.error.message,
      )
    }
    if (reportRowsResult.error) {
      console.error(
        "pos journal store saved report scan failed:",
        storeKey,
        reportRowsResult.error.message,
      )
    }
    const journalFileCount = Number(fileCountResult.count ?? 0) || 0
    const months = new Set<string>()
    const storeCodes = new Set<string>(entry.storeCodes)
    for (const row of Array.isArray(monthRowsResult.data) ? monthRowsResult.data : []) {
      if (!isRecord(row)) continue
      const month = toSafeString(row.year_month).trim()
      if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) months.add(month)
      const code = toSafeString(row.store_code).trim()
      if (/^\d{4}$/.test(code)) storeCodes.add(code)
    }
    const reportRows = (Array.isArray(reportRowsResult.data) ? reportRowsResult.data : [])
      .filter((row): row is Record<string, unknown> => isRecord(row))
    for (const row of reportRows) {
      for (const month of savedReportMonths(row)) months.add(month)
    }
    // 件数は count で正確に、月の一覧は直近500件の走査で得る（保存件数が
    // 増えても一覧APIが重くならないようにするための上限）。
    const savedReportCount = Number(reportCountResult.count ?? 0) || reportRows.length
    if (!journalFileCount && !savedReportCount) continue
    const mapped = resolvePosJournalStoreByKey(storeKey)
    const monthList = Array.from(months).sort().reverse()
    stores.push({
      store_key: storeKey,
      store_name: entry.storeName || mapped?.storeName || storeKey,
      store_codes: Array.from(storeCodes).sort(),
      journal_file_count: journalFileCount,
      saved_report_count: savedReportCount,
      months: monthList,
      latest_month: monthList[0] ?? "",
    })
  }
  stores.sort((a, b) =>
    String(a.store_name).localeCompare(String(b.store_name), "ja")
  )
  return { ok: true, stores }
}

async function uploadPosJournalFiles(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  storeScope: string | null,
) {
  const contentLength = Number(req.headers.get("content-length") ?? "")
  const maxPayload =
    POS_JOURNAL_UPLOAD_MAX_BYTES * POS_JOURNAL_UPLOAD_MAX_FILES + 1024 * 1024
  if (Number.isFinite(contentLength) && contentLength > maxPayload) {
    throw {
      status: 400,
      message: "アップロード全体のサイズが大きすぎます。",
    } satisfies AppError
  }
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    throw {
      status: 400,
      message: "Upload request must be multipart/form-data.",
    } satisfies AppError
  }
  const fileValues = formData.getAll("files").filter((value): value is File =>
    value instanceof File
  )
  if (!fileValues.length) {
    const single = formData.get("file")
    if (single instanceof File) fileValues.push(single)
  }
  if (!fileValues.length) {
    throw {
      status: 400,
      message: "LZHファイルを選択してください。",
    } satisfies AppError
  }
  if (fileValues.length > POS_JOURNAL_UPLOAD_MAX_FILES) {
    throw {
      status: 400,
      message:
        `一度にアップロードできるのは${POS_JOURNAL_UPLOAD_MAX_FILES}件までです。`,
    } satisfies AppError
  }

  const requestedStore = toSafeString(formData.get("store_key"))
  const storeKey = storeScope || requestedStore
  if (!storeKey) {
    throw {
      status: 400,
      message: "店舗を選択してください。",
    } satisfies AppError
  }
  if (
    storeScope && requestedStore &&
    requestedStore.toLowerCase() !== storeScope.toLowerCase()
  ) {
    throw {
      status: 403,
      message: "他店舗のデータにはアクセスできません。",
    } satisfies AppError
  }
  const expectedMonthRaw = toSafeString(formData.get("month"))
  const expectedMonth = expectedMonthRaw
    ? normalizeYearMonth(expectedMonthRaw)
    : ""
  const successes: Record<string, unknown>[] = []
  const repaired: Record<string, unknown>[] = []
  const duplicates: Record<string, unknown>[] = []
  const failures: Record<string, unknown>[] = []
  const journalSelectCols =
    "id, store_partition_key, store_code, business_date, year_month, original_file_name, inner_file_name, file_size_bytes, sha256_hex, parsed_data, net_sales, tax_yen, gross_sales, groups_count, guests_count, receipts_count, storage_deleted_at, storage_delete_error, uploaded_at"

  for (const file of fileValues) {
    const originalFileName = sanitizeUploadFileName(file.name || "journal.lzh")
    let storagePath = ""
    try {
      if (extractFileExt(originalFileName) !== "lzh") {
        throw new Error("LZHファイルのみアップロードできます。")
      }
      if (!Number.isFinite(file.size) || file.size <= 0) {
        throw new Error("空のファイルはアップロードできません。")
      }
      if (file.size > POS_JOURNAL_UPLOAD_MAX_BYTES) {
        throw new Error(
          `1ファイルは${
            Math.floor(POS_JOURNAL_UPLOAD_MAX_BYTES / (1024 * 1024))
          }MB以下にしてください。`,
        )
      }
      const bytes = new Uint8Array(await file.arrayBuffer())
      const storeCode = detectPosJournalStoreCode(originalFileName)
      // コード内の定数を先に見て、無ければ pos_journal_store_codes を引く。
      // 店舗コードが判明した時点で insert するだけで使えるようにするため。
      const mappedStore = resolvePosJournalStore(storeCode) ??
        await lookupPosJournalStoreCode(supabase, storeCode)
      if (!mappedStore) {
        throw new Error(`未登録の店舗コードです: ${storeCode || "不明"}`)
      }
      if (mappedStore.storeKey.toLowerCase() !== storeKey.toLowerCase()) {
        throw new Error(
          `店舗コード${storeCode}は${mappedStore.storeName}です。選択店舗と一致しません。`,
        )
      }
      const day = parsePosJournalLzh(bytes, originalFileName)
      const businessDate = day.business_date
      if (expectedMonth && businessDate.slice(0, 7) !== expectedMonth) {
        throw new Error(
          `営業日${businessDate}は選択中の${expectedMonth}に含まれません。`,
        )
      }
      const hash = await sha256Hex(bytes)
      const { data: existingHash, error: existingHashError } = await supabase
        .from("pos_journal_files")
        .select(
          "id, business_date, original_file_name, receipts_count, gross_sales, parsed_data, storage_path, storage_bucket, sha256_hex",
        )
        .eq("store_partition_key", storeKey)
        .eq("sha256_hex", hash)
        .is("storage_deleted_at", null)
        .maybeSingle()
      if (existingHashError) {
        throw new Error(`重複確認に失敗しました: ${existingHashError.message}`)
      }
      if (existingHash) {
        // 同一ハッシュでもプレースホルダ、または旧parserなら解析結果を更新する。
        // 原本を再選択しただけで、旧版で欠落した支払区分も修復できる。
        if (
          isPosJournalPlaceholderRow(existingHash as Record<string, unknown>) ||
          isPosJournalStaleParserRow(existingHash as Record<string, unknown>) ||
          isPosJournalDetailMismatchRow(existingHash as Record<string, unknown>)
        ) {
          const repairTargetId = Number(existingHash.id)
          if (!Number.isInteger(repairTargetId) || repairTargetId <= 0) {
            throw new Error("修復対象の電子ジャーナルIDが不正です。")
          }
          const stored = await ensurePosJournalStorageForRepair(supabase, {
            storeKey,
            businessDate,
            hash,
            originalFileName,
            bytes,
            existingStoragePath: toSafeString(existingHash.storage_path),
            existingShaHex: toSafeString(existingHash.sha256_hex),
          })
          if (stored.previousPath || stored.storagePath !== toSafeString(existingHash.storage_path)) {
            storagePath = stored.storagePath
          }
          const repairPayload = buildPosJournalRepairPayload(day, originalFileName, {
            storage_bucket: POS_JOURNAL_BUCKET,
            storage_path: stored.storagePath,
            mime_type: "application/x-lzh-compressed",
            file_size_bytes: bytes.byteLength,
            sha256_hex: hash,
          })
          const { data: repairedRow, error: repairError } = await supabase
            .from("pos_journal_files")
            .update(repairPayload)
            .eq("id", repairTargetId)
            .eq("store_partition_key", storeKey)
            .select(journalSelectCols)
            .single()
          if (repairError) {
            if (storagePath) {
              await supabase.storage.from(POS_JOURNAL_BUCKET).remove([storagePath])
              storagePath = ""
            }
            throw new Error(`電子ジャーナル再解析の保存に失敗しました: ${repairError.message}`)
          }
          if (stored.previousPath) {
            try {
              await supabase.storage.from(POS_JOURNAL_BUCKET).remove([
                stored.previousPath,
              ])
            } catch (_) {
              // 旧パス削除はベストエフォート。DBは新パスを正とする。
            }
          }
          const normalizedRepair = posJournalFileRow(repairedRow)
          if (!normalizedRepair) throw new Error("修復した電子ジャーナル行が不正です。")
          repaired.push({ ...normalizedRepair, repaired: true })
          storagePath = ""
          continue
        }
        duplicates.push({
          original_file_name: originalFileName,
          id: Number(existingHash.id),
          business_date: String(existingHash.business_date ?? ""),
          reason: "同じ内容のファイルは既に保管されています。",
        })
        continue
      }
      const { data: existingDate, error: existingDateError } = await supabase
        .from("pos_journal_files")
        .select(
          "id, original_file_name, receipts_count, gross_sales, parsed_data, storage_path, storage_bucket, sha256_hex",
        )
        .eq("store_partition_key", storeKey)
        .eq("business_date", businessDate)
        .is("storage_deleted_at", null)
        .maybeSingle()
      if (existingDateError) {
        throw new Error(
          `営業日の重複確認に失敗しました: ${existingDateError.message}`,
        )
      }
      if (existingDate) {
        if (!isPosJournalPlaceholderRow(existingDate as Record<string, unknown>)) {
          throw new Error(
            `営業日${businessDate}は既に保管済みです。既存ファイルを削除してから再アップロードしてください。`,
          )
        }
        // プレースホルダ行: 解析・集計を上書き。ハッシュが変われば原本も差し替える。
        const repairTargetId = Number(existingDate.id)
        if (!Number.isInteger(repairTargetId) || repairTargetId <= 0) {
          throw new Error("修復対象の電子ジャーナルIDが不正です。")
        }
        const stored = await ensurePosJournalStorageForRepair(supabase, {
          storeKey,
          businessDate,
          hash,
          originalFileName,
          bytes,
          existingStoragePath: toSafeString(existingDate.storage_path),
          existingShaHex: toSafeString(existingDate.sha256_hex),
        })
        storagePath = stored.storagePath !== toSafeString(existingDate.storage_path)
          ? stored.storagePath
          : ""
        const repairPayload = buildPosJournalRepairPayload(day, originalFileName, {
          store_code: storeCode,
          year_month: businessDate.slice(0, 7),
          mime_type: "application/x-lzh-compressed",
          file_size_bytes: bytes.byteLength,
          sha256_hex: hash,
          storage_bucket: POS_JOURNAL_BUCKET,
          storage_path: stored.storagePath,
        })
        const { data: repairedRow, error: repairError } = await supabase
          .from("pos_journal_files")
          .update(repairPayload)
          .eq("id", repairTargetId)
          .eq("store_partition_key", storeKey)
          .select(journalSelectCols)
          .single()
        if (repairError) {
          if (storagePath) {
            await supabase.storage.from(POS_JOURNAL_BUCKET).remove([storagePath])
            storagePath = ""
          }
          throw new Error(`プレースホルダの修復に失敗しました: ${repairError.message}`)
        }
        if (stored.previousPath) {
          try {
            await supabase.storage.from(POS_JOURNAL_BUCKET).remove([
              stored.previousPath,
            ])
          } catch (_) {
            // 旧パス削除はベストエフォート。DBは新パスを正とする。
          }
        }
        const normalizedRepair = posJournalFileRow(repairedRow)
        if (!normalizedRepair) throw new Error("修復した電子ジャーナル行が不正です。")
        repaired.push({ ...normalizedRepair, repaired: true })
        storagePath = ""
        continue
      }
      storagePath = buildPosJournalStoragePath(
        storeKey,
        businessDate,
        hash,
        originalFileName,
      )
      const { error: uploadError } = await supabase.storage.from(
        POS_JOURNAL_BUCKET,
      ).upload(storagePath, bytes, {
        contentType: "application/x-lzh-compressed",
        upsert: false,
      })
      if (uploadError) {
        throw new Error(`原本の保存に失敗しました: ${uploadError.message}`)
      }
      const payload = {
        store_partition_key: storeKey,
        store_code: storeCode,
        business_date: businessDate,
        year_month: businessDate.slice(0, 7),
        original_file_name: originalFileName,
        inner_file_name: originalFileName.replace(/\.lzh$/i, ".jnl"),
        storage_bucket: POS_JOURNAL_BUCKET,
        storage_path: storagePath,
        mime_type: "application/x-lzh-compressed",
        file_size_bytes: bytes.byteLength,
        sha256_hex: hash,
        parsed_data: day,
        net_sales: Number(day.net_sales) || 0,
        tax_yen: Number(day.tax) || 0,
        gross_sales: Number(day.gross_sales) || 0,
        groups_count: Number(day.groups) || 0,
        guests_count: Number(day.guests) || 0,
        receipts_count: Array.isArray(day.receipts) ? day.receipts.length : 0,
      }
      const { data: inserted, error: insertError } = await supabase
        .from("pos_journal_files")
        .insert(payload)
        .select(journalSelectCols)
        .single()
      if (insertError) {
        await supabase.storage.from(POS_JOURNAL_BUCKET).remove([storagePath])
        storagePath = ""
        throw new Error(`解析結果の保存に失敗しました: ${insertError.message}`)
      }
      const normalized = posJournalFileRow(inserted)
      if (!normalized) throw new Error("保存した電子ジャーナル行が不正です。")
      successes.push(normalized)
      storagePath = ""
    } catch (error) {
      if (storagePath) {
        try {
          await supabase.storage.from(POS_JOURNAL_BUCKET).remove([storagePath])
        } catch (_) {
          // Best-effort rollback; the table insert is never committed on this path.
        }
      }
      failures.push({
        original_file_name: originalFileName,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  // 保存・修復成功分の年月を商品インデックスへ即反映（dirty トリガーのバックフィルも兼ねる）
  const indexedRows = [...successes, ...repaired]
  if (indexedRows.length) {
    const months = indexedRows.map((row) =>
      String(row.year_month || String(row.business_date || "").slice(0, 7))
    )
    await ensureJournalProductIndexMonths(supabase, storeKey, months)
  }
  const reportMonths = [...new Set(
    [...successes, ...repaired, ...duplicates]
      .map((row) =>
        String(
          row.year_month ||
            String(row.business_date || "").slice(0, 7),
        )
      )
      .filter((month) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month)),
  )].sort()
  let savedReports: PosJournalAutoReportResult = {
    ok: true,
    months: reportMonths,
    created_count: 0,
    updated_count: 0,
    report_count: 0,
    reports: [],
    failures: [],
  }
  if (reportMonths.length) {
    savedReports = await upsertPosJournalAutoReports(
      supabase,
      storeKey,
      reportMonths,
    )
  }
  return {
    ok: failures.length === 0 && savedReports.ok,
    uploaded_count: successes.length,
    repaired_count: repaired.length,
    duplicate_count: duplicates.length,
    failed_count: failures.length,
    uploaded: successes.map(({ parsed_data: _parsedData, ...row }) => row),
    repaired: repaired.map(({ parsed_data: _parsedData, ...row }) => row),
    duplicates,
    failures,
    saved_reports: savedReports,
  }
}

/**
 * Storageに保管済みのLZH原本を、小さな管理者バッチで現行parserへ更新する。
 * raw原本は変更せず、parsed_data更新後に同じ月の商品indexと保存月報を再生成する。
 */
async function reparseStoredPosJournalFiles(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  storeScope: string | null,
) {
  const requestedStore = toSafeString(body.store_key || body.store)
  const storeKey = normalizePosJournalStoreKey(storeScope || requestedStore)
  if (
    storeScope && requestedStore &&
    requestedStore.toLowerCase() !== storeScope.toLowerCase()
  ) {
    throw {
      status: 403,
      message: "他店舗のデータにはアクセスできません。",
    } satisfies AppError
  }
  const yearMonth = parseOptionalYearMonthParam(
    body.year_month || body.month,
    "year_month",
  )
  const afterId = toNonNegativeInteger(body.after_id)
  const requestedLimit = toNonNegativeInteger(body.limit) || 5
  const limit = Math.min(POS_JOURNAL_REPARSE_MAX_FILES, requestedLimit)
  const dryRun = body.dry_run === true || body.dry_run === "true"
  const force = body.force === true || body.force === "true"

  let query = supabase
    .from("pos_journal_files")
    .select(
      "id, store_partition_key, store_code, business_date, year_month, original_file_name, storage_bucket, storage_path, file_size_bytes, sha256_hex, parsed_data, gross_sales, groups_count, storage_deleted_at",
    )
    .eq("store_partition_key", storeKey)
    .is("storage_deleted_at", null)
    .gt("id", afterId)
    .order("id", { ascending: true })
    .limit(limit + 1)
  if (yearMonth) query = query.eq("year_month", yearMonth)
  const { data, error } = await query
  if (error) {
    throw {
      status: 500,
      message: `再解析対象の取得に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  const allRows = (Array.isArray(data) ? data : []).filter(isRecord)
  const rows = allRows.slice(0, limit)
  const reparsed: Array<{
    id: number
    business_date: string
    year_month: string
    detail_complete: boolean
    receipt_total: number
    gross_sales: number
  }> = []
  const skipped: Array<{ id: number; reason: string }> = []
  const failures: Array<{ id: number; error: string }> = []
  const changedMonths = new Set<string>()

  for (const row of rows) {
    const id = toNonNegativeInteger(row.id)
    if (!id) continue
    if (
      !force &&
      !isPosJournalStaleParserRow(row) &&
      !isPosJournalDetailMismatchRow(row)
    ) {
      skipped.push({ id, reason: "現行parserで日計照合済みです。" })
      continue
    }
    try {
      const storagePath = toSafeString(row.storage_path)
      if (!storagePath) throw new Error("Storage原本のパスがありません。")
      const bucket = toSafeString(row.storage_bucket) || POS_JOURNAL_BUCKET
      const { data: blob, error: downloadError } = await supabase.storage
        .from(bucket)
        .download(storagePath)
      if (downloadError || !blob) {
        throw new Error(
          `Storage原本の取得に失敗しました: ${downloadError?.message || "empty"}`,
        )
      }
      if (blob.size <= 0 || blob.size > POS_JOURNAL_UPLOAD_MAX_BYTES) {
        throw new Error("Storage原本のサイズが再解析上限外です。")
      }
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const expectedSha = toSafeString(row.sha256_hex)
      if (expectedSha && await sha256Hex(bytes) !== expectedSha) {
        throw new Error("Storage原本のハッシュがDB記録と一致しません。")
      }
      const originalFileName = sanitizeUploadFileName(
        toSafeString(row.original_file_name) || "journal.lzh",
      )
      const day = parsePosJournalLzh(bytes, originalFileName)
      const businessDate = toSafeString(row.business_date)
      if (day.business_date !== businessDate) {
        throw new Error(
          `原本の営業日${day.business_date}がDBの${businessDate}と一致しません。`,
        )
      }
      const month = businessDate.slice(0, 7)
      const detail = reconcileParsedJournalDayDetail(
        day,
        businessDate,
        month,
      )
      if (!detail) throw new Error("再解析した営業日データが不正です。")
      if (!dryRun) {
        // parsed_data更新より先にdirtyを確立し、更新後・再構築前の窓でも
        // 旧derived indexをlive検索が利用しないようにする。
        await markJournalProductIndexMonthDirty(supabase, storeKey, month)
        const payload = buildPosJournalRepairPayload(day, originalFileName)
        // 再解析は原本の再アップロードではないため、初回取込時刻は維持する。
        delete payload.uploaded_at
        const { error: updateError } = await supabase
          .from("pos_journal_files")
          .update(payload)
          .eq("id", id)
          .eq("store_partition_key", storeKey)
        if (updateError) {
          throw new Error(`再解析結果の保存に失敗しました: ${updateError.message}`)
        }
        changedMonths.add(month)
      }
      reparsed.push({
        id,
        business_date: businessDate,
        year_month: month,
        detail_complete: detail.detail_complete,
        receipt_total: detail.reconciled_receipt_total,
        gross_sales: detail.gross_sales,
      })
    } catch (caught) {
      failures.push({
        id,
        error: caught instanceof Error ? caught.message : String(caught),
      })
    }
  }

  const indexResults: Awaited<ReturnType<typeof rebuildJournalProductIndexMonth>>[] = []
  let savedReports: PosJournalAutoReportResult | null = null
  const pendingReparseMonths: string[] = []
  const safeRebuildMonths: string[] = []
  if (!dryRun && changedMonths.size) {
    for (const month of [...changedMonths].sort()) {
      await markJournalProductIndexMonthDirty(supabase, storeKey, month)
      const unsafeRowsRemain = await journalProductMonthHasUnsafeParserRows(
        supabase,
        storeKey,
        month,
      )
      if (unsafeRowsRemain) {
        pendingReparseMonths.push(month)
        continue
      }
      safeRebuildMonths.push(month)
      indexResults.push(
        await rebuildJournalProductIndexMonth(supabase, storeKey, month),
      )
    }
    if (safeRebuildMonths.length) {
      savedReports = await upsertPosJournalAutoReports(
        supabase,
        storeKey,
        safeRebuildMonths,
      )
    }
  }
  const lastId = rows.length
    ? toNonNegativeInteger(rows[rows.length - 1].id)
    : afterId
  const retryRequired = failures.length > 0
  return {
    ok: failures.length === 0 && (savedReports?.ok ?? true),
    store_key: storeKey,
    year_month: yearMonth,
    parser_version: POS_JOURNAL_REPORT_PARSER_VERSION,
    dry_run: dryRun,
    force,
    batch_limit: limit,
    scanned_count: rows.length,
    reparsed_count: reparsed.length,
    skipped_count: skipped.length,
    failed_count: failures.length,
    reparsed,
    skipped,
    failures,
    next_after_id: retryRequired ? afterId : lastId,
    retry_after_id: retryRequired ? afterId : null,
    has_more: retryRequired || allRows.length > limit,
    not_found: rows.length === 0 && afterId === 0,
    warning: rows.length === 0 && afterId === 0
      ? "指定条件に一致するStorage原本が見つかりませんでした。"
      : null,
    pending_reparse_months: pendingReparseMonths,
    safe_rebuild_months: safeRebuildMonths,
    rebuilt_index: indexResults,
    saved_reports: savedReports,
  }
}

async function fetchPosJournalDownloadUrl(
  supabase: ReturnType<typeof createClient>,
  url: URL,
) {
  const id = Number(url.searchParams.get("id"))
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: "id is required." } satisfies AppError
  }
  const storeKey = normalizePosJournalStoreKey(
    url.searchParams.get("store_key") || url.searchParams.get("store"),
  )
  const { data: row, error } = await supabase
    .from("pos_journal_files")
    .select(
      "id, store_partition_key, storage_bucket, storage_path, original_file_name",
    )
    .eq("id", id)
    .eq("store_partition_key", storeKey)
    .maybeSingle()
  if (error) {
    throw {
      status: 500,
      message: `電子ジャーナルの取得に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  if (!row) {
    throw {
      status: 404,
      message: "電子ジャーナルが見つかりません。",
    } satisfies AppError
  }
  const signedUrl = await createSignedMediaDownloadUrl(
    supabase,
    toSafeString(row.storage_bucket),
    toSafeString(row.storage_path),
    toSafeString(row.original_file_name) || "journal.lzh",
  )
  if (!signedUrl) {
    throw {
      status: 500,
      message: "ダウンロードURLを生成できませんでした。",
    } satisfies AppError
  }
  return { ok: true, id, signed_url: signedUrl }
}

async function resolvePosJournalAiStore(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  storeScope: string | null,
): Promise<
  { storeKey: string; storeName: string; storeCode: string; month: string }
> {
  const requestedStore = String(body.store_key ?? body.store ?? "").trim()
  const storeKey = storeScope || requestedStore
  if (!storeKey) {
    throw { status: 400, message: "store_key is required." } satisfies AppError
  }
  if (
    storeScope && requestedStore &&
    requestedStore.toLowerCase() !== storeScope.toLowerCase()
  ) {
    throw {
      status: 403,
      message: "他店舗のデータにはアクセスできません。",
    } satisfies AppError
  }
  // 電子ジャーナルAIは「レジ店舗コードが割り当て済みの店舗」だけを対象にする。
  // 旧実装はBistro CAVACAVA固定で、マルゴエスなど他店舗のAI分析・質問を必ず400にしていた。
  const mapped = resolvePosJournalStoreByKey(storeKey) ??
    await lookupPosJournalStoreCodeByKey(supabase, storeKey)
  if (!mapped) {
    throw {
      status: 400,
      message:
        "この店舗はレジ店舗コードが未登録のため、電子ジャーナルAI分析を利用できません。",
    } satisfies AppError
  }
  // AI分析履歴は store_code の4桁形式をDB側でも必須にしている。
  // 対応表が壊れている場合はDB制約違反ではなく、この時点で理由を返す。
  const storeCode = mapped.storeCodes.find((code) => /^\d{4}$/.test(code)) ?? ""
  if (!storeCode) {
    throw {
      status: 400,
      message:
        "この店舗のレジ店舗コードが不正です。管理者へ連絡してください。",
    } satisfies AppError
  }
  return {
    storeKey: mapped.storeKey,
    storeName: mapped.storeName,
    storeCode,
    month: normalizeYearMonth(body.month),
  }
}

async function recordPosJournalAiUsage(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
  usage: PosJournalAiUsage | null,
): Promise<void> {
  if (!usage) return
  try {
    const { error } = await supabase.from("ai_usage_events").insert({
      store_partition_key: storeKey,
      provider: usage.provider,
      model: usage.model,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      thinking_tokens: null,
      total_tokens: usage.totalTokens,
      line_message_id: null,
      surface: "pos_journal",
    })
    if (error) {
      console.error("pos journal ai_usage_events insert failed:", error.message)
    }
  } catch (error) {
    console.error(
      "pos journal ai_usage_events insert threw:",
      error instanceof Error ? error.message : String(error),
    )
  }
}

async function resolvePosJournalAiSummary(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  expected: { storeKey: string; storeName: string; storeCode: string; month: string },
) {
  const rows = await fetchPosJournalRows(supabase, expected.storeKey, expected.month)
  const storedDays = rows
    .map((row) =>
      isRecord(row.parsed_data) ? row.parsed_data as PosJournalDay : null
    )
    .filter((day): day is PosJournalDay =>
      day !== null && typeof day.business_date === "string" &&
      Array.isArray(day.receipts)
    )
  const shared = await fetchSharedJournalReportState(
    supabase,
    expected.storeKey,
    expected.month,
  )
  const combinedDays = await fillPosJournalDaysWeather(
    supabase,
    expected.storeKey,
    expected.month,
    mergePosJournalDaysPreferPrimary(storedDays, shared.days),
  )
  if (combinedDays.length) {
    const categoryOverrides = await fetchPosJournalCategoryOverrides(
      supabase,
      expected.storeKey,
    )
    return buildPosJournalSummary({
      storeKey: expected.storeKey,
      storeName: expected.storeName,
      storeCode: expected.storeCode,
      month: expected.month,
      days: combinedDays,
      fileCount: rows.length + shared.reportCount,
      categoryOverrides,
    })
  }
  return normalizePosJournalAiSummary(body.summary, expected)
}

type PosJournalAiHistoryListRow = {
  id: number
  store_key: string
  store_code: string
  month: string
  ai_generated: boolean
  provider: string | null
  model: string | null
  warning: string | null
  source_file_count: number
  source_day_count: number
  gross_sales: number
  guests_count: number
  average_spend: number
  created_at: string
}

function normalizePosJournalAiHistoryRow(
  value: unknown,
): PosJournalAiHistoryListRow | null {
  if (!isRecord(value)) return null
  const id = Number(value.id)
  const month = String(value.year_month ?? "").trim()
  if (!Number.isSafeInteger(id) || id <= 0 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return null
  }
  return {
    id,
    store_key: toSafeString(value.store_partition_key),
    store_code: toSafeString(value.store_code),
    month,
    ai_generated: value.ai_generated === true,
    provider: value.provider == null ? null : toSafeString(value.provider) || null,
    model: value.model == null ? null : toSafeString(value.model) || null,
    warning: value.warning == null ? null : String(value.warning).slice(0, 1000),
    source_file_count: toNonNegativeInteger(value.source_file_count),
    source_day_count: toNonNegativeInteger(value.source_day_count),
    gross_sales: toNonNegativeInteger(value.gross_sales),
    guests_count: toNonNegativeInteger(value.guests_count),
    average_spend: toNonNegativeInteger(value.average_spend),
    created_at: String(value.created_at ?? ""),
  }
}

async function savePosJournalAiAnalysis(
  supabase: ReturnType<typeof createClient>,
  expected: { storeKey: string; storeName: string; storeCode: string; month: string },
  summary: ReturnType<typeof buildPosJournalSummary>,
  facts: ReturnType<typeof buildPosJournalAiFacts>,
  result: Awaited<ReturnType<typeof generatePosJournalAiAnalysis>>,
): Promise<
  | { saved: true; item: PosJournalAiHistoryListRow }
  | { saved: false; error: string }
> {
  const analysisText = String(result.text ?? "").trim()
  if (!analysisText || !summary.days.length) {
    return { saved: false, error: "分析本文または分析対象データが空のため履歴を保存しませんでした。" }
  }
  try {
    const { data, error } = await supabase
      .from("pos_journal_ai_analyses")
      .insert({
        store_partition_key: expected.storeKey,
        store_code: expected.storeCode,
        year_month: expected.month,
        analysis_text: analysisText,
        ai_generated: result.aiGenerated,
        provider: result.aiGenerated ? "groq" : null,
        model: result.model,
        warning: result.warning,
        facts_snapshot: facts,
        source_file_count: toNonNegativeInteger(summary.meta.file_count),
        source_day_count: summary.days.length,
        gross_sales: toNonNegativeInteger(summary.totals.gross_sales),
        guests_count: toNonNegativeInteger(summary.totals.guests),
        average_spend: toNonNegativeInteger(summary.totals.avg_spend),
      })
      .select(
        "id, store_partition_key, store_code, year_month, ai_generated, provider, model, warning, source_file_count, source_day_count, gross_sales, guests_count, average_spend, created_at",
      )
      .single()
    if (error) return { saved: false, error: error.message }
    const item = normalizePosJournalAiHistoryRow(data)
    if (!item) return { saved: false, error: "保存したAI分析履歴の形式が不正です。" }
    return { saved: true, item }
  } catch (error) {
    return {
      saved: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function analyzePosJournalWithAi(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  storeScope: string | null,
) {
  const expected = await resolvePosJournalAiStore(supabase, body, storeScope)
  let summary
  try {
    summary = await resolvePosJournalAiSummary(supabase, body, expected)
  } catch (error) {
    throw {
      status: 400,
      message: error instanceof Error ? error.message : "分析データが不正です。",
    } satisfies AppError
  }
  if (!summary.days.length) {
    return {
      ok: true,
      analysis: null,
      ai_generated: false,
      model: null,
      warning: "分析対象の電子ジャーナルデータがありません。",
      facts: buildPosJournalAiFacts(summary),
    }
  }
  const facts = buildPosJournalAiFacts(summary)
  const result = await generatePosJournalAiAnalysis(
    facts,
    String(Deno.env.get("GROQ_API_KEY") ?? "").trim(),
  )
  await recordPosJournalAiUsage(supabase, expected.storeKey, result.usage)
  const history = await savePosJournalAiAnalysis(
    supabase,
    expected,
    summary,
    facts,
    result,
  )
  return {
    ok: true,
    analysis: result.text,
    ai_generated: result.aiGenerated,
    model: result.model,
    warning: result.warning,
    facts,
    history_saved: history.saved,
    history_item: history.saved ? history.item : null,
    history_error: history.saved ? null : history.error,
  }
}

async function askPosJournalAi(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  storeScope: string | null,
) {
  const expected = await resolvePosJournalAiStore(supabase, body, storeScope)
  let summary
  let question
  let history
  try {
    summary = await resolvePosJournalAiSummary(supabase, body, expected)
    question = normalizePosJournalAiQuestion(body.question)
    history = normalizePosJournalAiHistory(body.history)
  } catch (error) {
    throw {
      status: 400,
      message: error instanceof Error ? error.message : "質問データが不正です。",
    } satisfies AppError
  }
  if (!summary.days.length) {
    return {
      ok: true,
      answer: "分析対象の電子ジャーナルデータがありません。対象月を確認するか、LZHファイルをアップロードしてください。",
      ai_generated: false,
      model: null,
      warning: "データが空です。",
    }
  }
  const facts = buildPosJournalAiFacts(summary)
  const result = await answerPosJournalAiQuestion(
    facts,
    question,
    history,
    String(Deno.env.get("GROQ_API_KEY") ?? "").trim(),
  )
  await recordPosJournalAiUsage(supabase, expected.storeKey, result.usage)
  return {
    ok: true,
    answer: result.text,
    ai_generated: result.aiGenerated,
    model: result.model,
    warning: result.warning,
  }
}

function posJournalAiHistoryStoreAndMonth(
  url: URL,
): { storeKey: string; month: string } {
  return {
    storeKey: normalizePosJournalStoreKey(
      url.searchParams.get("store_key") || url.searchParams.get("store"),
    ),
    month: normalizeYearMonth(url.searchParams.get("month")),
  }
}

async function fetchPosJournalAiHistory(
  supabase: ReturnType<typeof createClient>,
  url: URL,
) {
  const { storeKey, month } = posJournalAiHistoryStoreAndMonth(url)
  const rawLimit = Number(url.searchParams.get("limit") ?? "50")
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(100, Math.trunc(rawLimit)))
    : 50
  const { data, error } = await supabase
    .from("pos_journal_ai_analyses")
    .select(
      "id, store_partition_key, store_code, year_month, ai_generated, provider, model, warning, source_file_count, source_day_count, gross_sales, guests_count, average_spend, created_at",
    )
    .eq("store_partition_key", storeKey)
    .eq("year_month", month)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit)
  if (error) {
    throw {
      status: 500,
      message: `AI分析履歴の取得に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  return {
    ok: true,
    store_key: storeKey,
    month,
    items: (Array.isArray(data) ? data : [])
      .map(normalizePosJournalAiHistoryRow)
      .filter((item): item is PosJournalAiHistoryListRow => item !== null),
  }
}

async function fetchPosJournalAiHistoryItem(
  supabase: ReturnType<typeof createClient>,
  url: URL,
) {
  const storeKey = normalizePosJournalStoreKey(
    url.searchParams.get("store_key") || url.searchParams.get("store"),
  )
  const id = Number(url.searchParams.get("id"))
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw { status: 400, message: "id is required." } satisfies AppError
  }
  const { data, error } = await supabase
    .from("pos_journal_ai_analyses")
    .select(
      "id, store_partition_key, store_code, year_month, analysis_text, ai_generated, provider, model, warning, facts_snapshot, source_file_count, source_day_count, gross_sales, guests_count, average_spend, created_at",
    )
    .eq("id", id)
    .eq("store_partition_key", storeKey)
    .maybeSingle()
  if (error) {
    throw {
      status: 500,
      message: `AI分析履歴の取得に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  if (!data) {
    throw { status: 404, message: "AI分析履歴が見つかりません。" } satisfies AppError
  }
  const item = normalizePosJournalAiHistoryRow(data)
  if (!item) {
    throw { status: 500, message: "AI分析履歴の形式が不正です。" } satisfies AppError
  }
  return {
    ok: true,
    item: {
      ...item,
      analysis_text: String(data.analysis_text ?? ""),
      facts_snapshot: isRecord(data.facts_snapshot)
        ? data.facts_snapshot
        : {},
    },
  }
}

async function deletePosJournalAiHistoryItem(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  storeScope: string | null,
) {
  if (String(body.confirmation ?? "") !== "delete") {
    throw {
      status: 400,
      message: "削除確認欄へ半角小文字で delete と入力してください。",
    } satisfies AppError
  }
  const id = Number(body.id)
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw { status: 400, message: "id is required." } satisfies AppError
  }
  const requestedStore = String(body.store_key ?? "").trim()
  const storeKey = storeScope || requestedStore
  if (!storeKey) {
    throw { status: 400, message: "store_key is required." } satisfies AppError
  }
  if (
    storeScope && requestedStore &&
    requestedStore.toLowerCase() !== storeScope.toLowerCase()
  ) {
    throw {
      status: 403,
      message: "他店舗のデータにはアクセスできません。",
    } satisfies AppError
  }
  const { data, error } = await supabase
    .from("pos_journal_ai_analyses")
    .delete()
    .eq("id", id)
    .eq("store_partition_key", storeKey)
    .select("id, year_month")
    .maybeSingle()
  if (error) {
    throw {
      status: 500,
      message: `AI分析履歴の削除に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  if (!data) {
    throw { status: 404, message: "AI分析履歴が見つかりません。" } satisfies AppError
  }
  return {
    ok: true,
    deleted: { id: Number(data.id), month: String(data.year_month ?? "") },
  }
}

// ===== jnl2txt.html 保存済みレポート (saved_reports) =====

type SavedReportListRow = {
  id: string
  title: string
  period: string
  created_at: string
  total?: number
  totalSales?: number
  foodTotal?: number
  drinkTotal?: number
  roomTotal?: number
  salesCount?: number
  totalCustomers?: number
  lunchTotal?: number
  dinnerTotal?: number
  lunchCustomers?: number
  dinnerCustomers?: number
  parserVersion?: string
  verificationVersion?: string
  categoryVersion?: string
  mealPeriodVersion?: string
}

function pickSavedReportListSummary(
  data: unknown,
): Partial<SavedReportListRow> {
  if (!isRecord(data)) return {}
  const out: Partial<SavedReportListRow> = {}
  const numKeys = [
    "total",
    "totalSales",
    "foodTotal",
    "drinkTotal",
    "roomTotal",
    "salesCount",
    "totalCustomers",
    "lunchTotal",
    "dinnerTotal",
    "lunchCustomers",
    "dinnerCustomers",
  ] as const
  for (const key of numKeys) {
    const n = Number(data[key])
    if (Number.isFinite(n)) out[key] = n
  }
  const strKeys = [
    "parserVersion",
    "verificationVersion",
    "categoryVersion",
    "mealPeriodVersion",
  ] as const
  for (const key of strKeys) {
    const v = toSafeString(data[key])
    if (v) out[key] = v
  }
  return out
}

function normalizeSavedReportListRow(value: unknown): SavedReportListRow | null {
  if (!isRecord(value)) return null
  const id = toSafeString(value.id)
  if (!id) return null
  const summary = pickSavedReportListSummary(value.data)
  return {
    id,
    title: toSafeString(value.title) || "売上レポート",
    period: toSafeString(value.period),
    created_at: String(value.created_at ?? ""),
    ...summary,
  }
}

/** クライアント（jnl2txt.html）と同じ「月間レポート」判定 */
function isMonthlyReportTitleForList(title: string): boolean {
  if (!title) return false
  if (/日別/.test(title)) return false
  return /月次|月別|月間|全体売上|合算売上レポート|\d{4}年\d{1,2}月/.test(title)
}

async function fetchSavedReportsList(
  supabase: ReturnType<typeof createClient>,
  url: URL,
) {
  const storeKey = normalizePosJournalStoreKey(
    url.searchParams.get("store_key") || url.searchParams.get("store"),
  )
  // kind=monthly|daily|all
  // AI分析・推移はカテゴリ分け済みの「月間」レポートを正本にする。
  // 日別+月間が混在すると created_at 降順の limit で古い月間が落ちるため、kind で絞り込めるようにする。
  const kindRaw = toSafeString(url.searchParams.get("kind")).toLowerCase()
  const kind = kindRaw === "monthly" || kindRaw === "daily" ? kindRaw : "all"
  const trash = url.searchParams.get("trash") === "true"
  const defaultLimit = kind === "monthly" ? 500 : 200
  const maxLimit = kind === "monthly" ? 2000 : 1000
  const rawLimit = Number(url.searchParams.get("limit") ?? String(defaultLimit))
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(maxLimit, Math.trunc(rawLimit)))
    : defaultLimit
  // kind は title で後段フィルタするため、limit 切り捨てで対象が欠けないよう多めに読む（行は軽量）
  const fetchLimit = kind === "all" ? limit : Math.min(5000, Math.max(limit * 4, 2000))

  // 伝票明細・HTML本文を含む data JSONB 全体は読まず、サマリー数値のみ JSON パス指定で取得する。
  // 保存件数が増えてもレスポンスが肥大せず、タイムアウトで AI がデータ参照不能になることを防ぐ。
  const summarySelect = [
    "id", "title", "period", "created_at", "deleted_at",
    "total:data->total",
    "totalSales:data->totalSales",
    "foodTotal:data->foodTotal",
    "drinkTotal:data->drinkTotal",
    "roomTotal:data->roomTotal",
    "otherTotal:data->otherTotal",
    "chargeTotal:data->chargeTotal",
    "lunchTotal:data->lunchTotal",
    "dinnerTotal:data->dinnerTotal",
    "lunchCustomers:data->lunchCustomers",
    "dinnerCustomers:data->dinnerCustomers",
    "lunchFoodTotal:data->lunchFoodTotal",
    "lunchDrinkTotal:data->lunchDrinkTotal",
    "dinnerFoodTotal:data->dinnerFoodTotal",
    "dinnerDrinkTotal:data->dinnerDrinkTotal",
    "totalCustomers:data->totalCustomers",
    "salesCount:data->salesCount",
    "topProducts:data->topProducts",
    "weekdayBreakdown:data->weekdayBreakdown",
    "hourlyBreakdown:data->hourlyBreakdown",
    "sourceMonths:data->sourceMonths",
    "parserVersion:data->parserVersion",
    "verificationVersion:data->verificationVersion",
    "categoryVersion:data->categoryVersion",
    "mealPeriodVersion:data->mealPeriodVersion",
  ].join(", ")

  let reportQuery = supabase
    .from("saved_reports")
    .select(summarySelect)
    .eq("store_partition_key", storeKey)
  reportQuery = trash
    ? reportQuery.not("deleted_at", "is", null)
    : reportQuery.is("deleted_at", null)
  const { data, error } = await reportQuery
    .order("created_at", { ascending: false })
    .limit(fetchLimit)
  if (error) {
    throw {
      status: 500,
      message: `保存済みレポートの取得に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  let items = (Array.isArray(data) ? data : []).map((row) => {
    const record: Record<string, unknown> = isRecord(row) ? row : {}
    // JSON パス選択で存在しないキーは null になる。null をそのまま返すと
    // クライアントが「売上 0 のサマリーあり」と誤認するため、値のあるキーだけ返す。
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(record)) {
      if (value !== null && value !== undefined) out[key] = value
    }
    out.id = toSafeString(record.id)
    out.title = toSafeString(record.title) || "売上レポート"
    out.period = toSafeString(record.period)
    out.created_at = String(record.created_at ?? "")
    return out
  }).filter((item) => !!item.id)
  if (kind === "monthly") {
    items = items.filter((item) => isMonthlyReportTitleForList(String(item.title ?? "")))
  } else if (kind === "daily") {
    items = items.filter((item) => !isMonthlyReportTitleForList(String(item.title ?? "")))
  }
  items = items.slice(0, limit)
  return {
    ok: true,
    store_key: storeKey,
    kind,
    trash,
    items,
  }
}

/** フル管理者向け: 店舗ごとの保存件数サマリー（店舗スコープでは拒否） */
async function fetchSavedReportsCrossStoreSummary(
  supabase: ReturnType<typeof createClient>,
  storeScope: string | null,
) {
  if (storeScope) {
    throw {
      status: 403,
      message: "店舗用ログインからは横断集計はできません。",
    } satisfies AppError
  }
  const { data, error } = await supabase
    .from("saved_reports")
    .select("store_partition_key")
    .is("deleted_at", null)
    .limit(20000)
  if (error) {
    throw {
      status: 500,
      message: `店舗横断サマリーの取得に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  const counts = new Map<string, number>()
  for (const row of Array.isArray(data) ? data : []) {
    const key = toSafeString((row as { store_partition_key?: unknown }).store_partition_key)
      .toLowerCase()
    if (!key) continue
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  const items = Array.from(counts.entries())
    .map(([store_key, report_count]) => ({ store_key, report_count }))
    .sort((a, b) => b.report_count - a.report_count || a.store_key.localeCompare(b.store_key))
  return { ok: true, items, total_reports: items.reduce((n, x) => n + x.report_count, 0) }
}

async function fetchSavedReportItem(
  supabase: ReturnType<typeof createClient>,
  url: URL,
) {
  const storeKey = normalizePosJournalStoreKey(
    url.searchParams.get("store_key") || url.searchParams.get("store"),
  )
  const id = toSafeString(url.searchParams.get("id"))
  if (!id) {
    throw { status: 400, message: "id is required." } satisfies AppError
  }
  const { data, error } = await supabase
    .from("saved_reports")
    .select("id, title, period, data, created_at, updated_at")
    .eq("id", id)
    .eq("store_partition_key", storeKey)
    .is("deleted_at", null)
    .maybeSingle()
  if (error) {
    throw {
      status: 500,
      message: `保存済みレポートの取得に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  if (!data) {
    throw { status: 404, message: "保存済みレポートが見つかりません。" } satisfies AppError
  }
  return { ok: true, item: data }
}

async function saveSavedReport(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  storeScope: string | null,
) {
  const requestedStore = toSafeString(body.store_key)
  const storeKey = storeScope || requestedStore
  if (!storeKey) {
    throw { status: 400, message: "store_key is required." } satisfies AppError
  }
  if (
    storeScope && requestedStore &&
    requestedStore.toLowerCase() !== storeScope.toLowerCase()
  ) {
    throw { status: 403, message: "他店舗のデータにはアクセスできません。" } satisfies AppError
  }
  if (!isRecord(body.data)) {
    throw { status: 400, message: "data is required." } satisfies AppError
  }
  const id = toSafeString(body.id) || `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
  // 表示用HTMLは Storage へ分離する。JSONB に巨大 body/previewHtml を同居させない。
  const sanitizedData = sanitizeSavedReportDataForStorage(body.data, id)
  const { data: existing, error: existingError } = await supabase
    .from("saved_reports")
    .select("id, store_partition_key")
    .eq("id", id)
    .maybeSingle()
  if (existingError) {
    throw {
      status: 500,
      message: `保存済みレポートの確認に失敗しました: ${existingError.message}`,
    } satisfies AppError
  }
  if (
    existing &&
    toSafeString(existing.store_partition_key).toLowerCase() !== storeKey.toLowerCase()
  ) {
    throw {
      status: 409,
      message: "同一IDが他店舗に存在するため保存できません。店舗ごとの独立IDを使ってください。",
    } satisfies AppError
  }
  const { error } = await supabase
    .from("saved_reports")
    .upsert({
      id,
      title: toSafeString(body.title) || "売上レポート",
      period: toSafeString(body.period),
      data: sanitizedData,
      store_partition_key: storeKey,
      deleted_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" })
  if (error) {
    throw {
      status: 500,
      message: `保存済みレポートの保存に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  // ジャーナルを正として過去売上へ同期する。店舗プロフィールで有効化した店舗のみ。
  // 同期の失敗でレポート保存自体を失敗させない（レポートは既に保存済み）。
  let salesSync: JournalSalesSyncResult | null = null
  try {
    salesSync = await syncJournalSalesFromReport(supabase, storeKey, sanitizedData)
  } catch (e) {
    console.error("journal sales sync failed:", storeKey, id, String(e))
  }
  return { ok: true, id, salesSync }
}

async function deleteSavedReportItem(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  storeScope: string | null,
) {
  if (String(body.confirmation ?? "") !== "delete") {
    throw {
      status: 400,
      message: "削除確認欄へ半角小文字で delete と入力してください。",
    } satisfies AppError
  }
  const id = toSafeString(body.id)
  if (!id) {
    throw { status: 400, message: "id is required." } satisfies AppError
  }
  const requestedStore = toSafeString(body.store_key)
  const storeKey = storeScope || requestedStore
  if (!storeKey) {
    throw { status: 400, message: "store_key is required." } satisfies AppError
  }
  if (
    storeScope && requestedStore &&
    requestedStore.toLowerCase() !== storeScope.toLowerCase()
  ) {
    throw { status: 403, message: "他店舗のデータにはアクセスできません。" } satisfies AppError
  }
  const { data, error } = await supabase
    .from("saved_reports")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("store_partition_key", storeKey)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle()
  if (error) {
    throw {
      status: 500,
      message: `保存済みレポートの削除に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  if (!data) {
    throw { status: 404, message: "保存済みレポートが見つかりません。" } satisfies AppError
  }
  return { ok: true, deleted: { id: String(data.id) } }
}

function buildSavedReportHtmlStoragePath(storeKey: string, reportId: string): string {
  const safeStore = storeKey.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "store"
  const safeId = reportId.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "report"
  return `${safeStore}/${safeId}.html`
}

function isDetailedSavedReportHtml(html: unknown): boolean {
  const s = String(html || "")
  return s.length > 400 && /day-section|月間サマリー|会計明細|ランチ・ディナー/.test(s)
}

/** JSONB から巨大表示HTMLを外し、短い preview / Storage パスだけ残す */
function sanitizeSavedReportDataForStorage(
  data: Record<string, unknown>,
  reportId: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data, id: toSafeString(data.id) || reportId }
  delete out.body
  const preview = out.previewHtml
  if (isDetailedSavedReportHtml(preview) || String(preview || "").length > 8000) {
    delete out.previewHtml
  }
  const path = toSafeString(out.htmlStoragePath)
  if (path) out.htmlStoragePath = path
  const htmlBytes = toNonNegativeInteger(out.htmlBytes)
  if (htmlBytes) out.htmlBytes = htmlBytes
  return out
}

async function uploadSavedReportHtml(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  storeScope: string | null,
) {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    throw {
      status: 400,
      message: "Upload request must be multipart/form-data.",
    } satisfies AppError
  }
  const file = formData.get("file")
  if (!(file instanceof File)) {
    throw { status: 400, message: "HTMLファイルを選択してください。" } satisfies AppError
  }
  if (file.size <= 0 || file.size > POS_REPORT_HTML_MAX_BYTES) {
    throw {
      status: 400,
      message: `HTMLサイズは1件${Math.floor(POS_REPORT_HTML_MAX_BYTES / 1024 / 1024)}MBまでです。`,
    } satisfies AppError
  }
  const requestedStore = toSafeString(formData.get("store_key"))
  const storeKey = storeScope || requestedStore
  if (!storeKey) {
    throw { status: 400, message: "store_key is required." } satisfies AppError
  }
  if (
    storeScope && requestedStore &&
    requestedStore.toLowerCase() !== storeScope.toLowerCase()
  ) {
    throw { status: 403, message: "他店舗のデータにはアクセスできません。" } satisfies AppError
  }
  const reportId = toSafeString(formData.get("report_id") || formData.get("id"))
  if (!reportId) {
    throw { status: 400, message: "report_id is required." } satisfies AppError
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const storagePath = buildSavedReportHtmlStoragePath(storeKey, reportId)
  // Storage の allowed_mime_types は exact match。charset 付きは 415 になる。
  const { error: uploadError } = await supabase.storage
    .from(POS_REPORT_HTML_BUCKET)
    .upload(storagePath, bytes, {
      contentType: "text/html",
      upsert: true,
    })
  if (uploadError) {
    throw {
      status: 500,
      message: `レポートHTMLの保存に失敗しました: ${uploadError.message}`,
    } satisfies AppError
  }
  return {
    ok: true,
    store_key: storeKey,
    report_id: reportId,
    storage_bucket: POS_REPORT_HTML_BUCKET,
    storage_path: storagePath,
    file_size_bytes: file.size,
  }
}

async function createSavedReportHtmlSignedUrl(
  supabase: ReturnType<typeof createClient>,
  url: URL,
) {
  const storeKey = normalizePosJournalStoreKey(
    url.searchParams.get("store_key") || url.searchParams.get("store"),
  )
  const id = toSafeString(url.searchParams.get("id") || url.searchParams.get("report_id"))
  if (!id) {
    throw { status: 400, message: "id is required." } satisfies AppError
  }
  const { data, error } = await supabase
    .from("saved_reports")
    .select("id, data")
    .eq("id", id)
    .eq("store_partition_key", storeKey)
    .is("deleted_at", null)
    .maybeSingle()
  if (error) {
    throw {
      status: 500,
      message: `保存済みレポートの取得に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  if (!data) {
    throw { status: 404, message: "保存済みレポートが見つかりません。" } satisfies AppError
  }
  const reportData = isRecord(data.data) ? data.data : {}
  const storagePath = toSafeString(reportData.htmlStoragePath) ||
    buildSavedReportHtmlStoragePath(storeKey, id)
  const signedUrl = await createSignedMediaUrl(
    supabase,
    POS_REPORT_HTML_BUCKET,
    storagePath,
  )
  if (!signedUrl) {
    throw { status: 404, message: "レポートHTMLが見つかりません。" } satisfies AppError
  }
  return {
    ok: true,
    id,
    storage_bucket: POS_REPORT_HTML_BUCKET,
    storage_path: storagePath,
    signed_url: signedUrl,
  }
}

/**
 * 既存 saved_reports の巨大 body/previewHtml を Storage へ退避し JSONB から外す。
 * 数値フィールドは触らない。id 指定 or limit 件のバッチ。
 */
async function offloadSavedReportHtml(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  storeScope: string | null,
) {
  const requestedStore = toSafeString(body.store_key)
  const storeKey = storeScope || requestedStore
  if (!storeKey) {
    throw { status: 400, message: "store_key is required." } satisfies AppError
  }
  if (
    storeScope && requestedStore &&
    requestedStore.toLowerCase() !== storeScope.toLowerCase()
  ) {
    throw { status: 403, message: "他店舗のデータにはアクセスできません。" } satisfies AppError
  }
  const singleId = toSafeString(body.id)
  const rawLimit = Number(body.limit ?? 30)
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, Math.trunc(rawLimit))) : 30

  let rows: Array<{ id: string; data: unknown }> = []
  if (singleId) {
    const { data, error } = await supabase
      .from("saved_reports")
      .select("id, data")
      .eq("id", singleId)
      .eq("store_partition_key", storeKey)
      .is("deleted_at", null)
      .maybeSingle()
    if (error) {
      throw {
        status: 500,
        message: `保存済みレポートの取得に失敗しました: ${error.message}`,
      } satisfies AppError
    }
    if (data) rows = [{ id: String(data.id), data: data.data }]
  } else {
    const { data, error } = await supabase
      .from("saved_reports")
      .select("id, data")
      .eq("store_partition_key", storeKey)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(Math.min(500, limit * 8))
    if (error) {
      throw {
        status: 500,
        message: `保存済みレポートの取得に失敗しました: ${error.message}`,
      } satisfies AppError
    }
    rows = (Array.isArray(data) ? data : []).map((row) => ({
      id: String((row as { id?: unknown }).id ?? ""),
      data: (row as { data?: unknown }).data,
    })).filter((row) => !!row.id)
  }

  let scanned = 0
  let offloaded = 0
  let skipped = 0
  let failed = 0
  const results: Array<Record<string, unknown>> = []

  for (const row of rows) {
    if (!singleId && offloaded >= limit) break
    scanned++
    const reportData = isRecord(row.data) ? { ...row.data } : null
    if (!reportData) {
      skipped++
      continue
    }
    const bodyHtml = String(reportData.body || "")
    const previewHtml = String(reportData.previewHtml || "")
    const candidate = isDetailedSavedReportHtml(bodyHtml)
      ? bodyHtml
      : (isDetailedSavedReportHtml(previewHtml) ? previewHtml : "")
    const existingPath = toSafeString(reportData.htmlStoragePath)
    // 既に Storage 分離済み（巨大HTMLなし）
    if (!candidate) {
      skipped++
      continue
    }
    if (new TextEncoder().encode(candidate).length > POS_REPORT_HTML_MAX_BYTES) {
      failed++
      results.push({ id: row.id, ok: false, error: "HTML too large" })
      continue
    }
    const storagePath = existingPath || buildSavedReportHtmlStoragePath(storeKey, row.id)
    const bytes = new TextEncoder().encode(candidate)
    const { error: uploadError } = await supabase.storage
      .from(POS_REPORT_HTML_BUCKET)
      .upload(storagePath, bytes, {
        contentType: "text/html",
        upsert: true,
      })
    if (uploadError) {
      failed++
      results.push({ id: row.id, ok: false, error: uploadError.message })
      continue
    }
    const nextData = sanitizeSavedReportDataForStorage({
      ...reportData,
      htmlStoragePath: storagePath,
      htmlBytes: bytes.length,
    }, row.id)
    const { error: updateError } = await supabase
      .from("saved_reports")
      .update({
        data: nextData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("store_partition_key", storeKey)
    if (updateError) {
      failed++
      results.push({ id: row.id, ok: false, error: updateError.message })
      continue
    }
    offloaded++
    results.push({
      id: row.id,
      ok: true,
      storage_path: storagePath,
      html_bytes: bytes.length,
    })
  }

  return {
    ok: failed === 0,
    store_key: storeKey,
    scanned,
    offloaded,
    skipped,
    failed,
    results: singleId || results.length <= 40 ? results : results.slice(0, 40),
  }
}

// ===== jnl2txt.html 売上予測スナップショット (sales_forecasts) =====

type SalesForecastListRow = {
  id: string
  title: string
  horizon_months: number
  forecasted_at: string
  method: string
  confidence: string
  created_at: string
  deleted_at?: string
  forecast_months: string[]
}

function normalizeSalesForecastListRow(value: unknown): SalesForecastListRow | null {
  if (!isRecord(value)) return null
  const id = toSafeString(value.id)
  if (!id) return null
  const forecasts = Array.isArray(value.forecasts) ? value.forecasts : []
  const forecastMonths = forecasts
    .map((row) => isRecord(row) ? toSafeString(row.month) : "")
    .filter(Boolean)
  return {
    id,
    title: toSafeString(value.title) || "売上予測",
    horizon_months: toNonNegativeInteger(value.horizon_months) || forecastMonths.length || 3,
    forecasted_at: String(value.forecasted_at ?? value.created_at ?? ""),
    method: toSafeString(value.method),
    confidence: toSafeString(value.confidence),
    created_at: String(value.created_at ?? ""),
    deleted_at: value.deleted_at == null ? undefined : String(value.deleted_at),
    forecast_months: forecastMonths,
  }
}

async function fetchSalesForecastsList(
  supabase: ReturnType<typeof createClient>,
  url: URL,
) {
  const storeKey = normalizePosJournalStoreKey(
    url.searchParams.get("store_key") || url.searchParams.get("store"),
  )
  const rawLimit = Number(url.searchParams.get("limit") ?? "100")
  const trash = url.searchParams.get("trash") === "true"
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(300, Math.trunc(rawLimit)))
    : 100
  let forecastQuery = supabase
    .from("sales_forecasts")
    .select(
      "id, title, horizon_months, forecasted_at, method, confidence, forecasts, created_at, deleted_at",
    )
    .eq("store_partition_key", storeKey)
  forecastQuery = trash
    ? forecastQuery.not("deleted_at", "is", null)
    : forecastQuery.is("deleted_at", null)
  const { data, error } = await forecastQuery
    .order("forecasted_at", { ascending: false })
    .limit(limit)
  if (error) {
    throw {
      status: 500,
      message: `売上予測履歴の取得に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  return {
    ok: true,
    store_key: storeKey,
    trash,
    items: (Array.isArray(data) ? data : [])
      .map(normalizeSalesForecastListRow)
      .filter((item): item is SalesForecastListRow => item !== null),
  }
}

async function fetchSalesForecastItem(
  supabase: ReturnType<typeof createClient>,
  url: URL,
) {
  const storeKey = normalizePosJournalStoreKey(
    url.searchParams.get("store_key") || url.searchParams.get("store"),
  )
  const id = toSafeString(url.searchParams.get("id"))
  if (!id) {
    throw { status: 400, message: "id is required." } satisfies AppError
  }
  const { data, error } = await supabase
    .from("sales_forecasts")
    .select(
      "id, title, horizon_months, forecasted_at, method, confidence, history_snapshot, forecasts, meta, created_at, updated_at",
    )
    .eq("id", id)
    .eq("store_partition_key", storeKey)
    .is("deleted_at", null)
    .maybeSingle()
  if (error) {
    throw {
      status: 500,
      message: `売上予測の取得に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  if (!data) {
    throw { status: 404, message: "売上予測が見つかりません。" } satisfies AppError
  }
  return { ok: true, item: data }
}

async function saveSalesForecast(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  storeScope: string | null,
) {
  const requestedStore = toSafeString(body.store_key)
  const storeKey = storeScope || requestedStore
  if (!storeKey) {
    throw { status: 400, message: "store_key is required." } satisfies AppError
  }
  if (
    storeScope && requestedStore &&
    requestedStore.toLowerCase() !== storeScope.toLowerCase()
  ) {
    throw { status: 403, message: "他店舗のデータにはアクセスできません。" } satisfies AppError
  }
  if (!Array.isArray(body.forecasts)) {
    throw { status: 400, message: "forecasts is required." } satisfies AppError
  }
  const id = toSafeString(body.id) || `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
  const horizon = toNonNegativeInteger(body.horizon_months) ||
    body.forecasts.length ||
    3
  const now = new Date().toISOString()
  const { error } = await supabase
    .from("sales_forecasts")
    .upsert({
      id,
      title: toSafeString(body.title) || "売上予測",
      horizon_months: horizon,
      forecasted_at: toSafeString(body.forecasted_at) || now,
      method: toSafeString(body.method),
      confidence: toSafeString(body.confidence),
      history_snapshot: Array.isArray(body.history_snapshot)
        ? body.history_snapshot
        : [],
      forecasts: body.forecasts,
      meta: isRecord(body.meta) ? body.meta : {},
      store_partition_key: storeKey,
      deleted_at: null,
      updated_at: now,
    }, { onConflict: "id" })
  if (error) {
    throw {
      status: 500,
      message: `売上予測の保存に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  return { ok: true, id }
}

async function deleteSalesForecastItem(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  storeScope: string | null,
) {
  if (String(body.confirmation ?? "") !== "delete") {
    throw {
      status: 400,
      message: "削除確認欄へ半角小文字で delete と入力してください。",
    } satisfies AppError
  }
  const id = toSafeString(body.id)
  if (!id) {
    throw { status: 400, message: "id is required." } satisfies AppError
  }
  const requestedStore = toSafeString(body.store_key)
  const storeKey = storeScope || requestedStore
  if (!storeKey) {
    throw { status: 400, message: "store_key is required." } satisfies AppError
  }
  if (
    storeScope && requestedStore &&
    requestedStore.toLowerCase() !== storeScope.toLowerCase()
  ) {
    throw { status: 403, message: "他店舗のデータにはアクセスできません。" } satisfies AppError
  }
  const { data, error } = await supabase
    .from("sales_forecasts")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("store_partition_key", storeKey)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle()
  if (error) {
    throw {
      status: 500,
      message: `売上予測の削除に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  if (!data) {
    throw { status: 404, message: "売上予測が見つかりません。" } satisfies AppError
  }
  return { ok: true, deleted: { id: String(data.id) } }
}

// ===== Journal Report 店舗営業情報 (store_operation_profiles) =====

const STORE_OPS_CALENDAR_KINDS = new Set([
  "施策",
  "イベント",
  "価格改定",
  "特別営業",
  "その他",
])
const STORE_OPS_CALENDAR_EVENTS_MAX = 100

function normalizeStoreOpsIsoDate(value: unknown): string {
  const s = toSafeString(value).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ""
}

function normalizeStoreOpsCalendarEvents(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return []
  const out: Array<Record<string, unknown>> = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (out.length >= STORE_OPS_CALENDAR_EVENTS_MAX) break
    if (!isRecord(item)) continue
    let start = normalizeStoreOpsIsoDate(item.start ?? item.period_start ?? item.from)
    let end = normalizeStoreOpsIsoDate(item.end ?? item.period_end ?? item.to)
    if (!start && end) start = end
    if (!end && start) end = start
    if (!start || !end) continue
    if (start > end) {
      const tmp = start
      start = end
      end = tmp
    }
    const title = toSafeString(item.title).slice(0, 120)
    if (!title) continue
    const kindRaw = toSafeString(item.kind ?? item.category)
    const kind = STORE_OPS_CALENDAR_KINDS.has(kindRaw) ? kindRaw : "その他"
    let id = toSafeString(item.id).slice(0, 64)
    if (!id || seen.has(id)) {
      id = `ev_${start.replace(/-/g, "")}_${out.length + 1}`
    }
    seen.add(id)
    out.push({
      id,
      title,
      kind,
      start,
      end,
      note: toSafeString(item.note ?? item.notes).slice(0, 500),
    })
  }
  out.sort((a, b) => {
    const as = String(a.start)
    const bs = String(b.start)
    if (as !== bs) return as < bs ? -1 : 1
    return String(a.title).localeCompare(String(b.title), "ja")
  })
  return out
}

/** ワイン提供量(ml)換算。ボトルは店舗差が小さいため 750 固定。グラス／デキャンタ／ペアリングは店舗設定。 */
function normalizeStoreOpsWineMl(raw: unknown): Record<string, number> {
  const src = isRecord(raw) ? raw : {}
  const clampMl = (value: unknown, fallback: number) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return fallback
    return Math.max(1, Math.min(5000, Math.round(n)))
  }
  return {
    glassMl: clampMl(src.glassMl ?? src.glass, 100),
    decanterMl: clampMl(src.decanterMl ?? src.decanter, 375),
    bottleMl: 750,
    pairingMl: clampMl(src.pairingMl ?? src.pairing, 300),
  }
}

function normalizeStoreOperationProfile(raw: unknown): Record<string, unknown> {
  const src = isRecord(raw) ? raw : {}
  const weekdays = new Set(["日", "月", "火", "水", "木", "金", "土"])
  const closed = Array.isArray(src.closedWeekdays)
    ? [...new Set(src.closedWeekdays.map((x) => toSafeString(x)).filter((d) => weekdays.has(d)))]
    : []
  const lunch = ["yes", "no", "limited"].includes(toSafeString(src.lunchOffered))
    ? toSafeString(src.lunchOffered)
    : "yes"
  const dinner = ["yes", "no", "limited"].includes(toSafeString(src.dinnerOffered))
    ? toSafeString(src.dinnerOffered)
    : "yes"
  const overflowOpen = weekdays.has(toSafeString(src.overflowOpenWeekday))
    ? toSafeString(src.overflowOpenWeekday)
    : "月"
  const thresholdRaw = Number(src.overflowThreshold)
  const overflowThreshold = Number.isFinite(thresholdRaw)
    ? Math.max(1, Math.min(20, Math.round(thresholdRaw)))
    : 8
  return {
    closedWeekdays: closed,
    overflowRule: src.overflowRule === true || src.overflowRule === "on" || src.overflowRule === "true",
    overflowThreshold,
    overflowOpenWeekday: overflowOpen,
    lunchOffered: lunch,
    dinnerOffered: dinner,
    specialOpenPolicy: toSafeString(src.specialOpenPolicy).slice(0, 2000),
    notes: toSafeString(src.notes).slice(0, 4000),
    // POSジャーナル → 過去売上の自動同期。未指定は OFF（明示 true のみ有効）
    journalSalesSync:
      src.journalSalesSync === true ||
      src.journalSalesSync === "on" ||
      src.journalSalesSync === "true",
    // 店舗情報カレンダー（施策・イベント等）。古いクライアント未送信時は save 側で既存を維持
    calendarEvents: normalizeStoreOpsCalendarEvents(src.calendarEvents ?? src.events),
    wineMl: normalizeStoreOpsWineMl(src.wineMl),
  }
}

async function fetchStoreOperationProfile(
  supabase: ReturnType<typeof createClient>,
  url: URL,
  _storeScope: string | null,
) {
  const storeKey = normalizePosJournalStoreKey(
    url.searchParams.get("store_key") || url.searchParams.get("store"),
  )
  const { data, error } = await supabase
    .from("store_operation_profiles")
    .select("store_partition_key, profile, updated_at")
    .eq("store_partition_key", storeKey)
    .maybeSingle()
  if (error) throw { status: 500, message: `店舗営業情報の取得に失敗しました: ${error.message}` } satisfies AppError
  return {
    ok: true,
    store_key: storeKey,
    profile: data?.profile && isRecord(data.profile) ? normalizeStoreOperationProfile(data.profile) : null,
    updated_at: data?.updated_at ?? null,
  }
}

async function saveStoreOperationProfile(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  _storeScope: string | null,
) {
  const storeKey = normalizePosJournalStoreKey(body.store_key ?? body.store)
  const rawProfile = isRecord(body.profile) ? body.profile : body
  const profile = normalizeStoreOperationProfile(rawProfile)
  const omitSync = !Object.prototype.hasOwnProperty.call(rawProfile, "journalSalesSync")
  const omitEvents = !Object.prototype.hasOwnProperty.call(rawProfile, "calendarEvents") &&
    !Object.prototype.hasOwnProperty.call(rawProfile, "events")
  const omitWineMl = !Object.prototype.hasOwnProperty.call(rawProfile, "wineMl")
  // 古いクライアントがキー未送信のとき、既存の同期ON／カレンダー／ワインml設定を誤って消さない
  if (omitSync || omitEvents || omitWineMl) {
    const { data: existing, error: existingError } = await supabase
      .from("store_operation_profiles")
      .select("profile")
      .eq("store_partition_key", storeKey)
      .maybeSingle()
    if (existingError) {
      throw {
        status: 500,
        message: `店舗営業情報の取得に失敗しました: ${existingError.message}`,
      } satisfies AppError
    }
    const existingProfile = isRecord(existing?.profile) ? existing.profile : null
    if (omitSync && existingProfile?.journalSalesSync === true) {
      profile.journalSalesSync = true
    }
    if (omitEvents && existingProfile) {
      profile.calendarEvents = normalizeStoreOpsCalendarEvents(
        existingProfile.calendarEvents ?? existingProfile.events,
      )
    }
    if (omitWineMl && existingProfile) {
      profile.wineMl = normalizeStoreOpsWineMl(existingProfile.wineMl)
    }
  }
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("store_operation_profiles")
    .upsert({
      store_partition_key: storeKey,
      profile,
      updated_at: now,
      updated_by: "journal-report",
    }, { onConflict: "store_partition_key" })
    .select("store_partition_key, profile, updated_at")
    .single()
  if (error) throw { status: 500, message: `店舗営業情報の保存に失敗しました: ${error.message}` } satisfies AppError
  return {
    ok: true,
    store_key: storeKey,
    profile: normalizeStoreOperationProfile(data.profile),
    updated_at: data.updated_at,
  }
}

// ===== Journal Report 店舗ナレッジ (store_knowledge_documents) =====
// 施策・メニュー等の資料を店舗ごとに登録し、AIチャット／AI分析の「文脈」として渡す。
// 数値の正本はあくまで saved_reports 由来の確定集計であり、ここは背景説明にのみ使う。

const STORE_KNOWLEDGE_BUCKET = "store-knowledge"
const STORE_KNOWLEDGE_MAX_FILE_BYTES = 20 * 1024 * 1024
const STORE_KNOWLEDGE_CATEGORIES = new Set<string>([
  "施策",
  "メニュー",
  "価格改定",
  "イベント",
  "マニュアル",
  "その他",
])
const STORE_KNOWLEDGE_SOURCE_TYPES = new Set<string>([
  "manual",
  "upload",
  "ai_insight",
  "line_post",
])
/** 画像OCR・LINE投稿分類に使う現行の Gemini モデル（先頭から順に試す）。
 *  gemini-2.0-flash は 2026-06-01 に停止済みなので再追加しない。 */
const STORE_KNOWLEDGE_GEMINI_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
]
/** Gemini 1回あたりの上限。応答が返らないモデルに引きずられて
 *  フォールバック先を試す時間が無くなるのを防ぐ。 */
const STORE_KNOWLEDGE_GEMINI_CALL_TIMEOUT_MS = 100_000
/** 全モデル合計の上限。Edge Function の実行時間上限より内側で必ず打ち切り、
 *  クライアントには「解析失敗」を正しいHTTPエラーとして返せるようにする。 */
const STORE_KNOWLEDGE_GEMINI_TOTAL_BUDGET_MS = 140_000
/** AIが詳細取得に使う一括APIの上限。フロントの選定上限と合わせる。 */
const STORE_KNOWLEDGE_BATCH_MAX_ITEMS = 20

/**
 * 店舗ナレッジの解析前検査。Officeファイルは圧縮サイズだけでなく、展開後サイズ・
 * 圧縮率・entry数・必須XML・パストラバーサルを検査してから展開する。
 * 古いバイナリ .xls は安全なZIP事前検査ができないため、.xlsxへ変換してもらう。
 */
async function validateStoreKnowledgePayloadSafety(
  kind: ReturnType<typeof classifyKnowledgeFile>,
  bytes: Uint8Array,
): Promise<string | null> {
  if (kind === "image") return null
  if (kind === "pdf") return await validateDocumentPayloadSafety(bytes, "application/pdf")
  if (kind === "document") return await validateDocumentPayloadSafety(bytes, DOCX_MIME_TYPE)
  if (kind === "spreadsheet") {
    if (!hasZipMagicHeader(bytes)) {
      return "Excelファイルは安全確認可能な .xlsx 形式で保存してください（旧 .xls は利用できません）。"
    }
    return await validateDocumentPayloadSafety(bytes, XLSX_MIME_TYPE)
  }
  if (kind === "text") return await validateDocumentPayloadSafety(bytes, "text/plain")
  return "対応していないファイル形式です。"
}

/**
 * 店舗ナレッジ専用の店舗キー正規化。
 *
 * POS 本体には既存データとの互換性のため大文字小文字を保持する経路があるが、
 * ナレッジは LINE / Web のどちらから登録しても同じパーティションへ入るよう小文字を正とする。
 */
function normalizeStoreKnowledgeStoreKey(value: unknown): string {
  const storeKey = normalizePosJournalStoreKey(value).toLowerCase()
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(storeKey)) {
    throw { status: 400, message: "店舗キーの形式が不正です。" } satisfies AppError
  }
  return storeKey
}

/** PostgreSQL ILIKE のワイルドカードを無効化し、店舗キーを完全一致として扱う。 */
function storeKnowledgeStoreKeyPattern(storeKey: string): string {
  return normalizeStoreKnowledgeStoreKey(storeKey).replace(/[\\%_]/g, "\\$&")
}

function resolveStoreKnowledgeStoreKey(
  requestedValue: unknown,
  storeScope: string | null,
): string {
  const requestedStore = toSafeString(requestedValue)
  if (
    storeScope && requestedStore &&
    requestedStore.toLowerCase() !== storeScope.toLowerCase()
  ) {
    throw { status: 403, message: "他店舗のデータにはアクセスできません。" } satisfies AppError
  }
  return normalizeStoreKnowledgeStoreKey(storeScope || requestedStore)
}

/**
 * 保存・署名・削除する Storage オブジェクトを当該店舗のディレクトリ配下に限定する。
 * 旧データの `marugoS/...` 等は読めるよう、prefix 比較だけは大文字小文字を区別しない。
 */
function normalizeStoreKnowledgeStoragePath(value: unknown, storeKey: string): string | null {
  const storagePath = toSafeString(value)
  if (!storagePath) return null
  const expectedPrefix = `${normalizeStoreKnowledgeStoreKey(storeKey)}/`
  if (!storagePath.toLowerCase().startsWith(expectedPrefix)) {
    throw {
      status: 400,
      message: "添付ファイルの保存先が選択店舗と一致しません。",
    } satisfies AppError
  }
  return storagePath
}

function normalizeStoreKnowledgeCategory(value: unknown): string {
  const category = toSafeString(value)
  return STORE_KNOWLEDGE_CATEGORIES.has(category) ? category : "その他"
}

/** 'YYYY-MM-DD' だけを受け付ける（空文字は null＝期間指定なし） */
function toNullableDate(value: unknown): string | null {
  const raw = toSafeString(value)
  if (!raw) return null
  const matched = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!matched) return null
  const iso = `${matched[1]}-${matched[2]}-${matched[3]}`
  const parsed = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? null : iso
}

/**
 * LINE #メモ の送信日時。
 * webhook の event.timestamp（ms）または ISO を受け取り、保存用 ISO と JST 暦日を返す。
 * 分析の期間照合は JST 日付を period_start/end に載せる（UTCずれで月がずれないように）。
 */
function resolveLineKnowledgePostedAt(body: Record<string, unknown>): {
  iso: string
  jstDate: string
} | null {
  const fromIso = toSafeString(body.posted_at || body.sent_at)
  let ms = NaN
  if (fromIso) {
    ms = Date.parse(fromIso)
  }
  if (!Number.isFinite(ms)) {
    const rawTs = body.line_timestamp ?? body.timestamp ?? body.event_timestamp
    const n = typeof rawTs === "number" ? rawTs : Number(toSafeString(rawTs))
    if (Number.isFinite(n) && n > 0) {
      // LINE は通常ミリ秒。秒しか来ない場合は 10^12 未満なので補正する。
      ms = n < 1e12 ? n * 1000 : n
    }
  }
  if (!Number.isFinite(ms) || ms <= 0) return null
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return null
  const jstDate = toJstDateKeyFromIso(date.toISOString())
  if (!jstDate) return null
  return { iso: date.toISOString(), jstDate }
}

function normalizeStoreKnowledgeTags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : toSafeString(value).split(/[,、\s]+/)
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    const tag = toSafeString(item).slice(0, 40)
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    out.push(tag)
    if (out.length >= 20) break
  }
  return out
}

/** 検索用テキスト。タイトル・概要・本文・タグを小文字へ寄せて連結する */
function buildStoreKnowledgeSearchText(parts: {
  title: string
  summary: string
  bodyText: string
  tags: string[]
}): string {
  return [parts.title, parts.summary, parts.bodyText, parts.tags.join(" ")]
    .join(" ")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20000)
}

async function fetchStoreKnowledgeList(
  supabase: ReturnType<typeof createClient>,
  url: URL,
) {
  const storeKey = normalizeStoreKnowledgeStoreKey(
    url.searchParams.get("store_key") || url.searchParams.get("store"),
  )
  const rawLimit = Number(url.searchParams.get("limit") ?? "200")
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(500, Math.trunc(rawLimit)))
    : 200
  const rawOffset = Number(url.searchParams.get("offset") ?? "0")
  const offset = Number.isFinite(rawOffset)
    ? Math.max(0, Math.min(100_000, Math.trunc(rawOffset)))
    : 0
  const category = toSafeString(url.searchParams.get("category"))
  const keyword = toSafeString(url.searchParams.get("q"))
  const activeParam = toSafeString(url.searchParams.get("active"))
  let query = supabase
    .from("store_knowledge_documents")
    .select(
      "id, category, title, summary, period_start, period_end, tags, storage_path, original_file_name, mime_type, file_size_bytes, source_type, is_active, created_by, created_at, updated_at",
    )
    // 旧 mixed-case 行も読めるよう、完全一致の大文字小文字だけを緩和する。
    .ilike("store_partition_key", storeKnowledgeStoreKeyPattern(storeKey))
  if (activeParam === "true") query = query.eq("is_active", true)
  if (activeParam === "false") query = query.eq("is_active", false)
  if (category && STORE_KNOWLEDGE_CATEGORIES.has(category)) {
    query = query.eq("category", category)
  }
  if (keyword) {
    // search_text は NFKC+小文字で保存しているため、検索語も同じ形へ寄せる
    const needle = keyword.normalize("NFKC").toLowerCase().replace(/[%_,]/g, " ").trim()
    if (needle) query = query.ilike("search_text", `%${needle}%`)
  }
  const { data, error } = await query
    .order("period_start", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) {
    throw {
      status: 500,
      message: `店舗ナレッジの取得に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  const items = (Array.isArray(data) ? data : []).map((row) => {
    const record: Record<string, unknown> = isRecord(row) ? row : {}
    return { ...record, has_attachment: !!toSafeString(record.storage_path) }
  })
  return {
    ok: true,
    store_key: storeKey,
    items,
    offset,
    limit,
    has_more: items.length === limit,
  }
}

async function fetchStoreKnowledgeItem(
  supabase: ReturnType<typeof createClient>,
  url: URL,
) {
  const storeKey = normalizeStoreKnowledgeStoreKey(
    url.searchParams.get("store_key") || url.searchParams.get("store"),
  )
  const id = toSafeString(url.searchParams.get("id"))
  if (!id) {
    throw { status: 400, message: "id is required." } satisfies AppError
  }
  const { data, error } = await supabase
    .from("store_knowledge_documents")
    .select("*")
    .eq("id", id)
    .ilike("store_partition_key", storeKnowledgeStoreKeyPattern(storeKey))
    .maybeSingle()
  if (error) {
    throw {
      status: 500,
      message: `店舗ナレッジの取得に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  if (!data) {
    throw { status: 404, message: "資料が見つかりません。" } satisfies AppError
  }
  // RAG チャンク一覧（画面の「RAG表示」モーダル・エクスポートで使用）
  const { data: chunks, error: chunksError } = await supabase
    .from("store_knowledge_chunks")
    .select("id, chunk_index, chunk_text, token_count")
    .eq("document_id", id)
    .ilike("store_partition_key", storeKnowledgeStoreKeyPattern(storeKey))
    .order("chunk_index", { ascending: true })
  if (chunksError) {
    throw {
      status: 500,
      message: `資料チャンクの取得に失敗しました: ${chunksError.message}`,
    } satisfies AppError
  }
  const item = {
    ...(isRecord(data) ? data : {}),
    has_attachment: !!toSafeString((data as Record<string, unknown>).storage_path),
    chunks: Array.isArray(chunks) ? chunks : [],
  }
  return { ok: true, item }
}

/** AI用: 選定済み資料（最大20件）の本文とRAGチャンクを1往復で取得する。 */
async function fetchStoreKnowledgeItems(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  storeScope: string | null,
) {
  const storeKey = resolveStoreKnowledgeStoreKey(body.store_key || body.store, storeScope)
  const rawIds = Array.isArray(body.ids) ? body.ids : []
  const ids: number[] = []
  const seen = new Set<number>()
  for (const raw of rawIds) {
    const id = toNonNegativeInteger(raw)
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
    if (ids.length >= STORE_KNOWLEDGE_BATCH_MAX_ITEMS) break
  }
  if (!ids.length) {
    throw { status: 400, message: "ids is required." } satisfies AppError
  }

  const { data: documents, error: documentsError } = await supabase
    .from("store_knowledge_documents")
    .select("*")
    .ilike("store_partition_key", storeKnowledgeStoreKeyPattern(storeKey))
    .in("id", ids)
  if (documentsError) {
    throw {
      status: 500,
      message: `店舗ナレッジの一括取得に失敗しました: ${documentsError.message}`,
    } satisfies AppError
  }

  const { data: chunks, error: chunksError } = await supabase
    .from("store_knowledge_chunks")
    .select("id, document_id, chunk_index, chunk_text, token_count")
    .ilike("store_partition_key", storeKnowledgeStoreKeyPattern(storeKey))
    .in("document_id", ids)
    .order("document_id", { ascending: true })
    .order("chunk_index", { ascending: true })
  if (chunksError) {
    throw {
      status: 500,
      message: `資料チャンクの一括取得に失敗しました: ${chunksError.message}`,
    } satisfies AppError
  }

  const chunksByDocument = new Map<number, unknown[]>()
  for (const row of Array.isArray(chunks) ? chunks : []) {
    const record: Record<string, unknown> = isRecord(row) ? row : {}
    const documentId = toNonNegativeInteger(record.document_id)
    if (!documentId) continue
    const rows = chunksByDocument.get(documentId) || []
    rows.push(record)
    chunksByDocument.set(documentId, rows)
  }
  const documentsById = new Map<number, Record<string, unknown>>()
  for (const row of Array.isArray(documents) ? documents : []) {
    const record: Record<string, unknown> = isRecord(row) ? row : {}
    const id = toNonNegativeInteger(record.id)
    if (id) documentsById.set(id, record)
  }
  const items = ids.flatMap((id) => {
    const record = documentsById.get(id)
    if (!record) return []
    return [{
      ...record,
      has_attachment: !!toSafeString(record.storage_path),
      chunks: chunksByDocument.get(id) || [],
    }]
  })
  return {
    ok: true,
    store_key: storeKey,
    items,
    missing_ids: ids.filter((id) => !documentsById.has(id)),
  }
}

async function saveStoreKnowledge(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  storeScope: string | null,
  trustedProvenance = false,
) {
  const requestedStore = toSafeString(body.store_key)
  if (
    storeScope && requestedStore &&
    requestedStore.toLowerCase() !== storeScope.toLowerCase()
  ) {
    throw { status: 403, message: "他店舗のデータにはアクセスできません。" } satisfies AppError
  }
  const storeKey = normalizeStoreKnowledgeStoreKey(storeScope || requestedStore)
  const id = toNonNegativeInteger(body.id)
  let existing: Record<string, unknown> | null = null
  if (id) {
    const { data, error } = await supabase
      .from("store_knowledge_documents")
      .select(
        "id, storage_bucket, storage_path, original_file_name, mime_type, file_size_bytes, sha256_hex, source_type, is_active, created_by",
      )
      .eq("id", id)
      .ilike("store_partition_key", storeKnowledgeStoreKeyPattern(storeKey))
      .maybeSingle()
    if (error) {
      throw {
        status: 500,
        message: `更新対象の資料取得に失敗しました: ${error.message}`,
      } satisfies AppError
    }
    if (!data) {
      throw { status: 404, message: "資料が見つかりません。" } satisfies AppError
    }
    existing = isRecord(data) ? data : {}
  }
  const title = toSafeString(body.title).slice(0, 200)
  if (!title) {
    throw { status: 400, message: "タイトルを入力してください。" } satisfies AppError
  }
  const summary = toSafeString(body.summary).slice(0, 2000)
  const bodyText = toSafeString(body.body_text).slice(0, 60000)
  if (!summary && !bodyText) {
    throw {
      status: 400,
      message: "概要または内容のどちらかを入力してください（AIが読む本文になります）。",
    } satisfies AppError
  }
  const postedAt = resolveLineKnowledgePostedAt(body)
  let periodStart = toNullableDate(body.period_start)
  let periodEnd = toNullableDate(body.period_end)
  const requestedSource = trustedProvenance && STORE_KNOWLEDGE_SOURCE_TYPES.has(toSafeString(body.source_type))
    ? toSafeString(body.source_type)
    : ""
  const storagePathWasProvided = Object.prototype.hasOwnProperty.call(body, "storage_path")
  const existingStoragePath = id
    ? normalizeStoreKnowledgeStoragePath(existing?.storage_path, storeKey)
    : null
  const storagePath = id && !storagePathWasProvided
    ? existingStoragePath
    : normalizeStoreKnowledgeStoragePath(body.storage_path, storeKey)
  const sourceType = requestedSource || (id && !trustedProvenance
    ? toSafeString(existing?.source_type) || (storagePath ? "upload" : "manual")
    : id && !storagePathWasProvided
    ? toSafeString(existing?.source_type) || (storagePath ? "upload" : "manual")
    : storagePath
    ? "upload"
    : "manual")
  // LINE #メモ は送信日を実施期間に載せて分析の時間軸をずらさない（未指定時のみ）。
  if (sourceType === "line_post" && postedAt) {
    if (!periodStart) periodStart = postedAt.jstDate
    if (!periodEnd) periodEnd = postedAt.jstDate
  }
  if (periodStart && periodEnd && periodStart > periodEnd) {
    throw {
      status: 400,
      message: "開始日が終了日より後になっています。",
    } satisfies AppError
  }
  const tags = normalizeStoreKnowledgeTags(body.tags)
  const now = new Date().toISOString()
  const preserveAttachmentMetadata = !!id && !storagePathWasProvided
  const originalFileName = preserveAttachmentMetadata
    ? toSafeString(existing?.original_file_name).slice(0, 300) || null
    : toSafeString(body.original_file_name).slice(0, 300) || null
  const mimeType = preserveAttachmentMetadata
    ? toSafeString(existing?.mime_type).slice(0, 200) || null
    : toSafeString(body.mime_type).slice(0, 200) || null
  const fileSizeBytes = preserveAttachmentMetadata
    ? toNonNegativeInteger(existing?.file_size_bytes) || null
    : toNonNegativeInteger(body.file_size_bytes) || null
  const rawSha256 = preserveAttachmentMetadata
    ? toSafeString(existing?.sha256_hex).toLowerCase()
    : toSafeString(body.sha256_hex).toLowerCase()
  const createdBy = id
    ? toSafeString(existing?.created_by).slice(0, 120)
    : trustedProvenance
    ? toSafeString(body.created_by).slice(0, 120)
    : ""
  // 更新時の有効/無効は常に既存値を保持する。現行UIは編集保存時にも
  // is_active:true を送るため、ここで受けると無効化済み資料が意図せず復活する。
  const isActive = id
    ? existing?.is_active !== false
    : body.is_active === undefined
    ? true
    : !!body.is_active
  const payload: Record<string, unknown> = {
    store_partition_key: storeKey,
    category: normalizeStoreKnowledgeCategory(body.category),
    title,
    summary,
    body_text: bodyText,
    search_text: buildStoreKnowledgeSearchText({ title, summary, bodyText, tags }),
    period_start: periodStart,
    period_end: periodEnd,
    tags,
    storage_bucket: STORE_KNOWLEDGE_BUCKET,
    storage_path: storagePath,
    original_file_name: storagePath ? originalFileName : null,
    mime_type: storagePath ? mimeType : null,
    file_size_bytes: storagePath ? fileSizeBytes : null,
    sha256_hex: storagePath && /^[0-9a-f]{64}$/.test(rawSha256) ? rawSha256 : null,
    source_type: sourceType,
    is_active: isActive,
    created_by: createdBy,
    updated_at: now,
  }
  if (id) {
    const { data, error } = await supabase
      .from("store_knowledge_documents")
      .update(payload)
      .eq("id", id)
      .ilike("store_partition_key", storeKnowledgeStoreKeyPattern(storeKey))
      .select("id")
      .maybeSingle()
    if (error) {
      throw {
        status: 500,
        message: `資料の更新に失敗しました: ${error.message}`,
      } satisfies AppError
    }
    if (!data) {
      throw { status: 404, message: "資料が見つかりません。" } satisfies AppError
    }
    const chunksCreated = await rebuildStoreKnowledgeChunks(
      supabase,
      Number(data.id),
      storeKey,
      summary,
      bodyText,
    )
    // 添付を差し替えた場合だけ旧原本をbest-effortで回収する。未選択更新では既存添付を保持する。
    if (storagePathWasProvided && existingStoragePath && existingStoragePath !== storagePath) {
      const { error: removeError } = await supabase.storage
        .from(STORE_KNOWLEDGE_BUCKET)
        .remove([existingStoragePath])
      if (removeError) {
        console.warn("replaced knowledge attachment cleanup failed:", removeError.message)
      }
    }
    return { ok: true, id: Number(data.id), updated: true, chunks_created: chunksCreated }
  }
  const createdAt = postedAt?.iso || now
  const { data, error } = await supabase
    .from("store_knowledge_documents")
    .insert({ ...payload, created_at: createdAt })
    .select("id")
    .maybeSingle()
  if (error) {
    throw {
      status: 500,
      message: `資料の保存に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  const newId = Number(data?.id ?? 0)
  const chunksCreated = newId
    ? await rebuildStoreKnowledgeChunks(supabase, newId, storeKey, summary, bodyText)
    : 0
  return { ok: true, id: newId, updated: false, chunks_created: chunksCreated }
}

async function deleteStoreKnowledgeItem(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  storeScope: string | null,
) {
  const id = toNonNegativeInteger(body.id)
  if (!id) {
    throw { status: 400, message: "id is required." } satisfies AppError
  }
  const requestedStore = toSafeString(body.store_key)
  if (
    storeScope && requestedStore &&
    requestedStore.toLowerCase() !== storeScope.toLowerCase()
  ) {
    throw { status: 403, message: "他店舗のデータにはアクセスできません。" } satisfies AppError
  }
  const storeKey = normalizeStoreKnowledgeStoreKey(storeScope || requestedStore)
  // 既定は論理削除。終了した施策も「去年の同月は何をしていたか」の回答に必要なため残す。
  const purge = body.purge === true && String(body.confirmation ?? "") === "delete"
  if (!purge) {
    const { data, error } = await supabase
      .from("store_knowledge_documents")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .ilike("store_partition_key", storeKnowledgeStoreKeyPattern(storeKey))
      .select("id")
      .maybeSingle()
    if (error) {
      throw {
        status: 500,
        message: `資料の無効化に失敗しました: ${error.message}`,
      } satisfies AppError
    }
    if (!data) {
      throw { status: 404, message: "資料が見つかりません。" } satisfies AppError
    }
    return { ok: true, deactivated: { id: Number(data.id) } }
  }
  // 物理削除の前に Storage path を検証する。削除後に不正pathを検出してDBだけ消える状態を作らない。
  const { data: existing, error: existingError } = await supabase
    .from("store_knowledge_documents")
    .select("id, storage_path")
    .eq("id", id)
    .ilike("store_partition_key", storeKnowledgeStoreKeyPattern(storeKey))
    .maybeSingle()
  if (existingError) {
    throw {
      status: 500,
      message: `資料の削除前確認に失敗しました: ${existingError.message}`,
    } satisfies AppError
  }
  if (!existing) {
    throw { status: 404, message: "資料が見つかりません。" } satisfies AppError
  }
  const storagePath = normalizeStoreKnowledgeStoragePath(existing.storage_path, storeKey)

  const { data, error } = await supabase
    .from("store_knowledge_documents")
    .delete()
    .eq("id", id)
    .ilike("store_partition_key", storeKnowledgeStoreKeyPattern(storeKey))
    .select("id")
    .maybeSingle()
  if (error) {
    throw {
      status: 500,
      message: `資料の削除に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  if (!data) {
    throw { status: 404, message: "資料が見つかりません。" } satisfies AppError
  }
  if (storagePath) {
    try {
      const { error: removeError } = await supabase.storage
        .from(STORE_KNOWLEDGE_BUCKET)
        .remove([storagePath])
      if (removeError) {
        console.error("store-knowledge storage remove failed:", removeError.message)
      }
    } catch (removeError) {
      console.error("store-knowledge storage remove failed:", removeError)
    }
  }
  return { ok: true, deleted: { id: Number(data.id) } }
}

async function uploadStoreKnowledgeFile(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  storeScope: string | null,
) {
  const contentLength = Number(req.headers.get("content-length") ?? "")
  if (
    Number.isFinite(contentLength) &&
    contentLength > STORE_KNOWLEDGE_MAX_FILE_BYTES + 1024 * 1024
  ) {
    throw { status: 413, message: "アップロード容量が上限を超えています。" } satisfies AppError
  }
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    throw {
      status: 400,
      message: "Upload request must be multipart/form-data.",
    } satisfies AppError
  }
  const file = formData.get("file")
  if (!(file instanceof File)) {
    throw { status: 400, message: "ファイルを選択してください。" } satisfies AppError
  }
  if (file.size <= 0 || file.size > STORE_KNOWLEDGE_MAX_FILE_BYTES) {
    throw {
      status: 400,
      message: `ファイルサイズは1件${Math.floor(STORE_KNOWLEDGE_MAX_FILE_BYTES / 1024 / 1024)}MBまでです。`,
    } satisfies AppError
  }
  const kind = classifyKnowledgeFile(file.name || "", file.type || "")
  if (kind === "unsupported") {
    throw {
      status: 400,
      message: "対応していないファイル形式です。画像・PDF・Excel（.xlsx）・Word・テキストをご利用ください。",
    } satisfies AppError
  }
  const requestedStore = toSafeString(formData.get("store_key"))
  if (
    storeScope && requestedStore &&
    requestedStore.toLowerCase() !== storeScope.toLowerCase()
  ) {
    throw { status: 403, message: "他店舗のデータにはアクセスできません。" } satisfies AppError
  }
  const storeKey = normalizeStoreKnowledgeStoreKey(storeScope || requestedStore)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const safetyError = await validateStoreKnowledgePayloadSafety(kind, bytes)
  if (safetyError) {
    throw { status: 400, message: safetyError } satisfies AppError
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  const sha256Hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  const safeName = (file.name || "attachment")
    .replace(/[^\w.\-]+/g, "_")
    .slice(-80)
  const storagePath = `${storeKey}/${sha256Hex.slice(0, 12)}_${Date.now()}_${safeName}`
  const { error: uploadError } = await supabase.storage
    .from(STORE_KNOWLEDGE_BUCKET)
    .upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    })
  if (uploadError) {
    throw {
      status: 500,
      message: `ファイルの保存に失敗しました: ${uploadError.message}`,
    } satisfies AppError
  }
  return {
    ok: true,
    store_key: storeKey,
    storage_bucket: STORE_KNOWLEDGE_BUCKET,
    storage_path: storagePath,
    original_file_name: file.name || safeName,
    mime_type: file.type || "application/octet-stream",
    file_size_bytes: file.size,
    sha256_hex: sha256Hex,
  }
}

async function createStoreKnowledgeDownloadUrl(
  supabase: ReturnType<typeof createClient>,
  url: URL,
) {
  const storeKey = normalizeStoreKnowledgeStoreKey(
    url.searchParams.get("store_key") || url.searchParams.get("store"),
  )
  const id = toSafeString(url.searchParams.get("id"))
  if (!id) {
    throw { status: 400, message: "id is required." } satisfies AppError
  }
  const { data, error } = await supabase
    .from("store_knowledge_documents")
    .select("storage_bucket, storage_path, original_file_name")
    .eq("id", id)
    .ilike("store_partition_key", storeKnowledgeStoreKeyPattern(storeKey))
    .maybeSingle()
  if (error) {
    throw {
      status: 500,
      message: `資料の取得に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  if (!data || !toSafeString(data.storage_path)) {
    throw { status: 404, message: "添付ファイルがありません。" } satisfies AppError
  }
  const storagePath = normalizeStoreKnowledgeStoragePath(data.storage_path, storeKey)
  if (!storagePath) {
    throw { status: 404, message: "添付ファイルがありません。" } satisfies AppError
  }
  const signedUrl = await createSignedMediaUrl(
    supabase,
    toSafeString(data.storage_bucket) || STORE_KNOWLEDGE_BUCKET,
    storagePath,
  )
  if (!signedUrl) {
    throw {
      status: 500,
      message: "ダウンロードURLの発行に失敗しました。",
    } satisfies AppError
  }
  return {
    ok: true,
    url: signedUrl,
    original_file_name: toSafeString(data.original_file_name),
  }
}

// ===== 店舗ナレッジ フェーズ2・3（RAGチャンク / Gemini画像解析 / LINE #メモ / 効果測定） =====

/** チャンク検索用テキスト（NFKC・小文字） */
function normalizeKnowledgeSearchText(text: string): string {
  return text.normalize("NFKC").toLowerCase()
}

/** テキストを RAG 用のチャンク配列に自動分割する（約1,500文字単位・200文字オーバーラップ）。
 * 段落 → 改行 → 句点 の優先順で自然な文章境界で切る。 */
function splitTextIntoChunks(fullText: string, chunkSize = 1500, overlap = 200): string[] {
  const text = fullText.trim()
  if (!text) return []
  if (text.length <= chunkSize) return [text]
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    let end = start + chunkSize
    if (end < text.length) {
      const paragraphBreak = text.lastIndexOf("\n\n", end)
      const lineBreak = text.lastIndexOf("\n", end)
      const sentenceBreak = text.lastIndexOf("。", end)
      const bestBreak = Math.max(
        paragraphBreak > start + 500 ? paragraphBreak : -1,
        lineBreak > start + 500 ? lineBreak : -1,
        sentenceBreak > start + 500 ? sentenceBreak : -1,
      )
      if (bestBreak > start + 300) end = bestBreak + 1
    } else {
      end = text.length
    }
    const chunk = text.substring(start, end).trim()
    if (chunk) chunks.push(chunk)
    start = end - overlap
    if (start >= text.length - overlap) break
  }
  return chunks
}

/** 資料のRAGチャンクを作り直す（既存削除→再挿入）。失敗しても資料本体の保存は成立させる。 */
async function rebuildStoreKnowledgeChunks(
  supabase: ReturnType<typeof createClient>,
  documentId: number,
  storeKey: string,
  summary: string,
  bodyText: string,
): Promise<number> {
  const fullText = [summary, bodyText].filter(Boolean).join("\n\n")
  const chunkTexts = splitTextIntoChunks(fullText)
  try {
    await supabase
      .from("store_knowledge_chunks")
      .delete()
      .eq("document_id", documentId)
      .ilike("store_partition_key", storeKnowledgeStoreKeyPattern(storeKey))
    if (chunkTexts.length > 0) {
      const records = chunkTexts.map((text, idx) => ({
        document_id: documentId,
        store_partition_key: storeKey,
        chunk_index: idx,
        chunk_text: text,
        search_text: normalizeKnowledgeSearchText(text),
        token_count: text.length,
      }))
      const { error } = await supabase.from("store_knowledge_chunks").insert(records)
      if (error) {
        console.error("store_knowledge_chunks insert failed:", error)
        return 0
      }
    }
    return chunkTexts.length
  } catch (e) {
    console.error("rebuildStoreKnowledgeChunks failed:", e)
    return 0
  }
}

function knowledgeUint8ToBase64(bytes: Uint8Array): string {
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** ブラウザが空欄・octet-stream・誤ったMIMEを送っても、拡張子からGemini対応MIMEへ正規化する。 */
function normalizeStoreKnowledgeUploadMime(fileName: string, declaredMime: string): string {
  const name = String(fileName || "").toLowerCase()
  const declared = String(declaredMime || "").toLowerCase().split(";", 1)[0].trim()
  const byExtension: Array<[RegExp, string]> = [
    [/\.heic$/, "image/heic"],
    [/\.heif$/, "image/heif"],
    [/\.png$/, "image/png"],
    [/\.jpe?g$/, "image/jpeg"],
    [/\.webp$/, "image/webp"],
    [/\.gif$/, "image/gif"],
    [/\.pdf$/, "application/pdf"],
  ]
  for (const [pattern, mime] of byExtension) {
    if (pattern.test(name)) return mime
  }
  if (declared && declared !== "application/octet-stream") return declared
  return "application/octet-stream"
}

/** Gemini generateContent をモデルフォールバック付きで呼び、テキストを返す（失敗時は空文字） */
async function callKnowledgeGemini(
  parts: Array<Record<string, unknown>>,
  options: {
    deadlineAt?: number
    maxOutputTokens?: number
    responseMimeType?: string
    responseSchema?: Record<string, unknown>
  } = {},
): Promise<string> {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? ""
  if (!geminiApiKey) return ""
  const generationConfig: Record<string, unknown> = { temperature: 0.2 }
  if (Number(options.maxOutputTokens) > 0) {
    generationConfig.maxOutputTokens = Math.min(16_384, Math.floor(Number(options.maxOutputTokens)))
  }
  if (options.responseMimeType) generationConfig.responseMimeType = options.responseMimeType
  if (options.responseSchema) generationConfig.responseSchema = options.responseSchema
  const payload = {
    contents: [{ role: "user", parts }],
    generationConfig,
  }
  const startedAt = Date.now()
  const deadlineAt = Number(options.deadlineAt) > startedAt
    ? Number(options.deadlineAt)
    : startedAt + STORE_KNOWLEDGE_GEMINI_TOTAL_BUDGET_MS
  for (const model of STORE_KNOWLEDGE_GEMINI_MODELS) {
    const elapsed = Date.now() - startedAt
    const remainingMs = Math.min(
      STORE_KNOWLEDGE_GEMINI_CALL_TIMEOUT_MS,
      STORE_KNOWLEDGE_GEMINI_TOTAL_BUDGET_MS - elapsed,
      deadlineAt - Date.now(),
    )
    if (remainingMs <= 0) {
      console.warn("Gemini fallback budget exhausted; stopping model retries")
      break
    }
    try {
      const endpoint =
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiApiKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(remainingMs),
      })
      const responseText = await res.text()
      let resJson: Record<string, any> = {}
      try {
        const parsed = JSON.parse(responseText)
        if (isRecord(parsed)) resJson = parsed
      } catch {
        // HTML等の非JSON応答も、本文を外部へ返さず下の診断ログだけに留める。
      }
      if (res.ok) {
        const text = String(
          resJson?.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
        )
        if (text) return text
        const finishReason = toSafeString(resJson?.candidates?.[0]?.finishReason).slice(0, 80)
        const blockReason = toSafeString(resJson?.promptFeedback?.blockReason).slice(0, 80)
        console.warn(
          `[knowledge-gemini] empty response model=${model} finish=${finishReason || "none"} block=${blockReason || "none"}`,
        )
      } else {
        const reason = toSafeString(resJson?.error?.message || resJson?.error?.status || responseText)
          .replace(/\s+/g, " ").slice(0, 280)
        console.warn(`[knowledge-gemini] model=${model} status=${res.status} reason=${reason || "unknown"}`)
      }
    } catch (e) {
      console.warn(`Gemini model ${model} error:`, e)
    }
  }
  return ""
}

/** GeminiのJSON回答（```json ... ``` 含む）をオブジェクトへ */
/**
 * `body_text` が取れなかったときに本文として使うテキストを組み立てる。
 *
 * 以前は Gemini の生応答をそのまま本文へ入れていたため、JSON が返ってきて
 * `body_text` キーだけ欠けている場合に ```json … ``` のコードフェンスごと
 * 本文に保存されてしまい、資料タブでもAIへの受け渡しでも読みにくかった。
 *
 * - JSON として解釈できた場合: 取れた項目を「見出し: 値」の行に組み直す
 * - 解釈できない場合: コードフェンスだけ落とした素のテキストにする
 */
function buildKnowledgeBodyFallback(
  geminiText: string,
  parsed: Record<string, unknown> | null,
): string {
  if (parsed) {
    const lines: string[] = []
    const push = (label: string, value: unknown) => {
      const s = toSafeString(value).trim()
      if (s) lines.push(`${label}: ${s}`)
    }
    push("タイトル", parsed.title)
    push("カテゴリ", parsed.category)
    push("要約", parsed.summary)
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.map((t) => toSafeString(t).trim()).filter(Boolean)
      : []
    if (tags.length > 0) lines.push(`タグ: ${tags.join(", ")}`)
    if (lines.length > 0) return lines.join("\n")
  }
  return String(geminiText ?? "")
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim()
}

function parseGeminiJson(text: string): Record<string, unknown> | null {
  try {
    const matched = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    const raw = (matched ? matched[1] : text).trim()
    const parsed = JSON.parse(raw)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** 現行Geminiモデルによる画像・PDF等のマルチモーダル解析（DBには書かない読み取り専用） */
async function analyzeStoreKnowledgeImage(req: Request, storeScope: string | null) {
  if (!(Deno.env.get("GEMINI_API_KEY") ?? "")) {
    throw {
      status: 500,
      message: "GEMINI_API_KEY is not configured",
    } satisfies AppError
  }
  const contentLength = Number(req.headers.get("content-length") ?? "")
  if (
    Number.isFinite(contentLength) &&
    contentLength > STORE_KNOWLEDGE_MAX_FILE_BYTES + 1024 * 1024
  ) {
    throw { status: 413, message: "アップロード容量が上限を超えています。" } satisfies AppError
  }
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    throw {
      status: 400,
      message: "Upload request must be multipart/form-data.",
    } satisfies AppError
  }
  const file = formData.get("file")
  if (!(file instanceof File)) {
    throw { status: 400, message: "画像ファイルを選択してください。" } satisfies AppError
  }
  if (file.size <= 0 || file.size > STORE_KNOWLEDGE_MAX_FILE_BYTES) {
    throw {
      status: 400,
      message: `ファイルサイズは1件${Math.floor(STORE_KNOWLEDGE_MAX_FILE_BYTES / 1024 / 1024)}MBまでです。`,
    } satisfies AppError
  }
  // 店舗専用プロンプトは、認証済み店舗スコープと一致するキーだけで選ぶ。
  // クライアントが他店舗の専用規約を任意に有効化することはできない。
  const storeKey = resolveStoreKnowledgeStoreKey(formData.get("store_key"), storeScope)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const mimeType = normalizeStoreKnowledgeUploadMime(file.name || "", file.type || "")
  const categoryHint = normalizeStoreKnowledgeCategory(formData.get("category_hint"))
  const titleHint = toSafeString(formData.get("title_hint")).trim().slice(0, 200)
  const kind = classifyKnowledgeFile(file.name || "", mimeType)
  if (kind === "unsupported") {
    throw {
      status: 400,
      message: "対応していないファイル形式です。画像・PDF・Excel（.xlsx）・Word・テキストをご利用ください。",
    } satisfies AppError
  }
  const safetyError = await validateStoreKnowledgePayloadSafety(kind, bytes)
  if (safetyError) {
    throw { status: 400, message: safetyError } satisfies AppError
  }

  // Excel / Word / テキスト / PDF はサーバ側でテキスト化してから text パートとして渡す。
  // PDF を Gemini に丸ごと読ませると、ページ数が多いとき全文の文字起こしが出力上限に
  // 当たって body_text が空で返る。埋め込みテキストがあるならそちらを正とする。
  // 画像と、文字を持たないスキャンPDFだけ inlineData で Gemini に読ませる。
  const extractedText = kind === "image" ? "" : await extractKnowledgeText(kind, bytes)
  const inlineKinds = kind === "image" || (kind === "pdf" && isBlankExtract(extractedText))
  if (!inlineKinds && isBlankExtract(extractedText)) {
    throw {
      status: 422,
      message: "ファイルから文字を取り出せませんでした。内容をご確認ください。",
    } satisfies AppError
  }

  const sourceLabel = kind === "pdf"
    ? "PDF"
    : kind === "spreadsheet"
    ? "Excel表"
    : kind === "document"
    ? "Word文書"
    : kind === "text"
    ? "テキスト"
    : "画像"
  const responseSchema = {
    type: "object",
    properties: {
      title: { type: "string", description: "資料の表示タイトル" },
      category: {
        type: "string",
        enum: ["施策", "メニュー", "価格改定", "イベント", "マニュアル", "その他"],
      },
      summary: { type: "string", description: "資料全体の簡潔な要約" },
      menu_items: {
        type: "array",
        description: "画像内のメニュー商品を1商品1要素で全件列挙した一覧",
        items: {
          type: "object",
          properties: {
            section: { type: "string", description: "SPARKLING、WHITE、RED、DESSERT等の区分" },
            name: { type: "string", description: "生産者・銘柄・品種を含む商品名" },
            price: {
              type: "string",
              description: "Glass 950円 / Decanter 4,500円 / Bottle 6,000円の形式。容量は含めない",
            },
            description: { type: "string", description: "説明文、産地、味わい、容量など価格以外の情報" },
          },
          required: ["section", "name", "price", "description"],
        },
      },
      body_text: { type: "string", description: "見出し、商品名、説明、価格を含む全文文字起こし" },
      extraction_notes: { type: "string", description: "判読不能・価格対応不明箇所。問題なければ空文字" },
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["title", "category", "summary", "menu_items", "body_text", "extraction_notes", "tags"],
  }
  const commonPromptBlock = buildKnowledgeCommonPromptBlock({
    sourceLabel,
    categoryHint,
    titleHint,
  })
  const storePromptBlock = buildStoreKnowledgeSpecializedPromptBlock(storeKey)
  const outputPromptBlock = `【共通・出力フォーマット】
以下のJSONオブジェクトだけを出力してください。説明文やMarkdownのコードフェンスは付けません。

{
  "title": "ドキュメント・メニューのタイトル（例: 7月夏限定メニュー、価格改定のお知らせなど）",
  "category": "施策 / メニュー / 価格改定 / イベント / マニュアル / その他 から最も適切なものを1つ選択",
  "summary": "AIが最初に参照するための1〜3行の簡潔な要約",
  "menu_items": [
    { "section": "紅茶 / コーヒー等の区分", "name": "商品名", "price": "900円 / 1,000円等、画像どおりの価格表記", "description": "サイズ・温冷・原材料・補足" }
  ],
  "body_text": "${sourceLabel}から読み取った全文。見出し・メニュー名・価格・説明・注意事項を省略しない",
  "extraction_notes": "判読できない箇所、価格の適用範囲が不明な箇所。問題なければ空文字",
  "tags": ["関連タグ1", "関連タグ2", "関連タグ3"]
}`
  const promptText = [
    commonPromptBlock,
    KNOWLEDGE_MENU_EXTRACTION_PROMPT_BLOCK,
    storePromptBlock,
    outputPromptBlock,
  ].filter(Boolean).join("\n\n")
  const contentPart = inlineKinds
    ? { inlineData: { mimeType, data: knowledgeUint8ToBase64(bytes) } }
    : { text: `【${sourceLabel}「${file.name || "資料"}」の内容】\n${extractedText}` }
  const deadlineAt = Date.now() + STORE_KNOWLEDGE_GEMINI_TOTAL_BUDGET_MS
  const geminiText = await callKnowledgeGemini([
    { text: promptText },
    contentPart,
  ], {
    deadlineAt,
    maxOutputTokens: 8192,
    responseMimeType: "application/json",
    responseSchema,
  })
  if (!geminiText) {
    throw {
      status: 502,
      message: `${sourceLabel}のAI解析に失敗しました。しばらくして再試行してください。`,
    } satisfies AppError
  }
  const buildResult = (text: string) => {
    const parsed = parseGeminiJson(text)
    const fallbackBody = inlineKinds
      ? buildKnowledgeBodyFallback(text, parsed)
      : (extractedText || buildKnowledgeBodyFallback(text, parsed))
    const rawCategory = toSafeString(parsed?.category)
    const category = /メニュー/.test(rawCategory)
      ? "メニュー"
      : parsed
      ? normalizeStoreKnowledgeCategory(rawCategory)
      : categoryHint
    const menuItems = normalizeKnowledgeMenuItems(parsed?.menu_items)
    const parsedBody = toSafeString(parsed?.body_text)
    const transcription = (!inlineKinds && extractedText.length > parsedBody.length)
      ? extractedText
      : (parsedBody || fallbackBody)
    const bodyText = category === "メニュー"
      ? buildStructuredKnowledgeMenuBody(menuItems, transcription, parsed?.extraction_notes)
      : transcription
    const quality = assessKnowledgeMenuQuality({
      category,
      menuItems,
      bodyText,
      requireStructuredItems: inlineKinds,
    })
    return {
      title: toSafeString(parsed?.title) || titleHint ||
        (file.name || "資料").replace(/\.[^/.]+$/, ""),
      category,
      summary: toSafeString(parsed?.summary) || `${sourceLabel}からテキストを抽出しました。`,
      body_text: bodyText,
      tags: Array.isArray(parsed?.tags) ? parsed.tags : [`${sourceLabel}解析`, category],
      menu_items: menuItems,
      menu_item_count: quality.menu_item_count,
      priced_item_count: quality.priced_item_count,
      unpriced_item_count: quality.unpriced_item_count,
      needs_review: quality.needs_review,
      warnings: quality.warnings,
      _quality: quality,
    }
  }

  let result = buildResult(geminiText)
  // メニュー画像を概要だけで返した場合は、成功扱いにせず残り時間内で一度だけ
  // 全商品・価格の読み直しを行う。再解析も不足なら needs_review を返し、画面側で警告する。
  if (inlineKinds && result.category === "メニュー" && result.needs_review && Date.now() < deadlineAt) {
    const retryPrompt = `前回の解析はメニュー資料として不十分でした。画像全体を左上から右下へセル単位でもう一度確認してください。
要約ではなく、判読できる全メニュー名と価格を menu_items に1商品ずつ列挙し、body_text に全文を文字起こししてください。
ワイン表では生産者・銘柄・品種と、Glass / Decanter / Bottleの各金額を分離してください。裸数字の金額には円を補い、50ml・375ml等の容量は価格にしません。
全商品のpriceが埋まったか件数を照合し、読めない箇所だけを推測せず extraction_notes に記録してください。
出力は最初に指定したJSONオブジェクトだけにしてください。`
    const retriedText = await callKnowledgeGemini([
      { text: `${promptText}\n\n【再解析指示】\n${retryPrompt}` },
      contentPart,
    ], {
      deadlineAt,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseSchema,
    })
    if (retriedText) {
      const retried = buildResult(retriedText)
      if (scoreKnowledgeMenuExtraction(retried._quality) > scoreKnowledgeMenuExtraction(result._quality)) {
        result = retried
      }
    }
  }
  const { _quality: _discardedQuality, ...publicResult } = result
  return { ok: true, success: true, result: publicResult }
}

/** LINE #メモ / #日報 / #note 投稿の全自動識別・分類・保存（RAGチャンク付き）。
 * タグ無し投稿はAIを呼ばず即スルー（コスト0円）。 */
async function processLinePostKnowledge(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  storeScope: string | null,
) {
  const storeKey = resolveStoreKnowledgeStoreKey(
    body.store_key || body.store_partition_key,
    storeScope,
  )
  const rawText = toSafeString(body.text)
  if (!rawText) {
    throw { status: 400, message: "store_key and text are required." } satisfies AppError
  }
  const senderName = toSafeString(body.sender_name).slice(0, 120) || "LINEスタッフ"
  const postedAt = resolveLineKnowledgePostedAt(body)
  const postedLabel = postedAt
    ? `${postedAt.jstDate}（JST・LINE送信）`
    : "送信日時不明（受信処理時刻で代替）"

  // ① 100% プログラム判定: #メモ / #日報 / #note を含まない投稿はAIを起動せず即スルー
  //    判定は _shared/knowledge_memo_tag.ts に集約（全角'＃'対応。コピーを増やさない）
  if (!hasKnowledgeMemoTag(rawText)) {
    return { ok: true, processed: false, reason: "No #メモ tag found. Skipped." }
  }
  const cleanText = stripKnowledgeMemoTag(rawText).slice(0, 60000)
  if (!cleanText) {
    return { ok: true, processed: false, reason: "Empty text after tag removal." }
  }

  // ② Gemini によるカテゴリ・タイトル・タグの自動識別（失敗時は原文ベースのフォールバック）
  let title = cleanText.substring(0, 15)
  let category = "その他"
  let summary = cleanText.substring(0, 150)
  let tags: string[] = ["LINE投稿", "現場メモ"]
  const aiText = await callKnowledgeGemini([{
    text: `あなたは飲食店の現場LINE投稿を解読・整理するプロアナリストAIです。
以下のLINE投稿（投稿者: ${senderName}／送信日時: ${postedLabel}）を解析し、カテゴリー分類・タイトル生成・要約・タグ付けを行ってください。
送信日時は出来事の時点として扱い、タイトルや要約の時間軸をずらさないでください。

【投稿文】
${cleanText}

【分類ルール】
- category: 以下から最も適切なものを1つだけ選択してください。
  ('施策', 'メニュー', '価格改定', 'イベント', 'マニュアル', 'その他')
  ※「天候」「売れ筋」「客足」「本日の出来事」「所感」に関する内容は 'その他'（タグに '現場日報' が付きます）
  ※「近隣他店」「競合」「周辺フェア」に関する内容は 'イベント' または 'その他'（タグに '周辺情報' が付きます）
  ※「新メニュー」「ワイン」「料理」「価格」に関する内容は 'メニュー' または '価格改定'

【出力フォーマット】
以下のJSONフォーマット**のみ**を出力してください（Markdownのコードブロック \`\`\`json ... \`\`\` で囲んでください）：

{
  "title": "15文字前後のわかりやすいタイトル（例: 大雨時の赤ワイン煮込み出足好調、近隣店ワインフェア開始など）",
  "category": "選択したカテゴリー",
  "summary": "1〜3行の簡潔な要約",
  "body_text": "原文テキスト",
  "tags": ["タグ1", "タグ2", "タグ3"]
}`,
  }])
  const parsed = aiText ? parseGeminiJson(aiText) : null
  if (parsed) {
    title = toSafeString(parsed.title).slice(0, 200) || title
    const rawCategory = toSafeString(parsed.category)
    category = normalizeStoreKnowledgeCategory(rawCategory)
    summary = toSafeString(parsed.summary).slice(0, 2000) || summary
    const aiTags = normalizeStoreKnowledgeTags(parsed.tags)
    tags = ["LINE投稿"]
    if (rawCategory && !STORE_KNOWLEDGE_CATEGORIES.has(rawCategory) && rawCategory !== "その他") {
      tags.push(rawCategory.slice(0, 40))
    }
    for (const t of aiTags) if (!tags.includes(t)) tags.push(t)
  }

  const now = new Date().toISOString()
  // 送信日時を created_at と period（当日）に載せる。常時有効だと全期間の分析に混ざり時間軸がずれる。
  const createdAt = postedAt?.iso || now
  const periodDate = postedAt?.jstDate || toJstDateKeyFromIso(createdAt)
  const record: Record<string, unknown> = {
    store_partition_key: storeKey,
    category,
    title,
    summary,
    body_text: cleanText,
    search_text: buildStoreKnowledgeSearchText({ title, summary, bodyText: cleanText, tags }),
    period_start: periodDate,
    period_end: periodDate,
    tags,
    source_type: "line_post",
    is_active: true,
    created_by: senderName,
    created_at: createdAt,
    updated_at: now,
  }
  let { data, error } = await supabase
    .from("store_knowledge_documents")
    .insert(record)
    .select("id")
    .maybeSingle()
  if (error && /source_type/.test(String(error.message ?? ""))) {
    // 'line_post' 未対応DB（マイグレーション未適用）へのフォールバック
    record.source_type = "manual"
    ;({ data, error } = await supabase
      .from("store_knowledge_documents")
      .insert(record)
      .select("id")
      .maybeSingle())
  }
  if (error) {
    throw {
      status: 500,
      message: `LINE投稿の保存に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  const documentId = Number(data?.id ?? 0)
  const chunksCreated = documentId
    ? await rebuildStoreKnowledgeChunks(supabase, documentId, storeKey, summary, cleanText)
    : 0
  return {
    ok: true,
    processed: true,
    item: {
      id: documentId,
      title,
      category,
      summary,
      tags,
      period_start: periodDate,
      period_end: periodDate,
      created_at: createdAt,
    },
    chunks_created: chunksCreated,
  }
}

/** 資料のRAGチャンクを再生成する（画面の「RAG再生成」用） */
async function processStoreKnowledgeChunks(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  storeScope: string | null,
) {
  const documentId = toNonNegativeInteger(body.document_id ?? body.id)
  if (!documentId) {
    throw { status: 400, message: "document_id is required." } satisfies AppError
  }
  const storeKey = resolveStoreKnowledgeStoreKey(
    body.store_key || body.store_partition_key,
    storeScope,
  )
  const { data: doc, error } = await supabase
    .from("store_knowledge_documents")
    .select("id, summary, body_text")
    .eq("id", documentId)
    .ilike("store_partition_key", storeKnowledgeStoreKeyPattern(storeKey))
    .maybeSingle()
  if (error) {
    throw {
      status: 500,
      message: `資料の取得に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  if (!doc) {
    throw { status: 404, message: "資料が見つかりません。" } satisfies AppError
  }
  const chunksCreated = await rebuildStoreKnowledgeChunks(
    supabase,
    documentId,
    storeKey,
    toSafeString((doc as Record<string, unknown>).summary),
    toSafeString((doc as Record<string, unknown>).body_text),
  )
  return { ok: true, success: true, document_id: documentId, chunks_created: chunksCreated }
}

/** 施策効果測定インサイトを資料として自動追記する（source_type='ai_insight'） */
async function generateStoreKnowledgeInsight(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  storeScope: string | null,
) {
  const storeKey = resolveStoreKnowledgeStoreKey(
    body.store_key || body.store_partition_key,
    storeScope,
  )
  const insightText = toSafeString(body.insight_text).slice(0, 60000)
  if (!insightText) {
    throw { status: 400, message: "insight_text is required." } satisfies AppError
  }
  const baseTitle = toSafeString(body.title).slice(0, 180) || "施策効果測定レポート"
  const title = `【AI効果測定】${baseTitle}`
  const summary = insightText.substring(0, 150) + (insightText.length > 150 ? "…" : "")
  const tags = ["効果測定", "AI分析", "自動追記"]
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("store_knowledge_documents")
    .insert({
      store_partition_key: storeKey,
      category: "施策",
      title,
      summary,
      body_text: insightText,
      search_text: buildStoreKnowledgeSearchText({ title, summary, bodyText: insightText, tags }),
      period_start: toNullableDate(body.period_start),
      period_end: toNullableDate(body.period_end),
      tags,
      source_type: "ai_insight",
      is_active: true,
      created_at: now,
      updated_at: now,
    })
    .select("id, title, category, summary, period_start, period_end")
    .maybeSingle()
  if (error) {
    throw {
      status: 500,
      message: `効果測定インサイトの保存に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  const documentId = Number((data as Record<string, unknown> | null)?.id ?? 0)
  if (documentId) {
    await rebuildStoreKnowledgeChunks(supabase, documentId, storeKey, summary, insightText)
  }
  return { ok: true, success: true, item: data }
}

// ===== jnl2txt.html AI分析履歴 (ai_analysis_history) =====
// 一覧の1件ごとに analysis_result/sales_data を含めて返す（旧クライアントの select=* と同じ形）。
// saved_reports と異なり単体取得エンドポイントは持たない（旧実装も一覧のみで再表示していたため）。

async function fetchReportAiHistoryList(
  supabase: ReturnType<typeof createClient>,
  url: URL,
) {
  const storeKey = normalizePosJournalStoreKey(
    url.searchParams.get("store_key") || url.searchParams.get("store"),
  )
  const rawLimit = Number(url.searchParams.get("limit") ?? "100")
  const trash = url.searchParams.get("trash") === "true"
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(300, Math.trunc(rawLimit)))
    : 100
  let aiHistoryQuery = supabase
    .from("ai_analysis_history")
    .select("id, report_title, report_period, analysis_result, sales_data, created_at, deleted_at")
    .eq("store_partition_key", storeKey)
  aiHistoryQuery = trash
    ? aiHistoryQuery.not("deleted_at", "is", null)
    : aiHistoryQuery.is("deleted_at", null)
  const { data, error } = await aiHistoryQuery
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) {
    throw {
      status: 500,
      message: `AI分析履歴の取得に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  return { ok: true, store_key: storeKey, trash, items: Array.isArray(data) ? data : [] }
}

async function saveReportAiHistory(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  storeScope: string | null,
) {
  const requestedStore = toSafeString(body.store_key)
  const storeKey = storeScope || requestedStore
  if (!storeKey) {
    throw { status: 400, message: "store_key is required." } satisfies AppError
  }
  if (
    storeScope && requestedStore &&
    requestedStore.toLowerCase() !== storeScope.toLowerCase()
  ) {
    throw { status: 403, message: "他店舗のデータにはアクセスできません。" } satisfies AppError
  }
  const analysisResult = toSafeString(body.analysis_result)
  if (!analysisResult) {
    throw { status: 400, message: "analysis_result is required." } satisfies AppError
  }
  const id = toSafeString(body.id) || `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
  const { error } = await supabase
    .from("ai_analysis_history")
    .insert({
      id,
      report_title: toSafeString(body.report_title) || "AI売上分析レポート",
      report_period: toSafeString(body.report_period),
      analysis_result: analysisResult,
      sales_data: isRecord(body.sales_data) ? body.sales_data : null,
      store_partition_key: storeKey,
      updated_at: new Date().toISOString(),
    })
  if (error) {
    throw {
      status: 500,
      message: `AI分析履歴の保存に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  return { ok: true, id }
}

async function deleteReportAiHistoryItem(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  storeScope: string | null,
) {
  if (String(body.confirmation ?? "") !== "delete") {
    throw {
      status: 400,
      message: "削除確認欄へ半角小文字で delete と入力してください。",
    } satisfies AppError
  }
  const id = toSafeString(body.id)
  if (!id) {
    throw { status: 400, message: "id is required." } satisfies AppError
  }
  const requestedStore = toSafeString(body.store_key)
  const storeKey = storeScope || requestedStore
  if (!storeKey) {
    throw { status: 400, message: "store_key is required." } satisfies AppError
  }
  if (
    storeScope && requestedStore &&
    requestedStore.toLowerCase() !== storeScope.toLowerCase()
  ) {
    throw { status: 403, message: "他店舗のデータにはアクセスできません。" } satisfies AppError
  }
  const { data, error } = await supabase
    .from("ai_analysis_history")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("store_partition_key", storeKey)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle()
  if (error) {
    throw {
      status: 500,
      message: `AI分析履歴の削除に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  if (!data) {
    throw { status: 404, message: "AI分析履歴が見つかりません。" } satisfies AppError
  }
  return { ok: true, deleted: { id: String(data.id) } }
}

// ===== jnl2txt.html AIチャットPDF履歴 (ai_chat_pdf_history) =====
// 「PDFにする」押下時に質問＋回答を保存し、一覧ページ／パネルから質問起点で再表示する。

async function fetchChatPdfHistoryList(
  supabase: ReturnType<typeof createClient>,
  url: URL,
) {
  const storeKey = normalizePosJournalStoreKey(
    url.searchParams.get("store_key") || url.searchParams.get("store"),
  )
  const rawLimit = Number(url.searchParams.get("limit") ?? "100")
  const trash = url.searchParams.get("trash") === "true"
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(300, Math.trunc(rawLimit)))
    : 100
  let chatHistoryQuery = supabase
    .from("ai_chat_pdf_history")
    .select("id, question, answer, mode, provider, created_at, deleted_at")
    .eq("store_partition_key", storeKey)
  chatHistoryQuery = trash
    ? chatHistoryQuery.not("deleted_at", "is", null)
    : chatHistoryQuery.is("deleted_at", null)
  const { data, error } = await chatHistoryQuery
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) {
    throw {
      status: 500,
      message: `AIチャットPDF履歴の取得に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  return { ok: true, store_key: storeKey, trash, items: Array.isArray(data) ? data : [] }
}

async function fetchChatPdfHistoryItem(
  supabase: ReturnType<typeof createClient>,
  url: URL,
) {
  const storeKey = normalizePosJournalStoreKey(
    url.searchParams.get("store_key") || url.searchParams.get("store"),
  )
  const id = toSafeString(url.searchParams.get("id"))
  if (!id) {
    throw { status: 400, message: "id is required." } satisfies AppError
  }
  const { data, error } = await supabase
    .from("ai_chat_pdf_history")
    .select("id, question, answer, mode, provider, created_at")
    .eq("id", id)
    .eq("store_partition_key", storeKey)
    .is("deleted_at", null)
    .maybeSingle()
  if (error) {
    throw {
      status: 500,
      message: `AIチャットPDF履歴の取得に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  if (!data) {
    throw { status: 404, message: "AIチャットPDF履歴が見つかりません。" } satisfies AppError
  }
  return { ok: true, store_key: storeKey, item: data }
}

async function saveChatPdfHistory(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  storeScope: string | null,
) {
  const requestedStore = toSafeString(body.store_key)
  const storeKey = storeScope || requestedStore
  if (!storeKey) {
    throw { status: 400, message: "store_key is required." } satisfies AppError
  }
  if (
    storeScope && requestedStore &&
    requestedStore.toLowerCase() !== storeScope.toLowerCase()
  ) {
    throw { status: 403, message: "他店舗のデータにはアクセスできません。" } satisfies AppError
  }
  const question = toSafeString(body.question)
  const answer = toSafeString(body.answer)
  if (!question) {
    throw { status: 400, message: "question is required." } satisfies AppError
  }
  if (!answer) {
    throw { status: 400, message: "answer is required." } satisfies AppError
  }
  const id = toSafeString(body.id) || `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
  const { error } = await supabase
    .from("ai_chat_pdf_history")
    .insert({
      id,
      store_partition_key: storeKey,
      question,
      answer,
      mode: toSafeString(body.mode) || null,
      provider: toSafeString(body.provider) || null,
      updated_at: new Date().toISOString(),
    })
  if (error) {
    throw {
      status: 500,
      message: `AIチャットPDF履歴の保存に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  return { ok: true, id }
}

async function deleteChatPdfHistoryItem(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  storeScope: string | null,
) {
  if (String(body.confirmation ?? "") !== "delete") {
    throw {
      status: 400,
      message: "削除確認欄へ半角小文字で delete と入力してください。",
    } satisfies AppError
  }
  const id = toSafeString(body.id)
  if (!id) {
    throw { status: 400, message: "id is required." } satisfies AppError
  }
  const requestedStore = toSafeString(body.store_key)
  const storeKey = storeScope || requestedStore
  if (!storeKey) {
    throw { status: 400, message: "store_key is required." } satisfies AppError
  }
  if (
    storeScope && requestedStore &&
    requestedStore.toLowerCase() !== storeScope.toLowerCase()
  ) {
    throw { status: 403, message: "他店舗のデータにはアクセスできません。" } satisfies AppError
  }
  const { data, error } = await supabase
    .from("ai_chat_pdf_history")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("store_partition_key", storeKey)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle()
  if (error) {
    throw {
      status: 500,
      message: `AIチャットPDF履歴の削除に失敗しました: ${error.message}`,
    } satisfies AppError
  }
  if (!data) {
    throw { status: 404, message: "AIチャットPDF履歴が見つかりません。" } satisfies AppError
  }
  return { ok: true, deleted: { id: String(data.id) } }
}

type JournalHistoryTable =
  | "saved_reports"
  | "sales_forecasts"
  | "ai_analysis_history"
  | "ai_chat_pdf_history"

/**
 * ゴミ箱の完全削除。復元不可のため次の条件をすべて満たすものだけを消す。
 * - すでに deleted_at が入っている（＝ゴミ箱にある）行だけ
 * - 呼び出し元の店舗スコープ内だけ
 * - confirmation に "delete" が入っている（他の破壊的操作と同じ作法）
 * 保存済みレポートは本文HTMLをStorageへ逃がしている場合があるため、
 * 行を消す前にそのオブジェクトも片付ける（失敗しても行の削除は続行する）。
 */
async function purgeJournalHistoryItems(
  supabase: ReturnType<typeof createClient>,
  table: JournalHistoryTable,
  label: string,
  body: Record<string, unknown>,
  storeKey: string,
) {
  if (String(body.confirmation ?? "") !== "delete") {
    throw {
      status: 400,
      message: "完全削除には confirmation に delete を指定してください。",
    } satisfies AppError
  }
  const rawIds = Array.isArray(body.ids) ? body.ids : (body.id ? [body.id] : [])
  const ids = [...new Set(rawIds.map((value) => toSafeString(value)).filter(Boolean))]
  if (!ids.length) throw { status: 400, message: "ids is required." } satisfies AppError
  if (ids.length > 500) {
    throw { status: 400, message: "一度に完全削除できるのは500件までです。" } satisfies AppError
  }

  // 対象がすべてゴミ箱にあることを先に確認する（有効な行が混ざっていたら中止）
  const { data: targets, error: findError } = await supabase
    .from(table)
    .select("id, deleted_at")
    .eq("store_partition_key", storeKey)
    .in("id", ids)
  if (findError) {
    throw { status: 500, message: `${label}の確認に失敗しました: ${findError.message}` } satisfies AppError
  }
  const rows = Array.isArray(targets) ? targets : []
  const live = rows.filter((row) => !(row as Record<string, unknown>).deleted_at)
  if (live.length) {
    throw {
      status: 409,
      message: `${label}にゴミ箱以外の項目が含まれています（${live.length}件）。完全削除はゴミ箱の項目だけが対象です。`,
    } satisfies AppError
  }
  const deletableIds = rows.map((row) => String((row as Record<string, unknown>).id))
  if (!deletableIds.length) {
    return { ok: true, purged: 0, skipped: ids.length }
  }

  if (table === "saved_reports") {
    // data 列は伝票明細を丸ごと含み1件で数百KBになる。パスだけを取り出す。
    const { data: withHtml } = await supabase
      .from(table)
      .select("html_path:data->>htmlStoragePath")
      .eq("store_partition_key", storeKey)
      .in("id", deletableIds)
    const paths = (Array.isArray(withHtml) ? withHtml : [])
      .map((row) => toSafeString((row as Record<string, unknown>).html_path))
      .filter(Boolean)
    // 一度に大量のオブジェクトを渡すと失敗しうるため分割して消す。
    // Storage側が失敗しても行の削除は続ける（残るのは参照されないHTMLだけ）。
    for (let i = 0; i < paths.length; i += 50) {
      try {
        await supabase.storage.from(POS_REPORT_HTML_BUCKET).remove(paths.slice(i, i + 50))
      } catch (_) { /* 続行 */ }
    }
  }

  const { error: deleteError } = await supabase
    .from(table)
    .delete()
    .eq("store_partition_key", storeKey)
    .in("id", deletableIds)
    .not("deleted_at", "is", null)
  if (deleteError) {
    throw { status: 500, message: `${label}の完全削除に失敗しました: ${deleteError.message}` } satisfies AppError
  }
  return { ok: true, purged: deletableIds.length, skipped: ids.length - deletableIds.length }
}

async function restoreJournalHistoryItem(
  supabase: ReturnType<typeof createClient>,
  table: JournalHistoryTable,
  label: string,
  body: Record<string, unknown>,
  storeScope: string | null,
) {
  const requestedStore = toSafeString(body.store_key)
  const storeKey = storeScope || requestedStore
  if (!storeKey) throw { status: 400, message: "store_key is required." } satisfies AppError
  if (
    storeScope && requestedStore &&
    requestedStore.toLowerCase() !== storeScope.toLowerCase()
  ) {
    throw { status: 403, message: "他店舗のデータにはアクセスできません。" } satisfies AppError
  }
  // ゴミ箱の完全削除。復元と同じ口で受けるが、対象は「すでにゴミ箱にある行」だけに限定し、
  // 店舗スコープと確認文字列で二重に守る。有効な行は絶対に消さない。
  // 複数IDを受けるため、単一idの必須チェックより前に分岐する。
  if (String(body.action ?? "") === "purge") {
    return await purgeJournalHistoryItems(supabase, table, label, body, storeKey)
  }
  const id = toSafeString(body.id)
  if (!id) throw { status: 400, message: "id is required." } satisfies AppError
  if (String(body.action ?? "") !== "restore") {
    throw { status: 400, message: "action must be restore or purge." } satisfies AppError
  }
  const { data, error } = await supabase
    .from(table)
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("store_partition_key", storeKey)
    .not("deleted_at", "is", null)
    .select("id")
    .maybeSingle()
  if (error) {
    throw { status: 500, message: `${label}の復元に失敗しました: ${error.message}` } satisfies AppError
  }
  if (!data) throw { status: 404, message: `${label}がゴミ箱に見つかりません。` } satisfies AppError
  return { ok: true, restored: { id: String(data.id) } }
}

async function deletePosJournalFile(
  supabase: ReturnType<typeof createClient>,
  req: Request,
  storeScope: string | null,
) {
  const body = await parseJson(req)
  if (!isRecord(body)) {
    throw { status: 400, message: "Invalid JSON body." } satisfies AppError
  }
  if (String(body.confirmation ?? "") !== "delete") {
    throw {
      status: 400,
      message: "削除確認欄へ半角小文字で delete と入力してください。",
    } satisfies AppError
  }
  const id = Number(body.id)
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: "id is required." } satisfies AppError
  }
  const requestedStore = String(body.store_key ?? "").trim()
  const storeKey = storeScope || requestedStore
  if (!storeKey) {
    throw { status: 400, message: "store_key is required." } satisfies AppError
  }
  if (
    storeScope && requestedStore &&
    requestedStore.toLowerCase() !== storeScope.toLowerCase()
  ) {
    throw {
      status: 403,
      message: "他店舗のデータにはアクセスできません。",
    } satisfies AppError
  }
  const { data: row, error: fetchError } = await supabase
    .from("pos_journal_files")
    .select(
      "id, store_partition_key, store_code, business_date, original_file_name, inner_file_name, storage_bucket, storage_path, mime_type, file_size_bytes, sha256_hex, parsed_data, net_sales, tax_yen, gross_sales, groups_count, guests_count, receipts_count, uploaded_at, created_at",
    )
    .eq("id", id)
    .eq("store_partition_key", storeKey)
    .is("storage_deleted_at", null)
    .maybeSingle()
  if (fetchError) {
    throw {
      status: 500,
      message: `削除対象の取得に失敗しました: ${fetchError.message}`,
    } satisfies AppError
  }
  if (!row) {
    throw {
      status: 404,
      message: "削除対象の電子ジャーナルが見つかりません。",
    } satisfies AppError
  }
  const bucket = toSafeString(row.storage_bucket) || POS_JOURNAL_BUCKET
  const storagePath = toSafeString(row.storage_path)
  // Storage 未保管のプレースホルダ行でも DB 行は削除できるようにする
  if (storagePath) {
    const { error: removeError } = await supabase.storage.from(bucket).remove([
      storagePath,
    ])
    if (removeError) {
      throw {
        status: 500,
        message: `原本ファイルの削除に失敗しました: ${removeError.message}`,
      } satisfies AppError
    }
  }
  const deletedAt = new Date().toISOString()
  const deleteSnapshot = {
    id: Number(row.id),
    store_partition_key: String(row.store_partition_key ?? ""),
    store_code: String(row.store_code ?? ""),
    business_date: String(row.business_date ?? ""),
    original_file_name: String(row.original_file_name ?? ""),
    inner_file_name: row.inner_file_name == null
      ? null
      : String(row.inner_file_name),
    storage_bucket: String(row.storage_bucket ?? ""),
    storage_path: String(row.storage_path ?? ""),
    mime_type: String(row.mime_type ?? ""),
    file_size_bytes: Number(row.file_size_bytes ?? 0),
    sha256_hex: String(row.sha256_hex ?? ""),
    parsed_data: row.parsed_data,
    net_sales: Number(row.net_sales ?? 0),
    tax_yen: Number(row.tax_yen ?? 0),
    gross_sales: Number(row.gross_sales ?? 0),
    groups_count: Number(row.groups_count ?? 0),
    guests_count: Number(row.guests_count ?? 0),
    receipts_count: Number(row.receipts_count ?? 0),
    uploaded_at: String(row.uploaded_at ?? ""),
    created_at: String(row.created_at ?? ""),
    storage_deleted_at: deletedAt,
  }
  const { error: tombstoneError } = await supabase
    .from("pos_journal_files")
    .update({
      storage_deleted_at: deletedAt,
      storage_delete_error: null,
      delete_snapshot: deleteSnapshot,
      updated_at: deletedAt,
    })
    .eq("id", id)
    .eq("store_partition_key", storeKey)
  if (tombstoneError) {
    throw {
      status: 500,
      message:
        `原本は削除されましたが、削除状態の記録に失敗しました: ${tombstoneError.message}`,
    } satisfies AppError
  }
  const { error: deleteError } = await supabase
    .from("pos_journal_files")
    .delete()
    .eq("id", id)
    .eq("store_partition_key", storeKey)
  if (deleteError) {
    throw {
      status: 500,
      message:
        `原本は削除済みです。保管テーブルの行削除に失敗しましたが、画面と集計からは除外されています: ${deleteError.message}`,
    } satisfies AppError
  }
  const deletedMonth = String(row.business_date ?? "").slice(0, 7)
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(deletedMonth)) {
    await ensureJournalProductIndexMonths(supabase, storeKey, [deletedMonth])
  }
  return {
    ok: true,
    deleted: {
      id,
      store_key: storeKey,
      business_date: String(row.business_date ?? ""),
      original_file_name: String(row.original_file_name ?? ""),
    },
  }
}

function buildDocumentStoragePath(roomId: string | null, originalFileName: string): string {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, "0")
  const d = String(now.getUTCDate()).padStart(2, "0")
  const roomSegment = sanitizeStoragePathSegment(roomId || "shared")
  const ext = extractFileExt(originalFileName) || "bin"
  const baseName = sanitizeStoragePathSegment(originalFileName.replace(/\.[^.]+$/, "") || "document")
  const docId = crypto.randomUUID()
  return `${y}/${m}/${d}/${roomSegment}/${docId}-${baseName}.${ext}`
}

function sanitizeStoragePathSegment(value: string): string {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
  if (!cleaned) return "unknown"
  return cleaned.length > 120 ? cleaned.slice(0, 120) : cleaned
}

async function loadPdfJsModule(): Promise<PdfJsModule | null> {
  if (!cachedPdfJsModulePromise) {
    cachedPdfJsModulePromise = import(PDFJS_MODULE_URL)
      .then((mod) => {
        if (isRecord(mod) && typeof mod.getDocument === "function") {
          return mod as unknown as PdfJsModule
        }
        console.error("pdfjs module is invalid: getDocument is missing.")
        return null
      })
      .catch((error) => {
        console.error("Failed to load pdfjs module:", error)
        return null
      })
  }
  return await cachedPdfJsModulePromise
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await loadPdfJsModule()
  if (!pdfjs) return ""

  let loadingTask: PdfJsLoadingTask | null = null
  let pdfDocument: PdfJsDocument | null = null
  try {
    loadingTask = pdfjs.getDocument({
      data: bytes,
      disableWorker: true,
      useSystemFonts: false,
      isEvalSupported: false,
      stopAtErrors: false,
    })
    pdfDocument = await loadingTask.promise

    const numPages = Number(pdfDocument.numPages || 0)
    if (!Number.isFinite(numPages) || numPages <= 0) return ""

    const pagesToRead = Math.min(numPages, DOCUMENT_PDF_EXTRACT_MAX_PAGES)
    const chunks: string[] = []
    let extractedChars = 0

    for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber += 1) {
      let page: PdfJsPage | null = null
      try {
        page = await pdfDocument.getPage(pageNumber)
        const textContent = await page.getTextContent()
        const rawItems = Array.isArray(textContent?.items) ? textContent.items : []
        const pageText = rawItems
          .map((item) => {
            if (!isRecord(item)) return ""
            const strValue = (item as PdfJsTextItem).str
            return typeof strValue === "string" ? strValue : ""
          })
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
        if (!pageText) continue

        const remaining = DOCUMENT_EXTRACT_MAX_CHARS - extractedChars
        if (remaining <= 0) break
        const clipped = pageText.length > remaining
          ? pageText.slice(0, remaining)
          : pageText
        chunks.push(clipped)
        extractedChars += clipped.length + 1
        if (extractedChars >= DOCUMENT_EXTRACT_MAX_CHARS) break
      } catch (pageError) {
        console.error(`Failed to extract PDF page text (${pageNumber}):`, pageError)
      } finally {
        try {
          page?.cleanup?.()
        } catch {
          // no-op
        }
      }
    }

    return normalizeExtractedText(chunks.join("\n"))
  } catch (error) {
    console.error("Failed to extract PDF text:", error)
    return ""
  } finally {
    try {
      pdfDocument?.cleanup?.()
    } catch {
      // no-op
    }
    try {
      await pdfDocument?.destroy?.()
    } catch {
      // no-op
    }
    try {
      await loadingTask?.destroy?.()
    } catch {
      // no-op
    }
  }
}

async function loadOfficeZip(bytes: Uint8Array): Promise<JSZip | null> {
  try {
    return await JSZip.loadAsync(bytes, {
      checkCRC32: false,
      createFolders: false,
    })
  } catch (error) {
    console.error("Failed to load office archive:", error)
    return null
  }
}

async function validateDocumentPayloadSafety(
  bytes: Uint8Array,
  mimeType: DocumentMimeType,
): Promise<string | null> {
  if (mimeType === "application/pdf" && !hasPdfMagicHeader(bytes)) {
    return "Invalid PDF payload."
  }
  if (mimeType === DOCX_MIME_TYPE || mimeType === XLSX_MIME_TYPE) {
    if (!hasZipMagicHeader(bytes)) {
      return "Office file must be a valid ZIP container."
    }
    const inspection = await inspectOfficeArchiveSafety(bytes, mimeType)
    if (!inspection.ok) return inspection.message
    return null
  }
  if (mimeType === "text/plain" && looksLikeBinaryTextPayload(bytes)) {
    return "Text file appears to contain binary data."
  }
  return null
}

function hasPdfMagicHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false
  return bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46
    && bytes[4] === 0x2d
}

function hasZipMagicHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false
  const marker = bytes[2] * 256 + bytes[3]
  return marker === 0x0304 || marker === 0x0506 || marker === 0x0708
}

function looksLikeBinaryTextPayload(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false
  const sampleSize = Math.min(bytes.length, 4096)
  let binaryCount = 0
  for (let i = 0; i < sampleSize; i += 1) {
    const value = bytes[i]
    const isAllowedControl = value === 9 || value === 10 || value === 13
    const isTextByte = value >= 32 && value <= 126
    const isMultiByteLead = value >= 0x80
    if (!isAllowedControl && !isTextByte && !isMultiByteLead) {
      binaryCount += 1
    }
  }
  return (binaryCount / sampleSize) > DOCUMENT_TEXT_BINARY_RATIO_MAX
}

async function inspectOfficeArchiveSafety(
  bytes: Uint8Array,
  mimeType: DocumentMimeType,
): Promise<{ ok: true } | { ok: false; message: string }> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bytes, {
      checkCRC32: false,
      createFolders: false,
    })
  } catch {
    return { ok: false, message: "Failed to parse Office archive." }
  }

  const entries = Object.values(zip.files).filter((entry) => !entry.dir)
  if (entries.length === 0) {
    return { ok: false, message: "Office archive has no files." }
  }
  if (entries.length > DOCUMENT_ARCHIVE_MAX_ENTRIES) {
    return { ok: false, message: "Office archive has too many entries." }
  }

  let totalUncompressed = 0
  let totalCompressed = 0
  for (const entry of entries) {
    const entryName = String(entry.name || "")
    if (!entryName || entryName.startsWith("/") || entryName.includes("../") || entryName.includes("..\\")) {
      return { ok: false, message: "Office archive contains unsafe entry paths." }
    }
    const uncompressedSize = Number((entry as any)?._data?.uncompressedSize ?? 0)
    const compressedSize = Number((entry as any)?._data?.compressedSize ?? 0)
    if (Number.isFinite(uncompressedSize) && uncompressedSize > DOCUMENT_ARCHIVE_SINGLE_ENTRY_MAX_BYTES) {
      return { ok: false, message: "Office archive entry exceeds allowed size." }
    }
    if (Number.isFinite(uncompressedSize) && uncompressedSize > 0) {
      totalUncompressed += uncompressedSize
      if (totalUncompressed > DOCUMENT_ARCHIVE_TOTAL_UNCOMPRESSED_MAX_BYTES) {
        return { ok: false, message: "Office archive exceeds uncompressed size limit." }
      }
    }
    if (Number.isFinite(compressedSize) && compressedSize > 0) {
      totalCompressed += compressedSize
    }
  }

  if (totalCompressed > 0) {
    const compressionRatio = totalUncompressed / totalCompressed
    if (compressionRatio > DOCUMENT_ARCHIVE_MAX_COMPRESSION_RATIO) {
      return { ok: false, message: "Office archive compression ratio is too high." }
    }
  }

  const hasContentTypes = !!zip.file("[Content_Types].xml")
  if (!hasContentTypes) {
    return { ok: false, message: "Office archive is missing required metadata." }
  }
  if (mimeType === DOCX_MIME_TYPE && !zip.file("word/document.xml")) {
    return { ok: false, message: "DOCX payload is missing word/document.xml." }
  }
  if (mimeType === XLSX_MIME_TYPE && !zip.file("xl/workbook.xml")) {
    return { ok: false, message: "XLSX payload is missing xl/workbook.xml." }
  }
  return { ok: true }
}

// プライベート/ループバック/リンクローカルでない（＝意味のある公開）IPか。
function isPublicIp(ip: string): boolean {
  if (!ip || ip === "unknown") return false
  if (/^127\./.test(ip) || /^10\./.test(ip) || /^192\.168\./.test(ip)) return false
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip) || /^169\.254\./.test(ip) || /^0\./.test(ip)) return false
  if (ip === "::1" || /^fe80:/i.test(ip) || /^f[cd][0-9a-f]{2}:/i.test(ip)) return false
  return true
}

// レート制限のキーに使うクライアントIP。攻撃者が自由に詐称してキーを変えられないよう、
// 「詐称できない情報源」を優先する。
async function recordCurrentAdminAccess(params: {
  supabase: ReturnType<typeof createClient>
  req: Request
  path: string
  method: string
  ip: string
  auth?: {
    storeScope?: string | null
    scopeKind?: string | null
    actorLabel?: string | null
  }
  storeKey?: string | null
  eventKind?: string
  action?: string
  page?: string
  actorKind?: string
  actorLabel?: string
}): Promise<void> {
  try {
    const classified = classifyAdminAccess(params.method, params.path)
    if (classified.skip && !params.action) return
    const actor = actorFromAuth(params.auth || {})
    await insertAdminAccessEvent(params.supabase, {
      eventKind: params.eventKind || classified.eventKind,
      action: params.action || classified.action,
      page: params.page || classified.page,
      method: params.method,
      apiPath: params.path,
      storeKey: params.storeKey ?? params.auth?.storeScope ?? null,
      actorKind: params.actorKind || actor.actorKind,
      actorLabel: params.actorLabel || actor.actorLabel,
      lineUserId: actor.lineUserId,
      ip: params.ip,
      userAgent: params.req.headers.get("user-agent"),
    })
  } catch (error) {
    console.error(
      "recordCurrentAdminAccess failed:",
      error instanceof Error ? error.message : String(error),
    )
  }
}

async function fetchAdminAccessEvents(
  supabase: ReturnType<typeof createClient>,
  url: URL,
  storeScope: string | null,
) {
  const limitRaw = Number(url.searchParams.get("limit") || ADMIN_ACCESS_HISTORY_KEEP)
  const limit = Number.isFinite(limitRaw)
    ? Math.min(ADMIN_ACCESS_HISTORY_KEEP, Math.max(1, Math.trunc(limitRaw)))
    : ADMIN_ACCESS_HISTORY_KEEP
  let query = supabase
    .from("admin_access_events")
    .select(
      "id, created_at, event_kind, action, page, method, api_path, store_partition_key, actor_kind, actor_label, line_user_id, ip",
    )
    .order("created_at", { ascending: false })
    .limit(limit)
  if (storeScope) query = query.eq("store_partition_key", storeScope)
  const { data, error } = await query
  if (error) {
    throw {
      status: 500,
      message: `Failed to fetch access events: ${error.message}`,
    } satisfies AppError
  }
  const rows = Array.isArray(data) ? data : []
  const lineIds = [
    ...new Set(
      rows.map((row) => String((row as { line_user_id?: unknown }).line_user_id || "").trim())
        .filter(Boolean),
    ),
  ]
  const nameById = new Map<string, string>()
  if (lineIds.length) {
    const { data: users } = await supabase
      .from("line_user_permissions")
      .select("line_user_id, display_name")
      .in("line_user_id", lineIds)
    for (const user of users || []) {
      const id = String((user as { line_user_id?: unknown }).line_user_id || "").trim()
      const name = String((user as { display_name?: unknown }).display_name || "").trim()
      if (id && name) nameById.set(id, name)
    }
  }
  return {
    ok: true,
    events: rows.map((row) => {
      const lineUserId = String((row as { line_user_id?: unknown }).line_user_id || "").trim()
      const actorLabel = String((row as { actor_label?: unknown }).actor_label || "").trim()
      return {
        ...row,
        actor_label: (lineUserId && nameById.get(lineUserId)) || actorLabel || "不明",
      }
    }),
  }
}

function extractClientIp(headers: Headers, info?: { remoteAddr?: { hostname?: string } }): string {
  // 1) プラットフォームが付与する実接続元（クライアントが詐称不可）。公開IPのときのみ採用。
  const remote = String(info?.remoteAddr?.hostname ?? "").trim()
  if (isPublicIp(remote)) return remote
  // 2) Cloudflare が付与する真のクライアントIP（クライアント送信の同名ヘッダは上書き＝詐称不可）。
  const cf = String(headers.get("cf-connecting-ip") ?? "").trim()
  if (cf) return cf
  // 3) プラットフォーム設定の x-real-ip。
  const xreal = String(headers.get("x-real-ip") ?? "").trim()
  if (xreal) return xreal
  // 4) x-forwarded-for は「クライアント, …, 直前プロキシ」の順で、先頭はクライアントが詐称可能。
  //    プラットフォームが最後に付与する「末尾」を使う（旧実装は先頭を採用＝回数制限を回避できた）。
  const xff = String(headers.get("x-forwarded-for") ?? "").trim()
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean)
    if (parts.length) return parts[parts.length - 1]
  }
  return "unknown"
}

function resolveAdminRateLimit(method: string, path: string): { maxRequests: number; windowMs: number } {
  // 資格情報を提示する認証エンドポイントは総当たりの標的。既定(180/分)より厳しくする。
  if (method === "POST" && (
    path === "/auth/link-login" ||
    path === "/auth/chat-journal-link-login" ||
    path === "/auth/chat-media-login" ||
    path === "/auth/session" ||
    path === "/auth/room-config-login" ||
    path === "/auth/verify"
  )) {
    return {
      maxRequests: 20,
      windowMs: ADMIN_RATE_LIMIT_DEFAULT_WINDOW_MS,
    }
  }
  if (method === "POST" && (path === "/documents" || path === "/petty-cash/receipt-image" || path === "/pos-journals/upload")) {
    return {
      maxRequests: ADMIN_RATE_LIMIT_UPLOAD_MAX_REQUESTS,
      windowMs: ADMIN_RATE_LIMIT_UPLOAD_WINDOW_MS,
    }
  }
  if (method === "POST" && path === "/foodcourt/journal-deep-analysis") {
    return {
      maxRequests: 8,
      windowMs: ADMIN_RATE_LIMIT_DEFAULT_WINDOW_MS,
    }
  }
  if (path.startsWith("/chat-admin/") && method !== "GET") {
    return {
      maxRequests: 60,
      windowMs: ADMIN_RATE_LIMIT_DEFAULT_WINDOW_MS,
    }
  }
  return {
    maxRequests: ADMIN_RATE_LIMIT_DEFAULT_MAX_REQUESTS,
    windowMs: ADMIN_RATE_LIMIT_DEFAULT_WINDOW_MS,
  }
}

async function consumeRateLimitFromDb(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  maxRequests: number,
  windowMs: number,
): Promise<{ available: boolean; allowed: boolean; retryAfterMs: number }> {
  const windowSeconds = Math.max(1, Math.floor(windowMs / 1000))
  try {
    const { data, error } = await supabase.rpc("consume_security_rate_limit", {
      rate_bucket: bucket,
      window_seconds: windowSeconds,
      max_hits: maxRequests,
    })
    if (error) {
      console.error("Rate limit RPC failed (admin-api):", error.message)
      return { available: false, allowed: false, retryAfterMs: windowMs }
    }
    const row = Array.isArray(data) ? data[0] : null
    if (!row || typeof row.allowed !== "boolean") {
      console.error("Rate limit RPC returned an invalid response (admin-api).")
      return { available: false, allowed: false, retryAfterMs: windowMs }
    }
    const allowed = row?.allowed !== false
    const retryAfterSeconds = Number(row?.retry_after_seconds ?? windowSeconds)
    const retryAfterMs = Math.max(1000, retryAfterSeconds * 1000)
    return { available: true, allowed, retryAfterMs }
  } catch (error) {
    console.error("Unexpected rate limit error (admin-api):", error)
    return { available: false, allowed: false, retryAfterMs: windowMs }
  }
}

function getOfficeXmlEntries(
  zip: JSZip,
  predicate: (entryName: string) => boolean,
): OfficeZipEntry[] {
  const items = Object.values(zip.files)
    .filter((entry) => !entry.dir && predicate(entry.name))
    .slice(0, DOCUMENT_ARCHIVE_MAX_XML_ENTRIES) as unknown as OfficeZipEntry[]
  return items
}

async function readOfficeXmlEntry(entry: OfficeZipEntry): Promise<string> {
  try {
    const uncompressedSize = Number((entry as any)?._data?.uncompressedSize ?? 0)
    if (Number.isFinite(uncompressedSize) && uncompressedSize > DOCUMENT_ARCHIVE_ENTRY_MAX_BYTES) {
      console.error(`Skipped oversized office xml entry: ${entry.name}`)
      return ""
    }
    const raw = await entry.async("string")
    if (!raw) return ""
    if (raw.length > DOCUMENT_ARCHIVE_ENTRY_MAX_BYTES) {
      return raw.slice(0, DOCUMENT_ARCHIVE_ENTRY_MAX_BYTES)
    }
    return raw
  } catch (error) {
    console.error(`Failed to read office xml entry (${entry.name}):`, error)
    return ""
  }
}

function parseXmlDocument(xml: string): Document | null {
  if (!xml) return null
  try {
    const doc = new DOMParser().parseFromString(xml, "application/xml")
    const parserErrors = doc.getElementsByTagName("parsererror")
    if (parserErrors && parserErrors.length > 0) return null
    return doc
  } catch {
    return null
  }
}

function appendChunkWithinLimit(chunks: string[], chunk: string, remainingChars: number): number {
  if (!Number.isFinite(remainingChars) || remainingChars <= 0) return 0
  const text = String(chunk ?? "")
  if (!text || !/\S/.test(text)) return remainingChars
  const clipped = text.length > remainingChars
    ? text.slice(0, remainingChars)
    : text
  chunks.push(clipped)
  return remainingChars - clipped.length - 1
}

function compareWordXmlEntry(a: string, b: string): number {
  const rank = (entryName: string): number => {
    if (entryName === "word/document.xml") return 0
    if (entryName.startsWith("word/header")) return 1
    if (entryName.startsWith("word/footer")) return 2
    if (entryName.startsWith("word/footnotes")) return 3
    if (entryName.startsWith("word/endnotes")) return 4
    return 9
  }
  const diff = rank(a) - rank(b)
  return diff !== 0 ? diff : a.localeCompare(b)
}

function appendWordXmlNodeText(node: Node, out: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const value = node.nodeValue
    if (value) out.push(value)
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return

  const el = node as Element
  const local = String(el.localName || "").toLowerCase()
  if (local === "t") {
    const text = el.textContent || ""
    if (text) out.push(text)
    return
  }
  if (local === "tab") {
    out.push("\t")
    return
  }
  if (local === "br" || local === "cr") {
    out.push("\n")
    return
  }

  const children = Array.from(el.childNodes)
  for (const child of children) {
    appendWordXmlNodeText(child, out)
  }
  if (local === "p" || local === "tr") {
    out.push("\n")
  } else if (local === "tc") {
    out.push("\t")
  }
}

function extractWordXmlText(xml: string): string {
  const doc = parseXmlDocument(xml)
  if (!doc || !doc.documentElement) return ""
  const out: string[] = []
  appendWordXmlNodeText(doc.documentElement, out)
  return out.join("")
}

async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const zip = await loadOfficeZip(bytes)
  if (!zip) return ""

  const entries = getOfficeXmlEntries(zip, (entryName) =>
    entryName.startsWith("word/")
      && entryName.endsWith(".xml")
      && !entryName.includes("/_rels/"),
  ).sort((a, b) => compareWordXmlEntry(a.name, b.name))

  const chunks: string[] = []
  let remainingChars = DOCUMENT_EXTRACT_MAX_CHARS
  for (const entry of entries) {
    if (remainingChars <= 0) break
    const xml = await readOfficeXmlEntry(entry)
    if (!xml) continue
    const text = extractWordXmlText(xml)
    if (!text) continue
    remainingChars = appendChunkWithinLimit(chunks, text, remainingChars)
  }
  return normalizeExtractedText(chunks.join("\n"))
}

function collectTextNodes(root: Element, localName: string): string[] {
  const nodes = getSheetElementsLive(root, localName)
  const out: string[] = []
  const isUnderPhonetic = (el: Element | null): boolean => {
    let cur: Node | null = el
    while (cur) {
      const maybeEl = cur as Element
      if (String(maybeEl.localName || "").toLowerCase() === "rph") return true
      cur = cur.parentNode
    }
    return false
  }
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes.item(i)
    if (node && isUnderPhonetic(node)) continue
    const value = node?.textContent ?? ""
    if (value) out.push(value)
  }
  return out
}

function parseXlsxSharedStrings(xml: string): string[] {
  const doc = parseXmlDocument(xml)
  if (!doc || !doc.documentElement) return []
  const siNodes = getSheetElementsLive(doc, "si")
  const out: string[] = []
  for (let i = 0; i < siNodes.length; i += 1) {
    const si = siNodes.item(i)
    if (!si) {
      out.push("")
      continue
    }
    const joined = collectTextNodes(si, "t").join("")
    out.push(joined)
  }
  return out
}

function getDirectChildElementsByLocalName(root: Element, localName: string): Element[] {
  const out: Element[] = []
  const nodes = root.childNodes
  for (let i = 0; i < nodes.length; i += 1) {
    const child = nodes.item(i)
    if (!child) continue
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const el = child as Element
    if ((el.localName || "").toLowerCase() === localName) {
      out.push(el)
    }
  }
  return out
}

function getFirstSpreadsheetDescendant(root: Element, localName: string): Element | null {
  const byNs = root.getElementsByTagNameNS(OFFICE_SPREADSHEETML_NS, localName)
  if (byNs.length > 0) return byNs.item(0)
  const byStar = root.getElementsByTagNameNS("*", localName)
  if (byStar.length > 0) return byStar.item(0)
  const byTag = root.getElementsByTagName(localName)
  return byTag.length > 0 ? byTag.item(0) : null
}

function columnNameToIndex(columnName: string): number | null {
  const normalized = String(columnName || "").trim().toUpperCase()
  if (!normalized || !/^[A-Z]+$/.test(normalized)) return null
  let value = 0
  for (let i = 0; i < normalized.length; i += 1) {
    value = value * 26 + (normalized.charCodeAt(i) - 64)
  }
  return value - 1
}

function getColumnIndexFromCellRef(cellRef: string): number | null {
  const match = String(cellRef || "").toUpperCase().match(/^([A-Z]+)\d+$/)
  if (!match) return null
  return columnNameToIndex(match[1])
}

function extractXlsxCellText(cell: Element, sharedStrings: string[]): string {
  const cellType = String(cell.getAttribute("t") || "").trim().toLowerCase()
  const valueEl = getFirstSpreadsheetDescendant(cell, "v")
  const rawValue = String(valueEl?.textContent ?? "").trim()

  if (cellType === "s") {
    const idx = Number(rawValue)
    if (Number.isInteger(idx) && idx >= 0 && idx < sharedStrings.length) {
      return String(sharedStrings[idx] || "")
    }
    return ""
  }
  if (cellType === "inlineStr") {
    const inlineEl = getFirstSpreadsheetDescendant(cell, "is")
    if (!inlineEl) return ""
    return collectTextNodes(inlineEl, "t").join("")
  }
  if (cellType === "b") {
    if (rawValue === "1") return "TRUE"
    if (rawValue === "0") return "FALSE"
  }
  if (rawValue) return rawValue
  const formulaEl = getFirstSpreadsheetDescendant(cell, "f")
  const formula = String(formulaEl?.textContent ?? "").trim()
  return formula ? `=${formula}` : ""
}

function extractXlsxSheetText(xml: string, sharedStrings: string[]): string {
  const doc = parseXmlDocument(xml)
  if (!doc || !doc.documentElement) return ""

  const rowNodes = getSheetElementsLive(doc, "row")
  const lines: string[] = []
  for (let i = 0; i < rowNodes.length; i += 1) {
    const row = rowNodes.item(i)
    if (!row) continue
    const cellNodes = getDirectChildElementsByLocalName(row, "c")
    if (cellNodes.length === 0) continue

    const cols: string[] = []
    let nextCol = 0
    for (const cell of cellNodes) {
      const ref = String(cell.getAttribute("r") || "")
      const indexedCol = getColumnIndexFromCellRef(ref)
      const col = indexedCol == null ? nextCol : indexedCol
      while (nextCol < col) {
        cols.push("")
        nextCol += 1
      }
      const text = extractXlsxCellText(cell, sharedStrings)
      cols.push(text)
      nextCol = col + 1
    }

    while (cols.length > 0 && !String(cols[cols.length - 1] || "").trim()) {
      cols.pop()
    }
    if (cols.length === 0) continue
    lines.push(cols.join("\t"))
  }
  return lines.join("\n")
}

function compareXlsxWorksheetEntry(a: string, b: string): number {
  const parse = (name: string): number => {
    const match = name.match(/sheet(\d+)\.xml$/)
    if (!match) return Number.POSITIVE_INFINITY
    return Number(match[1])
  }
  const diff = parse(a) - parse(b)
  return Number.isFinite(diff) && diff !== 0 ? diff : a.localeCompare(b)
}

function decodeXmlEntities(value: string): string {
  return String(value ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
}

function stripXmlTags(value: string): string {
  return decodeXmlEntities(String(value ?? "").replace(/<[^>]+>/g, ""))
}

function parseXlsxSharedStringsByRegex(xml: string): string[] {
  const out: string[] = []
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/gi
  let siMatch: RegExpExecArray | null
  while ((siMatch = siRe.exec(xml)) !== null) {
    const siBody = String(siMatch[1] ?? "")
      .replace(/<rPh\b[\s\S]*?<\/rPh>/gi, "")
      .replace(/<phoneticPr\b[^>]*\/?>/gi, "")
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/gi
    let tMatch: RegExpExecArray | null
    const pieces: string[] = []
    while ((tMatch = tRe.exec(siBody)) !== null) {
      pieces.push(stripXmlTags(String(tMatch[1] ?? "")))
    }
    out.push(pieces.join(""))
  }
  return out
}

function parseXlsxSheetTextByRegex(xml: string, sharedStrings: string[]): string {
  const lines: string[] = []
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/gi
  let rowMatch: RegExpExecArray | null

  while ((rowMatch = rowRe.exec(xml)) !== null) {
    const rowBody = String(rowMatch[1] ?? "")
    const cols: string[] = []
    let nextCol = 0
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi
    let cellMatch: RegExpExecArray | null

    while ((cellMatch = cellRe.exec(rowBody)) !== null) {
      const attr = String(cellMatch[1] ?? "")
      const body = String(cellMatch[2] ?? "")
      const refMatch = /\br="([A-Z]+\d+)"/i.exec(attr)
      const idx = refMatch ? getColumnIndexFromCellRef(refMatch[1]) : null
      const col = idx == null ? nextCol : idx
      while (nextCol < col) {
        cols.push("")
        nextCol += 1
      }

      const typeMatch = /\bt="([^"]+)"/i.exec(attr)
      const cellType = String(typeMatch?.[1] ?? "").trim().toLowerCase()
      let text = ""
      if (cellType === "s") {
        const vMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(body)
        const sharedIdx = Number(String(vMatch?.[1] ?? "").trim())
        if (Number.isInteger(sharedIdx) && sharedIdx >= 0 && sharedIdx < sharedStrings.length) {
          text = String(sharedStrings[sharedIdx] ?? "")
        }
      } else if (cellType === "inlineStr") {
        const cleanBody = body
          .replace(/<rPh\b[\s\S]*?<\/rPh>/gi, "")
          .replace(/<phoneticPr\b[^>]*\/?>/gi, "")
        const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/gi
        let tMatch: RegExpExecArray | null
        const pieces: string[] = []
        while ((tMatch = tRe.exec(cleanBody)) !== null) {
          pieces.push(stripXmlTags(String(tMatch[1] ?? "")))
        }
        text = pieces.join("")
      } else {
        const vMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(body)
        const rawValue = stripXmlTags(String(vMatch?.[1] ?? "")).trim()
        if (rawValue) {
          text = rawValue
        } else {
          const fMatch = /<f\b[^>]*>([\s\S]*?)<\/f>/i.exec(body)
          const formula = stripXmlTags(String(fMatch?.[1] ?? "")).trim()
          if (formula) text = `=${formula}`
        }
      }
      cols.push(text)
      nextCol = col + 1
    }

    while (cols.length > 0 && !String(cols[cols.length - 1] ?? "").trim()) cols.pop()
    if (cols.length > 0) lines.push(cols.join("\t"))
  }
  return lines.join("\n")
}

async function extractXlsxText(bytes: Uint8Array): Promise<string> {
  const zip = await loadOfficeZip(bytes)
  if (!zip) return ""

  const sharedEntry = zip.file("xl/sharedStrings.xml") as unknown as OfficeZipEntry | null
  const sharedStrings = sharedEntry
    ? parseXlsxSharedStrings(await readOfficeXmlEntry(sharedEntry))
    : []

  const worksheetEntries = getOfficeXmlEntries(zip, (entryName) =>
    entryName.startsWith("xl/worksheets/")
      && entryName.endsWith(".xml")
      && !entryName.includes("/_rels/"),
  ).sort((a, b) => compareXlsxWorksheetEntry(a.name, b.name))

  const chunks: string[] = []
  let remainingChars = DOCUMENT_EXTRACT_MAX_CHARS
  for (const entry of worksheetEntries) {
    if (remainingChars <= 0) break
    const xml = await readOfficeXmlEntry(entry)
    if (!xml) continue
    const text = extractXlsxSheetText(xml, sharedStrings)
    if (!text) continue
    remainingChars = appendChunkWithinLimit(chunks, text, remainingChars)
  }
  const domText = normalizeExtractedText(chunks.join("\n"))
  if (domText) return domText

  const sharedXml = sharedEntry ? await readOfficeXmlEntry(sharedEntry) : ""
  const sharedByRegex = sharedXml ? parseXlsxSharedStringsByRegex(sharedXml) : []
  const regexChunks: string[] = []
  let remainingRegexChars = DOCUMENT_EXTRACT_MAX_CHARS
  for (const entry of worksheetEntries) {
    if (remainingRegexChars <= 0) break
    const xml = await readOfficeXmlEntry(entry)
    if (!xml) continue
    const text = parseXlsxSheetTextByRegex(xml, sharedByRegex)
    if (!text) continue
    remainingRegexChars = appendChunkWithinLimit(regexChunks, text, remainingRegexChars)
  }
  return normalizeExtractedText(regexChunks.join("\n"))
}

function tryDecodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes)
  } catch {
    return ""
  }
}

function normalizeExtractedText(value: string): string {
  const normalized = String(value ?? "")
    .replace(/\u0000/g, " ")
    .replace(/\r\n?/g, "\n")
    .trim()
  if (!normalized) return ""
  if (normalized.length <= DOCUMENT_EXTRACT_MAX_CHARS) return normalized
  return normalized.slice(0, DOCUMENT_EXTRACT_MAX_CHARS).trimEnd()
}

function buildDocumentSnippet(text: string, maxChars: number): string {
  const normalized = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
  if (!normalized) return ""
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, maxChars).trimEnd()}…`
}

async function fetchMediaUploadMaxMb(
  supabase: ReturnType<typeof createClient>,
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("summary_settings")
      .select("media_upload_max_mb")
      .eq("id", 1)
      .maybeSingle()
    if (error) {
      console.error("Failed to fetch media_upload_max_mb:", error.message)
      return DEFAULT_MEDIA_UPLOAD_MAX_MB
    }
    return normalizeMediaUploadMaxMb(data?.media_upload_max_mb)
  } catch (error) {
    console.error("Unexpected error while fetching media_upload_max_mb:", error)
    return DEFAULT_MEDIA_UPLOAD_MAX_MB
  }
}

/** 店舗単位のメディア使用量（store_partition_key で集計）。RPCは room/type のみ対応のため直接集計する。 */
async function fetchStoreMediaUsage(
  supabase: ReturnType<typeof createClient>,
  storePartitionKey: string,
  mediaType: MediaType | null,
): Promise<{ ok: true; stats: MediaUsageStats } | { ok: false; message: string }> {
  let query = supabase
    .from("line_message_media")
    .select("file_size_bytes")
    .eq("store_partition_key", storePartitionKey)
    .limit(10000)
  if (mediaType) {
    query = query.eq("media_type", mediaType)
  }
  const { data, error } = await query
  if (error) {
    return { ok: false, message: `Failed to fetch store media usage: ${error.message}` }
  }
  const rows = Array.isArray(data) ? data : []
  let totalBytes = 0
  for (const r of rows) totalBytes += toNonNegativeInteger((r as { file_size_bytes?: unknown }).file_size_bytes)
  return { ok: true, stats: { total_files: rows.length, total_bytes: totalBytes } }
}

async function fetchLineMediaUsageStats(
  supabase: ReturnType<typeof createClient>,
  roomId: string | null,
  mediaType: MediaType | null,
): Promise<{ ok: true; stats: MediaUsageStats } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc("get_line_media_usage_stats", {
    filter_room_id: roomId,
    filter_media_type: mediaType,
  })
  if (error) {
    return { ok: false, message: `Failed to fetch media usage stats: ${error.message}` }
  }

  const row = Array.isArray(data) ? data[0] : null
  const totalFiles = toNonNegativeInteger((row as any)?.total_files)
  const totalBytes = toNonNegativeInteger((row as any)?.total_bytes)
  return {
    ok: true,
    stats: {
      total_files: totalFiles,
      total_bytes: totalBytes,
    },
  }
}

function normalizeMediaType(value: string | null): MediaType | null {
  const normalized = String(value ?? "").trim().toLowerCase()
  if (normalized === "image" || normalized === "video" || normalized === "audio" || normalized === "file") {
    return normalized
  }
  return null
}

function normalizeMediaListRow(value: unknown): MediaListRow | null {
  if (!isRecord(value)) return null
  const idNum = Number(value.id)
  if (!Number.isFinite(idNum) || idNum <= 0) return null
  const mediaType = normalizeMediaType(String(value.media_type ?? ""))
  if (!mediaType) return null

  const messageId = toSafeString(value.message_id)
  const lineMessageId = toSafeString(value.line_message_id)
  const roomId = toSafeString(value.room_id)
  const storageBucket = toSafeString(value.storage_bucket)
  const storagePath = toSafeString(value.storage_path)
  // message_id は Webhook 保存メディア（メッセージ行と紐付かない）では null。
  // line_message_id とストレージ情報が揃っていれば表示対象とする。
  if (!lineMessageId || !roomId || !storageBucket || !storagePath) return null

  return {
    id: Math.floor(idNum),
    message_id: messageId || null,
    line_message_id: lineMessageId,
    room_id: roomId,
    room_name: value.room_name == null ? null : String(value.room_name),
    user_id: value.user_id == null ? null : String(value.user_id),
    sender_display_name: value.sender_display_name == null || String(value.sender_display_name).trim() === ""
      ? null
      : String(value.sender_display_name).trim(),
    media_type: mediaType,
    storage_bucket: storageBucket,
    storage_path: storagePath,
    original_file_name: value.original_file_name == null ? null : String(value.original_file_name),
    mime_type: value.mime_type == null ? null : String(value.mime_type),
    file_size_bytes: toNonNegativeInteger(value.file_size_bytes),
    content_preview: value.content_preview == null || value.content_preview === ""
      ? null
      : String(value.content_preview),
    created_at: String(value.created_at ?? ""),
  }
}

async function fetchRoomNameMapForIds(
  supabase: ReturnType<typeof createClient>,
  roomIds: string[],
): Promise<Map<string, string>> {
  const normalizedIds = Array.from(
    new Set(
      roomIds
        .map((value) => String(value ?? "").trim())
        .filter((value) => value.length > 0),
    ),
  )
  if (normalizedIds.length === 0) return new Map<string, string>()

  const { data, error } = await supabase
    .from("room_summary_settings")
    .select("room_id, room_name")
    .in("room_id", normalizedIds)

  if (error) {
    console.error("Failed to fetch room names for media list:", error.message)
    return new Map<string, string>()
  }

  const map = new Map<string, string>()
  for (const row of Array.isArray(data) ? data : []) {
    const id = toSafeString((row as any)?.room_id)
    const name = toSafeString((row as any)?.room_name)
    if (!id || !name) continue
    map.set(id, name)
  }
  return map
}

// 投稿者名の補完: 保存時に sender_display_name が未取得（null）でも、user_id が
// line_user_permissions に登録済みなら、その display_name を表示用に補う。
// 店舗ごとの保存メディア件数（全種別・絞り込みに依存しない総数）。
// メディア閲覧の店舗セレクタに「店名 (件数)」を表示するために使う。
async function fetchMediaCountByStore(
  supabase: ReturnType<typeof createClient>,
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("line_message_media")
    .select("store_partition_key")
    .limit(100000)
  if (error) {
    console.error("Failed to fetch media counts by store:", error.message)
    return {}
  }
  const counts: Record<string, number> = {}
  for (const row of Array.isArray(data) ? data : []) {
    const key = String((row as { store_partition_key?: unknown })?.store_partition_key ?? "").trim()
    if (!key) continue
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

async function fetchSenderNameMapForUserIds(
  supabase: ReturnType<typeof createClient>,
  userIds: string[],
): Promise<Map<string, string>> {
  const normalizedIds = Array.from(
    new Set(
      userIds
        .map((value) => String(value ?? "").trim())
        .filter((value) => value.length > 0),
    ),
  )
  if (normalizedIds.length === 0) return new Map<string, string>()

  const { data, error } = await supabase
    .from("line_user_permissions")
    .select("line_user_id, display_name")
    .in("line_user_id", normalizedIds)

  if (error) {
    console.error("Failed to fetch sender names for media list:", error.message)
    return new Map<string, string>()
  }

  const map = new Map<string, string>()
  for (const row of Array.isArray(data) ? data : []) {
    const id = toSafeString((row as any)?.line_user_id)
    const name = toSafeString((row as any)?.display_name)
    if (!id || !name) continue
    map.set(id, name)
  }
  return map
}

async function fetchMediaContextMap(
  supabase: ReturnType<typeof createClient>,
  rows: MediaListRow[],
): Promise<Map<number, MediaMessageContext>> {
  const contextMap = new Map<number, MediaMessageContext>()
  if (rows.length === 0) return contextMap

  const anchorMessageIds = Array.from(
    new Set(rows.map((row) => row.message_id).filter((id): id is string => typeof id === "string" && id.length > 0)),
  )
  const anchorMap = new Map<string, { room_id: string; created_at: string }>()
  if (anchorMessageIds.length > 0) {
    const { data: anchorRows, error: anchorError } = await supabase
      .from("line_messages")
      .select("id, room_id, created_at")
      .in("id", anchorMessageIds)
    if (anchorError) {
      console.error("Failed to fetch anchor line_messages for media context:", anchorError.message)
    } else {
      for (const row of Array.isArray(anchorRows) ? anchorRows : []) {
        const id = toSafeString((row as any)?.id)
        const roomId = toSafeString((row as any)?.room_id)
        const createdAt = toSafeString((row as any)?.created_at)
        if (!id || !roomId || !createdAt) continue
        anchorMap.set(id, { room_id: roomId, created_at: createdAt })
      }
    }
  }

  const contextEntries = await Promise.all(rows.map(async (row) => {
    const anchor = row.message_id ? anchorMap.get(row.message_id) : undefined
    const roomId = anchor?.room_id || row.room_id
    const createdAt = anchor?.created_at || row.created_at
    if (!roomId || !createdAt) {
      return {
        mediaId: row.id,
        context: {
          before_text: null,
          before_at: null,
          after_text: null,
          after_at: null,
        } satisfies MediaMessageContext,
      }
    }

    const [beforeRes, afterRes] = await Promise.all([
      supabase
        .from("line_messages")
        .select("content, created_at")
        .eq("room_id", roomId)
        .lt("created_at", createdAt)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("line_messages")
        .select("content, created_at")
        .eq("room_id", roomId)
        .gt("created_at", createdAt)
        .order("created_at", { ascending: true })
        .limit(8),
    ])

    if (beforeRes.error) {
      console.error(`Failed to fetch before-context for media ${row.id}:`, beforeRes.error.message)
    }
    if (afterRes.error) {
      console.error(`Failed to fetch after-context for media ${row.id}:`, afterRes.error.message)
    }

    const before = pickMediaContextCandidate(beforeRes.data)
    const after = pickMediaContextCandidate(afterRes.data)
    return {
      mediaId: row.id,
      context: {
        before_text: before?.text ?? null,
        before_at: before?.created_at ?? null,
        after_text: after?.text ?? null,
        after_at: after?.created_at ?? null,
      } satisfies MediaMessageContext,
    }
  }))

  for (const entry of contextEntries) {
    contextMap.set(entry.mediaId, entry.context)
  }
  return contextMap
}

function pickMediaContextCandidate(
  rows: unknown,
): { text: string; created_at: string | null } | null {
  const list = Array.isArray(rows) ? rows : []
  for (const row of list) {
    const rawText = typeof (row as any)?.content === "string" ? String((row as any).content) : ""
    const text = normalizeMediaContextText(rawText)
    if (!text) continue
    const createdAt = toSafeString((row as any)?.created_at) || null
    return { text, created_at: createdAt }
  }
  return null
}

function normalizeMediaContextText(raw: string): string {
  if (!raw) return ""
  const withoutMetaLines = raw
    .split(/\r?\n/)
    .map((line) => String(line ?? "").trim())
    .filter((line) => line.length > 0)
    .filter((line) => !isInternalLineMessageMetaLine(line))
    .join(" ")
    .replace(/\[\[MEDIA:[^\]]+\]\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!withoutMetaLines) return ""
  return truncateForContext(withoutMetaLines, 120)
}

function isInternalLineMessageMetaLine(line: string): boolean {
  return /^(LINE room_id:|LINE user_id:|source:\s*line-webhook)/i.test(line)
}

function truncateForContext(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars).trimEnd()}…`
}

async function createSignedMediaUrl(
  supabase: ReturnType<typeof createClient>,
  storageBucket: string,
  storagePath: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .storage
      .from(storageBucket)
      .createSignedUrl(storagePath, MEDIA_SIGNED_URL_EXPIRES_SEC)
    if (error) {
      console.error(`Failed to create signed URL for ${storageBucket}/${storagePath}:`, error.message)
      return null
    }
    const signedUrl = typeof data?.signedUrl === "string" ? data.signedUrl.trim() : ""
    return signedUrl || null
  } catch (error) {
    console.error(`Unexpected error while signing media URL for ${storageBucket}/${storagePath}:`, error)
    return null
  }
}

async function createSignedMediaDownloadUrl(
  supabase: ReturnType<typeof createClient>,
  storageBucket: string,
  storagePath: string,
  fileName: string,
): Promise<string | null> {
  const safeName = sanitizeDownloadFileName(fileName)
  const downloadOption: string | boolean = safeName || true
  try {
    const { data, error } = await supabase
      .storage
      .from(storageBucket)
      .createSignedUrl(storagePath, MEDIA_SIGNED_URL_EXPIRES_SEC, {
        download: downloadOption,
      } as any)
    if (error) {
      console.error(`Failed to create signed download URL for ${storageBucket}/${storagePath}:`, error.message)
      return null
    }
    const signedUrl = typeof data?.signedUrl === "string" ? data.signedUrl.trim() : ""
    return signedUrl || null
  } catch (error) {
    console.error(`Unexpected error while signing media download URL for ${storageBucket}/${storagePath}:`, error)
    return null
  }
}

function sanitizeDownloadFileName(value: string): string {
  const sanitized = String(value ?? "")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
  if (!sanitized) return ""
  if (sanitized.length <= 120) return sanitized
  return sanitized.slice(0, 120).trimEnd()
}

function formatLineMediaTag(lineMessageId: string): string {
  return `[[MEDIA:${lineMessageId}]]`
}

async function deleteMediaItemById(
  supabase: ReturnType<typeof createClient>,
  mediaId: number,
): Promise<{ media_id: number; room_id: string; line_message_id: string; storage_deleted: boolean }> {
  const { data: row, error: fetchError } = await supabase
    .from("line_message_media")
    .select("id, room_id, line_message_id, storage_bucket, storage_path")
    .eq("id", mediaId)
    .maybeSingle()
  if (fetchError) {
    throw { status: 500, message: `Failed to fetch media row: ${fetchError.message}` } satisfies AppError
  }
  if (!row) {
    throw { status: 404, message: "Media not found." } satisfies AppError
  }

  const storageBucket = toSafeString(row.storage_bucket)
  const storagePath = toSafeString(row.storage_path)
  let storageDeleted = false
  if (storageBucket && storagePath) {
    const { data: removed, error: removeError } = await supabase
      .storage
      .from(storageBucket)
      .remove([storagePath])
    if (removeError) {
      throw { status: 500, message: `Failed to delete storage object: ${removeError.message}` } satisfies AppError
    }
    storageDeleted = Array.isArray(removed) && removed.length > 0
  }

  const { error: deleteError } = await supabase
    .from("line_message_media")
    .delete()
    .eq("id", mediaId)
  if (deleteError) {
    throw { status: 500, message: `Failed to delete media metadata: ${deleteError.message}` } satisfies AppError
  }

  return {
    media_id: mediaId,
    room_id: String(row.room_id ?? ""),
    line_message_id: String(row.line_message_id ?? ""),
    storage_deleted: storageDeleted,
  }
}

async function deleteDocumentById(
  supabase: ReturnType<typeof createClient>,
  documentId: number,
): Promise<{ document_id: number; room_id: string | null; storage_deleted: boolean }> {
  const { data: row, error: fetchError } = await supabase
    .from("line_search_documents")
    .select("id, room_id, storage_bucket, storage_path")
    .eq("id", documentId)
    .maybeSingle()
  if (fetchError) {
    throw { status: 500, message: `Failed to fetch document row: ${fetchError.message}` } satisfies AppError
  }
  if (!row) {
    throw { status: 404, message: "Document not found." } satisfies AppError
  }

  const storageBucket = toSafeString(row.storage_bucket)
  const storagePath = toSafeString(row.storage_path)
  let storageDeleted = false
  if (storageBucket && storagePath) {
    const { data: removed, error: removeError } = await supabase
      .storage
      .from(storageBucket)
      .remove([storagePath])
    if (removeError) {
      throw { status: 500, message: `Failed to delete storage object: ${removeError.message}` } satisfies AppError
    }
    storageDeleted = Array.isArray(removed) && removed.length > 0
  }

  const { error: deleteError } = await supabase
    .from("line_search_documents")
    .delete()
    .eq("id", documentId)
  if (deleteError) {
    throw { status: 500, message: `Failed to delete document metadata: ${deleteError.message}` } satisfies AppError
  }

  return {
    document_id: documentId,
    room_id: row.room_id == null ? null : String(row.room_id),
    storage_deleted: storageDeleted,
  }
}

async function unregisterRoomFromAdmin(
  supabase: ReturnType<typeof createClient>,
  roomId: string,
  adminSurface: string,
): Promise<
  | {
    ok: true
    admin_surface: string
    unregistered: { room_settings: number; line_room_names: number; dismissed: number; webhook_unlinked: number }
    retained: { messages: number }
  }
  | { ok: false; message: string }
> {
  const surface = adminSurface === ADMIN_SURFACE_LINE_REPORT
    ? ADMIN_SURFACE_LINE_REPORT
    : ADMIN_SURFACE_LEGACY

  const { count: messageCount, error: messageCountError } = await supabase
    .from("line_messages")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId)
  if (messageCountError) {
    return { ok: false, message: `Failed to count room messages: ${messageCountError.message}` }
  }

  const { data: roomSettingsRow, error: roomSettingsCountError } = await supabase
    .from("room_summary_settings")
    .select("room_id, receipt_report_store_partition_key")
    .eq("room_id", roomId)
    .maybeSingle()
  if (roomSettingsCountError) {
    return { ok: false, message: `Failed to inspect room settings: ${roomSettingsCountError.message}` }
  }

  const { data: lineRoomNamesRow, error: lineRoomNamesInspectError } = await supabase
    .from("line_room_names")
    .select("room_id")
    .eq("room_id", roomId)
    .maybeSingle()
  if (lineRoomNamesInspectError) {
    return { ok: false, message: `Failed to inspect line_room_names: ${lineRoomNamesInspectError.message}` }
  }

  const now = new Date().toISOString()
  const previousStoreKey = String(roomSettingsRow?.receipt_report_store_partition_key ?? "").trim()
  const { error: dismissError } = await supabase
    .from("line_room_dismissed")
    .upsert({
      room_id: roomId,
      admin_surface: surface,
      dismissed_at: now,
      previous_store_partition_key: previousStoreKey || null,
    }, { onConflict: "room_id,admin_surface" })
  if (dismissError) {
    return { ok: false, message: `Failed to dismiss room: ${dismissError.message}` }
  }

  let webhookUnlinked = 0
  if (surface === ADMIN_SURFACE_LINE_REPORT) {
    if (roomSettingsRow?.room_id && roomSettingsRow.receipt_report_store_partition_key) {
      const { error: unlinkError } = await supabase
        .from("room_summary_settings")
        .update({
          receipt_report_store_partition_key: null,
          updated_at: now,
        })
        .eq("room_id", roomId)
      if (unlinkError) {
        return { ok: false, message: `Failed to unlink room webhook assignment: ${unlinkError.message}` }
      }
      webhookUnlinked = 1
    }
    return {
      ok: true,
      admin_surface: surface,
      unregistered: {
        room_settings: 0,
        line_room_names: 0,
        dismissed: 1,
        webhook_unlinked: webhookUnlinked,
      },
      retained: {
        messages: messageCount ?? 0,
      },
    }
  }

  const { error: roomSettingsDeleteError } = await supabase
    .from("room_summary_settings")
    .delete()
    .eq("room_id", roomId)
  if (roomSettingsDeleteError) {
    return { ok: false, message: `Failed to delete room settings: ${roomSettingsDeleteError.message}` }
  }

  const { error: lineRoomNamesDeleteError } = await supabase
    .from("line_room_names")
    .delete()
    .eq("room_id", roomId)
  if (lineRoomNamesDeleteError) {
    return { ok: false, message: `Failed to delete line_room_names: ${lineRoomNamesDeleteError.message}` }
  }

  return {
    ok: true,
    admin_surface: surface,
    unregistered: {
      room_settings: roomSettingsRow ? 1 : 0,
      line_room_names: lineRoomNamesRow ? 1 : 0,
      dismissed: 1,
      webhook_unlinked: 0,
    },
    retained: {
      messages: messageCount ?? 0,
    },
  }
}

async function removeRoomMediaObjects(
  supabase: ReturnType<typeof createClient>,
  roomId: string,
): Promise<{ ok: true; deletedFiles: number; deletedMetadataRows: number } | { ok: false; message: string }> {
  const { data: mediaRows, error: mediaError } = await supabase
    .from("line_message_media")
    .select("id, storage_bucket, storage_path")
    .eq("room_id", roomId)

  if (mediaError) {
    return { ok: false, message: `Failed to fetch room media metadata: ${mediaError.message}` }
  }

  const rows = Array.isArray(mediaRows)
    ? mediaRows
        .map((item) => ({
          id: Number(item?.id),
          storage_bucket: toSafeString(item?.storage_bucket),
          storage_path: toSafeString(item?.storage_path),
        }))
        .filter((item) => Number.isFinite(item.id) && item.id > 0 && item.storage_bucket && item.storage_path)
    : []

  if (rows.length === 0) {
    return { ok: true, deletedFiles: 0, deletedMetadataRows: 0 }
  }

  const bucketMap = new Map<string, string[]>()
  for (const row of rows) {
    const list = bucketMap.get(row.storage_bucket) ?? []
    list.push(row.storage_path)
    bucketMap.set(row.storage_bucket, list)
  }

  let deletedFiles = 0
  for (const [bucket, paths] of bucketMap.entries()) {
    const chunks = chunkArray(paths, 100)
    for (const chunk of chunks) {
      const { data: removed, error: removeError } = await supabase
        .storage
        .from(bucket)
        .remove(chunk)
      if (removeError) {
        return { ok: false, message: `Failed to delete storage files in bucket ${bucket}: ${removeError.message}` }
      }
      deletedFiles += Array.isArray(removed) ? removed.length : 0
    }
  }

  const { count: deletedMetadataRows, error: deleteMetaError } = await supabase
    .from("line_message_media")
    .delete({ count: "exact" })
    .eq("room_id", roomId)
  if (deleteMetaError) {
    return { ok: false, message: `Failed to delete media metadata: ${deleteMetaError.message}` }
  }

  return { ok: true, deletedFiles, deletedMetadataRows: deletedMetadataRows ?? 0 }
}

async function removeRoomDocuments(
  supabase: ReturnType<typeof createClient>,
  roomId: string,
): Promise<{ ok: true; deletedFiles: number; deletedMetadataRows: number } | { ok: false; message: string }> {
  const { data: rowsRaw, error: fetchError } = await supabase
    .from("line_search_documents")
    .select("id, storage_bucket, storage_path")
    .eq("room_id", roomId)
  if (fetchError) {
    return { ok: false, message: `Failed to fetch room documents: ${fetchError.message}` }
  }

  const rows = Array.isArray(rowsRaw)
    ? rowsRaw
        .map((item) => ({
          id: Number(item?.id),
          storage_bucket: toSafeString(item?.storage_bucket),
          storage_path: toSafeString(item?.storage_path),
        }))
        .filter((item) => Number.isFinite(item.id) && item.id > 0 && item.storage_bucket && item.storage_path)
    : []

  if (rows.length === 0) {
    return { ok: true, deletedFiles: 0, deletedMetadataRows: 0 }
  }

  const bucketMap = new Map<string, string[]>()
  for (const row of rows) {
    const list = bucketMap.get(row.storage_bucket) ?? []
    list.push(row.storage_path)
    bucketMap.set(row.storage_bucket, list)
  }

  let deletedFiles = 0
  for (const [bucket, paths] of bucketMap.entries()) {
    const chunks = chunkArray(paths, 100)
    for (const chunk of chunks) {
      const { data: removed, error: removeError } = await supabase
        .storage
        .from(bucket)
        .remove(chunk)
      if (removeError) {
        return { ok: false, message: `Failed to delete document files in bucket ${bucket}: ${removeError.message}` }
      }
      deletedFiles += Array.isArray(removed) ? removed.length : 0
    }
  }

  const { count: deletedMetadataRows, error: deleteMetaError } = await supabase
    .from("line_search_documents")
    .delete({ count: "exact" })
    .eq("room_id", roomId)
  if (deleteMetaError) {
    return { ok: false, message: `Failed to delete document metadata: ${deleteMetaError.message}` }
  }
  return { ok: true, deletedFiles, deletedMetadataRows: deletedMetadataRows ?? 0 }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items]
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

async function fetchStorageUsageState(
  supabase: ReturnType<typeof createClient>,
): Promise<{ stats: StorageUsageStats | null; error: string | null }> {
  const { data, error } = await supabase.rpc("get_storage_usage_stats")
  if (error) {
    return { stats: null, error: `容量取得エラー: ${error.message}` }
  }
  return { stats: normalizeStorageUsageStats(data), error: null }
}

function normalizeStorageUsageStats(value: unknown): StorageUsageStats | null {
  if (!isRecord(value)) return null

  const managedTablesRaw = Array.isArray(value.managed_tables) ? value.managed_tables : []
  const managedTables = managedTablesRaw
    .map((item) => normalizeStorageUsageTableStat(item))
    .filter((item): item is StorageUsageTableStat => item !== null)
    .sort((a, b) => b.size_bytes - a.size_bytes)

  return {
    database_size_bytes: toNonNegativeInteger(value.database_size_bytes),
    database_size_pretty: toSafeString(value.database_size_pretty) || "0 bytes",
    managed_tables_total_bytes: toNonNegativeInteger(value.managed_tables_total_bytes),
    managed_tables_total_pretty: toSafeString(value.managed_tables_total_pretty) || "0 bytes",
    managed_tables: managedTables,
  }
}

function normalizeStorageUsageTableStat(value: unknown): StorageUsageTableStat | null {
  if (!isRecord(value)) return null
  const tableName = toSafeString(value.table_name)
  if (!tableName) return null
  return {
    table_name: tableName,
    size_bytes: toNonNegativeInteger(value.size_bytes),
    size_pretty: toSafeString(value.size_pretty) || "0 bytes",
  }
}

function isActionableDeliveryLogStatus(status: unknown, details?: unknown): boolean {
  const normalized = String(status ?? "").trim().toLowerCase()
  if (!normalized) return true
  if (isForceRunLogDetails(details)) return true
  return !nonActionableDeliveryLogStatuses.has(normalized)
}

const nonActionableDeliveryLogStatuses = new Set([
  "no_messages",
  "not_scheduled",
  "no_room_summary",
  "overall_schedule_skip",
])

function isForceRunLogDetails(details: unknown): boolean {
  if (!isRecord(details)) return false
  return details.force_run === true
}

async function waitForNewLog(
  supabase: ReturnType<typeof createClient>,
  previousId: number,
): Promise<{ id: number; run_at: string; status: string; reason: string | null } | null> {
  const maxAttempts = 20
  const intervalMs = 1000
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }

    const { data, error } = await supabase
      .from("summary_delivery_logs")
      .select("id, run_at, status, reason")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      continue
    }
    if (data && data.id > previousId) {
      return data
    }
  }
  return null
}

async function fetchGlobalSettings(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from("summary_settings")
    .select("id, delivery_hours, is_enabled, message_cleanup_timing, last_delivery_summary_mode, message_retention_days, calendar_tomorrow_reminder_enabled, calendar_tomorrow_reminder_hours, calendar_tomorrow_reminder_only_if_events, calendar_tomorrow_reminder_max_items, media_upload_max_mb, updated_at")
    .eq("id", 1)
    .maybeSingle()

  if (error) {
    throw { status: 500, message: `Failed to fetch global settings: ${error.message}` } satisfies AppError
  }

  if (data) {
    return data
  }

  const fallback = {
    id: 1,
    delivery_hours: [12, 17, 23],
    is_enabled: true,
    message_cleanup_timing: "after_each_delivery" as MessageCleanupTiming,
    last_delivery_summary_mode: "independent" as LastDeliverySummaryMode,
    message_retention_days: 365 as MessageRetentionDays,
    calendar_tomorrow_reminder_enabled: true,
    calendar_tomorrow_reminder_hours: [19],
    calendar_tomorrow_reminder_only_if_events: false,
    calendar_tomorrow_reminder_max_items: 20,
    media_upload_max_mb: DEFAULT_MEDIA_UPLOAD_MAX_MB,
    updated_at: new Date().toISOString(),
  }

  const { data: inserted, error: insertError } = await supabase
    .from("summary_settings")
    .upsert(fallback, { onConflict: "id" })
    .select("id, delivery_hours, is_enabled, message_cleanup_timing, last_delivery_summary_mode, message_retention_days, calendar_tomorrow_reminder_enabled, calendar_tomorrow_reminder_hours, calendar_tomorrow_reminder_only_if_events, calendar_tomorrow_reminder_max_items, media_upload_max_mb, updated_at")
    .single()

  if (insertError) {
    throw { status: 500, message: `Failed to initialize global settings: ${insertError.message}` } satisfies AppError
  }

  return inserted
}

function buildGlobalSettingsPayload(body: unknown): {
  delivery_hours: number[]
  is_enabled: boolean
  message_cleanup_timing: MessageCleanupTiming
  last_delivery_summary_mode: LastDeliverySummaryMode
  message_retention_days: MessageRetentionDays
  calendar_tomorrow_reminder_enabled: boolean
  calendar_tomorrow_reminder_hours: number[]
  calendar_tomorrow_reminder_only_if_events: boolean
  calendar_tomorrow_reminder_max_items: number
  media_upload_max_mb: number | null
} {
  if (!isRecord(body)) {
    throw { status: 400, message: "Invalid JSON body." } satisfies AppError
  }

  const isEnabled = body.is_enabled
  if (typeof isEnabled !== "boolean") {
    throw { status: 400, message: "is_enabled must be boolean." } satisfies AppError
  }

  const deliveryHours = normalizeHours(body.delivery_hours, false)
  if (deliveryHours.length === 0) {
    throw { status: 400, message: "delivery_hours must include at least one hour." } satisfies AppError
  }

  const messageCleanupTiming = normalizeMessageCleanupTiming(body.message_cleanup_timing)
  const lastDeliverySummaryMode = normalizeLastDeliverySummaryMode(body.last_delivery_summary_mode)
  if (lastDeliverySummaryMode === "daily_rollup" && messageCleanupTiming !== "end_of_day") {
    throw {
      status: 400,
      message: "last_delivery_summary_mode=daily_rollup requires message_cleanup_timing=end_of_day.",
    } satisfies AppError
  }
  const messageRetentionDays = normalizeMessageRetentionDays(body.message_retention_days)
  const mediaUploadMaxMb = body.media_upload_max_mb == null || body.media_upload_max_mb === ""
    ? null
    : normalizeMediaUploadMaxMb(body.media_upload_max_mb)

  const reminderEnabled = body.calendar_tomorrow_reminder_enabled
  if (typeof reminderEnabled !== "boolean") {
    throw { status: 400, message: "calendar_tomorrow_reminder_enabled must be boolean." } satisfies AppError
  }

  const reminderHours = normalizeHours(body.calendar_tomorrow_reminder_hours, false)
  if (reminderHours.length === 0) {
    throw { status: 400, message: "calendar_tomorrow_reminder_hours must include at least one hour." } satisfies AppError
  }

  const onlyIfEvents = body.calendar_tomorrow_reminder_only_if_events
  if (typeof onlyIfEvents !== "boolean") {
    throw { status: 400, message: "calendar_tomorrow_reminder_only_if_events must be boolean." } satisfies AppError
  }

  const maxItems = Number(body.calendar_tomorrow_reminder_max_items)
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 50) {
    throw { status: 400, message: "calendar_tomorrow_reminder_max_items must be an integer between 1 and 50." } satisfies AppError
  }

  return {
    is_enabled: isEnabled,
    delivery_hours: deliveryHours,
    message_cleanup_timing: messageCleanupTiming,
    last_delivery_summary_mode: lastDeliverySummaryMode,
    message_retention_days: messageRetentionDays,
    calendar_tomorrow_reminder_enabled: reminderEnabled,
    calendar_tomorrow_reminder_hours: reminderHours,
    calendar_tomorrow_reminder_only_if_events: onlyIfEvents,
    calendar_tomorrow_reminder_max_items: maxItems,
    media_upload_max_mb: mediaUploadMaxMb,
  }
}

function buildRoomSettingsPayload(body: unknown): {
  room_id: string
  room_name: string | null
  is_enabled: boolean
  bot_reply_enabled: boolean
  bot_reply_hard_mute_enabled: boolean
  send_room_summary: boolean
  receive_overall_summary_enabled: boolean
  calendar_tomorrow_reminder_enabled: boolean
  calendar_ai_auto_create_enabled: boolean
  calendar_silent_auto_register_enabled: boolean
  calendar_low_confidence_confirm_reply_enabled: boolean
  calendar_registration_reply_enabled: boolean
  message_search_enabled: boolean
  message_search_library_enabled: boolean
  media_file_access_enabled: boolean
  image_analysis_reply_enabled: boolean
  receipt_reply_executive_detail_enabled: boolean
  receipt_correction_reply_enabled: boolean
  non_receipt_image_reply_enabled: boolean
  gmail_reservation_alert_enabled: boolean
  today_reservation_alert_enabled: boolean
  today_reservation_alert_hour: number | null
  today_reservation_alert_minute: number | null
  gmail_alert_interval_minutes: number | null
  gmail_alert_anchor_hour: number | null
  gmail_alert_anchor_minute: number | null
  receipt_midreport_enabled: boolean
  receipt_monthend_report_enabled: boolean
  media_save_enabled: boolean
  review_alert_enabled?: boolean
  budget_entry_enabled?: boolean
  petty_receipt_analysis_enabled?: boolean
  receipt_sales_registration_enabled?: boolean
  receipt_schedule_override: boolean
  receipt_midreport_day: number | null
  receipt_midreport_hour: number | null
  receipt_midreport_minute: number | null
  receipt_monthend_day: number | null
  receipt_monthend_hour: number | null
  receipt_monthend_minute: number | null
  receipt_report_store_partition_key: string | null
  room_sort_order: number | null
  delivery_hours: number[] | null
  message_cleanup_timing: MessageCleanupTiming | null
  last_delivery_summary_mode: LastDeliverySummaryMode | null
} {
  if (!isRecord(body)) {
    throw { status: 400, message: "Invalid JSON body." } satisfies AppError
  }

  const roomIdRaw = String(body.room_id ?? "").trim()
  if (!roomIdRaw) {
    throw { status: 400, message: "room_id is required." } satisfies AppError
  }

  const isEnabled = body.is_enabled
  if (typeof isEnabled !== "boolean") {
    throw { status: 400, message: "is_enabled must be boolean." } satisfies AppError
  }

  const botReplyEnabledRaw = body.bot_reply_enabled
  if (botReplyEnabledRaw != null && typeof botReplyEnabledRaw !== "boolean") {
    throw { status: 400, message: "bot_reply_enabled must be boolean when provided." } satisfies AppError
  }
  const botReplyEnabled = botReplyEnabledRaw === true

  const botReplyHardMuteEnabledRaw = body.bot_reply_hard_mute_enabled
  if (botReplyHardMuteEnabledRaw != null && typeof botReplyHardMuteEnabledRaw !== "boolean") {
    throw { status: 400, message: "bot_reply_hard_mute_enabled must be boolean when provided." } satisfies AppError
  }
  const botReplyHardMuteEnabled = botReplyHardMuteEnabledRaw === true

  const sendRoomSummary = body.send_room_summary
  if (typeof sendRoomSummary !== "boolean") {
    throw { status: 400, message: "send_room_summary must be boolean." } satisfies AppError
  }

  const receiveOverallRaw = body.receive_overall_summary_enabled
  if (receiveOverallRaw != null && typeof receiveOverallRaw !== "boolean") {
    throw { status: 400, message: "receive_overall_summary_enabled must be boolean when provided." } satisfies AppError
  }
  let receiveOverallSummaryEnabled = receiveOverallRaw === true
  let sendRoomSummaryFinal = sendRoomSummary
  if (receiveOverallSummaryEnabled) {
    sendRoomSummaryFinal = false
  }
  if (sendRoomSummaryFinal) {
    receiveOverallSummaryEnabled = false
  }

  const roomTomorrowReminderEnabledRaw = body.calendar_tomorrow_reminder_enabled
  if (roomTomorrowReminderEnabledRaw != null && typeof roomTomorrowReminderEnabledRaw !== "boolean") {
    throw { status: 400, message: "calendar_tomorrow_reminder_enabled must be boolean when provided." } satisfies AppError
  }
  const roomTomorrowReminderEnabled = roomTomorrowReminderEnabledRaw === true

  const roomAiAutoCreateEnabledRaw = body.calendar_ai_auto_create_enabled
  if (roomAiAutoCreateEnabledRaw != null && typeof roomAiAutoCreateEnabledRaw !== "boolean") {
    throw { status: 400, message: "calendar_ai_auto_create_enabled must be boolean when provided." } satisfies AppError
  }
  const roomAiAutoCreateEnabled = roomAiAutoCreateEnabledRaw !== false

  const roomSilentAutoRegisterEnabledRaw = body.calendar_silent_auto_register_enabled
  if (roomSilentAutoRegisterEnabledRaw != null && typeof roomSilentAutoRegisterEnabledRaw !== "boolean") {
    throw { status: 400, message: "calendar_silent_auto_register_enabled must be boolean when provided." } satisfies AppError
  }
  const roomSilentAutoRegisterEnabled = roomSilentAutoRegisterEnabledRaw !== false

  const roomLowConfidenceConfirmRaw = body.calendar_low_confidence_confirm_reply_enabled
  if (roomLowConfidenceConfirmRaw != null && typeof roomLowConfidenceConfirmRaw !== "boolean") {
    throw { status: 400, message: "calendar_low_confidence_confirm_reply_enabled must be boolean when provided." } satisfies AppError
  }
  const roomLowConfidenceConfirmReplyEnabled = roomLowConfidenceConfirmRaw === true

  const roomRegistrationReplyRaw = body.calendar_registration_reply_enabled
  if (roomRegistrationReplyRaw != null && typeof roomRegistrationReplyRaw !== "boolean") {
    throw { status: 400, message: "calendar_registration_reply_enabled must be boolean when provided." } satisfies AppError
  }
  const roomRegistrationReplyEnabled = roomRegistrationReplyRaw === true

  const messageSearchEnabledRaw = body.message_search_enabled
  if (messageSearchEnabledRaw != null && typeof messageSearchEnabledRaw !== "boolean") {
    throw { status: 400, message: "message_search_enabled must be boolean when provided." } satisfies AppError
  }
  const messageSearchEnabled = messageSearchEnabledRaw !== false

  const messageSearchLibraryEnabledRaw = body.message_search_library_enabled
  if (messageSearchLibraryEnabledRaw != null && typeof messageSearchLibraryEnabledRaw !== "boolean") {
    throw { status: 400, message: "message_search_library_enabled must be boolean when provided." } satisfies AppError
  }
  const messageSearchLibraryEnabled = messageSearchLibraryEnabledRaw !== false

  const mediaFileAccessEnabledRaw = body.media_file_access_enabled
  if (mediaFileAccessEnabledRaw != null && typeof mediaFileAccessEnabledRaw !== "boolean") {
    throw { status: 400, message: "media_file_access_enabled must be boolean when provided." } satisfies AppError
  }
  const mediaFileAccessEnabled = mediaFileAccessEnabledRaw !== false

  const imageAnalysisReplyEnabledRaw = body.image_analysis_reply_enabled
  if (imageAnalysisReplyEnabledRaw != null && typeof imageAnalysisReplyEnabledRaw !== "boolean") {
    throw { status: 400, message: "image_analysis_reply_enabled must be boolean when provided." } satisfies AppError
  }
  const imageAnalysisReplyEnabled = imageAnalysisReplyEnabledRaw !== false

  const receiptReplyExecutiveDetailEnabledRaw = body.receipt_reply_executive_detail_enabled
  if (receiptReplyExecutiveDetailEnabledRaw != null && typeof receiptReplyExecutiveDetailEnabledRaw !== "boolean") {
    throw { status: 400, message: "receipt_reply_executive_detail_enabled must be boolean when provided." } satisfies AppError
  }
  const receiptReplyExecutiveDetailEnabled = receiptReplyExecutiveDetailEnabledRaw !== false

  const receiptCorrectionReplyEnabledRaw = body.receipt_correction_reply_enabled
  if (receiptCorrectionReplyEnabledRaw != null && typeof receiptCorrectionReplyEnabledRaw !== "boolean") {
    throw { status: 400, message: "receipt_correction_reply_enabled must be boolean when provided." } satisfies AppError
  }
  const receiptCorrectionReplyEnabled = receiptCorrectionReplyEnabledRaw === true

  const nonReceiptImageReplyEnabledRaw = body.non_receipt_image_reply_enabled
  if (nonReceiptImageReplyEnabledRaw != null && typeof nonReceiptImageReplyEnabledRaw !== "boolean") {
    throw { status: 400, message: "non_receipt_image_reply_enabled must be boolean when provided." } satisfies AppError
  }
  const nonReceiptImageReplyEnabled = nonReceiptImageReplyEnabledRaw !== false

  const gmailReservationAlertEnabledRaw = body.gmail_reservation_alert_enabled
  if (gmailReservationAlertEnabledRaw != null && typeof gmailReservationAlertEnabledRaw !== "boolean") {
    throw { status: 400, message: "gmail_reservation_alert_enabled must be boolean when provided." } satisfies AppError
  }
  const gmailReservationAlertEnabled = gmailReservationAlertEnabledRaw === true

  const todayReservationAlertEnabledRaw = body.today_reservation_alert_enabled
  if (todayReservationAlertEnabledRaw != null && typeof todayReservationAlertEnabledRaw !== "boolean") {
    throw { status: 400, message: "today_reservation_alert_enabled must be boolean when provided." } satisfies AppError
  }
  const todayReservationAlertEnabled = todayReservationAlertEnabledRaw === true

  const receiptMidreportEnabledRaw = body.receipt_midreport_enabled
  if (receiptMidreportEnabledRaw != null && typeof receiptMidreportEnabledRaw !== "boolean") {
    throw { status: 400, message: "receipt_midreport_enabled must be boolean when provided." } satisfies AppError
  }
  const receiptMidreportEnabled = receiptMidreportEnabledRaw !== false

  const receiptMonthendReportEnabledRaw = body.receipt_monthend_report_enabled
  if (receiptMonthendReportEnabledRaw != null && typeof receiptMonthendReportEnabledRaw !== "boolean") {
    throw { status: 400, message: "receipt_monthend_report_enabled must be boolean when provided." } satisfies AppError
  }
  const receiptMonthendReportEnabled = receiptMonthendReportEnabledRaw !== false

  const mediaSaveEnabledRaw = body.media_save_enabled
  if (mediaSaveEnabledRaw != null && typeof mediaSaveEnabledRaw !== "boolean") {
    throw { status: 400, message: "media_save_enabled must be boolean when provided." } satisfies AppError
  }
  const mediaSaveEnabled = mediaSaveEnabledRaw !== false

  // 口コミ新着通知（review-alert-cron宛て、既定OFF）。未指定なら undefined＝upsertに含めず既存値を保持。
  const reviewAlertEnabledRaw = body.review_alert_enabled
  if (reviewAlertEnabledRaw != null && typeof reviewAlertEnabledRaw !== "boolean") {
    throw { status: 400, message: "review_alert_enabled must be boolean when provided." } satisfies AppError
  }
  const reviewAlertEnabled = reviewAlertEnabledRaw != null ? reviewAlertEnabledRaw === true : undefined

  const budgetEntryEnabledRaw = body.budget_entry_enabled
  if (budgetEntryEnabledRaw != null && typeof budgetEntryEnabledRaw !== "boolean") {
    throw { status: 400, message: "budget_entry_enabled must be boolean when provided." } satisfies AppError
  }
  // 未指定なら undefined＝upsertに含めず既存値を保持（予算を送らない保存経路でfalseに戻さない）。
  const budgetEntryEnabled = budgetEntryEnabledRaw != null ? budgetEntryEnabledRaw === true : undefined

  // 小口（経費）レシート解析の許可（既定ON）。未指定なら undefined＝既存値を保持。
  const pettyReceiptAnalysisEnabledRaw = body.petty_receipt_analysis_enabled
  if (pettyReceiptAnalysisEnabledRaw != null && typeof pettyReceiptAnalysisEnabledRaw !== "boolean") {
    throw { status: 400, message: "petty_receipt_analysis_enabled must be boolean when provided." } satisfies AppError
  }
  const pettyReceiptAnalysisEnabled = pettyReceiptAnalysisEnabledRaw != null ? pettyReceiptAnalysisEnabledRaw === true : undefined

  // 売上(精算)のDB登録ゲート（既定ON）。未指定なら undefined＝upsertに含めず既存値を保持。
  const receiptSalesRegistrationEnabledRaw = body.receipt_sales_registration_enabled
  if (receiptSalesRegistrationEnabledRaw != null && typeof receiptSalesRegistrationEnabledRaw !== "boolean") {
    throw { status: 400, message: "receipt_sales_registration_enabled must be boolean when provided." } satisfies AppError
  }
  const receiptSalesRegistrationEnabled = receiptSalesRegistrationEnabledRaw != null ? receiptSalesRegistrationEnabledRaw === true : undefined

  const receiptScheduleOverrideRaw = body.receipt_schedule_override
  if (receiptScheduleOverrideRaw != null && typeof receiptScheduleOverrideRaw !== "boolean") {
    throw { status: 400, message: "receipt_schedule_override must be boolean when provided." } satisfies AppError
  }
  const receiptScheduleOverride = receiptScheduleOverrideRaw === true

  const parseScheduleInt = (value: unknown, label: string, min: number, max: number): number | null => {
    if (value == null || value === "") return null
    const n = Number(value)
    if (!Number.isInteger(n) || n < min || n > max) {
      throw { status: 400, message: `${label} must be an integer between ${min} and ${max} or null.` } satisfies AppError
    }
    return n
  }
  const receiptMidreportDay = parseScheduleInt(body.receipt_midreport_day, "receipt_midreport_day", 1, 28)
  const receiptMidreportHour = parseScheduleInt(body.receipt_midreport_hour, "receipt_midreport_hour", 0, 23)
  const receiptMidreportMinute = parseScheduleInt(body.receipt_midreport_minute, "receipt_midreport_minute", 0, 59)
  const receiptMonthendDay = parseScheduleInt(body.receipt_monthend_day, "receipt_monthend_day", 1, 28)
  const receiptMonthendHour = parseScheduleInt(body.receipt_monthend_hour, "receipt_monthend_hour", 0, 23)
  const receiptMonthendMinute = parseScheduleInt(body.receipt_monthend_minute, "receipt_monthend_minute", 0, 59)
  const todayReservationAlertHour = parseScheduleInt(body.today_reservation_alert_hour, "today_reservation_alert_hour", 0, 23)
  const todayReservationAlertMinute = parseScheduleInt(body.today_reservation_alert_minute, "today_reservation_alert_minute", 0, 59)

  // 予約メール通知(gmail-alert-cron)の配信間隔（分）。NULL/1=リアルタイム（毎分チェック）。
  let gmailAlertIntervalMinutes: number | null = null
  if (body.gmail_alert_interval_minutes != null && body.gmail_alert_interval_minutes !== "") {
    const v = Number(body.gmail_alert_interval_minutes)
    if (!GMAIL_ALERT_INTERVAL_MINUTES_ALLOWED.has(v)) {
      throw { status: 400, message: "gmail_alert_interval_minutes must be one of the allowed interval values." } satisfies AppError
    }
    gmailAlertIntervalMinutes = v
  }
  const gmailAlertAnchorHour = body.gmail_alert_anchor_hour == null || body.gmail_alert_anchor_hour === ""
    ? null
    : Number(body.gmail_alert_anchor_hour)
  const gmailAlertAnchorMinute = body.gmail_alert_anchor_minute == null || body.gmail_alert_anchor_minute === ""
    ? null
    : Number(body.gmail_alert_anchor_minute)
  if (gmailAlertAnchorHour != null && (!Number.isInteger(gmailAlertAnchorHour) || gmailAlertAnchorHour < 0 || gmailAlertAnchorHour > 23)) {
    throw { status: 400, message: "gmail_alert_anchor_hour must be an hour from 0 to 23." } satisfies AppError
  }
  if (gmailAlertAnchorMinute != null && (!Number.isInteger(gmailAlertAnchorMinute) || gmailAlertAnchorMinute < 0 || gmailAlertAnchorMinute > 59)) {
    throw { status: 400, message: "gmail_alert_anchor_minute must be a minute from 0 to 59." } satisfies AppError
  }

  let receiptReportStorePartitionKey: string | null = null
  if (body.receipt_report_store_partition_key != null) {
    const rawKey = typeof body.receipt_report_store_partition_key === "string"
      ? body.receipt_report_store_partition_key.trim().toLowerCase()
      : ""
    if (rawKey) {
      if (!/^[a-z0-9]{2,120}$/.test(rawKey) || rawKey === RECEIPT_STORE_PARTITION_UNKNOWN) {
        throw {
          status: 400,
          message: "receipt_report_store_partition_key is invalid.",
        } satisfies AppError
      }
      receiptReportStorePartitionKey = rawKey
    }
  }

  const roomNameRaw = typeof body.room_name === "string" ? body.room_name.trim() : ""
  const roomSortOrderRaw = body.room_sort_order
  let roomSortOrder: number | null = null
  if (roomSortOrderRaw != null && roomSortOrderRaw !== "") {
    const num = Number(roomSortOrderRaw)
    if (!Number.isInteger(num) || num < 0 || num > 1000000) {
      throw { status: 400, message: "room_sort_order must be an integer between 0 and 1000000 or null." } satisfies AppError
    }
    roomSortOrder = num
  }
  const deliveryHours = body.delivery_hours == null ? null : normalizeHours(body.delivery_hours, false)
  if (Array.isArray(deliveryHours) && deliveryHours.length === 0) {
    throw { status: 400, message: "delivery_hours must contain at least one hour or null." } satisfies AppError
  }

  const roomCleanupTiming = normalizeOptionalMessageCleanupTiming(body.message_cleanup_timing)
  const roomSummaryMode = normalizeOptionalLastDeliverySummaryMode(body.last_delivery_summary_mode)
  if (roomSummaryMode === "daily_rollup" && roomCleanupTiming === "after_each_delivery") {
    throw {
      status: 400,
      message: "last_delivery_summary_mode=daily_rollup requires message_cleanup_timing=end_of_day or null (inherit).",
    } satisfies AppError
  }

  let calendarReminderSlots: unknown = undefined
  if ("calendar_reminder_slots" in body) {
    calendarReminderSlots = body.calendar_reminder_slots == null
      ? null
      : (Array.isArray(body.calendar_reminder_slots) ? normalizeReminderSlots(body.calendar_reminder_slots) : null)
  }

  return {
    room_id: roomIdRaw,
    room_name: roomNameRaw || null,
    is_enabled: isEnabled,
    bot_reply_enabled: botReplyEnabled,
    bot_reply_hard_mute_enabled: botReplyHardMuteEnabled,
    send_room_summary: sendRoomSummaryFinal,
    receive_overall_summary_enabled: receiveOverallSummaryEnabled,
    calendar_tomorrow_reminder_enabled: roomTomorrowReminderEnabled,
    calendar_ai_auto_create_enabled: roomAiAutoCreateEnabled,
    calendar_silent_auto_register_enabled: roomSilentAutoRegisterEnabled,
    calendar_low_confidence_confirm_reply_enabled: roomLowConfidenceConfirmReplyEnabled,
    calendar_registration_reply_enabled: roomRegistrationReplyEnabled,
    message_search_enabled: messageSearchEnabled,
    message_search_library_enabled: messageSearchLibraryEnabled,
    media_file_access_enabled: mediaFileAccessEnabled,
    image_analysis_reply_enabled: imageAnalysisReplyEnabled,
    receipt_reply_executive_detail_enabled: receiptReplyExecutiveDetailEnabled,
    receipt_correction_reply_enabled: receiptCorrectionReplyEnabled,
    non_receipt_image_reply_enabled: nonReceiptImageReplyEnabled,
    gmail_reservation_alert_enabled: gmailReservationAlertEnabled,
    today_reservation_alert_enabled: todayReservationAlertEnabled,
    today_reservation_alert_hour: todayReservationAlertHour,
    today_reservation_alert_minute: todayReservationAlertMinute,
    ...(calendarReminderSlots !== undefined ? { calendar_reminder_slots: calendarReminderSlots } : {}),
    gmail_alert_interval_minutes: gmailAlertIntervalMinutes,
    gmail_alert_anchor_hour: gmailAlertAnchorHour,
    gmail_alert_anchor_minute: gmailAlertAnchorMinute,
    receipt_midreport_enabled: receiptMidreportEnabled,
    receipt_monthend_report_enabled: receiptMonthendReportEnabled,
    media_save_enabled: mediaSaveEnabled,
    review_alert_enabled: reviewAlertEnabled,
    budget_entry_enabled: budgetEntryEnabled,
    petty_receipt_analysis_enabled: pettyReceiptAnalysisEnabled,
    receipt_sales_registration_enabled: receiptSalesRegistrationEnabled,
    receipt_schedule_override: receiptScheduleOverride,
    receipt_midreport_day: receiptMidreportDay,
    receipt_midreport_hour: receiptMidreportHour,
    receipt_midreport_minute: receiptMidreportMinute,
    receipt_monthend_day: receiptMonthendDay,
    receipt_monthend_hour: receiptMonthendHour,
    receipt_monthend_minute: receiptMonthendMinute,
    receipt_report_store_partition_key: receiptReportStorePartitionKey,
    room_sort_order: roomSortOrder,
    delivery_hours: deliveryHours,
    message_cleanup_timing: roomCleanupTiming,
    last_delivery_summary_mode: roomSummaryMode,
  }
}

function buildLineUserPermissionPayload(body: unknown): LineUserPermissionRow {
  if (!isRecord(body)) {
    throw { status: 400, message: "Invalid JSON body." } satisfies AppError
  }
  const lineUserId = String(body.line_user_id ?? "").trim()
  if (!lineUserId) {
    throw { status: 400, message: "line_user_id is required." } satisfies AppError
  }
  const ensureBoolean = (value: unknown, key: string, fallback: boolean): boolean => {
    if (value == null) return fallback
    if (typeof value !== "boolean") {
      throw { status: 400, message: `${key} must be boolean when provided.` } satisfies AppError
    }
    return value
  }
  const displayNameRaw = typeof body.display_name === "string" ? body.display_name.trim() : ""
  let assignedStore: string | null = null
  if (body.assigned_store != null) {
    const raw = typeof body.assigned_store === "string" ? body.assigned_store.trim() : ""
    if (raw) {
      if (!isMarugoGroupStoreLabel(raw)) {
        throw { status: 400, message: "assigned_store must be one of the predefined store labels." } satisfies AppError
      }
      assignedStore = raw
    }
  }
  let assignedJobTitle: string | null = null
  if (body.assigned_job_title != null) {
    const raw = typeof body.assigned_job_title === "string" ? body.assigned_job_title.trim() : ""
    if (raw) {
      if (!isJobTitleLabel(raw)) {
        throw { status: 400, message: "assigned_job_title must be one of the predefined job titles." } satisfies AppError
      }
      assignedJobTitle = raw
    }
  }
  const excludedRoomIdsRaw = body.excluded_message_search_room_ids
  let excludedRoomIds: string[] = []
  if (excludedRoomIdsRaw != null) {
    if (!Array.isArray(excludedRoomIdsRaw)) {
      throw { status: 400, message: "excluded_message_search_room_ids must be string[] when provided." } satisfies AppError
    }
    excludedRoomIds = Array.from(new Set(excludedRoomIdsRaw
      .map((v) => String(v ?? "").trim())
      .filter((v) => v.length > 0)))
  }
  const canCalendarView = ensureBoolean(body.can_calendar_view, "can_calendar_view", true)
  let canCalendarCreate = ensureBoolean(body.can_calendar_create, "can_calendar_create", true)
  let canCalendarUpdate = ensureBoolean(body.can_calendar_update, "can_calendar_update", true)
  if (!canCalendarView) {
    canCalendarCreate = false
    canCalendarUpdate = false
  }
  return {
    line_user_id: lineUserId,
    display_name: displayNameRaw || null,
    is_active: ensureBoolean(body.is_active, "is_active", true),
    can_message_search: ensureBoolean(body.can_message_search, "can_message_search", true),
    can_library_search: ensureBoolean(body.can_library_search, "can_library_search", true),
    can_calendar_create: canCalendarCreate,
    can_calendar_update: canCalendarUpdate,
    can_calendar_view: canCalendarView,
    can_media_access: ensureBoolean(body.can_media_access, "can_media_access", true),
    excluded_message_search_room_ids: excludedRoomIds,
    assigned_store: assignedStore,
    assigned_job_title: assignedJobTitle,
    updated_at: new Date().toISOString(),
  }
}

function normalizeHours(value: unknown, allowNull: boolean): number[] | null {
  if (value == null) {
    return allowNull ? null : []
  }

  if (!Array.isArray(value)) {
    throw { status: 400, message: "delivery_hours must be an array of integers 0-23." } satisfies AppError
  }

  const hours: number[] = []
  for (const item of value) {
    const num = Number(item)
    if (!Number.isInteger(num) || num < 0 || num > 23) {
      throw { status: 400, message: "delivery_hours must be an array of integers 0-23." } satisfies AppError
    }
    if (!hours.includes(num)) {
      hours.push(num)
    }
  }
  hours.sort((a, b) => a - b)
  return hours
}

function normalizeMessageCleanupTiming(value: unknown): MessageCleanupTiming {
  if (value == null) return "after_each_delivery"
  if (value === "after_each_delivery" || value === "end_of_day") return value
  throw {
    status: 400,
    message: "message_cleanup_timing must be either after_each_delivery or end_of_day.",
  } satisfies AppError
}

function normalizeLastDeliverySummaryMode(value: unknown): LastDeliverySummaryMode {
  if (value == null) return "independent"
  if (value === "independent" || value === "daily_rollup") return value
  throw {
    status: 400,
    message: "last_delivery_summary_mode must be either independent or daily_rollup.",
  } satisfies AppError
}

function normalizeMessageRetentionDays(value: unknown): MessageRetentionDays {
  if (value == null || value === "") return 365
  const days = Number(value)
  if (days === 0 || days === 60 || days === 120 || days === 180 || days === 365 || days === 730 || days === 1095) {
    return days
  }
  throw {
    status: 400,
    message: "message_retention_days must be one of 0, 60, 120, 180, 365, 730, or 1095.",
  } satisfies AppError
}

function normalizeMediaUploadMaxMb(value: unknown): number {
  if (value == null || value === "") return DEFAULT_MEDIA_UPLOAD_MAX_MB
  const mb = Number(value)
  if (!Number.isInteger(mb) || mb < 1 || mb > MAX_MEDIA_UPLOAD_MAX_MB) {
    throw {
      status: 400,
      message: `media_upload_max_mb must be an integer between 1 and ${MAX_MEDIA_UPLOAD_MAX_MB}.`,
    } satisfies AppError
  }
  return mb
}

function normalizeOptionalMessageCleanupTiming(value: unknown): MessageCleanupTiming | null {
  if (value == null || value === "") return null
  return normalizeMessageCleanupTiming(value)
}

function normalizeOptionalLastDeliverySummaryMode(value: unknown): LastDeliverySummaryMode | null {
  if (value == null || value === "") return null
  return normalizeLastDeliverySummaryMode(value)
}

function secureEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder()
  const aBytes = encoder.encode(a)
  const bBytes = encoder.encode(b)
  if (aBytes.length !== bBytes.length) return false

  let result = 0
  for (let i = 0; i < aBytes.length; i += 1) {
    result |= aBytes[i] ^ bBytes[i]
  }
  return result === 0
}

/**
 * Supabase のサーバー専用キーを一定時間比較で検証する。
 *
 * 既存プロジェクトの legacy service_role と、新APIキー移行後にEdgeへ
 * JSONで注入される SUPABASE_SECRET_KEYS の両方を受ける。どちらも
 * service_role相当の秘匿キーであり、ブラウザへ公開してはならない。
 */
function isInternalSupabaseServerKey(provided: string): boolean {
  const candidate = String(provided || "").trim()
  if (!candidate) return false

  const expectedKeys = new Set<string>()
  const legacyKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim()
  if (legacyKey) expectedKeys.add(legacyKey)

  const secretKeysJson = String(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "").trim()
  if (secretKeysJson) {
    try {
      const parsed = JSON.parse(secretKeysJson)
      if (isRecord(parsed)) {
        const defaultKey = typeof parsed.default === "string" ? parsed.default.trim() : ""
        if (defaultKey.startsWith("sb_secret_")) expectedKeys.add(defaultKey)
      }
    } catch {
      // 不正な環境変数は認証失敗として扱い、legacyキー以外へは広げない。
    }
  }

  for (const expected of expectedKeys) {
    if (secureEqual(candidate, expected)) return true
  }
  return false
}

async function parseJson(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    throw { status: 400, message: "Request body must be valid JSON." } satisfies AppError
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function toSafeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function toNonNegativeInteger(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.floor(parsed)
}

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback
  const normalized = String(value).trim().toLowerCase()
  if (!normalized) return fallback
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false
  return fallback
}

function normalizePath(pathname: string): string {
  const stripped = pathname
    .replace(/^\/functions\/v1\/admin-api/, "")
    .replace(/^\/admin-api/, "")
  return stripped || "/"
}

// レシート画像解析は Gemini Flash Lite が通常経路。Azure は障害時の退避先。
const AI_USAGE_GEMINI_MODEL = "gemini-3.1-flash-lite"
// レシート画像解析に Claude(Haiku) を使う店舗（line-webhook の CLAUDE_RECEIPT_STORE_KEYS と同一）。
// ＋経費（小口）の再解析も Claude を使うため、claude バケットには「claudia2の売上解析」と「全店の経費解析」のトークンが入る。
const AI_USAGE_CLAUDE_STORE_KEYS = new Set<string>(["claudia2"])
const AI_USAGE_CLAUDE_MODEL = "claude-haiku-4-5"
const AI_USAGE_AZURE_MODEL = AZURE_FOUNDRY_VISION_MODEL
const AI_USAGE_OPENAI_MODEL = "gpt-5.6-luna"
const AI_USAGE_GROK_MODEL = "grok-3-mini"

type AiUsageStoreRow = {
  store_partition_key: string
  display_name: string
  image_count: number
  receipt_count: number
}

type AiUsageProviderBucket = {
  provider: "azure_openai" | "gemini" | "claude" | "openai" | "grok"
  model: string
  store_count: number
  image_count: number
  receipt_count: number
  // 実測トークン（ai_usage_events 由来。記録開始以降のみ）。
  event_count: number
  input_tokens: number
  output_tokens: number
  thinking_tokens: number
  total_tokens: number
  stores: AiUsageStoreRow[]
}

// AI使用料（概算）: 店舗別の画像解析回数を Groq / Gemini に振り分けて合計を返す（ルーム単位ではなく合計）。
async function fetchAiUsageCostState(
  supabase: ReturnType<typeof createClient>,
  url: URL,
): Promise<Record<string, unknown>> {
  const fromParam = String(url.searchParams.get("from") ?? "").trim()
  const toParam = String(url.searchParams.get("to") ?? "").trim()
  const p_from = fromParam || null
  const p_to = toParam || null

  const { data, error } = await supabase.rpc("ai_usage_image_counts", { p_from, p_to })
  if (error) {
    throw { status: 500, message: `ai_usage_image_counts failed: ${error.message}` } satisfies AppError
  }
  const rows = Array.isArray(data) ? data : []

  const gemini: AiUsageProviderBucket = {
    provider: "gemini",
    model: AI_USAGE_GEMINI_MODEL,
    store_count: 0,
    image_count: 0,
    receipt_count: 0,
    event_count: 0,
    input_tokens: 0,
    output_tokens: 0,
    thinking_tokens: 0,
    total_tokens: 0,
    stores: [],
  }
  const azure: AiUsageProviderBucket = {
    provider: "azure_openai",
    model: AI_USAGE_AZURE_MODEL,
    store_count: 0,
    image_count: 0,
    receipt_count: 0,
    event_count: 0,
    input_tokens: 0,
    output_tokens: 0,
    thinking_tokens: 0,
    total_tokens: 0,
    stores: [],
  }
  const claude: AiUsageProviderBucket = {
    provider: "claude",
    model: AI_USAGE_CLAUDE_MODEL,
    store_count: 0,
    image_count: 0,
    receipt_count: 0,
    event_count: 0,
    input_tokens: 0,
    output_tokens: 0,
    thinking_tokens: 0,
    total_tokens: 0,
    stores: [],
  }
  const openai: AiUsageProviderBucket = {
    provider: "openai",
    model: AI_USAGE_OPENAI_MODEL,
    store_count: 0,
    image_count: 0,
    receipt_count: 0,
    event_count: 0,
    input_tokens: 0,
    output_tokens: 0,
    thinking_tokens: 0,
    total_tokens: 0,
    stores: [],
  }
  const grok: AiUsageProviderBucket = {
    provider: "grok",
    model: AI_USAGE_GROK_MODEL,
    store_count: 0,
    image_count: 0,
    receipt_count: 0,
    event_count: 0,
    input_tokens: 0,
    output_tokens: 0,
    thinking_tokens: 0,
    total_tokens: 0,
    stores: [],
  }

  // ai_usage_image_counts は過去の受信画像数で、どのAIが実際に応答したかは判別できない。
  // Azureへ一括帰属させると、Flash Lite移行後もAzure利用に見えてしまうため、費用表示は
  // ai_usage_events の実測ログだけを正本にする（rows は後方互換のため取得のみ維持）。
  void rows
  gemini.stores.sort((a, b) => b.image_count - a.image_count)
  azure.stores.sort((a, b) => b.image_count - a.image_count)
  claude.stores.sort((a, b) => b.image_count - a.image_count)

  // 実測トークン（ai_usage_events）をプロバイダ別に合算してバケットに足し込む。
  // provider は実際に応答したプロバイダ。旧Groqイベントは履歴としてDBに残し、この画面の集計からは除外する。
  const { data: tokenData, error: tokenError } = await supabase.rpc("ai_usage_token_totals", { p_from, p_to })
  if (tokenError) {
    throw { status: 500, message: `ai_usage_token_totals failed: ${tokenError.message}` } satisfies AppError
  }
  for (const raw of (Array.isArray(tokenData) ? tokenData : [])) {
    const r = raw as Record<string, unknown>
    const provider = String(r.provider ?? "").trim()
    const bucket = provider === "azure_openai"
      ? azure
      : provider === "gemini"
      ? gemini
      : provider === "claude"
      ? claude
      : provider === "openai"
      ? openai
      : provider === "grok" || provider === "xai"
      ? grok
      : null
    if (!bucket) continue
    bucket.event_count += Number(r.event_count ?? 0) || 0
    bucket.input_tokens += Number(r.input_tokens ?? 0) || 0
    bucket.output_tokens += Number(r.output_tokens ?? 0) || 0
    bucket.thinking_tokens += Number(r.thinking_tokens ?? 0) || 0
    bucket.total_tokens += Number(r.total_tokens ?? 0) || 0
  }

  // モデル別の実測トークン（provider×model 粒度）。AI使用料をモデル別の公式単価で正確に計算するため。
  const { data: modelData, error: modelError } = await supabase.rpc("ai_usage_model_totals", { p_from, p_to })
  if (modelError) {
    throw { status: 500, message: `ai_usage_model_totals failed: ${modelError.message}` } satisfies AppError
  }
  const models = (Array.isArray(modelData) ? modelData : []).map((raw) => {
    const r = raw as Record<string, unknown>
    return {
      provider: String(r.provider ?? ""),
      model: String(r.model ?? "(unknown)"),
      event_count: Number(r.event_count ?? 0) || 0,
      input_tokens: Number(r.input_tokens ?? 0) || 0,
      output_tokens: Number(r.output_tokens ?? 0) || 0,
      thinking_tokens: Number(r.thinking_tokens ?? 0) || 0,
      total_tokens: Number(r.total_tokens ?? 0) || 0,
    }
  }).filter((row) => row.provider !== "groq")

  // MARUGO S のフードコート分析(Q&A・テナント表画像抽出・東京ドーム抽出)だけを surface='foodcourt' で抽出。
  // 同じ marugoS でもレシート解析(surface=null)とは混ぜず、別表示できるようにする。
  const FOODCOURT_STORE_KEY = "marugoS"
  let foodcourtModels: Array<Record<string, unknown>> = []
  const { data: fcData, error: fcError } = await supabase.rpc("ai_usage_surface_model_totals", {
    p_from, p_to, p_store: FOODCOURT_STORE_KEY, p_surface: "foodcourt",
  })
  if (fcError) {
    console.error("ai_usage_surface_model_totals failed:", fcError.message)
  } else {
    foodcourtModels = (Array.isArray(fcData) ? fcData : []).map((raw) => {
      const r = raw as Record<string, unknown>
      return {
        provider: String(r.provider ?? ""),
        model: String(r.model ?? "(unknown)"),
        event_count: Number(r.event_count ?? 0) || 0,
        input_tokens: Number(r.input_tokens ?? 0) || 0,
        output_tokens: Number(r.output_tokens ?? 0) || 0,
        thinking_tokens: Number(r.thinking_tokens ?? 0) || 0,
        total_tokens: Number(r.total_tokens ?? 0) || 0,
      }
    }).filter((row) => row.provider !== "groq")
  }

  // Journal Report 用途（AI分析・チャット・確認質問 / 旧 pos_journal）。
  // store_key|store クエリがあればその店舗のみ。無ければ全店舗のジャーナル用途。
  const journalStoreParam = String(
    url.searchParams.get("store_key") ?? url.searchParams.get("store") ?? "",
  ).trim() || null
  const mapSurfaceRow = (raw: unknown) => {
    const r = raw as Record<string, unknown>
    return {
      provider: String(r.provider ?? ""),
      model: String(r.model ?? "(unknown)"),
      event_count: Number(r.event_count ?? 0) || 0,
      input_tokens: Number(r.input_tokens ?? 0) || 0,
      output_tokens: Number(r.output_tokens ?? 0) || 0,
      thinking_tokens: Number(r.thinking_tokens ?? 0) || 0,
      total_tokens: Number(r.total_tokens ?? 0) || 0,
    }
  }
  const mergeModelTotals = (
    rows: Array<ReturnType<typeof mapSurfaceRow>>,
  ) => {
    const merged = new Map<string, ReturnType<typeof mapSurfaceRow>>()
    for (const row of rows) {
      if (row.provider === "groq") continue
      const key = `${row.provider}\0${row.model}`
      const prev = merged.get(key)
      if (!prev) {
        merged.set(key, { ...row })
        continue
      }
      prev.event_count += row.event_count
      prev.input_tokens += row.input_tokens
      prev.output_tokens += row.output_tokens
      prev.thinking_tokens += row.thinking_tokens
      prev.total_tokens += row.total_tokens
    }
    return [...merged.values()]
  }
  let journalModels: Array<ReturnType<typeof mapSurfaceRow>> = []
  const journalSurfaceRows: Array<ReturnType<typeof mapSurfaceRow>> = []
  for (const surface of ["journal", "journal_foodcourt", "pos_journal"] as const) {
    const { data: jData, error: jError } = await supabase.rpc(
      "ai_usage_surface_model_totals",
      { p_from, p_to, p_store: journalStoreParam, p_surface: surface },
    )
    if (jError) {
      console.error(
        `ai_usage_surface_model_totals(${surface}) failed:`,
        jError.message,
      )
      continue
    }
    for (const raw of (Array.isArray(jData) ? jData : [])) {
      journalSurfaceRows.push(mapSurfaceRow(raw))
    }
  }
  journalModels = mergeModelTotals(journalSurfaceRows)

  // M-talk雑談AI（Web検索=Perplexity ＋ 文章化=Groq）。全店舗合算で返す。
  // ここは journal/foodcourt と違い groq を落とさない。旧Groqイベントの混入が無い
  // 新しい用途タグで、Groqの文章化コストも実費の一部だから。
  let mtalkModels: Array<ReturnType<typeof mapSurfaceRow>> = []
  const { data: mtalkData, error: mtalkError } = await supabase.rpc(
    "ai_usage_surface_model_totals",
    { p_from, p_to, p_store: null, p_surface: "mtalk" },
  )
  if (mtalkError) {
    console.error("ai_usage_surface_model_totals(mtalk) failed:", mtalkError.message)
  } else {
    mtalkModels = (Array.isArray(mtalkData) ? mtalkData : []).map(mapSurfaceRow)
  }

  // 時系列データ（日次）
  let dailyTotals: Array<Record<string, unknown>> = []
  const { data: dailyData, error: dailyError } = await supabase.rpc("ai_usage_time_series", {
    p_from, p_to, p_by: "day"
  })
  if (dailyError) {
    console.error("ai_usage_time_series daily failed:", dailyError.message)
  } else {
    dailyTotals = (Array.isArray(dailyData) ? dailyData : []).map((raw) => {
      const r = raw as Record<string, unknown>
      return {
        period_date: String(r.period_date ?? ""),
        provider: String(r.provider ?? ""),
        model: String(r.model ?? "(unknown)"),
        event_count: Number(r.event_count ?? 0) || 0,
        input_tokens: Number(r.input_tokens ?? 0) || 0,
        output_tokens: Number(r.output_tokens ?? 0) || 0,
        thinking_tokens: Number(r.thinking_tokens ?? 0) || 0,
        total_tokens: Number(r.total_tokens ?? 0) || 0,
      }
    }).filter((row) => row.provider !== "groq")
  }

  // 時系列データ（月次）: 月次は全体の推移が見たいため p_from, p_to は null (全期間)で取得
  let monthlyTotals: Array<Record<string, unknown>> = []
  const { data: monthlyData, error: monthlyError } = await supabase.rpc("ai_usage_time_series", {
    p_from: null, p_to: null, p_by: "month"
  })
  if (monthlyError) {
    console.error("ai_usage_time_series monthly failed:", monthlyError.message)
  } else {
    monthlyTotals = (Array.isArray(monthlyData) ? monthlyData : []).map((raw) => {
      const r = raw as Record<string, unknown>
      return {
        period_date: String(r.period_date ?? ""),
        provider: String(r.provider ?? ""),
        model: String(r.model ?? "(unknown)"),
        event_count: Number(r.event_count ?? 0) || 0,
        input_tokens: Number(r.input_tokens ?? 0) || 0,
        output_tokens: Number(r.output_tokens ?? 0) || 0,
        thinking_tokens: Number(r.thinking_tokens ?? 0) || 0,
        total_tokens: Number(r.total_tokens ?? 0) || 0,
      }
    }).filter((row) => row.provider !== "groq")
  }

  return {
    period: { from: p_from, to: p_to },
    azure,
    gemini,
    claude,
    openai,
    grok,
    models,
    foodcourt: { store: FOODCOURT_STORE_KEY, models: foodcourtModels },
    journal: {
      store: journalStoreParam,
      surfaces: ["journal", "journal_foodcourt", "pos_journal"],
      models: journalModels,
    },
    mtalk: { surfaces: ["mtalk"], models: mtalkModels },
    daily_totals: dailyTotals,
    monthly_totals: monthlyTotals,
    generated_at: new Date().toISOString(),
  }
}

function asAppError(error: unknown): AppError {
  if (isRecord(error) && typeof error.status === "number" && typeof error.message === "string") {
    return { status: error.status, message: error.message }
  }
  return { status: 500, message: error instanceof Error ? error.message : "Internal Server Error" }
}

async function invokeReceiptMidreportCronTestSend(opts: {
  supabaseUrl: string
  serviceRoleKey: string
  testKey: string
  roomId: string
  reportKind: "mid_month" | "month_end"
  year?: number
  month?: number
  storePartitionKey?: string
}): Promise<{ status: number; payload: unknown }> {
  const base = opts.supabaseUrl.replace(/\/+$/, "")
  const url = new URL(`${base}/functions/v1/receipt-midreport-cron`)
  url.searchParams.set("test_receipt_report", "1")
  url.searchParams.set("room_id", opts.roomId)
  url.searchParams.set("report_kind", opts.reportKind)
  if (opts.year != null) url.searchParams.set("year", String(opts.year))
  if (opts.month != null) url.searchParams.set("month", String(opts.month))
  if (opts.storePartitionKey) url.searchParams.set("store_partition_key", opts.storePartitionKey)

  // Edge ゲートウェイは verify_jwt=false でも「Authorization に無効なJWTを載せた」リクエストを関数到達前に 401 で弾く。
  // service_role を Bearer に載せると環境（新APIキー方式への移行後など service_role/anon が非JWTになると）に
  // よっては無効JWT扱いで 401(deployment_id=null) になり、テスト経路に到達しない。本番ログ＋pg_net 再現で、
  // (a) 無認証 (b) apikey のみ のいずれも関数に到達（403=鍵未指定）することを確認済み。
  // テスト経路の認可は X-Receipt-Midreport-Test-Key（admin-api と cron で同一シークレット）で行うため、
  // Authorization は付けない。apikey は anon があれば付与（無くても匿名通過するので必須ではない）。
  const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim()

  const headers: Record<string, string> = {
    "X-Receipt-Midreport-Test-Key": opts.testKey,
  }
  if (anonKey) headers["apikey"] = anonKey

  const res = await fetch(url.toString(), {
    method: "GET",
    headers,
  })
  const text = await res.text()
  let payload: unknown
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    payload = { ok: false, error: "Invalid JSON from receipt-midreport-cron", raw: text.slice(0, 500) }
  }
  return { status: res.status, payload }
}

function resolveAdminSurface(req: Request, url: URL): string {
  const header = String(req.headers.get("x-admin-surface") ?? "").trim().toLowerCase()
  if (header === ADMIN_SURFACE_LINE_REPORT) return ADMIN_SURFACE_LINE_REPORT
  const query = String(url.searchParams.get("admin_surface") ?? "").trim().toLowerCase()
  if (query === ADMIN_SURFACE_LINE_REPORT) return ADMIN_SURFACE_LINE_REPORT
  return ADMIN_SURFACE_LEGACY
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  })
}
