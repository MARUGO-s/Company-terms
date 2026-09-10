import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { accuracy, candidatePredictions, retrospective, scoreLedger, selectChampion, predictionInterval, weekdayBaseline,
  similarDays, LEGACY_MODEL, BASELINE_MODEL, MODEL_IDS, shiftDate, type Observation, type Scored } from '../supabase/functions/_shared/foodcourt_forecast_engine.ts'
import { normalizeBaseballCategory, parseTokyoDomeSchedule } from '../supabase/functions/_shared/tokyo_dome_schedule.ts'

const row = (date: string, guests = 100, sales = guests * 2000): Observation => ({ date,
  dow: new Date(date+'T00:00:00Z').getUTCDay() || 7, evType: 'none', rainy: false, precipMm: 0,
  hotDay: false, attendance: 0, weatherKnown: true, guests, sales, spend: guests ? sales/guests : 0 })
const history = Array.from({length:90}, (_,i) => row(shiftDate('2026-06-01',i), 70 + (i%7)*15))
const legacy = (train: Observation[], target: Observation) => weekdayBaseline(train, target)
const scored = (date: string, model: string, error: number): Scored => ({ date,model,horizon:1,
  guests:100+error,sales:200000+error*2000,actualGuests:100,actualSales:200000,evType:'none',rainy:false,weatherKnown:true })

