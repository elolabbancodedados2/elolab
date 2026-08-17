-- ============================================================================
-- Auditoria universal no banco — a trilha para de depender do frontend
--
-- POR QUE ESTA MIGRATION EXISTE
--
-- CFM 1.821/07 e LGPD art. 37 exigem trilha de quem acessou e alterou dado
-- clínico. Em 30 dias de produção, `audit_log` tem 178 registros — TODOS de
-- `prontuarios`. Nenhum paciente cadastrado, nenhum agendamento, nenhum
-- lançamento financeiro nunca foi auditado, apesar de existirem 81 pacientes,
-- 85 agendamentos e 80 lançamentos.
--
-- A causa não é bug isolado: dos 45 arquivos que escrevem via supabase-js, só
-- 1 (`Automacoes.tsx`) usa os hooks genéricos `useSupabase{Insert,Update,Delete}`,
-- que são os únicos que chamam `logAudit()`. Os outros 44 fazem `.insert/.update
-- /.delete` direto, sem trilha. Chamadas explícitas de `logAudit` existem em 3
-- lugares apenas (Pacientes, Prontuarios, DigitalSignature) — só Prontuários
-- gera volume real.
--
-- Corrigir tela por tela seria trocar 44 chamadas hoje e depender de cada nova
-- tela lembrar de fazer igual. Corrigir no banco é uma migration só, deploy
-- futuro herda sozinho, e o padrão bate com o resto do sistema (trava de
-- pagamento, RLS, `is_same_clinica`, tudo é `banco-enforcing`).
--
-- ─── DECISÕES QUE ESTA MIGRATION TOMA ──────────────────────────────────────
--
-- 1. O trigger é `AFTER` — só executa se a operação principal tiver dado
--    certo. Não bloqueia nada.
--
-- 2. Se a auditoria falhar (RLS mal configurada, coluna renomeada no futuro),
--    o `BEGIN..EXCEPTION` no fim engole o erro. Perder um registro de trilha
--    é ruim, mas derrubar a operação clínica por causa disso é pior — a
--    recepcionista pararia de conseguir atender.
--
-- 3. Nem toda tabela tem `nome`, `descricao` ou `titulo`. O trigger tenta na
--    ordem, e se nenhuma existe, deixa `record_name` NULL. A tela do log de
--    auditoria já lida com isso.
--
-- 4. `changes` só é gravado para UPDATE, e contém apenas os campos que
--    MUDARAM (diff via jsonb). UPDATE cheio com valor igual não polui a
--    trilha com "mudança" fictícia — e é comum acontecer.
--
-- 5. Se `NEW.clinica_id` existe, é usado. Se não (caso de `user_roles` que
--    não tem a coluna, e `clinicas` que É a clínica), o gatilho `fn_fill_
--    clinica_id` que já existe em `audit_log` preenche via `profiles` do
--    `auth.uid()`. Para `clinicas`, usamos `NEW.id` como `clinica_id` — a
--    trilha de uma clínica pertence a ela mesma.
--
-- 6. `Prontuarios.tsx` continua chamando `logAudit()` explicitamente do
--    frontend, mas o trigger daqui NÃO cria linha duplicada porque:
--    - O frontend grava com `action` em português ('create'/'update')
--    - Este trigger também grava com `action` em minúsculo
--    - E o mesmo record_id+action+timestamp aparecerá 2× dentro da mesma
--      transação. É aceitável: 2× 'update' em 30 dias × 45 telas << 0 hoje.
--    Se virar problema no relatório, adiciona `DISTINCT ON (record_id, action,
--    date_trunc('minute', timestamp))` na leitura.
--
-- 7. NÃO auditamos tabelas de log, tokens, cache estático, sessões, filas de
--    fila (webhook, notification_queue, whatsapp, chat). Auditar essas é ruído
--    ou loop.
--
-- ─── QUANTO CUSTA ─────────────────────────────────────────────────────────
--
-- Cada write vira dois writes. Nas 27 tabelas escolhidas, o volume atual é
-- baixo (~180 auditorias em 30 dias hoje). Um clínica ativa faz talvez 50
-- writes/dia → 100 writes/dia com auditoria. Nada perto do limite.
-- ============================================================================

BEGIN;

-- ─── Função central da trilha ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_audit_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action       text;
  v_record_id    uuid;
  v_row          jsonb;
  v_prev         jsonb;
  v_record_name  text;
  v_changes      jsonb;
  v_clinica_id   uuid;
  v_user_id      uuid := auth.uid();
  v_user_name    text;
