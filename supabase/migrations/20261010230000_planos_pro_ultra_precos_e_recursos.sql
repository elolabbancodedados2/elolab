-- Planos comerciais: Pro a R$ 379 e Ultra a R$ 499.
-- Mantém os slugs existentes para preservar assinaturas, checkouts e links salvos.
UPDATE public.planos AS pro
SET nome = 'EloLab Pro',
    descricao = 'Acesso a todos os módulos e recursos da plataforma para sua clínica.',
    valor = 379.00,
    features = COALESCE(pro.features, '[]'::jsonb) - 'agente_ia' - 'chatbot_whatsapp',
    ordem = 1
WHERE pro.slug = 'elolab-max';

UPDATE public.planos AS ultra
SET nome = 'EloLab Ultra',
    descricao = 'Tudo do Pro, com atendente de IA para a clínica.',
    valor = 499.00,
    features = (
      SELECT (COALESCE(pro.features, '[]'::jsonb) - 'agente_ia' - 'chatbot_whatsapp') || '["agente_ia"]'::jsonb
      FROM public.planos AS pro
      WHERE pro.slug = 'elolab-max'
    ),
    ordem = 2,
    destaque = true
WHERE ultra.slug = 'elolab-ultra';
