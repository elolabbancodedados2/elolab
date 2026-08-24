-- Barramento transacional multi-tenant para manter os modulos operacionais
-- sincronizados sem transportar dados clinicos sensiveis no payload realtime.
create table if not exists public.operational_events (
  id bigint generated always as identity primary key,
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  aggregate_type text not null check (aggregate_type in (
    'agendamento','fila','triagem','prontuario','exame','lancamento','retorno'
  )),
  aggregate_id uuid not null,
  event_type text not null,
  actor_id uuid references auth.users(id) on delete set null,
  correlation_id uuid not null default gen_random_uuid(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint operational_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists operational_events_tenant_created_idx
  on public.operational_events (clinica_id, created_at desc);
create index if not exists operational_events_aggregate_idx
  on public.operational_events (aggregate_type, aggregate_id, created_at desc);

alter table public.operational_events enable row level security;
alter table public.operational_events force row level security;

drop policy if exists "usuarios leem eventos da propria clinica" on public.operational_events;
create policy "usuarios leem eventos da propria clinica"
  on public.operational_events for select to authenticated
  using (clinica_id = public.current_clinica_id());

revoke all on public.operational_events from public, anon, authenticated;
grant select on public.operational_events to authenticated;

create or replace function public.capture_operational_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_clinica_id uuid;
  v_id uuid;
  v_type text;
  v_event text;
  v_metadata jsonb := '{}'::jsonb;
begin
  v_clinica_id := nullif(v_row->>'clinica_id', '')::uuid;
  v_id := nullif(v_row->>'id', '')::uuid;
  if v_clinica_id is null or v_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  v_type := case tg_table_name
    when 'agendamentos' then 'agendamento'
    when 'fila_atendimento' then 'fila'
    when 'triagens' then 'triagem'
    when 'prontuarios' then 'prontuario'
    when 'exames' then 'exame'
    when 'lancamentos' then 'lancamento'
    when 'retornos' then 'retorno'
  end;
  if v_type is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  v_event := v_type || '.' || lower(tg_op);
  if tg_op = 'UPDATE' and v_row ? 'status' and v_old->>'status' is distinct from v_row->>'status' then
    v_event := v_type || '.status_changed';
    v_metadata := jsonb_build_object('from', v_old->>'status', 'to', v_row->>'status');
  end if;

  -- Somente identificadores tecnicos e estados. Nunca nome, observacao,
  -- diagnostico, resultado, valor ou outro dado pessoal/clinico.
  v_metadata := v_metadata || jsonb_strip_nulls(jsonb_build_object(
    'agendamento_id', v_row->>'agendamento_id',
    'paciente_id', v_row->>'paciente_id'
  ));

  insert into public.operational_events(
    clinica_id, aggregate_type, aggregate_id, event_type, actor_id, metadata
  ) values (
    v_clinica_id, v_type, v_id, v_event, auth.uid(), v_metadata
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.capture_operational_event() from public, anon, authenticated;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'agendamentos','fila_atendimento','triagens','prontuarios',
    'exames','lancamentos','retornos'
  ] loop
    if to_regclass('public.' || v_table) is not null then
      execute format('drop trigger if exists capture_operational_event_trigger on public.%I', v_table);
      execute format(
        'create trigger capture_operational_event_trigger after insert or update or delete on public.%I for each row execute function public.capture_operational_event()',
        v_table
      );
    end if;
  end loop;
end $$;

-- Realtime entrega apenas eventos que a RLS permite ao usuario autenticado.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'operational_events'
  ) then
    alter publication supabase_realtime add table public.operational_events;
  end if;
end $$;

comment on table public.operational_events is
  'Eventos tecnicos multi-tenant para sincronizacao entre modulos; payload sem PHI.';
