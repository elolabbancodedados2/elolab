-- As configurações de automação pertencem à clínica. A restrição antiga em
-- `chave` era global e fazia uma clínica sobrescrever ou bloquear outra.
ALTER TABLE public.automation_settings
  DROP CONSTRAINT IF EXISTS automation_settings_chave_key;

CREATE UNIQUE INDEX IF NOT EXISTS automation_settings_clinica_chave_key
  ON public.automation_settings (clinica_id, chave);

-- Replica os defaults legados para as clínicas existentes. As linhas antigas
-- sem clínica ficam preservadas para auditoria, mas não aparecem nas telas
-- isoladas por RLS.
INSERT INTO public.automation_settings (chave, valor, descricao, ativo, clinica_id)
SELECT s.chave, s.valor, s.descricao, s.ativo, c.id
FROM public.automation_settings s
CROSS JOIN public.clinicas c
WHERE s.clinica_id IS NULL
ON CONFLICT (clinica_id, chave) DO NOTHING;
