-- ============================================================================
-- Vincula fichas de funcionário às contas que já existem
--
-- Enquanto os dois sistemas de convite conviviam, o caminho que criava a conta
-- não preenchia funcionarios.user_id. Resultado: a pessoa entra no sistema, mas
-- a ficha dela fica órfã — não aparece em nada que dependa de conta, e a equipe
-- parece menor do que é.
--
-- A unificação (accept-invite agora vincula) resolve daqui para frente. Não
-- retroage sozinha: esta migration alcança quem ficou para trás.
--
-- CRITÉRIO CONSERVADOR: casa por e-mail DENTRO DA MESMA CLÍNICA, e só quando
-- existe exatamente UMA conta candidata. Ficha com duas contas possíveis, ou
-- com conta em outra clínica, fica como está — vincular a pessoa errada dá a
-- ela acesso ao prontuário de pacientes que não são dela.
--
-- Fora do alcance por isso mesmo, e listados no rodapé para tratamento manual:
--   MARIA APARECIDA      ficha na "Clínica cristiane", conta na "Clínica teste"
--   MARIA ELISA (x2)     duas fichas para o mesmo e-mail, nenhuma conta
--   MARCOS ROGERIO       convite nunca aceito, conta não existe
-- ============================================================================

BEGIN;

UPDATE public.funcionarios f
   SET user_id = p.id,
       updated_at = now()
  FROM public.profiles p
 WHERE f.user_id IS NULL
   AND lower(p.email) = lower(f.email)
   AND p.clinica_id = f.clinica_id
   -- Uma única conta candidata para esta ficha...
   AND (SELECT count(*) FROM public.profiles p2
         WHERE lower(p2.email) = lower(f.email) AND p2.clinica_id = f.clinica_id) = 1
   -- ...e essa conta ainda não pertence a outra ficha.
   AND NOT EXISTS (SELECT 1 FROM public.funcionarios f2 WHERE f2.user_id = p.id);

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
-- Quem continua sem vínculo, e por quê:
--
-- SELECT f.nome, f.email, c.nome AS clinica,
--        (SELECT count(*) FROM public.profiles p
--          WHERE lower(p.email) = lower(f.email) AND p.clinica_id = f.clinica_id)
--          AS contas_que_casam
--   FROM public.funcionarios f
--   LEFT JOIN public.clinicas c ON c.id = f.clinica_id
--  WHERE f.user_id IS NULL
--  ORDER BY c.nome, f.nome;
--
-- contas_que_casam = 0 significa que a pessoa nunca aceitou o convite. O
-- caminho é convidar de novo pela tela de Funcionários, não mexer aqui.
