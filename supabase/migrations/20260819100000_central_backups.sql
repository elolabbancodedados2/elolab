create or replace function public.platform_get_backup_overview()
returns jsonb language plpgsql security definer set search_path = public, storage as $$
declare v_logs jsonb; v_files jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Acesso restrito à administração da plataforma'; end if;
  select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at desc), '[]'::jsonb) into v_logs from (
    select id,tipo,nome,status,registros_processados,registros_sucesso,registros_erro,erro_mensagem,duracao_ms,detalhes,created_at
    from public.automation_logs where tipo in ('backup','backup-verificar') order by created_at desc limit 60
  ) l;
  select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at desc), '[]'::jsonb) into v_files from (
    select name,created_at,updated_at,coalesce((metadata->>'size')::bigint,0) size_bytes
    from storage.objects where bucket_id='backups' and name like '%.json' order by created_at desc limit 90
  ) f;
  return jsonb_build_object('generated_at',now(),'retention_days',90,'backup_schedule','Diariamente às 03:00','verification_schedule','Diariamente às 03:30','files',v_files,'logs',v_logs);
end; $$;
revoke all on function public.platform_get_backup_overview() from public, anon;
grant execute on function public.platform_get_backup_overview() to authenticated;
