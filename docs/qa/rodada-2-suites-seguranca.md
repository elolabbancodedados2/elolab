# Suítes de segurança: seed de duas clínicas, asserções e gate de skip (rodada 2)

Autor: `qa-engineer`. Data: 27/10/2026. Itens: CLIN-QA-565, CLIN-QA-566 e CLIN-QA-002 (S2 e S3 do `docs/time/GATES.md`).
Base: worktree `admin-finance-realtime`, branch `feat/recepcao-painel-dia-melhorias`, sem commit.

## 1. O que mudou

| Peça | Arquivo | O que faz |
|---|---|---|
| Massa sintética (pura) | `tests/fixtures/duasClinicas.ts` | Clínicas A e B com IDs fixos, 5 perfis em A e 1 admin em B, pacientes P1, P2, P3 e P5 do plano da rodada 1, e pelo menos 1 linha **por clínica** em 15 tabelas (`TABELAS_COM_CLINICA`), mais `profiles`, `user_roles`, `registros_pendentes` e 2 planos (um ativo e um inativo). Tem a trava `exigirBancoDescartavel`, que exige loopback, `QA_SUPABASE_DISPOSABLE=ELOLAB_LOCAL_DISPOSABLE` e a service role local |
| Seed | `tests/fixtures/seed-duas-clinicas.ts` (atalho: `scripts/qa/seed-duas-clinicas.mjs`) | Cria os usuários pelo Admin API do Auth com senha aleatória a cada execução e grava os dados por upsert. Gera o token do portal com `link_portal_paciente`, confere com a service role que cada tabela tem linha nas duas clínicas e grava as variáveis `QA_*` no `$GITHUB_ENV` (com `::add-mask::`) ou em `supabase/.temp/qa-seed.env`. Nunca imprime senha, token ou chave. É idempotente |
| Modo obrigatório | `tests/fixtures/suiteSeguranca.ts` | Fora do CI, a falta de configuração pula a suíte. No CI (`CI` verdadeiro ou `QA_SECURITY_REQUIRED=1`), ela **falha**. Um job que não cobre essas suítes precisa declarar `QA_SECURITY_SUITES=fora-deste-job` |
| Gate de skip | `tests/fixtures/gateSkip.ts` (atalho: `scripts/qa/falhar-se-pulado.mjs <relatorio.json> [--sem-allowlist]`) | Falha se o relatório não existir ou estiver vazio, se alguma das 3 specs tiver 0 testes executados, se houver skip fora da allowlist ou se algum teste falhar. Allowlist comentada, com dono: `edge-stub`, `whatsapp-stub`, `evolution-indisponivel` e `app-local-564` |
| `tests/rls.spec.ts` | — | Antes de afirmar que o anônimo lê 0 linhas, confere com a service role que a tabela **tem** linhas. Update e delete anônimos miram o paciente real do seed, e a service role confere depois que nada mudou (antes miravam um ID inexistente, o que passava sem RLS nenhuma). O insert anônimo é conferido no banco. O catálogo exige ver `qa-plano-ativo` e não ver `qa-plano-inativo` |
| `tests/isolamento-entre-clinicas.spec.ts` | — | Saiu o `clinicas.size <= 1` com `.filter(Boolean)`. Em cada uma das 15 tabelas: A vê pelo menos 1 linha, **todas** as linhas de A têm `clinica_id` igual a `QA_CLINICA_A_ID` (linha com `clinica_id` nulo também conta como vazamento), B vê só B, e A busca por `id=in.(IDs de B)` e recebe 0. Teste novo que confere a clínica de cada conta. Escrita cruzada nova: A não altera, não cria em B e não apaga paciente de B. O `list_instances` deixou de fazer `return` silencioso (que contava como PASSOU) e passou a ser um skip declarado |
| `tests/perfis-rbac.spec.ts` | — | Camada de API nova: cada conta loga e tem **exatamente** o próprio papel em `user_roles`. Ela roda já na fase 1, sem depender do app. A camada de interface e o portal só rodam com `QA_APP_SUPABASE_LOCAL=1` (CLIN-QA-564); o portal também exige `QA_EDGE_STUB_CONFIRMED`. O teste do portal agora exige o nome do paciente na tela, porque antes bastava `body` não vazio |
| Unidade | `src/lib/__tests__/qaSuitesSeguranca.test.ts` | 25 casos cobrindo as travas, a massa (UUIDs, linhas por clínica, vínculos na mesma clínica e papéis), as variáveis (nomes e máscara), a serialização (recusa quebra de linha), o modo obrigatório e o gate |

