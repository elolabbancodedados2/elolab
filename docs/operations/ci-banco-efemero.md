# CI com banco efêmero: RLS, isolamento e RBAC contra Supabase local

Dono: DevOps/SRE (workflow e gate de skip), com QA (seed e specs) e DBA (migrations do zero). Itens: CLIN-QA-002 (P0), 563, 564, 565, 566; ação 30.1; critério S2 de `docs/time/GATES.md`.

| Versão | Data | O que mudou |
|---|---|---|
| 1 | 27/10/2026 (rodada 1) | Proposta e rascunho de YAML |
| 2 | 27/10/2026 (rodada 2) | Job `security-e2e` escrito em `.github/workflows/test.yml`, gate de skip com teste, seed do QA ligado, `supabase link` com o projeto Cloud removido |
| 3 | 27/10/2026 (esteira E03) | Portal do paciente ligado no job: `QA_PORTAL_EDGE_LOCAL=ELOLAB_LOCAL_PORTAL` e passo "Conferir patient-portal servida" (seção 3, passo 5a; bloqueio B9) |

**Estado:** escrito e validado localmente (actionlint, ShellCheck, teste do gate, relatório real do Playwright). **Nunca rodou no GitHub Actions** (sem commit nesta rodada). A primeira execução deve falhar no passo "Versões de migration únicas" até a versão `20261010198000` ser resolvida (seção 5, B1). Isso é esperado e é o comportamento correto.

## 1. Problema que o job resolve

| Fato | Evidência |
|---|---|
| As três suítes de segurança pulam sem `QA_*` e o Playwright sai com 0 | Reproduzido nesta rodada: `npx playwright test tests/rls.spec.ts --reporter=json` sem `QA_*` → `"expected":0,"skipped":23`, código 0 |
| O CI não subia banco nem definia `QA_*` | versão anterior de `.github/workflows/test.yml` (env no nível do workflow só com `CLINICA_*`, `E2E_*`, `VITE_*`) |
| O único passo de banco fazia `supabase link` com um projeto Cloud que não é a produção | versão anterior de `test.yml`, passo "Supabase database lint" (`gebygucrpipaufrlyqqj`) |
| Os secrets estavam no nível do workflow e vazavam para todos os jobs | idem |

## 2. O que mudou em `.github/workflows/test.yml`

- **Job novo `security-e2e`**, independente dos outros (roda em paralelo).
- **`static-checks`:** saiu o passo `supabase link --project-ref gebygucrpipaufrlyqqj && supabase db lint --linked`. O lint do banco agora roda no `security-e2e`, com `--local`. O `SUPABASE_ACCESS_TOKEN` deixou de ser usado pelo workflow.
- **`unit-tests`:** passo `node --test scripts/ci/falhar-se-pulado.test.mjs` (testa o gate).
- **`e2e-tests`:** os secrets passaram do nível do workflow para o `env` deste job, o único que os lê (`producao-smoke`, `qa-real-user`). O job agora roda uma lista explícita de specs **sem** `rls`, `isolamento-entre-clinicas` e `perfis-rbac`, que só pulavam ali. O comentário falso ("a spec lê a chave do client.ts") foi removido.
- `permissions: contents: read` no workflow.

## 3. Passos do `security-e2e`

