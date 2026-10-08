-- Impede que a exclusão do cadastro apague histórico clínico/operacional em
-- cascata. A verificação enumera todas as FKs que apontam para pacientes, de
-- modo que novas relações também ficam protegidas sem alterar cada módulo.
CREATE OR REPLACE FUNCTION public.impedir_exclusao_paciente_com_historico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_relacao record;
  v_tem_registro boolean;
BEGIN
  FOR v_relacao IN
    SELECT c.conrelid::regclass AS tabela,
           string_agg(
             format('filho.%I = ($1).%I', filha.attname, pai.attname),
             ' AND ' ORDER BY chave.ordem
           ) AS condicao
      FROM pg_constraint c
      CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS chave_filha(attnum, ordem)
      JOIN LATERAL unnest(c.confkey) WITH ORDINALITY AS chave_pai(attnum, ordem)
        ON chave_pai.ordem = chave_filha.ordem
      JOIN pg_attribute filha
        ON filha.attrelid = c.conrelid AND filha.attnum = chave_filha.attnum
      JOIN pg_attribute pai
        ON pai.attrelid = c.confrelid AND pai.attnum = chave_pai.attnum
     WHERE c.contype = 'f'
       AND c.confrelid = 'public.pacientes'::regclass
       AND c.conrelid <> 'public.pacientes'::regclass
     GROUP BY c.conrelid
  LOOP
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM %s AS filho WHERE %s)',
      v_relacao.tabela,
      v_relacao.condicao
    ) INTO v_tem_registro USING OLD;

    IF v_tem_registro THEN
      RAISE EXCEPTION 'Este paciente possui histórico vinculado. O cadastro não pode ser excluído; solicite avaliação pelo fluxo LGPD.'
        USING ERRCODE = '23503';
    END IF;
  END LOOP;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.impedir_exclusao_paciente_com_historico() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS preservar_historico_ao_excluir_paciente ON public.pacientes;
CREATE TRIGGER preservar_historico_ao_excluir_paciente
  BEFORE DELETE ON public.pacientes
  FOR EACH ROW
  EXECUTE FUNCTION public.impedir_exclusao_paciente_com_historico();
