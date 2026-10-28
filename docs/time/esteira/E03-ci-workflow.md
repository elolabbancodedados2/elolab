# E03 — Portal do paciente no job security-e2e (devops-sre)

## O que fiz
Liguei no job `security-e2e` o portal habilitado em E02 (`docs/time/esteira/E02-ci-portal-stub.md`), seguindo os 4 pontos do handoff.

1. `env` do job: `QA_PORTAL_EDGE_LOCAL: ELOLAB_LOCAL_PORTAL`. `QA_EDGE_STUB_CONFIRMED` e `QA_WHATSAPP_STUB_CONFIRMED` continuam **não definidas**, com um comentário que explica o motivo: elas liberariam os testes de WhatsApp e IA sem stub.
2. `supabase start -x ...` não exclui o Edge Runtime. Acrescentei um comentário que proíbe excluí-lo.
3. Passo novo **"Conferir patient-portal servida"**, depois de "Conferir que o alvo é loopback" e antes do lint e do seed:
   - roda `node scripts/qa/conferir-portal-local.mjs`;
   - faz até 3 tentativas, com 10 s entre elas, porque a primeira chamada compila a função e baixa as dependências;
   - se falhar, emite `::error::` e imprime as últimas 80 linhas do log do contêiner `supabase_edge_runtime_*`. As chaves são as de desenvolvimento da CLI e só valem no runner.
4. Atualizei o comentário do `env` no workflow e o `docs/operations/ci-banco-efemero.md` (versão 3):
   - tabela de variáveis do job;
   - passo 5a na tabela de passos;
   - nota sobre o Edge Runtime no passo 3;
   - bloqueio novo B9;
   - roteiro local com a variável e a sonda;
   - próximos passos;
   - referência da CLI.

Fonte consultada pelo Context7 em 27/10/2026 (`supabase/cli`, `edge-runtime.service.ts` e `shared/functions/serve.ts`). Ela mostra que o `supabase start` serve as funções com o mesmo núcleo do `functions serve`: monta `supabase/functions`, injeta `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` e aplica o `verify_jwt` do `config.toml`. A `patient-portal` está com `verify_jwt = false` (`supabase/config.toml:39-42`).

## Arquivos
- `.github/workflows/test.yml` (job `security-e2e`: `env`, comentário do `start` e passo novo)
- `docs/operations/ci-banco-efemero.md`

## Comandos e resultados
| Comando | Resultado |
|---|---|
| `actionlint 1.7.7 -shellcheck shellcheck 0.10.0 .github/workflows/test.yml` (binários oficiais no scratchpad) | sem achados, exit 0 |
| Laço do passo novo em bash, sem `QA_*` | 3 tentativas com "Faltam QA_SUPABASE_URL e/ou QA_SUPABASE_ANON_KEY.", `::error::` e exit 1. Sem Docker, o `docker logs` falha e é ignorado (`\|\| true`) |
| `QA_SUPABASE_URL=http://127.0.0.1:59999 ... node scripts/qa/conferir-portal-local.mjs` | "Sem resposta de .../functions/v1/patient-portal", exit 1 |

Não rodei tsc, vitest nem eslint: não alterei nenhum arquivo TS/JS.

## Pendências e riscos
- **NÃO VERIFICADO (B9):** o job nunca rodou no GitHub Actions. Não houve commit, e não há Docker nesta sessão. Ainda falta confirmar se o Edge Runtime resolve o import `../../../src/lib/portalAppointmentPreparation.ts` (`supabase/functions/patient-portal/index.ts:5`), que fica fora do diretório montado. Se não resolver, o passo 5a falha com 5xx e com o log do runtime. Nesse caso, o backend-developer move o módulo para `_shared`.
- O rate limit da função é fail-closed. Se a tabela de rate limit não existir no banco efêmero, o passo 5a acusa 429.
- O job continua vermelho por B1, B2 e B8, que já estavam registrados no documento. Nenhuma decisão do responsável é necessária para esta tarefa. Commit e push ficam a pedido dele.
