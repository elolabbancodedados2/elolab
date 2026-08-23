-- Unifica a resolucao do preco de exames usada pelo fechamento atomico.
-- Aceita codigo TUSS/pontuacao diferentes e consulta convenio, preco interno
-- e catalogo estruturado, sempre dentro da clinica do agendamento.
create or replace function public.normalizar_nome_exame(p_nome text)
returns text language sql immutable parallel safe set search_path = public as $$
  select trim(regexp_replace(
    regexp_replace(
      translate(lower(coalesce(p_nome, '')),
        'áàâãäéèêëíìîïóòôõöúùûüç',
        'aaaaaeeeeiiiiooooouuuuc'),
      '^\s*(exame\s*:\s*)?\d+[\s-]*', '', 'i'),
    '[^a-z0-9]+', ' ', 'g'));
$$;

create or replace function public.resolver_preco_exame(
  p_clinica_id uuid, p_convenio_id uuid, p_tipo_exame text
) returns numeric
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_nome text := public.normalizar_nome_exame(p_tipo_exame);
  v_valor numeric;
begin
  if p_clinica_id is null or not public.is_same_clinica(p_clinica_id) then
    raise exception 'Clinica invalida para resolver o preco do exame';
  end if;
  if length(v_nome) < 2 then
    raise exception 'Informe o nome do exame';
  end if;

  if p_convenio_id is not null then
    select coalesce(nullif(p.valor_total, 0), nullif(p.valor_tabela, 0))
      into v_valor
    from public.precos_exames_convenio p
    where p.convenio_id = p_convenio_id
      and p.ativo
      and (p.clinica_id = p_clinica_id or p.clinica_id is null)
      and (
        public.normalizar_nome_exame(p.tipo_exame) = v_nome
        or (length(public.normalizar_nome_exame(p.tipo_exame)) >= 4 and
          (public.normalizar_nome_exame(p.tipo_exame) like '%' || v_nome || '%'
           or v_nome like '%' || public.normalizar_nome_exame(p.tipo_exame) || '%'))
      )
    order by (p.clinica_id = p_clinica_id) desc, p.updated_at desc nulls last
    limit 1;
    if coalesce(v_valor, 0) > 0 then return v_valor; end if;
  end if;

  select coalesce(nullif((item->>'valor')::numeric, 0), nullif((item->>'preco_venda')::numeric, 0))
    into v_valor
  from public.configuracoes_clinica c
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(c.valor) = 'array' then c.valor else '[]'::jsonb end
  ) item
  where c.clinica_id = p_clinica_id
    and c.chave = 'precos_exames_internos'
    and (
      public.normalizar_nome_exame(item->>'nome') = v_nome
      or (length(public.normalizar_nome_exame(item->>'nome')) >= 4 and
        (public.normalizar_nome_exame(item->>'nome') like '%' || v_nome || '%'
         or v_nome like '%' || public.normalizar_nome_exame(item->>'nome') || '%'))
    )
  order by c.updated_at desc nulls last
  limit 1;
  if coalesce(v_valor, 0) > 0 then return v_valor; end if;

  select nullif(t.preco_venda, 0) into v_valor
  from public.tipo_exames_catalog t
  where t.clinica_id = p_clinica_id and t.ativo
    and (
      public.normalizar_nome_exame(t.nome) = v_nome
      or public.normalizar_nome_exame(coalesce(t.codigo_tuss, '') || ' - ' || t.nome) = v_nome
      or (length(public.normalizar_nome_exame(t.nome)) >= 4 and
        (public.normalizar_nome_exame(t.nome) like '%' || v_nome || '%'
         or v_nome like '%' || public.normalizar_nome_exame(t.nome) || '%'))
    )
  order by t.updated_at desc nulls last
  limit 1;
  return v_valor;
end;
$$;

revoke all on function public.normalizar_nome_exame(text) from public, anon;
revoke all on function public.resolver_preco_exame(uuid, uuid, text) from public, anon;
grant execute on function public.normalizar_nome_exame(text) to authenticated;
grant execute on function public.resolver_preco_exame(uuid, uuid, text) to authenticated;

