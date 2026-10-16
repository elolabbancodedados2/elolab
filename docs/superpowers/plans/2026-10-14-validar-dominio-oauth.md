# Plano: validar domínio e retorno OAuth

## Objetivo
Impedir que uma configuração OAuth direcione códigos de autorização para domínios não aprovados e aceitar somente callbacks com state único, no formato e comprimento esperados. O retorno ao EloLab permanece fixo.

## Etapas
1. Criar testes para URI HTTPS, host/path permitidos, parâmetros duplicados e state válido.
2. Validar `MERCADOPAGO_OAUTH_REDIRECT_URI` contra a origem/caminho de callback canônicos antes de persistir state ou iniciar autorização.
3. Rejeitar callback com parâmetros duplicados, state malformado ou retorno inválido; preservar redirecionamento fixo para a aplicação.
4. Validar com Vitest, Playwright sintético, TypeScript, Deno, build e checks de segurança; registrar evidências.

## Limites
- Não alterar configuração do aplicativo Mercado Pago nem chamar endpoint real de OAuth.
- Não acessar segredos nem contas de usuário.
- Sem migrations ou deploy nesta etapa.

## Resultado

Implementado e validado: callback HTTPS com domínio/caminho allowlist, parâmetros únicos e state estrito; retorno de aplicação fixado. Evidências: Vitest 6/6, Playwright sintético 3/3, TypeScript, build, Deno check, ESLint limpo e quatro verificações do repositório aprovadas. Nenhuma chamada real ao OAuth ou migration.
