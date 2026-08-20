-- Busca global multi-tenant. A função expõe apenas metadados necessários para
-- localizar registros e aplica autorização por categoria no servidor.
create or replace function public.busca_global(p_termo text, p_limite integer default 5)
returns table (
  tipo text,
  id uuid,
  titulo text,
  subtitulo text,
  href text,
  data_referencia timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_clinica uuid := public.current_clinica_id();
  v_termo text := lower(trim(coalesce(p_termo, '')));
  v_limite integer := least(greatest(coalesce(p_limite, 5), 1), 10);
begin
  if auth.uid() is null or v_clinica is null or char_length(v_termo) < 2 then
    return;
  end if;

  v_termo := left(v_termo, 80);

  return query
  select * from (
    select 'paciente'::text, p.id, p.nome::text,
      concat_ws(' · ', nullif('CPF ' || coalesce(p.cpf, ''), 'CPF '), p.telefone)::text,
      ('/pacientes?paciente=' || p.id)::text, p.created_at::timestamptz
    from public.pacientes p
    where p.clinica_id = v_clinica
      and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'recepcao') or public.has_role(auth.uid(), 'enfermagem'))
      and (position(v_termo in lower(p.nome)) > 0 or position(v_termo in lower(coalesce(p.cpf, ''))) > 0 or position(v_termo in lower(coalesce(p.telefone, ''))) > 0 or position(v_termo in lower(coalesce(p.email, ''))) > 0)
    order by p.nome limit v_limite
  ) pacientes
  union all
  select * from (
    select 'consulta'::text, a.id, p.nome::text,
      concat_ws(' · ', to_char(a.data, 'DD/MM/YYYY'), left(a.hora_inicio::text, 5), a.status::text)::text,
      ('/agenda?agendamento=' || a.id || '&data=' || a.data)::text, (a.data + a.hora_inicio)::timestamptz
    from public.agendamentos a join public.pacientes p on p.id = a.paciente_id and p.clinica_id = a.clinica_id
    where a.clinica_id = v_clinica
      and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'recepcao') or public.has_role(auth.uid(), 'enfermagem') or public.has_role(auth.uid(), 'medico'))
      and (position(v_termo in lower(p.nome)) > 0 or position(v_termo in lower(coalesce(p.cpf, ''))) > 0 or position(v_termo in lower(coalesce(a.tipo, ''))) > 0 or position(v_termo in lower(a.status::text)) > 0)
    order by a.data desc, a.hora_inicio desc limit v_limite
  ) consultas
  union all
  select * from (
    select 'exame'::text, e.id, e.tipo_exame::text,
      concat_ws(' · ', p.nome, e.status::text, to_char(e.data_solicitacao, 'DD/MM/YYYY'))::text,
      ('/exames?exame=' || e.id)::text, coalesce(e.data_solicitacao::timestamptz, e.created_at::timestamptz)
    from public.exames e left join public.pacientes p on p.id = e.paciente_id and p.clinica_id = e.clinica_id
    where e.clinica_id = v_clinica
      and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'medico') or public.has_role(auth.uid(), 'enfermagem'))
      and (position(v_termo in lower(e.tipo_exame)) > 0 or position(v_termo in lower(coalesce(p.nome, ''))) > 0 or position(v_termo in lower(coalesce(e.status::text, ''))) > 0)
    order by e.created_at desc limit v_limite
  ) exames
  union all
  select * from (
    select 'pagamento'::text, pg.id, ('Pagamento · ' || pg.forma_pagamento)::text,
      concat_ws(' · ', to_char(pg.data_pagamento, 'DD/MM/YYYY'), 'R$ ' || replace(to_char(pg.valor, 'FM999999990D00'), '.', ','))::text,
      ('/pagamentos?pagamento=' || pg.id)::text, pg.data_pagamento::timestamptz
    from public.pagamentos pg
    where pg.clinica_id = v_clinica
      and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'financeiro'))
      and (position(v_termo in lower(pg.forma_pagamento)) > 0 or position(v_termo in lower(coalesce(pg.observacoes, ''))) > 0 or (regexp_replace(v_termo, '[^0-9,.-]', '', 'g') <> '' and position(regexp_replace(v_termo, '[^0-9,.-]', '', 'g') in replace(pg.valor::text, '.', ',')) > 0) or position(v_termo in lower(pg.id::text)) > 0)
    order by pg.data_pagamento desc limit v_limite
  ) pagamentos
  union all
  select * from (
    select 'tarefa'::text, t.id, t.titulo::text,
      concat_ws(' · ', t.status, t.prioridade, to_char(t.data_vencimento, 'DD/MM/YYYY'))::text,
      ('/tarefas?tarefa=' || t.id)::text, coalesce(t.data_vencimento::timestamptz, t.created_at::timestamptz)
    from public.tarefas t
    where t.clinica_id = v_clinica
      and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'recepcao') or public.has_role(auth.uid(), 'enfermagem') or public.has_role(auth.uid(), 'financeiro') or public.has_role(auth.uid(), 'medico'))
      and (position(v_termo in lower(t.titulo)) > 0 or position(v_termo in lower(coalesce(t.descricao, ''))) > 0 or position(v_termo in lower(t.status)) > 0)
    order by t.created_at desc limit v_limite
  ) tarefas
  union all
  select * from (
    select 'documento'::text, d.id, d.nome_arquivo::text,
      concat_ws(' · ', p.nome, d.categoria, d.tipo_arquivo)::text,
      ('/documentos-clinicos?documento=' || d.id || '&paciente=' || d.paciente_id)::text, d.created_at::timestamptz
    from public.anexos_prontuario d join public.pacientes p on p.id = d.paciente_id and p.clinica_id = d.clinica_id
    where d.clinica_id = v_clinica
      and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'medico'))
      and (position(v_termo in lower(d.nome_arquivo)) > 0 or position(v_termo in lower(coalesce(d.descricao, ''))) > 0 or position(v_termo in lower(p.nome)) > 0)
    order by d.created_at desc limit v_limite
  ) documentos;
end;
$$;

revoke all on function public.busca_global(text, integer) from public, anon;
grant execute on function public.busca_global(text, integer) to authenticated;

comment on function public.busca_global(text, integer) is
  'Busca resumida e multi-tenant com categorias filtradas pelo RBAC do usuário autenticado.';
