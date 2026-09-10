// Deterministic, dependency-free forecasting and honest, horizon-specific evaluation.
// Changing a predictor or its constants requires a new model ID (immutable ledger).
export const FORECAST_ENGINE_VERSION = "forecast-audit-v1"
export const BASELINE_MODEL = "weekday-4-v1"
export const LEGACY_MODEL = "mult-factor-v4-safe"
export const MODEL_IDS = [LEGACY_MODEL, BASELINE_MODEL, "similar-days-v1", "ridge-direct-v1", "ensemble-v1"] as const
export type ModelId = typeof MODEL_IDS[number]
export type Feature = {
  date: string; dow: number; evType: string; rainy: boolean; precipMm: number
  hotDay: boolean; attendance: number; weatherKnown?: boolean; featureMissing?: boolean
}
export type Observation = Feature & { guests: number; sales: number; spend: number }
export type Point = { guests: number; sales: number }
export type Predictor = (history: Observation[], target: Feature) => Point
export type Scored = Point & {
  date: string; model: string; horizon: number; actualGuests: number; actualSales: number
  evType: string; rainy: boolean; weatherKnown: boolean
  guestsLow?: number | null; guestsHigh?: number | null
  salesLow?: number | null; salesHigh?: number | null
}
export type Accuracy = {
  n: number; zero_actual_days: number; mape_n: number; mape: number | null
  wape: number | null; mae: number | null; bias: number | null
  coverage: number | null; interval_n: number
}
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const mean = (xs: number[]) => xs.length ? sum(xs) / xs.length : 0
export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(date + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10)
}
export const dateDistance = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000)
export function accuracy(pairs: Array<[number, number, (number | null)?, (number | null)?]>): Accuracy {
  const xs = pairs.filter(([p, a]) => Number.isFinite(p) && Number.isFinite(a) && a >= 0)
  const denominator = sum(xs.map(([, a]) => a))
  const ape = xs.filter(([, a]) => a > 0).map(([p, a]) => Math.abs(p - a) / a)
  const intervals = xs.filter(([, , lo, hi]) => lo != null && hi != null && Number.isFinite(lo) && Number.isFinite(hi) && lo <= hi)
  return {
    n: xs.length, zero_actual_days: xs.filter(([, a]) => a === 0).length, mape_n: ape.length,
    mape: ape.length ? mean(ape) : null,
    // Zero actuals still contribute their prediction error to WAPE/MAE/bias.
    wape: denominator > 0 ? sum(xs.map(([p, a]) => Math.abs(p - a))) / denominator : null,
    mae: xs.length ? mean(xs.map(([p, a]) => Math.abs(p - a))) : null,
    bias: denominator > 0 ? sum(xs.map(([p, a]) => p - a)) / denominator : null,
    interval_n: intervals.length,
    coverage: intervals.length ? mean(intervals.map(([, a, lo, hi]) => +(a >= lo! && a <= hi!))) : null,
  }
}
export function score(rows: Scored[]) {
  return {
    guests: accuracy(rows.map(r => [r.guests, r.actualGuests, r.guestsLow, r.guestsHigh])),
    sales: accuracy(rows.map(r => [r.sales, r.actualSales, r.salesLow, r.salesHigh])),
  }
}
export function weekdayBaseline(history: Observation[], target: Feature): Point {
  const same = history.filter(h => h.dow === target.dow).slice(-4)
  const rows = same.length ? same : history.slice(-28)
  return { guests: mean(rows.map(h => h.guests)), sales: mean(rows.map(h => h.sales)) }
}
export function similarDays(history: Observation[], target: Feature): Point {
  let weights = 0, guests = 0, sales = 0
  for (const h of history) {
    const dayWeight = h.dow === target.dow ? 1 : (h.dow >= 6) === (target.dow >= 6) ? 0.25 : 0.05
    const eventWeight = h.evType === target.evType ? 1 : 0.15
    // Unknown weather is marginalized, never silently treated as a dry day.
    const weatherWeight = h.weatherKnown !== false && target.weatherKnown !== false
      ? Math.exp(-Math.abs(Math.log1p(h.precipMm) - Math.log1p(target.precipMm)) * 0.2) : 1
    const w = dayWeight * eventWeight * weatherWeight * Math.pow(0.5, Math.max(0, dateDistance(target.date, h.date)) / 42)
    weights += w; guests += w * h.guests; sales += w * h.sales
  }
  return weights > 0 ? { guests: guests / weights, sales: sales / weights } : weekdayBaseline(history, target)
}
const EVENTS = ["pro", "live", "dome", "soccer_pv", "japan", "sports", "hall_kanadevia", "hall_korakuen", "hall_other"]
function vector(f: Feature): number[] {
  const known = f.weatherKnown !== false
  // No annual/trend extrapolation from a few months; no observed attendance masquerading as a forecast.
  return [1, ...[1, 2, 3, 4, 5, 6].map(d => +(f.dow === d)),
    ...EVENTS.map(e => +(f.evType === e)),
    known ? Math.min(Math.log1p(Math.max(0, f.precipMm)), 5) / 5 : 0,
    +(known && f.hotDay), +!known]
}
function solve(matrix: number[][], rhs: number[]): number[] | null {
  const a = matrix.map((row, i) => [...row, rhs[i]])
  const n = a.length
  for (let k = 0; k < n; k++) {
    let pivot = k
    for (let i = k + 1; i < n; i++) if (Math.abs(a[i][k]) > Math.abs(a[pivot][k])) pivot = i
    if (Math.abs(a[pivot][k]) < 1e-10) return null
    ;[a[k], a[pivot]] = [a[pivot], a[k]]
    const div = a[k][k]
    for (let j = k; j <= n; j++) a[k][j] /= div
    for (let i = 0; i < n; i++) if (i !== k) {
      const mult = a[i][k]
      for (let j = k; j <= n; j++) a[i][j] -= mult * a[k][j]
    }
  }
  return a.map(row => row[n])
}
export function ridgeDirect(history: Observation[], target: Feature): Point {
  if (history.length < 28) return weekdayBaseline(history, target)
  const vectors = history.map(vector), x = vector(target), n = x.length
  const matrix = Array.from({ length: n }, () => Array(n).fill(0) as number[])
  const rhsG = Array(n).fill(0) as number[], rhsS = Array(n).fill(0) as number[]
  const gScale = Math.max(1, mean(history.map(h => h.guests)))
  const sScale = Math.max(1, mean(history.map(h => h.sales)))
  history.forEach((h, i) => {
    const w = Math.pow(0.5, Math.max(0, dateDistance(target.date, h.date)) / 56)
    for (let j = 0; j < n; j++) {
      rhsG[j] += w * vectors[i][j] * h.guests / gScale
      rhsS[j] += w * vectors[i][j] * h.sales / sScale
      for (let k = 0; k < n; k++) matrix[j][k] += w * vectors[i][j] * vectors[i][k]
    }
  })
  for (let i = 0; i < n; i++) matrix[i][i] += i === 0 ? 0.001 : 4
  const g = solve(matrix, rhsG), s = solve(matrix, rhsS)
  return g && s ? { guests: sum(x.map((v, i) => v * g[i])) * gScale, sales: sum(x.map((v, i) => v * s[i])) * sScale } : weekdayBaseline(history, target)
}
export function candidatePredictions(history: Observation[], target: Feature, legacy: Predictor): Record<ModelId, Point> {
  // Defensive cutoff also protects callers passing a history with future or partial-day actuals.
  const train = history.filter(h => h.date < target.date).sort((a, b) => a.date.localeCompare(b.date)).slice(-365)
  const baseline = weekdayBaseline(train, target), analog = similarDays(train, target), ridge = ridgeDirect(train, target)
  const old = legacy(train, target)
  const out: Record<ModelId, Point> = {
    [LEGACY_MODEL]: old, [BASELINE_MODEL]: baseline, "similar-days-v1": analog, "ridge-direct-v1": ridge,
    "ensemble-v1": { guests: (analog.guests + ridge.guests + baseline.guests) / 3, sales: (analog.sales + ridge.sales + baseline.sales) / 3 },
  }
  for (const id of MODEL_IDS) for (const metric of ["guests", "sales"] as const) {
    const value = out[id][metric]
    out[id][metric] = Math.max(0, Math.round(Number.isFinite(value) ? value : baseline[metric]))
  }
  return out
}
export function retrospective(history: Observation[], asOf: string, legacy: Predictor): Scored[] {
  const sorted = history.filter(h => h.date < asOf).sort((a, b) => a.date.localeCompare(b.date))
  const out: Scored[] = []
  for (const target of sorted.filter(h => h.date >= shiftDate(asOf, -56))) {
    for (let horizon = 0; horizon <= 14; horizon++) {
      const issuedOn = shiftDate(target.date, -horizon)
      const train = sorted.filter(h => h.date < issuedOn)
      if (train.length < 28) continue
      const preds = candidatePredictions(train, target, legacy)
      for (const id of MODEL_IDS) out.push({ date: target.date, model: id, horizon, ...preds[id],
        actualGuests: target.guests, actualSales: target.sales, evType: target.evType,
        rainy: target.rainy, weatherKnown: target.weatherKnown !== false })
    }
  }
  return out
}
export function evaluationReport(rows: Scored[], asOf: string) {
  const windows = [14, 28, 56].map(days => ({ days, from: shiftDate(asOf, -days), through: shiftDate(asOf, -1),
    horizons: [0, 1, 7, 14].map(horizon => {
      const window = rows.filter(r => r.horizon === horizon && r.date >= shiftDate(asOf, -days) && r.date < asOf)
      const baselineByDate = new Map(window.filter(r => r.model === BASELINE_MODEL).map(r => [r.date, r]))
      return { horizon, models: MODEL_IDS.map(model => {
        const selected = window.filter(r => r.model === model), metrics = score(selected)
        const paired = selected.filter(r => baselineByDate.has(r.date))
        const pairedScore = score(paired), baseline = score(paired.map(r => baselineByDate.get(r.date)!))
        return { model, ...metrics,
          // These are relative MAE improvements on identical target dates, not MASE.
          baseline_comparison_n: paired.length,
          baseline_skill_guests: baseline.guests.mae && pairedScore.guests.mae != null ? 1 - pairedScore.guests.mae / baseline.guests.mae : null,
          baseline_skill_sales: baseline.sales.mae && pairedScore.sales.mae != null ? 1 - pairedScore.sales.mae / baseline.sales.mae : null,
          slices: ["rain", "dry", "unknown_weather", "event", "no_event"].map(label => ({ label,
            ...score(selected.filter(r => label === "rain" ? r.weatherKnown && r.rainy : label === "dry" ? r.weatherKnown && !r.rainy
              : label === "unknown_weather" ? !r.weatherKnown : label === "event" ? r.evType !== "none" : r.evType === "none")) })),
        }
      }) }
    }),
  }))
  return { as_of: asOf, windows }
}
export type LedgerRow = {
  target_date: string; horizon_days: number; model_version: string; guests: number; sales: number
  guests_low: number | null; guests_high: number | null; sales_low: number | null; sales_high: number | null
  input_snapshot: Feature
  foodcourt_forecast_issuances?: { issued_on: string; evaluation_eligible: boolean }
}
export function scoreLedger(ledger: LedgerRow[], actuals: Observation[], asOf: string): Scored[] {
  const byDate = new Map(actuals.filter(h => h.date < asOf).map(h => [h.date, h]))
  const seen = new Set<string>()
  return ledger.flatMap(row => {
    const actual = byDate.get(row.target_date)
    const issued = row.foodcourt_forecast_issuances
    const key = `${row.target_date}/${row.horizon_days}/${row.model_version}`
    if (!actual || issued?.evaluation_eligible !== true || dateDistance(row.target_date, issued.issued_on) !== row.horizon_days
      || seen.has(key) || !MODEL_IDS.includes(row.model_version as ModelId)) return []
    seen.add(key)
    return [{ date: row.target_date, model: row.model_version, horizon: row.horizon_days,
      guests: Number(row.guests), sales: Number(row.sales), actualGuests: actual.guests, actualSales: actual.sales,
      evType: row.input_snapshot.evType, rainy: row.input_snapshot.rainy, weatherKnown: row.input_snapshot.weatherKnown !== false,
      guestsLow: row.guests_low, guestsHigh: row.guests_high, salesLow: row.sales_low, salesHigh: row.sales_high }]
  })
}
// Policy constants are safety guards, not claims of statistical significance.
export function selectChampion(rows: Scored[], asOf: string, incumbent: string = LEGACY_MODEL, lastPromoted?: string) {
  const current: ModelId = MODEL_IDS.includes(incumbent as ModelId) ? incumbent as ModelId : LEGACY_MODEL
  const stable = (reason: string) => ({ chosen: current, changed: false, reason, last_promoted: lastPromoted ?? null })
  const recent = rows.filter(r => r.horizon === 1 && r.date >= shiftDate(asOf, -28) && r.date < asOf)
  if (new Set(recent.filter(r => r.model === current).map(r => r.date)).size < 21) return stable("collecting_issued_forecasts")
  if (new Date(asOf + "T00:00:00Z").getUTCDay() !== 1) return stable("weekly_review_monday")
  if (lastPromoted && dateDistance(asOf, lastPromoted) < 28) return stable("promotion_cooldown_28_days")
  const map = (model: string) => new Map(recent.filter(r => r.model === model).map(r => [r.date, r]))
  const old = map(current), base = map(BASELINE_MODEL)
  const candidates: Array<{ model: ModelId; loss: number }> = []
  for (const model of MODEL_IDS.filter(m => m !== current)) {
    const candidate = map(model)
    const dates = [...old.keys()].filter(d => candidate.has(d) && base.has(d)).sort()
    if (dates.length < 21) continue
    const halves = [dates.filter(d => d < shiftDate(asOf, -14)), dates.filter(d => d >= shiftDate(asOf, -14))]
    if (halves.some(ds => ds.length < 7)) continue
    const beats = (ds: string[], reference: Map<string, Scored>, margin: number) => {
      const c = score(ds.map(d => candidate.get(d)!)), r = score(ds.map(d => reference.get(d)!))
      return ["guests", "sales"].every(key => {
        const k = key as "guests" | "sales"
        return c[k].mae != null && r[k].mae != null && c[k].mae! < r[k].mae! * (1 - margin)
      })
    }
    if (!beats(dates, old, 0.05) || !halves.every(ds => beats(ds, old, 0)) || (model !== BASELINE_MODEL && !beats(dates, base, 0))) continue
    const metrics = score(dates.map(d => candidate.get(d)!))
    candidates.push({ model, loss: (metrics.guests.wape ?? Infinity) + (metrics.sales.wape ?? Infinity) })
  }
  candidates.sort((a, b) => a.loss - b.loss)
  return candidates.length ? { chosen: candidates[0].model, changed: true, reason: "paired_prospective_improvement", last_promoted: asOf } : stable("no_consistent_improvement")
}
export function predictionInterval(point: number, rows: Scored[], metric: "guests" | "sales") {
  const errors = rows.map(r => Math.abs(r[metric] - (metric === "guests" ? r.actualGuests : r.actualSales))).filter(Number.isFinite).sort((a, b) => a - b)
  // Empirical 80% absolute-error interval. Time dependence prevents a coverage guarantee.
  if (errors.length < 20) return { low: null, high: null, n: errors.length, nominal_coverage: 0.8 }
  const width = errors[Math.min(errors.length - 1, Math.ceil((errors.length + 1) * 0.8) - 1)]
  return { low: Math.max(0, Math.floor(point - width)), high: Math.ceil(point + width), n: errors.length, nominal_coverage: 0.8 }
}
