-- Executar SOMENTE em banco descartável com o schema migrado e um admin de teste.
-- Não executado pelo agente. Não contém/aplica migrations. Tudo termina em ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'elolab_portal_test_%' THEN
    RAISE EXCEPTION 'Use um banco descartável elolab_portal_test_*; nunca produção.';
  END IF;
END $$;
SET LOCAL statement_timeout = '30s';
CREATE TEMP TABLE portal_qa_ids (clinica uuid, outra_clinica uuid, paciente uuid, medico uuid, token uuid, admin_id uuid);

DO $$
DECLARE
  c uuid; other_c uuid; p uuid; m uuid; t uuid; admin_id uuid; old_expiry timestamptz;
  link text; r jsonb; n integer; before_count integer; booking_id uuid; exam_id uuid;
  test_day date := (now() AT TIME ZONE 'America/Sao_Paulo')::date + 2;
  cadastro jsonb; stored_birth date := '1990-01-02';
BEGIN
  SELECT pr.id, pr.clinica_id INTO admin_id, c FROM public.profiles pr
   WHERE pr.clinica_id IS NOT NULL AND public.is_admin(pr.id) LIMIT 1;
  IF admin_id IS NULL THEN RAISE EXCEPTION 'Prepare um admin com clínica no banco descartável antes deste teste.'; END IF;
  PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  INSERT INTO public.clinicas(nome) VALUES ('Clínica isolada QA Portal') RETURNING id INTO other_c;
  INSERT INTO public.medicos(clinica_id, crm, nome, ativo) VALUES (c, 'PORTAL-QA-' || left(gen_random_uuid()::text,8), 'Médico QA Portal', true) RETURNING id INTO m;
  INSERT INTO public.pacientes(clinica_id, nome, telefone, email, data_nascimento)
    VALUES (c, 'Paciente QA Portal', '11999990000', NULL, stored_birth) RETURNING id INTO p;

  -- 1/2/8: três laudos não criam nem revogam tokens; prazo antigo permanece.
  link := public.link_portal_paciente(p);
  ASSERT position('#token=' IN link) > 0 AND position('?token=' IN link) = 0, 'Link novo deve usar fragmento';
  SELECT id INTO t FROM public.paciente_portal_tokens WHERE paciente_id = p AND ativo;
  ASSERT (SELECT expires_at <= now() + interval '90 days' FROM public.paciente_portal_tokens WHERE id=t), 'Prazo novo deve ser 90 dias';
  UPDATE public.paciente_portal_tokens SET expires_at = now() + interval '1 year' WHERE id=t;
  SELECT expires_at INTO old_expiry FROM public.paciente_portal_tokens WHERE id=t;
  SELECT count(*) INTO before_count FROM public.paciente_portal_tokens WHERE paciente_id=p;
  FOR n IN 1..3 LOOP
    INSERT INTO public.exames(clinica_id, paciente_id, medico_solicitante_id, tipo_exame, resultado, status)
    VALUES (c, p, m, 'Exame QA Portal ' || n, 'Resultado sintético', 'solicitado') RETURNING id INTO exam_id;
    UPDATE public.exames SET status='laudo_disponivel' WHERE id=exam_id;
  END LOOP;
  ASSERT (SELECT count(*) FROM public.paciente_portal_tokens WHERE paciente_id=p)=before_count, 'Laudo não deve emitir token';
  ASSERT (SELECT ativo AND expires_at=old_expiry FROM public.paciente_portal_tokens WHERE id=t), 'Laudo preserva acesso existente';
  -- Opção sem token: zero tokens novos de trigger, portanto no máximo um e nenhum acima de sete dias.
  ASSERT NOT EXISTS (SELECT 1 FROM public.paciente_portal_tokens WHERE paciente_id=p AND id<>t AND ativo), 'Nenhum token ativo de trigger';
  ASSERT NOT EXISTS (SELECT 1 FROM public.paciente_portal_tokens WHERE paciente_id=p AND id<>t AND ativo AND expires_at>now()+interval '7 days'), 'Trigger não pode criar prazo maior que sete dias';

  -- 8: contagem e bloqueio são atômicos no banco, não no navegador.
  FOR n IN 1..4 LOOP
    r := public.confirmar_nascimento_portal(t, '1900-01-01');
    ASSERT r->>'code'='birth_date_invalid', 'Erros 1 a 4 ainda permitem tentar';
  END LOOP;
  r := public.confirmar_nascimento_portal(t, '1900-01-01');
  ASSERT r->>'code'='device_locked', 'Quinto erro bloqueia';
  ASSERT (SELECT tentativas=5 AND bloqueado_ate=now()+interval '15 minutes' FROM public.portal_token_seguranca WHERE token_id=t), 'Bloqueio deve durar 15 minutos';
  ASSERT public.confirmar_nascimento_portal(t, stored_birth::text)->>'code'='device_locked', 'Acerto durante bloqueio não libera';
  UPDATE public.portal_token_seguranca SET bloqueado_ate=now()-interval '1 second' WHERE token_id=t;
  ASSERT public.confirmar_nascimento_portal(t, stored_birth::text)->>'success'='true', 'Após prazo, acerto libera';
  ASSERT (SELECT tentativas=0 AND bloqueado_ate IS NULL FROM public.portal_token_seguranca WHERE token_id=t), 'Acerto limpa tentativas';

  -- 6: CPF não usado no banco descartável; reserva expirada não deixa ficha nem aceite.
  cadastro := jsonb_build_object('nome', 'Cadastro Atômico QA', 'cpf', '52998224725', 'telefone', '11988887777',
    'email', '', 'data_nascimento', '1990-01-02', 'aceite_lgpd', true, 'versao_termo', 'agendamento-online-2026-11-02', 'ip_aceite', '127.0.0.1');
  ASSERT NOT EXISTS (SELECT 1 FROM public.pacientes WHERE clinica_id=c AND regexp_replace(cpf,'[^0-9]','','g')=cadastro->>'cpf'), 'CPF sintético precisa estar livre';
  r := public.solicitar_agendamento_online_atomico(c,m,test_day,'10:00',30,repeat('a',64),cadastro);
  ASSERT r->>'success'='false', 'Sem hold não agenda';
  ASSERT NOT EXISTS (SELECT 1 FROM public.pacientes WHERE clinica_id=c AND regexp_replace(cpf,'[^0-9]','','g')=cadastro->>'cpf'), 'Falha não deixa ficha órfã';
  INSERT INTO public.public_booking_holds(clinica_id,medico_id,data,hora_inicio,hora_fim,token_hash,expires_at)
    VALUES(c,m,test_day,'10:00','10:30',repeat('a',64),now()+interval '5 minutes');
  r := public.solicitar_agendamento_online_atomico(c,m,test_day,'10:00',30,repeat('a',64),cadastro);
  ASSERT r->>'success'='true', 'Pedido válido cria ficha, aceite e consulta';
  SELECT id INTO booking_id FROM public.pacientes WHERE clinica_id=c AND regexp_replace(cpf,'[^0-9]','','g')=cadastro->>'cpf';
  ASSERT (SELECT count(*)=1 FROM public.consentimentos_lgpd WHERE paciente_id=booking_id AND tipo_consentimento='agendamento_online'), 'Aceite atômico';
  INSERT INTO public.public_booking_holds(clinica_id,medico_id,data,hora_inicio,hora_fim,token_hash,expires_at)
    VALUES(c,m,test_day,'11:00','11:30',repeat('b',64),now()+interval '5 minutes');
  r := public.solicitar_agendamento_online_atomico(c,m,test_day,'11:00',30,repeat('b',64),cadastro || '{"telefone":"11977776666"}'::jsonb);
  ASSERT r->>'success'='true', 'Resposta pública não revela CPF existente';
  ASSERT (SELECT count(*)=1 FROM public.consentimentos_lgpd WHERE paciente_id=booking_id AND tipo_consentimento='agendamento_online'), 'Telefone diferente não atribui aceite';
  ASSERT EXISTS (SELECT 1 FROM public.agendamentos WHERE paciente_id=booking_id AND identidade_pendente AND observacoes LIKE '%Confirmar identidade%'), 'Recepção vê confirmação de identidade';
  r := public.solicitar_agendamento_online_atomico(c,m,test_day,'12:00',30,repeat('c',64),cadastro);
  ASSERT r->>'code'='booking_unavailable', 'Pendentes são conferidos antes de qualquer aceite';
  ASSERT (SELECT count(*)=1 FROM public.consentimentos_lgpd WHERE paciente_id=booking_id AND tipo_consentimento='agendamento_online'), 'Recusa não grava aceite';

  -- 14: sinalização não cria fila e não muda status; valida dono, clínica e estado.
  INSERT INTO public.agendamentos(clinica_id,paciente_id,medico_id,data,hora_inicio,hora_fim,status,tipo)
    VALUES(c,p,m,(now() AT TIME ZONE 'America/Sao_Paulo')::date,
      (now() AT TIME ZONE 'America/Sao_Paulo')::time, NULL, 'confirmado','consulta') RETURNING id INTO booking_id;
  ASSERT public.sinalizar_chegada_portal(other_c,p,booking_id,'chegou')->>'success'='false', 'Outra clínica recusada';
  ASSERT public.sinalizar_chegada_portal(c,gen_random_uuid(),booking_id,'chegou')->>'success'='false', 'Outro paciente recusado';
  ASSERT public.sinalizar_chegada_portal(c,p,booking_id,'a_caminho')->>'success'='true', 'Aviso a caminho';
  ASSERT public.sinalizar_chegada_portal(c,p,booking_id,'chegou')->>'success'='true', 'Aviso chegou';
  ASSERT public.sinalizar_chegada_portal(c,p,booking_id,'a_caminho')->>'portal_checkin_status'='chegou', 'Não regride chegada';
  ASSERT (SELECT status='confirmado' FROM public.agendamentos WHERE id=booking_id), 'Status definitivo preservado';
  ASSERT NOT EXISTS (SELECT 1 FROM public.fila_atendimento WHERE agendamento_id=booking_id), 'Não insere fila';
  UPDATE public.agendamentos SET data=data+1 WHERE id=booking_id;
  ASSERT (SELECT portal_checkin_status IS NULL AND portal_checkin_em IS NULL FROM public.agendamentos WHERE id=booking_id), 'Remarcação limpa chegada anterior';
  UPDATE public.agendamentos SET status='cancelado' WHERE id=booking_id;
  ASSERT public.sinalizar_chegada_portal(c,p,booking_id,'chegou')->>'success'='false', 'Consulta cancelada recusada';

  INSERT INTO public.portal_acessos(clinica_id,token_id,acao,ip) VALUES(c,t,'get_profile','127.0.0.1');
  INSERT INTO public.portal_acessos(clinica_id,acao,ip) VALUES(other_c,'get_profile','127.0.0.1');
  INSERT INTO portal_qa_ids VALUES(c,other_c,p,m,t,admin_id);
END $$;

-- 7: leitura real sob RLS, isolada por clínica; escrita/estado de segurança só service_role.
GRANT SELECT ON portal_qa_ids TO authenticated;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT EXISTS (SELECT 1 FROM public.portal_acessos WHERE token_id=(SELECT token FROM portal_qa_ids)), 'Admin lê sua clínica';
  ASSERT NOT EXISTS (SELECT 1 FROM public.portal_acessos WHERE clinica_id=(SELECT outra_clinica FROM portal_qa_ids)), 'Admin não lê outra clínica';
  ASSERT NOT has_table_privilege('authenticated','public.portal_acessos','INSERT'), 'Cliente não fabrica auditoria';
  ASSERT NOT has_table_privilege('authenticated','public.portal_token_seguranca','SELECT'), 'Cliente não lê contador';
  ASSERT NOT has_function_privilege('authenticated','public.confirmar_nascimento_portal(uuid,text)','EXECUTE'), 'Cliente não chama verificação diretamente';
  ASSERT NOT has_function_privilege('anon','public.sinalizar_chegada_portal(uuid,uuid,uuid,text)','EXECUTE'), 'Anônimo não sinaliza chegada';
END $$;
RESET ROLE;
ROLLBACK;
