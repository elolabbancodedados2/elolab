# E13 — Consolidado da esteira (clinical-quality-director)

Data: 27/10/2026. Branch `feat/time-estabilizacao` (HEAD `3b5a738c`), 85 entradas no `git status`, nada commitado, aplicado ou publicado. Fontes: `docs/time/esteira/E01..E12`, `docs/time/rodada-4/tech-lead-final.md`, `docs/time/rodada-2/CONSOLIDADO.md` e `docs/estrategia/DIAGNOSTICO_16_FUNCOES.md` (seção D.3). Não existe `docs/time/rodada-4/CONSOLIDADO.md`. Só gravei este arquivo e não executei testes.

## 1. Ressalvas de evidência
- **O E12 está PARCIAL.** `E12-verificacao.md:3` diz que a verificação completa "está em andamento", mas o log registra a tarefa como "feita" (`docs/time/rodadas.log`, 21:47:53). Não há números de `tsc`, `test:run`, `lint` e `check:*` **depois** da esteira. A última verificação completa verde é anterior a ela: `rodada-4/tech-lead-final.md` (tsc 0, 1821/1821 testes, lint com 0 erros).
- **E09:** o Vitest não rodou (spawn EPERM, `E09-tiss-xml.md`). Os testes de TISS estão **NÃO VERIFICADOS**.
- **E2E e Deno do portal:** nunca rodaram (`tech-lead-final.md`, tabela). O teto de evidência continua em E2 (teste local).

## 2. Estado dos P0/P1/P2

Estados: **pronto localmente** (código e teste local), **aguardando aplicação** (depende de commit, migration ou deploy), **aberto**, **bloqueado por decisão**.

| ID | P | Tema | Estado | Evidência / falta |
|---|---|---|---|---|
| CLIN-QA-001 | P0 susp. | RPCs anon sem checagem de tenant | Aguardando aplicação | `supabase/migrations/20261028090000_revogar_anon_e_privilegios_padrao.sql` (não rastreada). Falta a leitura de `has_function_privilege` na VPS |
| CLIN-QA-002 | P0 gate | Isolamento e RBAC sem prova executada | Aguardando aplicação | O job `security-e2e` está pronto (E02/E03) e nunca rodou. Bloqueios B1, B2, B8 e B9 em `docs/operations/ci-banco-efemero.md` |
| CLIN-QA-003 | P0 | Paciente errado nos canais públicos | Pronto localmente | Vínculo por telefone desligado e pendência para a recepção (E01, `supabase/functions/public-booking/pendencia.ts`). Nenhum E2E rodou |
| CLIN-QA-004 | P0 | Exclusão LGPD apaga dado clínico | Aguardando aplicação + decisão | `20261028100000_lgpd_anonimizacao_transacional.sql`, com a trava desligada (`src/lib/lgpdCompliance.ts`). Requer avaliação jurídica (guarda de 20 anos) |
| CLIN-QA-005 | P0 latente | Backup no mesmo host, sem restauração testada | Bloqueado por decisão/acesso | `docs/operations/backup-e-restauracao.md`. Exige VPS e destino off-site |
| CLIN-QA-512 | P0 | Dependente do portal sem vínculo confirmado | Pronto localmente (contenção) | `supabase/functions/patient-portal/acessoPortal.ts` + `acessoPortal_test.ts`, Deno **NÃO VERIFICADO**. O vínculo explícito depende do modelo de dados e do DPO |
| CLIN-QA-555 | P0 susp. | Prontuário gravado no paciente errado | Pronto localmente | `src/pages/__tests__/ProntuariosPacienteDoRegistro.test.tsx` está na suíte verde da rodada 4. A reclassificação cabe ao PO |
| CLIN-QA-006 | P1 gate | Drift repositório ≠ produção, sem staging | Bloqueado por decisão | Versão `20261010198000` duplicada. Exige leitura na VPS |
| CLIN-QA-007/304 | P1 | MFA só no cliente | Pronto localmente | E06: migration `20261029110000`, 26 casos PGlite e 6 Vitest. Faltam a checagem de `aal` nas edge functions `accept-invite`, `invite-employee` e `admin-contas` e a tradução do HINT em `src/lib/erros.ts` |
| CLIN-QA-008 | P1 | Papel global e convite que troca de clínica | Aberto | Só a base existe (E05, fase 1). A fase 2, com dupla escrita, não foi feita |
| CLIN-QA-009 | P1 | Webhook do WhatsApp síncrono | Pronto localmente (flag) | E08: 17 testes Deno. Vale só com `WHATSAPP_FILA_CLINICAS`. SKIP LOCKED com concorrência real **NÃO VERIFICADO** |
| CLIN-QA-010 | P1 com. | TISS XML | Aberto | E09: rascunho sem XSD (`src/lib/tiss/README.md`) e Vitest não verificado. Requer avaliação especializada (ANS) |
| CLIN-QA-011 | P1 com. | ICP-Brasil | Bloqueado por decisão | Falta escolher o fornecedor de assinatura |
| CLIN-QA-012 | P1 | Identificação do paciente nas telas de gravação | Pronto localmente | `src/components/clinical/IdentificacaoPaciente.tsx` + teste, portados para Prontuários e Recepção |
| CLIN-QA-013 | P1 | Landing promete código de barras | **NÃO VERIFICADO** nesta esteira | Reconferir a landing-v2 |
| CLIN-QA-014/206 | P1 | Cache sem tenant | Aberto (parcial) | E07 cobre só a agenda (`src/lib/queryKeys.ts`). `src/hooks/useSupabaseData.ts:42` e o realtime continuam com a chave por tabela |
| Revisor R4 (3×P2) | P2 | Gate de CI do portal; dados pessoais na pendência; hold não liberado | Pronto localmente | E01 (5 testes Deno) e E02/E03 (10 Vitest, actionlint). O CI real não rodou |
| CLIN-QA-316 | P2 | Uma chave de webhook para todas as instâncias | Bloqueado por decisão | Confirmar a configuração da Evolution (E04) |
| CLIN-QA-320 | P2 | Contato duplicado em observações | Aberto | `docs/seguranca/auditoria-funcoes-publicas.md` |
| CLIN-QA-016/407 | P2 com. | Analytics e UTM | Pronto localmente (parcial) | E10: 14 testes. Faltam o cadastro em `Auth.tsx` (já destravado) e a escolha do fornecedor e do DPA |
| CLIN-QA-024 | P2 gate rede | Multiunidade | Aguardando aplicação | E05: 28 casos PGlite. A ADR 0001 ainda é proposta |
| Novo (E11) | P3 | Segunda paleta e degradês na landing-v2 | Aberto | `src/pages/landing-v2.css:4-38` e `tailwind.config.ts:30-34`. A decisão do logotipo é do responsável |

