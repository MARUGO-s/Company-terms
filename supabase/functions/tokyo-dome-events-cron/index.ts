import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.0"
import { normalizeBaseballCategory, parseTokyoDomeSchedule, type ExtractedTokyoDomeEvent } from "../_shared/tokyo_dome_schedule.ts"
import { GROQ_TEXT_FALLBACK_MODEL, resolveGroqTextModel } from "../_shared/groq_model.ts"
import { isInternalCronAuthorized } from "../_shared/internal_cron_auth.ts"

// 東京ドーム＋ドームシティ各会場の公式イベント予定を取得し、tokyo_dome_events へ upsert する cron。
// マルゴS（東京ドーム内フードコート）の客数・売上との相関分析に使う。分析専用・送信なし。
//
// 仕組み:
//  - 東京ドーム本体: 公式スケジュールHTML → タグ除去でテキスト化 → 確定パース(主)／Groq抽出(従)。venue='tokyo-dome'。
//  - ドームシティ各ホール(カナデビアホール=旧TOKYO DOME CITY HALL／後楽園ホール): 公式カレンダーHTML
//    （c-mod-calender 構造）を共通の確定パーサで解析。venue='kanadevia'/'korakuen'。
// 冪等(主キー event_date+venue+title の upsert)。verify_jwt=false で pg_cron から起動。

type DbClient = ReturnType<typeof createClient>

const DEFAULT_SCHEDULE_URL = "https://www.tokyo-dome.co.jp/dome/event/schedule.html"
const DEFAULT_KANADEVIA_URL = "https://www.tokyo-dome.co.jp/tdc-hall/event/"
const DEFAULT_KORAKUEN_URL = "https://www.tokyo-dome.co.jp/hall/event/"
// ドームシティ各ホール（同じカレンダーHTML構造）。source はデータ出所の記録用。
const DOME_CITY_HALLS: Array<{ venue: string; envKey: string; url: string; source: string }> = [
  { venue: "kanadevia", envKey: "KANADEVIA_SCHEDULE_URL", url: DEFAULT_KANADEVIA_URL, source: "tokyo-dome.co.jp/tdc-hall" },
  { venue: "korakuen", envKey: "KORAKUEN_SCHEDULE_URL", url: DEFAULT_KORAKUEN_URL, source: "tokyo-dome.co.jp/hall" },
]
const MAX_TEXT_CHARS = 40000
// スポーツ中継=パブリックビューイング(PV)放映（W杯/WBC/世界ボクシング/五輪等）。この cron は東京ドーム本体/各ホールの
// 開催イベントのみ書き込み、PV放映は別経路（定期Web検索ルーティン）が venue='public-viewing' で投入する。
const VALID_CATEGORIES = new Set(["プロ野球", "アマ野球", "ライブ", "スポーツ中継", "その他"])

