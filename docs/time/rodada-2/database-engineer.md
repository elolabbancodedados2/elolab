# Rodada 2: database-engineer

Tarefa: resolver as 3 ressalvas da auditoria de segurança (`docs/seguranca/auditoria-rodada-1.md:171-187`) na migration `20261028090000_revogar_anon_e_privilegios_padrao.sql` e documentar o tratamento da versão duplicada `20261010198000`. Nada foi aplicado em banco algum. Não houve commit, deploy nem acesso à VPS.

## O que fiz

### Ressalva 1: policies `TO public` que chamam helper revogada
- **Levantamento das tabelas lidas antes do login.** Percorri os imports a partir das rotas públicas (`src/App.tsx:208-235`) com um script descartável. A única tabela lida por anon é `public.planos`, na landing (`src/hooks/useSubscriptionPlan.ts:29`). As outras telas públicas usam as RPCs da allowlist ou edge functions com service_role. Pelas migrations, as policies de `planos` não chamam função para anon: `planos_public_select` é `TO anon, authenticated USING (ativo = true)` (`20260730050000_pagina_de_precos_quebrada_para_visitante.sql:48-50`), e `planos_platform_admin` é `TO authenticated` (`20260727230000_security_fixes_c1_c4.sql:341-344`).
- **Trava na migration (`:497-559`, verificação 4c).** Ela olha o banco real, não o repositório, porque pode haver drift. Se alguma policy de SELECT que vale para anon (`TO public` ou `TO anon`) em `v_tabelas_publicas` chamar função sem `EXECUTE` para anon, a transação aborta e a mensagem cita a tabela, a policy e a função. A checagem usa `pg_depend` da policy para `pg_proc`.
- **NOTICE informativo.** A migration lista as tabelas em que um SELECT anônimo passa a receber `42501` em vez de vazio, para o aviso de mudança.

### Ressalva 2: authenticated mantinha as funções de cron (SEC-R1-05)
- **Passo 2b (`:352-408`).** Tira `EXECUTE` de PUBLIC, anon e authenticated das 9 funções agendadas no pg_cron e concede a service_role. As 9 saíram de `grep -A3 cron.schedule` nas migrations: `verificar_saude_clinicas_e_alertar`, `watchdog_atendimento_travado`, `enfileirar_lembretes_retorno`, `expirar_ofertas_lista_espera`, `expire_trials`, `limpar_rate_limit_antigos`, `atualizar_predicoes_no_show`, `expirar_planos_pre_pagos` e `limpar_logs_antigos`. Nenhuma é chamada pelo front nem pelas edge functions: a busca em `src/` e `supabase/functions/` só as encontra em `src/integrations/supabase/types.ts`.
- **Papel do job do cron.** Se `cron.job` roda com um papel que não é o dono e que só executava a função via PUBLIC, esse papel recebe `GRANT` explícito. Sem leitura de `cron.job`, a migration só avisa. **Achado:** a versão da rodada 1 já quebrava esse caso, porque o passo 2 revogava PUBLIC (teste de mutação abaixo).
- **Verificação 4b (`:467-495`).** Aborta se sobrar anon ou authenticated nessas funções.
- **Reversão** documentada no cabeçalho (`:75-77`).
- **O que não mudou.** O privilégio padrão de funções futuras continua concedendo a authenticated (`:410-433`). Retirá-lo quebraria as RPCs novas que dependem do `GRANT` implícito. Por isso, função nova de cron precisa do `REVOKE` explícito e de entrar na lista, como está escrito no comentário do passo 2b.

### Ressalva 3: a recusa dependia de `request.jwt.claims`
- **Papel da sessão nas duas RPCs.** `link_portal_paciente` (`:106-123`) e `platform_get_clinicas_saude` (`:198-216`) passam a ler também `current_setting('role')`. O PostgREST define esse parâmetro em toda requisição (SET ROLE), e `SECURITY DEFINER` troca o `current_user` sem alterá-lo.
- **Nova regra sem usuário.** Só passa se nem o JWT nem o papel da sessão indicarem papel diferente de `service_role`. Trigger, pg_cron e SQL interno (`role = none`) continuam passando. Uma chamada com `SET ROLE anon` ou `authenticated` e sem claims passa a ser recusada.
- **Premissa que continua aberta.** A forma como o PostgREST da VPS troca o papel não foi verificada. O teste de aceite em homologação continua: chamar com a chave anon e esperar `42501`.

### Versão duplicada `20261010198000`
Documentei em `docs/arquitetura/banco/versoes-duplicadas.md`:
- o efeito real na CLI, conferido no código oficial: `db reset` e `db push` quebram hoje;
- qual arquivo pode ser renomeado: `checkout_provisionamento_seguro` **não pode ser reaplicado**, porque faz `UPDATE planos SET trial_dias` (`:222`), e `mercadopago_oauth_clinicas` é idempotente;
- a leitura somente leitura que decide o caso;
- a tabela de decisão A a D, o `git mv` para `20261010198500` e o `migration repair` da nova versão.

