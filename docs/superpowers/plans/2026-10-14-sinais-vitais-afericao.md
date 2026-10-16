# E49 ? Estado expl?cito de aferi??o dos sinais vitais

## Escopo

Diferenciar medidas ausentes de valores existentes no resumo da ?ltima triagem, preservando unidades e zero. N?o alterar s?rie hist?rica, crit?rios cl?nicos nem persist?ncia.

## Execu??o e valida??o

- [x] Criar testes unit?rios do formatador e teste de integra??o do resumo.
- [x] Implementar formata??o de aus?ncia e unidades.
- [x] Confirmar zero sem tratar como aus?ncia.
- [x] Vitest focado: 3 arquivos, 12 testes.
- [x] Vitest integral: 295 arquivos, 1.439 testes.
- [x] TypeScript, acessibilidade, colunas, falhas silenciosas e `git diff --check`.
- [x] Build local conclu?do ap?s commit; identificador conferido com o HEAD.
