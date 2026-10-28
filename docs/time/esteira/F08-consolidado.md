# F08: consolidado da fila 2 (clinical-quality-director)

27/10/2026. Branch `feat/time-estabilizacao`, HEAD `3b5a738c`. O `git status` tem 111 entradas, 62 delas não rastreadas. Nada foi commitado, aplicado ou publicado. Este arquivo atualiza o `E13-consolidado.md` com F01 a F07. Gravei só este arquivo e não editei código.

Conferências que fiz agora (somente leitura):
- `MobileBottomNav.tsx` não existe mais.
- O import está em `patient-portal/index.ts:5` (`../_shared/...`).
- O HINT é tratado em `src/lib/erros.ts:66`.
- `public-booking/index.ts:303` grava só a constante.
- Em `src/components/landing-v2` e `src/components/landing`, um `grep` por "código de barras|barcode|barras|etiqueta|leitor" não encontrou nada.
- As 5 migrations `202610281*`/`202610291*` continuam não rastreadas.
- `whatsapp-webhook/index.ts` ainda mistura CRLF e LF (`file`).

## 1. Verificação completa real (F07)
| Comando | Resultado |
|---|---|
| `npx tsc --noEmit -p tsconfig.app.json` | exit 0 |
| `npm run test:run` | 381 arquivos, **1866/1866** testes aprovados (era 1821 na rodada 4) |
| `npm run lint` | 0 erros e 2029 avisos (dívida antiga, sem linha de base: NÃO VERIFICADO) |
| `check:colunas`, `check:falhas`, `check:permissoes`, `check:a11y` | OK |
| Deno (`aal`, `portalAppointmentPreparation`, `public-booking/`, `patient-portal/`) | 66 aprovados, 0 falhas |
| `deno check` (5 funções) | sem erros |
| `npx vitest run src/lib/tiss` (F06) | 2/2 |

A ressalva do E13 sobre o E12 está resolvida: há verificação completa verde **depois** da esteira. O teto de evidência continua em E2, só teste local. Não rodaram E2E, `security-e2e` no Actions, testes contra o GoTrue real nem testes contra banco.

## 2. Estado dos P0/P1/P2
Os estados seguem a legenda do E13. Só as linhas em **negrito** mudaram.

| ID | P | Tema | Estado | Evidência / falta |
|---|---|---|---|---|
| CLIN-QA-001 | P0 susp. | RPCs anon sem tenant | Aguardando aplicação | Migration `20261028090000`. Falta ler `has_function_privilege` na VPS |
| CLIN-QA-002 | P0 gate | Isolamento e RBAC sem prova | Aguardando aplicação | `security-e2e` nunca rodou. **B9 corrigido no código (F03)**, mas `docs/operations/ci-banco-efemero.md:92` ainda o descreve como aberto. Continuam B1, B2 e B8 |
| CLIN-QA-003 | P0 | Paciente errado nos canais públicos | Pronto localmente | E01 + Deno de `public-booking/` verde (F07). Sem E2E |
| CLIN-QA-004 | P0 | LGPD apaga dado clínico | Aguardando aplicação + decisão | `20261028100000`, trava desligada. Requer avaliação jurídica |
| CLIN-QA-005 | P0 latente | Backup sem restauração testada | Bloqueado por acesso | Exige VPS e destino off-site |
| **CLIN-QA-512** | P0 | Dependente do portal | **Pronto localmente, Deno verde** | F06: 16 casos em `acessoPortal_test.ts`. O vínculo explícito depende do DPO |
| CLIN-QA-555 | P0 susp. | Prontuário no paciente errado | Pronto localmente | Teste na suíte verde (1866) |
| CLIN-QA-006 | P1 gate | Drift, sem staging | Bloqueado | Leitura na VPS |
| **CLIN-QA-007/304** | P1 | MFA só no cliente | **Pronto localmente (servidor + funções)** | E06 + F02 (`_shared/aal.ts`, 12 Deno) + F01 (HINT traduzido). Faltam: tratar o código `mfa_necessario` nas telas de convite e de contas, decidir o P2 de `aal.ts:62-66,113-114` (503 com a política desligada se `listFactors` falhar) e conferir `factors`/`aal` contra o GoTrue real: NÃO VERIFICADO |
| CLIN-QA-008 | P1 | Papel global / convite | Aberto | A fase 2 (dupla escrita) não foi feita |
| CLIN-QA-009 | P1 | Webhook WhatsApp síncrono | Pronto localmente (flag) | SKIP LOCKED com concorrência: NÃO VERIFICADO |
| **CLIN-QA-010** | P1 com. | TISS XML | **Aberto (rascunho testado)** | 2/2 Vitest. Sem XSD da ANS. Requer avaliação especializada |
| CLIN-QA-011 | P1 com. | ICP-Brasil | Bloqueado por decisão | Fornecedor |
| CLIN-QA-012 | P1 | Identificação nas telas de gravação | Pronto localmente | Na suíte verde |
| **CLIN-QA-013** | P1 | Landing promete código de barras | **Sem promessa no texto (grep)** | Visual NÃO VERIFICADO. Para fechar, falta uma conferência humana da landing publicada |
| **CLIN-QA-014/206** | P1 | Cache sem tenant | **Pronto localmente** | F04: `useSupabaseQuery` e realtime com `clinica_id` primeiro, 19 testes. Restam: hooks com chave própria (`useMinhasTarefasPendentes` e outros), filtros legados com vários segmentos (NÃO VERIFICADO) e a compatibilidade temporária (P3, `queryKeys.ts:117-140`) |
| Revisor R4 (3×P2) | P2 | CI do portal, pendência, hold | Pronto localmente | O CI real não rodou |
| CLIN-QA-316 | P2 | Uma chave de webhook | Bloqueado por decisão | Evolution |
| **CLIN-QA-320** | P2 | Contato em observações | **Pronto localmente (novos registros)** | F03, `observacoes_test.ts`. Registros antigos dependem de script com decisão. Telefone novo de paciente existente não chega à recepção (Produto decide) |
| **CLIN-QA-016/407** | P2 com. | Analytics e UTM | **Pronto localmente (sem provedor)** | F01: `signup_*` em `Auth.tsx`. Sem teste de tela: NÃO VERIFICADO em execução. Fornecedor e DPA pendentes |
| CLIN-QA-024 | P2 gate rede | Multiunidade | Aguardando aplicação | ADR 0001 ainda é proposta |
| **E11** | P3 | 2ª paleta na landing | **Pronto localmente** | F05: sem hex fora do `Logo.tsx`. Visual NÃO VERIFICADO. `tailwind.config.ts` ainda tem `elolab-*` |
| **Novo (F05)** | P2 | Contraste do `--primary` 4,21:1 (< 4,5) | Aberto | `src/index.css`, afeta o app inteiro. Dono: frontend-developer + designer |
| **Novo (F07)** | P2 | `aal.ts` nega com 503 com a política desligada | Aberto, decisão de segurança | Ver 007 |

