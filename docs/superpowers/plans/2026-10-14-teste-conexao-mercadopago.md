# Plano: testar conexão Mercado Pago em modo somente leitura

## Objetivo
Permitir que o administrador da clínica teste a conexão atual do Mercado Pago com uma consulta GET de identidade, sem criar ou alterar cobranças, orders ou lançamentos. Mostrar uma orientação breve quando a credencial estiver vencida ou o provedor estiver indisponível.

## Etapas
1. Criar testes unitários do probe HTTP para sucesso, credencial rejeitada, identidade divergente e falha de rede.
2. Adicionar ação de teste no endpoint de integrações, restrita ao admin da clínica e sem retornar corpo do Mercado Pago.
3. Adicionar botão na integração conectada e mapear os códigos de falha para correções simples.
4. Validar jornada sintética, Vitest, TypeScript, Deno, build, lint e checks do repositório; registrar evidências.

## Limites
- A única chamada ao provedor é `GET /users/me`; nunca enviar cobrança de teste.
- Não alterar `pagamentos_mercadopago`, `lancamentos` nem orders existentes.
- Sem migrations, mensagens ou deploy nesta etapa.

## Resultado

Implementado e validado: consulta autenticada e somente leitura, sem renovação de token, com códigos seguros e orientações para falhas comuns. Evidências: Vitest 8/8, Playwright sintético 2/2, TypeScript, build, Deno check, ESLint sem erros e quatro verificações do repositório aprovadas. Nenhum dado financeiro alterado e nenhuma chamada real ao provedor.
