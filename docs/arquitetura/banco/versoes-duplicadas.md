# Versão de migration duplicada `20261010198000`

Dono: database-engineer. Data: 27/10/2026. Itens: CLIN-QA-563, CLIN-QA-516 (CA2), SEC-R1-08, gate S4 (`docs/time/GATES.md`).
Estado: **plano escrito, nada renomeado.** O renome depende da leitura somente leitura da produção (passo 1). O consolidado da rodada 1 proíbe renomear antes dessa leitura (`docs/time/rodada-1/CONSOLIDADO.md:64`).

## 1. O problema

Dois arquivos usam a mesma versão:

| Arquivo | Commit de origem | O que faz | Reaplicável? |
|---|---|---|---|
| `20261010198000_checkout_provisionamento_seguro.sql` | `4594483b`, 10/10 20:23 | `CREATE OR REPLACE` de `handle_new_user`, `clinic_onboarding_overview`, `provision_clinic_after_subscription` e `activate_public_registration`; `DROP TRIGGER trg_auto_provision_subscriber` (`:46`); `REVOKE` em `start_free_trial` (`:219`); **`UPDATE public.planos SET trial_dias = 3`** (`:222`) | **Não.** O `UPDATE` altera dado comercial, e o `DROP TRIGGER` desfaz o que alguém tenha recriado depois |
| `20261010198000_mercadopago_oauth_clinicas.sql` | `20391c02`, 10/10 12:03 (PR #4) | `CREATE TABLE IF NOT EXISTS` de `mercadopago_oauth_states` e `mercadopago_oauth_refresh_locks`, índice `IF NOT EXISTS`, RLS, `REVOKE`/`GRANT` e `CREATE OR REPLACE` de duas funções de lock | **Sim.** Todo o conteúdo é idempotente e não toca dados |

Os dois são independentes: um não referencia objeto do outro, e nenhuma migration posterior redefine os objetos deles. A busca por `FUNCTION public.<nome>` e `TABLE public.<nome>` em arquivos com versão maior que `20261010198000` não teve resultado. Logo, a ordem relativa entre eles não importa.

Observação: `198000` corresponde a 19:80:00, um horário inválido. A CLI só exige dígitos (`^([0-9]+)_(.*)\.sql$`), e os vizinhos seguem o mesmo padrão. Uma versão válida entre `20261010198000` e `20261010199000` não existe, porque todos os valores do intervalo têm minuto 80 a 89. Preservar a ordem pesa mais que a validade do carimbo neste caso.

## 2. Efeito na CLI (testado localmente)

O código oficial da CLI, conferido em 27/10/2026 no repositório `supabase/cli` (branch `develop`), mostra o seguinte:
- `apps/cli-go/pkg/migration/history.go:15`: `schema_migrations (version text NOT NULL PRIMARY KEY)`;
- `history.go:18`: `INSERT ... (version, name, statements)` **sem** `ON CONFLICT`;
- `apps/cli-go/pkg/migration/apply.go:21-54`: `FindPendingMigrations` compara as versões locais e remotas por dois ponteiros.

Execução: `node docs/arquitetura/banco/testes/versao-duplicada.mjs supabase/migrations`, com PGlite 0.3.15 fora do repositório. Ela usa a tabela e o `INSERT` copiados da CLI e o algoritmo de `FindPendingMigrations` portado, sobre a lista real de 456 arquivos (455 versões distintas). Saída real:

```
(1) db reset: segundo arquivo falha com 23505: duplicate key value violates unique constraint "schema_migrations_pkey"
arquivos=456 versoes_distintas=455
(2) db push, produção com histórico completo: {"erro":"Found local migration files to be inserted before the last migration on remote database.","itens":["20261010198000_mercadopago_oauth_clinicas.sql"]}
(3) após renomear, sem repair: {"erro":"Found local migration files to be inserted before the last migration on remote database.","itens":["20261010198500_mercadopago_oauth_clinicas.sql"]}
(4) após renomear + repair 20261010198500 applied: {"pendentes":["20261028090000_revogar_anon_e_privilegios_padrao.sql","20261028100000_lgpd_anonimizacao_transacional.sql"]}
(5) 20261010198500 livre: true
```

Conclusões:
- **`supabase db reset` e `supabase start` quebram hoje** no segundo arquivo em ordem alfabética (`mercadopago_oauth_clinicas`), com `23505`. Isso bloqueia o job `security-e2e` do devops-sre (B1 em `docs/operations/ci-banco-efemero.md:45`). A hipótese de CLIN-QA-563 fica confirmada (E2), com uma ressalva: foi reproduzida com o código da CLI portado, não com o binário.
- **`supabase db push` também quebra hoje**, mesmo que a produção tenha o histórico completo. O segundo arquivo aparece como "fora de ordem". Com `--include-all`, ele tentaria o `INSERT` e cairia no mesmo `23505`.
- O renome sozinho não basta. Sem o `migration repair` da nova versão, o `db push` continua recusando (linha 3). Com o repair, ele volta a funcionar e lista só as pendências reais (linha 4).

## 3. Regra para não quebrar a produção

1. **Nunca renomear o arquivo cuja versão está registrada na produção.** Se o arquivo registrado for renomeado, a CLI acusa `Remote migration versions not found in local migrations directory` e para todo deploy.
2. **Nunca reaplicar `checkout_provisionamento_seguro` na produção.** Se ele for o arquivo renomeado, a nova versão entra no histórico só com `migration repair --status applied`, depois de o catálogo confirmar que o conteúdo já está lá.
3. O conteúdo dos dois arquivos não muda. Muda só o nome de **um** deles, para `20261010198500_<mesmo nome>.sql`. A versão `20261010198500` está livre (linha 5) e mantém o arquivo entre `198000` e `199000`.

## 4. Passo a passo

### Passo 1 — leitura da produção (somente leitura; responsável executa)

Na mesma janela da consulta C1 (`docs/seguranca/consultas-vps-somente-leitura.sql`, seção 9):

```sql
BEGIN TRANSACTION READ ONLY;

-- 1a. O histórico da CLI existe e o que registrou nesta faixa?
SELECT to_regclass('supabase_migrations.schema_migrations') AS tabela_historico;
SELECT version, name
  FROM supabase_migrations.schema_migrations
 WHERE version BETWEEN '20261010197000' AND '20261010199000'
 ORDER BY version;

-- 1b. O conteúdo de cada arquivo está no banco? (independe do histórico)
SELECT
  to_regclass('public.mercadopago_oauth_states')        IS NOT NULL AS mp_states,
  to_regclass('public.mercadopago_oauth_refresh_locks') IS NOT NULL AS mp_locks,
  to_regprocedure('public.claim_mercadopago_oauth_refresh_lock(uuid,uuid,timestamptz)') IS NOT NULL AS mp_claim,
  position('checkout_flow' IN pg_get_functiondef('public.handle_new_user()'::regprocedure)) > 0 AS checkout_handle_new_user,
  NOT EXISTS (SELECT 1 FROM pg_trigger
               WHERE tgname = 'trg_auto_provision_subscriber'
                 AND tgrelid = 'public.assinaturas_plano'::regclass) AS checkout_trigger_removido;

COMMIT;
```

Se a 1a falhar porque a tabela não existe, registre "sem histórico da CLI" e siga para a 1b.

### Passo 2 — decidir qual arquivo renomear

| Resultado da leitura | Arquivo mantido em `198000` | Arquivo renomeado para `198500` | Registro na produção |
|---|---|---|---|
| A. `198000` registrado com `name = checkout_provisionamento_seguro` | checkout | mercadopago | Se a 1b mostra as tabelas MP: `repair 20261010198500 --status applied`. Se não mostra: deixar pendente e aplicar pelo pipeline, porque o arquivo é idempotente |
| B. `198000` registrado com `name = mercadopago_oauth_clinicas` | mercadopago | checkout | Só `repair 20261010198500 --status applied`, e só se a 1b confirmar `checkout_handle_new_user` e `checkout_trigger_removido`. Se não confirmar, **parar**: aplicar o checkout agora reescreve `trial_dias` e precisa de decisão do responsável |
| C. `198000` registrado com `name` vazio (CLI antiga) | Decidir pela 1b. Se os dois conteúdos estão presentes, usar a linha A | Idem | Idem |
| D. Sem `198000` no histórico, ou sem tabela de histórico (aplicação pelo SQL Editor) | checkout | mercadopago (o idempotente) | Entra no baseline da ADR 0002. Até lá, nenhum `repair` |

A opção padrão (A e D) renomeia o arquivo idempotente. Se a ordem de aplicação sair errada em algum ambiente, o pior caso é ele rodar de novo sem efeito.

### Passo 3 — mudança no repositório (database-engineer, só depois do passo 2)

```bash
git mv supabase/migrations/20261010198000_mercadopago_oauth_clinicas.sql \
       supabase/migrations/20261010198500_mercadopago_oauth_clinicas.sql   # caso A/C/D
# caso B: renomear o checkout no lugar do mercadopago
ls supabase/migrations | cut -c1-14 | sort | uniq -d                      # precisa sair vazio
```

O `git mv` preserva o histórico do arquivo e não muda o conteúdo. No mesmo PR, atualizar as citações ao nome antigo. Elas estão em `docs/operations/ci-banco-efemero.md:16`, `docs/arquitetura/adr/0002-baseline-migrations-deploy-banco-com-aprovacao.md:14`, na lista `repo` de `docs/seguranca/consultas-vps-somente-leitura.sql` (seção 9.2) e nos testes que leem o arquivo pelo nome. Em 27/10, `grep -rln "20261010198000" src tests scripts .github` não teve resultado.

### Passo 4 — registro na produção (responsável, com backup e aprovação)

Só nos casos A, B e C, e depois do merge do passo 3:

```bash
supabase migration list --db-url "$DB_URL_SOMENTE_LEITURA"          # conferir antes
supabase migration repair 20261010198500 --status applied --db-url "$DB_URL"
supabase db push --dry-run --db-url "$DB_URL"                       # deve listar só pendências reais
```

Critério de aceite: o `--dry-run` não acusa versão fora de ordem nem versão remota ausente, e não lista `20261010198500`. O `repair` só grava uma linha no histórico e não executa SQL de schema. Mesmo assim, ele é escrita em produção e segue a regra do backup antes (ADR 0002, risco da linha 117).

## 5. Como evitar a repetição

- **Gate de mudança** (`docs/time/GATES.md` 1.4, "Prefixo de migration único"): o devops-sre pode pôr no CI o passo `test -z "$(ls supabase/migrations | cut -c1-14 | sort | uniq -d)"`, antes do `supabase start`.
- **Versão nova:** use `supabase migration new <nome>`, que gera o carimbo pelo relógio, ou confira a lista antes de escolher um número à mão.

## 6. Pendências

| # | Pendência | Dono | Depende de |
|---|---|---|---|
| 1 | Executar a leitura do passo 1 e anexar a saída | Responsável (VPS) | Janela de C1 |
| 2 | Renome e atualização das citações (passo 3) | database-engineer | 1 |
| 3 | `migration repair` e `db push --dry-run` (passo 4) | Responsável | 2, backup |
| 4 | Checagem de prefixo único no CI | devops-sre | — |
