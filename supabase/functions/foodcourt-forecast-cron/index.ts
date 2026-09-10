import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.0"
import { FORECAST_ENGINE_VERSION, LEGACY_MODEL, MODEL_IDS, candidatePredictions, retrospective, scoreLedger, evaluationReport, selectChampion, predictionInterval, score, dateDistance, type Predictor, type LedgerRow } from "../_shared/foodcourt_forecast_engine.ts"
import { isInternalCronAuthorized } from "../_shared/internal_cron_auth.ts"

// 毎朝: 完了実績だけで学習し、5方式の当日〜14日先予測を改変不可の台帳へ発行する。
// 昔の天候を使う再計算と、当時発行した本番予測の評価は分離。新方式の採用は後者でのみ判定する。
type DbClient = ReturnType<typeof createClient>
const BASE_TENANT = "MARUGO S"
const MODEL_VERSION = LEGACY_MODEL  // レガシー乗算モデルの識別子（AI解説用係数は常にこのモデルで算出）
const SHRINK_K = 4        // 乗算モデルの係数のサンプルが少ないとき 1（影響なし）へ収縮する強さ

// 会場×客層を区別する:
//   "live"=東京ドーム本体コンサート(大), "dome"=ドーム本体のアマ野球/その他(大), pro=ドーム野球。
//   小ホールは venue-segment-v1 として "hall_kanadevia"(ライブ/若年層) /
//   "hall_korakuen"(格闘技/中年男性) / "hall_other"(その他小ホール) に分ける。
const EVENT_MODEL_TYPES = ["soccer_pv", "japan", "pro", "live", "dome", "sports", "hall_kanadevia", "hall_korakuen", "hall_other"] as const
const EVENT_TYPES = [...EVENT_MODEL_TYPES, "none"] as const
type EvType = typeof EVENT_TYPES[number]
type Feat = { date: string; dow: number; evType: EvType; rainy: boolean; precipMm: number; hotDay: boolean; attendance: number; weatherKnown?: boolean; featureMissing?: boolean }
type Hist = Feat & { guests: number; sales: number; spend: number }
type Factors = {
  meanG: number
  wday: Record<number, number>
  evt: Record<string, number>
  weather: Record<string, number>
  spend: number
  spendEvt: Record<string, number>
  spendEvtN: Record<string, number>
  spendWeather: Record<string, number>
  spendWeatherN: Record<string, number>
  wdayN: Record<number, number>
  evtN: Record<string, number>
  weatherN: Record<string, number>
}
type SpendModel = {
  baseSpend: number
  eventFactors: Record<string, number>
  eventCounts: Record<string, number>
  weatherFactors: Record<string, number>
  weatherCounts: Record<string, number>
}

