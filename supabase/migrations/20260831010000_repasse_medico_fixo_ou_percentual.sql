-- Repasse por percentual da receita ou valor fixo por atendimento recebido.
alter table public.medicos
  add column if not exists tipo_repasse text not null default 'percentual'
    check (tipo_repasse in ('percentual', 'fixo')),
  add column if not exists valor_repasse_fixo numeric(12,2) not null default 0
    check (valor_repasse_fixo >= 0);

alter table public.repasses_medicos
  add column if not exists tipo_calculo text not null default 'percentual'
    check (tipo_calculo in ('percentual', 'fixo')),
  add column if not exists valor_configurado numeric(12,2);

create or replace function public.configurar_repasse_medico(p_medico_id uuid, p_tipo text, p_valor numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_access_financial(auth.uid())
     or p_tipo not in ('percentual', 'fixo') or p_valor < 0
     or (p_tipo = 'percentual' and p_valor > 100) then
    raise exception 'Configuracao de repasse invalida';
  end if;
  update public.medicos
     set tipo_repasse = p_tipo,
         percentual_repasse = case when p_tipo = 'percentual' then p_valor else percentual_repasse end,
         valor_repasse_fixo = case when p_tipo = 'fixo' then p_valor else valor_repasse_fixo end
   where id = p_medico_id and clinica_id = public.get_my_clinica_id();
  if not found then raise exception 'Medico nao encontrado'; end if;
end;
$$;
revoke all on function public.configurar_repasse_medico(uuid, text, numeric) from public, anon;
grant execute on function public.configurar_repasse_medico(uuid, text, numeric) to authenticated;

create or replace function public.configurar_percentual_repasse(p_medico_id uuid, p_percentual numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.configurar_repasse_medico(p_medico_id, 'percentual', p_percentual);
end;
$$;

create or replace function public.gerar_repasses_medicos(p_competencia date)
returns integer language plpgsql security definer set search_path = public as $$
declare v_clinica uuid := public.get_my_clinica_id(); v_count integer;
begin
  if not public.can_access_financial(auth.uid()) then raise exception 'Acesso financeiro necessario'; end if;
  -- Percentual acompanha cada receita. Fixo usa somente a primeira receita
  -- quitada do agendamento, evitando pagar mais de uma vez quando a consulta
  -- possui procedimentos ou itens adicionais.
  with fontes as (
    select l.*, a.medico_id,
           row_number() over (partition by l.agendamento_id order by l.data, l.created_at, l.id) as ordem_atendimento
      from public.lancamentos l
      join public.agendamentos a on a.id = l.agendamento_id and a.clinica_id = l.clinica_id
     where l.clinica_id = v_clinica and l.tipo = 'receita' and l.status = 'pago'
       and l.data >= date_trunc('month', p_competencia)::date
       and l.data < (date_trunc('month', p_competencia) + interval '1 month')::date
  )
  insert into public.repasses_medicos
    (clinica_id, medico_id, lancamento_id, competencia, valor_base, percentual,
     valor_repasse, tipo_calculo, valor_configurado)
  select l.clinica_id, l.medico_id, l.id, date_trunc('month', p_competencia)::date,
         coalesce(l.valor_pago, l.valor),
         case when m.tipo_repasse = 'percentual' then m.percentual_repasse else 0 end,
         case when m.tipo_repasse = 'fixo' then m.valor_repasse_fixo
              else round(coalesce(l.valor_pago, l.valor) * m.percentual_repasse / 100, 2) end,
         m.tipo_repasse,
         case when m.tipo_repasse = 'fixo' then m.valor_repasse_fixo else m.percentual_repasse end
    from fontes l
    join public.medicos m on m.id = l.medico_id and m.clinica_id = l.clinica_id
   where ((m.tipo_repasse = 'percentual' and m.percentual_repasse > 0)
       or (m.tipo_repasse = 'fixo' and m.valor_repasse_fixo > 0 and l.ordem_atendimento = 1))
  on conflict (lancamento_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.gerar_repasses_medicos(date) from public, anon;
grant execute on function public.gerar_repasses_medicos(date) to authenticated;

comment on column public.medicos.tipo_repasse is 'Regra do repasse: percentual da receita ou valor fixo por atendimento recebido.';
