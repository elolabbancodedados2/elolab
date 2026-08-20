-- Repara divergencias entre funcoes operacionais e o schema efetivamente remoto.
alter table public.mercadopago_webhook_logs
  add column if not exists tentativas integer not null default 0;

alter table public.profiles
  add column if not exists mfa_enabled boolean not null default false;

alter table public.clinicas
  add column if not exists ativo boolean generated always as (not coalesce(arquivada, false)) stored;

create or replace function public.assinar_prontuario_verificavel(p_prontuario_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_prontuario public.prontuarios%rowtype;
  v_medico public.medicos%rowtype;
  v_hash text;
  v_assinatura public.prontuario_assinaturas%rowtype;
  v_agora timestamptz := clock_timestamp();
begin
  if auth.uid() is null then raise exception 'Autenticacao obrigatoria'; end if;

  select * into v_prontuario from public.prontuarios
   where id = p_prontuario_id for update;
  if not found or not public.is_same_clinica(v_prontuario.clinica_id) then
    raise exception 'Prontuario nao encontrado';
  end if;
  if v_prontuario.assinado then raise exception 'Prontuario ja assinado'; end if;

  select * into v_medico from public.medicos
   where user_id = auth.uid() and clinica_id = v_prontuario.clinica_id and ativo is not false
   order by created_at desc limit 1;
  if not found or coalesce(trim(v_medico.crm), '') = '' then
    raise exception 'Somente medico ativo com CRM pode assinar o prontuario';
  end if;

  v_hash := public.prontuario_conteudo_hash(p_prontuario_id);
  if v_hash is null then raise exception 'Nao foi possivel calcular a integridade do prontuario'; end if;

  perform set_config('app.signing_prontuario', 'allowed', true);
  update public.prontuarios set
    assinado = true,
    assinado_em = v_agora,
    assinado_por = auth.uid(),
    crm_assinante = v_medico.crm,
    hash_conteudo = v_hash,
    tipo_assinatura = 'eletronica_simples'
  where id = p_prontuario_id;

  insert into public.prontuario_assinaturas (
    prontuario_id, clinica_id, assinado_por_user_id, medico_id,
    assinante_nome, assinante_crm, conteudo_hash, assinado_em
  ) values (
    p_prontuario_id, v_prontuario.clinica_id, auth.uid(), v_medico.id,
    coalesce(v_medico.nome, 'Medico'), v_medico.crm, v_hash, v_agora
  ) returning * into v_assinatura;

  insert into public.prontuario_acessos (
    prontuario_id, paciente_id, clinica_id, user_id, user_nome, user_crm,
    acao, justificativa
  ) values (
    p_prontuario_id, v_prontuario.paciente_id, v_prontuario.clinica_id,
    auth.uid(), v_assinatura.assinante_nome, v_assinatura.assinante_crm,
    'assinatura', 'Assinatura eletronica verificavel - hash ' || left(v_hash, 16)
  );

  return jsonb_build_object(
    'signedAt', v_assinatura.assinado_em,
    'signerName', v_assinatura.assinante_nome,
    'signerCRM', v_assinatura.assinante_crm,
    'hash', v_assinatura.conteudo_hash,
    'method', v_assinatura.metodo,
    'verificationCode', v_assinatura.codigo_verificacao
  );
end;
$$;

revoke all on function public.assinar_prontuario_verificavel(uuid) from public, anon;
grant execute on function public.assinar_prontuario_verificavel(uuid) to authenticated;
