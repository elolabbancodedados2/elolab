# Limpeza de coletas pendentes antigas

## Diagnóstico

O laboratório ainda oferecia em um diálogo a exclusão em lote de coletas pendentes antigas. A operação combina escolha do prazo, prévia de impacto e justificativa de auditoria; em telas menores, o diálogo limitava o contexto da fila e a leitura do formulário.

## Direção e implementação

- A ação agora abre a página própria `/laboratorio/coletas/limpar`.
- A página mantém a clínica, os filtros e a busca do paciente para retornar à mesma worklist e restaurar o foco no link de origem.
- O prazo é validado como inteiro positivo; a prévia usa a clínica da sessão e considera apenas coletas com status `pendente`.
- A justificativa continua obrigatória, com mínimo de cinco caracteres.
- O processamento continua usando a RPC `cancelar_coletas_pendentes_antigas`, com os mesmos parâmetros. A permissão de gestão, o guard do recurso e a autorização do banco permanecem ativos.
- A interface explica que material coletado, em análise, validado ou liberado não entra na operação. Falha mantém a justificativa na página para revisão e nova tentativa.
- O retorno de navegação agora preserva o foco de uma ação selecionada dentro do conteúdo, sem que o foco geral de rota o substitua.

## Arquivos

- `src/pages/laboratorio/LimparFilaAntigaPage.tsx`
- `src/pages/Laboratorio.tsx`
- `src/App.tsx`
- `src/config/routeLabels.ts`
- `src/components/RouteAccessibility.tsx`
- `src/components/__tests__/RouteAccessibility.test.tsx`
- `tests/lab-bulk-cleanup-page.spec.ts`

## Validação

- Playwright: fluxo principal e erro recuperável; 2/2 cenários aprovados.
- Vitest: testes de fluxo do laboratório e acessibilidade de rota; 8/8 aprovados.
- TypeScript: sem erros.
- Build e verificações de acessibilidade, permissões, falhas silenciosas e colunas: aprovadas.
- ESLint nos arquivos tocados: sem erros; 41 avisos `no-explicit-any` já existentes em `Laboratorio.tsx`.
- Capturas da página inspecionadas em 390×844 e 1440×1000. O título está abaixo do cabeçalho global; ações móveis permanecem acessíveis acima da navegação inferior.

## Limites e publicação

Não houve alteração de contrato, migration ou escrita em dados de produção durante a implementação. A prévia é informativa; a RPC do servidor decide quais registros ainda atendem aos critérios no momento do processamento. Identificador da imagem, smoke test, rollback e confirmação pública serão registrados após a publicação.
