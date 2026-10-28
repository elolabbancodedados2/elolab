# Rodada 3: qa-engineer

Tarefa: resolver o CLIN-QA-564 dentro de `tests/` e `scripts/qa/` e atualizar `docs/qa/plano-regressao-rodada-1.md` com o estado de cada caso depois das rodadas 2 e 3. Sem commit, deploy, migration ou acesso à VPS.

## O que fiz

### CLIN-QA-564: confirmado e contornado nos testes
- **Confirmado em execução (E2), não mais hipótese.** Subi o Vite em `--mode test` com `VITE_SUPABASE_PUBLISHABLE_KEY=chave-qa-ficticia` no ambiente. O módulo servido `src/integrations/supabase/client.ts` traz `"VITE_SUPABASE_PUBLISHABLE_KEY": "synthetic-local-test-key"`. A causa é que o `define` de `vite.config.ts:152` (`createViteTestSupabaseDefine({})`) sobrepõe o ambiente.
- **Contorno, sem tocar no produto:** uma ponte do Playwright (`tests/fixtures/ponteSupabaseApp.ts`) intercepta as chamadas HTTP do app para `127.0.0.1:54321` e:
  - troca o `apikey`, e também o `Bearer` quando ele é a própria chave antiga, pela `QA_SUPABASE_ANON_KEY`;
  - preserva o JWT da sessão do usuário;
  - troca a origem quando `QA_SUPABASE_URL` é outra (por exemplo, `localhost`);
  - só aceita URLs de loopback.
- A chave de sessão do `localStorage` passa a vir da URL do bundle, e não de `QA_SUPABASE_URL`. Isso acaba com a armadilha de `localhost` × `127.0.0.1`.
- `tests/perfis-rbac.spec.ts`: a interface do RBAC (5 perfis) e o portal ligam a ponte e deixam de depender de `QA_APP_SUPABASE_LOCAL`. O skip `app-local-564` saiu da allowlist (`tests/fixtures/gateSkip.ts`). O portal continua pulando com `edge-stub` enquanto não houver stub da edge function.
- `tests/ponte-supabase-app.spec.ts` prova a ponte sem banco: um Supabase falso em loopback registra os cabeçalhos recebidos. São três casos:
  - sem sessão, chega a chave do QA;
  - com sessão, o JWT é mantido e só o `apikey` muda;
  - sem a ponte, chega a chave sintética. Este caso é um sentinela e **falha de propósito** quando a raiz for corrigida.
- `scripts/qa/conferir-chave-app-teste.mjs` (implementado em `tests/fixtures/chaveAppTeste.ts`) diz se o app servido usa a chave sintética (saída 2) ou a do QA (saída 0), sem imprimir o valor.

### Plano de regressão
Acrescentei a seção 9 em `docs/qa/plano-regressao-rodada-1.md`, com o estado de A1–A16, B1–B14, C1–C15, D1–D14, dos itens da seção 6, dos casos novos E1–E4 (512, CR-03-02, 555 e SEC-R1-06) e das jornadas. Também atualizei as menções ao 564 nas seções 6.2 e 8.

## Arquivos tocados
- Novos: `tests/fixtures/ponteSupabaseApp.ts`, `tests/fixtures/chaveAppTeste.ts`, `tests/ponte-supabase-app.spec.ts`, `scripts/qa/conferir-chave-app-teste.mjs`, `src/lib/__tests__/qaPonteSupabase.test.ts` e este arquivo.
- Alterados: `tests/perfis-rbac.spec.ts`, `tests/fixtures/gateSkip.ts` (só a linha `app-local-564`) e `docs/qa/plano-regressao-rodada-1.md`.
- Não toquei em `vite.config.ts`, `playwright.config.ts`, `scripts/test-supabase-env.ts`, `.github/` nem `scripts/ci/`.

## Evidências (comandos e resultados reais)
| Comando | Resultado |
|---|---|
| `npx vitest run src/lib/__tests__/qaPonteSupabase.test.ts src/lib/__tests__/qaSuitesSeguranca.test.ts` | `2 passed`, `40 passed` |
| `PLAYWRIGHT_PORT=4198 npx playwright test tests/ponte-supabase-app.spec.ts` | `3 passed` |
| A mesma spec com a troca do `apikey` removida (mutação revertida, conferida com `diff -q`) | `2 failed, 1 passed`: `Received "synthetic-local-test-key"` |
| `npx playwright test tests/perfis-rbac.spec.ts` sem `QA_*` | `12 skipped`, saída 0 |
| A mesma com `CI=true` | `12 failed`, saída 1 ("Suíte de segurança obrigatória…") |
| `node scripts/qa/conferir-chave-app-teste.mjs http://127.0.0.1:4199` (Vite `--mode test`) | "sintética", saída 2. Porta sem servidor: saída 1. URL remota: recusada, saída 1 |
| `npx eslint` nos 7 arquivos novos ou alterados | "No issues found" |
| `npx tsc --noEmit --strict ...` nos 5 `.ts` de `tests/` tocados | "No errors found" |
| Regressão (seção 9.1 do plano): vitest de LGPD, identificação e `pacienteDoRegistro` | `5 passed`, `48 passed` |
| `npx playwright test tests/agendamento-online.spec.ts --retries=0` | `8 passed` |

O Vite de prova na porta 4199 foi encerrado. Não rodei `tsc` nem `vitest` completos.

**NÃO EXECUTADO:** a ponte contra um Supabase local real, porque esta máquina não tem Docker. O estado do 564 é `testado localmente` com Supabase falso.

## Pendências
1. **CLIN-QA-569 (P2, novo), `devops-sre`:** o job `security-e2e` não define `QA_EDGE_STUB_CONFIRMED`, então os 2 testes do portal pulam com `edge-stub`. Esses títulos não estão em `scripts/ci/security-e2e-skips-permitidos.json`, e o gate vai reprovar. Incluí-los com prazo ou servir o stub. Também é opcional relaxar `scripts/ci/security-e2e-conferir-env.sh:29-34`, porque `localhost` agora funciona.
2. **Raiz do 564, `tech-lead`:** fazer `vite.config.ts:152` ler `QA_SUPABASE_*` em loopback. Quando isso acontecer, o sentinela de `tests/ponte-supabase-app.spec.ts` falha. Nesse dia, inverter o caso e retirar a ponte.
3. A ponte não cobre o WebSocket do Realtime (limite do Playwright). Nenhuma suíte depende dele hoje.
4. A15 (PGlite da RPC LGPD) e D1 continuam NÃO EXECUTADO: falta PGlite e falta resolver o CLIN-QA-563.
5. C4 sem caso negativo (envio sem nascimento) em `tests/agendamento-online.spec.ts`: fica para a próxima rodada do QA.
6. `docs/qa/rodada-2-suites-seguranca.md` ainda cita `app-local-564` nas linhas 13, 16, 54 e 72. O texto vigente é a seção 9.6 do plano.

## Próximo dono
`devops-sre` (CLIN-QA-569 e a primeira execução do `security-e2e`). Depois volta ao `qa-engineer`, para a execução real das três suítes com a ponte e o PR de prova do S3. A raiz do 564 fica com o `tech-lead`.
