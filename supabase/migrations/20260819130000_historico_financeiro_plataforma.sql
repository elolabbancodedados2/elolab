create table if not exists public.platform_subscription_events(
 id bigint generated always as identity primary key, assinatura_id uuid not null, clinica_id uuid references public.clinicas(id), user_id uuid not null,
 event_type text not null check(event_type in('baseline','created','upgrade','downgrade','canceled','reactivated','status_changed')),
 old_status text,new_status text,old_plan_slug text,new_plan_slug text,old_value numeric(12,2),new_value numeric(12,2),mrr_delta numeric(12,2) not null default 0,
 source text not null default 'database',occurred_at timestamptz not null default now()
);
alter table public.platform_subscription_events enable row level security;
create policy "plataforma le historico assinaturas" on public.platform_subscription_events for select to authenticated using(public.is_platform_admin());
create index if not exists platform_subscription_events_date_idx on public.platform_subscription_events(occurred_at desc);

create or replace function public.capture_subscription_event() returns trigger language plpgsql security definer set search_path=public as $$
declare v_clinica uuid; v_old numeric:=0; v_new numeric:=0; v_type text;
begin
 select id into v_clinica from public.clinicas where owner_id=coalesce(new.user_id,old.user_id) limit 1;
 if tg_op='UPDATE' and old.plano_id is not null then select valor into v_old from public.planos where id=old.plano_id; end if;
 if tg_op<>'DELETE' and new.plano_id is not null then select valor into v_new from public.planos where id=new.plano_id; end if;
 if tg_op='INSERT' then v_type:='created';
 elsif new.status='cancelada' and old.status is distinct from new.status then v_type:='canceled';
 elsif old.status='cancelada' and new.status in('ativa','trial') then v_type:='reactivated';
 elsif old.plano_id is distinct from new.plano_id then v_type:=case when coalesce(v_new,0)>=coalesce(v_old,0) then 'upgrade' else 'downgrade' end;
 elsif old.status is distinct from new.status then v_type:='status_changed'; else return new; end if;
 insert into public.platform_subscription_events(assinatura_id,clinica_id,user_id,event_type,old_status,new_status,old_plan_slug,new_plan_slug,old_value,new_value,mrr_delta)
 values(new.id,v_clinica,new.user_id,v_type,case when tg_op='UPDATE' then old.status end,new.status,case when tg_op='UPDATE' then old.plano_slug end,new.plano_slug,v_old,v_new,
   (case when new.status='ativa' and not coalesce(new.em_trial,false) then coalesce(v_new,0) else 0 end)-(case when tg_op='UPDATE' and old.status='ativa' and not coalesce(old.em_trial,false) then coalesce(v_old,0) else 0 end));
 return new;
end; $$;
drop trigger if exists capture_subscription_event_trigger on public.assinaturas_plano;
create trigger capture_subscription_event_trigger after insert or update on public.assinaturas_plano for each row execute function public.capture_subscription_event();

insert into public.platform_subscription_events(assinatura_id,clinica_id,user_id,event_type,new_status,new_plan_slug,new_value,mrr_delta,source,occurred_at)
select ap.id,c.id,ap.user_id,'baseline',ap.status,ap.plano_slug,pl.valor,case when ap.status='ativa' and not coalesce(ap.em_trial,false) then coalesce(pl.valor,0) else 0 end,'migration',now()
from public.assinaturas_plano ap left join public.clinicas c on c.owner_id=ap.user_id left join public.planos pl on pl.id=ap.plano_id
where not exists(select 1 from public.platform_subscription_events e where e.assinatura_id=ap.id);

create or replace function public.platform_financial_history(p_days integer default 90) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not public.is_platform_admin() then raise exception 'Acesso restrito'; end if;
 return jsonb_build_object('tracking_since',(select min(occurred_at) from public.platform_subscription_events),
  'metrics',jsonb_build_object(
   'expansion',coalesce((select sum(mrr_delta) from public.platform_subscription_events where occurred_at>=now()-make_interval(days=>p_days) and mrr_delta>0 and event_type<>'baseline'),0),
   'contraction',abs(coalesce((select sum(mrr_delta) from public.platform_subscription_events where occurred_at>=now()-make_interval(days=>p_days) and mrr_delta<0),0)),
   'churned',(select count(*) from public.platform_subscription_events where occurred_at>=now()-make_interval(days=>p_days) and event_type='canceled'),
   'reactivated',(select count(*) from public.platform_subscription_events where occurred_at>=now()-make_interval(days=>p_days) and event_type='reactivated')),
  'events',coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at desc) from(select e.*,c.nome clinica_nome from public.platform_subscription_events e left join public.clinicas c on c.id=e.clinica_id where e.occurred_at>=now()-make_interval(days=>p_days) order by e.occurred_at desc limit 500)x),'[]'::jsonb));
end; $$;
revoke all on function public.platform_financial_history(integer) from public,anon; grant execute on function public.platform_financial_history(integer) to authenticated;