Não renomeei nada: a decisão depende da tabela de histórico da VPS.

## Arquivos tocados
- `supabase/migrations/20261028090000_revogar_anon_e_privilegios_padrao.sql` (editado; o arquivo não está commitado, `git status` = `??`)
- `docs/arquitetura/banco/versoes-duplicadas.md` (novo)
- `docs/arquitetura/banco/testes/teste-revogar-anon.mjs` (novo; teste PGlite, ampliado de 30 para 63 casos)
- `docs/arquitetura/banco/testes/versao-duplicada.mjs` (novo)
- `docs/time/rodada-2/database-engineer.md` (este arquivo)

## Evidências (E2, PGlite 0.3.15 fora do repositório, dados sintéticos)

- **`node teste-revogar-anon.mjs supabase/migrations/20261028090000_revogar_anon_e_privilegios_padrao.sql`**: **63 de 63 OK**, "Todos os casos passaram" e exit 0. Além dos 30 casos da rodada 1, cobre:
  - R3: `SET ROLE anon` sem JWT, com `EXECUTE` concedido só na transação de teste, recebe `42501` nas duas RPCs; `SET ROLE authenticated` sem JWT recebe `42501`; service_role sem JWT passa; o cron aninhado (`verificar_saude_clinicas_e_alertar` chamando `platform_get_clinicas_saude`) continua funcionando; sessão interna tem `role = none`.
  - R2: antes da migration, um usuário logado disparava o job. Depois, as 7 funções de cron presentes no teste ficam sem anon e sem authenticated, com service_role mantido; o usuário logado recebe `42501`; o papel do job que não é o dono (`cron_runner`) mantém `EXECUTE` só na função do próprio job; service_role chama manualmente.
  - R1: anon lê só o plano ativo antes e depois; o usuário da clínica lê os planos; `pacientes` (policy `TO public` com helper) devolve `42501` para anon e aparece no NOTICE; o usuário da mesma clínica vê só o próprio paciente; `pg_depend` registra a dependência policy→função. Num segundo banco com a policy `planos_select USING (is_platform_admin() OR ativo)` sem `TO`, a migration **aborta** citando a policy e a função, sem efeito parcial, e a landing continua funcionando.
- **Testes de mutação** (cada correção removida por script, mesmo teste):

  | Correção removida | Resultado |
  |---|---|
  | R3 | 3 falhas: anon e authenticated sem JWT passam a ser aceitos |
  | R2 | 8 falhas, incluindo "papel do job do cron (não dono) mantém EXECUTE" |
  | R1 | 3 falhas: a migration não aborta e a landing quebra com `42501` |

  Os testes detectam cada regressão.
- **NOTICEs da aplicação no banco de teste:** 11 funções revogadas de anon; `EXECUTE mantido para o papel do job do cron: cron_runner`; aviso de funções de cron ausentes; `tabelas em que SELECT anônimo passa a responder 42501 em vez de vazio: pacientes`.
- **`node versao-duplicada.mjs supabase/migrations`**: o segundo INSERT no histórico falha com `23505 schema_migrations_pkey`; 456 arquivos para 455 versões; `db push` recusa "Found local migration files to be inserted before the last migration on remote database" mesmo com o histórico completo; depois do renome mais o repair, só aparecem as pendências reais (saída completa em `versoes-duplicadas.md`, seção 2).
- **Fonte da CLI:** `gh api repos/supabase/cli/contents/apps/cli-go/pkg/migration/history.go` (linhas 15 e 18) e `.../apply.go` (linhas 21-54), lidos em 27/10/2026.
- **Não rodei** tsc nem vitest, porque nenhum arquivo TS foi tocado.

## Pendências
1. **NÃO VERIFICADO na VPS:** a lista real de funções anon (C1), os papéis dos jobs em `cron.job` (consulta 8.1) e as policies das consultas 4.1 e 4.2. A trava 4c protege `planos`. Se a C1 mostrar outra tabela lida por anon, ela entra em `v_tabelas_publicas` antes da aplicação.
2. Ressalva 3: confirmar `42501` com a chave anon em homologação.
3. Versão duplicada: leitura do passo 1, depois renome (database-engineer), depois `migration repair` (responsável). Detalhes em `versoes-duplicadas.md` §6.
4. Nota menor da auditoria (`ALTER DEFAULT PRIVILEGES ... FROM PUBLIC` global): continua como comportamento desejado e precisa constar no aviso de mudança. Não houve alteração.
5. Os scripts `.mjs` ficam em `docs/` porque o repositório não tem dependência de PGlite nem pgTAP. Adotá-los no job `security-e2e` cabe ao qa-engineer e ao devops-sre.

## Próximo dono
- **security-engineer:** revisar o diff das ressalvas na migration.
- **Responsável:** executar C1, a 8.1 e o passo 1 de `versoes-duplicadas.md`; aprovar a aplicação com backup.
- **devops-sre:** checagem de prefixo único no CI, que hoje quebra o `supabase start` do job `security-e2e`.
