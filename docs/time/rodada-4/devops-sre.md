# Rodada 4 — devops-sre (porte do `.github/workflows/test.yml`)

Data: 27/10/2026. Sem deploy, migration, commit nem acesso à VPS. O workflow continua **sem nenhuma execução no GitHub Actions**.

## Origem e comparação

- Não há `.patch` do workflow em `docs/time/porte/`. A versão do time foi lida direto do worktree antigo `workspaces/elolab/admin-finance-realtime`, onde `git status` mostra `M .github/workflows/test.yml`.
- **A base nova não mudou o workflow.** Comparei o `HEAD:.github/workflows/test.yml` do worktree antigo com o arquivo da base nova (`3b5a738c`), usando `diff --strip-trailing-cr`, e o resultado foi `BASE ANTIGA == BASE NOVA`. A diferença aparente era só CRLF contra LF (`git ls-files --eol` → `i/lf w/crlf`). Por isso não houve mudança do main para conciliar dentro do arquivo.
- As dependências do job já foram copiadas e são **idênticas** às do worktree antigo (comparadas sem CR com `cmp`):
  - `scripts/ci/falhar-se-pulado.mjs`, `falhar-se-pulado.test.mjs`, `security-e2e-skips-permitidos.json` e `security-e2e-conferir-env.sh`;
  - `tests/fixtures/seed-duas-clinicas.ts`;
  - `docs/operations/ci-banco-efemero.md` e `docs/arquitetura/banco/versoes-duplicadas.md`.
- A rodada 3 não alterou o workflow. Só o `qa-engineer` abriu o CLIN-QA-569 para mim (ver Pendências).

## O que portei (intenção da rodada 2, integralmente)

- `permissions: contents: read`.
- Secrets saíram do `env` do workflow e foram só para o `env` do `e2e-tests`. Com isso, o `SUPABASE_ACCESS_TOKEN` deixou de aparecer.
- `static-checks`: removi o passo `supabase link --project-ref gebygucrpipaufrlyqqj && db lint --linked`, e um comentário explica a remoção.
- `unit-tests`: incluí o passo `node --test scripts/ci/falhar-se-pulado.test.mjs`.
- Job novo **`security-e2e`**:
  1. gate de prefixo de migration único;
  2. `supabase/setup-cli@v3` 2.122.0;
  3. `supabase start -x …`, aplicando todas as migrations do zero;
  4. exportação de `QA_*` via `status -o env --override-name`, com máscara;
  5. trava de loopback;
  6. `db lint --local`, informativo;
  7. seed de duas clínicas;
  8. conferência das variáveis;
  9. as três suítes com reporter JSON;
  10. **gate que falha se houver teste pulado** fora da allowlist;
  11. artefatos em caso de falha.
- `e2e-tests`: recebe uma lista explícita de specs, sem `rls`, `isolamento-entre-clinicas` e `perfis-rbac`. Também removi o comentário falso sobre "a chave do client.ts".

## O que adaptei à base nova

- O main trouxe 34 specs novas em `tests/` (comparei as listagens dos dois worktrees). Entre elas está `tests/_redesign-capturas.spec.ts`. As linhas 1–2 dele dizem "TEMPORÁRIO… Não faz parte da suíte", e ele usa `test.setTimeout(30 * 60 * 1000)`.
- Em `e2e-tests`, o `find` agora usa `! -name '_*'`, com comentário: specs com prefixo `_` são utilitários locais. As outras 33 specs novas do main **continuam** no `e2e-tests`, como no `npm run test:e2e` do main.
- `tests/ponte-supabase-app.spec.ts` (do time, rodada 3) fica no `e2e-tests`. Ela usa um Supabase falso em loopback e não precisa de banco local.

## O que descartei

Não descartei nada da intenção do time. A exclusão do `_redesign-capturas` é a única coisa que o worktree antigo não tinha, e ela é uma adaptação, não um descarte.

## Arquivos tocados

- `.github/workflows/test.yml` (alterado)
- `docs/time/rodada-4/devops-sre.md` (novo)

## Evidências (comandos executados e resultado real)

- `actionlint 1.7.12 -shellcheck shellcheck 0.10.0 .github/workflows/test.yml` → código **0**, sem achados.
- Seleção de specs do `e2e-tests`, reproduzida no bash local → `specs=43`. Nenhuma das excluídas (`_redesign`, `rls`, `isolamento`, `perfis-rbac`) aparece.
- `node --test scripts/ci/falhar-se-pulado.test.mjs` → `tests 9, pass 9, fail 0`.
- `grep -n "gebygucrpipaufrlyqqj\|SUPABASE_ACCESS_TOKEN\|supabase link"` → só aparece a linha 54, que é um comentário. Não há nenhum uso.
- O gate de duplicata foi reproduzido na base nova (`find supabase/migrations … | cut -c1-14 | sort | uniq -d`) → **vazio**, com 530 arquivos. O B1 (`20261010198000`) não bloqueia mais o primeiro passo nesta base.
- `git diff --stat` → `1 file changed, 150 insertions(+), 33 deletions(-)`.

## NÃO VERIFICADO

- Qualquer execução no GitHub Actions. Também não verifiquei se as 530 migrations aplicam do zero (B2), porque esta máquina não tem Docker.
- Se as 33 specs novas do main passam no `e2e-tests` com os secrets atuais. Elas já rodavam pelo `npm run test:e2e` do main, e o porte não muda o ambiente delas.

## Pendências

| # | Pendência | Dono |
|---|---|---|
| 1 | **CLIN-QA-569 (P2)**: os 2 testes do portal pulam com `edge-stub` e não estão na allowlist, então o gate vai reprovar. Corrigir na allowlist, com prazo, ou servir o stub. Fiz isso fora desta tarefa, porque a rodada 4 restringe a mudança ao `test.yml` | devops-sre (próxima rodada), após o porte das specs pelo qa-engineer |
| 2 | Primeira execução real do `security-e2e` (exige commit/PR) e, depois do primeiro verde, tornar o job obrigatório na proteção de `main` | responsável |
| 3 | B8/CLIN-QA-564: `vite.config.ts:154` ainda passa `createViteTestSupabaseDefine({})` | tech-lead |
| 4 | Revogar o secret `SUPABASE_ACCESS_TOKEN`, que ficou sem uso | responsável |
| 5 | Mover `tests/_redesign-capturas.spec.ts` para fora de `tests/`, ou apagá-lo (ele se declara temporário) | dono do redesign |
| 6 | `.gitattributes` com `*.sh text eol=lf` | devops-sre, quando autorizado |
