# Plano de analytics, funil e UTM

Data: 27/10/2026. Autor: `growth-marketing` (rodada 1). Status: proposta. Nada foi instalado, configurado nem publicado. Itens CLIN-QA-407 (eventos) e 412/416 (UTM, SEO).

## 1. Estado atual (observado no código)

| Fato | Evidência |
|---|---|
| Não há biblioteca de analytics nem captura de UTM | `grep -rn -E "gtag\|posthog\|plausible\|umami\|utm_\|dataLayer\|mixpanel\|amplitude" src index.html package.json` sem resultado (27/10/2026) |
| O consentimento já existe, com categorias `necessary`, `functional`, `analytics` e `marketing`, salvo em `localStorage` (`elolab_cookie_consent`, versão `1.0.0`) | `src/lib/cookies.ts:3-15,31-42` |
| Há um evento de navegador quando a pessoa escolhe os cookies: `elolab:cookie-consent` | `src/lib/cookies.ts:17,40` |
| **O catálogo de cookies declara Google Analytics (`_ga`, `_gid`) e Facebook Pixel (`_fbp`), que não estão instalados** | `src/lib/cookies.ts:113-129`; o banner mostra o catálogo (`src/components/CookieConsent.tsx:100`) |
| A landing (`elolab.com.br`) manda o cadastro para outro domínio (`app.elolab.com.br/auth?cadastro=1&plano=…&modo=…`). Os parâmetros da URL de origem não são repassados | `src/pages/LandingPage.tsx:284-295` |
| `localStorage` não é compartilhado entre `elolab.com.br` e `app.elolab.com.br`: o consentimento dado na landing não vale no app, e a pessoa vê o banner de novo | `src/lib/cookies.ts:21,38` (comportamento padrão do navegador) |
| Já existe um padrão de coleta própria com limite de taxa e remoção de e-mail e documento: `client-telemetry` → `client_error_events` | `supabase/functions/client-telemetry/index.ts:10,17,27` |
| O onboarding só fica completo com 5 passos, **incluindo uma sessão de WhatsApp conectada**, mesmo no plano Pro, que não tem agente de IA | `supabase/migrations/20261001210000_onboarding_requires_operational_readiness.sql:1,57-71`; `src/pages/OnboardingClinica.tsx:17` |
| Não há `sitemap.xml`; `robots.txt` libera tudo e não aponta sitemap | `ls public` (27/10/2026); `public/robots.txt` |

Consequência para o catálogo de cookies: hoje a política declara rastreadores que não usamos. Isso precisa ser corrigido quando a ferramenta escolhida entrar (seção 3.4), com revisão do encarregado (requer avaliação especializada).

## 2. Funil e definições

```
visita → cadastro → checkout → ativação → retenção → (pago e mantido)
```

| Etapa | Definição operacional | Fonte de verdade |
|---|---|---|
| Visita | Sessão na landing ou em página pública de segmento | Ferramenta de analytics (só com consentimento) ou contagem sem cookie (seção 3) |
| Cadastro | Conta criada em `/auth?cadastro=1` com e-mail confirmado | Supabase (`auth.users`, `profiles`) |
| Checkout | Pedido de plano criado e concluído (trial ou compra) | Supabase (pedidos e `assinaturas_plano`); não depende de cookie |
| Ativação | Clínica que, **em até 7 dias do cadastro**, tem: ≥ 1 pessoa da equipe convidada, agenda de pelo menos 1 profissional configurada, ≥ 1 serviço com preço, ≥ 1 agendamento **e ≥ 1 check-in na Recepção** | Supabase (contagem nas tabelas operacionais) |
| Retenção | Semana ativa = ≥ 3 dias distintos com check-in. Clínica retida na semana N se ativa na semana N | Supabase |
| Pago e mantido | Assinatura paga ativa em D60 | Supabase |

Por que a ativação não usa `clinic_onboarding_state.completed_at`: esse campo exige WhatsApp conectado (seção 1). Uma clínica Pro que usa agenda, recepção e caixa todo dia ficaria "não ativada". Sugestão ao produto: tornar o passo de WhatsApp opcional no Pro (fora do escopo desta tarefa).