type ExtractedEvent = ExtractedTokyoDomeEvent

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  const groqApiKey = (Deno.env.get("GROQ_API_KEY") ?? "").trim()
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing." }, 500)
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey) as unknown as DbClient
  if (!(await isInternalCronAuthorized(req, supabase))) {
    return json({ ok: false, error: "Unauthorized" }, 401)
  }
  if (!groqApiKey) {
    return json({ ok: false, error: "GROQ_API_KEY is missing." }, 500)
  }

  const url = new URL(req.url)
  const dryRun = ["1", "true", "yes", "on"].includes((url.searchParams.get("dry_run") ?? "").toLowerCase())
  const debug = ["1", "true", "yes", "on"].includes((url.searchParams.get("debug") ?? "").toLowerCase())
  const scheduleUrl = (Deno.env.get("TOKYO_DOME_SCHEDULE_URL") ?? "").trim() || DEFAULT_SCHEDULE_URL

  // 1) 東京ドーム本体: 公式スケジュール取得→テキスト化→抽出（確定パース主経路）。失敗しても各ホールは続行。
  let domeEvents: ExtractedEvent[] = []
  let domeUsage: DomeAiUsage | null = null
  let domeRaw: string | null = null
  let domeError: string | null = null
  try {
    const res = await fetch(scheduleUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; line-report-bot/1.0)" } })
    if (!res.ok) { domeError = `fetch ${res.status}` }
    else {
      const text = htmlToText(await res.text()).slice(0, MAX_TEXT_CHARS)
      if (text.length < 40) { domeError = `text too short (${text.length})` }
      else { const ex = await extractEvents(text, groqApiKey); domeEvents = ex.events ?? []; domeUsage = ex.usage; domeRaw = ex.raw }
    }
  } catch (e) { domeError = e instanceof Error ? e.message : String(e) }

  // 2) ドームシティ各ホール（カナデビア／後楽園）: 共通カレンダーHTMLを確定パース。会場ごとに独立して取得。
  const hallResults: Array<{ venue: string; source: string; events: ExtractedEvent[]; error: string | null }> = []
  for (const h of DOME_CITY_HALLS) {
    const hallUrl = (Deno.env.get(h.envKey) ?? "").trim() || h.url
    let events: ExtractedEvent[] = []
    let err: string | null = null
    try {
      const hres = await fetch(hallUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; line-report-bot/1.0)" } })
      if (!hres.ok) { err = `fetch ${hres.status}` }
      else { events = parseDomeCityHallCalendar(await hres.text()) }
    } catch (e) { err = e instanceof Error ? e.message : String(e) }
    hallResults.push({ venue: h.venue, source: h.source, events, error: err })
  }
  const totalHall = hallResults.reduce((s, r) => s + r.events.length, 0)

  // 2b) IMMシアター: IMMシアター公式サイトのスケジュールを独自にパース
  const immUrl = (Deno.env.get("IMM_THEATER_SCHEDULE_URL") ?? "").trim() || "https://imm.theater/schedule/"
  let immEvents: ExtractedEvent[] = []
  let immError: string | null = null
  try {
    const immRes = await fetch(immUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; line-report-bot/1.0)" } })
    if (!immRes.ok) { immError = `fetch ${immRes.status}` }
    else { immEvents = parseImmTheaterSchedule(await immRes.text()) }
  } catch (e) { immError = e instanceof Error ? e.message : String(e) }

  if (domeEvents.length === 0 && totalHall === 0 && immEvents.length === 0) {
    return json({ ok: false, error: "no events extracted (dome+halls+imm)", dome_error: domeError, halls: hallResults.map((r) => ({ venue: r.venue, error: r.error })), imm_error: immError }, 200)
  }

  if (dryRun || debug) {
    return json({
      ok: true, dry_run: true,
      dome: { count: domeEvents.length, error: domeError, events: domeEvents },
      halls: hallResults.map((r) => ({ venue: r.venue, count: r.events.length, error: r.error, events: r.events })),
      imm: { count: immEvents.length, error: immError, events: immEvents },
      ...(debug ? { groq_raw: (domeRaw ?? "").slice(0, 1000) } : {}),
    }, 200)
  }

  // 3) upsert（冪等。主キー event_date+venue+title）。会場ごとに venue を付与。
  // 東京ドーム抽出でLLMフォールバックを使った場合のみ、実測トークンをAI使用料に記録（確定パース時は usage=null）。
  if (domeUsage) {
    try {
      await supabase.from("ai_usage_events").insert({
        store_partition_key: "marugoS",
        provider: "groq",
        model: domeUsage.model,
        input_tokens: domeUsage.inputTokens,
        output_tokens: domeUsage.outputTokens,
        thinking_tokens: null,
        total_tokens: domeUsage.totalTokens,
        line_message_id: null,
        surface: "foodcourt", // 用途タグ: フードコート分析(東京ドームイベント抽出)
      })
    } catch (e) {
      console.error("tokyo-dome ai_usage_events insert threw:", e instanceof Error ? e.message : String(e))
    }
  }
  const now = new Date().toISOString()
  const rows = [
    ...domeEvents.map((e) => ({ event_date: e.event_date, venue: "tokyo-dome", title: e.title, category: normalizeBaseballCategory(e.title, e.category), source: "tokyo-dome.co.jp", updated_at: now })),
    ...hallResults.flatMap((r) => r.events.map((e) => ({ event_date: e.event_date, venue: r.venue, title: e.title, category: e.category, source: r.source, updated_at: now }))),
    ...immEvents.map((e) => ({ event_date: e.event_date, venue: "imm", title: e.title, category: e.category, source: "imm.theater", updated_at: now })),
  ]
  const { error } = await supabase
    .from("tokyo_dome_events")
    .upsert(rows, { onConflict: "event_date,venue,title" })
  if (error) {
    return json({ ok: false, error: `upsert failed: ${error.message}`, extracted: rows.length }, 500)
  }

  // The official schedule is a snapshot, while upsert alone only adds/updates rows.
  // Reconcile deterministic Tokyo Dome results so corrected dates/titles do not
  // leave stale official rows in DB. Never reconcile an LLM fallback or another source.
  let domeStaleDeleted = 0
  let domeReconcileError: string | null = null
  if ((domeRaw ?? "").startsWith("deterministic:") && domeEvents.length >= 3) {
    const sortedDates = domeEvents.map((event) => event.event_date).sort()
    const minDate = sortedDates[0]
    const maxDate = sortedDates[sortedDates.length - 1]
    const freshKeys = new Set(domeEvents.map((event) => `${event.event_date}__${event.title}`))
    const { data: existing, error: existingError } = await supabase
      .from("tokyo_dome_events")
      .select("event_date,title")
      .eq("venue", "tokyo-dome")
      .eq("source", "tokyo-dome.co.jp")
      .gte("event_date", minDate)
      .lte("event_date", maxDate)

    if (existingError) {
      domeReconcileError = `snapshot load failed: ${existingError.message}`
    } else {
      for (const row of (Array.isArray(existing) ? existing : [])) {
        const eventDate = String((row as { event_date?: unknown }).event_date ?? "").slice(0, 10)
        const title = String((row as { title?: unknown }).title ?? "")
        if (!eventDate || !title || freshKeys.has(`${eventDate}__${title}`)) continue
        const { error: deleteError } = await supabase
          .from("tokyo_dome_events")
          .delete()
          .eq("event_date", eventDate)
          .eq("venue", "tokyo-dome")
          .eq("title", title)
          .eq("source", "tokyo-dome.co.jp")
        if (deleteError) {
          domeReconcileError = `stale delete failed (${eventDate} ${title}): ${deleteError.message}`
          break
        }
        domeStaleDeleted++
      }
    }
  }

  const allDates = rows.map((r) => r.event_date).sort()

  // 4) Pro-Baseball Giants Game details Sync (from baseball-freak.com/audience/giants.html & /game/giants.html)
  // 東京ドームでのプロ野球開催日の観客動員数・開始時間・試合時間・勝敗結果を自動取得して tokyo_dome_events に反映する。
  let giantsSyncCount = 0
  let giantsError: string | null = null
  try {
    const [audRes, gameRes] = await Promise.all([
      fetch("https://baseball-freak.com/audience/giants.html", { headers: { "User-Agent": "Mozilla/5.0 (compatible; line-report-bot/1.0)" } }),
      fetch("https://baseball-freak.com/game/giants.html", { headers: { "User-Agent": "Mozilla/5.0 (compatible; line-report-bot/1.0)" } })
    ])
    
    if (!audRes.ok) {
      giantsError = `fetch giants audience ${audRes.status}`
    } else if (!gameRes.ok) {
      giantsError = `fetch giants games ${gameRes.status}`
    } else {
      const audHtml = await audRes.text()
      const gameHtml = await gameRes.text()
      
      let year = new Date().getFullYear()
      const yearMatch = audHtml.match(/<strong>(\d{4})年<\/strong>/)
      if (yearMatch) {
        year = parseInt(yearMatch[1], 10)
      }
      
      interface GiantsDateMap {
        [date: string]: {
          attendance?: number
          result?: string
          duration?: string
          stadium?: string
          startTime?: string
          score?: string
          margin?: number
          opponent?: string
        }
      }
      const dataMap: GiantsDateMap = {}
      
      // Parse audience html
      const audTrRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
      let audTrMatch
      while ((audTrMatch = audTrRegex.exec(audHtml)) !== null) {
        const trContent = audTrMatch[1]
        const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi
        const tds: string[] = []
        let tdMatch
        while ((tdMatch = tdRegex.exec(trContent)) !== null) {
          tds.push(tdMatch[1])
        }
        
        if (tds.length >= 8) {
          const dateText = tds[0].replace(/<[^>]+>/g, "").trim()
          const dateParts = dateText.match(/(\d{1,2})月(\d{1,2})日/)
          if (!dateParts) continue
          
          const month = dateParts[1].padStart(2, "0")
          const day = dateParts[2].padStart(2, "0")
          const dateString = `${year}-${month}-${day}`
          
          const attText = tds[1].replace(/<[^>]+>/g, "").trim()
          const numString = attText.replace(/[^\d]/g, "")
          const attendance = parseInt(numString, 10)
          
          const result = tds[2].replace(/<[^>]+>/g, "").trim() // ○, ●, △
          const score = tds[3].replace(/<[^>]+>/g, "").trim() // e.g. 3 - 1
          const opponent = tds[4].replace(/<[^>]+>/g, "").trim() // e.g. 阪神
          const duration = tds[6].replace(/<[^>]+>/g, "").trim() // e.g. 2:23
          const stadium = tds[7].replace(/<[^>]+>/g, "").trim()
          
          // Calculate score margin
          let margin: number | undefined = undefined
          const parts = score.split("-")
          if (parts.length === 2) {
            const s1 = parseInt(parts[0].trim(), 10)
            const s2 = parseInt(parts[1].trim(), 10)
            if (!isNaN(s1) && !isNaN(s2)) {
              margin = Math.abs(s1 - s2)
            }
          }
          
          dataMap[dateString] = { attendance: isNaN(attendance) ? undefined : attendance, result, duration, stadium, score, margin, opponent }
        }
      }
      
      // Parse game html for start times
      const gameTrRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
      let gameTrMatch
      while ((gameTrMatch = gameTrRegex.exec(gameHtml)) !== null) {
        const trContent = gameTrMatch[1]
        const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi
        const tds: string[] = []
        let tdMatch
        while ((tdMatch = tdRegex.exec(trContent)) !== null) {
          tds.push(tdMatch[1])
        }
        
        if (tds.length >= 8) {
          const dateText = tds[0].replace(/<[^>]+>/g, "").trim()
          const dateParts = dateText.match(/(\d{1,2})月(\d{1,2})日/)
          if (!dateParts) continue
          
          const month = dateParts[1].padStart(2, "0")
          const day = dateParts[2].padStart(2, "0")
          const dateString = `${year}-${month}-${day}`
          
          const startTime = tds[7].replace(/<[^>]+>/g, "").trim() // e.g. 18:15
          if (dataMap[dateString]) {
            dataMap[dateString].startTime = startTime
          }
        }
      }
      
      // Write merged results to Supabase
      for (const [dateString, info] of Object.entries(dataMap)) {
        // 1) Upsert to the dedicated giants_game_results table (all stadiums)
        if (info.opponent && info.stadium) {
          const { error: upsertErr } = await supabase
            .from("giants_game_results")
            .upsert({
              game_date: dateString,
              opponent: info.opponent,
              venue: info.stadium,
              attendance: info.attendance ?? null,
              game_result: info.result ?? null,
              game_score: info.score ?? null,
              score_margin: info.margin ?? null,
              game_duration: info.duration ?? null,
              start_time: info.startTime ?? null,
              updated_at: new Date().toISOString()
            })
          if (upsertErr) {
            console.error(`Failed to upsert to giants_game_results for date ${dateString}:`, upsertErr)
          }
        }

        // 2) Update tokyo_dome_events for matches held in Tokyo Dome
        if (info.stadium === "東京ドーム") {
          const { error: updateErr } = await supabase
            .from("tokyo_dome_events")
            .update({
              expected_attendance: info.attendance ?? null,
              start_time: info.startTime ?? null,
              game_duration: info.duration ?? null,
              game_result: info.result ?? null,
              game_score: info.score ?? null,
              score_margin: info.margin ?? null,
              updated_at: new Date().toISOString()
            })
            .eq("event_date", dateString)
            .eq("venue", "tokyo-dome")
            .eq("category", "プロ野球")
            
          if (updateErr) {
            console.error(`Failed to update Giants game details for date ${dateString}:`, updateErr)
          } else {
            giantsSyncCount++
          }
        }
      }
    }
  } catch (e) {
    giantsError = e instanceof Error ? e.message : String(e)
  }

  return json({
    ok: true,
    dome_upserted: domeEvents.length,
    halls_upserted: Object.fromEntries(hallResults.map((r) => [r.venue, r.events.length])),
    upserted: rows.length,
    dome_error: domeError,
    dome_stale_deleted: domeStaleDeleted,
    dome_reconcile_error: domeReconcileError,
    hall_errors: Object.fromEntries(hallResults.map((r) => [r.venue, r.error])),
    giants_audience_synced: giantsSyncCount,
    giants_audience_error: giantsError,
    date_range: { min: allDates[0] ?? null, max: allDates[allDates.length - 1] ?? null },
  }, 200)
})

