# E10-analytics-consentimento (CLIN-QA-407)

Agente: frontend-developer. Data: 27/10/2026. Base: `docs/gtm/plano-analytics.md`.

## O que foi feito
- `src/lib/analytics.ts`, a camada B do plano:
  - Interface neutra `AnalyticsProvider` com `capturar` e `desativar`. Enquanto ninguém chamar `registrarProvedorAnalytics`, nada sai do navegador; a escolha da ferramenta é do responsável.
  - `track()` confere `getCookieConsent()?.analytics === true` a cada chamada, então a revogação vale sem recarregar a página. No evento `elolab:cookie-consent`, quando o consentimento sai, o módulo chama `desativar()`. As rotas do portal do paciente são ignoradas, e um erro do provedor não quebra a tela.
  - Cada evento tem sua lista de propriedades permitidas (`landing_viewed`, `plan_selected`, `signup_started`, `signup_submitted`, `checkout_viewed`, `checkout_completed`). O resto é descartado, e valores que parecem e-mail, CPF ou telefone também. Não há id de paciente, nome nem valores.
  - UTM e `seg`: `capturarUtm` grava só no `sessionStorage`, como pede a seção 5.2 do plano, e `anexarUtm` repassa a origem para o app.
- Instrumentação mínima:
  - `src/pages/LandingPage.tsx`: `landing_viewed`, com UTM, host do referrer e path.
  - `src/components/landing-v2/PricingSection.tsx`, onde fica o checkout da landing hoje: `plan_selected`, e os `utm_*`/`seg` acrescentados à URL `/auth?cadastro=1…`.
  - `src/pages/PlanoCheckout.tsx`: `checkout_viewed` e `checkout_completed`, com plano, modo e método (cartão, Pix ou boleto), sem valores.
- `src/components/CookieConsent.tsx` não precisou mudar, porque o módulo lê `src/lib/cookies.ts` diretamente.
- Testes em `src/lib/__tests__/analytics.test.ts` (14), seguindo o aceite da seção 3.4 do plano: sem escolha, com "Apenas essenciais", com consentimento, depois da revogação, sem provedor, em rota do paciente, propriedade proibida e UTM.

## Pendências
1. **Cadastro em `src/pages/Auth.tsx`, não feito.** O arquivo está travado pelo E06-mfa-servidor, que ainda não tem resumo. A mudança é pequena: `track('signup_started', { plan_slug, mode, ...capturarUtm() })` quando `cadastro=1`, `track('signup_submitted', …)` depois do `signUp` sem erro, e repassar `utm_*` ao `activationRedirect`. Dono: frontend-developer, depois do E06. Os eventos já estão no catálogo.
2. **Ativação não é evento de navegador.** Pela seção 2 do plano, ela é calculada no servidor (camada A: visões SQL e job diário). Dono: backend e database-engineer.
3. **Ferramenta, DPA e base legal:** decisão do responsável, requer avaliação especializada. Sem isso nenhum provedor é registrado.
4. **`COOKIE_CATALOG` em `src/lib/cookies.ts`:** o catálogo declara GA e Facebook Pixel, que não estão instalados. Ele precisa ser atualizado com o fornecedor real e `CONSENT_VERSION` passar a `1.1.0`, com revisão do DPO. O arquivo está fora da trava.
5. **Gravar a origem UTM na clínica** (`origem_utm`) exige migration local; é do database-engineer.

## Verificação (comandos reais)
- `npx tsc --noEmit -p tsconfig.app.json`: 0 erros.
- `npx vitest run src/lib/__tests__/analytics.test.ts src/pages/__tests__/LandingPage.test.tsx src/pages/__tests__/PlanoCheckoutResumo.test.tsx`: 3 arquivos e 31 testes aprovados.
- `npx eslint` nos 5 arquivos tocados: 0 erros. Os 6 avisos (`any` e `react-refresh`) já existiam.
