# Rodada 4 — qa-engineer: porte das suítes E2E de segurança e do agendamento online

Data: 27/10/2026. Worktree `time-estabilizacao`, branch `feat/time-estabilizacao` (base 3b5a738c). Sem commit, deploy, migration nem acesso à VPS.

## O que foi portado

| Arquivo | Como | Conteúdo do time |
|---|---|---|
| `tests/rls.spec.ts` | `git apply` do patch (aplicou limpo; a base nova não tinha mudado o arquivo) | Pré-condição com a service role LOCAL: a tabela precisa ter linhas antes de afirmar "anônimo leu 0" (CLIN-QA-565). Escrita anônima contra o paciente real do seed, com conferência pós-ataque. Catálogo público exige `qa-plano-ativo` e proíbe `qa-plano-inativo`. Skip só fora do CI (`decidirSkipDeConfiguracao`); edge com `motivoSkipPermitido('edge-stub')`. |
| `tests/perfis-rbac.spec.ts` | `git apply` do patch (aplicou limpo) | Camada de API: papel exato em `user_roles` por conta do seed. Interface pela ponte `tests/fixtures/ponteSupabaseApp.ts` (CLIN-QA-564). Portal exige o nome do paciente sintético na tela. Guarda: a tabela de perfis precisa cobrir exatamente `PAPEIS`. |
| `tests/isolamento-entre-clinicas.spec.ts` | Mescla manual (o patch não aplicava: o main mudou o arquivo) | Ver abaixo. |
| `tests/agendamento-online.spec.ts` | Edição manual dos 5 trechos (o patch não aplicava por contexto) | Campo "Data de nascimento *" preenchido nos dois fluxos que enviam o pedido; `data_nascimento: '1990-05-31'` no corpo esperado; mensagem simulada sem exclamação ("Pedido de agendamento recebido."). |

### Isolamento: o que veio de cada lado
- **Mantido do main:** pacientes de controle (`QA_CLINICA_A/B_PACIENTE_ID`) lidos pelo próprio dono no `beforeAll`; exigência de `QA_SUPABASE_DISPOSABLE` para a suíte inteira (mais restritivo que o patch, que só exigia para escrita); filtro `clinica_id=eq.B` e montagem de URL com `searchParams` na busca cruzada.
- **Somado do time:** gate de skip/falha por `decidirSkipDeConfiguracao` (falha no CI); matriz `TABELAS_COM_CLINICA` das fixtures (15 tabelas, antes 6); A precisa ver ≥ 1 linha e todas da clínica A; conferência dos IDs de controle e do `profiles.clinica_id` contra `QA_CLINICA_A/B_ID`; escrita cruzada (alterar, criar e apagar paciente de B) com conferência pós-ataque; WhatsApp em `describe` próprio com pré-condição de sessão e skip da allowlist; `list_instances` deixa de fazer `return` silencioso e vira skip permitido `evolution-indisponivel`.

## O que foi descartado
- Nada do conteúdo do time. Do patch de isolamento, descartei só a relaxação de `QA_SUPABASE_DISPOSABLE` nas leituras: o main exige banco descartável na suíte toda e isso é mais seguro. O seed grava essa variável, então o CI não perde cobertura.
- Os quatro patches de `tests/` não tinham trechos do redesign.

## Arquivos tocados
- `tests/rls.spec.ts`
- `tests/perfis-rbac.spec.ts`
- `tests/isolamento-entre-clinicas.spec.ts` (reescrito por mescla; normalizado para CRLF)
- `tests/agendamento-online.spec.ts`
- `docs/time/rodada-4/qa-engineer.md` (este arquivo)

## Evidências (comandos executados e resultado real)
1. `git apply --check` nos patches: `rls` e `perfis-rbac` OK; `isolamento` e `agendamento-online` falharam ("patch does not apply") e foram portados à mão.
2. `npx playwright test tests/rls.spec.ts tests/isolamento-entre-clinicas.spec.ts tests/perfis-rbac.spec.ts tests/agendamento-online.spec.ts --list` → `Total: 67 tests in 4 files` (compila).
3. Sem `CI` e sem Supabase local: `npx playwright test <3 suítes de segurança> --reporter=json` → exit 0, `expected 0, skipped 58, unexpected 0`.
4. `node scripts/qa/falhar-se-pulado.mjs <relatório da etapa 3>` → `Suíte inteira sem execução` para as 3 suítes, `Gate de skip: FALHOU`, exit 1 (comportamento esperado: o gate barra a suíte pulada).
5. `CI=1 npx playwright test <3 suítes> --retries=0` → exit 1, `16 failed, 42 did not run`, com "Suíte de segurança obrigatória neste ambiente e sem configuração" em cada `beforeAll`/teste (comportamento esperado: no CI configuração ausente é falha, não skip).
6. `npx playwright test tests/agendamento-online.spec.ts --retries=0` → `9 passed (14.7s)` contra `src/pages/AgendamentoOnline.tsx` já com "Data de nascimento *" (`src/pages/AgendamentoOnline.tsx:431`, porte do tech-lead).
7. `npx vitest run src/lib/__tests__/qaSuitesSeguranca.test.ts src/lib/__tests__/qaPonteSupabase.test.ts` → `2 passed`, `40 passed`.

## Status das suítes de segurança
- RLS, isolamento e RBAC: **NÃO EXECUTADO** contra banco. Nesta máquina não subi Supabase local (Docker sob demanda, sem pedido). Só a lógica de skip/falha/gate foi verificada (etapas 3 a 5). Que as asserções passam com o seed é **NÃO VERIFICADO**.
- Agendamento online (E2E com rede simulada): **PASSOU** (9/9).

## Pendências
1. Rodar as três suítes contra o Supabase local com `node tests/fixtures/seed-duas-clinicas.ts`: no job `security-e2e` (devops-sre, `.github/workflows/test.yml`) ou numa máquina com Docker. Pontos a observar na primeira execução real:
   - `audit_log`, `employee_invitations` e `whatsapp_sessions` na matriz: o admin da clínica precisa conseguir LER as próprias linhas. Se a política negar leitura até ao dono, o teste falha na pré-condição e a tabela deve sair de `TABELAS_COM_CLINICA` ou ganhar outra estratégia (dono: database-engineer).
   - `profiles?email=eq.` pressupõe a coluna `email` em `profiles` (NÃO VERIFICADO nesta rodada).
2. A mensagem real de sucesso em `supabase/functions/public-booking/index.ts:301` ainda tem exclamação ("enviado!"). O E2E simula a resposta e não depende dela; o texto é do backend-developer.
3. Verificação completa da rodada (`tsc`, `vitest` e lint) fica para quando os outros agentes terminarem, conforme `docs/time/REGRAS_DO_TIME.md`.
