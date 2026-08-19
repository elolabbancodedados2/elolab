create or replace function public.platform_queue_overview() returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not public.is_platform_admin() then raise exception 'Acesso restrito'; end if;
 return jsonb_build_object('generated_at',now(),
  'metrics',jsonb_build_object('notifications_pending',(select count(*) from notification_queue where status in('pendente','enviando')),'notifications_failed',(select count(*) from notification_queue where status='erro'),'webhooks_pending',(select count(*) from mercadopago_webhook_logs where not coalesce(processado,false)),'webhooks_failed_24h',(select count(*) from mercadopago_webhook_logs where not coalesce(processado,false) and erro_mensagem is not null and created_at>now()-interval '24 hours')),
  'notifications',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from(select q.id,q.clinica_id,c.nome clinica_nome,q.tipo,q.status,q.tentativas,q.max_tentativas,q.agendado_para,q.erro_mensagem,q.created_at from notification_queue q left join clinicas c on c.id=q.clinica_id where q.status<>'enviado' order by q.created_at desc limit 200)x),'[]'::jsonb),
  'webhooks',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from(select id,event_id,event_type,data_id,processado,tentativas,erro_mensagem,created_at from mercadopago_webhook_logs order by created_at desc limit 200)x),'[]'::jsonb));
end;$$;
create or replace function public.platform_retry_notification(p_id uuid) returns boolean language plpgsql security definer set search_path=public as $$
begin
 if current_user not in ('service_role','postgres','supabase_admin') then raise exception 'Acesso restrito'; end if;
 update notification_queue set status='pendente',tentativas=0,agendado_para=now(),iniciado_em=null,erro_mensagem=null,updated_at=now() where id=p_id and status='erro'; return found;
end;$$;
revoke all on function public.platform_queue_overview(),public.platform_retry_notification(uuid) from public,anon,authenticated;
grant execute on function public.platform_queue_overview() to authenticated;
grant execute on function public.platform_retry_notification(uuid) to service_role;
