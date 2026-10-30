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

Commit `8245ac704f156228786d8ae11b39f64640515e5c`; imagem `easypanel/elolab/app:deploy-20261030-8245ac7`. O arquivo versionado foi transferido e comparado por SHA-256 local/remoto; build Docker e smoke isolado passaram. O Swarm convergiu para 1/1 réplica e `/healthz` público respondeu `ok`; `/version.json` confirmou o SHA integral. O rollout registrou uma contenção transitória de porta host-mode antes de convergir, sem rollback. Imagem de rollback preservada: `easypanel/elolab/app:deploy-20261030-53dc694`. Nenhuma migration, alteração de configuração do Supabase ou gravação em dados de produção.

## Prontuário — visualização de anexos em página própria (30/10/2026)

### Diagnóstico

A prévia de anexos ocupava um diálogo de até 90% da altura da tela sobre a lista e o contexto clínico. A leitura de um documento longo escondia a evolução e, no mobile, deixava pouco espaço para navegação. A lista, a gravação do anexo e a publicação no Portal já eram fluxos separados; o ponto pendente era a leitura/download do conteúdo.

### Direção e implementação

- A visualização agora usa `/prontuarios/:prontuarioId/anexos/:anexoId/visualizar`, uma página integral com paciente, nome do documento, categoria, tamanho, evolução, profissional responsável e descrição.
- A consulta confirma prontuário e anexo no escopo da clínica ativa e cruza também o paciente e o prontuário do próprio anexo. O bucket continua privado; a URL assinada é temporária.
- Leitura e exportação usam as RPCs de auditoria existentes. A prévia só aparece depois que a auditoria de leitura é confirmada. Download cria um link temporário novo e registra exportação antes de navegar.
- PDF e imagens usam visualização embutida; outros formatos informam que não há prévia e oferecem download. Estados de validação, erro e nova tentativa ficam na própria página.
- O retorno só aceita as rotas internas de prontuário/atendimento, preserva a seção de anexos e bloqueia redirecionamento externo. O breadcrumb mostra “Visualizar documento clínico” e omite o ID do anexo.
- A página respeita os perfis admin/médico já usados no workspace. Nenhuma API, RPC, permissão de banco, tabela, migration ou regra clínica foi alterada.

### Validação

- Vitest: 51/51 testes focados passaram (lista de anexos, página, escopo, auditoria, download e breadcrumb).
- Playwright Chromium sintético: 1/1 fluxo de inclusão, abertura da página própria, ausência de modal e retorno à mesma seção passou; largura mobile de 390 px não produz overflow horizontal. Todas as escritas ficaram interceptadas.
- `npm run build`, acessibilidade, permissões, falhas silenciosas e colunas passaram. `git diff --check` passou.
- ESLint focal: zero erros e 61 avisos `no-explicit-any` preexistentes, concentrados em `Prontuarios.tsx` (59) e `AnexosProntuario.tsx` (2).
- O typecheck encontrou três erros preexistentes fora desta mudança: `user_id` ausente no tipo `UserWithRole` em dois hooks da Agenda e incompatibilidade JSON em `SalvarRelatorioPage.tsx`.
- As capturas desktop e mobile foram inspecionadas. O contêiner de prévia PDF fica em branco no screenshot do Chromium headless, embora o teste confirme que a URL assinada e o fixture PDF são carregados; o visualizador PDF nativo em navegador de usuário não foi exercitado nesta validação.

### Limitações e continuidade

- A validação de autorização/RLS com uma sessão clínica real e arquivos de produção não foi executada; nenhum arquivo ou dado clínico real foi lido ou alterado.
- Esta entrega conclui a leitura de anexos. A auditoria das demais transições e documentos clínicos permanece aberta; não encerra a etapa 10 nem a auditoria geral.

Publicado no commit `60e2271724ee2dd89f52796025e22b838409ef9e`, imagem `easypanel/elolab/app:deploy-20261030-60e2271`; rollback `deploy-20261030-11dc93e`. O container isolado respondeu `/healthz=ok` e confirmou o SHA integral esperado em `/version.json`. O Swarm `elolab_app` concluiu a atualização e permaneceu em 1/1 réplica; `app.elolab.com.br` e `elolab.com.br` responderam `ok` e publicaram o mesmo SHA. A fonte anterior está preservada em `code.before-20261030-60e2271`; o `.env` ativo e o backup mantiveram o hash `f2bcf73f6d860dec143ae363f755d3d18e41dc2f3ea3919944af62899c2f3b65`, conferido sem ler valores. Houve contenção transitória da porta host-mode, resolvida sem rollback. Nenhuma migration, alteração de configuração, leitura de arquivo clínico real ou gravação de dados de produção.
