# Rodada 2 — devops-sre

Data: 27/10/2026. Sem deploy, migration, commit nem acesso à VPS. O job foi escrito e validado localmente, mas **nunca rodou no GitHub Actions**.

## O que fiz

- **Job `security-e2e`** em `.github/workflows/test.yml`:
  1. gate de prefixo de migration único;
  2. `supabase/setup-cli@v3` com a CLI 2.122.0;
  3. `supabase start` só com os serviços usados, aplicando todas as migrations do zero;
  4. exportação de `QA_SUPABASE_URL`, `QA_SUPABASE_ANON_KEY`, `QA_SUPABASE_SERVICE_ROLE_KEY` e `QA_DB_URL` pelo `supabase status -o env --override-name`, com máscara;
  5. trava de loopback;
  6. `db lint --local`, informativo;
  7. seed do qa-engineer (`node tests/fixtures/seed-duas-clinicas.ts`);
  8. conferência das 18 `QA_*`;
  9. as três suítes com reporter JSON;
  10. gate de skip;
  11. artefatos em caso de falha.
- **Saída do projeto Cloud:** o passo `supabase link --project-ref gebygucrpipaufrlyqqj && db lint --linked` saiu do `static-checks`. O workflow não usa mais `SUPABASE_ACCESS_TOKEN`.
- **Secrets:** saíram do nível do workflow e foram para o `env` do `e2e-tests`, o único job que os lê. Assim o `security-e2e` não herda URL nem credencial remota. Também acrescentei `permissions: contents: read`.
- **`e2e-tests`:** roda uma lista explícita de specs sem as três de segurança, que ali só pulavam. Removi o comentário falso sobre "a chave do client.ts".
- **`unit-tests`:** passo `node --test scripts/ci/falhar-se-pulado.test.mjs`.
- **Gate de skip** `scripts/ci/falhar-se-pulado.mjs`. Reprova:
  - skip fora da allowlist;
  - allowlist vencida ou incompleta;
  - spec exigida sem nenhum teste executado ou ausente do relatório;
  - zero testes executados;
  - teste falho ou erro de carga.
- **Allowlist** `scripts/ci/security-e2e-skips-permitidos.json`: 7 itens, todos edge/WhatsApp da fase 2 (B7), dono `backend-developer`, prazo 30/11/2026.
- **Script** `scripts/ci/security-e2e-conferir-env.sh`: lista as `QA_*` ausentes sem imprimir valores e exige `QA_SUPABASE_URL` exatamente `http://127.0.0.1:54321` (CLIN-QA-564).
- **`docs/operations/ci-banco-efemero.md`** reescrito para a versão 2: passos, contrato com o seed, gate, bloqueios B1 a B8 com a situação atual, execução local, aceite e referências.

## Arquivos tocados

- `.github/workflows/test.yml` (alterado)
- `scripts/ci/falhar-se-pulado.mjs` (novo)
- `scripts/ci/falhar-se-pulado.test.mjs` (novo)
- `scripts/ci/security-e2e-skips-permitidos.json` (novo)
- `scripts/ci/security-e2e-conferir-env.sh` (novo)
- `docs/operations/ci-banco-efemero.md` (reescrito; era da rodada 1, ainda não versionado)
- `docs/time/rodada-2/devops-sre.md` (novo)

Não toquei em `tests/`, em `vite.config.ts` nem em migrations.

## Evidências (comandos executados e resultado real)

- `node --test scripts/ci/falhar-se-pulado.test.mjs` (Node v24.22.0) → `tests 9, pass 9, fail 0`.
- Relatório real do Playwright, sem `QA_*`:
  - `QA_BASE_URL=http://127.0.0.1:9 PLAYWRIGHT_JSON_OUTPUT_FILE=…/rls.json npx playwright test tests/rls.spec.ts --reporter=json` → código **0**, `"expected":0,"skipped":23`. Isso reproduz o defeito.
  - O gate sobre esse relatório (`node scripts/ci/falhar-se-pulado.mjs …/rls.json --exigir rls.spec.ts --permitidos scripts/ci/security-e2e-skips-permitidos.json`) → código **1**.
  - Saídas do gate: 3 avisos "pulado (permitido)", que são os títulos de edge e casam exatamente com a allowlist; 20 erros "pulado sem permissão"; "spec exigida não executou nenhum teste"; "nenhum teste foi executado".