// --- 統計拡張(stats-ext-v1)の型 ---
// 予測には使わない。AI解説が係数をどこまで信じてよいかを判断するための解釈コンテキスト。
type CiEntry = { factor: number; lo: number; hi: number; n: number }          // 収縮前の生係数と95%CI
type QuantEntry = { n: number; min: number; q25: number; med: number; q75: number; max: number }
type InteractionEntry = { label: string; n: number; actual: number; expected: number; ratio: number } // 実測倍率 vs 独立仮定倍率
type ResidualBiasEntry = { label: string; n: number; bias: number }           // 符号付き平均誤差率(+=過大予測)
type EffectSizeEntry = { label: string; d: number; n1: number; n2: number; magnitude: string }
type AdvancedStats = {
  version: string
  factor_ci: { wday: Record<string, CiEntry>; evt: Record<string, CiEntry>; weather: Record<string, CiEntry> }
  quantiles: Record<string, QuantEntry>
  interactions: InteractionEntry[]
  residual_bias: ResidualBiasEntry[]
  effect_sizes: EffectSizeEntry[]
}

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  if (!supabaseUrl || !serviceRoleKey) return json({ ok: false, error: "Missing service configuration" }, 500)
  const supabase = createClient(supabaseUrl, serviceRoleKey) as unknown as DbClient
  if (!(await isInternalCronAuthorized(req, supabase))) return json({ ok: false, error: "Unauthorized" }, 401)
  const dryRun = ["1", "true", "yes", "on"].includes((new URL(req.url).searchParams.get("dry_run") ?? "").toLowerCase())
  const todayJst = jstDate(new Date()), hiDate = addDays(todayJst, 14)
  try {
    // First successful publication wins for each JST date. Retries cannot rewrite history.
    const { data: existing, error: existingErr } = await supabase.from("foodcourt_forecast_issuances")
      .select("id,chosen_model").eq("tenant_name", BASE_TENANT).eq("issued_on", todayJst).maybeSingle()
    if (existingErr) throw new Error("issuance lookup failed: " + existingErr.message)
    if (existing && !dryRun) return json({ ok: true, already_published: true, issuance_id: existing.id, model_version: existing.chosen_model })

    const [featRows, factRows, ledgerRows, weatherRows] = await Promise.all([
      loadPages((lo, hi) => supabase.from("foodcourt_daily_features")
        .select("business_date,iso_dow,has_event,has_pro_baseball,has_live,has_sports_broadcast,has_japan_match,has_soccer_pv,has_dome_main,has_kanadevia,has_korakuen,is_rainy,precipitation_mm,temp_max,max_expected_attendance,categories")
        .lte("business_date", hiDate).order("business_date").range(lo, hi)),
      loadPages((lo, hi) => supabase.from("foodcourt_base_daily").select("business_date,guests,sales")
        .lt("business_date", todayJst).order("business_date").range(lo, hi)),
      loadPages((lo, hi) => supabase.from("foodcourt_forecast_snapshots")
        .select("*,foodcourt_forecast_issuances!inner(tenant_name,issued_on,issued_at,evaluation_eligible)")
        .eq("foodcourt_forecast_issuances.tenant_name", BASE_TENANT)
        .eq("foodcourt_forecast_issuances.evaluation_eligible", true)
        .gte("target_date", addDays(todayJst, -56)).lt("target_date", todayJst)
        .order("target_date").order("issuance_id").order("model_version").range(lo, hi)),
      loadPages((lo, hi) => supabase.from("weather_daily").select("weather_date,source,updated_at")
        .eq("location", "tokyo_dome").lte("weather_date", hiDate).order("weather_date").range(lo, hi)),
    ])
    const weatherByDate = new Map(weatherRows.map(r => [String(r.weather_date), r]))
    const rawByDate = new Map(featRows.map(r => [String(r.business_date), r]))
    const featByDate = new Map<string, Feat>()
    for (const r of featRows) {
      const d = String(r.business_date ?? "").slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue
      featByDate.set(d, { date: d, dow: Number(r.iso_dow) || isoDow(d), evType: pickEvType(r),
        rainy: r.is_rainy === true, precipMm: Math.max(0, num(r.precipitation_mm) ?? 0),
        hotDay: (num(r.temp_max) ?? 0) >= 30, attendance: Math.max(0, num(r.max_expected_attendance) ?? 0),
        weatherKnown: num(r.precipitation_mm) != null && num(r.temp_max) != null, featureMissing: false })
    }
    const fallback = (d: string): Feat => ({ date: d, dow: isoDow(d), evType: "none", rainy: false,
      precipMm: 0, hotDay: false, attendance: 0, weatherKnown: false, featureMissing: true })
    const hist: Hist[] = []
    let excludedInvalid = 0
    for (const r of factRows) {
      const d = String(r.business_date ?? "").slice(0, 10), guests = num(r.guests), sales = num(r.sales)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d >= todayJst || guests == null || guests < 0 || sales == null || sales < 0
        || (guests === 0 && sales > 0)) { excludedInvalid++; continue }
      hist.push({ ...(featByDate.get(d) ?? fallback(d)), guests, sales, spend: guests > 0 ? sales / guests : 0 })
    }
    hist.sort((a, b) => a.date.localeCompare(b.date))
    if (hist.length < 28) return json({ ok: true, skipped: true, reason: "need_28_valid_training_days", history_days: hist.length })
    const dataQuality = {
      valid_days: hist.length, excluded_invalid_days: excludedInvalid,
      zero_actual_days: hist.filter(h => h.guests === 0 && h.sales === 0).length,
      unknown_weather_days: hist.filter(h => !h.weatherKnown).length,
      missing_feature_days: hist.filter(h => h.featureMissing).length,
      latest_actual: hist.at(-1)!.date, actual_lag_days: dateDistance(todayJst, hist.at(-1)!.date),
      limitations: ["Past weather/event features are revised data, not historical forecasts.",
        "Observed attendance is not used by candidate models.", "Zero actuals are retained; unrecorded closures cannot be inferred."],
    }
    // Never quietly issue forecasts against stale or incomplete operational actuals.
    if (dataQuality.actual_lag_days > 2) return json({ ok: false, error: "Actual data is stale; import completed sales first.", data_quality: dataQuality }, 409)
    const legacy: Predictor = (train, target) => {
      const f = fit(train as Hist[])
      if (target.weatherKnown !== false) return predict(f, target as Feat)
      const known = train.filter(h => h.weatherKnown !== false), wetWeight = known.length ? known.filter(h => h.rainy).length / known.length : 0.5
      const wet = predict(f, { ...target, rainy: true } as Feat), dry = predict(f, { ...target, rainy: false } as Feat)
      return { guests: wet.guests * wetWeight + dry.guests * (1 - wetWeight), sales: wet.sales * wetWeight + dry.sales * (1 - wetWeight) }
    }
    const retrospectiveRows = retrospective(hist, todayJst, legacy)
    const prospectiveRows = scoreLedger(ledgerRows as unknown as LedgerRow[], hist, todayJst)
    const { data: previous, error: previousErr } = await supabase.from("foodcourt_forecast_factors")
      .select("model_selection").eq("tenant_name", BASE_TENANT).maybeSingle()
    if (previousErr) throw new Error("model state load failed: " + previousErr.message)
    const prev = (previous?.model_selection ?? {}) as { chosen?: string; last_promoted?: string }
    const selection = selectChampion(prospectiveRows, todayJst, prev.chosen, prev.last_promoted)
    const evaluation = {
      version: FORECAST_ENGINE_VERSION, selection,
      primary: { kind: "issued", window_days: 28, horizon_days: 1 },
      prospective: evaluationReport(prospectiveRows, todayJst),
      retrospective: evaluationReport(retrospectiveRows, todayJst),
      retrospective_warning: "参考再計算: 学習実績は発行日より前のみ。天候・イベントは現在の更新済み値のため本番精度の証拠ではありません。",
      interval_warning: "予測幅は同じ先行日数の過去誤差による経験的80%区間。時系列依存・天候予報誤差により80%を保証しません。",
    }
    const snapshots: Array<Record<string, unknown>> = []
    const upcoming: Array<Record<string, unknown>> = []
    for (let horizon = 0; horizon <= 14; horizon++) {
      const date = addDays(todayJst, horizon), f = featByDate.get(date) ?? fallback(date)
      const preds = candidatePredictions(hist, f, legacy)
      for (const model of MODEL_IDS) {
        // Only already-observed errors calibrate ranges; never residuals from fitting the target.
        const issued = prospectiveRows.filter(r => r.model === model && r.horizon === horizon)
        const reconstructed = retrospectiveRows.filter(r => r.model === model && r.horizon === horizon)
        const calibration = issued.length >= 20 ? issued : reconstructed
        const g = predictionInterval(preds[model].guests, calibration, "guests")
        const s = predictionInterval(preds[model].sales, calibration, "sales")
        const input = { ...f, raw_features: rawByDate.get(date) ?? null, weather_provenance: weatherByDate.get(date) ?? null,
          training_days: hist.length, train_through: hist.at(-1)!.date,
          interval_source: issued.length >= 20 ? "issued" : "retrospective_reference", interval_n: g.n, nominal_coverage: 0.8 }
        snapshots.push({ target_date: date, horizon_days: horizon, model_version: model, ...preds[model],
          guests_low: g.low, guests_high: g.high, sales_low: s.low, sales_high: s.high, input_snapshot: input })
        if (model === selection.chosen) upcoming.push({ date, ...preds[model], evType: f.evType, rainy: f.weatherKnown ? f.rainy : null, guests_low: g.low, guests_high: g.high, sales_low: s.low, sales_high: s.high, feature_missing: f.featureMissing })
      }
    }
    const chosenBack = retrospectiveRows.filter(r => r.model === selection.chosen && r.horizon === 1)
    const recentBack = chosenBack.filter(r => r.date >= addDays(todayJst, -28))
    const overall = score(chosenBack), recent = score(recentBack)
    const legacyBack = retrospectiveRows.filter(r => r.model === LEGACY_MODEL && r.horizon === 1), legacyScore = score(legacyBack)
    const fac = fit(hist)
    const modelSelection = { ...selection, engine_version: FORECAST_ENGINE_VERSION,
      selection_metric: "paired_issued_guests_and_sales_mae", holdout_days: 28,
      legacy_mape_guests: legacyScore.guests.mape, legacy_mape_sales: legacyScore.sales.mape,
      interpretation_only: true, forecast_model: selection.chosen, evaluation }
    const history = {
      model_version: selection.chosen, history_days: hist.length, backtest_days: chosenBack.length,
      mape_guests: overall.guests.mape, mape_sales: overall.sales.mape, wape_guests: overall.guests.wape, wape_sales: overall.sales.wape,
      mae_guests: overall.guests.mae, mae_sales: overall.sales.mae, rolling_mape_guests: recent.guests.mape, rolling_mape_sales: recent.sales.mape,
      rolling_wape_guests: recent.guests.wape, rolling_wape_sales: recent.sales.wape, rolling_mae_guests: recent.guests.mae, rolling_mae_sales: recent.sales.mae,
      mean_guests: fac.meanG,
    }
    const factors = {
      model_version: MODEL_VERSION, mean_guests: fac.meanG, wday_factors: fac.wday, wday_counts: fac.wdayN,
      event_factors: fac.evt, event_counts: fac.evtN, weather_factors: fac.weather, weather_counts: fac.weatherN,
      median_spend: fac.spend, history_days: hist.length, backtest_days: legacyBack.length,
      mape_guests: legacyScore.guests.mape, mape_sales: legacyScore.sales.mape,
      rolling_mape_guests: recent.guests.mape, rolling_mape_sales: recent.sales.mape,
      model_selection: modelSelection,
      advanced_stats: computeAdvancedStats(hist, chosenBack.map(r => ({ date: r.date, gPred: r.guests, gAct: r.actualGuests, sPred: r.sales, sAct: r.actualSales }))),
    }
    const payload = { tenant_name: BASE_TENANT, issued_on: todayJst, train_through: hist.at(-1)!.date,
      engine_version: FORECAST_ENGINE_VERSION, chosen_model: selection.chosen, evaluation, data_quality: dataQuality, snapshots, history, factors }
    if (dryRun) return json({ ok: true, dry_run: true, ...history, evaluation, data_quality: dataQuality, upcoming, snapshots_to_insert: snapshots.length })
    const { data: published, error: publishErr } = await supabase.rpc("publish_foodcourt_forecast_v2", { payload })
    if (publishErr) throw new Error("atomic publication failed: " + publishErr.message)
    return json({ ...(published as Record<string, unknown>), model_version: selection.chosen, history_days: hist.length, selection, data_quality: dataQuality, upcoming })
  } catch (error) {
    console.error("foodcourt forecast failed:", error instanceof Error ? error.message : String(error))
    return json({ ok: false, error: error instanceof Error ? error.message : "forecast_failed" }, 500)
  }
})

