# MFA exigido no servidor (CLIN-QA-304)

- Migration local: `supabase/migrations/20261029110000_mfa_obrigatorio_servidor.sql` (não aplicada).
- Teste: `docs/arquitetura/banco/testes/teste-mfa-servidor.mjs` (PGlite, dados sintéticos).
- Frontend: `src/components/MFAObrigatorio.ts` e `src/pages/Auth.tsx`.

## Problema

O TOTP só era pedido pela tela (`Auth.tsx`). Com a senha, o usuário recebe um JWT AAL1. Esse token já aceitava qualquer chamada direta ao PostgREST, mesmo de contas com 2FA ativo e de administradores da plataforma.

## Helpers (reutilizáveis)

Todas `STABLE SECURITY DEFINER SET search_path = ''`, com `REVOKE ALL FROM PUBLIC, anon` e `GRANT` para `authenticated` e `service_role`.

| Helper | Retorno |
|---|---|
| `sessao_aal2()` | `auth.jwt() ->> 'aal' = 'aal2'` |
| `perfil_exige_mfa()` | usuário logado é plataforma ativa ou tem papel `admin` ou `financeiro` |
| `mfa_satisfeito()` | AAL2; ou nenhum fator verificado e a política não obriga o perfil. Sem usuário: false |
| `mfa_exigido_para_mim()` | política ligada e `perfil_exige_mfa()`; usado pela tela de login |
| `exigir_mfa()` | levanta `42501` com `HINT = 'mfa_necessario'` quando há usuário e `mfa_satisfeito()` é false |

Uso numa RPC nova: `PERFORM public.exigir_mfa();` no início do corpo.

## Onde é exigido

| Ponto | Mecanismo | Cobre |
|---|---|---|
| `user_roles` (INSERT, UPDATE, DELETE) | trigger por instrução | troca de papel, `sync_employee_roles`, exclusão de funcionário |
| `platform_admins` (todas as escritas) | trigger | gestão de administradores da plataforma |
| `platform_impersonation_log` (INSERT) | trigger | início de impersonação |
| `lgpd_deletion_log` (INSERT) | trigger | exclusão e anonimização LGPD (auditoria, item 579) |
| `employee_invitations` (INSERT, DELETE) | trigger | criar e cancelar convite. UPDATE fica fora porque o convidado atualiza o status ao aceitar |
| `politica_mfa` (UPDATE) | trigger | a própria política |
| `is_platform_admin()` | mesma assinatura; agora `AND mfa_satisfeito()` | todas as RPCs `platform_*` e as policies da plataforma |

Os triggers também valem dentro de RPCs `SECURITY DEFINER`, porque disparam na escrita da tabela. Chamadas sem usuário no JWT (`service_role`, GoTrue, migrations e cron) não são afetadas.

## Política e ativação

`public.politica_mfa` tem uma linha só e é global da plataforma, por isso não tem `clinica_id`. Esta é uma exceção consciente à regra de tenant. A leitura vale para `authenticated` e a alteração só para a plataforma.

- **Desligada (padrão):** só contas **com fator verificado** precisam de AAL2. Os apps web e móvel já pedem o TOTP no login, então nada muda para quem usa o app. O que deixa de funcionar é o atalho da API.
- **Ligada:** plataforma, `admin` e `financeiro` sem fator também são negados nas operações acima. No login, o `Auth.tsx` abre o cadastro do 2FA. Se o usuário fechar o diálogo, a sessão é encerrada.
- Para ligar, quem liga precisa estar em sessão AAL2 (trigger), para que um administrador sem fator não se tranque para fora. O comando é `UPDATE public.politica_mfa SET exigir_perfis_privilegiados = true;`. Em emergência, use `service_role` ou psql com `false`.

## Riscos e limites

- **Edge functions que escrevem com `service_role`** (`accept-invite`, `invite-employee`, `admin-contas`) não passam pelos triggers. Elas precisam conferir o claim `aal` do JWT de quem chama. Fica pendente para o backend.
- **Política ligada.** Uma RPC que dá papel `admin` ao próprio usuário e depois grava outra tabela coberta na mesma transação será negada para quem ainda está em AAL1. O onboarding de clínica nova e o aceite de convite precisam ser testados antes de ligar. `NÃO VERIFICADO`.
- **Plataforma com fator em AAL1.** Nesse estado, `is_platform_admin()` passa a ser false: o painel some e `platform_stop_impersonation` é negado. Pelo app isso não acontece, porque o login eleva a sessão a AAL2.
- **Custo.** `is_platform_admin()` agora consulta `auth.mfa_factors` quando a sessão não está em AAL2. Nas policies novas, use `(SELECT public.is_platform_admin())`. O impacto nas policies antigas não foi medido. `NÃO VERIFICADO` com `EXPLAIN`.
- **`lancamentos` e `pagamentos_mercadopago` ficaram fora.** A regra do time proíbe mexer nelas, e o perfil financeiro é coberto no login quando a política está ligada. Exigir MFA para escrever nessas tabelas depende de decisão do responsável.

## Reversão

Bloco no cabeçalho da migration. Ele restaura o corpo anterior de `is_platform_admin()` e remove triggers, helpers e a tabela de política.
