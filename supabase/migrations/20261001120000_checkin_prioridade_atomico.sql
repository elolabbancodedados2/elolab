-- The queue screen used two independent writes to check in a patient. Keep
-- appointment status, queue insertion, and the requested priority in one DB
-- transaction. The default preserves callers that only send the appointment.
drop function if exists public.realizar_checkin(uuid);

create function public.realizar_checkin(
  p_agendamento_id uuid,
  p_prioridade text default 'normal'
)
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
  if p_prioridade is null or p_prioridade not in ('normal', 'preferencial', 'urgente') then
    raise exception 'Prioridade de fila invalida.' using errcode = 'check_violation';
  end if;

  select * into v_agendamento
    from public.agendamentos
   where id = p_agendamento_id
   for update;
  if not found then
    raise exception 'Agendamento nao encontrado nesta clinica.' using errcode = 'no_data_found';
  end if;
  if v_agendamento.status::text in ('cancelado', 'faltou', 'finalizado', 'atendimento_finalizado') then
    raise exception 'O agendamento esta % e nao aceita check-in.', v_agendamento.status;
  end if;

  select * into v_fila
    from public.fila_atendimento
   where agendamento_id = p_agendamento_id and status <> 'finalizado'
   order by created_at desc
   limit 1
   for update;
  if found then
    return jsonb_build_object(
      'repetido', true,
      'fila_id', v_fila.id,
      'status_agendamento', v_agendamento.status::text
    );
  end if;

  select coalesce(max(posicao), 0) + 1 into v_posicao
    from public.fila_atendimento
   where clinica_id = v_agendamento.clinica_id and status <> 'finalizado';

  insert into public.fila_atendimento(
    agendamento_id, posicao, status, prioridade, horario_chegada, clinica_id
  ) values (
    v_agendamento.id, v_posicao, 'aguardando', p_prioridade, now(), v_agendamento.clinica_id
  ) returning * into v_fila;

  update public.agendamentos
     set status = 'aguardando'
   where id = v_agendamento.id;

  return jsonb_build_object(
    'repetido', false,
    'fila_id', v_fila.id,
    'status_agendamento', 'aguardando'
  );
end;
$$;

revoke all on function public.realizar_checkin(uuid, text) from public, anon;
grant execute on function public.realizar_checkin(uuid, text) to authenticated;

comment on function public.realizar_checkin(uuid, text) is
  'Cria fila e muda agendamento atomicamente, com lock, prioridade validada e idempotencia.';
