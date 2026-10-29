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

## Laboratórios e fornecedores — páginas próprias (29/10/2026)

Diagnóstico: listagem e cadastro estavam em modais aninhados; acesso direto à edição não existia. O gerenciador e o seletor de exames compartilhavam uma chave de cache com formatos e filtros diferentes.

Direção e implementação: listagem em `/exames/laboratorios`, cadastro em `/exames/laboratorios/novo` e edição em `/exames/laboratorios/:laboratoryId/editar`. Retorno preserva contexto dos exames. Formulário com rótulos associados, proteção de saída, bloqueio de envio duplicado, recuperação de falha e estados de registro ausente/carregamento/erro. Cache de gestão separado do seletor. As ações refletem as políticas SQL existentes: médico consulta, administração/enfermagem cadastram e editam, administração exclui. Exclusão mantém confirmação curta. Nenhuma API, permissão de banco ou integração alterada.

Arquivos: `GerenciadorLaboratorios.tsx`, `Exames.tsx`, `App.tsx`, `routeLabels.ts` e `tests/laboratory-directory-pages.spec.ts`.

Validação: seis cenários Playwright passaram (1440/768/390 px, retorno, recarga de edição, rascunho, falha e sucesso de gravação, registro ausente e permissões). TypeScript da aplicação e build passaram. ESLint focal: zero erros, 23 avisos de tipagem/hooks. Capturas desktop e mobile efetivamente visualizadas. Corrigida margem de rolagem do botão final que ficava atrás da navegação inferior no celular. Escritas foram interceptadas com dados sintéticos; nenhum fornecedor real foi alterado. Capturas em `.qa-artifacts/laboratorios-20261029/`.

Publicação de laboratórios: build `8db5d6de2f5247a307e153696b8b17fcedc5db34`, imagem `easypanel/elolab/app:deploy-20261029-8db5d6de`. Swarm concluído, versão pública conferida e healthcheck `ok`. Página de cadastro vazia efetivamente visualizada em produção, sem gravação. Rollback: imagem `deploy-20261029-f749c03` e fonte `code.before-20261029-8db5d6de`.

## Salas e leitos — cadastro e edição em páginas próprias (29/10/2026)

Diagnóstico: o formulário longo de localização, recursos, horários e leitos ficava em overlay com rolagem interna. Fechar descartava o preenchimento, e a edição dependia de abrir um cartão da listagem.

Direção e implementação: rotas `/gestao-fluxo/salas/nova` e `/gestao-fluxo/salas/:roomId/editar`, com consulta direta restrita à clínica, seções contínuas e retorno à aba/lista com filtros. Equipamentos, campos condicionais de leito, cor salva, horários e responsável permanecem. Proteção de saída/recarga, bloqueio de envio simultâneo e recuperação de erro adicionados. Preservadas validação de ocupação e atualização condicionada por `updated_at`; não há nova transição clínica nem mudança de permissão. A lista e suas ações operacionais permanecem no workspace.

Arquivos: `Salas.tsx`, `App.tsx`, `routeLabels.ts`, `tests/room-pages.spec.ts` e adaptação das regressões de salas em `ux-visual-synthetic.spec.ts`.

Validação: nove cenários Playwright passaram, incluindo os dois cenários existentes de ocupação/perfis; três larguras (1440/768/390), entrada pela lista e URL direta, recarga, filtros, rascunhos, erro e sucesso de gravação, conflito de versão, registro ausente e leitos. Nove testes unitários passaram em quatro arquivos (ocupação, abas e contratos SQL de acesso). TypeScript e build passaram; ESLint focal sem erros e 26 avisos. Capturas do formulário desktop e do rodapé mobile efetivamente inspecionadas, com botões acima da navegação inferior. Evidências em `.qa-artifacts/salas-20261029/`.

Limites: testes de escrita foram interceptados e as verificações SQL não executam migrations. Não criamos salas reais nem modificamos ocupações em produção. Configurações possui um cadastro simplificado de salas separado; será tratado na etapa correspondente, sem declarar todas as entradas de salas já migradas.

Publicação de salas e leitos: build `6fd6e46352a0011722c7f8da78afbe7a6735ca2f`, imagem `easypanel/elolab/app:deploy-20261029-6fd6e463`. Swarm concluído, versão pública e healthcheck conferidos. Formulário vazio efetivamente visualizado no app publicado, sem gravação. Rollback: imagem `deploy-20261029-8db5d6de` e fonte `code.before-20261029-6fd6e463`.

## Tipos de consulta e preços por convênio — páginas próprias (29/10/2026)

Diagnóstico: cadastro/edição e tabela de preços eram overlays. A saída podia descartar valores em edição; a entrada pelo Caixa perdia a aba ao navegar. As rotas de tarefas também expunham IDs sem destino válido nos breadcrumbs.

