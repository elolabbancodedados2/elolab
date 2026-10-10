# Brevo Email Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Brevo the only provider for EloLab outbound email, brand transactional and Supabase Auth messages, and document/configure the production secrets and sender-domain requirements.

**Architecture:** Use one shared Edge Function sender for the Brevo HTTP API and a shared responsive EloLab email shell with accessible HTML and text alternatives. Serve Supabase Auth Go templates at stable HTTPS URLs from the frontend; configure self-hosted Auth SMTP separately in Easypanel. Preserve existing triggers, recipient rules, queues, MX records, and report attachments.

**Tech Stack:** Deno Edge Functions, TypeScript, Brevo HTTP API/SMTP, Supabase self-hosted Auth, Vite public assets, Easypanel.

**Spec:** `docs/superpowers/specs/2026-10-10-brevo-email-system-design.md`

## Global Constraints

- Never put API keys or SMTP credentials in the repository, browser frontend bundle, tests, or logs.
- Use the API key only for Edge Function HTTP requests and the SMTP key only for Supabase Auth SMTP.
- Preserve every mail recipient, existing queue/retry behavior, report attachment, and message trigger.
- Keep patient-sensitive details out of message subjects and preheaders.
- Preserve current MX records and set only the exact sender-authentication DNS values shown by Brevo.
- Use `noreply@elolab.com.br` only after Brevo confirms it as an authenticated sender.

## Review Focus

- Untrusted names/clinic labels/report names in HTML: escape dynamic content before rendering.
- Brevo missing key, non-2xx, and network errors: return safe errors and never log secrets or full message content.
- Reports with attachments: retain attachment filenames and base64 bytes through the shared sender.
- Supabase Auth link variables: keep the proper Go template URL/OTP variables for each auth flow.
- Logo unavailable or blocked by a client: retain meaningful alt text and a readable fallback header.

---

### Task 1: Shared Brevo email sender and branded templates

**Files:**
- Create: `supabase/functions/_shared/brevoEmail.ts`
- Create: `public/email/elolab-logo.png` (copy the existing approved EloLab logo asset)
- Create: `src/lib/emailTemplates.ts` only if client preview generation is needed; otherwise keep outbound templates Deno-only.

**Interfaces:**
- Produces `renderBrandedEmail(input: BrandedEmailInput): { html: string; text: string }` and `sendBrevoEmail(input: BrevoEmailInput): Promise<Response>` so existing status/queue handling can remain unchanged.
- `BrevoEmailInput` includes one or more recipients, subject, HTML/text, optional reply-to and attachments; API key is read internally from `Deno.env`.

- [x] Implement the common branded shell: inline-compatible responsive table layout, EloLab logo, neutral healthcare visual style, CTA, footer, preheader, and plain-text equivalent.
- [x] Implement Brevo API payload/response handling with environment-only credential access and no secret/body logging.
- [x] Verify the helper with available TypeScript/Deno static checks without sending email or displaying credential values.

### Task 2: Move all Edge Function email sends to the shared Brevo module

**Files:**
- Modify every current direct `https://api.brevo.com/v3/smtp/email` caller under `supabase/functions/` to use the shared sender.
- Modify: `supabase/functions/monthly-report-generator/index.ts`
- Modify: `supabase/functions/scheduled-reports-runner/index.ts`
- Modify: `supabase/functions/platform-reports-runner/index.ts`

**Interfaces:**
- Consumes `sendBrevoEmail` from Task 1.
- Preserve each caller's subject, recipient lists, message body, queue status handling, and attachment contract.

- [x] Convert the three Resend callers to Brevo and remove `RESEND_API_KEY`, `api.resend.com`, and `onboarding@resend.dev` use from active code.
- [x] Convert existing direct Brevo fetches to the shared sender without changing triggers or recipients.
- [x] Check for duplicate double-wrapping so every message gets exactly one EloLab shell.
- [x] Scan active source for Resend strings and raw Brevo send endpoints; verify attachment and recipient fields remain intact.

### Task 3: Branded Supabase Auth email templates

**Files:**
- Create: `public/email/auth-confirmation.html`
- Create: `public/email/auth-invite.html`
- Create: `public/email/auth-recovery.html`
- Create: `public/email/auth-magic-link.html`
- Create: `public/email/auth-email-change.html`
- Modify: `docs/EASYPANEL-VPS.md`

**Interfaces:**
- Auth templates use Supabase Go template variables for confirmation, invite, recovery, magic link, and email change URLs/tokens.
- Public template URLs use `https://app.elolab.com.br/email/<filename>` and the logo at `https://app.elolab.com.br/email/elolab-logo.png`.

- [x] Author the templates with inline CSS, plain-language Portuguese, accessible button/link fallback, and no patient information.
- [x] Document self-hosted Auth SMTP variables for Brevo (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL`, `SMTP_SENDER_NAME`) and each Auth template URL/subject mapping.
- [x] Document canonical redirects and the required Auth service recreation/restart in Easypanel.
- [x] Check that built static templates retain Go template placeholders and contain no credential values.

### Task 4: Brevo and production configuration runbook

**Files:**
- Modify: `docs/EASYPANEL-VPS.md`
- Create: `docs/BREVO_EMAIL_SETUP.md`
- Modify: `supabase/functions/.env.example` with names only, if needed.

- [x] Document Brevo account steps: transactional sending enabled, verified sender, API key for Edge Functions, SMTP credentials for Auth, and delivery logs.
- [x] Document SPF/DKIM/DMARC checks based on the exact records shown in the Brevo dashboard; preserve mailbox MX records and never invent DNS values.
- [x] Document runtime secret placement for the Supabase Edge Functions service and Auth Compose service, without values.
- [ ] Document controlled delivery checks for signup confirmation, password recovery, invitations, one transactional message, and one report with attachment.
- [ ] Correct the Free plan quota in project-facing docs to 300 emails/day, noting the daily reset and branded footer if relevant.

### Task 5: Verification and release readiness

**Files:**
- No additional source files unless verification finds a defect.

- [x] Run type checking and production build.
- [x] Run static checks and repository scan confirming there are no active Resend integrations.
- [x] Confirm the logo and auth template files are included in the build; public production URLs remain to be checked after deployment. are reachable over HTTPS after deployment.
- [ ] In Brevo/Easypanel, verify API-key and SMTP-key presence without displaying values; verify the sender/domain status and auth configuration.
- [ ] Verify configuration presence and sender/domain status without sending messages to real users.
- [ ] Record DNS records to add and apply only Brevo-provided SPF/DKIM values while retaining MX; record any account access or domain verification blockers.

## Out-of-band operations

- Rotate the SMTP and API credentials shared in chat before final production use, then enter replacement credentials directly into Easypanel secrets.
- Do not configure inbound mail or replace MX without confirming an existing mailbox/forwarder and the user's intended destination.
- Do not deploy until GitHub checks pass and the production config is reviewed against this runbook.
