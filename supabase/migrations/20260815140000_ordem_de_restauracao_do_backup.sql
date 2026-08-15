-- ============================================================================
-- Ordem de restauração: pai antes de filho, calculada pelas chaves reais
--
-- `restoreBackup` tinha uma lista de 17 nomes escrita à mão. O banco tem 78
-- tabelas — as outras 61 eram restauradas na ordem em que o JSON aparecia, e
-- filho antes de pai quebra por chave estrangeira. O erro virava
-- `console.warn` e a restauração seguia, deixando o banco pela metade com
-- aparência de sucesso.
--
-- Aqui a ordem sai de uma ordenação topológica das FKs de verdade. Tabela nova
-- entra sozinha, sem ninguém lembrar de editar array nenhum.
--
-- Autorreferência (`profiles.criado_por -> profiles`) é ignorada de propósito:
-- ela não impõe ordem ENTRE tabelas, e contá-la travaria o algoritmo achando
-- que existe ciclo.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.ordem_de_restauracao()
RETURNS SETOF text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restantes text[];
  v_prontas   text[] := ARRAY[]::text[];
  v_camada    text[];
BEGIN
  SELECT array_agg(t ORDER BY t) INTO v_restantes
    FROM public.tabelas_para_backup() AS t;

  IF v_restantes IS NULL THEN
    RETURN;
  END IF;

  -- Cada volta pega as tabelas cujas dependências já saíram, em ordem
  -- alfabética para o resultado ser estável entre execuções.
  WHILE array_length(v_restantes, 1) > 0 LOOP
    SELECT array_agg(r ORDER BY r) INTO v_camada
      FROM unnest(v_restantes) AS r
     WHERE NOT EXISTS (
       SELECT 1
         FROM pg_constraint con
         JOIN pg_class     filho ON filho.oid = con.conrelid
         JOIN pg_class     pai   ON pai.oid   = con.confrelid
         JOIN pg_namespace nf    ON nf.oid    = filho.relnamespace
         JOIN pg_namespace np    ON np.oid    = pai.relnamespace
        WHERE con.contype = 'f'
          AND nf.nspname  = 'public'
          AND np.nspname  = 'public'
          AND filho.relname = r
          AND pai.relname  <> r                      -- autorreferência não conta
          AND pai.relname   = ANY(v_restantes)       -- o pai ainda não saiu
     );

    -- Ciclo entre tabelas: devolve o que sobrou em ordem alfabética em vez de
    -- girar para sempre. Melhor uma ordem imperfeita do que nenhuma resposta.
    IF v_camada IS NULL THEN
      RETURN QUERY SELECT unnest(v_restantes) ORDER BY 1;
      RETURN;
    END IF;

    RETURN QUERY SELECT unnest(v_camada);

    v_prontas   := v_prontas || v_camada;
    SELECT array_agg(r ORDER BY r) INTO v_restantes
      FROM unnest(v_restantes) AS r WHERE NOT (r = ANY(v_camada));
    v_restantes := COALESCE(v_restantes, ARRAY[]::text[]);
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.ordem_de_restauracao() IS
  'Tabelas do backup em ordem de restauração — pai antes de filho, por ordenação topológica das chaves estrangeiras. Usada por restoreBackup para não quebrar por FK.';

REVOKE ALL ON FUNCTION public.ordem_de_restauracao() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ordem_de_restauracao() TO authenticated;

COMMIT;
