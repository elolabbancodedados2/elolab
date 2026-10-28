# Checkout Mercado Pago dos planos — estado e próximos passos

Última atualização: 08/10/2026. Branch: `codex/sync-elolab-deploy-20261008`. O checkout sandbox foi publicado no frontend e nas Edge Functions da VPS. A migration `20261010197000_checkout_transparente_planos.sql` foi aplicada ao banco da VPS após backup validado em `/var/backups/elolab/pre-mp-sandbox-20261008T135341Z.dump`.

Resumo do fluxo em [`PAYMENT_AND_TRIAL_FLOWS.md`](./PAYMENT_AND_TRIAL_FLOWS.md#checkout-transparente-dos-planos-planoscheckoutslug).

## Decisões (validadas na documentação oficial e no sandbox)

- **A API de Orders não faz recorrência.** Cobrança recorrente usa a API de Assinaturas (`/preapproval`).
- **Cartão:** `POST /preapproval` com `card_token_id` + `status: "authorized"`; o token vem do Card Payment Brick (`@mercadopago/sdk-react`). O Mercado Pago faz uma cobrança mínima de validação e devolve; a primeira cobrança sai em ~1 h (ou em `start_date`, usado para o teste grátis e para não cobrar quem ainda tem período pré-pago).
- **Pix:** `POST /v1/orders`, pagamento único de um período (mensal = 1 mês, anual = 12). Não renova sozinho.
- **Boleto removido do checkout de planos em 13/10/2026:** novas ordens são rejeitadas pelo servidor. Ordens já emitidas continuam consultáveis e podem ser pagas ou canceladas até serem resolvidas; não são apagadas nem canceladas automaticamente.
- Para Pix, o formulário coleta endereço completo; o servidor envia CEP, rua, número (ou `S/N`), bairro, cidade e UF no objeto `payer.address`.
- O frontend inicializa MercadoPago.js V2 por `@mercadopago/sdk-react`; captura `MP_DEVICE_SESSION_ID` e envia como `X-Meli-Session-Id` nos pedidos e assinaturas.
- Orders incluem `config.statement_descriptor: "ELOLAB"`.
- A Orders API aceita nome, sobrenome, documento e endereço em `payer`, além de `title` e `category_id` em `items`. O sandbox rejeitou `additional_info.payer.registration_date` como propriedade não suportada; a referência atual de criação de Orders também não lista esse campo, então ele fica fora do payload.
- **Cliente recorrente ativo não pode pagar Pix** (409) até cancelar, para não pagar duas vezes.
- O módulo financeiro de pacientes (`pagamentos_mercadopago`, `lancamentos`) **não foi alterado**.

## Armadilhas confirmadas no sandbox

| Ponto | Comportamento real |
|---|---|
| Cancelar assinatura | `PUT /preapproval/{id}` só aceita `{"status":"cancelled"}` (dois "l"). `"canceled"` volta 400. O código antigo usava `canceled` e foi corrigido em todos os lugares. |
| `X-Idempotency-Key` | Obrigatório em **todo POST** da API de Orders, inclusive `/v1/orders/{id}/cancel`. `mercadoPagoClient.ts` gera um automaticamente. |
| Order recusada | `POST /v1/orders` responde **402** com a order `failed` em `body.data`. |
| Webhook de order | Assinatura usa `data.id` da query string **em minúsculas** no manifest. A mesma order notifica várias vezes; a chave de idempotência inclui ação e status (`webhookEventKey`). |
| Sandbox de assinaturas | Pagador e vendedor precisam ser **usuários de teste**; e-mail comum dá "Both payer and collector must be real or test users". |
| Pix no sandbox | Não é pago automaticamente. A aprovação foi validada com uma order de cartão de teste (APRO). |
| Cartão CONT em assinatura | Volta 400 `CC_VAL_433` (tratado como recusa). |

## Arquivos

- Servidor:
  - `supabase/functions/mercadopago-checkout/planCheckoutActions.ts`: ações `billing_status`, `create_card_subscription`, `create_plan_order`, `get_plan_order` e `cancel_plan_order`, registradas em `index.ts`.
  - `supabase/functions/_shared/planCheckout.ts`: regras puras (status, payloads, validação de CPF/CNPJ e endereço, chave do webhook).
  - `supabase/functions/_shared/platformPlanOrders.ts`: aplica o estado da order via RPC.
  - `supabase/functions/_shared/platformPlanSync.ts`: `syncPlatformPlan`, extraído do webhook sem mudar a regra, com proteção do período pré-pago.
  - `supabase/functions/_shared/mercadoPagoClient.ts`: retry só em rede, 429 e 5xx, e idempotência.
  - `supabase/functions/_shared/mercadoPagoSignature.ts`: validação do `x-signature`.
  - `supabase/functions/mercadopago-webhook/index.ts`: trata o tópico `order` e usa os módulos acima.
- Banco: `supabase/migrations/20261010197000_checkout_transparente_planos.sql`.
  - Tabela `platform_plan_orders`, com no máximo um pedido aberto por usuário.
  - Coluna `assinaturas_plano.cobranca_modalidade`.
  - RPC `aplicar_status_pedido_plano()`, que libera o período uma única vez.
  - `expirar_planos_pre_pagos()` com o cron `expire-prepaid-platform-plans`.
- Front:
  - `src/pages/PlanoCheckout.tsx` (rota `/planos/checkout/:slug`).
  - `src/hooks/usePlanCheckout.ts`.
  - `src/pages/Planos.tsx`: os botões levam ao checkout, e há aviso do período pré-pago.
- Infra: `docker/security-headers.conf`, cujo CSP agora libera `*.mlstatic.com` e `*.mercadolibre.com` para o Brick.
- Testes:
  - `src/lib/__tests__/{planCheckout,platformPlanOrders,mercadoPagoClient,mercadoPagoSignature}.test.ts`, com fixtures reais do sandbox em `fixtures/`.
  - `scripts/mercadopago-sandbox-e2e.ts`, rodado por `npm run test:mp-sandbox`.

## Como validar

```bash
npx vitest run                         # 687+ testes
npx tsc --noEmit -p tsconfig.app.json
cd supabase/functions && npx -y deno@2 check --no-lock --config=deno.json mercadopago-checkout/index.ts mercadopago-webhook/index.ts
npm run test:mp-sandbox                # 17/17 em 08/10/2026
```

`test:mp-sandbox` lê `supabase/functions/.env.local` (fora do git) e **aborta se o token não for de usuário de teste** (`/users/me` precisa ter a tag `test_user`). Cancela pedidos Pix pendentes e assinaturas de teste; a order aprovada é mantida no sandbox para permitir medir a integração, e seu ID aparece no resultado. Variáveis desse arquivo:
- `MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_PUBLIC_KEY`, as credenciais de teste.
- `MERCADOPAGO_ENV=sandbox`.
- `MERCADOPAGO_TEST_PAYER_EMAIL`, o e-mail da conta compradora de teste "teste1".

Nunca copie os valores para commits, logs ou respostas.

## Execução adicional em 13/10/2026

`npm run test:mp-sandbox` confirmou a tag `test_user` e passou em **15/15 cenários**. Foram exercitados criação/idempotência/cancelamento de Pix, order de cartão aprovada e recusada, assinatura recorrente/cancelamento, validação e repetição de webhook e falha de comunicação. Os itens temporários foram cancelados; a order APRO aprovada foi mantida no sandbox como previsto no script. Isso não valida o fluxo do navegador nem uma entrega real do webhook pelo painel, que continuam pendentes.

## Correções locais em 13/10/2026 (ainda não publicadas)

- A elegibilidade ao teste passou a consultar `platform_plan_trial_claims` e a assinatura de plano no servidor. `user_metadata.checkout_flow` e `checkout_plan_slug` não concedem teste; o histórico legado é migrado para a nova tabela e uma chave única por usuário evita reservas concorrentes.
- O Card checkout exige `trial_consent: true` na requisição. A tela mostra o valor, o início da cobrança recorrente, as renovações e o encerramento do acesso ao cancelar.
- O cancelamento segue `assinaturas_plano.mp_assinatura_id` para escolher a assinatura recorrente ativa específica, e falha se o registro de gateway ou o vínculo do plano não for atualizado.
- Uma recusa definitiva do cartão libera a reserva de teste que ainda não iniciou; timeout/5xx mantém a reserva porque o resultado no gateway é desconhecido. Isso evita bloquear tentativas após recusa sem permitir cobranças duplicadas após falha de comunicação.
- Foi criada localmente a migration aditiva `20261013140000_platform_plan_trial_claims.sql`. Ela **ainda precisa ser revisada e aplicada antes de publicar a Edge Function**; nenhuma migration ou deploy foi executado neste trabalho.
- A migration OAuth da clínica recebeu a versão local única `20261010198100` porque compartilhava o prefixo `20261010198000` com `checkout_provisionamento_seguro.sql`. Foi apenas uma correção de ordenação/nome de arquivo; nenhuma migration foi aplicada.
- Verificação local: testes Deno sintéticos (10/10) com permissão apenas para `MERCADOPAGO_ENV` e `SUPABASE_URL`, `deno check` da Edge Function, `tsc --noEmit`, 9 testes unitários de Planos e 3 cenários Chromium desktop do checkout/cancelamento. Nenhum token, chamada de gateway, pagamento, migration ou deploy foi usado nestas verificações.
- Os testes usam apenas dados sintéticos. O fluxo de cancelamento via interface e a resposta de uma conta real de sandbox não foram exercitados; isso continua dependendo de credenciais de usuário de teste e de validação no sandbox.

## Estado do deploy sandbox (08/10/2026)

- Front publicado em `https://app.elolab.com.br`, imagem `easypanel/elolab/app:mp-sandbox-20261008`; `/healthz` respondeu HTTP 200 e o HTML aponta para o bundle que contém a rota de checkout.
- `mercadopago-checkout` está publicado no runtime da VPS; chamada GET retorna 405, como esperado para a função que aceita POST. A rota `/planos/checkout/elolab-max` entrega o app (HTTP 200).
- `mercadopago-webhook` está publicado. Um evento `order.processed` de sandbox, assinado com o segredo configurado no ambiente do serviço, foi aceito com HTTP 200. A repetição foi reconhecida como duplicada. O evento de probe não estava ligado a uma compra EloLab e por isso não alterou assinatura alguma.
- As credenciais instaladas na VPS são de **sandbox**. Nenhuma cobrança real foi criada.
- O painel Mercado Pago mostrou os tópicos `Order`, `Pagamentos (legacy)` e `Planos e assinaturas` selecionados. A entrega real de notificação pelo painel ainda precisa ser confirmada com uma compra de teste.
- A suíte sandbox foi repetida em 08/10/2026: 17/17 cenários OK. Order aprovada com endereço, descritor de fatura e Device ID para medir qualidade: `ORDTST01M4E30MPWXQWX68R0XD646151`.

## OAuth opcional por clínica e Mercado Pago Point

- `mercadopago-oauth` inicia Authorization Code com `state` de uso único e PKCE; troca o código apenas no servidor, valida `user_id` em `/users/me` e cifra os tokens com `INTEGRACOES_CHAVE_CRIPTO`.
- O refresh token é rotacionado com lock por clínica e gravação condicional, para não sobrescrever uma desconexão concorrente. As chamadas Point usam exclusivamente o token OAuth da clínica; as cobranças dos planos SaaS continuam usando `MERCADOPAGO_ACCESS_TOKEN` da plataforma.
- O webhook `mp-connect` trata `application.deauthorized` e apaga a cópia local dos tokens. O botão Desconectar também apaga o token local. A revogação da autorização no Mercado Pago deve ser feita nas configurações da conta do vendedor; o Mercado Pago não oferece endpoint OAuth de revogação nesta API.
- As Orders Point usam `mercadopago_point_orders`, token OAuth da clínica, idempotência e RPCs para registrar/estornar no livro `pagamentos`. Não escrevem em `pagamentos_mercadopago` nem nas tabelas de cobrança do SaaS.
- Uma cobrança por fatura é garantida agora também por índice único parcial. A migração aborta sem apagar dados se encontrar cobranças abertas duplicadas. Se a resposta da criação se perder, o backend repete a mesma order com a chave idempotente e os valores já gravados.
- Validação local de OAuth/Point: Deno type-check. Ainda é necessário validar autorização e revogação com uma clínica de QA isolada e uma conta Mercado Pago própria antes de liberar Point em produção.

## Pendências (em ordem)

1. **Validar o fluxo completo no navegador** com usuário e cartão de teste: autorização recorrente no cartão, cancelamento e Pix (pagamento único). Confirmar que as mudanças de status chegam pelo webhook real do painel.
2. **Confirmar persistência no painel** da URL `https://api.elolab.com.br/functions/v1/mercadopago-webhook` e dos tópicos `Order`, `Pagamentos (legacy)` e `Planos e assinaturas`. O endpoint e o segredo já estão configurados na VPS; não há confirmação de que o botão de salvar do painel foi acionado.
3. **Regra de inadimplência pedida pelo produto:** o bloqueio atual ainda usa 7 dias de carência para planos pré-pagos e não suspende com segurança a assinatura recorrente após 3 dias sem pagamento. Ajustar e validar essa regra antes de considerar a cobrança pronta para clientes.
4. **Ainda não implementado:** lembrete por e-mail antes do vencimento do período Pix (hoje só há aviso em `/planos`). O checkout da landing (`public-checkout`) continua no fluxo hospedado antigo.
5. **Depois da validação sandbox:** trocar para credenciais de produção somente com autorização explícita do responsável.
   - backup;
   - migration;
   - secrets de produção, sem `MERCADOPAGO_ENV` e sem `MERCADOPAGO_TEST_PAYER_EMAIL`;
   - deploy de `mercadopago-checkout`, `mercadopago-webhook` e `public-checkout`;
   - deploy do front e do CSP.

### 13/10/2026 — IDs de revogação OAuth do webhook e cabeçalhos por requisição

- O Mercado Pago documenta `data.id` como parâmetro de query usado na assinatura e inclui `data.id` e `user_id` no corpo de `mp-connect`. Para eventos externos, o handler agora não substitui a query pelo ID do corpo; somente retries internos autenticados por `CRON_SECRET` podem usar o payload persistido quando a query não existe.
- Antes de gravar log ou revogar, `application.deauthorized` exige que query autenticada, `data.id` do corpo e `user_id` coincidam. IDs ausentes ou divergentes são rejeitados antes de criar um log pendente. Testes Vitest cobrem seleção do ID externo/interno, correspondência do vendedor e divergências do recurso.
- Os cabeçalhos CORS do webhook agora ficam locais à execução da requisição, eliminando estado mutável compartilhado entre chamadas concorrentes.
- Vitest dos módulos de assinatura/roteamento: 22 testes passaram; Deno check da Edge Function passou; ESLint, TypeScript e `git diff --check` passaram. Nenhum segredo foi lido ou exibido; sem chamada a API Mercado Pago, gravação, migration ou deploy.
- **Pendente:** a assinatura HMAC do Mercado Pago cobre o ID de query, request ID e timestamp, não os campos `action`/`id` do corpo. Portanto, esta alteração fecha inconsistências de alvo, mas não prova por si só a autenticidade criptográfica de `application.deauthorized`; confirmar um meio autoritativo adicional antes de tratar essa automação como prova suficiente para apagar credenciais.
- Documentação oficial: [notificações opcionais e tópico mp-connect](https://www.mercadopago.com.br/developers/en/docs/checkout-api-orders/optional-notifications).
# Revisão de concorrência de webhooks — 13/10/2026

- Adicionada migration aditiva `20261013160000_mercadopago_webhook_atomic_claim.sql` com RPC `claim_mercadopago_webhook`, lease e token de aquisição. A migration não foi aplicada.
- O handler passou a adquirir o evento atomicamente, retornar `503` com `Retry-After` quando outra entrega estiver ativa, ignorar eventos já processados e só marcar sucesso/liberar lease com o token atual.
- Revogação OAuth sem confirmação autoritativa continua pendente para revisão manual; agora responde `200` após persistir essa decisão, para o Mercado Pago não repetir indefinidamente um evento que não pode ser processado automaticamente.
- A chave de eventos de Orders continua incluindo ação/status. Nenhuma tabela financeira de pacientes foi alterada.
- Validação pendente: executar a migration e testar duas sessões concorrentes, expiração/reclaim, fencing de worker antigo, retry após erro e duplicata já processada em banco descartável. `deno check` via `npx deno@2` passou; o banco descartável não está disponível, portanto a RPC e a corrida não foram executadas. Sem deploy ou teste sandbox.
- Limite conhecido: lease impede processamento simultâneo do mesmo `event_id`, mas não torna efeitos externos exactly-once. Atualizações de pagamentos/assinaturas e e-mails precisam manter idempotência própria; um crash após efeito e antes da confirmação pode causar retry. O fluxo de revogação OAuth adiado permanece auditável e não remove credenciais sem confirmação autoritativa.

## Estado consolidado — 13/10/2026

Esta seção substitui as pendências antigas acima quando houver divergência:

- **Inadimplência recorrente:** migration local `20261013200000_recurring_plan_delinquency.sql` aplica bloqueio de escrita após 72 horas de uma fatura explicitamente não paga, usa `debit_date` (ou `date_created`) e libera o bloqueio quando uma cobrança posterior da mesma assinatura é aprovada. Leituras e exportações seguem disponíveis. O período pré-pago e cancelado conserva sete dias de carência.
- **Avisos:** `payment-reminder` enfileira aviso da fatura recorrente após 72 horas, aviso do período pré-pago antes do fim e lembretes nos dias 0, 3 e 6 após expirar. A migration acrescenta índice único parcial para impedir duplicação concorrente desses avisos.
- **Landing e endpoint antigo:** o fluxo local de cadastro já leva a intenção para `/planos/checkout/:slug`. O POST de `public-checkout` agora responde HTTP 410 e não cria mais cadastro nem assinatura hospedada. A rota transparente autenticada permanece.
- **Banco isolado sem Docker:** as duas migrations de inadimplência e claim de webhook foram executadas em Postgres embutido PGlite. Passaram 8 cenários de acesso (72h, recuperação aprovada, datas/status ausentes, equipe e carência pré-paga) e 5 cenários de claim (concorrência, reclaim, token antigo, retry e duplicata processada). Isso não substitui validação no runtime/RLS do Supabase. Nenhuma migration foi aplicada ao Supabase, remoto ou local.
- **Testes:** `npm run test:mp-sandbox` passou em 15/15; Vitest completo, 1.231 testes; Playwright focado, 12/12; Deno policy/endpoint, 8/8; TypeScript e Deno checks passaram. O teste sandbox manteve a order APRO aprovada conforme comportamento do script.
- **Ainda depende do responsável pela conta:** concluir a validação por telefone exigida pelo painel do Mercado Pago, salvar/confirmar os tópicos e URL, e fazer checkout real de teste no navegador para observar autorização, cancelamento, Pix e webhook entregue pelo painel. O Playwright foi sintético e não substitui essa validação de conta.
- **Revisão pendente:** revogação OAuth continua adiada porque a assinatura HMAC cobre o ID da query, não autentica por si só `action`/`user_id` do corpo.
- **Publicação:** as migrations novas e alterações locais ainda exigem revisão antes de publicar. Não houve deploy, aplicação de migration no Supabase (local ou remoto), alteração de produção, stage ou commit.
## Rechecagem do deploy completo — 14/10/2026

Esta seção atualiza os estados anteriores que diziam que as alterações ainda estavam somente no checkout.

- **Release publicado:** snapshot `d8221152dbcf7b1b66f9bf3c4d1fa41ab03f8ca7`, branch Git `codex/local-full-release-20261013235452`. A imagem `elolab-web-rag:local-d822115` publica esse build ID em `/version.json`.
- **App:** a faixa persistente de atualização aparece no app e orienta reportar erro/instabilidade para `contato@focussdev.art` ou `(33) 98412-3591`. `/healthz`, `/`, `/auth`, `/dashboard` e `/planos` responderam HTTP 200.
- **Banco:** as 14 migrations identificadas como ausentes foram aplicadas; comparação posterior confirmou que nenhum timestamp existente em `supabase/migrations` ficou sem registro no ledger. Foi necessário reconciliar tabelas de diagnósticos que faltavam apesar do ledger antigo afirmar que a migration base havia rodado. O backup pré-alteração validado está em `/var/backups/elolab/pre-local-complete-20261014T030207Z.dump`.
- **Edge Functions:** fontes do release copiadas para o volume do runtime e reiniciadas. `trial-with-payment` responde 410 sem efeitos de cobrança; `hello` responde 404. O código anterior dessas duas rotas foi preservado em `/var/backups/elolab/closeout-20261014T033937Z/retired-functions.tar.gz`. O diretório `_secrets` e o entrypoint `main` foram preservados. A configuração `supabase/config.toml` foi sincronizada; o Compose self-hosted não a monta no Edge Runtime, mas ela permanece como configuração fonte para CLI.
- **Sandbox depois do deploy:** `npm run test:mp-sandbox` confirmou usuário de teste e passou em 15/15 cenários. A order aprovada desse teste permanece no sandbox conforme o comportamento documentado do script; nenhuma credencial de produção foi instalada ou usada.
- **Ainda pendente:** checkout visual completo no navegador e entrega real de webhook pelo painel Mercado Pago precisam de conta/usuário de teste acessível e confirmação dos tópicos/URL no painel. A validação de RLS/exportação/FHIR contra o runtime Supabase precisa de projeto descartável; o marcador de QA descartável não está configurado. O teste sintético local passou, mas não substitui esses checks.
- **Sem destino externo configurado:** não há `rclone` nem `restic` na VPS. O backup produzido nesta operação está na própria VPS; falta um bucket/destino externo autorizado e suas credenciais provisionadas fora do chat. Também continuam sem evidência o ensaio de restore e RPO/RTO.
- **Produção financeira:** o checkout continua usando a configuração sandbox documentada. A mudança para credenciais reais exige autorização específica e não foi feita nesta publicação.

A URL da PR será registrada após sua criação e o resultado do CI.

## Checkout e assinatura — itens 61–70 do roadmap (24/10/2026, local, não publicado)

- **Resumo antes do gateway:** o resumo do checkout mostra periodicidade e a data/valor da primeira cobrança (hoje, fim do teste ou fim do período pré-pago), com valores de `billing_status`.
- **Retomada do cartão:** cada tentativa grava `checkout_reference`, enviado como `external_reference` e `X-Idempotency-Key` do `POST /preapproval`. Antes de criar outra assinatura, `create_card_subscription` procura tentativas pendentes sem ID do gateway em `GET /preapproval/search?payer_email=…` e casa pelo `external_reference`: autorizada para o mesmo plano é adotada (`retomado: true`), outra é vinculada e cancelada; sem resposta do gateway a função responde 503 sem criar nada. Limite: se a busca ainda não indexou a assinatura, ela conta como não criada; o webhook continua reconciliando pelo `external_reference`. O filtro `payer_email` e a indexação da busca não foram validados no sandbox.
- **Recursos contratados no servidor:** `clinica_recurso_plano_liberado(clinica, recurso)` (service role) exige assinatura ativa/teste vigente do dono, sem fatura recorrente vencida há 72 h, com o recurso no plano. O agente de IA do WhatsApp (`whatsapp-webhook`) e `whatsapp-agent-knowledge` exigem `agente_ia`.
- **Uso do plano:** `uso_plano_clinica()` devolve limites, uso e `verificado_em`; Configurações → Plano mostra a cota restante; o convite de equipe usa a mesma resposta.
- **Histórico separado:** o diálogo de faturas lia `pagamentos_mercadopago` (pacientes). Agora usa `historico_cobranca_assinatura()` (tentativas no cartão, pedidos Pix e faturas recorrentes), sem dados de cartão nem payload do provedor. O financeiro de pacientes não foi alterado.
- **Webhook:** o claim conta `repeticoes` de eventos já processados; orders recebem `sinal_ordem` `repetido`/`fora_de_ordem` depois de aplicar o estado atual do gateway. `platform_billing_overview` expõe os sinais.
- **Reconciliação:** `platform_checkout_attempts()` e `platform_reconciliar_cobranca()` no painel Cobranças, com justificativa obrigatória e `audit_log`. Só ajusta o registro local, sem chamar o Mercado Pago. O registro de cancelamento passou a gravar em `audit_log.changes` (antes usava `details`, coluna inexistente).
- **Aviso de alteração:** trigger em `planos` registra preço/limite alterados, enfileira e-mail para assinantes ativos e `/planos` mostra o efeito. Limites passam a valer no momento da alteração.
- **Cancelamento:** os diálogos mostram a data do cancelamento, o fim antecipado do teste e que os dados não são apagados.
- **Migrations locais, não aplicadas:** `20261024140000` a `20261024144000`. Validadas em PGlite com esquema sintético mínimo (aplicação dupla e cenários). Isso não substitui RLS/runtime do Supabase.
