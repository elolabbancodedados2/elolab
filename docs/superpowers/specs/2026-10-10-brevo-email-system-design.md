# EloLab email delivery and templates

## Objective

Use Brevo as the sole provider for app-generated outbound email. Give transactional messages a consistent EloLab identity, a public logo, accessible responsive HTML, and plain-text fallbacks. Keep credentials in runtime secrets and do not include them in source control.

## Current findings

- Most Supabase Edge Functions already call Brevo's transactional email API with `BREVO_API_KEY`.
- `monthly-report-generator`, `scheduled-reports-runner`, and `platform-reports-runner` still call Resend. The monthly report uses the Resend test sender and must move to an authenticated EloLab sender.
- Supabase Auth sign-up confirmation, resend confirmation, and password reset use Supabase Auth mail delivery; this is configured separately from Edge Function API calls.
- The app links to support/privacy email addresses, but an actual receiving mailbox or inbound processing path was not found in the repository.
- EloLab logo assets exist under `src/assets`. A template logo must be published at a stable HTTPS URL, rather than a local or build-only path.
- The local env files do not establish which email credentials are present in the active production services. No secret values should be displayed or copied into this repository.

## Proposed design

1. Add a shared Edge Function email module that sends through Brevo's HTTP API, applies the verified EloLab sender and reply-to, and produces consistent errors without logging credentials or message bodies.
2. Replace direct provider calls across Edge Functions with the shared sender, including all three current Resend integrations. Preserve each function's existing recipient, trigger, queue, and retry behavior.
3. Add responsive HTML and text templates for account confirmation, password reset, welcome/activation, staff invitations, appointment confirmation/reminders, exam results, receipts, scheduled reports, and operational notices. Use a common header/footer, hosted EloLab logo, clear action button, mobile-safe layout, and meaningful text fallback. Do not include patient-sensitive details in subject lines or public preview text.
4. Configure Supabase Auth to use Brevo SMTP for auth-generated messages, with branded confirmation/reset/invitation templates and the existing canonical app URLs. Keep SMTP credentials distinct from the API credential used by Edge Functions.
5. Document the required runtime secret names and provider-side DNS/sender checks, without values. Do not change MX records or add inbound mail processing as part of outbound template work; confirm the support mailbox separately.

## Configuration boundary

- Edge Functions use a Brevo API key stored as the `BREVO_API_KEY` runtime secret.
- Supabase Auth uses Brevo SMTP configuration in the active self-hosted Supabase deployment; its SMTP credential is not interchangeable with the API key.
- `noreply@elolab.com.br` must be an authenticated sender in Brevo. `Reply-To` should route to a monitored EloLab support inbox once that mailbox is verified.
- Publish the logo over HTTPS on an EloLab-controlled host. Confirm Brevo sender-domain SPF/DKIM records before sending production mail. Avoid replacing existing mail MX records.

## Rollout and verification

- Add focused tests for template rendering/escaping, logo and action URL placement, text alternatives, Brevo request payloads, and handling of provider failure.
- Search the repository after migration to confirm no Resend API calls, Resend key references, or test sender addresses remain in active email code.
- Verify production secrets by presence only, with no value output; send controlled test messages to an approved test inbox and inspect Brevo delivery events.
- Configure and verify Supabase Auth SMTP separately, then exercise confirmation and password-reset links against the production app domain.
- Deploy only after the user reviews the implementation plan and runtime configuration is ready. Do not send real patient or customer emails as tests.

## Out of scope

- Creating or changing mailboxes and forwarding rules for `suporte@elolab.com.br` or `privacidade@elolab.com.br`.
- Building inbound email processing or support-ticket ingestion.
- Changing DNS MX records. Only provider-specified sender-authentication records may be proposed, and existing email records must be preserved.
- Changing message triggers, notification schedules, or recipient rules beyond what is needed to render the approved templates.
