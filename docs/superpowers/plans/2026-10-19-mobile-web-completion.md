# EloLab Mobile Web Completion Plan

> **For agentic workers:** Follow the local `executing-plans` skill and complete tasks in order. Steps use checkbox syntax for tracking.

**Goal:** Make the existing EloLab web app comfortable to use on iOS and Android phones while preserving desktop behavior, role checks, and the existing visual identity.

**Architecture:** Improve shared shell and interaction primitives first, then repair high-use clinical and operational flows at their source. Prefer stacked cards and adaptive controls where a desktop table or multi-column layout is hard to use on a phone.

**Tech Stack:** React 18, Vite, Tailwind CSS, existing shadcn components and React Router.

**Spec:** User request for a complete Apple-inspired mobile web version; `DESIGN.md`; Apple Human Interface Guidelines for layout, tab bars and controls; Android adaptive layout guidance.

## Global Constraints

- Preserve the EloLab palette, copy, business logic, role/plan filtering, and backend authorization.
- Do not introduce dependencies, deploy, change production, or alter database behavior.
- Keep desktop layouts functional and respect iOS safe areas and Android system insets.
- Use real app data and existing components; do not add fake mobile-only data.

## Review Focus

- 320px wide phones and large text must not hide primary actions or cause page-level horizontal scroll.
- Keyboard and safe-area insets must not cover form controls, dialogs, or bottom navigation.
- Dense records and financial values must remain readable and correctly associated with labels.
- Role-filtered navigation must not expose destinations excluded from the user's permissions or plan.
- Desktop behavior must remain intact at large breakpoints.

### Task 1: Shared mobile shell and interaction primitives

**Files:** `src/components/layout/*`, `src/components/GlobalSearch.tsx`, `src/components/ui/{dialog,sheet,table,tabs}.tsx`, `src/index.css`.

- [x] Implement role-aware bottom navigation, safe-area spacing, mobile header and search.
- [x] Make shared dialogs, sheets, tables and tabs fit phones with reachable actions and local scrolling.
- [x] Add small-screen layout safeguards for content and interactive targets.

### Task 2: High-use clinical and operational routes

**Files:** `src/pages/Dashboard.tsx`, `Agenda.tsx`, `Pacientes.tsx`, `Prontuarios.tsx`, `AtendimentoFila.tsx`, `RecepcaoCaixa.tsx`, `Exames.tsx`, `Laboratorio.tsx`.

- [x] Keep the existing responsive card and form layouts; make the exam queue a phone card list while retaining its desktop table.
- [x] Ensure appointment date selection remains touchable on narrow screens, without changing booking state or authorization.

### Task 3: Remaining routes and validation

**Files:** remaining routed pages under `src/pages/` and shared components only where a common fix applies.

- [x] Audit remaining page-level grids and tables; retain intentional local horizontal scrolling for weekly/monthly calendars and dense laboratory/finance tables.
- [x] Run lint, typecheck and production build.
- [ ] Capture authenticated mobile and desktop previews when Supabase runtime configuration is available.

