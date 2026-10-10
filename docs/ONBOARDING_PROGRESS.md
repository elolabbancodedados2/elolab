# Contratação e primeiro acesso — progresso

## Implementado

- Fluxo planos → cadastro → checkout → trial de 72 horas no cartão, com consentimento explícito para cobrança recorrente e valor/data da primeira cobrança apresentados antes da autorização.
- Provisionamento server-side idempotente somente após assinatura autorizada ou pedido pré-pago confirmado; inclui boas-vindas e onboarding da clínica.
- Demonstração separada, com dados fictícios locais e sem gravações no Supabase.
- Lembrete do trial até 24 horas antes do fim; manutenção e cancelamento da assinatura disponíveis em Planos.
- Migration `20261010198000_checkout_provisionamento_seguro.sql` preparada. O responsável informou que a aplicou no Supabase da VPS; não houve cobrança real iniciada por esta sessão.

## Validação local em 10/10/2026

- 720 testes passaram.
- TypeScript passou.
- Deno check passou para `mercadopago-checkout`, `mercadopago-webhook`, `payment-reminder` e `public-checkout`.
- Verificações de integridade, permissões e acessibilidade passaram; `npm audit --omit=dev --audit-level=high` encontrou zero vulnerabilidades.
- Build de produção passou. Build local: `282ce0209fbdd00c`.
- Testes Mercado Pago sandbox anteriores: 15/17; dois cenários de boleto continuam sujeitos a `processing` sem instruções imediatas. Sem workaround inventado.

## Publicação

- Ainda não publicada. O deploy da VPS acompanha `main`; a validação completa está sendo preparada via Pull Request. Após CI verde, o merge em `main` dispara o Easypanel.
- O backend de Edge Functions deve ser atualizado e verificado junto com o frontend; não iniciar cobranças reais.
- Próxima verificação após publicação: `/healthz`, `/version.json`, rota de checkout e teste ponta a ponta com contas/credenciais de sandbox.

## Dependências externas

- Pix Automático como recorrência depende de habilitação no Mercado Pago; o trial de 3 dias usa assinatura recorrente no cartão.
- Envio do lembrete depende do worker da fila e da configuração Brevo já existente nas Edge Functions.
- Os dois cenários de boleto no sandbox e o percurso completo autenticado ainda precisam de validação.
