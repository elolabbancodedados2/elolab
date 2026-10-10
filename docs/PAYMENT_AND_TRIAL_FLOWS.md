# Fluxo de assinaturas do EloLab

Este documento descreve o fluxo que o código atual implementa. O antigo fluxo com formulário próprio de cartão e a Edge Function `trial-with-payment` foram removidos.

## Criar assinatura ou iniciar teste

1. A página [`Planos.tsx`](../src/pages/Planos.tsx) chama `useCreatePlatformSubscription` com o identificador do plano e a duração de teste permitida.
2. O hook [`useSubscriptionPlan.ts`](../src/hooks/useSubscriptionPlan.ts) envia `create_subscription` para a Edge Function [`mercadopago-checkout`](../supabase/functions/mercadopago-checkout/index.ts).
3. A função exige uma sessão autenticada, busca o plano ativo no banco, valida o preço e o período de teste e evita criar uma segunda assinatura pendente para o mesmo usuário.
4. A função cria uma autorização recorrente no Mercado Pago, grava o estado pendente no banco e devolve a URL de checkout.
5. O navegador redireciona para o checkout do Mercado Pago. A aplicação não coleta nem envia dados de cartão.
6. As notificações do gateway chegam à Edge Function [`mercadopago-webhook`](../supabase/functions/mercadopago-webhook/index.ts), que sincroniza o estado da assinatura.

A duração de teste enviada pela interface não pode superar o período definido para o plano no banco. Para uma assinatura direta ou upgrade, a interface envia zero dias de teste.

## Cancelamento

A página de planos solicita `cancel_subscription` à mesma Edge Function. A função localiza a assinatura do usuário e solicita o cancelamento no Mercado Pago; o webhook mantém a aplicação sincronizada com o resultado.

## Limites importantes

- O navegador não define o preço: a Edge Function consulta o plano ativo no banco.
- Os dados de pagamento são preenchidos no checkout hospedado pelo Mercado Pago.
- A ação antiga `create_preference` está desativada e responde HTTP 410. Novas cobranças devem seguir um fluxo que derive valores de registros confiáveis no servidor.
- Não reintroduza o formulário antigo de coleta de cartão (`PaymentMethodDialog`).

## Checkout transparente dos planos (`/planos/checkout/:slug`)

A API de Orders do Mercado Pago só faz pagamentos únicos; a recorrência fica na API de Assinaturas. Por isso a tela oferece:

| Forma | API | Cobrança | Ativação |
|---|---|---|---|
| Cartão de crédito | `POST /preapproval` com `card_token_id` e `status: "authorized"` | Recorrente e automática | Na resposta autorizada e pelo webhook `subscription_preapproval` |
| Pix | `POST /v1/orders` (`bank_transfer`) | Pagamento único de um período | Webhook `order` ou consulta da tela |
| Boleto | `POST /v1/orders` (`ticket`, exige CPF/CNPJ e endereço) | Pagamento único de um período | Webhook `order` ou consulta da tela |

- O cartão é tokenizado pelo Card Payment Brick no navegador; o número nunca passa pelo EloLab.
- Preço e período vêm do banco. Pix/boleto ficam em `platform_plan_orders`, e o pagamento é aplicado por `aplicar_status_pedido_plano()`, que libera o período uma única vez. Notificações repetidas não estendem o acesso.
- Plano pago por Pix/boleto fica com `assinaturas_plano.cobranca_modalidade = 'pre_pago'` e `data_fim`; o cron `expire-prepaid-platform-plans` marca o plano como `expirada` no vencimento.
- O webhook valida `x-signature` (o `data.id` vai em minúsculas no manifest) e usa uma chave de idempotência por order, ação e status.

Variáveis das Edge Functions: `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY`, `MERCADOPAGO_WEBHOOK_SECRET` e, só no sandbox, `MERCADOPAGO_ENV=sandbox` e `MERCADOPAGO_TEST_PAYER_EMAIL`.

Validação no sandbox: `npm run test:mp-sandbox` (lê `supabase/functions/.env.local` e recusa tokens que não sejam de usuário de teste).
