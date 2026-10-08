create or replace function public.platform_open_incident(
  p_title text,
  p_summary text,
  p_severity text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_title text := trim(coalesce(p_title, ''));
  v_summary text := trim(coalesce(p_summary, ''));
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito';
  end if;
  if length(v_title) not between 5 and 160 then
    raise exception 'O título deve ter entre 5 e 160 caracteres';
  end if;
  if length(v_summary) not between 10 and 2000 then
    raise exception 'O impacto observado deve ter entre 10 e 2000 caracteres';
  end if;
  if p_severity is null or p_severity not in ('minor', 'major', 'critical') then
    raise exception 'Severidade inválida';
  end if;

  insert into public.platform_incidents (title, summary, severity, affected_services)
  values (v_title, v_summary, p_severity, '{}')
  returning id into v_id;

  insert into public.platform_incident_updates (incident_id, message, status)
  values (v_id, 'Incidente aberto. A investigação foi iniciada.', 'investigating');

  insert into public.audit_log (user_id, action, collection, record_id, changes)
  values (
    auth.uid(),
    'create',
    'platform_incidents',
    v_id::text,
    jsonb_build_object('title', v_title, 'severity', p_severity, 'status', 'investigating')
  );

  return v_id;
end;
$$;

revoke all on function public.platform_open_incident(text, text, text) from public, anon;
grant execute on function public.platform_open_incident(text, text, text) to authenticated;