Implementação: `/precos-servicos/tipos/novo`, `/precos-servicos/tipos/:consultationTypeId/editar` e `/precos-servicos/tipos/:consultationTypeId/precos`. Cadastro e edição consultam o registro da clínica diretamente; rascunhos e edições de valores são protegidos na saída. Preços continuam gravados por convênio, com validações, bloqueio de envio duplicado e recuperação de falha. Administrador mantém cadastro de tipos; Financeiro mantém alteração de preços. A volta preserva filtros e, na entrada pelo Caixa, a aba Tipos de Consulta. Paleta de novas escolhas alinhada ao EloLab, preservando a cor já cadastrada. Breadcrumbs omitem segmentos de registro sem página própria.

Arquivos: `TiposConsulta.tsx`, ajuste pontual de retorno em `CaixaDiario.tsx`, rotas, rótulos, `Breadcrumbs.tsx` e testes. Não houve alteração em lançamentos, pagamentos, contratos de API ou políticas de acesso.

Validação: sete cenários Playwright passaram, incluindo 1440/768/390 px, rascunhos de cadastro e preço, recuperação de falhas, edição com cor/preparo preservados, retorno ao Caixa, registro ausente e permissões. Doze testes unitários passaram em seis arquivos (abas, acesso, integridade de preços, breadcrumbs e anúncio de rota). TypeScript e build passaram; lint focal sem erros, com 32 avisos nos arquivos de tipos/Caixa. Capturas de cadastro, rodapé mobile e preços efetivamente visualizadas. O ID exposto no breadcrumb foi corrigido durante essa revisão. Evidências em `.qa-artifacts/tipos-20261029/`.

Limites: escritas foram simuladas por interceptação, sem preços reais alterados. Não rehomologamos faturamento nem convênios externos. Os limites de consulta e as validações de duplicidade existentes permanecem.

Publicação de tipos e preços: build `a2b0361e58b4415c813f68ca182f18dcd87afa7a`, imagem `easypanel/elolab/app:deploy-20261029-a2b0361e`. Swarm concluído, versão e healthcheck conferidos. Cadastro vazio efetivamente visualizado em produção, sem gravação. Rollback: imagem `deploy-20261029-6fd6e463` e fonte `code.before-20261029-a2b0361e`.

## Lista de espera — inclusão em página própria (29/10/2026)

Diagnóstico: a solicitação de vaga usava modal longo e podia perder o preenchimento ao fechar. A busca de paciente, prioridade, especialidade e disponibilidade precisam continuar juntas, com retorno à lista operacional.

Implementação: rota `/gestao-fluxo/espera/nova`, formulário contínuo com proteção contra saída/recarga e envio repetido. Retorno preserva aba, parâmetros e filtros. Mantidas a consulta preventiva de pedido duplicado, a recuperação da restrição concorrente do banco, as preferências, o vínculo com paciente e o status inicial aguardando. As ações de contato, agendamento, desistência e exclusão da lista não mudaram. Confirmações curtas continuam em diálogos.

Validação: cinco cenários Playwright passaram, incluindo desktop/tablet/celular, descarte protegido, seleção de paciente, duplicidade, erro de gravação, sucesso e restrição por perfil. Onze testes unitários passaram em três arquivos (prioridade, compatibilidade de vagas e sidebar da agenda). TypeScript e build passaram; ESLint focal com zero erros e nove avisos. Capturas desktop do formulário e mobile do rodapé efetivamente visualizadas; ações acima da navegação inferior. Evidências em `.qa-artifacts/espera-20261029/`.

Arquivos: `ListaEspera.tsx`, `App.tsx`, `routeLabels.ts` e `tests/waiting-list-page.spec.ts`. Testes usam escritas interceptadas; nenhuma inscrição, mensagem ou agendamento real foi criado. Nenhuma migration ou alteração de API.

Publicação da lista de espera: build `f46ad56444b665343c504971d161d8b35762e0e5`, imagem `easypanel/elolab/app:deploy-20261029-f46ad564`. Swarm concluído, versão pública e healthcheck conferidos. Formulário vazio efetivamente visualizado em produção, sem inscrição real. Rollback: imagem `deploy-20261029-a2b0361e` e fonte `code.before-20261029-f46ad564`.

## Retornos — agendamento e remarcação em página própria (29/10/2026)

Diagnóstico: agendamento/remarcação dependiam de um modal e de estado da listagem, sem endereço direto nem proteção de alterações. A consulta do horário existente antes da abertura podia falhar sem uma página de recuperação.

