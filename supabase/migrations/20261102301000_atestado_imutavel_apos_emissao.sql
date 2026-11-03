-- Atestado emitido não muda nem some (auditoria de 02/11).
--
-- O médico emissor e o administrador podiam editar dias, CID, motivo e datas
-- de um atestado já entregue ao paciente, e o administrador podia apagá-lo
-- (policy atestados_delete_scoped, 20260322225841). Um documento entregue
-- precisa continuar igual ao que está no banco.
--   * o conteúdo clínico e as datas ficam imutáveis depois do INSERT;
--   * a policy de DELETE sai: sem policy, a RLS nega a exclusão. A tabela não
--     tem coluna de status, então não há cancelamento: correção é emitir outro.
-- O vínculo com o atendimento (agendamento_id) segue editável pelo trigger de
-- 20261101104000. A exclusão em cascata do paciente (LGPD) não passa por RLS.

CREATE OR REPLACE FUNCTION public.atestado_conteudo_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.dias IS DISTINCT FROM OLD.dias
     OR NEW.cid IS DISTINCT FROM OLD.cid
     OR NEW.motivo IS DISTINCT FROM OLD.motivo
     OR NEW.observacoes IS DISTINCT FROM OLD.observacoes
     OR NEW.data_emissao IS DISTINCT FROM OLD.data_emissao
     OR NEW.data_inicio IS DISTINCT FROM OLD.data_inicio
     OR NEW.data_fim IS DISTINCT FROM OLD.data_fim THEN
    RAISE EXCEPTION 'Atestado emitido não pode ser alterado. Emita um novo atestado para corrigir.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.atestado_conteudo_imutavel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_atestado_conteudo_imutavel ON public.atestados;
CREATE TRIGGER trg_atestado_conteudo_imutavel
  BEFORE UPDATE ON public.atestados
  FOR EACH ROW
  EXECUTE FUNCTION public.atestado_conteudo_imutavel();

DROP POLICY IF EXISTS "atestados_delete_scoped" ON public.atestados;
DROP POLICY IF EXISTS "atestados_delete" ON public.atestados;