O check-in é o sinal de valor porque prova uso real da recepção e gera cobrança (`src/lib/checkinWithBilling.ts:35-97`). A definição deve ser revista depois do beta, com dados.

## 3. Ferramenta e consentimento

### 3.1 Arquitetura em duas camadas

1. **Camada A, servidor (sem cookie):** cadastro, checkout, ativação e retenção são calculados no próprio Supabase, a partir das tabelas que já existem, por visões ou uma tabela `eventos_funil` gravada pelas edge functions (`public-checkout`, `mercadopago-webhook`) e por triggers. Nenhum terceiro recebe esses dados. Base legal provável: legítimo interesse do controlador sobre dados da clínica cliente (pessoa jurídica e usuários administradores), **requer avaliação especializada** (encarregado/DPO) e registro no inventário de tratamento.
2. **Camada B, navegador (com consentimento):** visita, cliques de CTA e uso de telas. Só carrega quando `getCookieConsent()?.analytics === true`.

A camada A responde sozinha à pergunta "quantos cadastros viram clínicas ativas e pagas". Ela deve vir primeiro.

### 3.2 Escolha da ferramenta da camada B

| Opção | Onde ficam os dados | Cookie | Custo público | Prós | Contras |
|---|---|---|---|---|---|
| **PostHog Cloud EU** (recomendada) | UE (Frankfurt) | Sim, configurável para memória | 1 milhão de eventos/mês grátis; acima disso, por evento (posthog.com/pricing e posthog.com/eu, consultados em 27/10/2026) | Funis, coortes e retenção prontos; SDK com `opt_in_capturing`/`opt_out_capturing`; não exige infraestrutura nossa | Terceiro estrangeiro: transferência internacional (art. 33 da LGPD), requer avaliação especializada e DPA assinado |
| PostHog autohospedado | VPS própria | Sim | Licença livre; custo de infraestrutura | Dados não saem da nossa infraestrutura | A VPS já tem P0 de backup (005) e não tem observabilidade (015). Não adicionar carga agora |
| Plausible (nuvem UE) ou Community Edition | UE ou VPS | Não usa cookie | Planos pagos por volume de pageviews; valores divergentes nas fontes encontradas, NÃO VERIFICADO na página oficial (plausible.io/pricing retornou 404 em 27/10/2026) | Sem cookie na landing; pode medir visitas sem banner | Não faz funil de produto por usuário; seria uma segunda ferramenta |
| Google Analytics 4 | EUA | Sim | Grátis | Integração com anúncios | Envio a terceiro nos EUA, modelo de dados para publicidade; não recomendado para software de saúde |

Recomendação: camada A no Supabase, mais PostHog Cloud EU para a camada B, com:

- `autocapture: false`, `capture_pageview` manual, `disable_session_recording: true` (gravação de sessão desligada: telas mostram dado de paciente);
- `mask_all_text` e `mask_all_element_attributes` ligados, mesmo sem gravação;
- `persistence: 'memory'` até o consentimento e `localStorage+cookie` depois;
- `ip: false` / descarte de IP no projeto;
- `person_profiles: 'identified_only'`, identificando só por `user_id` (UUID), nunca por e-mail ou nome;
- nenhuma rota do portal do paciente (`/portal-paciente`, `/agendar/:clinicaId`, `/portal-guias/:token`, `/verificar-assinatura/:codigo`) instrumentada: o titular ali é o paciente.

A escolha final e o DPA dependem do responsável e de avaliação especializada.

### 3.3 Ligação com o `CookieConsent`

Módulo proposto `src/lib/analytics.ts` (não criado nesta rodada):

