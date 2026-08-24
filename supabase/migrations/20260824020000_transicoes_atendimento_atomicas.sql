-- Check-in e inicio de atendimento deixam de depender de duas escritas do
-- navegador. Cada RPC executa sob uma unica transacao e respeita o RLS.
create or replace function public.realizar_checkin(p_agendamento_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_agendamento public.agendamentos%rowtype;
  v_fila public.fila_atendimento%rowtype;
  v_posicao integer;
begin
  select * into v_agendamento
    from public.agendamentos
   where id = p_agendamento_id
   for update;
  if not found then
    raise exception 'Agendamento nao encontrado nesta clinica.' using errcode = 'no_data_found';
  end if;
  if v_agendamento.status::text in ('cancelado','faltou','finalizado','atendimento_finalizado') then
    raise exception 'O agendamento esta % e nao aceita check-in.', v_agendamento.status;
  end if;

  select * into v_fila
    from public.fila_atendimento
   where agendamento_id = p_agendamento_id and status <> 'finalizado'
   order by created_at desc limit 1
   for update;
  if found then
    return jsonb_build_object(
      'repetido', true, 'fila_id', v_fila.id,
      'status_agendamento', v_agendamento.status::text
    );
  end if;

  select coalesce(max(posicao), 0) + 1 into v_posicao
    from public.fila_atendimento
   where clinica_id = v_agendamento.clinica_id and status <> 'finalizado';

  insert into public.fila_atendimento(
    agendamento_id, posicao, status, prioridade, horario_chegada, clinica_id
  ) values (
    v_agendamento.id, v_posicao, 'aguardando', 'normal', now(), v_agendamento.clinica_id
  ) returning * into v_fila;

  update public.agendamentos set status = 'aguardando'
   where id = v_agendamento.id;

  return jsonb_build_object(
    'repetido', false, 'fila_id', v_fila.id,
    'status_agendamento', 'aguardando'
  );
end;
$$;

create or replace function public.iniciar_atendimento_atomico(
  p_agendamento_id uuid, p_fila_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_agendamento public.agendamentos%rowtype;
  v_fila public.fila_atendimento%rowtype;
begin
  select * into v_agendamento
    from public.agendamentos
   where id = p_agendamento_id
   for update;
  if not found then
    raise exception 'Agendamento nao encontrado nesta clinica.' using errcode = 'no_data_found';
  end if;

  select * into v_fila
    from public.fila_atendimento
   where id = p_fila_id and agendamento_id = p_agendamento_id
   for update;
  if not found then
    raise exception 'Item da fila nao pertence ao agendamento.' using errcode = 'check_violation';
  end if;
  if v_agendamento.status::text = 'em_atendimento' and v_fila.status = 'em_atendimento' then
    return jsonb_build_object('repetido', true, 'status', 'em_atendimento');
  end if;
  if v_fila.status not in ('aguardando','chamado','em_atendimento') then
    raise exception 'O item da fila esta % e nao pode iniciar atendimento.', v_fila.status;
  end if;

  -- Os triggers existentes validam pagamento e triagem nesta atualizacao.
  -- Se qualquer validacao falhar, a fila permanece exatamente como estava.
  update public.agendamentos set status = 'em_atendimento'
   where id = v_agendamento.id;
  update public.fila_atendimento set status = 'em_atendimento'
   where id = v_fila.id;

  return jsonb_build_object('repetido', false, 'status', 'em_atendimento');
end;
$$;

revoke all on function public.realizar_checkin(uuid) from public, anon;
revoke all on function public.iniciar_atendimento_atomico(uuid, uuid) from public, anon;
grant execute on function public.realizar_checkin(uuid) to authenticated;
grant execute on function public.iniciar_atendimento_atomico(uuid, uuid) to authenticated;

comment on function public.realizar_checkin(uuid) is
  'Cria fila e muda agendamento atomicamente, com lock e idempotencia.';
comment on function public.iniciar_atendimento_atomico(uuid, uuid) is
  'Inicia fila e agendamento atomicamente, preservando travas de pagamento e triagem.';