| # | Passo | Falha quando |
|---|---|---|
| 1 | Versões de migration únicas (14 primeiros caracteres) | há prefixo repetido. Roda antes de baixar imagens, porque a CLI grava cada versão com `INSERT` simples em `supabase_migrations.schema_migrations (version text PRIMARY KEY)` e pararia na segunda (fonte: `supabase/cli`, `apps/cli-go/pkg/migration/history.go:15,18` e `file.go:127`) |
| 2 | `npm ci` e `supabase/setup-cli@v3` com a CLI **2.122.0** (última estável em 23/10/2026) | — |
| 3 | `supabase start -x studio,imgproxy,mailpit,postgres-meta,logflare,vector,supavisor` | alguma migration não aplica a partir do zero (B2). Ficam no ar Postgres, Auth, PostgREST, Kong, Storage, Realtime e Edge Runtime. O Edge Runtime **não** pode ser excluído: ele serve `supabase/functions`, inclusive a `patient-portal` |
| 4 | `supabase status -o env --override-name …` → `QA_SUPABASE_URL`, `QA_SUPABASE_ANON_KEY`, `QA_SUPABASE_SERVICE_ROLE_KEY`, `QA_DB_URL` no `GITHUB_ENV`, com `::add-mask::` | a CLI não devolve as 4 variáveis |
| 5 | Conferir loopback | URL diferente de `http://127.0.0.1:54321` ou banco fora de `127.0.0.1` |
| 5a | Conferir patient-portal servida: `node scripts/qa/conferir-portal-local.mjs`, até 3 tentativas com 10 s entre elas (a primeira chamada compila a função) | a função não responde 401 com `{ error }` a um token inválido. O motivo sai legível (404 não servida, 429 rate limit, 5xx boot) e o passo imprime as últimas 80 linhas do log do Edge Runtime |
| 6 | `supabase db lint --local --level warning` | **informativo** por ora (sem `--fail-on`) |
| 7 | `node tests/fixtures/seed-duas-clinicas.ts` (qa-engineer) | o seed recusa o ambiente ou alguma tabela fica sem linha numa das clínicas |
| 8 | `scripts/ci/security-e2e-conferir-env.sh` | falta alguma das 18 `QA_*` que as specs leem; lista os nomes, nunca os valores |
| 9 | Playwright nas três specs, `--reporter=list,json,html` | teste falhou |
| 10 | `scripts/ci/falhar-se-pulado.mjs` (roda mesmo se o passo 9 falhar) | ver seção 4 |
| 11 | Upload de `seguranca.json` e `playwright-report/` em caso de falha (7 dias) | — |

### Variáveis de ambiente do job

