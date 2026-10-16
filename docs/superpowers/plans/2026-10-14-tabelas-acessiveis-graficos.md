# Tabelas acessíveis para gráficos do Analytics

## Achado da triagem #93

Os cinco gráficos do Analytics são visuais e não têm uma alternativa tabular exportável. O filtro de período e a comparação selecionada também não acompanham um CSV desses dados.

## Objetivo

Em cada gráfico, oferecer uma tabela HTML semântica que possa ser aberta por teclado/leitor de tela e exportada como CSV com período e filtros antes das linhas de dados.

## Implementação

- Componente reutilizável `AccessibleChartTable` com caption, cabeçalhos, período e filtros.
- Tabela recolhida por padrão sob disclosure nativo acessível.
- CSV delimitado por ponto e vírgula, com BOM, contexto no cabeçalho, escape de aspas/linhas e proteção contra fórmulas.
- Integrar nos quatro gráficos (série diária, status de agenda, fluxo financeiro e risco) e no ranking visual de produtividade.

## Validação

- Vitest para contexto no cabeçalho, escaping e neutralização de fórmulas.
- Playwright sintético valida abertura da tabela e contexto de datas/filtros.
- TypeScript, build e checks de acessibilidade/falhas/colunas/permissões.

## Evidência

- Vitest do CSV: 2/2; valida BOM, período/filtros antes das linhas, escaping e proteção contra fórmulas.
- Playwright sintético: 1/1; abriu a tabela semântica, confirmou período/filtros e acionou o download CSV.
- TypeScript, build e checks de acessibilidade, falhas silenciosas, colunas e permissões: aprovados.
- ESLint direcionado: 0 erros; 23 avisos preexistentes no arquivo Analytics (`any` e dependências de hooks).
- Sem migration ou gravação no banco.