// HTML→プレーンテキスト。script/style除去・タグをスペース化・主要エンティティ復号・空白圧縮。
function htmlToText(html: string): string {
  let t = String(html ?? "")
  t = t.replace(/<script[\s\S]*?<\/script>/gi, " ")
  t = t.replace(/<style[\s\S]*?<\/style>/gi, " ")
  t = t.replace(/<!--[\s\S]*?-->/g, " ")
  // 改行になりやすいブロック境界を改行に
  t = t.replace(/<\/(p|div|li|tr|h[1-6]|section|article|td|th)>/gi, "\n")
  t = t.replace(/<br\s*\/?>(?=)/gi, "\n")
  t = t.replace(/<[^>]+>/g, " ")
  t = t.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  // スマートクォート等（タイトルに含まれる）。シードと表記を揃えるため直線引用符へ寄せる。
  t = t.replace(/&lsquo;|&rsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&hellip;/g, "…").replace(/&middot;/g, "・").replace(/&#8217;/g, "'").replace(/&#8216;/g, "'")
  t = t.replace(/[ \t　]+/g, " ")
  t = t.replace(/\n{2,}/g, "\n").replace(/[ ]*\n[ ]*/g, "\n")
  return t.trim()
}

// ドームシティ各ホール（カナデビア／後楽園）の公式カレンダーHTMLを会場構造から確定パースする（共通構造）。
// 構造: 月見出し <p class="c-ttl-set-calender">YYYY年MM月</p> → <table> 内に
//   <tr class="c-mod-calender__item"> （<span class="c-mod-calender__day">DD</span> ＋ <td class="c-mod-calender__detail">…）。
//   detail 内の各 <div class="c-mod-calender__detail-in"> が1イベント（カテゴリ c-txt-tag__item ／ 公演名 c-mod-calender__links a）。
//   カテゴリはコンサート系のみ「ライブ」、格闘技/プロレス/ボクシング/展示等は「その他」（会場名＋公演名で種別は判別可能）。
function parseDomeCityHallCalendar(html: string): ExtractedEvent[] {
  const stripTags = (s: string) => String(s ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#8217;|&#8216;|&lsquo;|&rsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&hellip;/g, "…").replace(/&middot;/g, "・")
    .replace(/\s+/g, " ").trim()
  const mapCat = (tag: string): string => /コンサート|ライブ|LIVE|公演|音楽/i.test(String(tag ?? "")) ? "ライブ" : "その他"
  const out: ExtractedEvent[] = []
  const seen = new Set<string>()
  const monthRe = /c-ttl-set-calender">\s*(\d{4})年(\d{1,2})月\s*<\/p>\s*<table[^>]*>([\s\S]*?)<\/table>/g
  let mm: RegExpExecArray | null
  while ((mm = monthRe.exec(html))) {
    const y = Number(mm[1]); const mo = Number(mm[2]); const tbl = mm[3]
    const rowRe = /<tr class="c-mod-calender__item">([\s\S]*?)<\/tr>/g
    let rm: RegExpExecArray | null
    while ((rm = rowRe.exec(tbl))) {
      const row = rm[1]
      const dayM = row.match(/c-mod-calender__day">\s*(\d{1,2})\s*</)
      if (!dayM) continue
      const day = Number(dayM[1])
      if (day < 1 || day > 31) continue
      const detail = (row.match(/c-mod-calender__detail">([\s\S]*?)<\/td>/) || [])[1] || ""
      if (!/c-mod-calender__detail-in/.test(detail)) continue
      const inRe = /c-mod-calender__detail-in">([\s\S]*?)(?=<div class="c-mod-calender__detail-in">|$)/g
      let im: RegExpExecArray | null
      while ((im = inRe.exec(detail))) {
        const blk = im[1]
        const tag = stripTags((blk.match(/c-txt-tag__item[^>]*>([\s\S]*?)<\/span>/) || [])[1] || "")
        let title = stripTags((blk.match(/c-mod-calender__links">\s*<a[^>]*>([\s\S]*?)<\/a>/) || [])[1] || "")
        if (!title) title = stripTags((blk.match(/c-mod-calender__links">([\s\S]*?)<\/p>/) || [])[1] || "")
        if (!title) continue
        if (/^(reserved|貸切|非公開|未定|準備中|tba)$/i.test(title)) continue // 会場押さえ・非公開は除外
        const date = `${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`
        const cleanTitle = title.slice(0, 200)
        const key = `${date}__${cleanTitle}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ event_date: date, title: cleanTitle, category: mapCat(tag) })
      }
    }
  }
  out.sort((a, b) => a.event_date.localeCompare(b.event_date) || a.title.localeCompare(b.title))
  return out
}

// IMMシアターの公式サイト公演スケジュールHTMLを確定パースする。
// 構造: <li class="xfade-in"> 内に <div class="period"> (日付) ＋ <div class="ttl"> (公演名)。
// カテゴリは基本的に演劇・お笑いステージのため「その他」とする。
function parseImmTheaterSchedule(html: string): ExtractedEvent[] {
  const stripTags = (s: string) => String(s ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim()
  const out: ExtractedEvent[] = []
  const seen = new Set<string>()
  
  const liRe = /<li class="xfade-in">([\s\S]*?)<\/li>/g
  let lm: RegExpExecArray | null
  while ((lm = liRe.exec(html))) {
    const li = lm[1]
    
    const ttlM = li.match(/<div class="ttl">([\s\S]*?)<\/div>/)
    if (!ttlM) continue
    const title = stripTags(ttlM[1]).trim()
    if (!title || /^(reserved|貸切|非公開|未定|準備中|tba)$/i.test(title)) continue
    
    const periodM = li.match(/<div class="period">([\s\S]*?)<\/div>/)
    if (!periodM) continue
    const periodHtml = periodM[1]
    
    const spans = Array.from(periodHtml.matchAll(/<span>([\s\S]*?)<\/span>/g)).map(m => stripTags(m[1]))
    if (spans.length === 0) continue
    
    const startM = spans[0].match(/(\d{4})\.(\d{2})\.(\d{2})/)
    if (!startM) continue
    const startY = Number(startM[1])
    const startMth = Number(startM[2])
    const startDay = Number(startM[3])
    
    let dates: string[] = []
    
    if (spans.length === 1) {
      dates.push(`${startY}-${String(startMth).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`)
    } else if (spans.length === 2) {
      const endM = spans[1].match(/(?:(\d{4})\.)?(\d{2})\.(\d{2})/)
      if (endM) {
        let endY = endM[1] ? Number(endM[1]) : startY
        const endMth = Number(endM[2])
        const endDay = Number(endM[3])
        if (!endM[1] && endMth < startMth) {
          endY = startY + 1
        }
        
        const startDate = new Date(Date.UTC(startY, startMth - 1, startDay))
        const endDate = new Date(Date.UTC(endY, endMth - 1, endDay))
        
        let cur = new Date(startDate)
        let limit = 0
        while (cur <= endDate && limit < 60) {
          const y = cur.getUTCFullYear()
          const m = cur.getUTCMonth() + 1
          const d = cur.getUTCDate()
          dates.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`)
          cur.setUTCDate(cur.getUTCDate() + 1)
          limit++
        }
      }
    }
    
    for (const date of dates) {
      const cleanTitle = title.slice(0, 200)
      const key = `${date}__${cleanTitle}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ event_date: date, title: cleanTitle, category: "その他" })
    }
  }
  
  out.sort((a, b) => a.event_date.localeCompare(b.event_date) || a.title.localeCompare(b.title))
  return out
}

async function extractEvents(scheduleText: string, apiKey: string): Promise<{ events: ExtractedEvent[] | null; raw: string | null; usage: DomeAiUsage | null }> {
  // 主経路: コードで日付ごとに確定パース（LLMの日付ズレを排除）。十分な件数が取れたらこれを採用（＝AIトークン消費なし）。
  const deterministic = parseTokyoDomeSchedule(scheduleText)
  if (deterministic.length >= 3) {
    return { events: deterministic, raw: `deterministic:${deterministic.length}`, usage: null }
  }
  // フォールバック: レイアウト変更等で確定パースが取れない場合のみ LLM 抽出。
  const system = [
    "あなたは東京ドームのイベント日程表から、日付ごとのイベントを構造化抽出するアシスタントです。",
    "出力は JSON 配列のみ。前後に説明文やコードフェンスを付けないこと。",
    "各要素は { \"event_date\": \"YYYY-MM-DD\", \"title\": \"...\", \"category\": \"...\" }。",
    "ルール:",
    "- 日付範囲（例: 6/2〜6/4、6月13・14日）は、必ず1日ごとの個別要素に展開する。",
    "- title はイベント名（野球は『巨人ー中日』のようなカード名、ライブは公演名）。",
    "- category は次のいずれか1つ: プロ野球 / アマ野球 / ライブ / その他。",
    "  プロ野球=NPB(巨人・楽天・西武・ソフトバンク・中日・ロッテ・オリックス等の対戦), アマ野球=大学/高校/社会人野球, ライブ=コンサート/音楽公演, その他=それ以外。",
    "- 年が本文に無い日付は、最も近い文脈の年（基本は2026年、12→翌1月など年跨ぎは適切に）を補う。",
    "- 開催が確定していない/プレースホルダー/空き日は出力しない。",
  ].join("\n")
  const user = `次のテキストは東京ドーム公式のイベント日程表です。イベントを抽出してください。\n\n----\n${scheduleText}\n----`

  const primary = resolveGroqTextModel(Deno.env.get("GROQ_DOME_MODEL") || Deno.env.get("GROQ_CHAT_MODEL"))
  const r1 = await groqChat([{ role: "system", content: system }, { role: "user", content: user }], apiKey, primary, 4000)
  let raw = r1.content
  let usage = r1.usage
  if (!raw) {
    const r2 = await groqChat([{ role: "system", content: system }, { role: "user", content: user }], apiKey, GROQ_TEXT_FALLBACK_MODEL, 4000)
    raw = r2.content
    if (r2.usage) usage = r2.usage
  }
  if (!raw) return { events: null, raw: null, usage }

  const parsed = parseJsonArray(raw)
  if (!parsed) return { events: null, raw, usage }

  const seen = new Set<string>()
  const out: ExtractedEvent[] = []
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue
    const rec = item as Record<string, unknown>
    const date = normalizeIsoDate(rec.event_date ?? rec.date)
    const title = String(rec.title ?? rec.name ?? "").trim().replace(/\s+/g, " ").slice(0, 200)
    let category = String(rec.category ?? "").trim()
    if (!VALID_CATEGORIES.has(category)) category = "その他"
    if (!date || !title) continue
    const key = `${date}__${title}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ event_date: date, title, category })
  }
  out.sort((a, b) => a.event_date.localeCompare(b.event_date) || a.title.localeCompare(b.title))
  return { events: out, raw, usage }
}

function normalizeIsoDate(value: unknown): string | null {
  const s = String(value ?? "").trim()
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (!m) return null
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3])
  if (y < 2024 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

function parseJsonArray(raw: string): unknown[] | null {
  let t = String(raw ?? "").trim()
  // コードフェンス除去
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
  // 配列部分を抽出
  const start = t.indexOf("[")
  const end = t.lastIndexOf("]")
  if (start >= 0 && end > start) t = t.slice(start, end + 1)
  try {
    const parsed = JSON.parse(t)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

interface DomeAiUsage { model: string; inputTokens: number; outputTokens: number; totalTokens: number }
function domeUsageFrom(json: unknown, model: string): DomeAiUsage | null {
  const u = (json && typeof json === "object") ? (json as { usage?: unknown }).usage : null
  if (!u || typeof u !== "object") return null
  const m = u as Record<string, unknown>
  const inp = Number(m.prompt_tokens ?? 0) || 0
  const out = Number(m.completion_tokens ?? 0) || 0
  const tot = Number(m.total_tokens ?? 0) || (inp + out)
  if (!inp && !out && !tot) return null
  return { model, inputTokens: inp, outputTokens: out, totalTokens: tot }
}

async function groqChat(
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
  model: string,
  maxTokens = 800,
): Promise<{ content: string | null; usage: DomeAiUsage | null }> {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, temperature: 0, max_tokens: maxTokens, messages }),
    })
    if (!res.ok) { console.error("groqChat http error:", model, res.status); return { content: null, usage: null } }
    const data = await res.json().catch(() => null) as { choices?: Array<{ message?: { content?: string } }>; usage?: unknown } | null
    const c = String(data?.choices?.[0]?.message?.content ?? "").trim()
    return { content: c || null, usage: domeUsageFrom(data, model) }
  } catch (e) { console.error("groqChat failed:", e instanceof Error ? e.message : String(e)); return { content: null, usage: null } }
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  })
}