- actionlint 1.7.12, com ShellCheck 0.10.0 nos `run:` (binários oficiais no scratchpad), em `.github/workflows/test.yml` → código 0, sem achados.
- `shellcheck -S style scripts/ci/security-e2e-conferir-env.sh` → 0; `bash -n` → ok.
- `security-e2e-conferir-env.sh`:
  - sem variáveis → lista as 18 ausentes, código 1;
  - com as 18 definidas → "Variáveis QA_* conferidas: 18.", código 0.
- `node tests/fixtures/seed-duas-clinicas.ts`:
  - sem variáveis → "Seed recusado: faltam …", código 1;
  - com URL `https://exemplo.com` → "precisa ser loopback", código 1.
  - Isso prova que o Node 24 executa o `.ts` e que a trava do seed funciona antes de qualquer rede.
- O `sed` que tira as aspas do `-o env` foi testado com uma amostra no formato do `godotenv.Marshal` → 4 linhas `QA_*=valor` sem aspas.
- Fonte da CLI do Supabase, lida via `gh api` em 27/10:
  - `internal/status/status.go:30-47,78-84`: nomes `api.url`, `auth.anon_key`, `auth.service_role_key`, `db.url`. As chaves legadas continuam sendo emitidas.
  - `pkg/migration/history.go:15,18` e `file.go:127`: `INSERT` simples numa tabela com PK em `version`. A versão duplicada derruba o `start`; é E1, não executado.
  - Última release estável: v2.122.0, de 23/10/2026.
- `find supabase/migrations … | cut -c1-14 | uniq -d` → `20261010198000`. São 456 arquivos.

## NÃO VERIFICADO

- Qualquer execução no GitHub Actions: tempo, download de imagens, `supabase start` com o `config.toml` atual (só `[functions.*]` e `project_id`).
- Se as 456 migrations aplicam do zero (B2). Aqui não há Docker.
- Se o seed completa contra um banco real: `link_portal_paciente` como `service_role` depois da migration `20261028090000`, e as tabelas da massa.
- Se `ANON_KEY`/`SERVICE_ROLE_KEY` legadas são aceitas pelo Kong local da 2.122.0 para as specs. Pela leitura, são emitidas.

## Pendências

| # | Pendência | Dono |
|---|---|---|
| 1 | B1: versão duplicada `20261010198000`. O job falha no 1º passo até lá, de propósito | database-engineer |
| 2 | B8/CLIN-QA-564: `vite.config.ts:152` ainda passa `{}`. Os 5 testes de RBAC devem falhar no job (não estão na allowlist, de propósito) | tech-lead |
| 3 | Trava de "suíte inteira pulada em modo CI" nas specs: ainda não aparece no diff de `tests/`. O `e2e-tests` já não carrega essas specs, então ela pode ser feita no carregamento sem quebrar aquele job | qa-engineer |
| 4 | B7: stubs das edge functions; os 7 itens da allowlist vencem em 30/11/2026 | backend-developer |
| 5 | Autorizar commit/PR deste workflow; depois do primeiro verde, tornar `Segurança (Supabase local)` obrigatório na proteção de `main` (exige admin do GitHub) | responsável |
| 6 | B3: fixar `[db] major_version` igual à VPS (leitura na VPS só com pedido) | devops-sre, com autorização |
| 7 | O secret `SUPABASE_ACCESS_TOKEN` do repositório ficou sem uso: o responsável pode revogá-lo | responsável |
| 8 | `.gitattributes` com `*.sh text eol=lf` (pendência da rodada 1; os `.sh` novos foram escritos com LF) | devops-sre, quando autorizado |

## Próximo dono

- **database-engineer:** B1.
- **tech-lead:** B8 e a revisão deste diff.
- **qa-engineer:** confirmar o contrato do seed (seção 3 do documento) e a trava de CI nas specs.
- **Responsável:** commit e PR, e depois a proteção de `main`.
