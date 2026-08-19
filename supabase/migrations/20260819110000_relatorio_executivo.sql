create or replace function public.platform_executive_report(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Acesso restrito à administração da plataforma'; end if;
  if p_days not between 7 and 365 then raise exception 'Período deve estar entre 7 e 365 dias'; end if;
  with crm as materialized (select * from public.platform_crm_overview()),
  portfolio as (
    select count(*) total_clinicas,
      count(*) filter(where assinatura_status='ativa' and not suspensa) ativas,
      count(*) filter(where em_trial) trials,
      count(*) filter(where suspensa) suspensas,
      count(*) filter(where coalesce(dias_sem_uso,999)>=14 and not suspensa) em_risco,
      coalesce(sum(plano_valor) filter(where assinatura_status='ativa' and not em_trial and not suspensa),0) mrr
    from crm
  ), crescimento as (
    select
      (select count(*) from crm where cliente_desde>=now()-make_interval(days=>p_days)) novas_clinicas,
      (select count(*) from public.pacientes where created_at>=now()-make_interval(days=>p_days)) novos_pacientes,
      (select count(*) from public.agendamentos where created_at>=now()-make_interval(days=>p_days)) agendamentos
  ), suporte as (
    select count(*) tickets,
      count(*) filter(where status not in ('resolvido','fechado')) abertos,
      count(*) filter(where status not in ('resolvido','fechado') and sla_limite<now()) sla_vencido,
      coalesce(round(avg(extract(epoch from (resolvido_em-created_at))/3600) filter(where resolvido_em is not null)::numeric,1),0) horas_resolucao
    from public.support_tickets where created_at>=now()-make_interval(days=>p_days)
  ), ia as (
    select count(*) chamadas, count(*) filter(where sucesso) sucessos,
      coalesce(sum(input_tokens+output_tokens),0) tokens,
      coalesce(round(sum(custo_estimado)::numeric,4),0) custo
    from public.platform_ai_usage where created_at>=now()-make_interval(days=>p_days)
  ), top_clientes as (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.total_agendamentos desc),'[]'::jsonb) lista from (
      select clinica_id,clinica_nome,plano_nome,plano_valor,assinatura_status,total_pacientes,total_agendamentos,dias_sem_uso
      from crm order by total_agendamentos desc limit 10
    ) t
  )
  select jsonb_build_object(
    'generated_at',now(),'days',p_days,
    'portfolio',jsonb_build_object('total_clinicas',p.total_clinicas,'ativas',p.ativas,'trials',p.trials,'suspensas',p.suspensas,'em_risco',p.em_risco,'mrr',p.mrr,'arr',p.mrr*12),
    'growth',to_jsonb(c),'support',to_jsonb(s),
    'ai',jsonb_build_object('chamadas',i.chamadas,'sucessos',i.sucessos,'taxa_sucesso',case when i.chamadas=0 then 0 else round(i.sucessos*100.0/i.chamadas,1) end,'tokens',i.tokens,'custo',i.custo),
    'top_clients',t.lista
  ) into v_result from portfolio p cross join crescimento c cross join suporte s cross join ia i cross join top_clientes t;
  return v_result;
end; $$;
revoke all on function public.platform_executive_report(integer) from public, anon;
grant execute on function public.platform_executive_report(integer) to authenticated;
