# EloLab — páginas operacionais

## Direção e publicação

Em 29/10/2026, o responsável pediu páginas próprias no lugar dos modais de trabalho em vários módulos. Confirmações curtas continuam contextuais. Pediu também deploy ao terminar cada entrega; publicar após validação e conferir a versão servida. Isso não autoriza migrations, mudanças de permissões ou operações financeiras como efeito colateral de um redesign.

Base do plano: `AUDITORIA_COMPLETUDE_MODULOS_2026-10-29.md`. Evolução incremental: agenda → pacientes → prontuário/documentos/exames/laboratório → financeiro → demais cadastros, validando cada fluxo antes de avançar.

## Agenda — primeira entrega

### Diagnóstico

Criar e editar consulta abria um modal de três abas, bloqueando o calendário. Fechar descartava o preenchimento sem confirmação. Não havia URL própria da edição.

### Implementação

- `/agenda/nova` e `/agenda/:appointmentId/editar` passam pelas mesmas permissões da agenda.
- Formulário organizado em paciente e dados da consulta, com observações visíveis. Sem overlay ou etapas artificiais.
- A página de edição consulta o registro novamente, filtrando clínica e profissional quando necessário. Aberturas seguintes não reutilizam indefinidamente dados antigos.
- Voltar preserva data, visão e filtros da agenda; links antigos de notificações, reagendamento e lista de espera continuam encaminhando ao fluxo.
- Validações existentes de conflito, sala, bloqueio, disponibilidade, data/hora, edição concorrente, WhatsApp e cancelamento com motivo preservadas.
- Confirmações de saída sem salvar, horário excepcional e cancelamento permanecem. Falha de salvamento mantém o preenchimento.
- `RouterProvider`/`createBrowserRouter` substituem somente o contêiner de navegação para permitir o bloqueio suportado de navegação. Providers, rotas, autenticação e guardas existentes foram preservados. `UnsavedChangesGuard` protege navegação interna e recarga, sem persistir o rascunho em armazenamento local.
- Referência técnica consultada: [useBlocker do React Router](https://reactrouter.com/api/hooks/useBlocker).

### Validação

- TypeScript sem erros; ESLint focal sem erros, com avisos de `any` no código examinado.
- 24 testes unitários focados passaram: payload, conflito, cancelamento, acessibilidade de rota e proteção de acesso.
- Primeira rodada de regressão concluída: 8 cenários Playwright passaram, incluindo novas páginas, layouts 1440/768/390, confirmação de saída/voltar do navegador, falha e sucesso de edição, fluxo anterior de agenda e conflitos.
- Capturas de desktop, tablet e celular efetivamente inspecionadas. Ações no celular ficam acessíveis acima da navegação inferior ao rolar.
- Build de produção local passou.
- Matriz ampliada concluída: 9 cenários Playwright passaram, incluindo a varredura de rotas de clínica, plataforma e aliases em duas larguras, mais as verificações focadas da agenda. A execução levou aproximadamente 4min44s.
- A repetição revelou uma corrida na confirmação de saída: o teste acionava o segundo diálogo antes de terminar o fechamento do primeiro. O teste agora aguarda a remoção real do diálogo; a confirmação também marca explicitamente o descarte antes de continuar a navegação. O cenário passou 5 vezes consecutivas, sem retries, incluindo preservação da busca ao voltar.
- Publicada em 29/10/2026: build `62b15fe80fbb0b94cdf3177af751ce18124627ed`, imagem `easypanel/elolab/app:deploy-20261029-62b15fe`. Swarm reportou atualização concluída; `/version.json` confirmou o hash e `/healthz` respondeu `ok`.
- Página `/agenda/nova` aberta e visualizada em produção com a sessão existente, sem salvar consulta. Zero diálogos abertos; aviso indevido de impersonação ausente na própria clínica. Na troca da tarefa houve resposta transitória de serviço indisponível durante a inicialização; a verificação posterior confirmou recuperação.
- Rollback preservado: imagem `easypanel/elolab/app:deploy-20261029-c537d694` e fonte `/etc/easypanel/projects/elolab/app/code.before-20261029-62b15fe`. Sem migration ou atualização de Edge Functions.

### Limites

Dados e mutações dos testes são sintéticos/interceptados. Não houve consulta clínica real criada, cancelada ou modificada. Mudança de formulário não homologa as integrações externas nem substitui testes de isolamento no backend. Os demais módulos ainda aguardam a migração para páginas; não estão incluídos nesta primeira entrega.

## Pacientes — cadastro, edição e ficha

### Diagnóstico e direção

Cadastro e ficha completa competiam com a lista por meio de overlays. A ficha reunia histórico, consultas, exames e dados administrativos dentro de uma área de rolagem restrita. A navegação não oferecia endereços próprios para essas tarefas. Recepção, médicos e enfermagem precisam consultar o mesmo contexto com ações diferentes, preservando as restrições existentes.

### Implementação

- `/pacientes/novo`, `/pacientes/:patientId/editar` e `/pacientes/:patientId` substituem os dois modais principais. Cadastro continua organizado por seções; ficha conserva suas abas de domínio.
- Busca, filtros e página da listagem retornam preservados. Links antigos com `?paciente=...&tab=...` encaminham à ficha correspondente.
- Consulta direta filtra clínica e paciente. Edição só fica disponível depois de carregar as comorbidades, evitando apagar informações após uma falha de leitura. Erro oferece nova tentativa.
- Campos, validação de duplicidades, consentimentos, contatos, lembretes, auditoria de leitura e regras de edição dos prontuários foram preservados. Permissões de cada aba e operação continuam aplicadas.
- Navegação avisa sobre alterações não salvas; falha de gravação mantém os campos. Não há persistência de rascunhos clínicos no navegador.
- Ficha usa a rolagem da página. Abas se reorganizam também na largura intermediária de 1024 px; nome do paciente pode quebrar linha sem truncar a identificação.
- Arquivos principais: `src/pages/Pacientes.tsx`, `src/App.tsx`, `src/config/routeLabels.ts`. Testes novos em `tests/patient-pages.spec.ts`; testes existentes de acesso médico, lembretes e experiência visual adaptados às páginas.

### Validação e limites

- Rodada ampliada: 25 cenários Playwright passaram, incluindo leitura de histórico assinado, edição do próprio rascunho, cadastro pelo médico, lembretes, busca/retorno e fluxos conectados de recepção. 12 testes unitários focados passaram.
- TypeScript e build local passaram. ESLint focal: zero erros; 54 avisos de `any` no arquivo legado de pacientes.
- Capturas de cadastro desktop/celular e histórico tablet efetivamente inspecionadas. A verificação adicional em 1024 px identificou e levou à correção das abas que não cabiam; rodada final e publicação registradas abaixo após conclusão.
- Não houve gravação em pacientes reais. Revisão de duplicidades, contato, acesso ao portal e confirmações curtas continuam contextuais; migração dos demais módulos permanece pendente.
- Rodada final: 7 cenários passaram, incluindo falha de leitura das comorbidades e recuperação. Capturas finais da ficha em 1024/390 px e do rodapé do cadastro em 390 px efetivamente inspecionadas; ações acessíveis acima da navegação inferior. Build repetido após o ajuste das abas passou.
- Publicada em 29/10/2026: `25d0957261cc2f4c83c0ad89e29ed53458b009b5`. Versão pública conferida, `/healthz` respondeu `ok`, Swarm concluiu a atualização. Cadastro vazio visualizado em produção sem gravar. Rollback: imagem `deploy-20261029-62b15fe` e fonte `code.before-20261029-25d0957`.

## Agenda — correção dos cabeçalhos dos profissionais

O responsável enviou um recorte e confirmou que o problema era o corte/altura, não os nomes de demonstração. A altura fixa de 75 px cortava a última linha quando ocupação e próxima vaga apareciam juntas. O teste de reprodução mediu o botão 10 px além do limite inferior do cabeçalho.

Removida a altura fixa em `DailyMultiDoctorView.tsx`. Os cabeçalhos crescem conforme o conteúdo, com mínimo de 96 px e alinhamento compartilhado pela faixa flex. Sincronização horizontal, comportamento fixo ao rolar e dados dos profissionais preservados. Nenhum cadastro foi modificado.

Validação: teste reproduziu a falha antes da correção; 2 testes unitários da grade passaram. A regressão existente de agenda passou, incluindo foco/Enter, alinhamento dos horários e cabeçalho fixo. Build passou, ESLint sem erros (31 avisos de `any` preexistentes no componente). Captura corrigida em 1280 px inspecionada. O teste de dimensões usa 1920/1440/1280 px; em 1024 px a interface existente utiliza lista responsiva, sem cabeçalho de colunas.

Rodada final do teste de dimensões passou, sem retries. Ocupação e botão de vaga livre ficam inteiros nas três larguras de grade; rolagem horizontal sincronizada e estado vazio responsivo em 1024 px verificados. Captura final em 1920 px também inspecionada.

Deploy concluído em 29/10/2026: `58148903cc349597a56a16f0c8a48a2b340819c8`, imagem `easypanel/elolab/app:deploy-20261029-5814890`. Versão pública e saúde conferidas; atualização Swarm concluída. Agenda visualizada em produção: ambos os cabeçalhos mediram 96 px, sem conteúdo ou botão excedendo a altura. Rollback preservado na imagem `deploy-20261029-25d0957` e fonte `code.before-20261029-5814890`. Sem alterações de dados ou migrations.

A migração de prescrições foi apenas investigada (código e formulário vazio renderizado). A correção da agenda enviada pelo responsável teve prioridade; não há mudanças parciais de prescrições nesta entrega.

## Prescrições — redação e conclusão em página própria

### Diagnóstico

O formulário de nova receita ocupava um modal estreito de aproximadamente 512 px. A inspeção em produção, sem preencher ou salvar, mostrou campos e ações cortados à direita. O resultado da emissão também abria um segundo modal. Não havia endereço próprio para redigir a receita nem proteção contra perder o texto ao sair.

### Jornada e decisões

Responsáveis: médico e administrador, conforme a autorização existente. A entrada continua em Documentos clínicos → Nova Prescrição e agora navega para `/documentos-clinicos/nova-prescricao`. Quando o histórico está filtrado por paciente, esse contexto preenche a identificação. No desktop, paciente/prescritor/data ficam ao lado da redação; telas menores usam leitura vertical e ações que quebram linha.

Etapas preservadas: selecionar paciente e médico ativo → redigir ou aplicar modelo → consultar comorbidades e avaliar alertas → revisão explícita quando houver alerta → gerar e enviar PDF → gravar receita → apresentar download/assinatura/histórico. Alerta crítico não ignorável continua impedindo a emissão. O PDF só é disponibilizado após salvar, e o download exige confirmação do registro de auditoria. Falha mantém o texto e permite nova tentativa. A conclusão recebe foco de teclado.

### Implementação

- `src/pages/Prescricoes.tsx`: formulário e resultado deixam de usar Dialog; proteção de alterações via `UnsavedChangesGuard`; retorno preserva busca, período, origem e filtro de paciente.
- `src/App.tsx` e `src/config/routeLabels.ts`: rota própria com os mesmos perfis `admin`/`medico`, título e breadcrumb.
- Médico da sessão é inicializado depois da consulta do vínculo. Falha dessa consulta oferece recuperação; o prescritor não fica vazio e bloqueado após a nova tentativa.
- Estado carregando/erro da configuração da clínica impede gerar PDF; restrição já aplicada pelo handler agora também é explícita na ação.
- Contratos de dados, geração/envio de PDF, limpeza em falha, auditoria, leitura do histórico, anexo assinado, modelos, integração Memed e regras clínicas preservados.
- Confirmação de alertas clínicos permanece contextual. Nenhuma alteração de API, permissão, migration ou dependência.

### Validação

- 8 cenários novos Playwright passaram: 1440/768/390 px, proteção de rascunho, falha e nova tentativa de upload, gravação única, PDF real com assinatura `%PDF-`, auditoria de download, alergia crítica, retorno com busca, acesso negado e recuperação do vínculo médico. As três larguras são cenários separados; alguns cenários validam mais de um comportamento.
- Regressão existente de prescrições sem médico ativo passou. 52 testes unitários de alertas, justificativas, auditoria documental e acessibilidade de rota passaram.
- TypeScript e build local passaram. ESLint focal sem erros; 27 avisos no arquivo existente (25 de `any`, 2 de dependências de hooks).
- Capturas da página em desktop/tablet, das ações no celular e do resultado efetivamente visualizadas. Campos não ultrapassam a página; ações do celular acessíveis acima da navegação inferior.

### Limites

Gravações, uploads e auditoria dos testes foram interceptados com dados sintéticos; nenhuma receita real foi emitida. Memed e assinatura externa foram preservadas, mas não homologadas com serviços reais nesta entrega. Recarregar a tela de conclusão inicia uma nova redação; o documento já salvo continua acessível no histórico. Demais módulos seguem no plano incremental.

### Publicação

Deploy em 29/10/2026: `bbb522d21cca1032c219b53eeabfed28fe82c87b`, imagem `easypanel/elolab/app:deploy-20261029-bbb522d`. Swarm concluiu a atualização, `/version.json` confirmou o build e `/healthz` respondeu `ok`. Na substituição houve resposta transitória de serviço indisponível; o serviço recuperou e a nova página foi recarregada e inspecionada em produção, com zero diálogos e sem emissão real. Rollback preservado: imagem `deploy-20261029-5814890` e fonte `code.before-20261029-bbb522d`.

## Atestados — emissão, consulta e duplicação em páginas próprias

### Diagnóstico e direção

O formulário de emissão usava um modal de aproximadamente 672 px, com rolagem interna e rodapé competindo com a área de texto. A escolha de modelo abria outro modal. A consulta de um documento também dependia de overlay e não possuía endereço próprio. A versão anterior foi efetivamente inspecionada em produção, sem emitir documentos.

Médico e administrador precisam identificar o paciente, selecionar o tipo, revisar informações obrigatórias e concluir a emissão. A nova composição usa a rolagem da página, mantém identificação antes do texto e apresenta somente os campos pertinentes ao tipo. Modelos ficam em uma seção expansível do próprio formulário.

### Jornada, integração e estados

- Histórico → Novo Atestado → `/documentos-clinicos/novo-atestado`. O filtro de paciente preenche a identificação. Médico vinculado continua obrigatório para o perfil médico; administrador seleciona entre os profissionais ativos.
- Escolher tipo/modelo → preencher horários, afastamento ou finalidade conforme o documento → revisar texto e consentimento de CID → emitir. Validações existentes permanecem; falha conserva os campos, sucesso retorna ao histórico com os filtros anteriores.
- Histórico → `/atestados/:certificateId`. Consulta direta filtra clínica e, para médico, seu vínculo. O documento só aparece após a auditoria de visualização confirmar o acesso. Falha oferece nova tentativa; documento ausente apresenta recuperação para o histórico.
- Duplicar abre uma nova emissão com referência ao documento de origem. Datas são recalculadas conforme o comportamento existente; autorização de CID é sempre desmarcada. Não há edição de documento emitido nem alteração de contrato de persistência.
- Imprimir preserva geração de PDF e exige auditoria de impressão antes de abrir o arquivo. Não foi adicionada assinatura digital.
- Sair com alterações, inclusive aplicação de modelo, pede confirmação de descarte. Rascunhos não são armazenados no navegador. Seleção de modelo por teclado retorna o foco ao botão Modelos.

### Implementação e validação

Arquivos: `src/pages/Atestados.tsx`, `src/App.tsx`, `src/config/routeLabels.ts` e `tests/certificate-pages.spec.ts`. APIs, permissões, proveniência dos modelos e validações clínicas foram preservadas. Nenhuma migration ou dependência adicionada.

- 9 cenários Playwright passaram sem retries: páginas em 1440/768/390 px, proteção de texto não salvo, validação de horários, falha e recuperação do salvamento, auditoria antes da leitura, duplicação sem consentimento herdado, modelos por teclado, busca preservada, acesso negado e impressão auditada com PDF real (`%PDF-`). Alguns cenários verificam vários comportamentos.
- 7 testes unitários focados passaram: proveniência de modelo de atestado, auditoria documental e acessibilidade de rota.
- TypeScript e build de produção passaram; ESLint focal sem erros, com 7 avisos no arquivo de atestados (5 de `any`, 2 de dependências de hooks).
- Cabeçalhos desktop/tablet/celular, rodapé no celular e detalhe no celular foram efetivamente visualizados. Campos não excedem a largura; ações finais permanecem acessíveis acima da navegação inferior.

### Limites

Gravações e auditoria dos testes usam dados sintéticos e respostas interceptadas. Nenhum atestado real foi emitido. A validação não substitui testes de isolamento no backend nem homologação jurídica do conteúdo dos documentos. A migração dos demais módulos continua incremental; confirmações curtas de segurança permanecem contextuais.

### Publicação

Deploy concluído em 29/10/2026: `763ab16c048965be847dde19bc22b6db9e5fd027`, imagem `easypanel/elolab/app:deploy-20261029-763ab16`. Swarm confirmou atualização concluída, `/version.json` confirmou o hash e `/healthz` respondeu `ok`. A página de emissão foi aberta e visualizada em produção com a sessão existente, sem preencher ou salvar, com zero diálogos. Rollback preservado: imagem `deploy-20261029-bbb522d` e fonte `code.before-20261029-763ab16`. Capturas sintéticas locais em `.qa-artifacts/atestados-20261029/` (fora do Git). Sem migration ou alteração de Edge Functions.

## Encaminhamentos — continuidade com o especialista

### Diagnóstico

O módulo possuía quatro modais de trabalho: criação, duas implementações de consulta e uma contra-referência separada. A lista de todos os encaminhamentos usava um controle de versão no salvamento da contra-referência; o painel por paciente não fazia essa mesma conferência. Essa duplicação criava comportamentos diferentes para a mesma tarefa. A lista e o detalhe anteriores foram inspecionados em produção; nenhuma transição foi executada.

### Jornada e decisões

- Médico vinculado e ativo seleciona o paciente → Novo Encaminhamento → `/documentos-clinicos/novo-encaminhamento?paciente=...`. A página apresenta paciente e médico de origem antes de especialidade, urgência e contexto clínico. Administrador sem vínculo médico continua sem emitir em nome de outro profissional, preservando a regra existente.
- Especialidade e motivo são obrigatórios. Médico de destino, CID, exames, tratamento e informações adicionais mantêm os contratos existentes. Falha conserva o preenchimento; sucesso retorna ao histórico com paciente e busca preservados.
- Tanto o painel por paciente quanto a tabela geral abrem `/encaminhamentos/:referralId`. A consulta filtra clínica e confirma auditoria de leitura antes de mostrar o documento. O backend mantém a autorização de leitura para médico/administrador da clínica; a atualização continua restrita à administração e aos médicos envolvidos.
- Estados preservados: pendente → em andamento; pendente/em andamento → concluído somente com contra-referência; pendente/em andamento → cancelado. Registros encerrados não oferecem ações de atualização. Cancelar exige confirmação explícita.
- Contra-referência e histórico ficam na mesma página. Salvamento confere clínica, estado e `updated_at`; conflito mantém o texto. Atualizar registro permite conferir a versão atual sem apagar o rascunho. Se outra sessão encerrar o registro, o texto local fica disponível para copiar, sem permitir sobrescrever o encerramento.
- Navegação e recarga protegem trabalho não salvo; requisições de criação e atualização têm bloqueio contra envio simultâneo. Rascunhos permanecem somente em memória.

### Implementação

Arquivos: `src/pages/Encaminhamentos.tsx`, `src/components/clinical/EncaminhamentoMedico.tsx`, `src/App.tsx`, `src/config/routeLabels.ts` e `tests/referral-pages.spec.ts`. Removidos os handlers e overlays duplicados de detalhe/contra-referência do componente por paciente. Formulário de criação reutilizado na página; histórico de status, campos clínicos, links existentes e ações da lista preservados. Sem alteração de API, permissões, dependências ou banco.

### Validação e limites

- 12 cenários Playwright passaram sem retries: criação/detalhe em 1440/768/390 px, proteção de rascunhos, validação e recuperação de salvamento, conflito de atualização, encerramento em outra sessão, confirmação de cancelamento, restrições por médico/perfil, falha de auditoria, entrada pelo painel do paciente, retorno com contexto e regressão do administrador sem vínculo médico.
- 13 testes unitários focados passaram: auditoria, contratos de autoria/transições, integridade documental e acessibilidade de rota. Os testes de migrations são verificações do código SQL, não execução contra o banco.
- TypeScript com `tsconfig.app.json` e build de produção passaram. ESLint focal sem erros; 12 avisos no arquivo de página (8 de `any`, 4 de dependências de hooks).
- Capturas de criação desktop/tablet, rodapé mobile e detalhe desktop/mobile efetivamente visualizadas. Campos usam rolagem da página, sem overlay; ações de criação no celular ficam acima da navegação inferior.
- Dados, gravações e auditoria dos testes foram interceptados com fixtures sintéticas. Não houve encaminhamento real criado, iniciado, concluído ou cancelado. Isolamento do backend e integrações externas não foram rehomologados nesta entrega.

### Publicação

Deploy concluído em 29/10/2026: `f5a8eae0db6185ac04abdeddf124d31491975294`, imagem `easypanel/elolab/app:deploy-20261029-f5a8eae`. Swarm confirmou atualização concluída; `/version.json` confirmou a versão e `/healthz` respondeu `ok`. Houve indisponibilidade transitória durante a troca, seguida de recuperação confirmada. A navegação da lista para o detalhe do registro de demonstração foi conferida em produção: página própria, zero diálogos, auditoria de leitura concluída e histórico visível. Não houve alteração de status ou texto clínico. Rollback preservado: imagem `deploy-20261029-763ab16` e fonte `code.before-20261029-f5a8eae`. Capturas sintéticas locais em `.qa-artifacts/encaminhamentos-20261029/`, fora do Git. Sem migration ou deploy de Edge Functions.

## Exames — guia, consulta e lançamento de resultado

### Diagnóstico e direção

A guia ocupava um modal com altura de 95% da janela, rolagem interna e rodapé fixo. O resultado abria outro modal; o detalhe não possuía endereço próprio. A inspeção visual da versão publicada mostrou a indicação clínica fora da área inicial e o formulário comprimido entre cabeçalho e ações. O objetivo da mudança é dar espaço à solicitação e preservar o contexto entre prontuário, exames e laboratório.

### Jornada, estados e integração

- `/exames/nova`: identificação do paciente e solicitante → escolha dos exames → indicação, preparo e anexos → solicitar ou solicitar e baixar PDF. Os rótulos de paciente, solicitante, data, validade, urgência, jejum, categoria, preços e laboratório foram associados aos controles correspondentes.
- Links existentes com `novo=1` encaminham à nova página mantendo paciente e prontuário. A confirmação de vínculo com o prontuário continua obrigatória; contexto inválido impede o salvamento. Retorno conserva os filtros da lista e o acesso ao prontuário.
- `/exames/:examId`: consulta direta restrita à clínica, com carregamento, recuperação de erro e registro indisponível. Campos clínicos, anexos privados e download de laudo preservados. Ações levam ao laboratório ou ao lançamento de resultado conforme a etapa existente.
- `/exames/:examId/resultado`: identifica paciente e exame antes do texto e arquivo. A rota só permite o lançamento quando a próxima ação do fluxo é liberar laudo. Exames laboratoriais continuam na esteira de laboratório; cancelados e finalizados não ganham transições alternativas pela URL.
- Falha de gravação conserva texto e arquivo. A versão `updated_at` continua impedindo sobrescrita de outro operador. Resultado salvo e falha posterior na liberação são comunicados separadamente; o resultado não é enviado de novo ao voltar à lista.
- Guardas de saída/recarga protegem os rascunhos e bloqueiam descarte durante envio. Bloqueio de requisição duplicada foi preservado na guia e reforçado no resultado. Dados não são persistidos localmente.
- APIs, proteção por plano e perfis, armazenamento privado, upload/limpeza de arquivos, geração de PDF, automações de coleta e liberação permanecem com os contratos anteriores. Nenhuma regra clínica ou financeira alterada.

### Implementação e validação

Arquivos: `src/pages/Exames.tsx`, `src/components/exames/LancarResultado.tsx`, `src/App.tsx`, `src/config/routeLabels.ts`, testes do componente e testes Playwright. A regressão prontuário → pedido → laboratório foi adaptada para navegar pela página, sem enfraquecer as asserções de vínculo e payload.

- 10 cenários novos Playwright passaram, incluindo 1440/768/390 px, proteção de rascunho, falha de solicitação, PDF real (`%PDF-`), concorrência no resultado, liberação posterior malsucedida, retorno com busca, rotas fora da etapa/perfil, carregamento, erro e exame ausente.
- 3 regressões existentes passaram: acesso médico a exames da clínica, prontuário e pedido conectado ao laboratório, confirmações de cancelamento/exclusão em desktop e celular.
- 13 testes unitários passaram: concorrência/upload do resultado, transições, preparos e filtros. TypeScript com `tsconfig.app.json` e build de produção passaram; ESLint focal sem erros, com 20 avisos existentes no arquivo de exames (17 de `any`, 3 de dependências de hooks).
- Capturas de guia desktop/tablet, rodapé no celular, consulta mobile e resultado desktop/mobile efetivamente visualizadas. Campos não ultrapassam a tela e as ações ficam acessíveis acima da navegação inferior.

### Limites e sequência

Testes de gravação, upload e automação foram executados com respostas interceptadas e dados sintéticos; nenhum exame real foi solicitado ou liberado. Integrações externas não foram rehomologadas. Cadastro de laboratórios/fornecedores ainda usa o gerenciador anterior e será tratado como fluxo próprio em entrega posterior. Confirmações curtas de cancelamento, exclusão e descarte permanecem em diálogos. A diretriz confirmada pelo responsável é migrar todos os formulários e tarefas longas gradualmente, mantendo particularidades de cada módulo.

### Publicação

Deploy concluído em 29/10/2026: `f749c0369ade733b71a2bfa4fc658e5bfc42b9af`, imagem `easypanel/elolab/app:deploy-20261029-f749c03`. Swarm concluiu a atualização; versão pública conferida e `/healthz` respondeu `ok`. A guia vazia foi aberta e efetivamente visualizada em produção: página própria, zero diálogos, campos e ações presentes. Nenhum pedido ou resultado real foi salvo. Rollback preservado: imagem `deploy-20261029-f5a8eae` e fonte `code.before-20261029-f749c03`. Capturas sintéticas em `.qa-artifacts/exames-20261029/`, fora do Git. Sem migration ou deploy de Edge Functions.
