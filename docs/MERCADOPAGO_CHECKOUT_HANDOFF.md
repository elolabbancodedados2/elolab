# Checkout Mercado Pago dos planos — estado e próximos passos

Última atualização: 08/10/2026. Branch: `codex/sync-elolab-deploy-20261008`. O checkout sandbox foi publicado no frontend e nas Edge Functions da VPS. A migration `20261010197000_checkout_transparente_planos.sql` foi aplicada ao banco da VPS após backup validado em `/var/backups/elolab/pre-mp-sandbox-20261008T135341Z.dump`.

Resumo do fluxo em [`PAYMENT_AND_TRIAL_FLOWS.md`](./PAYMENT_AND_TRIAL_FLOWS.md#checkout-transparente-dos-planos-planoscheckoutslug).

## Decisões (validadas na documentação oficial e no sandbox)

- **A API de Orders não faz recorrência.** Cobrança recorrente usa a API de Assinaturas (`/preapproval`).
- **Cartão:** `POST /preapproval` com `card_token_id` + `status: "authorized"`; o token vem do Card Payment Brick (`@mercadopago/sdk-react`). O Mercado Pago faz uma cobrança mínima de validação e devolve; a primeira cobrança sai em ~1 h (ou em `start_date`, usado para o teste grátis e para não cobrar quem ainda tem período pré-pago).
- **Pix e boleto:** `POST /v1/orders`, pagamento único de um período (mensal = 1 mês, anual = 12). Não renova sozinho. Escolha do responsável pelo produto em 08/10/2026.
- O vencimento de boleto agora é enviado explicitamente como `P3D`; sem esse campo o sandbox respondeu `processing_error`, enquanto com ele gerou linha digitável e link do boleto.
- Para Pix e boleto, o formulário coleta endereço completo; o servidor envia CEP, rua, número (ou `S/N`), bairro, cidade e UF no objeto `payer.address`.
- O frontend inicializa MercadoPago.js V2 por `@mercadopago/sdk-react`; captura `MP_DEVICE_SESSION_ID` e envia como `X-Meli-Session-Id` nos pedidos e assinaturas.
- Orders incluem `config.statement_descriptor: "ELOLAB"`.
- A Orders API aceita nome, sobrenome, documento e endereço em `payer`, além de `title` e `category_id` em `items`. O sandbox rejeitou `additional_info.payer.registration_date` como propriedade não suportada; a referência atual de criação de Orders também não lista esse campo, então ele fica fora do payload.
- **Cliente recorrente ativo não pode pagar Pix/boleto** (409) até cancelar, para não pagar duas vezes.
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

`test:mp-sandbox` lê `supabase/functions/.env.local` (fora do git) e **aborta se o token não for de usuário de teste** (`/users/me` precisa ter a tag `test_user`). Cancela pedidos Pix/boleto pendentes e assinaturas de teste; a order aprovada é mantida no sandbox para permitir medir a integração, e seu ID aparece no resultado. Variáveis desse arquivo:
- `MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_PUBLIC_KEY`, as credenciais de teste.
- `MERCADOPAGO_ENV=sandbox`.
- `MERCADOPAGO_TEST_PAYER_EMAIL`, o e-mail da conta compradora de teste "teste1".

Nunca copie os valores para commits, logs ou respostas.

## Estado do deploy sandbox (08/10/2026)

- Front publicado em `https://app.elolab.com.br`, imagem `easypanel/elolab/app:mp-sandbox-20261008`; `/healthz` respondeu HTTP 200 e o HTML aponta para o bundle que contém a rota de checkout.
- `mercadopago-checkout` está publicado no runtime da VPS; chamada GET retorna 405, como esperado para a função que aceita POST. A rota `/planos/checkout/elolab-max` entrega o app (HTTP 200).
- `mercadopago-webhook` está publicado. Um evento `order.processed` de sandbox, assinado com o segredo configurado no ambiente do serviço, foi aceito com HTTP 200. A repetição foi reconhecida como duplicada. O evento de probe não estava ligado a uma compra EloLab e por isso não alterou assinatura alguma.
- As credenciais instaladas na VPS são de **sandbox**. Nenhuma cobrança real foi criada.
- O painel Mercado Pago mostrou os tópicos `Order`, `Pagamentos (legacy)` e `Planos e assinaturas` selecionados. A entrega real de notificação pelo painel ainda precisa ser confirmada com uma compra de teste.
- A suíte sandbox foi repetida em 08/10/2026: 17/17 cenários OK. Order aprovada com endereço, descritor de fatura e Device ID para medir qualidade: `ORDTST01M4E30MPWXQWX68R0XD646151`.

## Pendências (em ordem)

1. **Validar o fluxo completo no navegador** com usuário e cartão de teste: autorização recorrente no cartão, cancelamento, e Pix/boleto (pagamento único). Confirmar que as mudanças de status chegam pelo webhook real do painel.
2. **Confirmar persistência no painel** da URL `https://api.elolab.com.br/functions/v1/mercadopago-webhook` e dos tópicos `Order`, `Pagamentos (legacy)` e `Planos e assinaturas`. O endpoint e o segredo já estão configurados na VPS; não há confirmação de que o botão de salvar do painel foi acionado.
3. **Regra de inadimplência pedida pelo produto:** o bloqueio atual ainda usa 7 dias de carência para planos pré-pagos e não suspende com segurança a assinatura recorrente após 3 dias sem pagamento. Ajustar e validar essa regra antes de considerar a cobrança pronta para clientes.
4. **Ainda não implementado:** lembrete por e-mail antes do vencimento do período Pix/boleto (hoje só há aviso em `/planos`). O checkout da landing (`public-checkout`) continua no fluxo hospedado antigo.
5. **Depois da validação sandbox:** trocar para credenciais de produção somente com autorização explícita do responsável.
   - backup;
   - migration;
   - secrets de produção, sem `MERCADOPAGO_ENV` e sem `MERCADOPAGO_TEST_PAYER_EMAIL`;
   - deploy de `mercadopago-checkout`, `mercadopago-webhook` e `public-checkout`;
   - deploy do front e do CSP.
