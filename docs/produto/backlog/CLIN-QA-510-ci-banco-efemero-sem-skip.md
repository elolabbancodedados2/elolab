# CLIN-QA-510: CI roda as suítes de isolamento, RLS e RBAC contra banco efêmero, sem skip

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-002 (101, 305, 204, parte de 202) |
| Gravidade | P0 (gate) |
| Impacto | Clínico e comercial. Sem prova executada, o vazamento entre clínicas não está descartado, e isso bloqueia qualquer venda em escala |
| Perfil | Equipe de engenharia (merge); indiretamente todas as clínicas |
| Esforço | M |
| Dono sugerido | `devops-sre` (workflow) + `qa-engineer` (seed e suítes); `tech-lead` (torna o job obrigatório) |
| Dependências | Proposta em `docs/operations/ci-banco-efemero.md` (rodada 1, `devops-sre`) e investigação em `docs/qa/plano-regressao-rodada-1.md` (rodada 1, `qa-engineer`) |
| Status | Feito localmente (27/10, após a rodada 2) |

## Contexto
As suítes existem e são puladas: sem `QA_SUPABASE_URL` em loopback, `resolveLocalQaSupabaseConfig` devolve `null`. O CI ainda faz `supabase link` com um projeto Cloud.

## Evidência
- `scripts/test-supabase-env.ts:41-44` (devolve `null` sem `QA_SUPABASE_URL` e `QA_SUPABASE_ANON_KEY`).
- `.github/workflows/test.yml:68-70` (`supabase link --project-ref gebygucrpipaufrlyqqj`).
- Suítes: `tests/isolamento-entre-clinicas.spec.ts`, `tests/rls.spec.ts`, `tests/perfis-rbac.spec.ts`.

## Proposta
`supabase start` no runner, `db reset` com as migrations do repositório, seed sintético com duas clínicas e cinco perfis (admin, recepção, médico, financeiro, laboratório), execução das três suítes e falha do job quando houver teste pulado.

## Critérios de aceite
- **CA1 (caminho principal).** Dado um PR, quando o CI roda, então o job sobe o banco local, aplica todas as migrations sem erro e executa as três suítes com mais de 0 testes executados e 0 pulados.
- **CA2 (outra clínica).** Dado o seed com clínicas A e B, quando a suíte roda, então cada perfil da A tenta ler, inserir, alterar e apagar dados da B nas tabelas sensíveis e todas as tentativas são negadas.
- **CA3 (permissão negada por perfil).** Dados os cinco perfis da clínica A, quando cada um acessa recursos fora do seu papel (por exemplo, recepção em prontuário, laboratório em financeiro), então a suíte RBAC confirma a negação.
- **CA4 (regressão detectada).** Dado um PR de teste que remove uma policy de `prontuarios`, quando o CI roda, então o job falha com a mensagem de vazamento.
- **CA5 (skip proibido).** Dado que a variável de ambiente some ou o banco não sobe, quando o job roda, então falha em vez de passar com testes pulados.
- **CA6 (sigilo).** O seed usa só dados sintéticos e chaves locais do `supabase start`; nenhum segredo de produção no workflow.

## Definição de pronto
DoD comum, mais: job marcado como obrigatório para merge (pedido ao responsável); link para a execução verde e para a execução do CA4 falhando, anexados aqui.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **correção escrita (E1, com partes em E2)**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- Job `security-e2e` em `.github/workflows/test.yml:76` (devops-sre, rodada 2): banco efêmero com `supabase start`, seed de duas clínicas do QA, conferência das `QA_*`, as três suítes e o gate de skip. O `supabase link` com projeto Cloud saiu do CI (`test.yml:54-55`).
- Reexecutado pelo PO: `node --test scripts/ci/falhar-se-pulado.test.mjs` → 9 de 9; `src/lib/__tests__/qaSuitesSeguranca.test.ts` passou dentro dos 82 de 82.
- O job **nunca rodou no GitHub Actions**, e não há Docker na máquina. Ele falha de propósito no primeiro passo enquanto a versão `20261010198000` estiver duplicada (`ls supabase/migrations | cut -c1-14 | sort | uniq -d` → `20261010198000`, conferido pelo PO).

### O que falta
- 563 (versão duplicada, depende da leitura da VPS), 564 (`vite.config.ts:152` ainda passa `{}`, conferido pelo PO) e 567 (job `e2e-tests`).
- Autorização de commit e PR, primeiro run verde, PR de prova que remove uma policy e quebra o CI (S2 e S3), e só então a proteção de `main` (TL-R2-05).

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
