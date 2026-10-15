-- Keep the public plan description aligned with the feature gate.
-- This updates catalog copy only; it does not touch subscriptions or clinic data.
UPDATE public.planos
SET descricao = 'Gestão completa da rotina da clínica. O Agente de IA está disponível no EloLab Ultra.'
WHERE slug = 'elolab-max'
  AND descricao IS DISTINCT FROM 'Gestão completa da rotina da clínica. O Agente de IA está disponível no EloLab Ultra.';