Resumo: dos 7 P0, nenhum está fechado em produção. Três estão prontos localmente (003, 512 contido, 555), dois aguardam aplicação (001, 002) e dois dependem de decisão ou acesso (004 em parte, 005).

## 3. `src/components/layout/MobileBottomNav.tsx`: deve sair
- **Observação:** este repositório usa `MobileTabBar`, que já está commitado (`src/components/layout/MainLayout.tsx:20,84`). `MobileBottomNav` só é importado pelo próprio teste (`src/components/layout/__tests__/MobileBottomNav.test.tsx:15`).
- O arquivo é idêntico ao do worktree `admin-finance-realtime` (diff sem CR, resultado igual). Lá, o `MainLayout.tsx` foi alterado e não commitado para usá-lo (`:7,87`). Ele pertence à outra frente e veio no porte por engano, como as 11 cópias que o tech-lead removeu (`docs/time/rodada-4/tech-lead-final.md`, seção 2).
- **Recomendação:** remover `MobileBottomNav.tsx` e o teste dele desta branch, antes do primeiro commit. Nada se perde, porque o original continua na outra frente. Não removi porque esta tarefa é só de leitura.

## 4. Veredito
**NO-GO** para lançamento e para beta com clínicas reais. Confiança alta.
- **Motivo:** quatro P0 (001, 002, 004 e 005) não têm prova em ambiente real. Não há staging (006), e nenhuma suíte de isolamento entre clínicas foi executada.
- **Avanço real:** a esteira entregou 9 itens com teste local e não registrou P0 ou P1 novo (`docs/seguranca/auditoria-funcoes-publicas.md:37` e `E12-verificacao.md`, seção 1). Isso reduz o esforço até um **GO CONDICIONAL de beta fechado**.
- **Critérios desse GO CONDICIONAL:**
  - o `security-e2e` verde no Actions;
  - as migrations 20261028* aplicadas em staging, com o gate pós-aplicação;
  - uma restauração de backup testada;
  - as funções públicas publicadas com os E2E de canais públicos passando;
  - a verificação completa pós-esteira verde.
- **Exigem validação especializada:** LGPD (retenção, base legal de analytics, anonimização e a guarda de 20 anos), ANS/TISS (XSD e regras das operadoras), ICP-Brasil e a regra de vínculo de dependentes (DPO). Requerem avaliação profissional especializada.

## 5. O que só o responsável pode destravar

### 5.1 Decisões
1. Aprovar a ADR 0001 (multiunidade) e a 0003 (fila).
2. Escolher o fornecedor de analytics, com DPA, e o de assinatura ICP.
3. Decidir o destino off-site do backup.
4. Definir a regra de vínculo de dependentes, com o DPO.
5. Decidir o logotipo (degradê ou cor sólida) e o formato dos botões (pílula ou `rounded-md`).
6. Decidir quando ligar a `politica_mfa`, só depois que admins e financeiros cadastrarem o fator.
7. Decidir sobre a credencial da Evolution por instância (316).