## 2. Execuções reais

Máquina: Windows 11, Node `v24.22.0`, Playwright `1.62.1`, sem Docker (`docker --version` → `command not found`). Sem banco, o Playwright rodou com `QA_BASE_URL=http://127.0.0.1:9`, só para não subir o servidor do app; nenhuma requisição saiu da máquina.

| # | Comando | Resultado |
|---|---|---|
| 1 | `npx vitest run src/lib/__tests__/qaSuitesSeguranca.test.ts` | `Test Files 1 passed (1)`, `Tests 25 passed (25)` |
| 2 | `npx playwright test tests/rls.spec.ts tests/isolamento-entre-clinicas.spec.ts tests/perfis-rbac.spec.ts --reporter=json,line`, sem `CI` e sem `QA_*` (`env \| grep -c '^QA_'` → `0`) | `58 skipped`, saída `0`. Igual à rodada 1 fora do CI, como desejado |
| 3 | `node scripts/qa/falhar-se-pulado.mjs <json do #2>` | Saída `1`. `rls.spec.ts: 0 executado(s), 23 pulado(s)`; `isolamento…: 0 executado(s), 23 pulado(s)`; `perfis-rbac…: 0 executado(s), 12 pulado(s)`; três linhas `Suíte inteira sem execução`; `Gate de skip: FALHOU.` |
| 4 | O mesmo do #2 com `CI=true` | Saída `1`: `14 failed`, `44 did not run`. Mensagem: `Suíte de segurança obrigatória neste ambiente e sem configuração. Isolamento: faltam QA_SUPABASE_URL, …` |
| 5 | Gate sobre o JSON do #4 | Saída `1`, `Gate de skip: FALHOU.` |
| 6 | O mesmo do #2 com `CI=true QA_SECURITY_SUITES=fora-deste-job` | `58 skipped`, saída `0` (opt-out explícito) |
| 7 | `node scripts/qa/seed-duas-clinicas.mjs` sem variáveis | `Seed recusado: faltam QA_SUPABASE_URL, QA_SUPABASE_ANON_KEY, QA_SUPABASE_SERVICE_ROLE_KEY.`, saída `1` |
| 8 | Seed com `QA_SUPABASE_URL=https://exemplo.supabase.co` | `Seed recusado: QA_SUPABASE_URL precisa ser loopback…`, saída `1` |
| 9 | Seed em loopback sem `QA_SUPABASE_DISPOSABLE` | `Seed recusado: defina QA_SUPABASE_DISPOSABLE=ELOLAB_LOCAL_DISPOSABLE…`, saída `1` |
| 10 | Seed em `http://127.0.0.1:9` (porta sem serviço) | `fetch failed`, saída `1`; `supabase/.temp/qa-seed.env` não foi criado |
| 11 | `npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --module esnext --target es2022 --moduleResolution bundler --types node --strict --noImplicitAny false` nos 7 arquivos `.ts` tocados em `tests/` | `No errors found` (depois de corrigir 1 erro de tipo em `isolamento…:175`) |
| 12 | `npx eslint tests/fixtures tests/rls.spec.ts tests/isolamento-entre-clinicas.spec.ts tests/perfis-rbac.spec.ts scripts/qa src/lib/__tests__/qaSuitesSeguranca.test.ts` | `0 errors, 3 warnings` (`no-explicit-any`; restou 1 aviso, num trecho antigo de `isolamento…`) |
| 13 | `npx playwright test <as 3 specs> --list` | `Total: 58 tests in 3 files` (eram 41) |

**NÃO EXECUTADO:** o seed contra um Supabase local real e as 3 suítes com banco. Sem Docker nesta máquina, a primeira execução real fica para o job `security-e2e` do `devops-sre`. Até lá, S2 e S3 do gate continuam **não verificados**; o que existe é evidência E2 da lógica.

## 3. Riscos do seed (hipóteses até a primeira execução)

