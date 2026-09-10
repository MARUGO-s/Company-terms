-- Forecasts issued before the result is known. Never backfill this ledger from backtests.
create table public.foodcourt_forecast_issuances (
  id uuid primary key default gen_random_uuid(),
  tenant_name text not null,
  issued_on date not null,
  issued_at timestamptz not null default now(),
  evaluation_eligible boolean not null,
  train_through date not null,
  engine_version text not null,
  chosen_model text not null,
  evaluation jsonb not null,
  data_quality jsonb not null,
  unique (tenant_name, issued_on),
  check (train_through < issued_on)
);
create table public.foodcourt_forecast_snapshots (
  issuance_id uuid not null references public.foodcourt_forecast_issuances(id),
  target_date date not null,
  horizon_days integer not null check (horizon_days between 0 and 14),
  model_version text not null,
  guests numeric not null check (guests >= 0 and guests < 10000000),
  sales numeric not null check (sales >= 0 and sales < 10000000000),
  guests_low numeric, guests_high numeric, sales_low numeric, sales_high numeric,
  input_snapshot jsonb not null,
  primary key (issuance_id, target_date, model_version),
  check ((guests_low is null and guests_high is null) or (guests_low is not null and guests_high is not null and guests_low >= 0 and guests_low <= guests and guests_high >= guests)),
  check ((sales_low is null and sales_high is null) or (sales_low is not null and sales_high is not null and sales_low >= 0 and sales_low <= sales and sales_high >= sales))
);
create index foodcourt_forecast_snapshots_target_idx on public.foodcourt_forecast_snapshots(target_date, horizon_days);
alter table public.foodcourt_forecast_issuances enable row level security;
alter table public.foodcourt_forecast_snapshots enable row level security;
revoke all on public.foodcourt_forecast_issuances, public.foodcourt_forecast_snapshots from public, anon, authenticated, service_role;
grant select on public.foodcourt_forecast_issuances, public.foodcourt_forecast_snapshots to service_role;
alter table public.foodcourt_forecast_history add column evaluation_version text;

-- Guard even privileged accidental UPDATE/DELETE. Corrections belong in source actuals, not predictions.
create function public.reject_foodcourt_forecast_mutation() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'Issued forecasts are immutable';
end $$;
revoke all on function public.reject_foodcourt_forecast_mutation() from public, anon, authenticated;
create trigger foodcourt_issuance_immutable before update or delete on public.foodcourt_forecast_issuances
for each row execute function public.reject_foodcourt_forecast_mutation();
create trigger foodcourt_snapshot_immutable before update or delete on public.foodcourt_forecast_snapshots
for each row execute function public.reject_foodcourt_forecast_mutation();

