-- ============================================================================
-- Busca de paciente por CPF/telefone independente da máscara gravada
--
-- O PROBLEMA
-- O balcão busca CPF e telefone pelos dígitos, mas o cadastro guarda o valor
-- com a máscara que cada tela usou: "123.456.789-00", "(11)98888-7777",
-- "+55 11 98888-7777"... Um ILIKE sobre o texto mascarado só funciona para os
-- formatos que o cliente conhece de antemão; qualquer outro formato some da
-- busca e a recepção cadastra o paciente de novo.
--
-- A CORREÇÃO
-- Duas colunas só com dígitos, mantidas pelo banco: `cpf_digitos` e
-- `telefone_digitos`. A busca vira `LIKE '%456789%'` contínuo nessas colunas.
--
-- Por que trigger e não coluna GENERATED: a restauração de backup faz upsert
-- de linhas completas (src/lib/backup.ts). Uma coluna gerada recusa qualquer
-- valor informado ("cannot insert a non-DEFAULT value"), e um backup feito
-- depois desta migração deixaria de restaurar. Com trigger, o valor que vier
-- na linha é simplesmente recalculado.
-- ============================================================================

BEGIN;

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS cpf_digitos text,
  ADD COLUMN IF NOT EXISTS telefone_digitos text;

COMMENT ON COLUMN public.pacientes.cpf_digitos IS
  'Só os dígitos de `cpf`, mantido pelo trigger pacientes_sincroniza_digitos. Usado na busca; não edite direto.';
COMMENT ON COLUMN public.pacientes.telefone_digitos IS
  'Só os dígitos de `telefone`, mantido pelo trigger pacientes_sincroniza_digitos. Usado na busca; não edite direto.';

CREATE OR REPLACE FUNCTION public.pacientes_sincroniza_digitos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.cpf_digitos := NULLIF(regexp_replace(COALESCE(NEW.cpf, ''), '[^0-9]', '', 'g'), '');
  NEW.telefone_digitos := NULLIF(regexp_replace(COALESCE(NEW.telefone, ''), '[^0-9]', '', 'g'), '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pacientes_sincroniza_digitos ON public.pacientes;
CREATE TRIGGER pacientes_sincroniza_digitos
  BEFORE INSERT OR UPDATE OF cpf, telefone, cpf_digitos, telefone_digitos ON public.pacientes
  FOR EACH ROW EXECUTE FUNCTION public.pacientes_sincroniza_digitos();

-- Preenche o que já existe. Os triggers de usuário ficam desligados só neste
-- UPDATE: sem isso, `trg_audit` gravaria uma linha de auditoria por paciente
-- e `update_pacientes_updated_at` mudaria a data de alteração de todo mundo,
-- sem que ninguém tenha editado cadastro algum.
ALTER TABLE public.pacientes DISABLE TRIGGER USER;
UPDATE public.pacientes
   SET cpf_digitos = NULLIF(regexp_replace(COALESCE(cpf, ''), '[^0-9]', '', 'g'), ''),
       telefone_digitos = NULLIF(regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g'), '')
 WHERE cpf_digitos IS DISTINCT FROM NULLIF(regexp_replace(COALESCE(cpf, ''), '[^0-9]', '', 'g'), '')
    OR telefone_digitos IS DISTINCT FROM NULLIF(regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g'), '');
ALTER TABLE public.pacientes ENABLE TRIGGER USER;

COMMIT;

-- Índices trigram para o LIKE '%...%'. Fora da transação acima e tolerante a
-- ambiente sem pg_trgm: sem o índice a busca continua correta, só mais lenta.
DO $$
DECLARE
  v_schema text;
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
  -- Se a extensão já existia em outro schema (ex.: public), o comando acima
  -- não a move; o operador precisa ser qualificado com o schema real.
  SELECT n.nspname INTO v_schema
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'pg_trgm';
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_pacientes_cpf_digitos_trgm ON public.pacientes USING gin (cpf_digitos %I.gin_trgm_ops)',
    v_schema);
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_pacientes_telefone_digitos_trgm ON public.pacientes USING gin (telefone_digitos %I.gin_trgm_ops)',
    v_schema);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm indisponível (%); busca por dígitos segue sem índice trigram.', SQLERRM;
END;
$$;