create or replace function public.finalizar_atendimento_atomico(
  p_agendamento_id uuid, p_fila_id uuid default null,
  p_agendar_retorno boolean default false, p_dias_retorno integer default null,
  p_tipo_exame text default null
)
returns table(status_agendamento text, retorno_id uuid, cobranca_criada boolean)
language plpgsql security invoker set search_path = public as $$
declare
  a agendamentos%rowtype; pac_nome text; pac_convenio uuid; v_tipo tipos_consulta%rowtype;
  v_valor numeric; v_valor_convenio numeric; v_categoria text := 'consulta'; v_desc text; v_retorno uuid;
  v_status text := 'finalizado'; v_exige boolean := false; v_criada boolean := false;
begin
  select * into a from agendamentos where id=p_agendamento_id for update;
  if not found then raise exception 'Agendamento nao encontrado ou fora da sua clinica'; end if;
  select nome, convenio_id into pac_nome, pac_convenio from pacientes where id=a.paciente_id and clinica_id=a.clinica_id;
  if p_fila_id is not null and not exists(select 1 from fila_atendimento where id=p_fila_id and agendamento_id=a.id for update)
    then raise exception 'Item da fila nao pertence ao agendamento'; end if;

  if not exists(select 1 from lancamentos where agendamento_id=a.id) then
    if lower(trim(coalesce(a.tipo,''))) in ('exame','exames') or nullif(trim(p_tipo_exame),'') is not null then
      v_categoria := 'exame'; v_desc := coalesce(nullif(trim(p_tipo_exame),''),'Exame');
      v_valor := public.resolver_preco_exame(a.clinica_id, coalesce(a.convenio_id, pac_convenio), v_desc);
      if coalesce(v_valor,0)<=0 then raise exception 'Nao ha preco cadastrado para o exame "%"',v_desc; end if;
    else
      select * into v_tipo from tipos_consulta where clinica_id=a.clinica_id and ativo and nome ilike a.tipo limit 1;
      if not found then raise exception 'Nao ha preco cadastrado para a consulta "%"',a.tipo; end if;
      v_valor := v_tipo.valor_particular; v_desc := v_tipo.nome;
      if coalesce(a.convenio_id,pac_convenio) is not null then
        select valor into v_valor_convenio from precos_consulta_convenio
        where clinica_id=a.clinica_id and convenio_id=coalesce(a.convenio_id,pac_convenio)
          and tipo_consulta_id=v_tipo.id and ativo limit 1;
      end if;
      v_valor := coalesce(v_valor_convenio,v_valor);
      if coalesce(v_valor,0)<=0 then v_valor := null; end if;
    end if;
    if v_valor is not null then
      insert into lancamentos(tipo,categoria,descricao,valor,data,data_vencimento,status,paciente_id,agendamento_id,clinica_id)
      values('receita',v_categoria,v_desc||' - '||pac_nome,v_valor,current_date,current_date,'pendente',a.paciente_id,a.id,a.clinica_id);
      v_criada := true;
    end if;
  end if;

  select coalesce(exigir_pagamento_previo,false) into v_exige from clinicas where id=a.clinica_id;
  if v_exige and coalesce(saldo_devedor_do_agendamento(a.id),0)>0.009 then v_status := 'aguardando_pagamento_adicional'; end if;
  update agendamentos set status=v_status::status_agendamento where id=a.id;
  if p_fila_id is not null then update fila_atendimento set status='finalizado' where id=p_fila_id; end if;
  if p_agendar_retorno then
    if p_dias_retorno is null or p_dias_retorno not between 1 and 730 then raise exception 'Prazo do retorno deve estar entre 1 e 730 dias'; end if;
    select id into v_retorno from retornos where agendamento_id=a.id and status<>'cancelado' order by created_at desc limit 1;
    if v_retorno is null then
      insert into retornos(paciente_id,medico_id,data_retorno_prevista,data_consulta_origem,motivo,status,agendamento_id,clinica_id,historico)
      values(a.paciente_id,a.medico_id,current_date+p_dias_retorno,current_date,'Retorno de '||a.tipo,'pendente',a.id,a.clinica_id,
        jsonb_build_array(jsonb_build_object('evento','criado','em',now()))) returning id into v_retorno;
    end if;
  end if;
  return query select v_status,v_retorno,v_criada;
end;
$$;

revoke all on function public.finalizar_atendimento_atomico(uuid,uuid,boolean,integer,text) from public, anon;
grant execute on function public.finalizar_atendimento_atomico(uuid,uuid,boolean,integer,text) to authenticated;
