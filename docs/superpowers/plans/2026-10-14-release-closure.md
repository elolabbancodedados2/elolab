# EloLab Release Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish the authorized release follow-up, add the requested support update banner, and close every validation or operational item that can be completed safely with the available accounts and environments.

**Architecture:** Work in the isolated release worktree based on `origin/main`. Keep frontend/UI, release provenance, Mercado Pago sandbox, QA database checks, and VPS continuity as separate deliverables. Do not alter live payment credentials or delete remote-only functions without evidence that the action is safe.

**Tech Stack:** React, TypeScript, Vite/PWA, Supabase Edge Runtime, PostgreSQL, PowerShell/SSH, GitHub Actions.

**Spec:** Current user requests; `docs/MERCADOPAGO_CHECKOUT_HANDOFF.md`; `docs/PLANO_CORRECAO_ACHADOS_PENDENTES.md`; `docs/AUDITORIA_CONTINUIDADE_DEPLOY_20261013.md`; `docs/EASYPANEL-VPS.md`.

## Global Constraints

- Do not use Docker on the user's PC; use VPS or embedded/local tools that do not run Docker.
- Never print, commit, or expose secrets; credentials remain in `.env.local`/service secrets.
- Mercado Pago checks must use test-user credentials and must not change live credentials.
- Do not modify patient-finance tables `pagamentos_mercadopago` or `lancamentos` for plan billing.
- No production migration or billing mutation beyond the already authorized full release.
- Preserve remote-only Edge Functions unless usage and ownership are established.
- Do not merge or push a `main` commit until CI and the Easypanel deployment trigger are understood.

## Review Focus

- The support banner remains readable and usable on narrow screens and does not block routes or navigation.
- Email and telephone links use the exact support contacts supplied by the user.
- Published frontend assets identify the intended release build.
- Sandbox billing checks cannot use production credentials or mutate patient finances.
- QA database checks use only synthetic/disposable data.
- Removing a VPS-only function cannot interrupt an external integration.

---

### Task 1: Add the persistent support/update banner

**Files:** Create `src/components/UpdateSupportBanner.tsx` and `src/components/__tests__/UpdateSupportBanner.test.tsx`; modify `src/App.tsx`; remove the expired `src/components/MaintenanceAnnouncement.tsx` if it is replaced.

- [x] Add a persistent banner above the application routes with concise update status and instructions to report errors/instability.
- [x] Add `mailto:contato@focussdev.art` and `tel:+5533984123591` links with accessible names and responsive wrapping.
- [x] Test first: `UpdateSupportBanner.test.tsx` failed because the component did not exist; the focused test then passed, and the full Vitest suite passed (233 files, 1,232 tests). Production build and public route smoke remain part of the VPS release check.
- [ ] Commit the banner and its test on the isolated release branch.

### Task 2: Reconcile release provenance and VPS drift

**Files:** `Dockerfile`; `supabase/config.toml`; `docs/EASYPANEL-VPS.md`; release notes as needed.

- [ ] Compare local config with VPS config and runtime wiring; synchronize the config file only after confirming its source and runtime role.
- [ ] Confirm all local migration versions are registered remotely.
- [ ] Compare remote-only Edge Function directories; preserve unknown/secret directories and establish whether `trial-with-payment` is referenced before any removal.
- [x] Make the Docker build accept `APP_BUILD_ID`/`VITE_APP_BUILD_ID`, so archive-based VPS builds embed the exact commit instead of a timestamp fallback.
- [ ] Record the published snapshot SHA and a reproducible Git path without changing `main` prematurely.

### Task 3: Close safe sandbox billing validation

**Files:** Existing `scripts/mercadopago-sandbox-e2e.ts` and handoff documentation only if results change.

- [ ] Confirm sandbox credential presence without printing values; execute only the sandbox E2E workflow if it uses test users.
- [ ] Verify whether browser checkout, cancellation, Pix, and panel webhook delivery can be proven with available test accounts and visible browser access.
- [ ] Record blockers that require the account owner; never switch to live credentials in this task.

### Task 4: Close isolated authorization/export validation

**Files:** Existing QA scripts/tests and operational notes.

- [ ] Run only verification that uses a disposable/synthetic database and avoids production patient records.
- [ ] Verify the deployed policy and export behavior where a disposable Supabase environment is available.
- [ ] Keep incomplete LGPD scope and unverified legacy Storage paths explicitly marked.

### Task 5: Close continuity controls where credentials permit

**Files:** `docs/EASYPANEL-VPS.md` and operational scripts/config only if a safe destination already exists.

- [ ] Inspect current backup, restore, alerting, and deployment-gate configuration without reading secret values or customer data.
- [ ] Configure/verify off-VPS backup and independent monitoring only if an authorized destination and credentials already exist.
- [ ] Document a tested rollback/restore path; otherwise provide the exact missing external prerequisites.

### Task 6: Publish the reconciled source branch

**Files:** Git history and PR metadata.

- [ ] Commit the support banner and release notes on the isolated release branch.
- [ ] Push the branch and open/update a reviewable PR if authenticated GitHub access is available.
- [ ] Merge only if required CI passes and the deployment trigger is known safe; otherwise leave the PR ready and identify the gating condition.