| Variável | Valor | Efeito |
|---|---|---|
| `QA_SUPABASE_DISPOSABLE` | `ELOLAB_LOCAL_DISPOSABLE` | o seed aceita gravar no banco (só em loopback) |
| `QA_PORTAL_EDGE_LOCAL` | `ELOLAB_LOCAL_PORTAL` | liga os 2 testes do portal em `tests/perfis-rbac.spec.ts` (`tests/fixtures/portalEdge.ts`, E02). A `patient-portal` só usa o banco local (`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, injetadas pelo Edge Runtime da CLI), sem integração externa. Sem a variável, no CI, os testes **falham** com a instrução de configuração; não pulam |
| `QA_EDGE_STUB_CONFIRMED`, `QA_WHATSAPP_STUB_CONFIRMED` | **não definir** até a fase 2 | liberariam os testes de WhatsApp e IA, que chamariam a Evolution e o provedor de IA sem stub |

Nada usa segredo. As chaves são as de desenvolvimento geradas pela CLI e só valem dentro do runner. As senhas dos usuários sintéticos são aleatórias a cada execução e mascaradas pelo seed.

### Contrato com o seed (qa-engineer)

Verificado na leitura de `tests/fixtures/seed-duas-clinicas.ts` e `tests/fixtures/duasClinicas.ts`:

- entrada: `QA_SUPABASE_URL`, `QA_SUPABASE_ANON_KEY`, `QA_SUPABASE_SERVICE_ROLE_KEY` e `QA_SUPABASE_DISPOSABLE=ELOLAB_LOCAL_DISPOSABLE`, com recusa fora de loopback (`duasClinicas.ts`, `exigirBancoDescartavel`);
- saída: com `GITHUB_ENV`, grava as `QA_*` lá e mascara senha e token;
- sai com código diferente de 0 se o seed ficar incompleto.

Testado localmente só a recusa: sem variáveis → "Seed recusado: faltam …", código 1; URL `https://exemplo.com` → "precisa ser loopback", código 1. Isso também prova que o Node 24 executa o `.ts` direto.

## 4. Gate de skip

`scripts/ci/falhar-se-pulado.mjs` lê o JSON do Playwright e **reprova** quando:

- algum teste foi pulado e não está em `scripts/ci/security-e2e-skips-permitidos.json`;
- um item da allowlist passou de `revisar_ate`, ou não tem `motivo`, `dono` e `revisar_ate`;
- alguma das três specs não executou nenhum teste, ou não aparece no relatório;
- nenhum teste foi executado;
- houve teste com resultado inesperado ou erro de carga.

A allowlist casa arquivo **e** título completo (`describe › teste`), sem casar por trecho. Hoje ela tem 7 itens, todos da fase 2 (edge functions e WhatsApp com stub, B7), com dono `backend-developer` e prazo **30/11/2026**. Mudança na allowlist deve ser revisada por DevOps, QA e Segurança.

O resultado sai no resumo do job (`GITHUB_STEP_SUMMARY`) e como anotações `::error::`/`::warning::`.

## 5. Bloqueios para o job ficar verde

| # | Bloqueio | Dono | Situação em 27/10 (rodada 2) |
|---|---|---|---|
| B1 | Versão duplicada `20261010198000` (CLIN-QA-563) | database-engineer | **Aberto.** O job falha no passo 1 de propósito. Confirmado pela fonte da CLI que o `start` também falharia (seção 3, passo 1). Tratamento em `docs/arquitetura/banco/versoes-duplicadas.md` (DBA, rodada 2; ainda não existia quando este documento foi escrito) |
| B2 | 456 migrations nunca aplicadas do zero | database-engineer + devops-sre | **NÃO VERIFICADO.** Vai aparecer no passo 3 depois do B1. Esta máquina não tem Docker |
| B3 | Versão maior do Postgres local diferente da VPS | devops-sre | **Aberto.** `supabase/config.toml` não tem `[db] major_version`; a CLI usa o padrão dela. Fixar depois de ler `SHOW server_version` na VPS (pedido explícito) |
| B4 | Seed de duas clínicas (CLIN-QA-566) | qa-engineer | **Escrito** (`tests/fixtures/seed-duas-clinicas.ts`) e ligado no passo 7. Nunca rodou contra um banco |
| B5 | Nomes de variáveis divergentes | qa-engineer | **Resolvido no workflow:** o `security-e2e` só define `QA_*`; os nomes antigos ficaram só no `e2e-tests` |
| B6 | Asserções que passam com banco vazio (CLIN-QA-565) | qa-engineer | Em andamento na rodada 2 (fora deste arquivo) |
| B7 | Edge functions com stub | backend-developer | **Aberto.** 7 testes na allowlist com prazo 30/11/2026 |
| B9 | Edge Runtime da CLI servir a `patient-portal` | devops-sre + backend-developer | **NÃO VERIFICADO.** A função importa `../../../src/lib/portalAppointmentPreparation.ts` (`supabase/functions/patient-portal/index.ts:5`), fora de `supabase/functions`, que é o diretório montado no contêiner. Se o import não resolver, o passo 5a falha com 5xx e o log do runtime mostra o erro; aí o backend-developer move o módulo para `supabase/functions/_shared`. O rate limit é fail-closed: sem a tabela no banco efêmero, o passo 5a acusa 429 |
| B8 | No `--mode test`, o app usa a chave sintética e a suíte RBAC pela UI não loga (CLIN-QA-564) | tech-lead | **Aberto.** `vite.config.ts:152` ainda chama `createViteTestSupabaseDefine({})`. Sem a correção, os 5 testes de RBAC devem **falhar** no job (não pular). O gate não os aceita na allowlist de propósito |

Enquanto B1, B2, B8 (e B9, se confirmado) estiverem abertos, o job fica vermelho. Ele **não** está na proteção de `main` (o responsável configura isso; `docs/EASYPANEL-VPS.md:118-119`), então funciona como informativo até ficar verde.

## 6. Como rodar a mesma sequência localmente (Docker Desktop)

```bash
npx supabase@2.122.0 start -x studio,imgproxy,mailpit,postgres-meta,logflare,vector,supavisor
npx supabase@2.122.0 status -o env \
  --override-name api.url=QA_SUPABASE_URL \
  --override-name auth.anon_key=QA_SUPABASE_ANON_KEY \
  --override-name auth.service_role_key=QA_SUPABASE_SERVICE_ROLE_KEY
# exportar as três variáveis acima, QA_SUPABASE_DISPOSABLE=ELOLAB_LOCAL_DISPOSABLE e QA_PORTAL_EDGE_LOCAL=ELOLAB_LOCAL_PORTAL
node scripts/qa/conferir-portal-local.mjs          # 0 = patient-portal servida
node tests/fixtures/seed-duas-clinicas.ts          # grava supabase/.temp/qa-seed.env
# exportar o conteúdo de supabase/.temp/qa-seed.env
PLAYWRIGHT_JSON_OUTPUT_FILE=seguranca.json npx playwright test \
  tests/rls.spec.ts tests/isolamento-entre-clinicas.spec.ts tests/perfis-rbac.spec.ts --reporter=list,json
node scripts/ci/falhar-se-pulado.mjs seguranca.json \
  --exigir rls.spec.ts,isolamento-entre-clinicas.spec.ts,perfis-rbac.spec.ts \
  --permitidos scripts/ci/security-e2e-skips-permitidos.json
npx supabase stop --no-backup
```

Para reiniciar só o banco entre tentativas: `npx supabase db reset --no-seed`.

## 7. Aceite (30.1 / S2)

1. Job `security-e2e` verde num PR, com mais de 0 testes executados em cada uma das três specs e nenhum skip fora da allowlist.
2. PR de prova que remove uma policy de `pacientes` ou `prontuarios`, ou concede `EXECUTE` a `anon` numa função `SECURITY DEFINER`, **quebra** o job. Fazer em branch descartável e anexar o link da execução.
3. O responsável marca `Segurança (Supabase local)` como check obrigatório na proteção de `main`.
4. O `supabase link` com o projeto Cloud saiu do workflow (**feito nesta rodada**).

## 8. Próximos passos

1. DBA resolve B1; DevOps abre o PR com este workflow quando o responsável autorizar commit e push.
2. Primeira execução: medir o tempo de `supabase start` e das migrations (estimativa da v1: 8 a 12 min no total; **NÃO VERIFICADO**) e corrigir as migrations que falharem (B2).
3. Tech-lead resolve B8. Na primeira execução, conferir o passo 5a (B9) e se os 2 testes do portal aparecem como executados no relatório.
4. Depois do primeiro verde: `db lint --fail-on error`; checagem SQL de funções `SECURITY DEFINER` executáveis por `anon` fora da allowlist da migration `20261028090000_revogar_anon_e_privilegios_padrao.sql` (critério 1.4 dos gates).
5. Fase 2 (B7): `supabase/functions/.env.ci` com URLs falsas, `QA_EDGE_STUB_CONFIRMED` e `QA_WHATSAPP_STUB_CONFIRMED` no job, e os 7 itens saem da allowlist.
6. Opcional, se o tempo do job incomodar: cache das imagens Docker.

## 9. Referências consultadas em 27/10/2026

- Referência da CLI (`start -x` e a lista de serviços, `status -o env --override-name`, `db reset --no-seed`, `db lint --local --level --fail-on`): https://github.com/supabase/cli/blob/develop/apps/cli/docs/go-cli-reference.md
- Nomes das variáveis do `status` (`api.url`, `auth.anon_key`, `auth.service_role_key`, `db.url`): `supabase/cli`, `apps/cli-go/internal/status/status.go:30-47`. As chaves legadas `ANON_KEY` e `SERVICE_ROLE_KEY` estão marcadas como deprecated, mas continuam sendo emitidas quando o Auth está no ar (`status.go:78-84`). Se uma versão futura deixar de emiti-las, o passo 4 falha com mensagem clara.
- Formato do `-o env`: `godotenv.Marshal` (`apps/cli-go/internal/utils/output.go:45-51`), que põe aspas nos valores; o passo 4 as remove.
- `supabase start` serve as funções pelo mesmo núcleo do `functions serve` (`startEdgeRuntimeContainer`), montando `supabase/functions` e injetando `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_DB_URL`; `verify_jwt` por função vem do `config.toml` (`[functions.patient-portal] verify_jwt = false`): `supabase/cli`, `apps/cli/src/commands/start/services/edge-runtime.service.ts` e `apps/cli/src/shared/functions/serve.ts` (consultado via Context7 em 27/10/2026).
- Action `supabase/setup-cli` (tag móvel `v3`, entrada `version`): https://github.com/supabase/setup-cli
- Releases da CLI (`gh api repos/supabase/cli/releases`): v2.122.0, 23/10/2026.
