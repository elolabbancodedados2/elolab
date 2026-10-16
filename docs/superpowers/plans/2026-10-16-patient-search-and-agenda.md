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

- [x] Independent review of the final diff, especially RLS, search semantics and pagination.
- [x] Run full tests, typecheck, column/error/permission/accessibility checks and production build.
- [x] Apply migration, verify real-data result sets against the prior client matcher without printing records, and record migration history.
- [ ] Publish verified source/image, check health/version and API response, and report measured payload reduction without claiming unmeasured browser latency gains.

## Execution ledger

- Execution remains in the existing authorized workspace on branch `perf/patient-search-and-agenda`; pre-existing Prontuarios changes are excluded from commits and release archives.
- No additional cache layer or index: existing cache is enabled and the measured database query is sub-millisecond.

- Tasks 1 and 2: complete; 64 focused tests, isolated PostgreSQL assertions, typecheck and four static integrity checks passed. Full suite running.
- Test-fixture correction: a mixed numeric term also matches CPF by existing semantics; the private-coverage assertion now uses a text-only term. Production behavior was preserved.

- Independent review: no critical or important findings. Production migration applied and registered; PostgREST schema reloaded.
- Real-data verification: 328 searches exactly match the original JavaScript matcher; 85 active clinic patients paginate as 50 + 35 with no overlap; zero foreign-clinic patients visible. All 132 appointments across nine doctors remain visible to clinic staff.
- Search `cris`: five actual matches returned instead of 17 loose candidates. Anonymous RPC request is rejected with HTTP 401 / SQLSTATE 42501.
- Isolated SQL test database removed after verification. Production build and GitHub unit/integration and static checks passed; browser E2E still running.

- Full suite passed locally and in GitHub: 317 files / 1,538 tests. Browser fixtures were updated to route the new patient-search RPC and apply result filtering/paging. The first local browser attempt exceeded navigation timeouts on this Windows host; the focused rerun uses a larger runner timeout without changing application behavior.

- Four focused browser cases passed after updating the search fixtures: patient deletion safeguards, LGPD search limits, empty state and audited export. The export fixture now excludes the navbar date-bounded agenda so it does not inject incomplete export rows into the header.
- First full browser CI run: 216 passed, 18 failed, 46 skipped. Three affected patient/LGPD cases are corrected above; the other 15 are being compared against the prior production commit before any release decision.

- User explicitly requested resolving the remaining browser validation failures and publishing. The baseline rerun reproduced 14 failures on the prior production commit; these were not waived.
- Fixed actual zero-width Agenda titles and reception patient names by allowing controls to wrap; kept desktop patient visibility and triage access assertions. Removed duplicate legend labels with identical colors.
- Fixed React 18 image fetch-priority attributes and public-page touch targets, small labels and collapsed FAQ focusability. Updated outdated test copy/color expectations and scoped duplicate task selectors. Route smoke tests now load each destination and wait for its visible heading; the sticky-header test scrolls past the actual strip position.
- Current focused checks: 15 unit tests and TypeScript passed. Eleven of the first twelve browser cases passed; its arbitrary sticky scroll was corrected and the Agenda/Recepcao rerun passed. Remaining navigation/public viewport checks are running before the full CI gate.

- Follow-up review found no material production regression. Its route-wait concern was addressed by loading each destination before asserting its heading. Thirty focused unit tests passed (15 agenda/search plus15 landing). Public QA passed all4 routes at4 viewport widths with original accessibility thresholds intact.
- The31-screen capture matrix is now one test per viewport, preserving its180-second limit per case and every assertion/screenshot. The previous combined62-navigation case exceeded its cumulative limit on the local Windows host; individual page readiness is still checked. Full CI is the release gate.
