-- ============================================================================
-- CPF único POR CLÍNICA, comparado sem máscara
--
-- Descoberto ao construir a importação de bases de outros sistemas.
--
-- ─── PROBLEMA 1: único global num sistema multi-clínica ────────────────────
--
--   pacientes_cpf_key: UNIQUE (cpf)
--
-- Duas clínicas não podiam ter o mesmo paciente. A mesma pessoa se consulta na
-- Monte Sinai e na INOVALAB — é o caso normal, não a exceção. E na importação
-- seria pior: a clínica sobe a base dela e a linha falha com "chave duplicada"
-- porque aquele CPF já existe na base de OUTRO cliente do SaaS, que ela não
-- pode ver nem corrigir.
--
-- ─── PROBLEMA 2: máscara ───────────────────────────────────────────────────
--
-- Dos 79 CPFs gravados hoje, 63 estão com máscara ('123.456.789-00') e 16 sem.
-- Para o índice, esses dois textos são valores diferentes: o mesmo paciente
-- entra duas vezes e a restrição não percebe. Na importação isso vira base
-- duplicada, porque planilha de outro sistema quase sempre vem sem máscara.
--
-- ─── A CORREÇÃO ────────────────────────────────────────────────────────────
--
-- Índice único em (clinica_id, só os dígitos do CPF). O formato gravado não é
-- alterado — reescrever 63 registros para ganhar estética não vale o risco, e
-- a busca por paciente já compara sem máscara (src/lib/buscaPaciente.ts).
--
-- Conferido antes de aplicar: 0 CPFs repetidos entre clínicas e 0 repetidos
-- dentro da mesma clínica. Nenhuma linha existente conflita.
-- ============================================================================

BEGIN;

ALTER TABLE public.pacientes DROP CONSTRAINT IF EXISTS pacientes_cpf_key;
DROP INDEX IF EXISTS public.pacientes_cpf_key;

-- ─── A duplicata que o índice antigo já tinha deixado passar ────────────────
--
-- O índice recusou a criação: CPF 148.562.606-42 estava gravado duas vezes na
-- mesma clínica, uma versão com máscara e outra sem — o defeito descrito acima,
-- já materializado em produção.
--
-- Aqui NÃO se apaga paciente. Tira-se o CPF da cópia VAZIA (sem agendamento,
-- prontuário ou lançamento): o cadastro continua existindo inteiro, e o CPF
-- fica com a linha que tem o histórico. Se as duas cópias tiverem dados, a
-- migration ABORTA — juntar dois prontuários é decisão clínica, não de script.
DO $$
DECLARE
  v_ambiguas int;
  v_limpas   int;
BEGIN
  CREATE TEMP TABLE _dup ON COMMIT DROP AS
  SELECT p.id,
         p.clinica_id,
         regexp_replace(p.cpf, '[^0-9]', '', 'g') AS digitos,
         (SELECT count(*) FROM public.agendamentos a WHERE a.paciente_id = p.id)
       + (SELECT count(*) FROM public.prontuarios  r WHERE r.paciente_id = p.id)
       + (SELECT count(*) FROM public.lancamentos  l WHERE l.paciente_id = p.id) AS vinculos
    FROM public.pacientes p
   WHERE p.cpf IS NOT NULL AND btrim(p.cpf) <> ''
     AND EXISTS (
       SELECT 1 FROM public.pacientes q
        WHERE q.clinica_id = p.clinica_id
          AND q.id <> p.id
          AND q.cpf IS NOT NULL
          AND regexp_replace(q.cpf, '[^0-9]', '', 'g') = regexp_replace(p.cpf, '[^0-9]', '', 'g')
     );

  -- Grupo em que mais de uma cópia tem histórico: ninguém decide isso sozinho.
  SELECT count(*) INTO v_ambiguas FROM (
    SELECT clinica_id, digitos FROM _dup WHERE vinculos > 0 GROUP BY 1,2 HAVING count(*) > 1
  ) x;

  IF v_ambiguas > 0 THEN
    RAISE EXCEPTION
      'ABORTADO — % CPF(s) duplicados com histórico nos dois cadastros. Precisam ser unificados à mão antes.',
      v_ambiguas;
  END IF;

  -- Mantém o CPF em quem tem histórico; na ausência de histórico, no mais antigo.
  UPDATE public.pacientes p
     SET cpf = NULL
   WHERE p.id IN (
     SELECT d.id FROM _dup d
      WHERE d.id <> (
        SELECT d2.id FROM _dup d2
         WHERE d2.clinica_id = d.clinica_id AND d2.digitos = d.digitos
         ORDER BY d2.vinculos DESC, (SELECT created_at FROM public.pacientes z WHERE z.id = d2.id) ASC
         LIMIT 1
      )
   );

  GET DIAGNOSTICS v_limpas = ROW_COUNT;
  RAISE NOTICE 'CPF removido de % cadastro(s) duplicado(s) sem histórico.', v_limpas;
END $$;

-- Parcial: paciente sem CPF é comum (criança, atendimento de urgência) e
-- vários NULL não podem colidir entre si.
CREATE UNIQUE INDEX IF NOT EXISTS pacientes_cpf_por_clinica
  ON public.pacientes (clinica_id, regexp_replace(cpf, '[^0-9]', '', 'g'))
  WHERE cpf IS NOT NULL AND btrim(cpf) <> '';

COMMENT ON INDEX public.pacientes_cpf_por_clinica IS
  'Um CPF por clínica, comparado só pelos dígitos. Substitui o UNIQUE global em cpf, que impedia a mesma pessoa de ser paciente de duas clínicas e deixava passar duplicata quando uma linha tinha máscara e a outra não.';

COMMIT;
