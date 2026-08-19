create or replace function public.platform_billing_overview()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Acesso restrito à administração da plataforma'; end if;
  with carteira as (
    select c.id clinica_id,c.nome clinica_nome,p.email dono_email,
      ap.id assinatura_id,ap.status assinatura_status,ap.em_trial,ap.data_inicio,ap.data_fim,ap.trial_fim,ap.data_cancelamento,
      pl.nome plano_nome,pl.valor plano_valor,
      am.status mp_status,am.proximo_pagamento,am.mp_preapproval_id,
      case when coalesce(ap.data_fim,ap.trial_fim)<now() and ap.status not in ('cancelada','expirada') then true else false end vencida
    from public.clinicas c
    left join public.profiles p on p.id=c.owner_id
    left join public.assinaturas_plano ap on ap.user_id=c.owner_id
    left join public.planos pl on pl.id=ap.plano_id
    left join public.assinaturas_mercadopago am on am.id=ap.mp_assinatura_id
    where not coalesce(c.arquivada,false)
  ), webhooks as (
    select id,event_id,event_type,data_id,processado,tentativas,erro_mensagem,created_at
    from public.mercadopago_webhook_logs order by created_at desc limit 100
  )
  select jsonb_build_object(
    'generated_at',now(),
    'metrics',jsonb_build_object(
      'mrr',coalesce((select sum(plano_valor) from carteira where assinatura_status='ativa' and not coalesce(em_trial,false)),0),
      'ativas',(select count(*) from carteira where assinatura_status='ativa'),
      'trials',(select count(*) from carteira where coalesce(em_trial,false)),
      'vencidas',(select count(*) from carteira where vencida),
      'sem_assinatura',(select count(*) from carteira where assinatura_id is null),
      'webhooks_pendentes',(select count(*) from public.mercadopago_webhook_logs where not coalesce(processado,false)),
      'webhooks_falha_24h',(select count(*) from public.mercadopago_webhook_logs where created_at>=now()-interval '24 hours' and erro_mensagem is not null)
    ),
    'subscriptions',coalesce((select jsonb_agg(to_jsonb(c) order by c.clinica_nome) from carteira c),'[]'::jsonb),
    'webhooks',coalesce((select jsonb_agg(to_jsonb(w) order by w.created_at desc) from webhooks w),'[]'::jsonb)
  ) into v_result;
  return v_result;
end; $$;
revoke all on function public.platform_billing_overview() from public,anon;
grant execute on function public.platform_billing_overview() to authenticated;