Implementação: `/retornos/:returnId/agendar` abre agendamento ou remarcação conforme o vínculo existente. Consulta restrita à clínica recupera retorno, paciente, profissional e horário atual. Identificação ausente interrompe a abertura para conferência. Estados de erro, inexistência e retorno já encerrado têm feedback e retorno à lista. Preservados os bloqueios de agenda, conflitos de médico/paciente, verificação de expediente, confirmação explícita fora de expediente e RPC `agendar_retorno_atomico`. Envio simultâneo bloqueado; alteração não salva protegida. A volta mantém filtro de paciente e demais filtros. Sem mudança de RPC, regra de negócio ou autorização.

Validação: sete cenários Playwright passaram, incluindo três larguras, vínculo e horário da remarcação, retorno à lista filtrada, descarte, conflito de agenda, exceção de expediente, falha e recuperação de RPC, registro ausente/encerrado e perfil sem acesso. Vinte e um testes unitários passaram em cinco arquivos (horário, conclusão, contratos SQL e breadcrumbs). TypeScript e build passaram; lint focal sem erros, 12 avisos. Capturas desktop/mobile efetivamente visualizadas, com contexto do paciente e ações acessíveis. Evidências em `.qa-artifacts/retornos-20261029/`.

Arquivos: `Retornos.tsx`, rotas/rótulos, breadcrumbs e `tests/return-booking-page.spec.ts`. Agendamentos e remarcações de teste foram interceptados; nenhum atendimento real foi criado ou alterado. Testes de SQL verificam contratos no código, sem aplicar migrations. O componente clínico que solicita retornos dentro do prontuário permanece na etapa de componentes clínicos.

Publicação de retornos: build `ba79548d02a66b735cbf712d4364ca1df043d515`, imagem `easypanel/elolab/app:deploy-20261029-ba79548d`. Swarm concluído, versão pública e healthcheck conferidos. Página de remarcação de registro DEMONSTRAÇÃO efetivamente visualizada em produção, sem confirmação ou alteração. Rollback: imagem `deploy-20261029-f46ad564` e fonte `code.before-20261029-ba79548d`.

## Convênios — cadastro e tabela de exames (29/10/2026)

Diagnóstico: formulário extenso de cadastro dividido em abas dentro de modal, com outro modal para preço de exame. O contexto da operadora e os campos regulatórios/comerciais competiam com a área disponível. Fechamento acidental perdia o preenchimento.

Implementação: páginas `/convenios/novo`, `/:agreementId/editar`, `/:agreementId/exames`, `/:agreementId/exames/novo` e `/:agreementId/exames/:agreementExamId/editar`. Consulta direta restrita à clínica e, para preços, ao convênio. Cadastro e tabela têm navegação própria; filtros são restaurados ao voltar. Formulários mantêm planos, contatos, ANS/TISS, carência, retorno, glosa, custos e repasses. Preservadas validações, controle de versão do cadastro, RLS e permissões (cadastro administrativo, preços também para financeiro). Descarte protegido, envio bloqueado durante gravação e mensagens de recuperação. Confirmações curtas de exclusão permanecem. Nenhuma alteração de API ou migration.

Correção encontrada durante a validação: abas com ativação automática reabriam a confirmação de descarte quando o foco retornava à aba. A navegação entre páginas agora exige ativação explícita, mantendo foco por teclado sem navegar ao apenas receber foco.

Validação: nove cenários Playwright passaram (três larguras, descarte, filtros, criação e edição, payload/versionamento, falhas recuperáveis, carregamento, registros ausentes e três perfis). Quatorze testes unitários passaram em quatro arquivos de permissões, contratos de convênio e breadcrumbs. TypeScript e build passaram; lint focal com zero erros e 17 avisos. Capturas desktop, tablet e celular produzidas; desktop e rodapés mobile efetivamente visualizados em `.qa-artifacts/convenios-20261029/`. Corrigido também HTML inválido de badge dentro de parágrafo na listagem. Nenhuma escrita de teste atingiu produção.

Arquivos: `Convenios.tsx`, `App.tsx`, `routeLabels.ts`, `Breadcrumbs.tsx`, teste de breadcrumbs e `tests/agreement-pages.spec.ts`. A tabela geral `PrecosExames.tsx` possui fluxos distintos e será tratada na próxima entrega; não foi declarada migrada por esta mudança.

Publicação de convênios: build `fe7a0feccd03ff1a4c79f41a36359f99ce033713`, imagem `easypanel/elolab/app:deploy-20261029-fe7a0fec`. Swarm concluído, versão e healthcheck públicos conferidos. Cadastro vazio efetivamente visualizado em produção. Rollback: imagem `deploy-20261029-ba79548d` e fonte `code.before-20261029-fe7a0fec`.

## Tabela geral de preços de exames — particular e convênio (29/10/2026)

Diagnóstico: cadastros por modal em duas origens (Preços e serviços e aba do Caixa). Preços particulares são um array JSON sem ID, portanto transformar o índice da linha em rota permitiria abrir outro exame depois de reordenação. O fluxo por convênio usa registros identificados e controle de versão próprio.

