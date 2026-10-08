-- Evita que a exclusão de um convênio apague silenciosamente preços e
-- autorizações que fazem parte da operação e do histórico da clínica.
BEGIN;

ALTER TABLE public.precos_exames_convenio
  DROP CONSTRAINT IF EXISTS precos_exames_convenio_convenio_id_fkey,
  ADD CONSTRAINT precos_exames_convenio_convenio_id_fkey
    FOREIGN KEY (convenio_id) REFERENCES public.convenios(id) ON DELETE RESTRICT;

ALTER TABLE public.precos_consulta_convenio
  DROP CONSTRAINT IF EXISTS precos_consulta_convenio_convenio_id_fkey,
  ADD CONSTRAINT precos_consulta_convenio_convenio_id_fkey
    FOREIGN KEY (convenio_id) REFERENCES public.convenios(id) ON DELETE RESTRICT;

ALTER TABLE public.autorizacoes_convenio
  DROP CONSTRAINT IF EXISTS autorizacoes_convenio_convenio_id_fkey,
  ADD CONSTRAINT autorizacoes_convenio_convenio_id_fkey
    FOREIGN KEY (convenio_id) REFERENCES public.convenios(id) ON DELETE RESTRICT;

COMMIT;