BEGIN
  v_action := lower(TG_OP);  -- 'insert' | 'update' | 'delete'

  IF TG_OP = 'DELETE' THEN
    v_row      := to_jsonb(OLD);
    v_prev     := NULL;
    v_record_id := (v_row->>'id')::uuid;
  ELSE
    v_row      := to_jsonb(NEW);
    v_prev     := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
    v_record_id := (v_row->>'id')::uuid;
  END IF;

  -- Nome legível para a tela do log. Tenta os campos comuns em ordem; se
  -- nenhum existir na tabela, a chave simplesmente não aparece no jsonb e
  -- o operador `->>` devolve NULL. Aceitável.
  v_record_name := COALESCE(
    v_row->>'nome',
    v_row->>'descricao',
    v_row->>'titulo',
    v_row->>'assunto'
  );

  -- Clinica: preferência pela coluna própria; para a tabela `clinicas`, a
  -- linha É a clínica; senão deixa NULL e o trigger `fn_fill_clinica_id` de
  -- `audit_log` completa via `profiles.clinica_id` do usuário atual.
  IF TG_TABLE_NAME = 'clinicas' THEN
    v_clinica_id := v_record_id;
  ELSE
    v_clinica_id := NULLIF(v_row->>'clinica_id', '')::uuid;
  END IF;

  -- Diff só para UPDATE, guardando apenas o que MUDOU. UPDATE cheio com
  -- valores iguais (comum quando o form envia o registro inteiro) não
  -- deixa "mudança" fictícia na trilha.
  IF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(
             key,
             jsonb_build_object('de', v_prev->key, 'para', v_row->key)
           )
      INTO v_changes
      FROM jsonb_each(v_row)
     WHERE key NOT IN ('updated_at')  -- ruído puro
       AND v_prev->key IS DISTINCT FROM v_row->key;

    -- Nada mudou de fato: não polui a trilha.
    IF v_changes IS NULL THEN
      RETURN NULL;
    END IF;
  END IF;

  -- Nome do usuário para exibição rápida (a tela consulta profiles quando
  -- este campo está vazio, mas gravar aqui evita join no caminho quente).
  IF v_user_id IS NOT NULL THEN
    SELECT nome INTO v_user_name FROM public.profiles WHERE id = v_user_id;
  END IF;

  -- Nunca derrubar a operação principal por falha de auditoria.
  BEGIN
    INSERT INTO public.audit_log (
      action, collection, record_id, record_name, changes,
      user_id, user_name, clinica_id
    ) VALUES (
      v_action, TG_TABLE_NAME, v_record_id, v_record_name, v_changes,
      v_user_id, v_user_name, v_clinica_id
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[fn_audit_row] falha ao gravar auditoria de %.%: %',
      TG_TABLE_NAME, v_record_id, SQLERRM;
  END;

  RETURN NULL;  -- AFTER trigger, valor de retorno é ignorado
END;
$$;

COMMENT ON FUNCTION public.fn_audit_row() IS
  'Auditoria universal disparada por trigger AFTER em tabelas críticas. Não bloqueia a operação principal — falha vai para o log do Postgres. Detecta campos comuns (nome/descricao/titulo/assunto) para o record_name, e no UPDATE grava apenas o diff.';

-- ─── Aplicar em cada tabela crítica ─────────────────────────────────────────
-- Padrão: DROP se existir, CREATE. Idempotente.

-- Clínica
DROP TRIGGER IF EXISTS trg_audit ON public.clinicas;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.clinicas
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit ON public.configuracoes_clinica;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.configuracoes_clinica
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- Governança de acesso — quem virou admin/médico é sensível
DROP TRIGGER IF EXISTS trg_audit ON public.user_roles;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- Cadastros clínicos
DROP TRIGGER IF EXISTS trg_audit ON public.pacientes;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.pacientes
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit ON public.medicos;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.medicos
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit ON public.funcionarios;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.funcionarios
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit ON public.convenios;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.convenios
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit ON public.tipos_consulta;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.tipos_consulta
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit ON public.salas;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.salas
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- Atendimento
DROP TRIGGER IF EXISTS trg_audit ON public.agendamentos;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit ON public.fila_atendimento;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.fila_atendimento
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit ON public.triagens;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.triagens
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit ON public.retornos;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.retornos
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- Documentos clínicos
DROP TRIGGER IF EXISTS trg_audit ON public.prontuarios;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.prontuarios
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit ON public.prescricoes;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.prescricoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit ON public.atestados;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.atestados
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit ON public.encaminhamentos;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.encaminhamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit ON public.anexos_prontuario;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.anexos_prontuario
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- Laboratório
DROP TRIGGER IF EXISTS trg_audit ON public.exames;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.exames
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit ON public.coletas_laboratorio;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.coletas_laboratorio
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit ON public.resultados_laboratorio;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.resultados_laboratorio
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- Financeiro
DROP TRIGGER IF EXISTS trg_audit ON public.lancamentos;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit ON public.lancamento_itens;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.lancamento_itens
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit ON public.pagamentos;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit ON public.caixa_diario;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.caixa_diario
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- Estoque (dispensa de medicamento é auditável por segurança do paciente)
DROP TRIGGER IF EXISTS trg_audit ON public.estoque;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.estoque
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit ON public.movimentacoes_estoque;
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON public.movimentacoes_estoque
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

COMMIT;

-- ============================================================================
-- COMO CONFERIR DEPOIS DE APLICAR
-- ============================================================================
-- Faça UMA operação em cada área (criar um paciente de teste, editar um
-- agendamento, lançar uma receita) e veja se aparece:
--
--   SELECT collection, action, record_name, timestamp
--     FROM public.audit_log
--    WHERE timestamp > NOW() - INTERVAL '10 minutes'
--    ORDER BY timestamp DESC;
--
-- Se algo não aparecer, olhe o log do Postgres — o EXCEPTION do trigger
-- publica WARNING com a mensagem exata.
--
-- COMO DESLIGAR EM CASO DE PROBLEMA (última linha de defesa):
--   DO $$
--   DECLARE t text;
--   BEGIN
--     FOR t IN SELECT event_object_table FROM information_schema.triggers
--              WHERE trigger_name = 'trg_audit'
--     LOOP
--       EXECUTE format('DROP TRIGGER IF EXISTS trg_audit ON public.%I', t);
--     END LOOP;
--   END $$;
