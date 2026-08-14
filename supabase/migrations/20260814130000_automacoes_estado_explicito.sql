-- ============================================================================
-- Automação: estado explícito para toda clínica
--
-- A TELA E O BANCO DISCORDAVAM
--
-- Sem linha em `automation_settings`, os dois lados decidiam sozinhos — e
-- decidiam coisas OPOSTAS:
--
--   tela     src/pages/Automacoes.tsx  ->  `setting?.ativo ?? false`   = DESLIGADO
--   backend  isAutomationActive(...)   ->  `?.ativo !== false`         = LIGADO
--
-- Resultado: das 12 clínicas em produção, 10 não tinham nenhuma linha. A tela
-- mostrava tudo desligado enquanto o sistema mandava e-mail de aniversário e
-- lembrete de consulta para os pacientes delas. A clínica não tinha como saber.
--
-- POR QUE LIGADO, E NÃO DESLIGADO
--
-- O comportamento que está em produção hoje é o do backend: as automações
-- rodam. Semear como `false` desligaria de uma vez o lembrete de consulta de 10
-- clínicas — e paciente que deixa de receber lembrete falta. Preservamos o
-- comportamento atual e tornamos o estado visível; desligar passa a ser uma
-- escolha da clínica, feita na tela.
--
-- O TRIGGER
--
-- Sem ele o problema volta na próxima clínica cadastrada. Toda clínica nova
-- nasce com as 8 automações explícitas.
-- ============================================================================

BEGIN;

-- Catálogo das automações que a tela oferece. Mantido aqui e em
-- src/pages/Automacoes.tsx (AUTOMATIONS) — se divergirem, a tela é a verdade
-- para o usuário e esta lista para o estado inicial.
CREATE OR REPLACE FUNCTION public.automacoes_padrao()
RETURNS TABLE (chave text, descricao text)
LANGUAGE sql
IMMUTABLE
AS $$
  VALUES
    ('lembrete_consulta_24h',        'Lembrete de consulta 24 horas antes'),
    ('lembrete_consulta_2h',         'Lembrete de consulta 2 horas antes'),
    ('confirmacao_agendamento',      'Confirmação no momento do agendamento'),
    ('notificacao_resultado_exame',  'Aviso quando o resultado do exame é liberado'),
    ('recibo_pagamento',             'Recibo enviado após o pagamento'),
    ('aniversariantes',              'Mensagem de aniversário para o paciente'),
    ('alerta_estoque_critico',       'Alerta interno de estoque abaixo do mínimo'),
    ('faturamento_automatico',       'Cobrança gerada automaticamente no atendimento');
$$;

COMMENT ON FUNCTION public.automacoes_padrao() IS
  'Catálogo das automações oferecidas na tela. Usado para dar estado inicial explícito a cada clínica.';

-- ─── Clínicas que já existem ────────────────────────────────────────────────
INSERT INTO public.automation_settings (clinica_id, chave, descricao, valor, ativo)
SELECT c.id, a.chave, a.descricao, '{}'::jsonb, true
  FROM public.clinicas c
 CROSS JOIN public.automacoes_padrao() a
ON CONFLICT (clinica_id, chave) DO NOTHING;

-- ─── Clínicas futuras ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.semear_automacoes_da_clinica()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.automation_settings (clinica_id, chave, descricao, valor, ativo)
  SELECT NEW.id, a.chave, a.descricao, '{}'::jsonb, true
    FROM public.automacoes_padrao() a
  ON CONFLICT (clinica_id, chave) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clinica_nasce_com_automacoes ON public.clinicas;

CREATE TRIGGER clinica_nasce_com_automacoes
  AFTER INSERT ON public.clinicas
  FOR EACH ROW
  EXECUTE FUNCTION public.semear_automacoes_da_clinica();

COMMIT;

-- ============================================================================
-- CONFERIR DEPOIS DE APLICAR
-- ============================================================================
-- Toda clínica deve ter 8 linhas:
--
-- SELECT c.nome, count(s.id) AS automacoes
--   FROM public.clinicas c
--   LEFT JOIN public.automation_settings s ON s.clinica_id = c.id
--  GROUP BY c.nome
--  ORDER BY automacoes;
