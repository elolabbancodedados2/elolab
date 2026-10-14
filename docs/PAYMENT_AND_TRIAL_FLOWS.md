# Fluxo de assinaturas do EloLab

Este documento descreve o fluxo que o código atual implementa. O antigo fluxo com formulário próprio de cartão e a Edge Function `trial-with-payment` foram removidos.

## Criar assinatura ou iniciar teste

1. Os metadados `checkout_flow` e `checkout_plan_slug` podem apoiar a navegação do cadastro, mas são editáveis pelo cliente e não concedem teste grátis.
2. O servidor consulta o histórico persistente em `platform_plan_trial_claims` e a assinatura de plano da conta. A primeira elegibilidade é calculada a partir desses registros; uma reserva com chave única por usuário impede dois testes concorrentes.
3. [`PlanoCheckout.tsx`](../src/pages/PlanoCheckout.tsx) consulta `billing_status`. Para cartão, o Card Payment Brick tokeniza os dados no navegador e a tela envia `create_card_subscription`, incluindo o consentimento explícito quando houver teste. Para Pix, envia `create_plan_order` e não cria recorrência.
4. A Edge Function [`mercadopago-checkout`](../supabase/functions/mercadopago-checkout/index.ts) consulta o preço e os dias de teste configurados no banco, verifica o histórico do servidor e exige `trial_consent: true` explicitamente antes de criar a assinatura recorrente (`/preapproval`) ou a order Pix (`/v1/orders`).
5. A assinatura e as orders são sincronizadas pelo webhook ou, no caso de Pix, pela consulta do pedido aberto. O navegador não envia dados de cartão ao EloLab.

O teste é limitado a uma tentativa por conta segundo o histórico controlado pelo servidor. A reserva só é criada depois que os dados locais do checkout foram registrados; uma recusa definitiva 4xx do cartão libera uma reserva que ainda não iniciou o teste, enquanto uma falha de comunicação mantém a reserva porque o Mercado Pago pode ter recebido a solicitação. A tela só oferece o teste quando `billing_status` retorna `trial_elegivel`; exibe o preço, o início da primeira cobrança recorrente, a renovação e a consequência do cancelamento. Sem o checkbox de autorização explícita, o servidor recusa a solicitação. Um acesso manual a `?trial=1` sem elegibilidade informa que o teste não será aplicado e mostra o valor integral antes do envio do cartão.

## Cancelamento

A página de Planos e as Configurações solicitam `cancel_subscription` à mesma Edge Function. A função segue o ID da assinatura recorrente ativa em `assinaturas_plano.mp_assinatura_id`, cancela esse preapproval no Mercado Pago e exige que os registros correspondentes de gateway e plano sejam atualizados; um checkout pendente mais recente não substitui esse vínculo. A interface informa que o acesso é encerrado na confirmação; não prometa acesso até o fim do período pago.

## Limites importantes

- O navegador não define o preço: a Edge Function consulta o plano ativo no banco.
- O cartão é tokenizado pelo Card Payment Brick; o checkout não redireciona para uma página hospedada do Mercado Pago.
- A ação antiga `create_preference` está desativada e responde HTTP 410. Novas cobranças devem seguir um fluxo que derive valores de registros confiáveis no servidor.
- Não reintroduza o formulário antigo de coleta de cartão (`PaymentMethodDialog`).

## Checkout transparente dos planos (`/planos/checkout/:slug`)

A API de Orders do Mercado Pago só faz pagamentos únicos; a recorrência fica na API de Assinaturas. Por isso a tela oferece:

| Forma | API | Cobrança | Ativação |
|---|---|---|---|
| Cartão de crédito | `POST /preapproval` com `card_token_id` e `status: "authorized"` | Recorrente e automática | Na resposta autorizada e pelo webhook `subscription_preapproval` |
| Pix | `POST /v1/orders` (`bank_transfer`) | Pagamento único de um período | Webhook `order` ou consulta da tela |
| Boleto | Não oferecido para novos pedidos | — | Instruções antigas podem continuar disponíveis para uma order de boleto já emitida e ainda aberta. |

- O cartão é tokenizado pelo Card Payment Brick no navegador; o número nunca passa pelo EloLab.
- Preço e período vêm do banco. Orders Pix e boletos legados ficam em `platform_plan_orders`, e o pagamento é aplicado por `aplicar_status_pedido_plano()`, que libera o período uma única vez. Notificações repetidas não estendem o acesso.
- Plano pago por Pix fica com `assinaturas_plano.cobranca_modalidade = 'pre_pago'` e `data_fim`; o cron `expire-prepaid-platform-plans` marca o plano como `expirada` no vencimento.
- O webhook valida `x-signature` (o `data.id` vai em minúsculas no manifest) e usa uma chave de idempotência por order, ação e status.

Variáveis das Edge Functions: `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY`, `MERCADOPAGO_WEBHOOK_SECRET` e, só no sandbox, `MERCADOPAGO_ENV=sandbox` e `MERCADOPAGO_TEST_PAYER_EMAIL`.

Validação no sandbox: `npm run test:mp-sandbox` (lê `supabase/functions/.env.local` e recusa tokens que não sejam de usuário de teste).
