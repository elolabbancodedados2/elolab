# Rodada 2: qa-engineer

Tarefa: seed de duas clínicas sintéticas, asserções que falham com banco vazio (CLIN-QA-565) nas três suítes de segurança e falha explícita quando a suíte é pulada em CI. Detalhes em `docs/qa/rodada-2-suites-seguranca.md`.

## O que fiz

- Criei a massa sintética pura com travas (`tests/fixtures/duasClinicas.ts`) e o seed idempotente via Admin API e REST com a service role local (`tests/fixtures/seed-duas-clinicas.ts`). O seed recusa rodar fora de loopback e sem `QA_SUPABASE_DISPOSABLE`, confere linhas por clínica no fim e grava as `QA_*` no `$GITHUB_ENV` com máscara.
- Criei o modo obrigatório (`tests/fixtures/suiteSeguranca.ts`): no CI, a falta de configuração **falha**. O opt-out só vale se for explícito, com `QA_SECURITY_SUITES=fora-deste-job`.
- Criei o gate de skip sobre o JSON do Playwright (`tests/fixtures/gateSkip.ts`), com uma allowlist comentada e com dono.
- Reescrevi as asserções das três specs: pré-condição de linhas pela service role, "todas as linhas são de A", busca de A pelos IDs de B, escrita cruzada sobre linha real, papel exato por conta, catálogo com plano ativo e plano inativo, e portal exigindo o nome do paciente na tela.
- Escrevi 25 testes de unidade.

## Arquivos tocados

Novos: `tests/fixtures/duasClinicas.ts`, `tests/fixtures/seed-duas-clinicas.ts`, `tests/fixtures/suiteSeguranca.ts`, `tests/fixtures/gateSkip.ts`, `scripts/qa/seed-duas-clinicas.mjs`, `scripts/qa/falhar-se-pulado.mjs`, `src/lib/__tests__/qaSuitesSeguranca.test.ts`, `docs/qa/rodada-2-suites-seguranca.md` e este arquivo.
Alterados: `tests/rls.spec.ts`, `tests/isolamento-entre-clinicas.spec.ts`, `tests/perfis-rbac.spec.ts`.
Não toquei em `.github/`, em código de produto nem em migrations.

## Evidências (comandos reais)

- `npx vitest run src/lib/__tests__/qaSuitesSeguranca.test.ts` → `Tests 25 passed (25)`.
- Playwright nas 3 specs, sem `CI` → `58 skipped`, saída 0. Com `CI=true` → `14 failed, 44 did not run`, saída 1, com a mensagem "Suíte de segurança obrigatória…". Com `CI=true QA_SECURITY_SUITES=fora-deste-job` → `58 skipped`, saída 0.
- `node scripts/qa/falhar-se-pulado.mjs` sobre o JSON real → saída 1, com "Suíte inteira sem execução" nas 3 specs.
- Seed: recusou sem variáveis, com URL remota e sem confirmação de descartável (saída 1 nos três casos). Com loopback sem serviço deu `fetch failed`, saída 1, e não gravou arquivo.
- `tsc --strict` nos 7 arquivos `.ts` de `tests/`: sem erros. `eslint`: 0 erros e 3 avisos de `no-explicit-any`, dos quais restou 1, num trecho antigo.

**NÃO EXECUTADO:** o seed e as suítes contra um Supabase real, porque esta máquina não tem Docker. S2 e S3 do gate continuam sem verificação até o primeiro run do `security-e2e`.

## Pendências

1. **CLIN-QA-567 (P2), `devops-sre`:** o job `e2e-tests` atual vai falhar nas 3 specs com `CI=true`. Declarar `QA_SECURITY_SUITES: fora-deste-job` nele e criar o `security-e2e` usando `scripts/qa/seed-duas-clinicas.mjs` e `scripts/qa/falhar-se-pulado.mjs`, conforme a seção 5 do relatório. Também é preciso exportar `QA_SUPABASE_SERVICE_ROLE_KEY`, que o seed e a `rls.spec` exigem.
2. **CLIN-QA-563 (P1), `database-engineer`:** o prefixo `20261010198000` continua duplicado.
3. **CLIN-QA-564 (P1), `tech-lead`:** o modo de teste do Vite continua com a chave sintética. Quando for corrigido, definir `QA_APP_SUPABASE_LOCAL=1` no job e tirar `app-local-564` da allowlist.
4. **CLIN-QA-568 (P3), `product-owner`:** decidir sobre os casos de CPF duplicado, que o índice único torna impossíveis de semear.
5. Primeira execução real: se o seed acusar coluna ou CHECK que eu não previ, corrigir em `tests/fixtures/duasClinicas.ts` (é do QA). Se uma tabela falhar na pré-condição por causa da RLS do próprio admin, a decisão é do `security-engineer`; o teste não deve ser afrouxado.

## Próximo dono

`devops-sre` (job `security-e2e` e CLIN-QA-567). Depois volta ao `qa-engineer`, para a primeira execução real e o PR de prova do S3.
