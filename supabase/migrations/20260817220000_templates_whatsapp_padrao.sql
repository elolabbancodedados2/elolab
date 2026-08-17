-- ============================================================================
-- Templates WhatsApp padrão (globais)
--
-- A migration 20260817180000 fez `notify_exam_result_available` enfileirar
-- WhatsApp além de e-mail — MAS só quando existe template ativo. Em produção
-- não existe nenhum template `whatsapp` cadastrado (só `email`), então o canal
-- WhatsApp segue inerte apesar da infra pronta.
--
-- Esta migration insere 3 templates globais (`clinica_id IS NULL`), que a
-- lógica de busca prefere depois do template específico da clínica. Assim,
-- toda clínica passa a ter WhatsApp funcionando "de fábrica"; quem quiser
-- customizar, sobrescreve pela tela `TemplatesEmail`.
--
-- ─── VARIÁVEIS ──────────────────────────────────────────────────────────
-- `{{paciente_nome}}`, `{{clinica_nome}}`, `{{link_portal}}`, `{{tipo_exame}}`,
-- `{{data}}`, `{{horario}}`, `{{medico_nome}}` — todas já resolvidas pelos
-- triggers de notificação.
--
-- ─── FORMATO ────────────────────────────────────────────────────────────
-- WhatsApp aceita markdown simples (*negrito*, _itálico_) e emoji. Nada de
-- HTML — a Evolution API entrega como texto plano.
--
-- ─── IDEMPOTÊNCIA ──────────────────────────────────────────────────────
-- `ON CONFLICT DO NOTHING` na chave lógica (categoria, tipo, clinica_id
-- NULL). Se já existir template global da mesma categoria/canal, nada
-- acontece — não sobrescreve.
-- ============================================================================

BEGIN;

-- Sem ON CONFLICT — a tabela já tem alguns duplicados históricos em
-- (categoria, tipo, clinica_id NULL) que impedem criar um índice único
-- retroativo. Uso INSERT ... WHERE NOT EXISTS para não repetir.

INSERT INTO public.notification_templates (nome, tipo, categoria, conteudo, variaveis, ativo, clinica_id)
SELECT
  'Resultado de exame (WhatsApp)',
  'whatsapp',
  'resultado_exame',
  E'Olá, {{paciente_nome}} 👋\n\nO resultado do seu exame de *{{tipo_exame}}* já está disponível!\n\nAcesse o portal para baixar: {{link_portal}}\n\nQualquer dúvida, é só responder esta mensagem.\n\n_{{clinica_nome}}_',
  ARRAY['paciente_nome','tipo_exame','link_portal','clinica_nome'],
  true, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates
   WHERE categoria = 'resultado_exame' AND tipo = 'whatsapp' AND clinica_id IS NULL
);

INSERT INTO public.notification_templates (nome, tipo, categoria, conteudo, variaveis, ativo, clinica_id)
SELECT
  'Confirmação de consulta (WhatsApp)',
  'whatsapp',
  'confirmacao_consulta',
  E'Olá, {{paciente_nome}}! ✅\n\nSua consulta está confirmada:\n\n📅 *{{data}}* às *{{horario}}*\n👨‍⚕️ {{medico_nome}}\n\nSe precisar remarcar, responda esta mensagem ou acesse: {{link_portal}}\n\n_{{clinica_nome}}_',
  ARRAY['paciente_nome','data','horario','medico_nome','link_portal','clinica_nome'],
  true, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates
   WHERE categoria = 'confirmacao_consulta' AND tipo = 'whatsapp' AND clinica_id IS NULL
);

INSERT INTO public.notification_templates (nome, tipo, categoria, conteudo, variaveis, ativo, clinica_id)
SELECT
  'Lembrete de consulta (WhatsApp)',
  'whatsapp',
  'lembrete_consulta',
  E'Olá, {{paciente_nome}}! 🔔\n\nLembrando: sua consulta é amanhã, *{{data}}* às *{{horario}}*, com {{medico_nome}}.\n\nSe não puder comparecer, avise pelo portal ou responda esta mensagem.\n\nPortal: {{link_portal}}\n\n_{{clinica_nome}}_',
  ARRAY['paciente_nome','data','horario','medico_nome','link_portal','clinica_nome'],
  true, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates
   WHERE categoria = 'lembrete_consulta' AND tipo = 'whatsapp' AND clinica_id IS NULL
);

COMMIT;

-- ============================================================================
-- CONFERIR
-- ============================================================================
-- SELECT categoria, tipo, nome, ativo, clinica_id IS NULL AS global
--   FROM notification_templates WHERE tipo = 'whatsapp'
--  ORDER BY categoria;
