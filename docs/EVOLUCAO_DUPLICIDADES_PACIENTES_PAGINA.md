# Revisão de duplicidades de pacientes em página própria

## Diagnóstico

A revisão de pares duplicados ocorria em um diálogo de até 90% da janela. A mesma tarefa combinava sensibilidade, lista de possíveis pares, leitura de duas fichas, comparação de campos e uma operação de mesclagem auditada. Isso limitava a leitura no celular e deixava uma ação que inativa um cadastro acessível dentro de um overlay.

## Jornada e decisões

- A ação de administrador na lista de pacientes abre `/pacientes/duplicidades` e preserva o destino e o estado de retorno.
- A página mantém os limiares existentes e permite revisar um par por vez.
- A ficha mais antiga continua selecionada inicialmente; o administrador pode escolher qual permanece ativa e selecionar, campo a campo, valores do cadastro duplicado.
- A revisão exige um motivo de 10 a 500 caracteres, mantido na chamada atual da RPC.
- A mesclagem agora exige uma confirmação curta com os dois nomes e explicação do efeito. A operação não é acionada antes dessa confirmação.
- Alterações do motivo ou dos campos escolhidos são protegidas na saída da página e ao voltar à lista de pares. Se a pessoa cancelar, os valores permanecem.
- Marcar um par como pessoas diferentes continua usando a RPC existente. Se houver rascunho, a tela avisa que ele será descartado antes de confirmar.
- Listagem vazia, falha carregável novamente, leitura incompleta de uma ficha, envio em andamento e falha da RPC são estados distintos.

## Integrações preservadas

- A busca permanece em `listar_duplicidades_pacientes`; a decisão de descarte usa `descartar_duplicidade_pacientes`; a mesclagem usa `mesclar_pacientes` com os mesmos campos e motivo.
- A regra que prioriza a ficha mais antiga, a escolha manual de campos, a inativação da origem, a preservação de vínculos e a auditoria do motivo foram mantidas.
- O acesso à rota é limitado ao papel `admin`, igual ao botão existente.
- Nenhuma tabela, permissão, contrato, RPC ou regra de negócio foi alterada. Os testes usaram dados sintéticos e interceptaram as gravações.

## Arquivos

- `src/pages/RevisaoDuplicidadesPacientesPage.tsx`
- `src/pages/Pacientes.tsx`
- `src/App.tsx`
- `src/config/routeLabels.ts`
- `src/components/patients/__tests__/RevisaoDuplicidadesPacientesPage.test.tsx`
- `tests/patient-duplicates-page.spec.ts`

## Validação

Vitest 3/3 e Playwright 3/3 passaram. Os cenários cobriram entrada pela lista e retorno, comparação de campos, confirmação explícita antes da RPC e tamanhos 1440 px/390 px. `npx tsc --noEmit --pretty false`, build de produção, `npm run check:a11y`, `npm run check:permissoes`, `npm run check:falhas`, `npm run check:colunas` e `git diff --check` passaram. ESLint sem erros ou avisos novos; os 54 avisos `any` existentes em `Pacientes.tsx` permanecem. Inspecionei capturas renderizadas desktop e mobile, incluindo os estados de comparação e confirmação. No celular, a ação final continua acima da navegação inferior e não há transbordamento horizontal. Nenhuma mesclagem ou descarte real foi feito.
