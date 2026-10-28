-- ============================================================================
-- Anonimização LGPD transacional do cadastro do paciente (CLIN-QA-004)
--
-- LOCAL. NÃO APLICAR sem pedido do responsável e sem a avaliação jurídica
-- abaixo.
--
-- O PROBLEMA
-- deletePatientData (src/lib/lgpdCompliance.ts) apagava prontuário,
-- prescrições, exames e anexos tabela por tabela, no cliente e sem transação.
-- Uma falha no meio deixava o paciente pela metade, e apagar prontuário
-- conflita com a guarda legal (Lei 13.787/2018, CFM 1.821/2007). A rotina foi
-- suspensa (EXCLUSAO_LGPD_DESTRUTIVA_HABILITADA = false).
--
-- A CORREÇÃO
-- Uma única função, executada numa transação, que:
--   1. confere sessão, papel de administrador e clínica no servidor;
--   2. trava a linha do paciente (FOR UPDATE) e exige a confirmação do nome
--      atual, para não anonimizar o paciente errado;
--   3. recusa se houver atendimento em andamento ou agendamento futuro;
--   4. remove os dados de identificação e contato do cadastro, sem apagar o
--      registro e sem tocar em prontuário, prescrição, exame, laudo, anexo ou
--      financeiro (guarda legal e fiscal);
--   5. retira os mesmos dados das cópias conhecidas: guias externas, títulos
--      de tarefas e valores antigos gravados na trilha de auditoria;
--   6. desativa o acesso ao portal, remove a lista de espera e desvincula
--      conversas de WhatsApp;
--   7. grava o registro em lgpd_deletion_log na mesma transação.
-- Se qualquer passo falhar, nada é gravado.
--
-- O QUE CONTINUA (deliberado)
-- - Prontuário, prescrições, exames, resultados, anexos, atestados,
--   encaminhamentos, triagens: guarda legal de 20 anos. O texto livre desses
--   registros pode conter o nome do paciente e não é alterado.
-- - Sexo, tipo sanguíneo, alergias, gestante, amamentando e convênio:
--   dados clínicos/assistenciais vinculados ao prontuário retido.
-- - lancamentos e pagamentos_mercadopago: não são alterados (regra do time).
-- - Mensagens de WhatsApp e o número em remote_jid: ficam para tratamento
--   manual, informado em `pendencias` no retorno.
-- - Arquivo da foto no Storage: a função limpa foto_url e devolve o caminho
--   antigo em `pendencias.foto_url`, para o cliente remover o objeto.
--
-- REQUER AVALIAÇÃO ESPECIALIZADA (jurídica/DPO)
-- - Se reter o prontuário vinculado a um cadastro anonimizado atende ao
--   art. 16 da LGPD e à Lei 13.787/2018 no caso concreto.
-- - Se redigir valores antigos em audit_log é aceitável frente à exigência
--   de trilha (CFM 1.821/2007). As linhas de auditoria continuam existindo,
--   com quem, quando e quais campos; só os valores pessoais são substituídos.
-- Isto não é declaração de conformidade.
--
-- REVERSÃO (antes de qualquer uso; dado anonimizado não volta)
--   DROP FUNCTION IF EXISTS public.lgpd_anonimizar_paciente(uuid, uuid, text, text);
--   ALTER TABLE public.lgpd_deletion_log DROP COLUMN IF EXISTS detalhes,
--     DROP COLUMN IF EXISTS operacao;
--   ALTER TABLE public.pacientes DROP COLUMN IF EXISTS anonimizado_por,
--     DROP COLUMN IF EXISTS anonimizado_em;
-- ============================================================================

BEGIN;

-- ─── Marcação no cadastro ───────────────────────────────────────────────────
-- Torna a operação idempotente e permite à interface mostrar o estado.
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS anonimizado_em timestamptz,
  ADD COLUMN IF NOT EXISTS anonimizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pacientes_anonimizado_por
  ON public.pacientes (anonimizado_por)
  WHERE anonimizado_por IS NOT NULL;