1. Na inicialização do app, ler `getCookieConsent()` (`src/lib/cookies.ts:19`). Se `analytics === true`, carregar o SDK por import dinâmico; senão, não carregar nada.
2. Ouvir `window.addEventListener('elolab:cookie-consent', …)` (`src/lib/cookies.ts:17`): ao aceitar, carregar e chamar `opt_in_capturing()`; ao recusar, chamar `opt_out_capturing()` e `reset()`.
3. Em `revokeCookieConsent()` (`src/lib/cookies.ts:52`), chamar `opt_out_capturing()`, `reset()` e apagar os cookies do fornecedor (prefixo `ph_`) em `clearNonEssentialCookies`.
4. Expor só `track(evento, props)` e `page(nome)`. Quando não houver consentimento, `track` não faz nada. Nenhuma tela importa o SDK diretamente.
5. `track` aplica uma lista de propriedades permitidas por evento (seção 4) e descarta o resto, reaproveitando a limpeza de e-mail e documento de `client-telemetry/index.ts:10`.
6. Atualizar `COOKIE_CATALOG` (`src/lib/cookies.ts:112-129`): remover GA e Facebook Pixel, declarar o cookie real do fornecedor escolhido, e subir `CONSENT_VERSION` para `1.1.0`, o que faz o banner aparecer de novo (`src/lib/cookies.ts:24`). Revisar `src/pages/PoliticaCookies.tsx` junto.
7. Categoria `marketing` continua sem uso. Pixel de anúncio só com pedido do responsável.

Dois domínios: o consentimento da landing não passa para o app. Opções: (a) aceitar que o app pergunte de novo (mais simples, recomendado agora); (b) cookie de consentimento no domínio `.elolab.com.br` (decisão do responsável, requer avaliação especializada).

### 3.4 Teste de aceite da integração

- Sem escolha no banner: nenhuma requisição ao domínio do fornecedor na aba Rede.
- "Apenas essenciais": nenhuma requisição e nenhum cookie `ph_*`.
- "Aceitar todos" e depois revogar: requisições param e cookies `ph_*` somem.
- Teste unitário de `track` sem consentimento (não chama o SDK) e com propriedade proibida (descartada).

## 4. Dicionário de eventos

Nomes em inglês, `snake_case`. Propriedades proibidas em qualquer evento: nome, e-mail, telefone, CPF, data de nascimento, IDs de paciente, texto livre, conteúdo clínico, valores de atendimento.

| Evento | Camada | Onde dispara | Propriedades permitidas |
|---|---|---|---|
| `landing_viewed` | B | `LandingPage.tsx` ao montar | `utm_*`, `seg`, `referrer_host`, `path` |
| `cta_clicked` | B | Botões de CTA da landing | `cta_id`, `section`, `plan_slug` |
| `plan_selected` | B | `openCheckout` (`LandingPage.tsx:278`) | `plan_slug`, `mode` (`trial`/`buy`) |
| `signup_started` | B | `Auth.tsx` com `cadastro=1` (`:74`) | `plan_slug`, `mode`, `utm_*` |
| `signup_completed` | A | Confirmação de e-mail / criação do perfil | `user_id`, `plan_slug`, `mode`, `utm_*`, `seg` |
| `checkout_started` | A | Criação do pedido em `public-checkout` | `plan_slug`, `mode`, `metodo` (`cartao`/`pix`/`boleto`) |
| `checkout_completed` | A | Aprovação no `mercadopago-webhook` ou ativação de trial | `plan_slug`, `mode`, `metodo` |
| `checkout_failed` | A | Recusa ou erro no pagamento | `plan_slug`, `motivo_codigo` (código, sem texto livre) |
| `onboarding_step_completed` | A | Mudança em `clinic_onboarding_state` | `step` (`team`, `schedule`, `services`, `whatsapp`, `appointment`) |
| `first_appointment_created` | A | Primeiro agendamento da clínica | `canal` (`interno`, `link`, `whatsapp`) |
| `first_checkin_done` | A | Primeiro check-in | — |
| `activated` | A | Job diário que aplica a definição da seção 2 | `dias_ate_ativar` |
| `weekly_active_clinic` | A | Job semanal | `semana`, `dias_com_checkin` |
| `trial_converted` | A | Primeira cobrança paga após trial | `plan_slug`, `dias_de_trial` |
| `subscription_canceled` | A | Cancelamento | `plan_slug`, `motivo` (lista fechada) |
| `feature_used` | B | Telas principais, no máximo 1 por tela por dia | `feature` (lista fechada: `agenda`, `recepcao`, `prontuario`, `caixa`, `laboratorio`, `whatsapp_ia`) |

Todo evento da camada A leva `clinica_id`; nenhum leva dado de paciente. Painel mínimo: funil semanal visita → cadastro → checkout → ativação, por `utm_source` e por `seg`; coorte semanal de retenção.

