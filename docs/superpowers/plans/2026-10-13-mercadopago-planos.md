# Mercado Pago Plans Checkout Completion Plan

> **For agentic workers:** execute the checked items task by task; preserve the existing dirty worktree and do not stage or commit unrelated changes.

**Goal:** Close the remaining plan billing gaps using the already implemented transparent checkout, then validate the changed flow in sandbox.

**Architecture:** Keep plan billing isolated from clinic patient finance. Use the existing invoice history and server-side access guard for recurring delinquency, queue deduplicated reminders, and route new landing-page purchases into the authenticated transparent checkout. Treat webhook/OAuth and database concurrency as separate verification gates.

**Tech Stack:** React, TypeScript, Supabase Edge Functions, PostgreSQL migrations/RPCs, Mercado Pago subscriptions and Orders APIs, Vitest, Deno, Playwright.

**Spec:** `docs/MERCADOPAGO_CHECKOUT_HANDOFF.md` and `docs/PAYMENT_AND_TRIAL_FLOWS.md`.

## Global Constraints

- Use only Mercado Pago test-user credentials for sandbox calls.
- Do not expose values from `supabase/functions/.env.local` or secrets.
- Do not alter `pagamentos_mercadopago` or patient `lancamentos` while implementing plan billing.
- Do not apply migrations or deploy without explicit authorization for the target environment.
- Preserve all pre-existing local changes; do not stage or commit unrelated files.

## Review Focus

- A prior recurring payment that was later approved must immediately clear delinquency and access blocking.
- An invoice with missing/ambiguous dates or status must not block a clinic.
- Repeated daily cron runs must not enqueue duplicate notices for the same invoice or prepaid expiry.
- Existing accounts and current clinic access must not be changed by the landing checkout route.
- A failure or retry in webhook processing must not mark an invoice paid or extend prepaid access twice.

---

### Task 1: Recurring delinquency and access policy

**Files:** new additive migration under `supabase/migrations`, pure policy helper/test if needed, `payment-reminder` worker/tests, handoff documentation.

**Interfaces:** derive overdue state from `platform_subscription_invoices` keyed to the owner's active recurring plan; use invoice `debit_date` with `date_created` fallback and only explicit non-approved payment states. A recent approved invoice clears delinquency. Keep prepaid expiration policy unchanged unless the existing handoff specifies otherwise.

- [x] Add failing tests for before/at/after 72-hour boundary, approved retry recovery, missing dates, non-recurring plans, and owner/team access.
- [x] Verify missing helper and reminder milestone tests fail before implementation.
- [x] Add the server-side access rule and idempotent email notices without changing the patient financial webhook branches.
- [x] Run focused tests, Deno checks, and the migration against embedded PGlite fixtures.

### Task 2: Landing checkout legacy surface

**Files:** landing CTA/form, signup intent handling, `public-checkout` only if still reachable, checkout browser tests, payment-flow docs.

**Interfaces:** the local landing/auth code already carries `plano` and `modo` through account creation into `/planos/checkout/:slug`. Keep that route and invitation/login behavior intact; only retire any remaining public hosted-subscription endpoint if it is still directly callable.

- [x] Local landing/auth implementation carries purchase intent into the transparent checkout; existing tests cover landing disclosure and plan intent.
- [x] Add a failing test proving the obsolete public endpoint cannot create a hosted subscription.
- [x] Reject all POSTs to the obsolete public hosted-subscription path while preserving the transparent checkout.
- [x] Run focused browser and type checks.

### Task 3: Existing local migrations and webhook safety

**Files:** existing `20261013140000_platform_plan_trial_claims.sql`, `20261013160000_mercadopago_webhook_atomic_claim.sql`, Deno tests, SQL concurrency verification, handoff.

**Interfaces:** keep current claim/lease RPC result states (`claimed`, `busy`, `processed`) and token fencing. Do not alter the clinic patient payment processing.

- [x] Review SQL privilege boundaries and migration ordering without applying migrations.
- [x] Verify concurrent claims, lease expiry/reclaim, old-token fencing, retry after error, and processed duplicates in embedded PGlite; no Docker or remote database.
- [x] Record the remaining limitation: this validates PostgreSQL behavior in PGlite, not Supabase RLS/runtime or a deployed database.

### Task 4: Sandbox/browser and panel confirmation

**Files:** existing sandbox E2E script and checkout browser tests; handoff documentation only.

- [x] Run the sandbox suite; confirm test-user guard and retain no credentials in output (15/15).
- [ ] Exercise card subscription, cancellation, Pix, and webhook delivery in the browser/panel if test accounts and panel access are available.
- [x] Record exactly which external checks are evidenced and which require an account holder.

### Task 5: OAuth revocation and readiness

**Files:** OAuth webhook routing tests and handoff documentation.

- [x] Keep revocation deferred unless the event is bound to authoritative seller identity; do not delete clinic OAuth credentials based only on an HMAC over `data.id`.
- [x] Update the handoff with completed evidence and remaining release gates.

## Evidence collected

- `npm run test:run`: 232 files / 1,231 tests passed.
- `npm run test:e2e -- tests/plan-checkout-payment-options.spec.ts tests/trial-cancellation.spec.ts tests/auth-plan-intent.spec.ts`: 12/12 passed.
- `npm run test:mp-sandbox`: 15/15 passed with test-user credentials; no credential values printed.
- Deno policy/retirement tests: 8/8 passed; Deno checks, app TypeScript, and focused Vitest passed.
- PGlite applied the delinquency migration and passed 8 synthetic access-policy cases; the webhook claim migration passed 5 synthetic lease/concurrency cases. Neither migration was applied to Supabase.
- Still requires an account holder: the Mercado Pago panel phone verification, live browser checkout/cancel/Pix, and confirmation of webhook delivery through the saved panel configuration.
