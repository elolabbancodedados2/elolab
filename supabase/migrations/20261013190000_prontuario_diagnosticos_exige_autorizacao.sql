-- Diagnosticos estruturados seguem as mesmas regras do prontuario pai:
-- mesma clinica, admin ou medico autorizado, e trilha recente para prontuario assinado.
-- Migration somente de policy; nao altera registros.
BEGIN;

DROP POLICY IF EXISTS "Usuários podem ver diagnósticos da própria clínica"
  ON public.prontuario_diagnosticos;

CREATE POLICY "Leitura autorizada de diagnósticos do prontuário"
  ON public.prontuario_diagnosticos FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.prontuarios p
      WHERE p.id = prontuario_diagnosticos.prontuario_id
        AND public.is_same_clinica(p.clinica_id)
        AND (
          public.is_admin(auth.uid())
          OR (
            public.is_medico(auth.uid())
            AND (
              p.assinado IS TRUE
              OR public.is_medico_responsavel_do_prontuario(p.medico_id)
            )
          )
        )
        AND (p.assinado IS NOT TRUE OR public.prontuario_leitura_auditada(p.id))
    )
  );

COMMIT;