Implementação: páginas de criação/edição em `/precos-servicos/exames/particular/novo`, `/particular/editar?item=…`, `/convenios/novo` e `/convenios/:examPriceId/editar`. Particular é resolvido pela identidade exata nome/código; registro renomeado, ausente ou ambíguo exige reabertura pela lista. A versão da tabela e os demais itens são preservados durante edição; conflito não adota silenciosamente uma versão nova. Convênios preservam seleção da operadora, duplicidade, versionamento, custos e repasses. Retorno recupera filtros, aba interna e origem no Caixa. Proteção contra descarte, bloqueio de envio repetido e formulários acessíveis por teclado. API, estrutura JSON e controles de acesso mantidos.

Validação: dez cenários Playwright passaram, incluindo três larguras, edição, criação, preservação dos demais itens, conflito de versão, identificação ambígua, duplicidade, falha recuperável, permissão e retorno à aba Tabela de Preços do Caixa. O teste adicional do Caixa teve seu seletor corrigido para o nome real da aba e passou na execução final. Dez testes unitários distintos em contratos de preços e breadcrumbs passaram. TypeScript, build e diff-check passaram; lint focal com zero erros e 52 avisos (inclui o arquivo extenso de Caixa). Capturas efetivamente inspecionadas em desktop/celular, com ações acima da navegação mobile; evidências em `.qa-artifacts/precos-exames-20261029/`.

Arquivos: `PrecosExames.tsx`, `CaixaDiario.tsx`, rotas, rótulos, breadcrumbs e `tests/exam-price-pages.spec.ts`. Nenhuma gravação financeira real foi executada. Limite preservado: a tabela particular continua usando o contrato JSON legado; links de itens renomeados devem ser reabertos pela lista.

Publicação dos preços gerais: build `53d490de410450c54f9217d0def0bea134433dfe`, imagem `easypanel/elolab/app:deploy-20261029-53d490de`. Swarm concluído, versão pública e healthcheck conferidos. Cadastro particular vazio efetivamente visualizado no aplicativo publicado. Rollback: imagem `deploy-20261029-fe7a0fec` e fonte `code.before-20261029-53d490de`.

## Equipe médica — cadastro, perfil e disponibilidade (29/10/2026)

Diagnóstico: cadastro extenso em modal com rolagem interna, perfil em painel sobreposto e disponibilidade editada dentro do cadastro, embora sua gravação seja independente. Isso misturava duas tarefas com persistências diferentes e dificultava manter contexto/alterações.

Implementação: `/equipe/medicos/novo`, `/:doctorId/editar`, `/:doctorId` e `/:doctorId/disponibilidade`. Cadastro protegido contra descarte e saída durante uploads/gravação; formulário nativo com campos existentes, foto e carimbo. Perfil ocupa página e mantém agenda, documentos e auditoria de leitura. O resumo informa os limites dos registros consultados. Disponibilidade possui página própria, proteção do rascunho e bloqueio de gravações simultâneas; atualizações/exclusões também filtram o profissional. Consulta administrativa continua pela RPC existente; cadastros, validação de registro duplicado, controle de versão, vínculos de funcionário e convite mantidos. Nenhum acesso real foi concedido durante os testes.

Validação: oito cenários Playwright passaram (desktop/tablet/celular, edição, perfil, retorno filtrado, descarte, erro recuperável, cadastro com convite malsucedido, disponibilidade, ausência de registro e permissão). Três testes de componente de disponibilidade passaram, incluindo domingo e faixa inválida. TypeScript, build e lint focal passaram; lint com 30 avisos, zero erros. Capturas de cadastro desktop e perfil mobile efetivamente visualizadas em `.qa-artifacts/medicos-20261029/`. Testes de escrita, vínculo e convite inteiramente interceptados. APIs e banco não foram migrados.

Arquivos: `Medicos.tsx`, `MedicoAvailabilityManager.tsx`, `App.tsx`, `routeLabels.ts` e `tests/doctor-pages.spec.ts`. Permanecem as confirmações curtas de inativação e remoção de horário. Funcionários, convites e usuários são entregas seguintes, ainda não declaradas concluídas.

Publicação da equipe médica: build `2b44e9b1ca71236a4f1b49972af8720d8656367d`, imagem `easypanel/elolab/app:deploy-20261029-2b44e9b1`. Swarm concluído, versão e healthcheck conferidos. Cadastro vazio efetivamente visualizado em produção. Capturas adicionais de rodapé do cadastro e disponibilidade mobile foram visualizadas; teste de disponibilidade repetido com captura passou. Rollback: imagem `deploy-20261029-53d490de` e fonte `code.before-20261029-2b44e9b1`.

## Funcionários — ficha e nomes dos perfis (29/10/2026)

