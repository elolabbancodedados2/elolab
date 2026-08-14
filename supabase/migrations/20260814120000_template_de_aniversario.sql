-- ============================================================================
-- Template de e-mail de aniversário
--
-- A automação `birthday-greetings` busca um template com
-- `categoria = 'aniversario'` e `tipo = 'email'`, e lança
-- "Template de aniversário não encontrado" quando não acha.
--
-- Esse template nunca existiu: a migration 20260423191445 liberou 'aniversario'
-- no CHECK da coluna, mas o seed que veio junto só inseriu confirmação de
-- consulta, resultado de exame e recibo de pagamento. Resultado: a automação de
-- aniversário falhava em toda execução, para todas as clínicas, desde sempre.
--
-- Verificado em produção antes desta migration: nenhuma linha com
-- categoria='aniversario'.
--
-- `clinica_id` fica nulo de propósito — é o template padrão da plataforma, que
-- a função usa quando a clínica não tem um próprio. A tela de Templates permite
-- que cada clínica crie a sua versão.
--
-- As variáveis são as que a função substitui: {{paciente_nome}} e
-- {{clinica_nome}}. Qualquer outra sai literal no e-mail.
-- ============================================================================

BEGIN;

INSERT INTO public.notification_templates
  (categoria, tipo, nome, assunto, conteudo, variaveis, ativo, clinica_id)
SELECT
  'aniversario',
  'email',
  'Feliz Aniversário',
  'Feliz aniversário, {{paciente_nome}}!',
  '<div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
    <div style="background: linear-gradient(135deg, #0ea5e9, #0369a1); color: #ffffff; padding: 32px 24px; border-radius: 12px; text-align: center;">
      <h1 style="margin: 0; font-size: 24px;">Feliz aniversário!</h1>
    </div>

    <div style="padding: 28px 8px; color: #1f2937; line-height: 1.6;">
      <p style="font-size: 16px; margin-top: 0;">Olá, <strong>{{paciente_nome}}</strong>!</p>

      <p>Toda a equipe da <strong>{{clinica_nome}}</strong> deseja um feliz aniversário e um ano de muita saúde.</p>

      <p>Obrigado pela confiança em cuidar de você. Estamos por aqui sempre que precisar.</p>

      <p style="margin-bottom: 0;">Um abraço,<br><strong>{{clinica_nome}}</strong></p>
    </div>

    <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; color: #6b7280; font-size: 12px; text-align: center;">
      <p style="margin: 0;">Você recebeu este e-mail porque é paciente da {{clinica_nome}}.</p>
    </div>
  </div>',
  ARRAY['paciente_nome', 'clinica_nome']::text[],
  true,
  NULL
WHERE NOT EXISTS (
  -- Idempotente: se alguém já criou o template padrão, não duplica.
  SELECT 1 FROM public.notification_templates
   WHERE categoria = 'aniversario' AND tipo = 'email' AND clinica_id IS NULL
);

COMMIT;

-- ============================================================================
-- CONFERIR DEPOIS DE APLICAR
-- ============================================================================
-- SELECT categoria, tipo, nome, ativo, clinica_id
--   FROM public.notification_templates
--  WHERE categoria = 'aniversario';
