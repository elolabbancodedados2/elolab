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
- [x] Commit the banner and its test on the isolated release branch (`10b78a3`).

### Task 2: Reconcile release provenance and VPS drift

**Files:** `Dockerfile`; `supabase/config.toml`; `supabase/functions/trial-with-payment/*`; `supabase/functions/hello/*`; `docs/EASYPANEL-VPS.md`; release notes as needed.

- [x] Confirm the Supabase Compose stack does not mount `supabase/config.toml`; it is still the source config for CLI use. Sync its local function blocks to `/etc/easypanel/projects/elolab/app/code/supabase/config.toml` after keeping a dated copy.
- [x] Confirm all local migration versions are registered remotely.
- [x] The remote trial route had zero logged requests in the available 30-day window and the local product docs say its old flow was removed. Quarantine the old source and replace the route with a no-side-effect 410 tombstone; replace the default `hello` sample route with a controlled 404. Preserve `_secrets` and runtime `main`.
- [x] Make the Docker build accept `APP_BUILD_ID`/`VITE_APP_BUILD_ID`, so archive-based VPS builds embed the exact commit instead of a timestamp fallback.
- [x] Record the published snapshot SHA (`d8221152dbcf7b1b66f9bf3c4d1fa41ab03f8ca7`) and reproducible Git branch; keep `main` unchanged pending review gates.

### Task 3: Close safe sandbox billing validation

**Files:** Existing `scripts/mercadopago-sandbox-e2e.ts` and handoff documentation only if results change.

- [x] Confirm sandbox credential presence without printing values; `npm run test:mp-sandbox` passed 15/15 using test users.
- [x] Check browser checkout, cancellation, Pix, and panel webhook availability; these require an authenticated account-owner session and visible browser, neither available here.
- [x] Record account-owner blockers; no live credentials were installed or used.

### Task 4: Close isolated authorization/export validation

**Files:** Existing QA scripts/tests and operational notes.

- [x] Run verification with synthetic data only; local isolated SQL/policy and existing authorization/export tests passed without production patient records.
- [ ] Verify deployed policy/export behavior against a disposable Supabase project (blocked: no disposable project/access configured).
- [x] Keep incomplete LGPD scope and unverified legacy Storage paths explicitly marked.

### Task 5: Close continuity controls where credentials permit

**Files:** `docs/EASYPANEL-VPS.md` and operational scripts/config only if a safe destination already exists.

- [x] Inspect backup, restore, alerting, and deployment-gate configuration without exposing secret values or customer data.
- [ ] Configure/verify off-VPS backup and independent monitoring (blocked: no authorized destination or provisioned credentials exist).
- [x] Document rollback to the retained prior image; document restore, offsite, and RPO/RTO prerequisites that remain.

### Task 6: Publish the reconciled source branch

**Files:** Git history and PR metadata.

- [x] Commit the support banner and release notes on the isolated release branch.
- [ ] Push the final docs update and open a reviewable PR.
- [ ] Merge only if required CI passes and the deployment trigger is known safe; otherwise leave the PR ready and identify the gating condition.
