-- Central de notificações (auditoria médica 2026-10-16, itens 03, 09, 10 e 13).
-- 03: resultados críticos liberados, na versão vigente e sem ciência, entram na central.
-- 10: estados encerrados (finalizado, atendimento_finalizado, faltou, realizado) deixam de
--     ser pendência; resultado disponível é separado de exame ainda não realizado.
-- 13: links levam ao item e à data (agenda, laudo, paciente).
-- 09: tarefas passam a emitir eventos Realtime para atualizar filas abertas.

create or replace function public.central_notificacoes_usuario(p_limit integer default 100)
returns table (
  source_type text,
  source_id uuid,
  category text,
  severity text,
  title text,
  message text,
  occurred_at timestamptz,
  href text,
  is_read boolean
)
language sql
security definer
set search_path = public
stable
as $$
  with context as (
    select
      auth.uid() as user_id,
      public.current_clinica_id() as clinica_id,
      (now() at time zone 'America/Sao_Paulo')::date as hoje
  ), items(source_type, source_id, category, severity, title, message, occurred_at, href) as (
    select 'tarefa'::text, t.id, 'tarefas'::text,
      case when t.data_vencimento < c.hoje then 'error' when t.prioridade = 'alta' then 'warning' else 'info' end,
      t.titulo,
      case when t.data_vencimento < c.hoje then 'Tarefa vencida' else coalesce(t.descricao, 'Tarefa pendente') end,
      coalesce(t.updated_at, t.created_at, now()), '/tarefas'::text
    from public.tarefas t, context c
    where t.clinica_id = c.clinica_id
      and t.status not in ('concluida', 'cancelada')
      and (t.responsavel_id = c.user_id or t.criado_por = c.user_id or public.has_role(c.user_id, 'admin'))

    union all
    select 'consulta', a.id, 'consultas', 'info',
      'Consulta ' || to_char(a.data, 'DD/MM') || ' às ' || left(a.hora_inicio::text, 5),
      coalesce(p.nome, 'Paciente') || coalesce(' · ' || a.tipo, ''),
      (a.data::text || ' ' || a.hora_inicio::text)::timestamp at time zone 'America/Sao_Paulo',
      '/agenda?data=' || a.data::text || '&agendamento=' || a.id::text
    from public.agendamentos a
    join context c on a.clinica_id = c.clinica_id
    left join public.pacientes p on p.id = a.paciente_id and p.clinica_id = c.clinica_id
    left join public.medicos m on m.id = a.medico_id and m.clinica_id = c.clinica_id
    where a.data between c.hoje and c.hoje + 2
      and coalesce(a.status::text, '') not in ('cancelado', 'faltou', 'finalizado', 'atendimento_finalizado')
      and not public.has_role(c.user_id, 'financeiro')
      and (not public.has_role(c.user_id, 'medico') or m.user_id = c.user_id or public.has_role(c.user_id, 'admin'))

    union all
    select 'exame', e.id, 'exames',
      case when e.data_agendamento is not null and e.data_agendamento < c.hoje then 'warning' else 'info' end,
      'Exame pendente: ' || e.tipo_exame,
      coalesce(p.nome, 'Paciente') || ' · ' || coalesce(e.status::text, 'solicitado'),
      coalesce(e.updated_at, e.created_at, now()),
      '/exames' || coalesce('?paciente=' || e.paciente_id::text, '')
    from public.exames e
    join context c on e.clinica_id = c.clinica_id
    left join public.pacientes p on p.id = e.paciente_id and p.clinica_id = c.clinica_id
    left join public.medicos m on m.id = e.medico_solicitante_id and m.clinica_id = c.clinica_id
    where coalesce(e.status::text, 'solicitado') in ('solicitado', 'agendado')
      and (public.has_role(c.user_id, 'admin') or public.has_role(c.user_id, 'enfermagem')
        or (public.has_role(c.user_id, 'medico') and m.user_id = c.user_id))

    union all
    select 'exame_resultado', e.id, 'exames', 'info',
      'Resultado disponível: ' || e.tipo_exame,
      coalesce(p.nome, 'Paciente') || ' · aguardando revisão',
      coalesce(e.resultado_em, e.updated_at, e.created_at, now()),
      '/exames' || coalesce('?paciente=' || e.paciente_id::text, '')
    from public.exames e
    join context c on e.clinica_id = c.clinica_id
    left join public.pacientes p on p.id = e.paciente_id and p.clinica_id = c.clinica_id
    left join public.medicos m on m.id = e.medico_solicitante_id and m.clinica_id = c.clinica_id
    where e.status::text = 'laudo_disponivel'
      -- Sem estado "revisado" em exames: a janela evita acumular resultados antigos.
      and coalesce(e.resultado_em, e.updated_at, e.created_at) >= now() - interval '14 days'
      and (public.has_role(c.user_id, 'admin')
        or (public.has_role(c.user_id, 'medico') and m.user_id = c.user_id))

    union all
    select 'resultado_critico', r.id, 'exames', 'error',
      'Resultado crítico: ' || r.parametro,
      coalesce(p.nome, 'Paciente') || ' · ' || r.resultado || coalesce(' ' || r.unidade, '') || ' · registre ciência e conduta',
      coalesce(r.updated_at, r.data_liberacao, r.created_at, now()),
      '/laudos-lab?coleta=' || r.coleta_id::text
    from public.resultados_laboratorio r
    join context c on r.clinica_id = c.clinica_id
    left join public.pacientes p on p.id = r.paciente_id and p.clinica_id = c.clinica_id
    left join public.exames e on e.id = r.exame_id and e.clinica_id = c.clinica_id
    left join public.medicos m on m.id = e.medico_solicitante_id and m.clinica_id = c.clinica_id
    where r.critico is true
      and r.liberado is true
      and not exists (
        select 1 from public.resultado_critico_confirmacoes k
        where k.resultado_id = r.id and k.numero_versao = r.numero_versao
      )
      and (public.has_role(c.user_id, 'admin')
        or (public.has_role(c.user_id, 'medico') and m.user_id = c.user_id))

    union all
    select 'retorno', r.id, 'retornos',
      case when r.data_retorno_prevista < c.hoje then 'warning' else 'info' end,
      case when r.data_retorno_prevista < c.hoje then 'Retorno atrasado' else 'Retorno previsto' end,
      coalesce(p.nome, 'Paciente') || ' · ' || to_char(r.data_retorno_prevista, 'DD/MM/YYYY'),
      r.data_retorno_prevista::timestamp at time zone 'America/Sao_Paulo',
      '/retornos' || coalesce('?paciente=' || r.paciente_id::text, '')
    from public.retornos r
    join context c on r.clinica_id = c.clinica_id
    left join public.pacientes p on p.id = r.paciente_id and p.clinica_id = c.clinica_id
    left join public.medicos m on m.id = r.medico_id and m.clinica_id = c.clinica_id
    where r.data_retorno_prevista between c.hoje - 7 and c.hoje + 14
      and coalesce(r.status, '') not in ('realizado', 'cancelado', 'concluido')
      and (public.has_role(c.user_id, 'admin') or public.has_role(c.user_id, 'recepcao')
        or (public.has_role(c.user_id, 'medico') and m.user_id = c.user_id))

    union all
    select 'pagamento', l.id, 'pagamentos', 'error', 'Pagamento vencido',
      l.descricao || ' · R$ ' || to_char(greatest(l.valor - coalesce(l.valor_pago, 0), 0), 'FM999G999G990D00'),
      l.data_vencimento::timestamp at time zone 'America/Sao_Paulo', '/contas'
    from public.lancamentos l, context c
    where l.clinica_id = c.clinica_id and l.data_vencimento < c.hoje
      and coalesce(l.status::text, '') not in ('pago', 'cancelado')
      and (public.has_role(c.user_id, 'admin') or public.has_role(c.user_id, 'financeiro'))

    union all
    select 'alerta', n.id, 'alertas', 'error', 'Falha no envio: ' || coalesce(n.assunto, n.tipo),
      coalesce(n.erro_mensagem, 'A notificação não pôde ser entregue'),
      coalesce(n.ultimo_erro_em, n.updated_at, n.created_at, now()), '/automacoes'
    from public.notification_queue n, context c
    where n.clinica_id = c.clinica_id and n.status = 'erro'
      and coalesce(n.updated_at, n.created_at) >= now() - interval '30 days'
      and public.has_role(c.user_id, 'admin')
  )
  select i.source_type, i.source_id, i.category, i.severity, i.title, i.message,
    i.occurred_at, i.href,
    -- Uma retificação do resultado crítico volta a marcá-lo como não lido.
    (s.read_at is not null and (i.source_type <> 'resultado_critico' or s.read_at >= i.occurred_at))
  from items i
  cross join context c
  left join public.user_notification_state s
    on s.clinica_id = c.clinica_id and s.user_id = c.user_id
   and s.source_type = i.source_type and s.source_id = i.source_id
  order by (s.read_at is null) desc, i.occurred_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 250);
$$;

revoke all on function public.central_notificacoes_usuario(integer) from public;
grant execute on function public.central_notificacoes_usuario(integer) to authenticated;

comment on function public.central_notificacoes_usuario(integer) is
  'Notificações operacionais reais (inclui resultados críticos sem ciência), filtradas por clínica, usuário, papel e data civil de São Paulo.';

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tarefas'
     ) then
    alter publication supabase_realtime add table public.tarefas;
  end if;
end $$;
