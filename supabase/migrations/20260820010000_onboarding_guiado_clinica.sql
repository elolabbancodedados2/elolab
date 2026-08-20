-- Onboarding operacional da clínica. O progresso é calculado exclusivamente
-- a partir dos cadastros reais do tenant; não existe conclusão manual.
create table if not exists public.clinic_onboarding_state (
  clinica_id uuid primary key references public.clinicas(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_by uuid references auth.users(id)
);

alter table public.clinic_onboarding_state enable row level security;

drop policy if exists "admin consulta onboarding da clinica" on public.clinic_onboarding_state;
create policy "admin consulta onboarding da clinica"
  on public.clinic_onboarding_state for select to authenticated
  using (
    clinica_id = public.current_clinica_id()
    and public.has_role(auth.uid(), 'admin')
  );

-- Escritas passam somente pela função para impedir troca de tenant e conclusão
-- forjada pelo cliente.
create or replace function public.clinic_onboarding_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica uuid := public.current_clinica_id();
  v_team_count integer;
  v_schedule_count integer;
  v_service_count integer;
  v_whatsapp_count integer;
  v_appointment_count integer;
  v_completed integer;
  v_is_complete boolean;
  v_completed_at timestamptz;
begin
  if v_clinica is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Acesso restrito ao administrador da clínica';
  end if;

  select count(*)::integer into v_team_count
  from public.profiles p
  where p.clinica_id = v_clinica and p.ativo and p.id <> auth.uid();

  select count(*)::integer into v_schedule_count
  from public.configuracoes_clinica c
  where c.clinica_id = v_clinica
    and c.chave = 'config_clinica'
    and nullif(c.valor ->> 'horarioAbertura', '') is not null
    and nullif(c.valor ->> 'horarioFechamento', '') is not null
    and case
      when jsonb_typeof(c.valor -> 'diasFuncionamento') = 'array'
        then jsonb_array_length(c.valor -> 'diasFuncionamento') > 0
      else false
    end;

  select count(*)::integer into v_service_count
  from public.tipos_consulta t
  where t.clinica_id = v_clinica and coalesce(t.ativo, true);

  select count(*)::integer into v_whatsapp_count
  from public.whatsapp_sessions w
  where w.clinica_id = v_clinica;

  select count(*)::integer into v_appointment_count
  from public.agendamentos a
  where a.clinica_id = v_clinica;

  v_completed := (case when v_team_count > 0 then 1 else 0 end)
    + (case when v_schedule_count > 0 then 1 else 0 end)
    + (case when v_service_count > 0 then 1 else 0 end)
    + (case when v_whatsapp_count > 0 then 1 else 0 end)
    + (case when v_appointment_count > 0 then 1 else 0 end);
  v_is_complete := v_completed = 5;

  insert into public.clinic_onboarding_state
    (clinica_id, last_opened_at, completed_at, updated_by)
  values
    (v_clinica, now(), case when v_is_complete then now() end, auth.uid())
  on conflict (clinica_id) do update
    set last_opened_at = now(),
        completed_at = case
          when v_is_complete then coalesce(clinic_onboarding_state.completed_at, now())
          else null
        end,
        updated_by = auth.uid()
  returning completed_at into v_completed_at;

  return jsonb_build_object(
    'clinica_id', v_clinica,
    'completed_steps', v_completed,
    'total_steps', 5,
    'progress', v_completed * 20,
    'completed_at', v_completed_at,
    'steps', jsonb_build_array(
      jsonb_build_object('key', 'team', 'complete', v_team_count > 0, 'count', v_team_count),
      jsonb_build_object('key', 'schedule', 'complete', v_schedule_count > 0, 'count', v_schedule_count),
      jsonb_build_object('key', 'services', 'complete', v_service_count > 0, 'count', v_service_count),
      jsonb_build_object('key', 'whatsapp', 'complete', v_whatsapp_count > 0, 'count', v_whatsapp_count),
      jsonb_build_object('key', 'appointment', 'complete', v_appointment_count > 0, 'count', v_appointment_count)
    )
  );
end;
$$;

revoke all on table public.clinic_onboarding_state from public, anon;
grant select on table public.clinic_onboarding_state to authenticated;
revoke all on function public.clinic_onboarding_overview() from public, anon;
grant execute on function public.clinic_onboarding_overview() to authenticated;