async function loadPages(make: (lo: number, hi: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  for (let lo = 0; ; lo += 1000) {
    const { data, error } = await make(lo, lo + 999)
    if (error) throw new Error(error.message)
    const page = Array.isArray(data) ? data as Record<string, unknown>[] : []
    out.push(...page)
    if (page.length < 1000) return out
  }
}

// --- model ---
function fit(h: Hist[]): Factors {
  const meanG = avg(h.map((x) => x.guests)) ?? 0
  const wday: Record<number, number> = {}
  const wdayN: Record<number, number> = {}
  for (let d = 1; d <= 7; d++) {
    const xs = h.filter((x) => x.dow === d).map((x) => x.guests)
    wday[d] = shrink(meanG > 0 && xs.length ? (avg(xs)! / meanG) : 1, xs.length)
    wdayN[d] = xs.length
  }
  const evt: Record<string, number> = {}
  const evtN: Record<string, number> = {}
  for (const t of EVENT_TYPES) {
    const xs = h.filter((x) => x.evType === t).map((x) => x.guests)
    evt[t] = shrink(meanG > 0 && xs.length ? (avg(xs)! / meanG) : 1, xs.length)
    evtN[t] = xs.length
  }
  const weather: Record<string, number> = {}
  const weatherN: Record<string, number> = {}
  for (const w of ["rainy", "dry"]) {
    const xs = h.filter((x) => x.weatherKnown !== false && (w === "rainy" ? x.rainy : !x.rainy)).map((x) => x.guests)
    weather[w] = shrink(meanG > 0 && xs.length ? (avg(xs)! / meanG) : 1, xs.length)
    weatherN[w] = xs.length
  }
  const spendModel = fitSpendModel(h)
  return {
    meanG,
    wday,
    evt,
    weather,
    spend: spendModel.baseSpend,
    spendEvt: spendModel.eventFactors,
    spendEvtN: spendModel.eventCounts,
    spendWeather: spendModel.weatherFactors,
    spendWeatherN: spendModel.weatherCounts,
    wdayN,
    evtN,
    weatherN,
  }
}
function predict(f: Factors, feat: Feat): { guests: number; sales: number } {
  const g = f.meanG * (f.wday[feat.dow] ?? 1) * (f.evt[feat.evType] ?? 1) * (f.weather[feat.rainy ? "rainy" : "dry"] ?? 1)
  const guests = Math.max(0, Math.round(g))
  const sales = Math.max(0, Math.round(guests * predictSpend({
    baseSpend: f.spend,
    eventFactors: f.spendEvt,
    eventCounts: f.spendEvtN,
    weatherFactors: f.spendWeather,
    weatherCounts: f.spendWeatherN,
  }, feat)))
  return { guests, sales }
}
function shrink(rawFactor: number, n: number, k = SHRINK_K): number {
  if (!isFinite(rawFactor) || rawFactor <= 0) return 1
  return (n * rawFactor + k * 1) / (n + k)
}

function spendWeatherKey(f: Feat): string {
  if (f.hotDay) return "hot"
  if (f.rainy) return "rainy"
  return "normal"
}

function fitSpendModel(history: Hist[]): SpendModel {
  const h = history.filter(x => x.guests > 0 && x.spend > 0)
  const baseSpend = median(h.map((x) => x.spend)) ?? 0
  const eventFactors: Record<string, number> = {}
  const eventCounts: Record<string, number> = {}
  for (const t of EVENT_TYPES) {
    const xs = h.filter((x) => x.evType === t).map((x) => x.spend)
    eventFactors[t] = shrinkSpend(baseSpend > 0 && xs.length ? ((median(xs) ?? baseSpend) / baseSpend) : 1, xs.length)
    eventCounts[t] = xs.length
  }
  const weatherFactors: Record<string, number> = {}
  const weatherCounts: Record<string, number> = {}
  for (const key of ["hot", "rainy", "normal"]) {
    const xs = h.filter((x) => spendWeatherKey(x) === key).map((x) => x.spend)
    weatherFactors[key] = shrinkSpend(baseSpend > 0 && xs.length ? ((median(xs) ?? baseSpend) / baseSpend) : 1, xs.length)
    weatherCounts[key] = xs.length
  }
  return { baseSpend, eventFactors, eventCounts, weatherFactors, weatherCounts }
}

function predictSpend(model: SpendModel, feat: Feat): number {
  const base = Math.max(0, model.baseSpend || 0)
  if (base <= 0) return 0
  const raw = base
    * (model.eventFactors[feat.evType] ?? 1)
    * (model.weatherFactors[spendWeatherKey(feat)] ?? 1)
  return Math.max(0, Math.round(raw))
}

function shrinkSpend(rawFactor: number, n: number): number {
  // 客単価は日次サンプルが少ない段階でもブレやすいため、客数係数より少し強めに1倍へ寄せ、
  // さらに極端な外れ値で売上予測が暴れないよう安全な範囲に収める。
  const factor = shrink(rawFactor, n, SHRINK_K + 2)
  return Math.max(0.65, Math.min(1.45, factor))
}

// --- 統計拡張(stats-ext-v1) ---
// fit()/predict()には一切影響しない純粋な追加計算。AI解説が「係数をどこまで信じてよいか」を
// 判断するための材料（信頼区間・分布・交互作用・モデルの弱点・効果量）をまとめて算出する。
function computeAdvancedStats(
  h: Hist[],
  back: Array<{ date: string; gPred: number; gAct: number }>,
): AdvancedStats {
  const meanG = avg(h.map((x) => x.guests)) ?? 0
  const histByDate = new Map(h.map((x) => [x.date, x]))
  const isWeekend = (x: Hist) => x.dow === 6 || x.dow === 7
  const isBigEvent = (x: Hist) => x.evType === "pro" || x.evType === "live" || x.evType === "dome"

  // ① 係数の95%信頼区間（収縮前の生の比率に対して）。
  //    CIが1をまたぐ＝「効果が偶然でない」とは言い切れない、をAIが判定できるようにする。
  const ciOf = (xs: number[]): CiEntry | null => {
    if (meanG <= 0 || xs.length < 3) return null
    const m = avg(xs)!
    const s = sampleSd(xs)
    if (s == null) return null
    const se = s / Math.sqrt(xs.length)
    const t = tCrit(xs.length - 1)
    return {
      factor: round2(m / meanG),
      lo: round2(Math.max(0, (m - t * se) / meanG)),
      hi: round2((m + t * se) / meanG),
      n: xs.length,
    }
  }
  const factorCi: AdvancedStats["factor_ci"] = { wday: {}, evt: {}, weather: {} }
  for (let d = 1; d <= 7; d++) {
    const ci = ciOf(h.filter((x) => x.dow === d).map((x) => x.guests))
    if (ci) factorCi.wday[String(d)] = ci
  }
  for (const t of EVENT_TYPES) {
    const ci = ciOf(h.filter((x) => x.evType === t).map((x) => x.guests))
    if (ci) factorCi.evt[t] = ci
  }
  for (const w of ["rainy", "dry"]) {
    const ci = ciOf(h.filter((x) => (w === "rainy" ? x.rainy : !x.rainy)).map((x) => x.guests))
    if (ci) factorCi.weather[w] = ci
  }

  // ② 条件別の客数分布（四分位数）。平均だけでは見えない「同じ条件でも最悪これだけ低い日がある」を渡す。
  const quantiles: Record<string, QuantEntry> = {}
  const quantOf = (key: string, xs: number[]) => {
    if (xs.length < 3) return
    const sorted = xs.slice().sort((a, b) => a - b)
    quantiles[key] = {
      n: xs.length,
      min: Math.round(sorted[0]),
      q25: Math.round(quantile(sorted, 0.25)),
      med: Math.round(quantile(sorted, 0.5)),
      q75: Math.round(quantile(sorted, 0.75)),
      max: Math.round(sorted[sorted.length - 1]),
    }
  }
  for (const t of EVENT_TYPES) {
    quantOf(`evt:${t}`, h.filter((x) => x.evType === t).map((x) => x.guests))
  }
  quantOf("weekend", h.filter(isWeekend).map((x) => x.guests))
  quantOf("weekday", h.filter((x) => !isWeekend(x)).map((x) => x.guests))
  quantOf("rainy", h.filter((x) => x.rainy).map((x) => x.guests))
  quantOf("dry", h.filter((x) => !x.rainy).map((x) => x.guests))

  // ③ 交互作用: 「条件が重なった日」の実測倍率 vs 独立仮定（生係数の掛け算）の倍率。
  //    乗算モデルは独立を仮定しているため、実測との乖離＝モデルが構造的に外す領域をAIに知らせる。
  const interactions: InteractionEntry[] = []
  const marginalRatio = (xs: number[]): number | null => {
    if (meanG <= 0 || !xs.length) return null
    return avg(xs)! / meanG
  }
  const addInteraction = (label: string, r1: number | null, r2: number | null, combo: Hist[]) => {
    if (r1 == null || r2 == null || combo.length < 3 || meanG <= 0) return
    const actual = avg(combo.map((x) => x.guests))! / meanG
    const expected = r1 * r2
    if (expected <= 0) return
    interactions.push({ label, n: combo.length, actual: round2(actual), expected: round2(expected), ratio: round2(actual / expected) })
  }
  const rWeekend = marginalRatio(h.filter(isWeekend).map((x) => x.guests))
  const rWeekday = marginalRatio(h.filter((x) => !isWeekend(x)).map((x) => x.guests))
  const rBig = marginalRatio(h.filter(isBigEvent).map((x) => x.guests))
  const rNoBig = marginalRatio(h.filter((x) => !isBigEvent(x)).map((x) => x.guests))
  const rRainy = marginalRatio(h.filter((x) => x.rainy).map((x) => x.guests))
  addInteraction("土日×大型イベント(野球/ライブ/ドーム)", rWeekend, rBig, h.filter((x) => isWeekend(x) && isBigEvent(x)))
  addInteraction("平日×大型イベント(野球/ライブ/ドーム)", rWeekday, rBig, h.filter((x) => !isWeekend(x) && isBigEvent(x)))
  addInteraction("土日×イベント無し系", rWeekend, rNoBig, h.filter((x) => isWeekend(x) && !isBigEvent(x)))
  addInteraction("雨×大型イベント(野球/ライブ/ドーム)", rRainy, rBig, h.filter((x) => x.rainy && isBigEvent(x)))

  // ④ 残差バイアス: バックテスト(out-of-sample)の符号付き誤差率を条件別に集計。
  //    「モデルはこの条件で系統的に過大/過小評価する」という自己申告の弱点リスト。
  const residualBias: ResidualBiasEntry[] = []
  const biasGroups: Record<string, number[]> = {}
  for (const b of back) {
    if (b.gAct <= 0) continue
    const f = histByDate.get(b.date)
    if (!f) continue
    const err = (b.gPred - b.gAct) / b.gAct
    const keys = [
      `evt:${f.evType}`,
      isWeekend(f) ? "weekend" : "weekday",
      f.rainy ? "rainy" : "dry",
    ]
    for (const k of keys) (biasGroups[k] ??= []).push(err)
  }
  const BIAS_LABEL: Record<string, string> = {
    "evt:soccer_pv": "サッカーPVの日", "evt:japan": "日本戦PVの日", "evt:pro": "プロ野球の日",
    "evt:live": "ライブの日", "evt:dome": "ドーム本体(その他)の日", "evt:sports": "世界スポーツ放映の日",
    "evt:hall_kanadevia": "カナデビアホールの日", "evt:hall_korakuen": "後楽園ホールの日",
    "evt:hall_other": "その他小ホールの日", "evt:none": "イベント無しの日",
    weekend: "土日", weekday: "平日", rainy: "雨の日", dry: "雨でない日",
  }
  for (const [k, errs] of Object.entries(biasGroups)) {
    if (errs.length < 3) continue
    const bias = avg(errs)!
    if (Math.abs(bias) < 0.10) continue // ±10%未満の偏りはノイズとして報告しない
    residualBias.push({ label: BIAS_LABEL[k] ?? k, n: errs.length, bias: round3(bias) })
  }
  residualBias.sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias))

  // ⑤ 効果量(Cohen's d): 「どの要因が本当に影響力が大きいか」を単位に依存せず比較可能にする。
  const effectSizes: EffectSizeEntry[] = []
  const addEffect = (label: string, g1: number[], g2: number[]) => {
    if (g1.length < 2 || g2.length < 2) return
    const d = cohensD(g1, g2)
    if (d == null) return
    effectSizes.push({ label, d: round2(d), n1: g1.length, n2: g2.length, magnitude: dMagnitude(d) })
  }
  const noneGuests = h.filter((x) => x.evType === "none").map((x) => x.guests)
  const EVT_JP: Record<string, string> = {
    soccer_pv: "サッカーPV", japan: "日本戦PV", pro: "プロ野球", live: "ライブ",
    dome: "ドーム本体(その他)", sports: "世界スポーツ放映",
    hall_kanadevia: "カナデビアホール", hall_korakuen: "後楽園ホール", hall_other: "その他小ホール",
  }
  for (const t of Object.keys(EVT_JP)) {
    addEffect(`${EVT_JP[t]} vs イベント無し`, h.filter((x) => x.evType === t).map((x) => x.guests), noneGuests)
  }
  addEffect("雨 vs 雨でない", h.filter((x) => x.rainy).map((x) => x.guests), h.filter((x) => !x.rainy).map((x) => x.guests))
  addEffect("土日 vs 平日", h.filter(isWeekend).map((x) => x.guests), h.filter((x) => !isWeekend(x)).map((x) => x.guests))
  effectSizes.sort((a, b) => Math.abs(b.d) - Math.abs(a.d))

  return { version: "stats-ext-v1", factor_ci: factorCi, quantiles, interactions, residual_bias: residualBias, effect_sizes: effectSizes }
}