Diagnóstico: ficha profissional, acesso e descrições dos perfis dependiam de modais extensos. Conflito de edição fechava o formulário, perdendo a referência do preenchimento; falha de permissões após atualizar mantinha uma versão antiga aberta, induzindo nova tentativa sem conferência.

Implementação: `/equipe/funcionarios/novo`, `/:employeeId/editar` e `/perfis`. Mantidas RPC administrativa, validações, tipo profissional/campos condicionais, prévia de acesso, proteção do último administrador e compare-and-set por `edit_version`. Troca de papéis continua pela RPC atômica e versionada. Conflito anterior à gravação preserva o rascunho e orienta reabertura; dados já persistidos com falha de vínculo/permissões retornam à lista com aviso específico para recuperação, sem duplicar cadastro. Personalização altera nomes/descrições, sem ampliar autorização. Proteção contra descarte e envio repetido; volta preserva filtros.

Validação: nove cenários Playwright passaram, incluindo três larguras, criação, edição, versões, falhas parciais, recuperação, nomes dos perfis, registros ausentes e perfil sem autorização. Dezoito testes unitários passaram em contratos de concorrência/revogação e breadcrumbs. TypeScript e build passaram; lint focal com 19 avisos, zero erros. Cadastro desktop, rodapé mobile e nomes dos perfis mobile efetivamente inspecionados em `.qa-artifacts/funcionarios-20261029/`. Escritas e alterações de acesso foram interceptadas em todos os testes; nenhuma conta real foi modificada.

Arquivos: `Funcionarios.tsx`, `App.tsx`, `routeLabels.ts`, breadcrumbs e `tests/employee-pages.spec.ts`. Convites continuam na próxima etapa. Confirmação curta de exclusão preservada.

Publicação de funcionários: build `8100161fe4b6364e2a431cc86917b20568951171`, imagem `easypanel/elolab/app:deploy-20261029-8100161f`, Swarm concluído e healthcheck conferido. Inspeção real encontrou um caso não representado na primeira suíte: configuração de nomes ausente retornava `undefined`, que o React Query rejeita. Correção para `null` e cenário de regressão incluídos na entrega seguinte. Rollback: `deploy-20261029-2b44e9b1` e fonte `code.before-20261029-8100161f`.

## Convites — página de destinatário e acesso (29/10/2026)

Diagnóstico: o administrador preparava o convite em modal; erros de envio e ausência de capacidade precisavam preservar o trabalho e distinguir criação do convite de entrega do e-mail. A cópia manual de link também ocupava um modal sem necessidade.

Implementação: `/equipe/convites/novo`, com retorno à origem e filtro, prévia das permissões existentes, limite consultado no servidor, recuperação de falha da consulta, proteção contra descarte e envio repetido. Sucesso abre a lista para acompanhamento, inclusive quando o convite existe mas o e-mail não foi enviado. Mantido o contrato `invite-employee`; nenhum acesso real foi criado nos testes. A cópia manual virou seção na lista com foco no campo; token permanece apenas em memória. Confirmação curta de cancelamento preservada. Corrigido o retorno vazio de configurações de nomes dos funcionários, observado em produção.

Validação: sete cenários Playwright distintos passaram, incluindo desktop/celular, erro de envio com recuperação, limite atingido, consulta malsucedida, permissão, retorno à origem, filtro, cópia manual e configuração ausente. O seletor do teste de permissão foi corrigido para o título real “Acesso Negado”; repetição passou. Sete testes unitários passaram (prévia de acesso, gestão de convites e mapeamento dos limites). TypeScript, build, diff-check e lint focal concluídos; lint com 35 avisos e zero erros. Capturas de cabeçalho, formulário desktop e rodapé mobile efetivamente inspecionadas em `.qa-artifacts/convites-20261029/`.

Arquivos: `ConvidarFuncionario.tsx` substitui `ConvidarFuncionarioDialog.tsx`; chamadas em `Funcionarios.tsx` e `ConvitesList.tsx`, rotas/rótulos e testes. Envio e mutações foram interceptados; validação de entrega real de e-mail não foi executada. Backend, autenticação e regras de concessão de acesso permanecem inalterados.

Publicação: build `c5b0140aa63042bc76bd4bf2fb1de55e3fcbe6e5`, imagem `easypanel/elolab/app:deploy-20261029-c5b0140a`. Versão e healthcheck públicos conferidos. Página de convite visualizada em produção; cadastro de funcionário reaberto sem o erro de configuração ausente. A clínica visualizada está sem plano definido; o limite exibido segue a resposta real e não foi contornado. Rollback: `deploy-20261029-8100161f` e fonte `code.before-20261029-c5b0140a`.

## Usuários da plataforma — edição de conta (29/10/2026)

