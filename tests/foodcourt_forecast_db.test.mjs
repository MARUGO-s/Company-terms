import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migration = name => readFileSync(new URL('../supabase/migrations/'+name, import.meta.url),'utf8')
test('PostgreSQL forecast publication is atomic, scoped, append-only, and retry-safe', async()=>{
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.foodcourt_base_daily(business_date date,guests numeric,sales numeric);
      create table public.tokyo_dome_events(event_date date,venue text,category text,title text);
      create table public.forecast_predictions(id bigint generated always as identity primary key,target_date date not null,tenant_name text not null,metric text not null,
        predicted numeric,predicted_low numeric,predicted_high numeric,model_version text,features jsonb,actual numeric,unique(target_date,tenant_name,metric));`)
    await db.exec(migration('20260703170000_foodcourt_forecast_factors.sql'))
    await db.exec(migration('20260705130000_foodcourt_forecast_history.sql'))
    await db.exec(`alter table public.foodcourt_forecast_factors add rolling_mape_guests numeric, add rolling_mape_sales numeric;
      alter table public.foodcourt_forecast_history add rolling_mape_guests numeric, add rolling_mape_sales numeric;`)
    await db.exec(migration('20260705120000_foodcourt_forecast_factors_advanced_stats.sql'))
    await db.exec(migration('20260707130000_foodcourt_forecast_factors_model_selection.sql'))
    await db.exec(migration('20260716050000_foodcourt_forecast_wape_mae.sql'))
    await db.exec(`insert into tokyo_dome_events values ('2026-09-01','tokyo-dome','プロ野球','第97回都市対抗野球大会'),('2026-09-09','tokyo-dome','プロ野球','巨人ー中日');`)
    await db.exec(migration('20260910140000_foodcourt_forecast_issuance.sql'))
    const categories=(await db.query('select category from tokyo_dome_events order by event_date')).rows
    assert.deepEqual(categories.map(r=>r.category),['アマ野球','プロ野球'])
    const dates=(await db.query(`select ((now() at time zone 'Asia/Tokyo')::date)::text as today,((now() at time zone 'Asia/Tokyo')::date-1)::text as yesterday`)).rows[0]
    const ids=['mult-factor-v4-safe','weekday-4-v1','similar-days-v1','ridge-direct-v1','ensemble-v1']
    const payload={tenant_name:'MARUGO S',issued_on:dates.today,train_through:dates.yesterday,engine_version:'forecast-audit-v1',chosen_model:ids[0],evaluation:{kind:'test'},data_quality:{},
      snapshots:Array.from({length:15},(_,h)=>ids.map(id=>({target_date:new Date(Date.parse(dates.today)+h*86400000).toISOString().slice(0,10),horizon_days:h,model_version:id,guests:100,sales:200000,guests_low:80,guests_high:120,sales_low:160000,sales_high:240000,input_snapshot:{date:dates.today}}))).flat(),
      history:{history_days:60,backtest_days:28,mean_guests:100},
      factors:{model_version:ids[0],mean_guests:100,wday_factors:{},wday_counts:{},event_factors:{},event_counts:{},weather_factors:{},weather_counts:{},history_days:60,backtest_days:28,model_selection:{chosen:ids[0]}}}
    const publish=async p=>(await db.query('select public.publish_foodcourt_forecast_v2($1::jsonb) as result',[JSON.stringify(p)])).rows[0].result
    await assert.rejects(publish({...payload,tenant_name:'OTHER'}),/scope or cutoff/)
    await assert.rejects(publish({...payload,train_through:dates.today}),/scope or cutoff/)
    await assert.rejects(publish({...payload,snapshots:payload.snapshots.slice(1)}),/fifteen horizons/)
    const wrongDate=structuredClone(payload);wrongDate.snapshots[0].target_date=dates.yesterday
    await assert.rejects(publish(wrongDate),/fifteen horizons/)
    const partialFailure=structuredClone(payload);partialFailure.factors.mean_guests=null
    await assert.rejects(publish(partialFailure),/null value/)
    assert.equal((await db.query('select count(*)::int n from foodcourt_forecast_issuances')).rows[0].n,0)
    assert.equal((await db.query('select count(*)::int n from forecast_predictions')).rows[0].n,0)
    await db.query(`insert into foodcourt_base_daily values ($1,90,180000);`,[dates.yesterday])
    await db.query(`insert into forecast_predictions(target_date,tenant_name,metric,predicted,model_version) values ($1,'MARUGO S','guests',75,'original');`,[dates.yesterday])
    await db.exec('set role anon')
    await assert.rejects(publish(payload),/permission denied/)
    await assert.rejects(db.query('select * from foodcourt_forecast_snapshots'),/permission denied/)
    await db.exec('reset role; set role service_role')
    const first=await publish(payload)
    assert.equal(first.already_published,false)
    const changed=structuredClone(payload);changed.snapshots.forEach(s=>s.guests=110)
    const [retry1,retry2]=await Promise.all([publish(changed),publish(changed)])
    assert.equal(retry1.issuance_id,first.issuance_id);assert.equal(retry2.already_published,true)
    assert.equal((await db.query('select count(*)::int n from foodcourt_forecast_snapshots')).rows[0].n,75)
    assert.equal(Number((await db.query('select max(guests) n from foodcourt_forecast_snapshots')).rows[0].n),100)
    await assert.rejects(db.query('update foodcourt_forecast_snapshots set guests=1'),/permission denied/)
    await db.exec('reset role')
    await assert.rejects(db.query('delete from foodcourt_forecast_issuances'),/immutable/)
    await assert.rejects(db.query('update foodcourt_forecast_snapshots set guests=1'),/immutable/)
    const past=(await db.query('select predicted,actual from forecast_predictions where target_date=$1',[dates.yesterday])).rows[0]
    assert.equal(Number(past.predicted),75);assert.equal(Number(past.actual),90)
    assert.equal((await db.query('select count(*)::int n from forecast_predictions')).rows[0].n,31)
    assert.equal((await db.query('select count(*)::int n from foodcourt_forecast_history')).rows[0].n,1)
    const scopes=(await db.query(`select has_function_privilege('anon','publish_foodcourt_forecast_v2(jsonb)','EXECUTE') as anon,
      has_function_privilege('authenticated','publish_foodcourt_forecast_v2(jsonb)','EXECUTE') as authenticated`)).rows[0]
    assert.deepEqual(scopes,{anon:false,authenticated:false})
  } finally {await db.close()}
})