### 5.2 Roteiro de commits sugerido
Um commit por item, nesta ordem, com `git add <arquivos>` explícito e sem `git add -A`.
- **Antes de tudo:** remover `MobileBottomNav` e o teste dele (seção 3) e normalizar as quebras de linha de `supabase/functions/whatsapp-webhook/index.ts` (`tech-lead-final.md`, pendência 5).
- **Commits 1 e 2, `porte` (rodada 4):** primeiro as telas (Prontuarios, Recepcao, IdentificacaoPaciente e lgpdCompliance), depois as funções públicas e as migrations `20261028090000` e `20261028100000`.
  - `whatsapp-webhook/index.ts` também recebeu o E08, e `Auth.tsx` recebeu o porte e o E06. Separe com `git add -p` ou aceite um commit combinado e registre isso na mensagem.
- **Commit 3, `fix(public-booking)`:** E01 (`index.ts`, `pendencia.ts`, `pendencia_test.ts`).
- **Commit 4, `test(ci)`:** E02 + E03.
  - Arquivos: `tests/fixtures/portalEdge.ts`, `scripts/qa/conferir-portal-local.mjs`, `tests/perfis-rbac.spec.ts`, `src/lib/__tests__/qaPortalEdge.test.ts`, `.github/workflows/test.yml` e `docs/operations/ci-banco-efemero.md`.
- **Commit 5, `refactor(agenda)`:** E07 (`src/lib/queryKeys.ts` com teste, `src/components/agenda/*`, `useCurrentMedico` e `useBuscaPacientes`).
- **Commit 6, `feat(auth)`:** E06 (migration `20261029110000`, `MFAObrigatorio.ts` com teste, `Auth.tsx` e `docs/arquitetura/banco/mfa-servidor.md`).
- **Commit 7, `feat(db)`:** E05 (migration `20261029100000`, `docs/arquitetura/banco/multiunidade.md` e o teste dela).
- **Commit 8, `feat(jobs)`:** E08 (migration `20261029120000`, `_shared/jobs*`, `whatsapp-webhook/fila*` e `index.ts`).
- **Commit 9, `feat(tiss)`:** E09 (`src/lib/tiss/*`), marcado como rascunho.
- **Commit 10, `feat(analytics)`:** E10 (`src/lib/analytics.ts` com teste, `LandingPage`, `PricingSection` e `PlanoCheckout`).
- **Commit 11, `docs`:** `docs/seguranca/auditoria-funcoes-publicas.md`, `docs/time/esteira/*` e as demais pastas `docs/*` não rastreadas.
- **Depois:** push e um PR para `main`, e conferir o `security-e2e` no Actions (B9: import fora de `supabase/functions` em `patient-portal/index.ts:5`).

### 5.3 Ordem de aplicação em produção
Primeiro em staging, quando existir. Cada passo só avança com o gate do anterior verde.
1. Backup completo off-site e uma restauração testada (005).
2. Na VPS, em modo leitura: o drift de schema, a versão duplicada `20261010198000` (006) e a consulta de privilégio anon (001).
3. As migrations, em ordem de timestamp: `20261027120000`, `20261027130000` (se ainda não estiverem aplicadas) e `20261028090000`. Depois do `20261028090000`, rodar o smoke dos fluxos públicos.
4. `20261028100000`, com a trava LGPD desligada.
5. Publicar `patient-portal`, `public-booking` e `whatsapp-webhook`, com `WHATSAPP_FILA_CLINICAS` vazio.
6. O frontend com o E06 antes ou junto da migration `20261029110000`. A migration nega na hora as contas com fator que estejam em AAL1 (`E06-mfa-servidor.md`). Avisar os admins de plataforma.
7. A `20261029100000` (sem efeito no app), só após aprovar a ADR 0001.
8. A `20261029120000`. Depois, conferir o cron `jobs-worker-whatsapp` e ligar uma clínica piloto na fila.
9. Ligar a `politica_mfa` por último, após o cadastro dos fatores.

## 6. Ações não realizadas
- Não executei tsc, Vitest, lint, Deno nem E2E.
- Não removi o MobileBottomNav.
- Não acessei a VPS nem fiz commit.
- Não fiz comparação com concorrentes, que está fora do escopo deste item.

Próximos itens locais executáveis sem decisão do responsável:
- terminar a verificação completa pós-esteira (tsc, `test:run`, lint, `check:*`) e rodar o Vitest de `src/lib/tiss` e o Deno de `patient-portal`;
- remover o MobileBottomNav;
- instrumentar `signup_*` em `Auth.tsx` (E10, pendência 1);
- traduzir o `HINT mfa_necessario` em `src/lib/erros.ts`;
- checar `aal` em `accept-invite`, `invite-employee` e `admin-contas`;
- mover `portalAppointmentPreparation` para `_shared` (risco B9);
- corrigir o CLIN-QA-320;
- migrar `useSupabaseQuery` e o realtime para `queryKeys`;
- trocar as cores da landing-v2 pelos tokens, exceto o logotipo;
- atualizar a seção 2 de `docs/ux/design-system/README.md`.
PROXIMA-RODADA: SIM
