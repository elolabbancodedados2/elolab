# Rodada 3: codex-database

## O que fiz

Criei um teste isolado em PGlite para a migration `20261028100000_lgpd_anonimizacao_transacional.sql`. O teste inicializa um schema sintético mínimo, aplica a migration localmente e cobre: admin da mesma clínica, admin de outra clínica, chamada autenticada sem sessão, agendamento futuro, repetição idempotente e preservação de prontuário e lançamento.

O padrão encontrado está em `docs/arquitetura/banco/testes/teste-revogar-anon.mjs`; não há uso de PGlite em `src/` ou `tests/`. Mantive o formato de script `.mjs`, sem dependência nova no projeto.

## Arquivos tocados

- `docs/arquitetura/banco/testes/teste-lgpd-anonimizacao.mjs` (novo)
- `docs/time/rodada-3/codex-database.md` (novo)

## Evidências

- `rg -n -i --hidden 'pglite|@electric-sql' . --glob '!node_modules/**' --glob '!package-lock.json'` encontrou o padrão PGlite em `docs/arquitetura/banco/testes/` e confirmou que não há harness em `src/` nem `tests/`.
- `Test-Path node_modules/@electric-sql/pglite` → `False`.
- `npm cache ls @electric-sql/pglite` → sem resultado.
- `node --check docs/arquitetura/banco/testes/teste-lgpd-anonimizacao.mjs` → saída vazia, exit code `0` (sintaxe JavaScript válida).
- Execução dos cenários PGlite → **NÃO VERIFICADO**: o pacote PGlite 0.3.15 não está instalado neste checkout nem disponível no cache local. O script documenta o comando de execução e não adicionei uma dependência ao projeto.

## Pendências

- Executar o script num ambiente com `@electric-sql/pglite@0.3.15` instalado fora do repositório. Ainda é necessário confirmar a compatibilidade da migration e os resultados dos seis cenários nesse runtime.
- O teste não injeta uma falha no meio da RPC; esse cenário não está na tarefa desta rodada e permanece pendente conforme CLIN-QA-513.

## Próximo dono

`database-engineer` ou `qa-engineer`: executar o script em ambiente com PGlite disponível e encaminhar qualquer falha ao responsável pela migration.
