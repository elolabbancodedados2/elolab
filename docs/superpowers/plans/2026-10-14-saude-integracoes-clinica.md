# Plano: saúde e sincronização das integrações

## Objetivo
Exibir para o administrador da clínica o estado conhecido da integração e o instante da última comunicação bem-sucedida com o provedor, sem retornar credenciais, URLs privadas ou texto bruto de falhas externas.

## Etapas
1. Criar contrato de regressão para status, data de sincronização e ausência de segredos/detalhes externos.
2. Sanitizar falhas antes de retornar conexões e registrar status/data após sincronização do Mercado Pago.
3. Exibir o estado conhecido e a última sincronização na tela de integrações da clínica, com estado vazio claro.
4. Validar contratos, jornada sintética, TypeScript, Deno, build e checks de segurança; registrar evidências.

## Limites
- Não testar nem enviar chamadas reais ao Mercado Pago nesta etapa.
- Não alterar valores, lançamentos ou reconciliação de pagamentos.
- Sem migrations ou deploy nesta etapa.

## Resultado

Implementado e validado: estado conhecido e última comunicação aparecem por integração; tentativas Point atualizam a saúde sem persistir mensagens brutas do provedor; a resposta da tela não inclui dicas de credencial. Evidências: Vitest 5/5, Playwright sintético 1/1, TypeScript, build, Deno check, ESLint sem erros e quatro verificações do repositório aprovadas. Nenhuma chamada real ao Mercado Pago ou migration.