Resumo:
- **P0:** 7, nenhum fechado em produção. Quatro estão prontos localmente (003, 512, 555 e a parte de código de 002) e todos dependem de aplicação. 001 e 004 aguardam aplicação; 005 depende de acesso.
- **P1:** 007, 012 e 014 passaram a pronto localmente; 013 parece resolvido no texto. Ficam abertos ou bloqueados 006, 008, 010 e 011.
- A fila 2 não registrou P0 nem P1 novo (F07, revisão de diffs).

## 3. Veredito
**NO-GO** para lançamento e para beta com clínicas reais. Confiança alta.
- O código local avançou de forma mensurável: 1866 testes verdes, MFA no servidor e nas funções, cache por clínica, contenção do portal testada.
- O bloqueio agora é quase só de aplicação, acesso e decisão: nenhuma prova de isolamento em ambiente real (002), anon sem conferência (001), backup sem restauração (005) e nenhum staging (006).
- O **GO CONDICIONAL de beta fechado** mantém os critérios do E13. Um deles já foi cumprido, a verificação completa verde. Faltam:
  - `security-e2e` verde no Actions;
  - migrations `20261028*` em staging, com o gate de cada passo;
  - uma restauração de backup testada;
  - as funções públicas publicadas com o E2E dos canais públicos;
  - a conferência das funções com `aal` contra o GoTrue real.
- **Exigem avaliação especializada:** LGPD (retenção, anonimização, base legal de analytics), ANS/TISS, ICP-Brasil e a regra de dependentes (DPO). Não simulei conformidade.

## 4. O que só o responsável pode destravar

### 4.1 Decisões
Os itens 1 a 7 do E13, seção 5.1, continuam valendo. Entram estas:

8. O comportamento de `aal.ts` quando a consulta de fator falha: fail closed com 503 ou permitir com a política desligada.
9. Se o aceite de convite que dá `admin` ou `financeiro` deve exigir o fator antes (F02).
10. A limpeza das observações antigas com contato (CLIN-QA-320) e se o telefone novo do link deve gerar tarefa.
11. Os efeitos que restaram na landing (WebGL, manchas, brilho, onda), a fonte Kanit e o ajuste do token `--primary`.

### 4.2 Roteiro de commits
Um commit por item, com `git add <arquivos>` explícito, sem `-A`. Revise com `git diff --cached` antes de cada commit.