## 5. UTM

### 5.1 Convenção

| Parâmetro | Regra | Exemplos |
|---|---|---|
| `utm_source` | Origem, minúsculas | `google`, `instagram`, `linkedin`, `whatsapp`, `email`, `indicacao`, `evento` |
| `utm_medium` | Tipo de mídia | `cpc`, `social`, `organic`, `email`, `referral`, `parceiro` |
| `utm_campaign` | `aaaa-mm_tema`, com hífen | `2026-11_clinicas-caixa` |
| `utm_content` | Variante de peça ou CTA | `banner-a`, `cta-planos` |
| `utm_term` | Palavra-chave paga | `sistema-para-clinica` |
| `seg` (próprio) | Segmento da página | `clinica`, `laboratorio`, `rede`, `odonto` |

Uma planilha de links gerados (dono: Growth) evita variações. Links internos não levam UTM.

### 5.2 Captura e persistência

1. Na landing, ler `utm_*` e `seg` da URL na primeira visita da sessão e guardar em `sessionStorage` (dura a aba; não persiste entre visitas sem consentimento).
2. Se houver consentimento de analytics, enviar também como propriedade do `landing_viewed` (primeiro toque fica na ferramenta).
3. Em `handleCheckout` (`LandingPage.tsx:284-295`), **acrescentar os `utm_*` e `seg` aos parâmetros** de `/auth`. Sem isso a origem se perde na troca para `app.elolab.com.br`.
4. Em `Auth.tsx`, ler os parâmetros e enviar no cadastro; gravar na clínica (`origem_utm` em JSON, colunas novas por migration local, não aplicada) no `signup_completed`. É a atribuição de último toque antes do cadastro.
5. Formulário de interesse de redes e laboratório (CLIN-QA-412) grava os mesmos campos.

Base legal da gravação da origem no cadastro: legítimo interesse, **requer avaliação especializada**. Sem consentimento de analytics, não usar cookie nem `localStorage` para UTM.

## 6. SEO técnico e páginas por segmento (planejamento)

- `public/sitemap.xml` com `/`, `/demonstracao`, `/politica-privacidade`, `/politica-cookies`, `/termos-uso` e as páginas de segmento quando existirem; linha `Sitemap:` em `public/robots.txt`.
- Excluir do sitemap e marcar `noindex`: `/auth`, `/portal-paciente`, `/agendar/*`, `/portal-guias/*`, `/verificar-assinatura/*`.
- Pré-renderizar as páginas públicas (SPA prejudica indexação) e adicionar dados estruturados `SoftwareApplication` sem nota ou avaliação inventada.
- Páginas por segmento só depois do smoke das jornadas: `/clinicas` primeiro; `/laboratorios` depois do código de barras (013); `/redes` como formulário de interesse.

## 7. Ordem de implementação proposta

| # | Entrega | Dono | Esforço | Aceite |
|---|---|---|---|---|
| 1 | Visões SQL da camada A (cadastro, checkout, ativação, retenção) em migration local | Backend + DBA | M | Consulta devolve o funil em staging com dados sintéticos |
| 2 | Repasse de UTM em `handleCheckout` e gravação no cadastro | Front | S | Cadastro vindo de link com UTM grava a origem na clínica |
| 3 | `src/lib/analytics.ts` com gate de consentimento e testes | Front | M | Testes da seção 3.4 passam |
| 4 | Catálogo de cookies e política atualizados | Front + DPO | S | Catálogo lista só o que existe |
| 5 | Painel do funil e coorte | Growth | S | 7 dias de dados visíveis (aceite do CLIN-QA-407) |
| 6 | Sitemap, `noindex` e dados estruturados | Front + Growth | S | Search Console sem erro de sitemap |

Pré-requisito do responsável: aprovar a ferramenta, o DPA e a base legal (requer avaliação especializada) antes do item 3.

Fontes consultadas em 27/10/2026: [PostHog pricing](https://posthog.com/pricing), [PostHog EU](https://posthog.com/eu). Plausible: [plausible.io/pricing](https://plausible.io/pricing) retornou 404; valores de terceiros não usados.
