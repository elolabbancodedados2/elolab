# Recepção completa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar a Recepção com checklist auditável, ações rápidas e chamada com senha, aproveitando fluxos existentes.

**Architecture:** Persistir três confirmações administrativas e autoria no próprio agendamento com validação no banco. A Recepção usa dados existentes para apontar pendências; Portal, cadastro, prioridade e passagem de turno continuam nos módulos atuais e recebem atalhos contextuais. A senha vem do identificador persistente da fila, sem carregar dados pessoais para o painel público.

**Tech Stack:** React, TypeScript, React Router, Supabase/Postgres com RLS, shadcn/ui, `qrcode` já instalado.

**Spec:** `docs/superpowers/specs/2026-10-30-recepcao-completa.md`

## Global Constraints

- Não alterar cobrança de planos nem o módulo financeiro de pacientes.
- Não enviar dados automaticamente; qualquer compartilhamento do Portal exige ação do operador.
- Não exibir nomes ou informação clínica no ticket e no painel de chamadas.
- Preservar permissões e isolamento pela clínica ativa.
- Não instalar dependências.
- Não criar nem executar testes nesta tarefa; verificar build, lint e diff conforme instrução de desenvolvimento.

## Review Focus

- Mudança de clínica durante a conferência não pode atualizar consulta de outra clínica.
- Ticket não deve revelar nome, telefone, CPF ou informação clínica.
- Link do Portal pode invalidar o link anterior e dá acesso amplo; o operador precisa ver isso antes de gerar/compartilhar.
- Cadastro sem convênio não deve aparecer como pendência de carteirinha.
- Link para novo paciente deve voltar ao fluxo da Recepção e preservar a detecção de duplicados.

---

### Task 1: Persistir checklist administrativo

**Files:**
- Create: `supabase/migrations/20261030180000_checklist_recepcao.sql`
- Modify: `src/integrations/supabase/types.ts`
- Modify: `src/hooks/useSupabaseData.ts`
- Create: `src/lib/receptionReadiness.ts`

**Interfaces:**
- `receptionReadiness(patient, today): { missing: string[]; insuranceRequired: boolean }`
- Checklist fields on `agendamentos`: `recepcao_cadastro_ok`, `recepcao_documento_ok`, `recepcao_convenio_ok`, `recepcao_checklist_em`, `recepcao_checklist_por`.

- [x] Add nullable audit metadata and false-default checklist booleans to `agendamentos`; trigger stamps `auth.uid()` and `now()` when a checklist bit changes, rejects checklist writes from non-admin/non-reception roles, and prevents direct audit metadata edits.
- [x] Extend the patient projection with insurance card number and expiry only for the Reception query.
- [x] Implement the readiness helper using the fields already stored on `pacientes`; never inspect clinical history.

### Task 2: Complete Reception actions

**Files:**
- Modify: `src/pages/Recepcao.tsx`
- Modify: `src/pages/Pacientes.tsx` only if existing return-state handling needs an explicit Reception destination.

**Interfaces:**
- Reception row actions consume the existing appointment, patient, and queue item; they do not create duplicate records.

- [x] Render the three-item checklist and update one item at a time with clinic-scoped writes; show the last operator and time.
- [x] Add contextual links for patient portal/QR, patient registration from walk-in, and queue priority; use existing role guards and duplicate detection.
- [x] Add a WhatsApp reschedule message for no-shows without sending it automatically.
- [x] Add a passage-of-turn shortcut that opens the existing Queue handoff dialog with its current summary.
- [x] Add a print-ticket action for checked-in patients using a stable queue identifier.
- [x] Add an administrative-pending shortcut using the existing Tasks form, with a due date and return path to Reception.

### Task 3: Portal QR and privacy-safe ticket

**Files:**
- Modify: `src/pages/PatientPortalLinkPage.tsx`
- Modify: `src/pages/Fila.tsx`
- Modify: `src/pages/FilaPassagemPage.tsx`
- Modify: `src/pages/PainelTV.tsx`
- Create: `src/lib/receptionTicket.ts`

**Interfaces:**
- `receptionTicketCode(queueId: string): string` is deterministic and contains no patient data.
- Queue handoff navigation accepts a validated Reception return path.

- [x] Render a QR code for the secure Portal link after explicit generation; preserve the warning that generating a link revokes the prior one, and provide a link-only fallback if QR generation fails.
- [x] Display and print the stable ticket code; board calls show the code and destination instead of patient identity.
- [x] Accept Reception as a safe return target for link and handoff routes.

### Task 4: Verify

**Files:** none

- [x] Run `npm run build`.
- [x] Run ESLint on changed application files (0 errors; warnings remain).
- [x] Run `git diff --check` and review migration, permissions, and route changes.
