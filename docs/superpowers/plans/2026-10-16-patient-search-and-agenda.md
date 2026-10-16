# Patient search and agenda performance implementation plan

> **For agentic workers:** Use executing-plans inline, then one independent review.

**Goal:** Reduce unnecessary patient data and repeated page transfers in Pacientes, Agenda and Recepção.

**Architecture:** Keep the existing Supabase HTTP API and tenant RLS. Move normalized patient search and pagination into a security-invoker RPC. Opt Agenda and Recepção into a smaller patient projection, preserving the other consumers of the shared appointment hook.

**Tech Stack:** React Query, TypeScript, Supabase/PostgREST, PostgreSQL, Vitest.

**Spec:** User approved the performance proposal in this conversation and authorized production changes. Clinic staff must retain access to their own clinic's patients and appointments. Existing permissions between staff roles remain intact.

## Global constraints

- Preserve `src/pages/Prontuarios.tsx` changes already in the workspace.
- Never print credentials or patient records in measurement outputs.
- Apply and verify the database migration before deploying its frontend consumer.
- Preserve financial-only patient access through its existing restricted RPC.
- Preserve exact search semantics: accent/case/whitespace normalization; literal punctuation; numeric CPF/telephone search; active/inactive/all and demographic filters.
- Add no dependency or index without evidence of need.

## Review focus

- Clinic/user changes must never reuse another scope's cached patients.
- Pagination must not repeat earlier pages or skip matching patients.
- Names with accents, punctuation, or digits and formatted phone numbers must still match.
- Agenda check-in, receipts, allergies, and WhatsApp must retain their required fields.
- Anonymous/other-clinic requests must not gain access via the new RPC.

## Baseline

- Database contains 150 patients, 85 belonging to Monte Sinai.
- On 2026-10-16, 13 Monte Sinai appointments: appointment + full patient JSON = 24,093 bytes; projected patient JSON = 15,840 bytes (excluding doctor joins in both).
- Search `cris` currently transfers 17 loose candidates. Database execution itself is 0.212 ms; no index change is justified by this measurement.
- Current default query cache is already five minutes; no blanket cache increase is needed.
- Baseline full suite from previous correction: 316 files / 1,540 tests passed. Typecheck passed after its recorded type-only fix.

## Task 1: Server-side patient search and pagination

**Files:** `src/hooks/useBuscaPacientes.ts`, its existing test file, `src/pages/Pacientes.tsx`, new migration and isolated SQL verification fixture.

**Interface:** `buscar_pacientes_paginado(p_termo, p_limite, p_offset, p_status, p_sexo, p_convenio_id, p_somente_particular, p_nascimento_apos, p_nascimento_ate)` returns the existing patient-summary columns. Auth and clinic come from the session, not caller parameters. Add optional `pagina` to `useBuscaPacientes`; existing callers default to page zero.

- [x] Write and run failing tests for RPC parameters, page offsets, next-page detection, error propagation, requested projections, and cache separation.
- [x] Implement a security-invoker RPC with bounded limits, normalization, deterministic ordering and all existing filters; verify behavior and RLS in an isolated test database using synthetic records.
- [x] Replace browser-side candidate filtering with the RPC; keep financial-only access on its existing RPC.
- [x] Change Pacientes to request exactly 50 items plus one lookahead at the requested offset; remove cumulative slicing and obsolete candidate-cap warning.
- [x] Run focused tests and typecheck; commit task.

## Task 2: Reduce appointment patient payload

**Files:** `src/hooks/useSupabaseData.ts`, `src/components/agenda/AgendaPage.tsx`, `src/pages/Recepcao.tsx`, hook regression tests.

**Interface:** Add `resumoPaciente?: boolean` to `useAgendamentosPeriodo`; only Agenda and Recepção opt in. Preserve current defaults and cache lifetime for other callers.

- [x] Write and run failing hook tests for required patient fields, absence of full patient projection in the optimized path, and unchanged default behavior.
- [x] Implement the projection and update the two callers.
- [x] Run hook, agenda, reception and billing tests; commit task.

## Release verification

- [ ] Independent review of the final diff, especially RLS, search semantics and pagination.
- [ ] Run full tests, typecheck, column/error/permission/accessibility checks and production build.
- [ ] Apply migration, verify real-data result sets against the prior client matcher without printing records, and record migration history.
- [ ] Publish verified source/image, check health/version and API response, and report measured payload reduction without claiming unmeasured browser latency gains.

## Execution ledger

- Execution remains in the existing authorized workspace on branch `perf/patient-search-and-agenda`; pre-existing Prontuarios changes are excluded from commits and release archives.
- No additional cache layer or index: existing cache is enabled and the measured database query is sub-millisecond.

- Tasks 1 and 2: complete; 64 focused tests, isolated PostgreSQL assertions, typecheck and four static integrity checks passed. Full suite running.
- Test-fixture correction: a mixed numeric term also matches CPF by existing semantics; the private-coverage assertion now uses a text-only term. Production behavior was preserved.
