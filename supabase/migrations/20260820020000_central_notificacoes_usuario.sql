-- Central operacional pessoal. O estado de leitura nunca é compartilhado entre
-- usuários ou clínicas e os itens são derivados de registros reais.
create table if not exists public.user_notification_state (
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (clinica_id, user_id, source_type, source_id)
);

alter table public.user_notification_state enable row level security;

create policy "usuario gerencia somente suas leituras"
  on public.user_notification_state for all to authenticated
  using (user_id = auth.uid() and clinica_id = public.current_clinica_id())
  with check (user_id = auth.uid() and clinica_id = public.current_clinica_id());

create index if not exists idx_user_notification_state_user
  on public.user_notification_state (user_id, clinica_id, read_at desc);

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
    select auth.uid() as user_id, public.current_clinica_id() as clinica_id
  ), items(source_type, source_id, category, severity, title, message, occurred_at, href) as (
    select 'tarefa'::text, t.id, 'tarefas'::text,
      case when t.data_vencimento < current_date then 'error' when t.prioridade = 'alta' then 'warning' else 'info' end,
      t.titulo,
      case when t.data_vencimento < current_date then 'Tarefa vencida' else coalesce(t.descricao, 'Tarefa pendente') end,
      coalesce(t.updated_at, t.created_at, now()), '/tarefas'::text
    from public.tarefas t, context c
    where t.clinica_id = c.clinica_id
      and t.status not in ('concluida', 'cancelada')
      and (t.responsavel_id = c.user_id or t.criado_por = c.user_id or public.has_role(c.user_id, 'admin'))

    union all
    select 'consulta', a.id, 'consultas', 'info',
      'Consulta ' || to_char(a.data, 'DD/MM') || ' às ' || left(a.hora_inicio::text, 5),
      coalesce(p.nome, 'Paciente') || coalesce(' · ' || a.tipo, ''),
      (a.data::text || ' ' || a.hora_inicio::text)::timestamp at time zone 'America/Sao_Paulo', '/agenda'
    from public.agendamentos a
    join context c on a.clinica_id = c.clinica_id
    left join public.pacientes p on p.id = a.paciente_id and p.clinica_id = c.clinica_id
    left join public.medicos m on m.id = a.medico_id and m.clinica_id = c.clinica_id
    where a.data between current_date and current_date + 2
      and coalesce(a.status::text, '') not in ('cancelado', 'cancelada', 'concluido', 'concluida')
      and not public.has_role(c.user_id, 'financeiro')
      and (not public.has_role(c.user_id, 'medico') or m.user_id = c.user_id or public.has_role(c.user_id, 'admin'))

    union all
    select 'exame', e.id, 'exames',
      case when e.data_agendamento is not null and e.data_agendamento < current_date then 'warning' else 'info' end,
      'Exame pendente: ' || e.tipo_exame,
      coalesce(p.nome, 'Paciente') || ' · ' || coalesce(e.status::text, 'solicitado'),
      coalesce(e.updated_at, e.created_at, now()), '/exames'
    from public.exames e
    join context c on e.clinica_id = c.clinica_id
    left join public.pacientes p on p.id = e.paciente_id and p.clinica_id = c.clinica_id
    left join public.medicos m on m.id = e.medico_solicitante_id and m.clinica_id = c.clinica_id
    where coalesce(e.status::text, '') not in ('concluido', 'concluida', 'cancelado', 'cancelada', 'realizado')
      and (public.has_role(c.user_id, 'admin') or public.has_role(c.user_id, 'enfermagem')
        or (public.has_role(c.user_id, 'medico') and m.user_id = c.user_id))

    union all
    select 'retorno', r.id, 'retornos',
      case when r.data_retorno_prevista < current_date then 'warning' else 'info' end,
      case when r.data_retorno_prevista < current_date then 'Retorno atrasado' else 'Retorno previsto' end,
      coalesce(p.nome, 'Paciente') || ' · ' || to_char(r.data_retorno_prevista, 'DD/MM/YYYY'),
      r.data_retorno_prevista::timestamp at time zone 'America/Sao_Paulo', '/retornos'
    from public.retornos r
    join context c on r.clinica_id = c.clinica_id
    left join public.pacientes p on p.id = r.paciente_id and p.clinica_id = c.clinica_id
    left join public.medicos m on m.id = r.medico_id and m.clinica_id = c.clinica_id
    where r.data_retorno_prevista between current_date - 7 and current_date + 14
      and coalesce(r.status, '') not in ('realizado', 'cancelado', 'concluido')
      and (public.has_role(c.user_id, 'admin') or public.has_role(c.user_id, 'recepcao')
        or (public.has_role(c.user_id, 'medico') and m.user_id = c.user_id))

    union all
    select 'pagamento', l.id, 'pagamentos', 'error', 'Pagamento vencido',
      l.descricao || ' · R$ ' || to_char(greatest(l.valor - coalesce(l.valor_pago, 0), 0), 'FM999G999G990D00'),
      l.data_vencimento::timestamp at time zone 'America/Sao_Paulo', '/contas'
    from public.lancamentos l, context c
    where l.clinica_id = c.clinica_id and l.data_vencimento < current_date
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
    i.occurred_at, i.href, (s.read_at is not null)
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
  'Notificações operacionais reais, filtradas por clínica, usuário e papel.';
