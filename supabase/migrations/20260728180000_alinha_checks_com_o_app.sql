-- ============================================================================
-- Alinha restrições CHECK com os valores que a aplicação realmente usa
--
-- Encontrado pelo scripts/check-colunas.mjs ao passar a comparar valores
-- literais contra CHECK e enums. Em todos os casos o INSERT/UPDATE era recusado
-- pelo banco e o erro não era checado — a operação simplesmente não acontecia.
--
-- ── 1. encaminhamentos.status = 'pendente' ──────────────────────────────────
-- A tela de Encaminhamentos foi construída em torno de 'pendente': é o status
-- inicial, tem cartão de KPI, filtro próprio e é o default do STATUS_CONFIG.
-- Mas a restrição só admite enviado/recebido/em_andamento/concluido/cancelado.
-- Resultado: encaminhamento criado pelo prontuário era recusado e nunca
-- chegava à lista.
-- Aqui o banco é que está desatualizado, não o app — então ampliamos.
--
-- ── 2. fila_atendimento.status = 'concluido' ────────────────────────────────
-- A recepção tem um fluxo de CINCO passos (ver STEP_LABELS e patientStep em
-- src/pages/Recepcao.tsx):
--   Check-in → Balcão → Atendimento → Finalizado → Concluído
-- 'finalizado' marca o fim da consulta; 'concluido' marca o fim do ciclo na
-- recepção, depois dos encaminhamentos pós-consulta. São estados distintos e
-- ambos necessários — o passo 4 é reconhecido justamente por
-- `ag.status === 'finalizado' && filaItem.status === 'concluido'`.
--
-- A restrição não previa 'concluido' e recusava o update: o paciente nunca
-- saía da recepção.
--
-- Considerei alinhar o código para 'finalizado', mas isso colapsaria os passos
-- 3 e 4 — a automação já grava 'finalizado' na fila ao encerrar a consulta, e
-- o passo 4 deixaria de existir. Aqui quem estava incompleto era o banco.
--
-- ── 3. audit_log.action ─────────────────────────────────────────────────────
-- A restrição admite create/update/delete, mas a aplicação registra eventos
-- que não são nenhum dos três:
--   'access'        — abertura de prontuário
--   'sign'          — assinatura digital
--   'edit_request'  — pedido de edição de prontuário assinado
-- Todos eram recusados. O de 'access' é o mais sério: registro de ACESSO a
-- prontuário é exigência de rastreabilidade sob a LGPD, e simplesmente não
-- estava sendo gravado.
-- Forçá-los em 'update' perderia a distinção, então ampliamos a lista.
-- ============================================================================

BEGIN;

-- ─── encaminhamentos.status ─────────────────────────────────────────────────
ALTER TABLE public.encaminhamentos
  DROP CONSTRAINT IF EXISTS encaminhamentos_status_check;

ALTER TABLE public.encaminhamentos
  ADD CONSTRAINT encaminhamentos_status_check
  CHECK (status IN ('pendente', 'enviado', 'recebido', 'em_andamento', 'concluido', 'cancelado'));

-- ─── fila_atendimento.status ────────────────────────────────────────────────
ALTER TABLE public.fila_atendimento
  DROP CONSTRAINT IF EXISTS fila_atendimento_status_check;

ALTER TABLE public.fila_atendimento
  ADD CONSTRAINT fila_atendimento_status_check
  CHECK (status IN ('aguardando', 'chamado', 'em_atendimento', 'finalizado', 'concluido'));

-- ─── audit_log.action ───────────────────────────────────────────────────────
ALTER TABLE public.audit_log
  DROP CONSTRAINT IF EXISTS audit_log_action_check;

ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_action_check
  CHECK (action IN ('create', 'update', 'delete', 'access', 'sign', 'edit_request'));

COMMENT ON COLUMN public.audit_log.action IS
  'create/update/delete para alteração de dado; access para leitura de prontuário (rastreabilidade LGPD); sign para assinatura digital; edit_request para pedido de edição de prontuário assinado.';

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
-- -- Depois de aplicar, os eventos de acesso a prontuário passam a aparecer:
-- SELECT action, count(*) FROM public.audit_log GROUP BY action ORDER BY 2 DESC;
--
-- -- Encaminhamentos por status (antes desta migration, nenhum em 'pendente'):
-- SELECT status, count(*) FROM public.encaminhamentos GROUP BY status;
