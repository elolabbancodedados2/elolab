# F06 — Testes TISS (Vitest) e Deno do portal

Agente: qa-engineer · 27/10/2026 · nenhum arquivo de código ou teste alterado (tudo passou).

## Comandos e resultados reais

1. `npx vitest run src/lib/tiss` (Vitest 4.1.12, raiz do worktree)
   - Resultado: **Test Files 1 passed (1), Tests 2 passed (2)**, 1,57 s.
   - Arquivo: `src/lib/tiss/gerarLote.test.ts` (escape XML de `&`/`<` e hash SHA-256 do lote).
   - O `spawn EPERM` registrado no E09 era limitação do sandbox do Codex; aqui o Vitest rodou normalmente.

2. `npx -y deno@2 test --no-lock --config=supabase/functions/deno.json --allow-env --allow-read supabase/functions/patient-portal/`
   - Resultado: **ok | 44 passed | 0 failed** (390 ms).
   - `acessoPortal_test.ts`: 16 ok (SEC-R1-06 hash de token; CLIN-QA-512 CA0, CA1, CA2, CA3, CA7, CA8).
   - `avisoRemarcacao_test.ts`: 12 ok.
   - `remarcacao_test.ts`: 16 ok.
   - Usei `--config=supabase/functions/deno.json` (mesmo padrão de `test:mp-sandbox` em `package.json:23`) e `--no-lock` para não alterar `deno.lock`.

## Status atualizado
- E09 / CLIN-QA-010 (TISS): testes unitários **PASSARAM**. Continua rascunho sem XSD da ANS (`src/lib/tiss/README.md`) — requer avaliação especializada; os 2 testes não validam conformidade TISS.
- CLIN-QA-512 (dependente do portal): testes Deno de contenção **PASSARAM** (E2, teste local). O vínculo explícito segue dependendo do modelo de dados e do DPO.

## Riscos e limites
- Cobertura de TISS é mínima (2 casos); sem teste de lote vazio, valores divergentes de `quantidade_guias`/`valor_apresentado` ou versão TISS diferente. Sugestão ao backend-developer quando o XSD entrar.
- Deno rodou só testes unitários com mocks; nenhum teste contra banco ou edge function em execução.
- Não rodei tsc/eslint: nenhum arquivo foi tocado.

Próximo dono: tech-lead (F07, verificação completa).

ESTEIRA: CONCLUIDO
