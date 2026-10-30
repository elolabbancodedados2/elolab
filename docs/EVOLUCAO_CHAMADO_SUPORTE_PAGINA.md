# Abertura de chamado em página própria

## Diagnóstico

Na Central de Suporte, a abertura de chamado usava um modal alto com quatro campos e ocupava a tela da fila. A tarefa precisava de espaço para descrever o problema sem esconder o contexto de acompanhamento.

## Jornada e decisões

- A ação da clínica navega para `/suporte/novo`, protegida pelos mesmos papéis da rota `/suporte`.
- A tela conserva título, descrição, prioridade, categoria, validações e o payload da tabela `support_tickets`.
- Busca, status, prioridade e página da fila são enviados apenas no estado de navegação; cancelar ou concluir retorna ao `/suporte` com esses filtros.
- Os filtros ainda reiniciam a paginação quando são alterados. A página restaurada não é zerada na montagem.
- Rascunhos são protegidos contra saída acidental. Erros mantêm o formulário preenchido e explicam como evitar envio duplicado após uma resposta incerta.
- A página orienta a não incluir dados clínicos de pacientes no chamado.

## Integrações preservadas

- Mesmo insert em `support_tickets`, com `titulo`, `descricao`, `prioridade`, `categoria`, `clinica_id` e `solicitante_id`.
- Mesma invalidação de `['support-tickets']` e mensagem de sucesso.
- A criação segue indisponível para a equipe de plataforma na fila `/admin/suporte`.
- Nenhuma tabela, RPC, permissão ou regra de backend foi alterada. As gravações de validação foram interceptadas.

## Arquivos

- `src/pages/NovoChamadoSuportePage.tsx`
- `src/pages/CentralSuporte.tsx`
- `src/pages/__tests__/NovoChamadoSuportePage.test.tsx`
- `src/pages/__tests__/centralSuporte.test.tsx`
- `tests/support-ticket-page.spec.ts`
- `src/App.tsx`
- `src/config/routeLabels.ts`

## Validação

Vitest 11/11 e Playwright 1/1 passaram. ESLint focal sem erros; os avisos `any` existentes em `CentralSuporte.tsx` e seus testes permanecem. TypeScript global passou. A captura foi inspecionada em 1440 px e 390 px: a rota não abre diálogo, não tem transbordamento horizontal e as ações ficam acima da navegação mobile. O teste usou uma clínica sintética e interceptou o insert; nenhum chamado real foi criado.

## Publicação

Preencher após o rollout e a confirmação pública da versão.
