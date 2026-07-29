-- ============================================================================
-- Aceitar convite estava quebrado: duas funções com os mesmos parâmetros
--
-- SINTOMA
-- Funcionários convidados criavam conta, entravam no sistema e não viam nada —
-- sem clínica, sem papel — e não apareciam na lista da equipe.
--
-- CAUSA
-- Existiam duas versões de accept_employee_invitation, com os MESMOS nomes de
-- parâmetro em ordem trocada:
--
--   accept_employee_invitation(_token text, _user_id uuid)
--   accept_employee_invitation(_user_id uuid, _token text)
--
-- O app chama por nome — .rpc('accept_employee_invitation', { _token, _user_id })
-- (src/pages/AceitarConvite.tsx) — e por nome as duas assinaturas são idênticas.
-- O PostgREST não tem como escolher e responde antes de executar qualquer coisa:
--
--   PGRST203 — Could not choose the best candidate function between:
--   public.accept_employee_invitation(_token => text, _user_id => uuid),
--   public.accept_employee_invitation(_user_id => uuid, _token => text)
--
-- Ou seja: TODO aceite de convite falhava. Dos 13 convites já enviados, só 1 foi
-- aceito — o único anterior à criação da segunda versão. A conta chegava a ser
-- criada pelo cadastro, mas o vínculo com a clínica nunca acontecia.
--
-- CORREÇÃO
-- Remove a versão antiga (_user_id, _token). A que fica é a endurecida pela
-- migration 20260727230000: resolve o destinatário pelo e-mail do convite,
-- recusa sessão de terceiro, preenche clinica_id no perfil sob a trava de C1,
-- concede os papéis do convite e cria o registro em `medicos` quando aplicável.
--
-- Nenhum código chama a versão removida — o único chamador é AceitarConvite.tsx,
-- por nome de parâmetro.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.accept_employee_invitation(_user_id uuid, _token text);

-- Sem a ambiguidade, o GRANT precisa valer para a assinatura que ficou. anon
-- precisa executar porque, com confirmação de e-mail ativa, o cadastro não
-- devolve sessão e o aceite acontece sem usuário autenticado. A função se
-- protege sozinha: confere o e-mail do convite contra a conta.
REVOKE ALL ON FUNCTION public.accept_employee_invitation(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_employee_invitation(text, uuid) TO anon, authenticated;

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
-- -- Deve sobrar exatamente UMA assinatura:
-- SELECT pg_get_function_identity_arguments(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public' AND p.proname = 'accept_employee_invitation';
--
-- -- E a chamada não pode mais devolver PGRST203. Com um token inexistente, a
-- -- resposta correta passa a ser {"success": false, "error": "Convite inválido..."}
--
-- ⚠️ ESTA MIGRATION NÃO CONSERTA QUEM JÁ FICOU PARA TRÁS
-- Contas criadas enquanto o aceite estava quebrado seguem sem clínica e sem
-- papel. Os convites continuam com status 'pending': se ainda não expiraram,
-- basta o convidado abrir o link de novo. Para os expirados, reenvie o convite.
--
-- SELECT p.email, (p.clinica_id IS NULL) AS sem_clinica,
--        i.status, (i.expires_at < now()) AS expirado
--   FROM public.profiles p
--   JOIN public.employee_invitations i ON lower(i.email) = lower(p.email)
--  WHERE p.clinica_id IS NULL;
