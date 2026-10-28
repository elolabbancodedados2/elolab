# E02 — Portal do paciente no job security-e2e (qa-engineer)

## O que fiz
Resolvi o P2 de `docs/time/rodada-4/codex-revisor.md` habilitando o portal, sem usar a allowlist.

- O teste do portal dependia de `QA_EDGE_STUB_CONFIRMED`. Essa variável também libera os testes de WhatsApp e IA em `tests/rls.spec.ts:172`, que precisam do stub da Evolution e do provedor de IA. A `patient-portal` só usa o banco (`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, em `supabase/functions/patient-portal/index.ts:48-49`) e não chama integração externa. Por isso o portal ganhou uma variável própria:
  - **`QA_PORTAL_EDGE_LOCAL=ELOLAB_LOCAL_PORTAL`**: a `patient-portal` deste repositório está servida pelo Supabase local em `QA_SUPABASE_URL`.
- Comportamento:
  - com a variável, os 2 testes do portal rodam. Antes deles, uma sonda chama a função com um token sabidamente inválido e exige 401 com `{ error }`. Isso evita que o teste "token inválido" passe por engano quando a função devolve 404 ou 5xx;
  - sem a variável, no CI ou com `QA_SECURITY_REQUIRED=1`, o teste **falha** com a instrução de configuração. Ele não é pulado;
  - sem a variável, fora do CI, o teste é pulado (máquina sem Docker).
- A sonda só chama loopback e nunca imprime chave.

## Arquivos
- `tests/fixtures/portalEdge.ts` (novo): decisão, sonda e entrada do script.
- `scripts/qa/conferir-portal-local.mjs` (novo): `node scripts/qa/conferir-portal-local.mjs` sai com 0 se a função estiver servida e 1 se não estiver. Lê `QA_SUPABASE_URL` e `QA_SUPABASE_ANON_KEY`.
- `tests/perfis-rbac.spec.ts`: o `describe('Portal do paciente')` usa `decidirPortalEdge` e a sonda. Saíram `EDGE_STUB` e o skip `edge-stub`.
- `src/lib/__tests__/qaPortalEdge.test.ts` (novo): 10 testes, cobrindo decisão em CI e fora dele, valor errado, o stub de WhatsApp não liberar o portal, recusa de URL fora de loopback, interpretação de 401/404/429/5xx, ausência de chave no log e código de saída.
- A allowlist (`scripts/ci/security-e2e-skips-permitidos.json`) não mudou.

## Comandos e resultados
| Comando | Resultado |
|---|---|
| `npx vitest run src/lib/__tests__/qaPortalEdge.test.ts src/lib/__tests__/qaSuitesSeguranca.test.ts` | 2 arquivos, 35 testes, todos passaram |
| `npx vitest run src/lib/__tests__/qaPortalEdge.test.ts` (após ajuste de tipo) | 10/10 passaram |
| `npx eslint` nos 4 arquivos tocados | sem problemas |
| `npx tsc --noEmit ... tests/fixtures/portalEdge.ts tests/perfis-rbac.spec.ts` (`tests/` fora do tsconfig.app) | 0 erros |
| `npx tsc --noEmit -p tsconfig.app.json` | 1 erro, de outra tarefa: `src/lib/tiss/index.ts:21` `replaceAll` (E09) |
| `npx playwright test tests/perfis-rbac.spec.ts --list` | 12 testes coletados, incluídos os 2 do portal |
| `node scripts/qa/conferir-portal-local.mjs` sem env | "Faltam QA_SUPABASE_URL e/ou QA_SUPABASE_ANON_KEY.", exit 1 |

Os testes do portal não foram executados contra um Supabase real: **NÃO VERIFICADO**. Não há banco local nesta sessão, e o Docker é sob demanda.

## Para E03 (devops-sre)
1. No `env` do job `security-e2e`, defina `QA_PORTAL_EDGE_LOCAL: ELOLAB_LOCAL_PORTAL`. Não defina `QA_EDGE_STUB_CONFIRMED`: ele liberaria os testes de WhatsApp e IA sem stub.
2. Não exclua `edge-runtime` no `supabase start -x ...`. Hoje ele não está excluído (`.github/workflows/test.yml:112`).
3. Depois de "Exportar variáveis", adicione um passo `node scripts/qa/conferir-portal-local.mjs` para falhar cedo, com motivo legível.
4. Atualize o comentário em `.github/workflows/test.yml:82-84` e `docs/operations/ci-banco-efemero.md` com a nova variável.

## Riscos e pendências
- **NÃO VERIFICADO:** é preciso confirmar se o edge runtime do `supabase start` (CLI 2.122.0) resolve o import fora de `supabase/functions` (`supabase/functions/patient-portal/index.ts:5` importa `../../../src/lib/portalAppointmentPreparation.ts`) e o `esm.sh` no runner. Se não resolver, a sonda falha com 5xx e o motivo aparece no log. Nesse caso, o dono do ajuste é o backend-developer (mover o módulo para `_shared`).
- O rate limit da função é fail-closed (`index.ts:55-60`). Se a tabela de rate limit não existir no banco efêmero, a sonda devolve 429 e acusa isso.
- Até E03 definir a variável, o `security-e2e` falha nos testes do portal, com a mensagem de configuração. Antes ele falhava no gate pelo skip não permitido, então o job não piorou.
- Nenhuma decisão do responsável é necessária.