COMMENT ON COLUMN public.pacientes.anonimizado_em IS
  'Momento da anonimização LGPD (lgpd_anonimizar_paciente). Não nulo: o cadastro não identifica mais a pessoa.';

-- ─── Tipo de operação no log ────────────────────────────────────────────────
ALTER TABLE public.lgpd_deletion_log
  ADD COLUMN IF NOT EXISTS operacao text NOT NULL DEFAULT 'exclusao',
  ADD COLUMN IF NOT EXISTS detalhes jsonb;

ALTER TABLE public.lgpd_deletion_log
  DROP CONSTRAINT IF EXISTS lgpd_deletion_log_operacao_check;
ALTER TABLE public.lgpd_deletion_log
  ADD CONSTRAINT lgpd_deletion_log_operacao_check
  CHECK (operacao IN ('exclusao', 'anonimizacao'));

-- ─── Função ─────────────────────────────────────────────────────────────────
-- Códigos de erro estáveis vão em HINT; src/lib/lgpdAnonimizacao.ts traduz.
CREATE OR REPLACE FUNCTION public.lgpd_anonimizar_paciente(
  p_paciente_id uuid,
  p_clinica_id  uuid,
  p_motivo      text,
  p_confirmacao text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user        uuid := auth.uid();
  v_motivo      text := btrim(COALESCE(p_motivo, ''));
  v_pac         public.pacientes%rowtype;
  v_rotulo      text;
  v_hoje        date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_log_id      uuid;
  v_ativos      integer;
  v_tokens      integer;
  v_lista       integer;
  v_guias       integer;
  v_tarefas     integer;
  v_whatsapp    integer;
  v_auditoria   integer;
  v_campos_pii  text[] := ARRAY[
    'nome', 'nome_social', 'cpf', 'cpf_digitos', 'telefone', 'telefone_digitos',
    'email', 'data_nascimento', 'cep', 'logradouro', 'numero', 'complemento',
    'bairro', 'cidade', 'estado', 'foto_url', 'nome_responsavel',
    'cpf_responsavel', 'parentesco_responsavel', 'profissao', 'estado_civil',
    'observacoes', 'numero_carteira', 'validade_carteira'
  ];
BEGIN
  -- 1. Sessão, papel e clínica, sempre no servidor.
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.'
      USING ERRCODE = '42501', HINT = 'LGPD_SEM_SESSAO';
  END IF;

  IF p_paciente_id IS NULL OR p_clinica_id IS NULL THEN
    RAISE EXCEPTION 'Paciente e clínica são obrigatórios.'
      USING ERRCODE = '22023', HINT = 'LGPD_PARAMETRO_INVALIDO';
  END IF;

  IF NOT public.is_admin(v_user) OR NOT public.is_same_clinica(p_clinica_id) THEN
    RAISE EXCEPTION 'Sem permissão para anonimizar pacientes desta clínica.'
      USING ERRCODE = '42501', HINT = 'LGPD_SEM_PERMISSAO';
  END IF;

  IF char_length(v_motivo) < 10 OR char_length(v_motivo) > 2000 THEN
    RAISE EXCEPTION 'Motivo deve ter entre 10 e 2000 caracteres.'
      USING ERRCODE = '22023', HINT = 'LGPD_MOTIVO_INVALIDO';
  END IF;

  -- 2. Paciente da própria clínica, travado até o fim da transação. Paciente
  --    de outra clínica recebe a mesma resposta de inexistente.
  SELECT * INTO v_pac
    FROM public.pacientes
   WHERE id = p_paciente_id
     AND clinica_id = p_clinica_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente não encontrado.'
      USING ERRCODE = 'P0002', HINT = 'LGPD_PACIENTE_NAO_ENCONTRADO';
  END IF;

  -- Idempotente: segunda chamada não altera nada nem duplica o log.
  IF v_pac.anonimizado_em IS NOT NULL THEN
    RETURN jsonb_build_object(
      'anonimizado', false,
      'ja_anonimizado', true,
      'anonimizado_em', v_pac.anonimizado_em
    );
  END IF;

  IF lower(btrim(COALESCE(p_confirmacao, ''))) IS DISTINCT FROM lower(btrim(v_pac.nome)) THEN
    RAISE EXCEPTION 'A confirmação não corresponde ao nome do paciente.'
      USING ERRCODE = '22023', HINT = 'LGPD_CONFIRMACAO_NAO_CONFERE';
  END IF;

  -- 3. Nada em andamento: atendimento aberto ou agendamento de hoje em diante.
  SELECT count(*) INTO v_ativos
    FROM public.agendamentos a
   WHERE a.paciente_id = p_paciente_id
     AND a.clinica_id = p_clinica_id
     AND COALESCE(a.status::text, 'agendado') NOT IN ('finalizado', 'atendimento_finalizado', 'cancelado', 'faltou')
     AND NOT (COALESCE(a.status::text, 'agendado') IN ('agendado', 'confirmado') AND a.data < v_hoje);

  IF v_ativos > 0 THEN
    RAISE EXCEPTION 'Há % agendamento(s) ou atendimento(s) em aberto para este paciente.', v_ativos
      USING ERRCODE = '55000', HINT = 'LGPD_AGENDAMENTO_ATIVO';
  END IF;

  v_rotulo := 'Paciente anonimizado ' || upper(left(replace(p_paciente_id::text, '-', ''), 8));

  -- 4. Cadastro. O registro fica, para manter o vínculo do prontuário retido.
  UPDATE public.pacientes SET
    nome                   = v_rotulo,
    nome_social            = NULL,
    cpf                    = NULL,
    telefone               = NULL,
    email                  = NULL,
    data_nascimento        = NULL,
    cep                    = NULL,
    logradouro             = NULL,
    numero                 = NULL,
    complemento            = NULL,
    bairro                 = NULL,
    cidade                 = NULL,
    estado                 = NULL,
    foto_url               = NULL,
    nome_responsavel       = NULL,
    cpf_responsavel        = NULL,
    parentesco_responsavel = NULL,
    profissao              = NULL,
    estado_civil           = NULL,
    observacoes            = NULL,
    numero_carteira        = NULL,
    validade_carteira      = NULL,
    anonimizado_em         = now(),
    anonimizado_por        = v_user
  WHERE id = p_paciente_id;

  -- 5a. Guias externas guardam cópia dos dados pessoais.
  UPDATE public.guias_externas SET
    paciente_nome       = v_rotulo,
    paciente_cpf        = NULL,
    paciente_nascimento = NULL,
    paciente_telefone   = NULL,
    paciente_email      = NULL
  WHERE paciente_id = p_paciente_id
    AND clinica_id = p_clinica_id;
  GET DIAGNOSTICS v_guias = ROW_COUNT;

  -- 5b. Títulos e descrições de tarefas costumam citar o nome.
  v_tarefas := 0;
  IF char_length(btrim(v_pac.nome)) >= 3 THEN
    UPDATE public.tarefas SET
      titulo    = replace(titulo, v_pac.nome, v_rotulo),
      descricao = replace(descricao, v_pac.nome, v_rotulo)
    WHERE paciente_id = p_paciente_id
      AND clinica_id = p_clinica_id
      AND (strpos(titulo, v_pac.nome) > 0 OR strpos(COALESCE(descricao, ''), v_pac.nome) > 0);
    GET DIAGNOSTICS v_tarefas = ROW_COUNT;
  END IF;

  -- 6. Acessos e vínculos operacionais.
  UPDATE public.paciente_portal_tokens
     SET ativo = false,
         expires_at = LEAST(COALESCE(expires_at, now()), now())
   WHERE paciente_id = p_paciente_id
     AND COALESCE(ativo, true);
  GET DIAGNOSTICS v_tokens = ROW_COUNT;

  DELETE FROM public.lista_espera
   WHERE paciente_id = p_paciente_id
     AND clinica_id = p_clinica_id;
  GET DIAGNOSTICS v_lista = ROW_COUNT;

  UPDATE public.whatsapp_conversations
     SET paciente_id = NULL
   WHERE paciente_id = p_paciente_id
     AND clinica_id = p_clinica_id;
  GET DIAGNOSTICS v_whatsapp = ROW_COUNT;

  -- 5c. Trilha de auditoria do cadastro: as linhas ficam (quem, quando, quais
  --     campos); os valores pessoais são substituídos. Inclui a linha que o
  --     trg_audit acabou de gravar com os valores "de" deste UPDATE.
  UPDATE public.audit_log l SET
    record_name = v_rotulo,
    changes = CASE
      WHEN l.changes IS NULL OR jsonb_typeof(l.changes) <> 'object' THEN l.changes
      ELSE COALESCE((
        SELECT jsonb_object_agg(
                 k,
                 CASE
                   WHEN k = ANY (v_campos_pii) THEN to_jsonb('[anonimizado]'::text)
                   WHEN k = 'alteracoes' AND jsonb_typeof(v) = 'object' THEN COALESCE((
                     SELECT jsonb_object_agg(
                              k2,
                              CASE WHEN k2 = ANY (v_campos_pii) THEN to_jsonb('[anonimizado]'::text) ELSE v2 END)
                       FROM jsonb_each(v) AS t2(k2, v2)
                   ), '{}'::jsonb)
                   ELSE v
                 END)
          FROM jsonb_each(l.changes) AS t(k, v)
      ), '{}'::jsonb)
    END
  WHERE l.collection = 'pacientes'
    AND l.record_id = p_paciente_id;
  GET DIAGNOSTICS v_auditoria = ROW_COUNT;

  -- 7. Registro da operação, na mesma transação.
  INSERT INTO public.lgpd_deletion_log (
    paciente_id, clinica_id, reason, deleted_by, operacao, detalhes
  ) VALUES (
    p_paciente_id, p_clinica_id, v_motivo, v_user, 'anonimizacao',
    jsonb_build_object(
      'guias_externas', v_guias,
      'tarefas', v_tarefas,
      'portal_tokens', v_tokens,
      'lista_espera', v_lista,
      'whatsapp_conversas', v_whatsapp,
      'auditoria', v_auditoria
    )
  )
  RETURNING id INTO v_log_id;

  RETURN jsonb_build_object(
    'anonimizado', true,
    'ja_anonimizado', false,
    'log_id', v_log_id,
    'rotulo', v_rotulo,
    'contagens', jsonb_build_object(
      'guias_externas', v_guias,
      'tarefas', v_tarefas,
      'portal_tokens', v_tokens,
      'lista_espera', v_lista,
      'whatsapp_conversas', v_whatsapp,
      'auditoria', v_auditoria
    ),
    'pendencias', jsonb_build_object(
      'foto_url', v_pac.foto_url,
      'whatsapp_conversas', v_whatsapp
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lgpd_anonimizar_paciente(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lgpd_anonimizar_paciente(uuid, uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.lgpd_anonimizar_paciente(uuid, uuid, text, text) IS
  'Anonimiza o cadastro do paciente numa transação (LGPD art. 18). Só administrador da clínica. Preserva prontuário e financeiro. Requer avaliação jurídica antes do uso.';

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO (somente leitura)
-- ============================================================================
-- SELECT has_function_privilege('anon',
--   'public.lgpd_anonimizar_paciente(uuid, uuid, text, text)', 'EXECUTE');  -- false
-- SELECT prosecdef, proconfig FROM pg_proc
--  WHERE proname = 'lgpd_anonimizar_paciente';  -- true, {search_path=public, pg_temp}
