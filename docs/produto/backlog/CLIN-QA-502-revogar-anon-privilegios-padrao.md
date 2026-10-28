# CLIN-QA-502: Revogar EXECUTE de anon e PUBLIC, com privilégios padrão e allowlist explícita

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-001 (301, 302, 303, 313, 203; resíduo no 036) |
| Gravidade | P0 |
| Impacto | Segurança e clínico. Fecha a porta das RPCs `SECURITY DEFINER` chamadas sem login |
| Perfil | Visitante não autenticado; paciente no portal; equipe da clínica |
| Esforço | S |
| Dono sugerido | `database-engineer` (migration local); `security-engineer` (revisão) |
| Dependências | CLIN-QA-501 para fechar a allowlist; backup verificado (CLIN-QA-509) e autorização do responsável para aplicar |
| Status | Aguardando aplicação (27/10, após a rodada 2) |

## Contexto
O privilégio padrão concede `EXECUTE` em funções novas a `PUBLIC`/`anon`. A revogação em massa de 28/07 (`20260728041952…sql:4-29`) não cobre as funções criadas depois.

## Evidência
- Diagnóstico D.1 #1 e #2; `supabase/migrations/20261011010000_portal_paciente_scoped_links.sql:17-35,60-61`.
- Nenhum `ALTER DEFAULT PRIVILEGES` em `supabase/migrations/` (D.1 #1).

## Proposta
Uma migration com `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM anon, public`, revogação em massa nas funções `prosecdef` do schema `public`, `GRANT` explícito só para a allowlist (documentada no próprio arquivo) e comentário de reversão. A forma técnica é decisão do DBA.

## Critérios de aceite
- **CA1 (caminho principal).** Dada a migration aplicada num banco local (`supabase db reset`), quando se roda `select proname from pg_proc where prosecdef and has_function_privilege('anon', oid, 'execute')`, então o resultado é exatamente a allowlist documentada.
- **CA2 (função futura).** Dada uma função `SECURITY DEFINER` criada depois da migration, quando se consulta `has_function_privilege('anon', …)`, então o resultado é `false`.
- **CA3 (permissão negada).** Dado um cliente só com a anon key, quando chama `POST /rest/v1/rpc/<função fora da allowlist>`, então recebe erro de permissão (`42501`) e nenhuma linha é lida ou gravada.
- **CA4 (outra clínica).** Dado um usuário autenticado da clínica A, quando chama uma RPC concedida a `authenticated` passando identificador da clínica B, então não recebe dado da B (caso coberto pela suíte da CLIN-QA-511).
- **CA5 (público legítimo preservado).** Dadas as funções da allowlist (agendamento público, portal por token, checkout, conforme o inventário), quando chamadas como anon, então continuam funcionando, e `tests/agendamento-online.spec.ts` passa.
- **CA6 (erro traduzido).** Dado que a tela recebe `42501`, quando o erro chega ao usuário, então aparece a mensagem de `src/lib/erros.ts`, sem texto técnico.
- **CA7 (reversão).** O comentário de reversão foi testado localmente: aplica, reverte e aplica de novo sem erro.

## Definição de pronto
DoD comum, mais: teste automatizado (pgTAP ou spec com banco local) que falha se surgir função executável por anon fora da allowlist; revisão do `security-engineer` registrada; aplicação em produção só com autorização e backup.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **testado localmente (E2)**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- Migration `supabase/migrations/20261028090000_revogar_anon_e_privilegios_padrao.sql`, com as três ressalvas da auditoria da rodada 1 resolvidas pelo database-engineer na rodada 2: trava de policy anônima que chama função revogada (`:497-559`), funções de cron fora de anon e authenticated (`:352-408`) e papel da sessão nas RPCs.
- Reexecutado pelo PO em 27/10: `node teste-revogar-anon.mjs supabase/migrations/20261028090000_...sql` (PGlite 0.3.15, fora do repositório) → 63 linhas `OK`, 0 falhas, saída 0.
- O tech-lead aprovou R3 e o passo 2b na revisão (`docs/time/rodada-2/tech-lead.md`, seção 2). Ressalvas abertas: TL-R2-08 (P2, o privilégio padrão concede funções futuras a authenticated), TL-R2-09 e TL-R2-10 (P3).

### O que falta
- Saída de C1 (501) para confirmar a allowlist e as tabelas lidas por anon.
- Revisão do diff das ressalvas pelo security-engineer.
- Backup, aplicação aprovada pelo responsável e chamada anon com `42501` em homologação.

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