test('zero actuals contribute to WAPE and MAE, while MAPE reports its smaller denominator',()=>{
  const m=accuracy([[10,0],[120,100]])
  assert.equal(m.wape,0.3); assert.equal(m.mae,15); assert.equal(m.bias,0.3)
  assert.equal(m.mape,0.2); assert.equal(m.mape_n,1); assert.equal(m.zero_actual_days,1)
  assert.equal(accuracy([[5,0]]).wape,null)
  assert.equal(accuracy([]).mae,null)
})
test('invalid numbers never become zero-error observations',()=>{
  assert.equal(accuracy([[NaN,5],[10,-1],[2,Infinity]]).n,0)
  assert.equal(accuracy([[10,10,9,11],[10,20,null,null]]).coverage,1)
  assert.equal(accuracy([[10,10,9,11],[10,20,null,null]]).interval_n,1)
})
test('weekday baseline uses last four matching weekdays and ignores future records',()=>{
  const target=row('2026-09-01')
  const a=candidatePredictions(history,target,legacy)
  const b=candidatePredictions([...history,row('2026-09-01',1e9),row('2026-10-01',1e9)],target,legacy)
  assert.deepEqual(a,b)
  assert.equal(a[BASELINE_MODEL].guests,85)
})
test('candidate models are finite, nonnegative, deterministic, and do not mutate their input',()=>{
  const original=JSON.stringify(history)
  const target=row('2026-09-01')
  const first=candidatePredictions(history,target,legacy)
  assert.deepEqual(first,candidatePredictions(history,target,legacy))
  assert.equal(JSON.stringify(history),original)
  for(const point of Object.values(first)) for(const value of Object.values(point)) assert.ok(Number.isFinite(value) && value>=0)
})
test('unknown weather is marginalized by the similar-day model',()=>{
  const a=similarDays(history,{...row('2026-09-01'),weatherKnown:false,precipMm:0})
  const b=similarDays(history,{...row('2026-09-01'),weatherKnown:false,precipMm:500})
  assert.deepEqual(a,b)
})
test('hindsight attendance never enters the new model features',()=>{
  const a=candidatePredictions(history,row('2026-09-01'),legacy)
  const b=candidatePredictions(history.map(h=>({...h,attendance:999999})),{...row('2026-09-01'),attendance:999999},legacy)
  assert.deepEqual(a,b)
})
test('every retrospective origin excludes issuance day and later actuals, for each horizon',()=>{
  let calls=0
  retrospective(history,'2026-09-01',(train,target)=>{
    assert.ok(train.length>=28)
    assert.ok(train.every(h=>h.date<target.date))
    calls++
    return weekdayBaseline(train,target)
  })
  assert.ok(calls>0)
  const before=retrospective(history,'2026-08-10',legacy)
  const after=retrospective([...history,row('2026-09-01',1e9)],'2026-08-10',legacy)
  assert.deepEqual(before,after)
  const target='2026-08-09'
  const seven=before.find(r=>r.date===target&&r.horizon===7&&r.model===BASELINE_MODEL)!
  assert.deepEqual({guests:seven.guests,sales:seven.sales},candidatePredictions(history.filter(h=>h.date<'2026-08-02'),row(target),legacy)[BASELINE_MODEL])
})
test('a target outcome cannot change its own prediction or interval calibration',()=>{
  const mutated=history.map(h=>h.date==='2026-08-10'?{...h,guests:999999,sales:99999999}:h)
  const a=retrospective(history,'2026-09-01',legacy).filter(r=>r.date==='2026-08-10')
  const b=retrospective(mutated,'2026-09-01',legacy).filter(r=>r.date==='2026-08-10')
  assert.deepEqual(a.map(r=>[r.guests,r.sales]),b.map(r=>[r.guests,r.sales]))
})
test('prospective ledger does not invent actuals, include the current partial day, or double-count',()=>{
  const item={target_date:'2026-09-01',horizon_days:1,model_version:LEGACY_MODEL,guests:110,sales:220000,guests_low:null,guests_high:null,sales_low:null,sales_high:null,input_snapshot:row('2026-09-01'),foodcourt_forecast_issuances:{issued_on:'2026-08-31',evaluation_eligible:true}}
  assert.equal(scoreLedger([item],[row('2026-09-01')],'2026-09-01').length,0)
  assert.equal(scoreLedger([item],[],'2026-09-02').length,0)
  assert.equal(scoreLedger([item,item],[row('2026-09-01')],'2026-09-02').length,1)
  assert.equal(scoreLedger([{...item,foodcourt_forecast_issuances:{issued_on:'2026-08-31',evaluation_eligible:false}}],[row('2026-09-01')],'2026-09-02').length,0)
  assert.equal(scoreLedger([{...item,horizon_days:7}],[row('2026-09-01')],'2026-09-02').length,0)
})
test('champion cannot change on a flattering retrospective result or insufficient evidence',()=>{
  assert.equal(selectChampion([],'2026-09-14').chosen,LEGACY_MODEL)
  assert.equal(selectChampion([scored('2026-09-13',LEGACY_MODEL,30)],'2026-09-14').changed,false)
})
function evidence(asOf:string) {
  return Array.from({length:28},(_,i)=>shiftDate(asOf,i-28)).flatMap(date=>[
    scored(date,LEGACY_MODEL,30),scored(date,BASELINE_MODEL,25),scored(date,'ridge-direct-v1',15)])
}
test('weekly promotion requires paired improvement in both metrics and both halves',()=>{
  const rows=evidence('2026-09-14')
  assert.equal(selectChampion(rows,'2026-09-14').chosen,'ridge-direct-v1')
  assert.equal(selectChampion(rows,'2026-09-15').changed,false)
  assert.equal(selectChampion(rows,'2026-09-14',LEGACY_MODEL,'2026-09-01').changed,false)
  const badSales=rows.map(r=>r.model==='ridge-direct-v1'?{...r,sales:400000}:r)
  assert.notEqual(selectChampion(badSales,'2026-09-14').chosen,'ridge-direct-v1')
  const unstable=rows.map(r=>r.model==='ridge-direct-v1'&&r.date<'2026-08-31'?{...r,guests:150,sales:300000}:r)
  assert.notEqual(selectChampion(unstable,'2026-09-14').chosen,'ridge-direct-v1')
})
test('missing candidate days cannot win by selecting easier targets',()=>{
  const rows=evidence('2026-09-14').filter(r=>r.model!=='ridge-direct-v1'||r.date<'2026-08-28')
  assert.notEqual(selectChampion(rows,'2026-09-14').chosen,'ridge-direct-v1')
})
test('prediction intervals are unavailable with insufficient same-horizon errors',()=>{
  assert.equal(predictionInterval(100,[],'guests').low,null)
  const rows=Array.from({length:25},(_,i)=>scored(shiftDate('2026-08-01',i),LEGACY_MODEL,10))
  assert.deepEqual(predictionInterval(100,rows,'guests'),{low:90,high:110,n:25,nominal_coverage:0.8})
})
test('city tournament is amateur baseball in both deterministic and fallback classifications',()=>{
  assert.equal(normalizeBaseballCategory('第97回都市対抗野球大会','プロ野球'),'アマ野球')
  assert.equal(normalizeBaseballCategory('巨人ー中日','プロ野球'),'プロ野球')
  const events=parseTokyoDomeSchedule('2026年9月\n1\n(火)\n野球\n第97回都市対抗野球大会')
  assert.equal(events[0]?.category,'アマ野球')
})
test('cron publishes atomically without backfilling immutable predictions',()=>{
  const cron=readFileSync(new URL('../supabase/functions/foodcourt-forecast-cron/index.ts',import.meta.url),'utf8')
  const migration=readFileSync(new URL('../supabase/migrations/20260910140000_foodcourt_forecast_issuance.sql',import.meta.url),'utf8')
  assert.match(cron,/isInternalCronAuthorized\(req, supabase\)/)
  assert.match(cron,/\.lt\("business_date", todayJst\)/)
  assert.match(cron,/publish_foodcourt_forecast_v2/)
  assert.doesNotMatch(cron,/\.from\("forecast_predictions"\)/)
  assert.match(migration,/pg_advisory_xact_lock/)
  assert.match(migration,/unique \(tenant_name, issued_on\)/)
  assert.match(migration,/revoke all on public.foodcourt_forecast_issuances, public.foodcourt_forecast_snapshots from public, anon, authenticated, service_role/)
  assert.match(migration,/before update or delete/)
  assert.match(migration,/grant execute on function public.publish_foodcourt_forecast_v2\(jsonb\) to service_role/)
  assert.equal(MODEL_IDS.length,5)
})
