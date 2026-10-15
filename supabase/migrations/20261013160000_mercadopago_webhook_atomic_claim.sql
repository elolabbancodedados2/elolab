-- Atomic webhook ownership for Mercado Pago notifications.
-- Additive only: existing audit fields and event IDs remain intact.
alter table public.mercadopago_webhook_logs
  add column if not exists claim_token uuid,
  add column if not exists lease_until timestamptz;

create index if not exists idx_mp_webhook_logs_active_lease
  on public.mercadopago_webhook_logs (lease_until)
  where processado = false and lease_until is not null;

-- The claim RPC uses ON CONFLICT(event_id); ensure the arbiter exists even on
-- databases whose historical webhook log table predates an event_id index.
create unique index if not exists idx_mp_webhook_logs_event_id_unique
  on public.mercadopago_webhook_logs (event_id)
  where event_id is not null;

create or replace function public.claim_mercadopago_webhook(
  p_event_id text,
  p_event_type text,
  p_data_id text,
  p_payload jsonb,
  p_lease_seconds integer default 300
) returns table (log_id uuid, claim_status text, claim_token uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_log public.mercadopago_webhook_logs%rowtype;
  v_token uuid;
begin
  if p_event_id is null or length(p_event_id) = 0 then
    raise exception 'event_id is required';
  end if;

  insert into public.mercadopago_webhook_logs
    (event_type, event_id, data_id, payload, tentativas)
  values
    (coalesce(nullif(p_event_type, ''), 'unknown'), p_event_id, p_data_id,
     coalesce(p_payload, '{}'::jsonb), 0)
  on conflict (event_id) where event_id is not null do nothing;

  select * into v_log
    from public.mercadopago_webhook_logs
    where event_id = p_event_id
    for update;

  if not found then
    raise exception 'webhook log could not be acquired';
  end if;
  if coalesce(v_log.processado, false) then
    return query select v_log.id, 'processed'::text, null::uuid;
    return;
  end if;
  if v_log.lease_until is not null and v_log.lease_until > now() then
    return query select v_log.id, 'busy'::text, null::uuid;
    return;
  end if;

  v_token := gen_random_uuid();
  update public.mercadopago_webhook_logs
    set claim_token = v_token,
        lease_until = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 300), 900))),
        tentativas = coalesce(tentativas, 0) + 1,
        event_type = coalesce(nullif(p_event_type, ''), event_type),
        data_id = coalesce(p_data_id, data_id),
        payload = coalesce(p_payload, payload),
        erro_mensagem = null
    where id = v_log.id;

  return query select v_log.id, 'claimed'::text, v_token;
end;
$$;

revoke all on function public.claim_mercadopago_webhook(text, text, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.claim_mercadopago_webhook(text, text, text, jsonb, integer) to service_role;
