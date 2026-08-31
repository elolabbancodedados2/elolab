-- "Consulta de retorno" e "Retorno" sao o mesmo tipo de atendimento.
create or replace function public.nome_catalogo_tipo_consulta(p_tipo text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select case
    when trim(regexp_replace(lower(coalesce(p_tipo, '')), '\s+', ' ', 'g'))
      in ('retorno', 'consulta retorno', 'consulta de retorno') then 'Retorno'
    else trim(coalesce(p_tipo, ''))
  end;
$$;

revoke all on function public.nome_catalogo_tipo_consulta(text) from public, anon;
grant execute on function public.nome_catalogo_tipo_consulta(text) to authenticated;

-- Versoes anteriores da tela gravavam o novo horario em agendamento_id, que
-- deveria apontar para a consulta de origem. Recupera ao menos o vinculo do
-- retorno sem apagar o valor antigo, cuja origem nao pode ser inferida com
-- seguranca apenas pelos dados atuais.
update public.retornos r
set agendamento_retorno_id = r.agendamento_id
from public.agendamentos a
where r.agendamento_retorno_id is null
  and r.status = 'agendado'
  and a.id = r.agendamento_id
  and trim(regexp_replace(lower(coalesce(a.tipo, '')), '\s+', ' ', 'g'))
    in ('retorno', 'consulta retorno', 'consulta de retorno');

-- Corrige os registros que ja foram criados com a descricao extensa e impede
-- que novos registros voltem a divergir do nome usado no catalogo.
update public.agendamentos
set tipo = 'retorno'
where trim(regexp_replace(lower(coalesce(tipo, '')), '\s+', ' ', 'g'))
  in ('consulta retorno', 'consulta de retorno');

create or replace function public.canonicalizar_tipo_agendamento()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.nome_catalogo_tipo_consulta(new.tipo) = 'Retorno' then
    new.tipo := 'retorno';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_canonicalizar_tipo_agendamento on public.agendamentos;
create trigger trg_canonicalizar_tipo_agendamento
before insert or update of tipo on public.agendamentos
for each row execute function public.canonicalizar_tipo_agendamento();
