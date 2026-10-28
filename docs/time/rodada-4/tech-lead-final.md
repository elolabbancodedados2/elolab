# Rodada 4: tech-lead, verificação completa da base nova com o porte

Data: 27/10/2026. Worktree `time-estabilizacao`, branch `feat/time-estabilizacao` (base `3b5a738c`). Execução única, com só este agente rodando. Sem deploy, sem migration aplicada, sem commit e sem acesso à VPS.

## Resultado final (depois da correção)

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit -p tsconfig.app.json` | exit 0, 0 erros |
| `npm run test:run` | exit 0. **376/376 arquivos e 1821/1821 testes** passaram (533 s) |
| `npm run lint` | exit 0. **0 erros e 2022 avisos**, todos preexistentes (ver seção 3) |
| `npm run check:colunas` | OK: 187 tabelas, 493 arquivos, nenhuma coluna inexistente |
| `npm run check:falhas` | OK: 0 casos |
| `npm run check:permissoes` | OK: 18 grupos, 75 itens de menu, 74 rotas. Os avisos informativos já existiam |
| `npm run check:a11y` (`--teto 0`) | OK |
| `node --test scripts/ci/falhar-se-pulado.test.mjs` | 9/9 passaram |
| Deno (`supabase/functions/patient-portal/acessoPortal_test.ts`) | **NÃO VERIFICADO**: `deno: command not found` nesta máquina |
| E2E Playwright (`rls`, `isolamento-entre-clinicas`, `perfis-rbac`, `agendamento-online`) | **NÃO EXECUTADO**: dependem do Supabase local e do seed. O job `security-e2e` nunca rodou no Actions |

## 1. Primeira execução (antes da correção)

| Comando | Resultado |
|---|---|
| `tsc` | exit 2, **1 erro**: `src/pages/MeuPerfilMedico.tsx(139,92)` TS2322, prop `onTemHorarioChange` inexistente em `MedicoAvailabilityManager` |
| `test:run` | exit 1, **2 arquivos e 8 testes falharam** (1824/1832 passaram) |
| ↳ | `src/lib/__tests__/datePreferenceCoverage.test.ts`: violação em `src/components/clinical/PreConsultaCard.tsx` (data curta formatada sem a preferência) |
| ↳ | `src/pages/__tests__/portalPacienteAcesso.test.tsx`: 7 testes ("Perdi meu link de acesso", pré-consulta, atestados, dependente…) testam uma `PortalPaciente` que não existe na base nova |
| `lint` | exit 0, 0 erros e 2023 avisos (1 deles em `PreConsultaCard.tsx`) |
| `check:*` | todos OK |

## 2. Falhas causadas pelo porte e a correção

**Causa.** Junto com os arquivos do time, o porte copiou do worktree antigo (`admin-finance-realtime`) arquivos novos da **outra frente**. A `docs/time/porte/TRIAGEM.md` classifica essa frente como "outra frente, não portar": `src_App.tsx.patch` (rota do perfil médico) e `src_pages_PortalPaciente.tsx.patch` (pré-consulta, PDF de atestado e sessão). Como esses patches não foram aplicados, as cópias ficaram órfãs: nenhuma rota e nenhum import as alcança. Mesmo assim, elas quebravam o `tsc` e os testes.

**Correção.** Removi as 11 cópias da base nova. Antes de remover, conferi três coisas:
- os arquivos são idênticos aos originais do worktree antigo (`cmp` sem CR, todos "igual"), então nada se perde;
- nenhum arquivo de `src`, `supabase/functions` ou `tests` importa esses arquivos;
- as migrations do time (`20261028090000`, `20261028100000`) não citam `pre_consultas`, `meu_perfil_medico` nem `clinic_logos`.

Arquivos removidos:
- `src/pages/MeuPerfilMedico.tsx` (o erro de `tsc`)
- `src/components/PendenciasPerfil.tsx`, `src/lib/perfilPendencias.ts` e `src/lib/__tests__/perfilPendencias.test.ts`
- `src/components/clinical/PreConsultaCard.tsx` e `src/lib/preConsulta.ts` (a falha de `datePreferenceCoverage` e 1 aviso de lint)
- `src/lib/atestadoPdf.ts`
- `src/pages/__tests__/portalPacienteAcesso.test.tsx` (as 7 falhas)
- `supabase/functions/_shared/portalPaciente.ts`: o backend já o tinha registrado como "sem uso" (`rodada-4/backend-developer.md:63`)
- `supabase/migrations/20261021120000_perfil_proprio_medico_e_logo_clinica.sql` e `supabase/migrations/20261021130000_pre_consulta_portal.sql`. Elas não estavam aplicadas, mas o job `security-e2e` aplica todas as migrations do zero. Ficando na base, levariam ao banco efêmero o schema de uma frente que não foi portada.

Com isso, a diferença de testes é exata: 1832 − 1821 = 11, que são os 7 testes de `portalPacienteAcesso` e os 4 de `perfilPendencias`.

## 3. Situação preexistente da base nova (não causada pelo porte)

- **Lint: 2022 avisos e 0 erros**, quase todos `@typescript-eslint/no-explicit-any`. O porte não acrescentou `any`. Contei as ocorrências de `\bany\b` em `HEAD` e no arquivo atual de cada arquivo modificado:

  | Arquivo | Base | Agora |
  |---|---|---|
  | `src/lib/lgpdCompliance.ts` | 1 | 1 |
  | `src/pages/AgendamentoOnline.tsx` | 1 | 1 |
  | `src/pages/Prontuarios.tsx` | 54 | 54 |
  | `src/pages/Recepcao.tsx` | 41 | 41 |
  | `supabase/functions/patient-portal/index.ts` | 5 | 3 |
  | `supabase/functions/public-booking/index.ts` | 4 | 3 |
  | `supabase/functions/whatsapp-webhook/index.ts` | 59 | 59 |
  | `tests/isolamento-entre-clinicas.spec.ts` | 3 | 1 |

  Os arquivos novos do time não têm aviso. A única linha `+ ... any` no `git diff` é `tests/isolamento-entre-clinicas.spec.ts` (`(s: any) => s.instance_name`), um trecho que foi movido e cujo saldo no arquivo caiu.
- **`check:permissoes`**, informativo: 28 itens citam um papel que o grupo deles não tem, e 6 itens não têm rota protegida (`/dashboard`, `/indicadores`, `/chat`, `/planos`, `/treinamento`, `/feedback`).
- **Telas grandes, acima de ~400 linhas:** `Prontuarios.tsx`, `Recepcao.tsx` e `whatsapp-webhook/index.ts` já eram grandes na base. O porte não as quebrou em partes, como manda a regra "sem mudar comportamento no porte".

## 4. Pendências (sem decisão do responsável disponível)

| # | Pendência | Dono sugerido |
|---|---|---|
| 1 | Rodar o teste Deno `patient-portal/acessoPortal_test.ts` numa máquina com Deno (ou no CI) | devops-sre |
| 2 | Primeira execução real do job `security-e2e` e das suítes E2E de isolamento, RLS e RBAC, com banco efêmero | devops-sre / qa-engineer |
| 3 | `src/components/layout/MobileBottomNav.tsx` e o teste dele também são cópias órfãs, sem import. Não os removi porque não falham e não está claro se são da outra frente. Decidir entre manter e ligar ao layout ou remover | frontend-developer / responsável |
| 4 | Se a frente "perfil médico / pré-consulta / atestado no portal" voltar, ela deve ser portada inteira (rota, `PortalPaciente`, `MedicoAvailabilityManager` com `onTemHorarioChange`, migrations), não por cópia de arquivo solto. Originais em `admin-finance-realtime` | responsável |
| 5 | `supabase/functions/whatsapp-webhook/index.ts` está com LF no working copy (o Git avisa que vai converter para CRLF). Sem efeito funcional; normalizar antes do commit | quem fizer o commit |
| 6 | Achados de correção do porte: ver `docs/time/rodada-4/codex-revisor.md` (revisão independente) | tech-lead na rodada seguinte |

## Evidência
Logs desta execução (temporários, fora do repositório) na pasta de rascunho da sessão: `tsc.txt`, `vitest.txt`, `lint.txt`, `check-*.txt` (primeira execução) e `tsc2.txt`, `vitest2.txt`, `lint2.txt`, `c2-*.txt` (execução final).
