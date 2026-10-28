# F07: verificação completa da fila 2 (tech-lead)

27/10/2026. Eu era o único agente rodando. Nenhum arquivo de código foi alterado, porque nada quebrou.

## Verificação completa (uma única vez, comandos reais)
| Comando | Resultado |
|---|---|
| `npx tsc --noEmit -p tsconfig.app.json` | exit 0, sem erros |
| `npm run test:run` | **381 arquivos, 1866 testes aprovados**, exit 0 (522 s) |
| `npm run lint` | exit 0: **0 erros**, 2029 avisos |
| `npm run check:colunas` | OK (192 tabelas, 495 arquivos) |
| `npm run check:falhas` | 0 casos |
| `npm run check:permissoes` | OK; dois avisos informativos antigos (28 itens de menu, 6 rotas sem rota protegida) |
| `npm run check:a11y` (teto 0) | OK |
| `npx -y deno@2 test --no-lock --config=supabase/functions/deno.json --allow-env --allow-read` em `_shared/aal.deno.test.ts`, `_shared/portalAppointmentPreparation_test.ts`, `public-booking/` e `patient-portal/` | 66 aprovados, 0 falhas |
| `npx -y deno@2 check` em `accept-invite`, `invite-employee`, `admin-contas`, `patient-portal` e `public-booking` | sem erros |

**Falhas preexistentes:** nenhuma falha. Os 2029 avisos de lint (quase todos `no-explicit-any`) são dívida antiga. F01 a F05 informaram que não acrescentaram avisos nas linhas que alteraram, e o helper novo `_shared/aal.ts` usa `any` com supressão explícita. Ainda não existe uma linha de base de avisos para comparar: NÃO VERIFICADO em número exato.

## Revisão rápida dos diffs (F01–F06)
Não encontrei P0 nem P1.
- **F01** `src/lib/erros.ts:64-68`: o HINT `mfa_necessario` é tratado antes do `switch` de códigos. Os eventos `signup_*` em `Auth.tsx` passam por `track` e respeitam o consentimento.
- **F02** `supabase/functions/_shared/aal.ts`: a regra espelha `mfa_satisfeito()`, e a checagem só roda depois de `getUser`.
  - **P2** `aal.ts:62-66,113-114`: o fator é consultado antes da política. Se `user.factors` vier vazio e `listFactors` falhar, a função nega com 503 mesmo com a política desligada ou a migration não aplicada, o que bloquearia convites e a ferramenta de contas. Pode ser intencional (fail closed). Conferir contra o GoTrue real antes da publicação. Dono: `backend-developer` e `security-engineer`.
- **F03** `public-booking/index.ts`: grava só `OBSERVACAO_AGENDAMENTO_ONLINE`. O marcador continua sendo reconhecido em `src/components/agenda/AppointmentCard.tsx:436` e na contagem `ilike`. O import de `patient-portal/index.ts:5` aponta para `_shared`.
- **F04** `src/lib/queryKeys.ts`:
  - `clinica_id` vai em primeiro na chave, e o realtime passou a invalidar só a clínica atual (`useRealtimeSubscription.ts:24-33`).
  - **P3** `queryKeys.ts:117-140`: `instalarCompatibilidadeTabelas` substitui métodos do `QueryClient` em tempo de execução. Funciona e tem teste, mas é dívida temporária. Remover quando as telas deixarem de invalidar por `['tabela']`. Dono: `frontend-developer`.
- **F05**: a landing usa tokens, e os testes relacionados passam. Visual NÃO VERIFICADO no navegador, como o próprio F05 registra.
- **F06**: `src/lib/tiss` (2 testes) e `patient-portal` (Deno) passam. Os dois estão incluídos nos números acima.

## Pendências (não bloqueiam a fila)
- Conferência visual da landing em 375 px e 1440 px e o contraste do token `--primary` (4,21:1): `frontend-developer` e `product-designer`.
- Tratar `code: "mfa_necessario"` nas telas de convite e de contas: `frontend-developer`.
- O responsável decide sobre a limpeza das observações antigas (CLIN-QA-320), o commit e a publicação das funções junto com a migration `20261029110000`.
- Sem deploy, sem migration aplicada e sem commit.

Próximo dono: `clinical-quality-director` (F08).

ESTEIRA: CONCLUIDO
