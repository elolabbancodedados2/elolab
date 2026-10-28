# Rodada 1 — qa-engineer

Data: 27/10/2026. Sem deploy, migration, commit ou acesso à VPS. Não editei código de produto nem testes.

## O que fiz
- Escrevi `docs/qa/plano-regressao-rodada-1.md`, com 56 casos para os quatro itens em andamento: exclusão LGPD bloqueada (A1–A13), WhatsApp sem vínculo por telefone (B1–B14), agendamento público com nascimento obrigatório (C1–C15) e migration de revogação de anon (D1–D14). Os casos cobrem caminho feliz, erro, permissão negada, outra clínica, concorrência e reversão, e cada um aponta a história do PO (CLIN-QA-502 a 508).
- Descobri por que as três suítes de segurança são puladas no CI e propus um job com banco efêmero, seed de duas clínicas e falha quando houver teste pulado (seção 6 do plano).
- Abri os itens CLIN-QA-561 a 566.

## Arquivos tocados
- `docs/qa/plano-regressao-rodada-1.md` (novo)
- `docs/time/rodada-1/qa-engineer.md` (novo)

## Evidências (comandos executados e resultado real)
Seguindo o aviso do orquestrador, não rodei tsc nem vitest completos.
- `npx vitest run src/lib/__tests__/identificacaoPaciente.test.ts src/lib/__tests__/lgpdExclusaoBloqueada.test.ts` → `2 passed`, `15 passed`.
- `npm run check:colunas` → `OK — nenhuma coluna inexistente…` (154 tabelas, 387 arquivos).
- `npx playwright test tests/rls.spec.ts tests/isolamento-entre-clinicas.spec.ts tests/perfis-rbac.spec.ts --reporter=list`, sem `QA_*` → `41 skipped`. Nenhum teste rodou e o comando terminou sem falha, que é como o CI fica verde.
- `docker --version` → não instalado. Por isso não subi o Supabase local.
- `ls supabase/migrations | … uniq -d` → `20261010198000` duplicada.
- `ls supabase/migrations/2026102809*` → a migration de anon ainda não existe.

## Causa do skip no CI (observado)
As specs só leem `QA_SUPABASE_URL` e `QA_SUPABASE_ANON_KEY` em loopback (`scripts/test-supabase-env.ts:41-53`). O workflow não define nenhuma `QA_*` e não sobe banco (`.github/workflows/test.yml:9-29,84-111`). O Playwright sai com código 0 quando todos os testes são pulados. O comentário em `test.yml:93-97` afirma que o RLS roda, o que não é verdade.

## Riscos
- **CLIN-QA-563 (P1, hipótese):** a versão de migration duplicada deve quebrar o `supabase db reset`.
- **CLIN-QA-564 (P1, hipótese forte):** em `--mode test`, o app fica preso à chave sintética (`vite.config.ts:152`), e a suíte RBAC pela UI não deve conseguir logar mesmo com o banco no ar.
- **CLIN-QA-565 (P1):** as asserções de isolamento e RLS passam com banco vazio, e passam também se A enxergar só os dados de B.
- **CLIN-QA-566 (P2):** não há seed de duas clínicas nem configuração local do Supabase.
- **CLIN-QA-561 e 562 (P3):** pequenos oráculos de identificação, no WhatsApp e no `book`.
- **B13 / CLIN-QA-507:** conversas antigas ainda carregam o vínculo por telefone até o responsável decidir.
- Nenhum caso de integração ou E2E foi executado. Todos estão NÃO EXECUTADO, exceto os de unidade citados acima.

## Próximo dono
- `devops-sre`: job `security-e2e` (seção 6.3), alinhado com `docs/operations/ci-banco-efemero.md`. Corrigir o comentário do `test.yml`.
- `database-engineer`: CLIN-QA-563. Entregar a migration 20261028090000 com allowlist e bloco de reversão, para os casos D1–D14.
- `tech-lead`: CLIN-QA-564 (configuração do modo de teste) e decisão sobre a visibilidade da tarefa LGPD (A13).
- `backend-developer` / `security-engineer`: CLIN-QA-561 e 562.
- `qa-engineer` (próxima rodada, com autorização para editar `tests/` e `scripts/qa/`): seed, `falhar-se-pulado.mjs` e correção das asserções (CLIN-QA-565). Também a verificação completa (tsc + vitest) no fim desta rodada, como pediu o orquestrador.
