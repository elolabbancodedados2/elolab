-- ============================================================================
-- Impede dupla marcação no banco, não só na tela
--
-- A checagem de conflito de horário existe no formulário (AppointmentDialog) e
-- no arrastar-e-soltar (AgendaPage), mas ambas rodam no NAVEGADOR: leem os
-- agendamentos, comparam e só então gravam. Duas pessoas na recepção marcando
-- ao mesmo tempo passam pelas duas validações e criam consulta duplicada — o
-- paciente só descobre na sala de espera.
--
-- Uma constraint EXCLUDE resolve porque o próprio Postgres serializa: a segunda
-- gravação é recusada, não importa quantas abas estejam abertas.
--
-- REGRA: um médico não pode ter dois agendamentos que se sobreponham no mesmo
-- dia. Encostar não conflita (uma consulta terminando 09:00 e outra começando
-- 09:00 é permitido), igual à validação da tela.
--
-- Cancelados e faltas não ocupam horário.
--
-- ⚠️ ENCAIXE PROPOSITAL
-- Se a clínica precisar marcar dois pacientes no mesmo horário de propósito,
-- esta constraint impede. Nesse caso a saída é adicionar uma coluna `encaixe
-- boolean` e incluí-la na constraint, para que encaixes marcados como tais
-- sejam aceitos. Hoje a tela já bloqueia sobreposição, então esta migration
-- não muda o comportamento — só fecha a corrida entre dois usuários.
-- ============================================================================

BEGIN;

-- EXCLUDE com igualdade em colunas escalares exige btree_gist
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ─── Diagnóstico: já existem duplicidades? ──────────────────────────────────
-- A constraint não pode ser criada se houver sobreposição pré-existente.
-- Em vez de falhar com erro obscuro, avisamos com clareza.
DO $$
DECLARE
  v_conflitos integer;
BEGIN
  SELECT count(*) INTO v_conflitos
  FROM public.agendamentos a
  JOIN public.agendamentos b
    ON a.id < b.id
   AND a.medico_id = b.medico_id
   AND a.data = b.data
   AND a.medico_id IS NOT NULL
   AND (a.status IS NULL OR a.status NOT IN ('cancelado', 'faltou'))
   AND (b.status IS NULL OR b.status NOT IN ('cancelado', 'faltou'))
   AND a.hora_inicio < COALESCE(b.hora_fim, b.hora_inicio + interval '30 minutes')
   AND COALESCE(a.hora_fim, a.hora_inicio + interval '30 minutes') > b.hora_inicio;

  IF v_conflitos > 0 THEN
    RAISE EXCEPTION
      'Existem % par(es) de agendamentos sobrepostos. Resolva-os antes de aplicar esta constraint. Use a consulta do rodapé deste arquivo para listá-los.',
      v_conflitos;
  END IF;
END $$;

-- ─── A constraint ───────────────────────────────────────────────────────────
ALTER TABLE public.agendamentos
  DROP CONSTRAINT IF EXISTS agendamentos_sem_sobreposicao;

ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_sem_sobreposicao
  EXCLUDE USING gist (
    medico_id WITH =,
    data      WITH =,
    tsrange(
      (data + hora_inicio)::timestamp,
      (data + COALESCE(hora_fim, hora_inicio + interval '30 minutes'))::timestamp,
      '[)'                        -- fim aberto: encostar não conflita
    ) WITH &&
  )
  WHERE (
    medico_id IS NOT NULL
    AND (status IS NULL OR status NOT IN ('cancelado', 'faltou'))
  );

COMMENT ON CONSTRAINT agendamentos_sem_sobreposicao ON public.agendamentos IS
  'Impede dois agendamentos sobrepostos para o mesmo médico. A validação da tela roda no navegador e não protege contra dois usuários marcando simultaneamente.';

COMMIT;

-- ============================================================================
-- SE A MIGRATION FALHAR POR CONFLITOS PRÉ-EXISTENTES
-- ============================================================================
-- Liste os pares sobrepostos e decida o que fazer com cada um:
--
-- SELECT a.id AS id_a, b.id AS id_b, a.data, a.hora_inicio AS ini_a,
--        a.hora_fim AS fim_a, b.hora_inicio AS ini_b, b.hora_fim AS fim_b,
--        m.nome AS medico, pa.nome AS paciente_a, pb.nome AS paciente_b
--   FROM public.agendamentos a
--   JOIN public.agendamentos b
--     ON a.id < b.id AND a.medico_id = b.medico_id AND a.data = b.data
--   LEFT JOIN public.medicos   m  ON m.id  = a.medico_id
--   LEFT JOIN public.pacientes pa ON pa.id = a.paciente_id
--   LEFT JOIN public.pacientes pb ON pb.id = b.paciente_id
--  WHERE a.medico_id IS NOT NULL
--    AND (a.status IS NULL OR a.status NOT IN ('cancelado','faltou'))
--    AND (b.status IS NULL OR b.status NOT IN ('cancelado','faltou'))
--    AND a.hora_inicio < COALESCE(b.hora_fim, b.hora_inicio + interval '30 minutes')
--    AND COALESCE(a.hora_fim, a.hora_inicio + interval '30 minutes') > b.hora_inicio
--  ORDER BY a.data, a.hora_inicio;