function sampleSd(xs: number[]): number | null {
  if (xs.length < 2) return null
  const m = avg(xs)!
  const v = xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1)
  return Math.sqrt(v)
}
function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}
// t分布の97.5%点（95%CI用）。df>30はほぼ正規分布なので1.96へ。
function tCrit(df: number): number {
  const table: Record<number, number> = { 1: 12.71, 2: 4.30, 3: 3.18, 4: 2.78, 5: 2.57, 6: 2.45, 7: 2.36, 8: 2.31, 9: 2.26, 10: 2.23, 12: 2.18, 15: 2.13, 20: 2.09, 25: 2.06, 30: 2.04 }
  if (df <= 0) return 12.71
  if (table[df]) return table[df]
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b)
  for (const k of keys) if (df <= k) return table[k]
  return 1.96
}
function cohensD(g1: number[], g2: number[]): number | null {
  const m1 = avg(g1), m2 = avg(g2)
  const s1 = sampleSd(g1), s2 = sampleSd(g2)
  if (m1 == null || m2 == null || s1 == null || s2 == null) return null
  const pooled = Math.sqrt(((g1.length - 1) * s1 * s1 + (g2.length - 1) * s2 * s2) / (g1.length + g2.length - 2))
  if (!isFinite(pooled) || pooled <= 0) return null
  return (m1 - m2) / pooled
}
function dMagnitude(d: number): string {
  const a = Math.abs(d)
  if (a >= 1.2) return "極めて大"
  if (a >= 0.8) return "大"
  if (a >= 0.5) return "中"
  if (a >= 0.2) return "小"
  return "ごく小"
}
function round2(v: number): number { return Math.round(v * 100) / 100 }
function round3(v: number): number { return Math.round(v * 1000) / 1000 }
function pickEvType(r: Record<string, unknown>): EvType {
  // 当店(marugoS)の売上ドライバー順で種別を決める。ドーム野球は当店の最強ドライバー＝PVより優先。
  // サッカーPVは「全体は大集客だが客はバーガー/ビールへ→当店への売上寄与は間接的・波及的」なので独立の控えめ係数として学習させる。
  // 会場×客層を加味（#5）: 東京ドーム本体(has_dome_main)は大集客、カナデビア/後楽園は小ホールでも客層が異なるため別係数。
  if (r.has_pro_baseball === true) return "pro"            // ドーム野球＝当店の最強ドライバー（同日にPVが重なってもこちらを優先）
  if (r.has_soccer_pv === true) return "soccer_pv"          // サッカーPV＝高集客でも当店売上は間接的・波及的（過大評価を避け別係数で学習）
  if (r.has_japan_match === true) return "japan"            // サッカー以外の日本戦PV（WBC/世界ボクシング/五輪 等）
  if (r.has_live === true && r.has_dome_main === true) return "live"  // 東京ドーム本体コンサート＝大集客（従来のlive係数を維持）
  if (r.has_dome_main === true) return "dome"               // ドーム本体のアマ野球/その他（live以外）＝大集客
  if (r.has_sports_broadcast === true) return "sports"     // 日本以外の世界スポーツ放映
  if (r.has_korakuen === true) return "hall_korakuen"       // 後楽園ホール＝格闘技/ボクシング/プロレス中心。中年男性客層として別学習。
  if (r.has_kanadevia === true) return "hall_kanadevia"     // カナデビアホール＝ライブ/舞台中心。若年層・公演客として別学習。
  if (r.has_live === true || r.has_event === true) return "hall_other"  // その他小ホール/ラクーア/プリズム等。ドーム本体無しなのでlive係数を当てない。
  return "none"
}

