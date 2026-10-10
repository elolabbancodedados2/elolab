# EloLab app production-readiness fixes - implementation plan

> **Execution:** Inline, sequential steps authorized by the user. Preserve the existing working tree and do not deploy or mutate remote systems.

**Goal:** Close all locally actionable release-readiness gaps in test safety, authentication assertions, responsive visual coverage, and reduced-motion behavior; record dependencies that require an isolated QA backend or external sandbox.

**Architecture:** Make all security tests require explicitly named QA configuration, with safe host guards and no production fallbacks. Strengthen Playwright assertions and add local visual coverage at 1024px. Respect reduced motion in Framer Motion. Keep authenticated backend and external integration validation opt-in and limited to isolated test environments.

**Tech Stack:** React, TypeScript, Vite, Vitest, Playwright, Supabase, Framer Motion.

**Spec:** `docs/superpowers/evidence/2026-10-09-elolab-app-readiness-review.md`

## Global Constraints

- Local-only changes and tests; no deploy, DNS, production calls, real data, or applied migrations.
- Preserve pre-existing WhatsApp, Supabase, Mercado Pago, and migration edits.
- Do not print or store credential values.
- Run Mercado Pago only with verified sandbox credentials; read the checkout handoff before editing billing.
- Do not run RLS/RBAC/isolation suites against a cloud fallback.

## Review Focus

- Missing QA configuration must never reach Supabase Cloud: unit/E2E safe defaults and RLS/RBAC/isolation opt-in guards.
- Failed RLS writes must not leave patient rows: isolate mutations to local disposable DB and use rollback-safe test method, or prevent running the write case until that setup exists.
- Invalid login and browser console tests must assert real outcomes.
- 1024px navigation and authenticated dashboard visuals need evidence where safe credentials exist.
- `prefers-reduced-motion` must affect Framer Motion animations as well as CSS transitions.

## Sequential tasks

### Task 1: Supabase test safety

**Files:** `vitest.config.ts`, `vite.config.ts`, `tests/rls.spec.ts`, `tests/isolamento-entre-clinicas.spec.ts`, `tests/perfis-rbac.spec.ts`, `src/mocks/handlers.ts`, related integration tests.

- [x] Remove cloud URL/key fallbacks from security specs; require explicit QA config.
- [x] Reject non-loopback QA URLs; make write tests opt-in for a marked disposable local DB and guard side-effect calls behind local stub confirmation.
- [x] Configure unit and Vite E2E test defaults so missing env cannot send requests to Supabase Cloud.
- [x] Verify focused tests and harmless local suites using synthetic hosts. RLS/RBAC/isolation remain skipped because local Supabase is unavailable.

### Task 2: Authentication test assertions

**Files:** `tests/auth.spec.ts`, related auth tests.

- [x] Make invalid-credential test assert the visible error and required form elements.
- [x] Make console tests assert no console or page errors on auth and landing routes.
- [x] Review that the tests fail on missing error, unavailable controls, failed auth request, or any console/page error; rerun the auth suite locally.

### Task 3: Responsive and motion QA

**Files:** `tests/qa-ux.spec.ts`, `src/pages/Dashboard.tsx` or shared motion provider, relevant UI tests.

- [x] Add 1024px to existing public route checks.
- [x] Apply the user's reduced-motion preference to Framer Motion and add an E2E verification.
- [x] Capture and review public route screenshots at 1024px. Authenticated dashboard screenshots still require an isolated test account.

### Task 4: Isolated backend and integrations

**Files:** evidence report only unless an isolated local backend and test-only credentials are available.

- [x] Check local Supabase availability. Docker and local Supabase CLI are unavailable, so backend RLS/RBAC/cross-clinic requests were not sent; the 41 guarded specs skipped.
- [x] Check whether an isolated local integration setup is confirmed without reading secret values; none is confirmed, so WhatsApp/Mercado Pago calls were not made.
- [x] Record current backup/restore, monitoring, rollback, and release-smoke evidence and gaps. Never deploy.

### Task 5: Final quality gate

- [ ] Run unit, focused and full E2E safe suites, typecheck, lint, build, accessibility, permissions, and diff check.
- [ ] Update readiness evidence with completed items and remaining environment-bound blockers.
