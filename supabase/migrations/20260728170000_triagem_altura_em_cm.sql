-- ============================================================================
-- Corrige o campo de altura da triagem, que impedia salvar qualquer adulto
--
-- O PROBLEMA
-- A tela de triagem pede a altura em CENTÍMETROS — o campo é rotulado "cm",
-- o placeholder é "170" e o cálculo do IMC divide por 100. Mas a coluna é
-- DECIMAL(4,2), cujo valor máximo é 99,99.
--
-- Resultado: qualquer altura de adulto (150, 170, 180...) estoura a coluna e o
-- INSERT falha. Na prática, a triagem não salvava.
--
-- O bug ficou escondido porque a tela esteve inalcançável por um período: a
-- rota /triagem redirecionava para /fila e a Fila não tinha triagem. Ao
-- religá-la, o problema apareceu.
--
-- Prontuários não sofre disso: guarda os vitais num jsonb (sem limite) e seu
-- cálculo de IMC aceita tanto cm quanto metros.
--
-- A CORREÇÃO
-- Alargar a coluna para caber centímetros e uniformizar o que já existe.
-- Registros antigos só podem estar em METROS — eram os únicos que cabiam em
-- DECIMAL(4,2) — então convertemos para cm usando um limiar seguro: nenhuma
-- pessoa tem menos de 3 cm nem mais de 3 m.
-- ============================================================================

BEGIN;

ALTER TABLE public.triagens
  ALTER COLUMN altura TYPE numeric(6,2);

-- Normaliza para centímetros o que foi gravado em metros
UPDATE public.triagens
   SET altura = round(altura * 100, 2)
 WHERE altura IS NOT NULL AND altura > 0 AND altura < 3;

COMMENT ON COLUMN public.triagens.altura IS 'Altura em centímetros (ex.: 170).';

-- vitais_historico tem o mesmo limite e a mesma finalidade, mas a migration que
-- a cria (20260414000001_add_all_workflows.sql) nunca foi aplicada em produção:
-- a tabela não existe no banco. Tratamos condicionalmente para que este arquivo
-- funcione tanto no banco atual quanto num banco onde aquela migration rodou.
DO $$
BEGIN
  IF to_regclass('public.vitais_historico') IS NOT NULL THEN
    ALTER TABLE public.vitais_historico ALTER COLUMN altura TYPE numeric(6,2);

    UPDATE public.vitais_historico
       SET altura = round(altura * 100, 2)
     WHERE altura IS NOT NULL AND altura > 0 AND altura < 3;

    COMMENT ON COLUMN public.vitais_historico.altura IS 'Altura em centímetros (ex.: 170).';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
-- -- Nenhum valor deve sobrar abaixo de 3 (ou seja, ainda em metros):
-- SELECT count(*) AS ainda_em_metros
--   FROM public.triagens WHERE altura IS NOT NULL AND altura > 0 AND altura < 3;
--
-- -- Faixa dos valores após a normalização:
-- SELECT min(altura), max(altura), count(*) FROM public.triagens WHERE altura IS NOT NULL;