// --- helpers ---
function mape(pairs: Array<[number, number]>): number | null {
  const xs = pairs.filter(([, a]) => a > 0).map(([p, a]) => Math.abs(p - a) / a)
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null
}
// WAPE(加重絶対誤差率)= Σ|予測-実績| / Σ実績。MAPEと違い実績の小さい日で誤差率が跳ね上がらず、
// 実績(売上・客数)の大きい日を重く扱う＝経営判断に近い指標。分母が0以下なら評価不能としてnull。
function wape(pairs: Array<[number, number]>): number | null {
  let num = 0, den = 0
  for (const [p, a] of pairs) {
    if (!Number.isFinite(p) || !Number.isFinite(a) || a < 0) continue
    num += Math.abs(p - a)
    den += a
  }
  return den > 0 ? num / den : null
}
// MAE(平均絶対誤差)= mean|予測-実績|。誤差率でなく実数（客数なら「人」、売上なら「円」）の平均ズレ。
function mae(pairs: Array<[number, number]>): number | null {
  const xs = pairs.filter(([, a]) => a != null && isFinite(a)).map(([p, a]) => Math.abs(p - a))
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null
}
function pct1(v: number | null): number | null { return v != null ? Math.round(v * 1000) / 10 : null }
function round0(v: number | null): number | null { return v != null ? Math.round(v) : null }
function avg(a: number[]): number | null { const x = a.filter((v) => v != null && isFinite(v)); return x.length ? x.reduce((s, v) => s + v, 0) / x.length : null }
function median(a: number[]): number | null { const x = a.filter((v) => v != null && isFinite(v)).slice().sort((p, q) => p - q); if (!x.length) return null; const m = Math.floor(x.length / 2); return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2 }
function num(v: unknown): number | null { if (v == null) return null; const n = Number(v); return isFinite(n) ? n : null }
function jstDate(base: Date): string { const j = new Date(base.getTime() + 9 * 3600 * 1000); return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, "0")}-${String(j.getUTCDate()).padStart(2, "0")}` }
function addDays(ymd: string, n: number): string { const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return ymd; const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n)); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}` }
function isoDow(ymd: string): number { const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return 0; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay(); return d === 0 ? 7 : d }
function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } })
}