-- One atomic publication: advisory lock + date uniqueness make retries/concurrent cron safe.
-- Only the authorized Edge cron service role may call this function. No user-selected tenant.
create function public.publish_foodcourt_forecast_v2(payload jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  issue_date date := (now() at time zone 'Asia/Tokyo')::date;
  run_id uuid;
  chosen text := payload->>'chosen_model';
  f public.foodcourt_forecast_factors;
  h public.foodcourt_forecast_history;
begin
  if payload->>'tenant_name' is distinct from 'MARUGO S'
     or (payload->>'issued_on')::date is distinct from issue_date
     or (payload->>'train_through')::date is null
     or (payload->>'train_through')::date >= issue_date
     or chosen is null or payload->>'engine_version' is distinct from 'forecast-audit-v1' then
    raise exception 'Invalid forecast publication scope or cutoff';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('foodcourt-forecast:MARUGO S', 0));
  select id into run_id from public.foodcourt_forecast_issuances where tenant_name='MARUGO S' and issued_on=issue_date;
  if found then return jsonb_build_object('ok', true, 'already_published', true, 'issuance_id', run_id); end if;
  if jsonb_array_length(payload->'snapshots') is distinct from 75
     or exists (select 1 from jsonb_array_elements(payload->'snapshots') s
       where (s->>'target_date')::date is distinct from issue_date + (s->>'horizon_days')::integer
         or s->>'model_version' not in ('mult-factor-v4-safe','weekday-4-v1','similar-days-v1','ridge-direct-v1','ensemble-v1'))
     or (select count(*) from jsonb_array_elements(payload->'snapshots') s where s->>'model_version'=chosen) <> 15 then
    raise exception 'Expected all five models for all fifteen horizons';
  end if;
  insert into public.foodcourt_forecast_issuances(tenant_name,issued_on,evaluation_eligible,train_through,engine_version,chosen_model,evaluation,data_quality)
  values ('MARUGO S',issue_date,(now() at time zone 'Asia/Tokyo')::time < time '09:00',
    (payload->>'train_through')::date,payload->>'engine_version',chosen,payload->'evaluation',payload->'data_quality')
  returning id into run_id;
  insert into public.foodcourt_forecast_snapshots(issuance_id,target_date,horizon_days,model_version,guests,sales,guests_low,guests_high,sales_low,sales_high,input_snapshot)
  select run_id,s.target_date,s.horizon_days,s.model_version,s.guests,s.sales,s.guests_low,s.guests_high,s.sales_low,s.sales_high,s.input_snapshot
  from jsonb_to_recordset(payload->'snapshots') as s(target_date date,horizon_days integer,model_version text,guests numeric,sales numeric,guests_low numeric,guests_high numeric,sales_low numeric,sales_high numeric,input_snapshot jsonb);

  -- Preserve old predictions. Only actual fields are reconciled; never rewrite historical predicted values.
  update public.forecast_predictions p set actual = case when p.metric='guests' then a.guests else a.sales end
  from public.foodcourt_base_daily a where p.tenant_name='MARUGO S' and p.metric in ('guests','sales')
    and p.target_date=a.business_date and a.business_date<issue_date;
  insert into public.forecast_predictions(target_date,tenant_name,metric,predicted,predicted_low,predicted_high,model_version,features,actual)
  select s.target_date,'MARUGO S',m.metric,
    case when m.metric='guests' then s.guests else s.sales end,
    case when m.metric='guests' then s.guests_low else s.sales_low end,
    case when m.metric='guests' then s.guests_high else s.sales_high end,
    chosen, s.input_snapshot || jsonb_build_object('evaluation_kind','issued','issuance_id',run_id,'issued_on',issue_date,'horizon_days',s.horizon_days),null
  from public.foodcourt_forecast_snapshots s cross join (values ('guests'),('sales')) m(metric)
  where s.issuance_id=run_id and s.model_version=chosen
  on conflict (target_date,tenant_name,metric) do update set predicted=excluded.predicted,predicted_low=excluded.predicted_low,
    predicted_high=excluded.predicted_high,model_version=excluded.model_version,features=excluded.features,actual=null;

  f := jsonb_populate_record(null::public.foodcourt_forecast_factors,payload->'factors');
  insert into public.foodcourt_forecast_factors(tenant_name,model_version,mean_guests,wday_factors,wday_counts,event_factors,event_counts,weather_factors,weather_counts,median_spend,history_days,backtest_days,mape_guests,mape_sales,rolling_mape_guests,rolling_mape_sales,advanced_stats,model_selection,updated_at)
  values ('MARUGO S',f.model_version,f.mean_guests,f.wday_factors,f.wday_counts,f.event_factors,f.event_counts,f.weather_factors,f.weather_counts,f.median_spend,f.history_days,f.backtest_days,f.mape_guests,f.mape_sales,f.rolling_mape_guests,f.rolling_mape_sales,f.advanced_stats,f.model_selection,now())
  on conflict (tenant_name) do update set model_version=excluded.model_version,mean_guests=excluded.mean_guests,wday_factors=excluded.wday_factors,wday_counts=excluded.wday_counts,event_factors=excluded.event_factors,event_counts=excluded.event_counts,weather_factors=excluded.weather_factors,weather_counts=excluded.weather_counts,median_spend=excluded.median_spend,history_days=excluded.history_days,backtest_days=excluded.backtest_days,mape_guests=excluded.mape_guests,mape_sales=excluded.mape_sales,rolling_mape_guests=excluded.rolling_mape_guests,rolling_mape_sales=excluded.rolling_mape_sales,advanced_stats=excluded.advanced_stats,model_selection=excluded.model_selection,updated_at=now();
  h := jsonb_populate_record(null::public.foodcourt_forecast_history,payload->'history');
  insert into public.foodcourt_forecast_history(tenant_name,log_date,model_version,history_days,backtest_days,mape_guests,mape_sales,wape_guests,wape_sales,mae_guests,mae_sales,rolling_mape_guests,rolling_mape_sales,rolling_wape_guests,rolling_wape_sales,rolling_mae_guests,rolling_mae_sales,mean_guests,evaluation_version)
  values ('MARUGO S',issue_date,chosen,h.history_days,h.backtest_days,h.mape_guests,h.mape_sales,h.wape_guests,h.wape_sales,h.mae_guests,h.mae_sales,h.rolling_mape_guests,h.rolling_mape_sales,h.rolling_wape_guests,h.rolling_wape_sales,h.rolling_mae_guests,h.rolling_mae_sales,h.mean_guests,payload->>'engine_version')
  on conflict (tenant_name,log_date) do update set model_version=excluded.model_version,history_days=excluded.history_days,backtest_days=excluded.backtest_days,mape_guests=excluded.mape_guests,mape_sales=excluded.mape_sales,wape_guests=excluded.wape_guests,wape_sales=excluded.wape_sales,mae_guests=excluded.mae_guests,mae_sales=excluded.mae_sales,rolling_mape_guests=excluded.rolling_mape_guests,rolling_mape_sales=excluded.rolling_mape_sales,rolling_wape_guests=excluded.rolling_wape_guests,rolling_wape_sales=excluded.rolling_wape_sales,rolling_mae_guests=excluded.rolling_mae_guests,rolling_mae_sales=excluded.rolling_mae_sales,mean_guests=excluded.mean_guests,evaluation_version=excluded.evaluation_version;
  return jsonb_build_object('ok',true,'already_published',false,'issuance_id',run_id);
end $$;
revoke all on function public.publish_foodcourt_forecast_v2(jsonb) from public, anon, authenticated;
grant execute on function public.publish_foodcourt_forecast_v2(jsonb) to service_role;

-- Repair a specific, verified parser error. Do not change other event fields or historical forecast ledgers.
update public.tokyo_dome_events set category='アマ野球'
where venue='tokyo-dome' and category='プロ野球' and title ~ '(都市対抗|社会人野球|全日本クラブ野球|大学野球|高校野球)';
