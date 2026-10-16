# Definições e fontes dos KPIs

## Achado da triagem #92

O painel já mostra período e pequenas descrições, mas não expõe fonte nem critérios completos. Também existe divergência material: Analytics considera status em andamento como comparecimento; Relatórios considera finalizados e faltas com desfecho.

## Objetivo

Alinhar a taxa de comparecimento ao critério de Relatórios e permitir consultar a fórmula, fonte e período de cada KPI mostrado no painel.

## Implementação

- Extrair uma função pura para calcular atendimentos finalizados, faltas, denominador e taxa.
- Contar como comparecimento somente `finalizado`/`atendimento_finalizado`; excluir futuros, em andamento, cancelados e aguardando.
- Adicionar detalhe acessível de definição, fonte e janela civil São Paulo aos KPIs principais e secundários do Analytics.
- Identificar receitas/estornos pela data real de pagamento/estorno; usar a conta consolidada apenas para registros legados sem pagamentos individuais.

## Validação

- Vitest de fórmula incluindo estados abertos/cancelados e denominador sem desfecho.
- Playwright sintético valida detalhes de fórmula/fonte/período renderizados no painel.
- TypeScript, build, lint e checks de acessibilidade/falhas/colunas/permissões.

## Evidência

- Vitest da fórmula: 2/2.
- Playwright sintético: 1/1; confirma os oito KPIs com detalhes e período/fonte no cartão.
- TypeScript e build aprovados; checks de acessibilidade, permissões, colunas e falhas silenciosas aprovados.
- ESLint direcionado: 0 erros; 23 avisos de `any` e dependências de hooks já existentes em Analytics.
- Sem migration; a taxa agora coincide com a fórmula de Relatórios.
