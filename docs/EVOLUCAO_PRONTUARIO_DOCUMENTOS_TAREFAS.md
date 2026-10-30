# Prontuário — protocolos clínicos e relatório de alta em páginas próprias

## Diagnóstico atual

No workspace de evolução, a busca/aplicação de protocolos e a prévia do relatório de alta abriam diálogos sobre o formulário clínico. Os dois fluxos tomavam grande parte da tela e escondiam o contexto da evolução. O modal de protocolos também não deixava explícito que a ação transferia apenas medicamentos e orientações; etapas e exames sugeridos não criavam pedidos.

## Direção e implementação

- `tela=protocolos` exibe a biblioteca em uma página integral dentro do contexto autorizado de paciente e evolução. A busca, expansão e aplicação mantêm o rascunho no mesmo workspace e a URL preserva a seção ao recarregar.
- `tela=relatorio-alta` apresenta a prévia em uma página própria, com identificação do atendimento e ações de imprimir/baixar. A URL mantém paciente, evolução e seção ao recarregar.
- Protocolos passam a identificar a ação como “Aplicar sugestões à evolução”. A ação adiciona medicamentos à lista em edição e orientações ao texto de conduta, marca o rascunho como alterado e informa que o profissional deve revisar antes de salvar e assinar. Etapas e exames seguem como referência; nenhum pedido é criado.
- Relatório mostra quando inclui alterações não salvas e deixa claro que a prévia não altera nem persiste o prontuário. Datas inválidas ou ausentes usam texto seguro em vez de falhar durante a visualização/exportação.
- A paleta do PDF de alta foi alinhada aos tokens azul-marinho/azul do EloLab.
- Confirmações curtas e críticas continuam em diálogos. Nenhum contrato, RPC, permissão, tabela, migration ou fluxo de assinatura foi alterado.

## Arquivos

- `src/pages/Prontuarios.tsx`
- `src/components/clinical/ClinicalProtocols.tsx`
- `src/components/clinical/DischargeReport.tsx`
- `tests/prontuario-return-page.spec.ts`

## Validação

- Playwright Chromium: 2/2 cenários focados passaram para os dois fluxos, incluindo retorno ao contexto, recarga da URL, ausência de diálogo, aplicação de sugestões no rascunho e preservação da seção ativa.
- Inspeção das capturas renderizadas em 390 px e 1440 px; a ação de aplicar protocolo permanece acima da navegação inferior quando alcançada no mobile.
- `npm run build`, `npm run check:a11y`, `npm run check:permissoes`, `npm run check:falhas`, `npm run check:colunas` e `git diff --check` passaram após os ajustes finais.
- ESLint: zero erros; 59 avisos preexistentes de `any` em `Prontuarios.tsx`.
- O typecheck global segue com nove erros em seis telas TISS/financeiras sem alteração: sete `replaceAll` incompatíveis com ES2020 e dois casts de resposta JSON.
- As escritas nos testes foram sintéticas. Nenhum prontuário, prescrição ou pedido real foi criado.

## Limitações e pendências

- A prévia de alta não é salva em documentos clínicos; imprime ou baixa o PDF gerado no navegador, como no fluxo anterior.
- O protocolo não cria solicitações de exames e não automatiza passos clínicos.
- Auditoria integrada dos demais componentes e módulos continua aberta.

## Publicação

Pendente do commit de release e smoke test de produção.