Diagnóstico: edição de nome, telefone e funções em modal. Contas sem função recebiam Recepção automaticamente ao abrir, tornando uma alteração de contato uma possível concessão involuntária. A operação é exclusiva da administração da plataforma, separada da gestão de funcionários da clínica.

Implementação: `/usuarios/:accountId/editar`, leitura por identificador, retorno com filtros, formulário nativo e rascunho protegido. Funções existentes preservadas, inclusive lista vazia, exigindo seleção explícita para salvar. E-mail continua somente leitura. Validações de tamanho alinhadas à RPC existente; envio bloqueado enquanto grava. Mantida `platform_update_clinic_user`, que atualiza dados e papéis atomicamente e registra auditoria. Própria conta, conta ausente e administrador de clínica têm o acesso previsto no contrato. Confirmação curta de bloqueio e demais ações da lista preservadas.

Validação: seis testes Playwright passaram, cobrindo desktop/celular, recuperação de falha, payload da RPC, filtros, descarte, nenhuma função, registro ausente, própria conta e fronteira de autorização. Dez testes de breadcrumbs passaram. TypeScript, build e diff-check; lint com zero erros e dois avisos. Capturas desktop e rodapé mobile efetivamente visualizadas em `.qa-artifacts/usuarios-20261029/`. Todas as alterações de conta interceptadas; nenhum acesso real modificado.

Arquivos: `Usuarios.tsx`, rotas, rótulos, breadcrumbs e `tests/user-account-page.spec.ts`. Limite existente: a RPC não recebe versão esperada; não foi inventado controle de concorrência no cliente nem alterado o contrato do servidor.

Publicação: build `da57b1d61a161eae5422c65d3a58fdc33e6fdd80`, imagem `easypanel/elolab/app:deploy-20261029-da57b1d6`. Swarm concluído, versão/healthcheck conferidos e página real inspecionada sem modificar a conta. Inspeção encontrou o menu voltando ao modo clínico na subrota; a entrega seguinte corrige a classificação e abre o grupo correspondente também em páginas filhas. Rollback: `deploy-20261029-c5b0140a` e fonte `code.before-20261029-da57b1d6`.

## Estoque — cadastro, movimentação e histórico (29/10/2026)

Diagnóstico: cadastro com rolagem interna, entrada/saída e histórico em três sobreposições diferentes. Formulário extenso com campos sem associação explícita às legendas. Movimentação precisa manter o item, o motivo e a chave da tentativa em caso de resposta incerta.

Implementação: `/estoque/novo`, `/:itemId/editar`, `/entrada`, `/saida` e `/historico`. Consultas de página filtram item e clínica; histórico mantém limite explícito de 50 movimentos e ações de continuidade. Cadastro mantém controle por `updated_at` e nunca edita saldo; saldo inicial e movimentações continuam nas RPCs idempotentes existentes, reutilizando a chave em nova tentativa. Saldo atual/projetado, máximo, mínimo, valores, lote e validade preservados. Formulários nativos, campos identificados, bloqueio durante gravação, guarda de alterações e retorno com busca, alerta, categoria e visão. Confirmação curta de exclusão preservada.

Validação: dez novos cenários Playwright passaram (três larguras, edição, conflito, cadastro, entrada, saída, falha recuperável, chaves de idempotência, histórico vazio/erro, item ausente e autorização). Regressão da listagem em três larguras, estado vazio e cores do histórico passou. Quinze testes unitários de estoque/ABC/breadcrumbs passaram. TypeScript, build e diff-check passaram; lint focal com zero erros e 27 avisos. Cadastro desktop, rodapé mobile, entrada mobile e histórico desktop efetivamente inspecionados em `.qa-artifacts/estoque-20261029/`. Escritas inteiramente interceptadas; nenhum saldo real alterado.

Correção de navegação verificada junto desta entrega: subrotas de Usuários conservam o menu da plataforma; grupos abrem também na página filha, respeitando itens com correspondência exata. Vinte e um testes de configuração do menu, onze de Sidebar e o cenário de edição de conta desktop passaram. O teste de componente aguarda a transição visual antes de verificar visibilidade.

Arquivos: `Estoque.tsx`, rotas/rótulos/breadcrumbs, Sidebar/configuração do menu e testes. API, histórico, idempotência e autorização do servidor preservados. Listagem continua com o limite de consulta preexistente; não foi simulada paginação inexistente. Histórico também testado e efetivamente visualizado a 390px, com origem, quantidade, data e motivo legíveis, sem sobreposição.

Publicação: build `9ffe8f94d95bf1c65e5e13012013ade7ab758056`, imagem `easypanel/elolab/app:deploy-20261029-9ffe8f94`. Swarm concluído e versão/healthcheck conferidos. Novo produto efetivamente visualizado em produção, sem cadastro. Navegação administrativa na edição de conta também conferida após a correção. Rollback: `deploy-20261029-da57b1d6` e fonte `code.before-20261029-9ffe8f94`.