0. **Antes:** normalizar as quebras de linha de `supabase/functions/whatsapp-webhook/index.ts`, que ainda tem CRLF e LF misturados. Rodar `git status` e confirmar que o `MobileBottomNav` saiu (F01 já removeu).
1. `porte(telas)`: Prontuarios, Recepcao, `IdentificacaoPaciente` e `lgpdCompliance`.
2. `porte(funcoes)`: as funções públicas e as migrations `20261028090000` e `20261028100000`.
3. `fix(public-booking)`: E01 + F03/320 (`index.ts`, `pendencia*`, `observacoes*`).
4. `refactor(portal)`: F03/B9 (`_shared/portalAppointmentPreparation*`, `patient-portal/index.ts`, `src/lib/portalAppointmentPreparation.test.ts` e a remoção de `src/lib/portalAppointmentPreparation.ts`).
5. `test(ci)`: E02 + E03 (arquivos listados no E13, commit 4).
6. `refactor(cache)`: E07 + F04 (`src/lib/queryKeys.ts` e testes, `src/components/agenda/*`, `useCurrentMedico`, `useBuscaPacientes`, `useSupabaseData.ts`, `useRealtimeSubscription.ts` e testes, `cachePorEscopo.test.tsx`).
7. `feat(auth)`: E06 + F01 (HINT) + F02. Inclui:
   - a migration `20261029110000`, `MFAObrigatorio*` e `docs/arquitetura/banco/mfa-servidor.md`;
   - `src/lib/erros.ts` e o teste;
   - `_shared/aal*`, `accept-invite`, `invite-employee` e `admin-contas`.
   - `Auth.tsx` tem porte, E06 e F01 (`signup_*`): use `git add -p` ou registre na mensagem que o commit é combinado.
8. `feat(db)`: E05 (`20261029100000` + doc + teste).
9. `feat(jobs)`: E08 (`20261029120000`, `_shared/jobs*`, `whatsapp-webhook/*`).
10. `feat(tiss)`: E09, marcado como rascunho.
11. `feat(analytics)`: E10 (`analytics.ts`, LandingPage, PlanoCheckout).
12. `style(landing)`: F05 (`src/pages/landing-v2.css`, `src/components/landing-v2/*`, `docs/ux/design-system/README.md`). `PricingSection.tsx` tem E10 + F05: use `-p` ou faça um commit combinado.
13. `docs`: `docs/seguranca/*`, `docs/time/esteira/*` e as demais `docs/*`.
14. `chore`: `deno.lock` e `.github/workflows/test.yml`, se ainda não estiverem no commit 5. Revise o diff do lock.

**Depois:** push, PR para `main`, conferir o `security-e2e` no Actions (passo 5a = B9) e atualizar `ci-banco-efemero.md:92`.

### 4.3 Ordem de aplicação em produção
É a do E13, seção 5.3, com dois ajustes. Primeiro em staging. Cada passo só avança com o gate do anterior verde.
1. Backup off-site e uma restauração testada (005).
2. Na VPS, em modo leitura: o drift, a versão duplicada `20261010198000` (006) e a consulta de privilégio anon (001).
3. `20261027120000` e `20261027130000` (se faltarem), depois `20261028090000`. Em seguida, o smoke dos fluxos públicos.
4. `20261028100000`, com a trava LGPD desligada.
5. Publicar `patient-portal` (agora sem import fora de `supabase/functions`), `public-booking` e `whatsapp-webhook`, com `WHATSAPP_FILA_CLINICAS` vazio.
6. O frontend com E06/F01, a migration `20261029110000` e **na mesma janela** `accept-invite`, `invite-employee` e `admin-contas` (F02).
   - Antes, testar um convite e a ferramenta de contas com um usuário sintético em AAL1 e em AAL2, por causa do P2 do 503.
   - Avisar os admins de plataforma.
7. `20261029100000`, só após aprovar a ADR 0001.
8. `20261029120000`, o cron `jobs-worker-whatsapp` e uma clínica piloto.
9. A `politica_mfa`, por último.

## 5. Ações não realizadas
- Não reexecutei tsc, Vitest, lint nem Deno. Os números vêm de F01 a F07, e só refiz as conferências por `grep`, `ls` e `file` listadas no topo.
- Não abri o navegador (landing e CLIN-QA-013 visual).
- Não acessei a VPS nem o GoTrue real, não fiz commit e não comparei com concorrentes (fora do escopo).

PROXIMA-RODADA: SIM

Trabalho local restante (sem decisão do responsável):
- Tratar o código `mfa_necessario` nas telas de convite e de contas (oferecer o TOTP e repetir a chamada), com teste. Dono: frontend-developer.
- Criar teste de tela de `Auth.tsx` para `signup_started` e `signup_submitted`, com e sem consentimento. Dono: qa-engineer.
- Atualizar o B9 em `docs/operations/ci-banco-efemero.md:92`. Dono: devops-sre.
- Normalizar as quebras de linha de `whatsapp-webhook/index.ts`.
- Procurar filtros legados com vários segmentos e migrar hooks com chave própria (`useMinhasTarefasPendentes` e outros) para `queryKeys`. Dono: frontend-developer.
- Propor o ajuste do token `--primary` para 4,5:1 e remover `elolab-*` do `tailwind.config.ts`, exceto o que o `Logo.tsx` usa.
- Ampliar os testes TISS: lote vazio, totais divergentes.
- Criar uma linha de base dos avisos de lint (2029) para barrar novos.
- Fazer a conferência visual da landing em 375 px e 1440 px, se houver navegador.

ESTEIRA: CONCLUIDO