- As colunas obrigatórias saíram de `src/integrations/supabase/types.ts` e de migrations lidas (`lancamentos.categoria NOT NULL`, CHECK de `tipo`, `feedbacks_nps.nota` entre 1 e 10, `employee_invitations.funcionario_id NOT NULL`, CPF único por clínica). Se faltar alguma coluna ou CHECK, o seed **falha** e lista `tabela: status código | mensagem` do PostgREST; não grava em silêncio.
- O trigger `handle_new_user` (`supabase/migrations/20261010198000_checkout_provisionamento_seguro.sql`) cria uma clínica própria para quem se cadastra sem convite. O seed manda `invite_token` em `user_metadata` para seguir o caminho de convite e atribui a clínica como service role, que é permitido por `fn_guard_profile_clinica` (`20260727230000_security_fixes_c1_c4.sql:42-44`).
- Se a RLS de alguma tabela não deixar o admin de A ler as próprias linhas (por exemplo, `audit_log` restrito ao admin da plataforma), o teste de isolamento daquela tabela falha com `PRÉ-CONDIÇÃO`. Nesse caso, a decisão (tirar a tabela da lista ou corrigir a policy) é do `security-engineer`; o teste não deve ser afrouxado.

## 4. Achados

| ID | Gravidade | Resumo | Evidência | Dono |
|---|---|---|---|---|
| CLIN-QA-567 | P2 | Com esta entrega, o job `e2e-tests` atual (`npm run test:e2e` com `CI=true`, sem banco) passa a **falhar** nas 3 specs. É intencional (antes ficava verde sem testar), mas bloqueia merge até o workflow declarar `QA_SECURITY_SUITES=fora-deste-job` nesse job, ou ignorar as 3 specs nele, e o `security-e2e` existir | Execução #4 | `devops-sre` |
| CLIN-QA-568 | P3 | Os casos de CPF duplicado do plano (B7 e C7, P4a/P4b) não têm como ser semeados: o índice `pacientes_cpf_por_clinica` (`20260815150000_cpf_unico_por_clinica_e_sem_mascara.sql:100-101`) impede. Os ramos `cpf_duplicado` das edges só valem para dados legados. Fica registrado para o PO decidir se os casos saem do plano | Leitura | `product-owner` + `backend-developer` |
| CLIN-QA-563 | P1 (continua) | Prefixo `20261010198000` ainda duplicado (`ls supabase/migrations \| awk -F_ '{print $1}' \| sort \| uniq -d` → `20261010198000`). Pode quebrar o `db reset` do job | Comando | `database-engineer` |
| CLIN-QA-564 | P1 (continua) | `vite.config.ts:152` continua com `createViteTestSupabaseDefine({})`. A interface do RBAC e o portal ficam em skip na allowlist `app-local-564` | Leitura | `tech-lead` |

## 5. Como o job deve usar (para o `devops-sre`)

1. `supabase start`, depois `supabase db reset` e a exportação de `QA_SUPABASE_URL`, `QA_SUPABASE_ANON_KEY` e `QA_SUPABASE_SERVICE_ROLE_KEY`, com `QA_SUPABASE_DISPOSABLE=ELOLAB_LOCAL_DISPOSABLE`.
2. `node scripts/qa/seed-duas-clinicas.mjs`, que grava o restante das `QA_*` no `$GITHUB_ENV`.
3. `PLAYWRIGHT_JSON_OUTPUT_NAME=seguranca.json npx playwright test tests/rls.spec.ts tests/isolamento-entre-clinicas.spec.ts tests/perfis-rbac.spec.ts --reporter=json,line`. Com `CI=true`, configuração ausente já falha.
4. `node scripts/qa/falhar-se-pulado.mjs seguranca.json`. Quando os stubs e a CLIN-QA-564 estiverem resolvidos, troque por `--sem-allowlist`.
5. No job `e2e-tests` atual, declare `QA_SECURITY_SUITES: fora-deste-job` (CLIN-QA-567).

Para provar o S3 (CA4 da CLIN-QA-510), abra um PR de prova que remova uma policy de `prontuarios`: `A enxerga somente sua clínica em prontuarios` precisa ficar vermelho.

## 6. Jornadas

| Jornada | Status |
|---|---|
| Isolamento entre clínicas (REST) | NÃO EXECUTADO (sem banco; lógica e gate testados em unidade) |
| RBAC por perfil (API) | NÃO EXECUTADO |
| RBAC pela interface e portal | NÃO EXECUTADO (bloqueado pela CLIN-QA-564) |
| Demais jornadas críticas | Fora do escopo; seguem NÃO EXECUTADO |