## Tarefas — criação e edição com contexto (29/10/2026)

Diagnóstico: o formulário aparecia sobre a lista/quadro; saída apagava a edição sem confirmação e o envio não bloqueava o restante dos campos. O modo de visão, a busca e os filtros precisavam acompanhar a transição para uma rota real.

Implementação: `/tarefas/nova` e `/:taskId/editar`. Retorno recupera busca, status, filtro rápido, ordenação, filtro pessoal e visão. Leitura da edição filtra ID e clínica; baseline e versão não são substituídos por atualizações periódicas. Mantidas criação com autor/clínica, proteção por `updated_at`, vínculos de responsáveis e pacientes, papéis de acesso, ações da lista/quadro e rascunho de criação na sessão já existente. Proteção de navegação, formulário nativo, bloqueio durante envio e recuperação da consulta de responsáveis. O atalho da busca fica restrito à lista. Confirmação curta de exclusão mantida.

Validação: oito cenários Playwright distintos passaram (três larguras, edição, conflito, retorno filtrado, criação, recuperação/limpeza de rascunho, erro recuperável, limites do perfil financeiro e registro ausente). A repetição responsiva final passou nas três larguras após corrigir a largura mínima do fieldset; no tablet o teste realiza rolagem explícita para conferir as ações acima da barra inferior. Vinte testes unitários de tarefas e integridade passaram. TypeScript, build e diff-check passaram; lint focal com zero erros e 39 avisos. Formulário desktop e rodapés tablet/celular efetivamente visualizados em `.qa-artifacts/tarefas-20261029/`. Todas as escritas interceptadas.

Arquivos: `Tarefas.tsx`, rotas/rótulos/breadcrumbs, testes de componente e `tests/task-editor-pages.spec.ts`. Não há migração de banco. Limitação existente: criação usa INSERT sem chave de idempotência de servidor; o bloqueio impede cliques simultâneos, mas não promete resolver uma resposta de rede ambígua após persistência.

Publicação: build `d0b2d3c94614f1ddf8a26d78b5fffa37c0076411`, imagem `easypanel/elolab/app:deploy-20261029-d0b2d3c9`. Versão e healthcheck públicos conferidos; formulário de nova tarefa efetivamente visualizado em produção, sem gravação. Rollback: `deploy-20261029-9ffe8f94` e fonte `code.before-20261029-d0b2d3c9`.

## Modelos clínicos — diagnóstico e direção (29/10/2026)

Prescrições e atestados reutilizáveis ainda eram editados em modais sobre a lista, sem proteção de rascunho. A lista mistura modelos globais somente leitura e modelos próprios da clínica. A edição exige preservar essa distinção, o tipo, os medicamentos convertidos, as variáveis de texto e os campos condicionais de afastamento.

Direção: páginas dedicadas por tipo, leitura por ID e clínica, retorno à categoria e filtros, formulário nativo com guarda de alterações e bloqueio durante gravação. Duplicação e exclusão continuam na lista. Nenhum modelo será aplicado automaticamente a um paciente. Validação da implementação em andamento.

Implementação: `/todos-templates/prescricoes/novo`, `/:templateId/editar` e equivalentes de atestados. Campos e handlers extraídos para `ClinicalTemplateEditor.tsx`, tipos compartilhados em `clinicalTemplateTypes.ts`; lista conserva duplicação e confirmação de exclusão. A atualização usa o `updated_at` lido inicialmente, sustentado pelos triggers existentes nas duas tabelas; conflito preserva o texto e exige reabrir a versão atual. Não há migration nem mudança de API. O modelo global não pode ser editado por URL direta.

Validação: sete cenários Playwright distintos passaram: 1440/768/390px, descarte, retorno de categoria/filtro, conflito, recuperação de salvamento e leitura, campos condicionais, clínica/autor e autorização. Uma seleção de busca no teste foi corrigida para usar a legenda real; o cenário passou na repetição. Dezoito testes unitários passaram; TypeScript e build passaram; lint sem erros, cinco avisos. Capturas desktop e rodapé mobile efetivamente visualizadas em `.qa-artifacts/clinical-templates-20261029/`. Todas as gravações interceptadas. Criação continua INSERT sem idempotência de servidor; emissão de documentos para pacientes não foi alterada.

Publicação: build `e88e47b6d4db6440fe41de691286722df7da3f2b`, imagem `easypanel/elolab/app:deploy-20261029-e88e47b6`. Swarm concluído, versão e healthcheck públicos conferidos; nova página de atestado efetivamente visualizada em produção sem gravação. Rollback: `deploy-20261029-d0b2d3c9` e fonte `code.before-20261029-e88e47b6`.

## Direção visual compartilhada — referência fornecida pelo responsável (29/10/2026)

Pedido confirmado: aplicar a referência Taskify ao visual geral. A referência orienta superfícies, contraste, tipografia e navegação; não substitui a marca nem os fluxos especializados do EloLab.

Diagnóstico visual: menu navy prejudicava a leitura da própria marca; seleção ciano, cabeçalho azul escuro e ações azuis competiam pelo foco. Campos e botões com raios excessivos, sombras e um bloco de boas-vindas ilustrado ampliavam o peso visual. O painel por perfil criava mais um cartão acima do trabalho do dia.

Implementação em validação: tokens da paleta fornecida centralizados; menu claro integrado à estrutura, seleção branca com contorno e ícone azul, hierarquia de grupos discreta; cabeçalho branco e agenda neutra. Botões, inputs, selects e cards compartilham raios e sombras menores. Dashboard preserva indicadores, períodos, consultas e ações; atalhos por perfil passam a seção integrada e a abertura sem dados fica textual. Drawer mobile mantém navegação e altura disponível. Sem alteração de API, métricas, papéis, preferências ou dados.

Comparação inicial em `.qa-artifacts/visual-language-before/`; resultado em `.qa-artifacts/visual-language-after/`. Auditoria e validação de cada módulo continuam necessárias: esta mudança da estrutura comum não conclui todas as pendências operacionais.

Validação: treze cenários Playwright passaram em quatro telas a 1440/768/390px e navegação por busca/teclado; regressão da altura dos cabeçalhos da agenda passou. O seletor do teste mobile foi corrigido para o nome acessível real “Mais seções”. Nova rodada de oito cenários tablet/celular passou após remover o botão de recolher inoperante no drawer e fazer a navegação ocupar sua largura. Capturas de dashboard, agenda, estoque, modelo clínico, tablet e menu mobile efetivamente visualizadas. Testes de Sidebar, links, Navbar, contexto, alertas, PageHeader, dashboard, busca, cores de botões e preferências passaram; uma expectativa visual antiga foi atualizada preservando a verificação de `aria-current`. TypeScript/build/diff-check passaram; lint focal com zero erros e 20 avisos preexistentes.

Contrastes calculados: texto principal sobre fundo 13,24:1; secundário sobre branco 4,80:1 e sobre fundo 4,50:1; branco sobre ação primária 6,73:1; texto navy sobre ciano 5,81:1. Isso verifica essas combinações, não certifica a totalidade das telas como WCAG AA. Estados semânticos e padrões especializados permanecem; há estilos particulares nos módulos ainda pendentes da sequência.

Publicação: build `78396f3e399e1cabbd801fdbde857df4a8034115`, imagem `easypanel/elolab/app:deploy-20261029-78396f3e`. Swarm concluído, versão e healthcheck conferidos; menu, cabeçalho e formulário efetivamente inspecionados em produção. Rollback: `deploy-20261029-e88e47b6` e fonte `code.before-20261029-78396f3e`.

## Modelos de e-mail — edição, ativação e versões (29/10/2026)

Diagnóstico: edição HTML, confirmação com prévia extensa e histórico inteiro em três modais, todos sobrepostos à listagem. Saída da edição descartava texto sem proteção; formulário não bloqueava campos durante gravação. Administração gerencia os modelos; acesso de médicos à lista continua somente leitura.

Implementação: `/todos-templates/email/novo`, `/:templateId/editar`, `/ativar` e `/historico`, com escopo por clínica/ID, retorno à aba E-mail e filtros preservados. Rascunho em memória protegido; formulário nativo e bloqueio de envio. Sanitização DOMPurify, exemplos sintéticos e validação das variáveis mantidos. Inserção de variável não envia o formulário. Atualização compara `updated_at` sustentado pelo trigger existente. Ativação verifica novamente variáveis, estado e versão; alterações não são aplicadas silenciosamente. Histórico conserva snapshots/autoria e ganha recuperação de erro. Duplicação, desativação e confirmação curta de exclusão permanecem na lista. Nenhum envio real de e-mail.

Validação: nove cenários Playwright distintos passaram: três larguras, rascunho, retorno, conflito, sanitização HTML, inserção de variável, erro de salvamento, histórico vazio/erro, registro ausente, acesso negado, prévia inválida e ativação válida. O seletor da busca foi corrigido no teste; repetição de conflito, histórico e prévia passou. Vinte e três testes unitários passaram. TypeScript/build/diff-check passaram; lint sem erros e seis avisos. Edição desktop, prévia mobile, ativação mobile e histórico desktop efetivamente visualizados em `.qa-artifacts/email-templates-20261029/`. Todas as gravações interceptadas. Criação continua sem chave de idempotência de servidor; nenhum contrato ou migração alterado.
