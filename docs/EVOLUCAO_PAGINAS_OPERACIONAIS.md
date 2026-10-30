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

Publicação: build `bf0f8a910dbcaed5728ac2996ecae52c7493da58`, imagem `easypanel/elolab/app:deploy-20261029-bf0f8a91`. Swarm concluído, versão e healthcheck conferidos; página de novo modelo efetivamente visualizada em produção sem gravação. Rollback: `deploy-20261029-78396f3e`, fonte `code.before-20261029-bf0f8a91`.

## Laboratório — pedidos e rastreabilidade (29/10/2026)

Diagnóstico: pedido com múltiplos exames e histórico de eventos restritos a modais; fechamento descartava o formulário. Perfil: administração, médico e enfermagem, preservando o acesso do módulo e a exigência do plano. O cadastro depende de paciente da clínica, com solicitante e convênio opcionais.

Implementação: páginas `/laboratorio/pedidos/novo` e `/laboratorio/pedidos/:pedidoId/historico`. Formulário protegido contra saída acidental, bloqueio de envio simultâneo, estados de carregamento/erro e recuperação. Retorno à aba Pedidos e busca preservada. Histórico consulta ID e clínica, sem depender dos 250 pedidos da lista; mostra paciente, exames, prioridade, estado e eventos. Erro do histórico agora mantém o título contextual visível. Catálogo indisponível permite o preenchimento manual já existente.

Integração: mantida a RPC `criar_pedido_laboratorio`, que valida clínica e vínculos e cria pedido/exames na mesma transação. Invalidação das consultas de pedidos e exames pendentes mantida. Sem alteração de estados, contratos, RLS, migração ou autorização. A lista permanece limitada a 250 e o catálogo a 500; a RPC não oferece chave de idempotência, embora o formulário bloqueie o envio simultâneo. Isso continua como dependência de backend para tratamento de resposta perdida.

Validação: seis cenários Playwright distintos passaram, incluindo fluxo existente de erro/recuperação e criação de múltiplos exames, 1440/768/390px, formulário protegido, histórico com falha/recuperação, escopo por clínica/ID, retorno com busca, inexistente e acesso financeiro negado. O cenário do histórico passou novamente após a correção do aviso contextual. Vinte e um testes unitários passaram; TypeScript, build e diff-check passaram. Lint focal sem erros, 56 avisos. Cadastro desktop, rodapé mobile e histórico efetivamente visualizados em `.qa-artifacts/lab-orders-20261029/`. Gravações dos testes interceptadas, sem pacientes reais modificados.

Publicação: build `4d9e346e58e96c654103eaff99f7334f8987d456`, imagem `easypanel/elolab/app:deploy-20261029-4d9e346e`. Swarm concluído, versão/healthcheck conferidos e cadastro efetivamente visualizado em produção sem gravação. Rollback: `deploy-20261029-bf0f8a91`, fonte `code.before-20261029-4d9e346e`.

## Laboratório — registro de coleta (29/10/2026)

Diagnóstico: formulário extenso em modal estreito com rolagem interna; campos sem associação ao rótulo e saída sem proteção. O setor escolhido não integrava o payload, apesar do campo e da validação por clínica já existirem no backend. Perfis mantidos: administração, médico e enfermagem, com a mesma restrição de plano.

Implementação: `NovaColetaPage.tsx`, rota `/laboratorio/coletas/nova`, acessível nos três pontos de entrada anteriores. Extração do formulário e consultas auxiliares de `Laboratorio.tsx`; a lista deixa de buscar esses dados sem necessidade. Identificação do paciente primeiro, seções integradas, rótulos acessíveis, proteção de rascunho e envio simultâneo, retorno com busca e filtros. Preservados todos os campos, catálogo de tubos (cores funcionais), vínculo opcional de exame, consulta de coleta já existente, horário de São Paulo, responsável obrigatório, bloqueio de data futura e estado inicial coletado. O setor agora integra a gravação e erro na consulta permite recuperação antes do salvamento.

Integração: INSERT em `coletas_laboratorio` e invalidações existentes mantidos. Validação de paciente/exame/médico/convênio/setor pela clínica continua no trigger `validar_tenant_coleta_laboratorio`. Sem migração, novo contrato, alteração de permissão ou liberação clínica. A verificação de duplicidade antecede o INSERT e não garante exclusão mútua entre sessões; idempotência/conflito entre operações simultâneas permanece dependência do backend. Limite de 200 exames em aberto continua explicitado.

Validação: cinco cenários Playwright distintos passaram: três tamanhos, rascunho e ações acessíveis, data futura, coleta existente, falha de INSERT e recuperação, setor/autor/data no payload, retorno com filtro e autorização. Durante implementação, corrigidos o elemento de ícone do cabeçalho, a constante de fuso ainda usada na lista, rótulo de jejum e seletor do teste que omitia o asterisco do paciente. Rodada final do fluxo e desktop passou. Vinte e oito testes unitários de workflow, filtros, integridade de clínica e breadcrumbs passaram. TypeScript/build/diff-check passaram; lint sem erros, 56 avisos. Modal anterior inspecionado em produção sem alterações e capturas novas desktop/mobile efetivamente visualizadas em `.qa-artifacts/lab-collection-20261029/`; removida divisória duplicada identificada na inspeção. Nenhuma amostra real criada.

Publicação: build `5f4e773773bd6ee8f5da621d1eee57fcee4725fe`, imagem `easypanel/elolab/app:deploy-20261029-5f4e7737`. Swarm concluído, versão/healthcheck conferidos e cadastro efetivamente visualizado em produção sem gravação. Rollback: `deploy-20261029-4d9e346e`, fonte `code.before-20261029-5f4e7737`.

## Laboratório — resultados da amostra (29/10/2026)

Diagnóstico: lançamentos em modal sem identificação permanente do paciente/amostra; acesso ao formulário dependia de a amostra estar nos registros carregados na worklist. Rascunho era descartado ao fechar e os resultados alterados dependiam de cor. Perfis e plano preservados.

Implementação: `/laboratorio/coletas/:coletaId/resultados`, em `ResultadosColetaPage.tsx`, com leitura por ID/clínica, identificação da amostra, retorno ao laboratório com busca/filtros e proteção de rascunho. Resultados em linhas com rótulos de crítico/fora da referência; parâmetro, método, unidade, referências e sinalização crítica preservados. Perfil do catálogo continua opcional e aplicável por ação explícita; leitura com erro permite tentar novamente. Estado da amostra é relido antes do INSERT e só permite coletado/em análise, como antes. Amostras liberadas ficam somente leitura. Gravação mantém paciente/clínica derivados do registro verificado e limpa o formulário apenas após sucesso.

Validação: cinco cenários Playwright passaram sem falhas: 1440/768/390px, contexto/rascunho, ações alcançáveis, valores de referência, aplicação do perfil, mudança de estado entre leitura e envio, falha/recuperação de INSERT, valores decimais, escopo, erro/vazio, registro ausente e perfil financeiro negado. Vinte e três testes unitários de workflow, integridade e breadcrumbs passaram. TypeScript/build/diff-check passaram; lint sem erros, 44 avisos. Capturas de resultados desktop e rodapé mobile efetivamente visualizadas em `.qa-artifacts/lab-results-20261029/` com dados sintéticos. Nenhum resultado real alterado.

Limites: permanece o INSERT existente sem chave de idempotência; releitura de estado e gravação são chamadas distintas. Não foi criada garantia transacional nova nem alterado o contrato do backend. Validação e liberação de laudos continuam nas ações existentes, sem automatização clínica.

Publicação: build `ba0c5ee1f659353347d3b50426c9e2f439e3d799`, imagem `easypanel/elolab/app:deploy-20261029-ba0c5ee1`. Swarm concluído, versão/healthcheck conferidos. Entrada pela worklist e página de resultados efetivamente visualizadas com amostra de demonstração, sem gravação. Rollback: `deploy-20261029-5f4e7737`, fonte `code.before-20261029-ba0c5ee1`.

## Mapa de coleta — detalhe e movimentações (29/10/2026)

Diagnóstico: identificação, histórico e formulário de movimentação juntos em modal estreito; histórico com segunda rolagem, rascunho sem proteção e detalhe dependente da lista aberta. Jornada de recoleta deve preservar motivo estruturado e abrir a amostra vinculada, sem atualizar status diretamente na tela.

Implementação: `/mapa-coleta/:coletaId` em `AmostraPage.tsx`, com consulta por ID/clínica e mesmos perfis/plano do mapa (admin/enfermagem). Identificação em seção integrada, histórico com limite de 100 explicitado, formulário acessível, recuperação de falhas, proteção de rascunho/envio e filtros preservados no retorno. Recoleta abre o novo identificador retornado pela RPC. Transporte, armazenamento, recebimento, observação, rejeição e recoleta continuam na RPC `laboratorio_registrar_evento_amostra`, que trava a amostra, valida clínica/estado, registra motivos, autoria e vínculo. Nenhuma migração ou alteração de contrato.

Validação: cinco cenários Playwright de página passaram, cobrindo 1440/768/390px, identidade, proteção de formulário, histórico vazio/erro/recuperação, falha de gravação, motivo obrigatório, nova amostra vinculada, registro ausente e perfil médico negado. Regressão existente do mapa passou nas três larguras e foi repetida após corrigir nesting inválido de Badge dentro de parágrafo (também corrigido no título da linha de resultado). Vinte e quatro testes unitários distintos passaram; expectativa de localização do código na auditoria de migração atualizada para a página extraída, mantendo exigência da RPC e do motivo estruturado. TypeScript/build/diff-check passaram; lint sem erros, 22 avisos. Detalhe desktop e rodapé mobile efetivamente visualizados em `.qa-artifacts/lab-sample-20261029/`, com dados sintéticos. Ações clínicas, impressão, seleção múltipla e cancelamento curto da lista preservados. Sem gravação em produção.

Limites: histórico continua limitado aos 100 eventos recentes; RPC existente não recebe chave de idempotência para recoleta. Bloqueio local evita submissão simultânea nesta página, mas não substitui deduplicação entre sessões no backend.

Publicação: build `d26233b2f2b0e2931d12f612ea626fbf3c4b0034`, imagem `easypanel/elolab/app:deploy-20261029-d26233b2`. Swarm concluído, versão/healthcheck conferidos; identificação e histórico efetivamente visualizados em produção com amostra de demonstração, sem registrar eventos. Rollback: `deploy-20261029-ba0c5ee1`, fonte `code.before-20261029-d26233b2`.

## Guias externas — cadastro (29/10/2026)

Diagnóstico: cadastro em modal com quatro abas escondendo campos obrigatórios; saída sem proteção e remoção de anexo temporário sem verificar eventual vínculo persistido. Perfis: administração, recepção e enfermagem, com a restrição de plano existente.

Implementação: `/guias-externas/nova`, componente `NovaGuiaPage.tsx`. Paciente, médico, convênio/documento e exames em seções integradas; formulário nativo, rascunho protegido, envio bloqueado durante upload e gravação. Retorno com busca/status. Preservados validação de CPF/nascimento, exames por linha, campos, formatos/tamanho de anexo e INSERT com clínica/autor. Ao descartar ou substituir anexo, consulta a clínica e caminho no banco antes de remover; arquivo já vinculado é mantido. Sucesso de gravação desarma a limpeza temporária. Nenhuma migração ou contrato alterado.

Validação: sete cenários Playwright passaram: 1440/768/390px, seções/rascunho/ações, exames obrigatórios, CPF inválido, erro de INSERT com recuperação, escopo e retorno à busca, anexo preservado enquanto continua preenchendo, descarte de temporário e preservação de arquivo vinculado, acesso financeiro negado. Cinquenta e dois testes unitários de formatos, armazenamento e breadcrumbs passaram. TypeScript/build/diff-check passaram; lint sem erros, 44 avisos. Cadastro desktop e rodapé mobile efetivamente visualizados em `.qa-artifacts/external-guide-20261029/`. Uploads, exclusões e gravações dos testes interceptados.

Limites: a limpeza assíncrona é executada ao sair pelo aplicativo; fechamento abrupto do navegador pode deixar arquivo órfão. Não foi implementado coletor de temporários no servidor. Verificação de vínculo e exclusão continuam operações separadas; INSERT não possui chave de idempotência. Detalhe operacional e gestão do portal de guias serão tratados nas próximas entregas.


Publicação do cadastro: build `29cb4af4f3a4f758fe1fe2795422638152df5c4f`, imagem `easypanel/elolab/app:deploy-20261029-29cb4af4`. Swarm concluído, versão/healthcheck conferidos; página efetivamente visualizada em produção sem gravação. Rollback: `deploy-20261029-d26233b2`, fonte `code.before-20261029-29cb4af4`.

## Guias externas — detalhe operacional e portal (29/10/2026)

Diagnóstico: identificação, exames, acompanhamento de parceiro, PDF, histórico, agendamento e envio para fila comprimidos em um modal com rolagem interna. Gestão de links em outro modal com rolagem própria. Fechar descartava campos; o detalhe dependia dos registros carregados na listagem. Perfis existentes: administração, recepção e enfermagem. Exclusão de links continua exclusiva da administração na interface e sujeita à autorização do servidor.

Direção e implementação: `GuiaPage.tsx` em `/guias-externas/:guiaId` e `PortalGuiasPage.tsx` em `/guias-externas/portal`. Identificação e status no topo, informações em seções integradas, ações contextuais e histórico sem rolagem aninhada. Detalhe consultado por ID/clínica. Busca e status preservados no retorno; rascunho protegido, campos bloqueados durante operações. Agendamento/envio à fila atualizam o estado e mantêm a página e o acompanhamento não salvo. Gestão do portal usa linhas, estados escritos Ativo/Inativo e campo de link selecionável. Removidos os dois componentes de modal de `GuiasExternas.tsx`; atualizados rotas e breadcrumbs.

Integrações: mantidos busca/criação do paciente, RPCs `agendar_guia_externa` e `encaminhar_guia_externa_para_fila`, atualização de status com comparação do estado anterior, acompanhamento e eventos do laboratório, PDFs privados com URL assinada, criação/ativação/exclusão dos links e mesmas restrições de plano/perfil. Nenhuma migração ou mudança de contrato. Descarte de PDF temporário verifica vínculo no servidor antes de remover, inclusive após falha de resposta. Nenhum token, guia, paciente ou agendamento real criado nos testes.

Limites: consulta de histórico permanece nas 30 últimas atualizações, explicitadas na tela. Gravação do acompanhamento não possui comparação de versão e continua sujeita a última gravação prevalecer entre sessões. Criação/vinculação de paciente precede a RPC e não é uma transação única. Sem novas garantias de idempotência no servidor. Fechamento abrupto pode deixar arquivo temporário; consulta de vínculo e exclusão não são atômicas. Limpeza de versões substituídas preserva o comportamento anterior. Não se declara conformidade WCAG integral por estes testes.

Validação: 12 cenários Playwright passaram: detalhe e portal em 1440/768/390px, retorno com busca, rascunhos, custo/data inválidos, falha e recuperação de gravação, agendamento/envio à fila pelas RPCs, continuidade sem perder acompanhamento, leitura com falha/recuperação, registro ausente, criação/desativação/exclusão de links, acesso financeiro negado e descarte de PDF temporário com preservação quando vinculado no servidor. Vinte testes unitários de armazenamento, integridade e breadcrumbs passaram. TypeScript/build/diff-check passaram; lint focal sem erros, 40 avisos. Corrigidos dois fechamentos JSX durante a extração. Detalhe desktop, rodapé mobile e portal mobile efetivamente visualizados em `.qa-artifacts/guide-workspaces-20261029/`. Testes com rede interceptada; produção somente leitura. Validação manual completa com leitor de tela permanece pendente.

## Aviso global da atualização — 10/11 (29/10/2026)

Pedido: faixa de atenção no topo anunciando a atualização e entrada da nova versão em 10/11, com referência a Feegow e Doctoralia. Implementado `UpgradeNotice.tsx` acima da navegação no layout autenticado, sem modal, sobreposição ou animação. Usa tokens semânticos de aviso, texto escuro e data acessível `2026-11-10`. Comparação apresentada como objetivo da evolução, não como resultado já comprovado. A faixa é comum aos módulos do aplicativo; não foi adicionada às páginas públicas de pacientes/autenticação. Revisar ou remover o anúncio quando a nova versão for lançada.

Validação: três cenários Playwright passaram, verificando dashboard e nova guia em 1440/768/390px (seis combinações). Aviso no topo, texto/data, ausência de transbordamento horizontal e botão de gravação alcançável no celular. Capturas desktop/mobile efetivamente visualizadas em `.qa-artifacts/upgrade-notice-20261029/`. Build passou. Publicação inclui o detalhe e portal de guias já validados na entrega anterior.

Estado do redesign informado ao responsável: a linguagem compartilhada já está aplicada; a composição específica de todos os módulos ainda não. Permanecem laudos e etapas 9 a 12 do plano. O anúncio de lançamento não altera o estado real de aceite dessas telas.

Publicação conjunta do detalhe/portal de guias e aviso: build `1c598d9351ab73227ae9c45a6601e59cda9bb5b8`, imagem `easypanel/elolab/app:deploy-20261029-1c598d93`. Fonte montada a partir do arquivo completo do commit `7b10c93f` e das quatro adições/modificações do commit seguinte, sem exclusões. TypeScript final passou. Swarm concluído, versão e healthcheck HTTP 200 conferidos; faixa, portal vazio e detalhe/histórico da guia de demonstração efetivamente visualizados em produção, sem gravar dados nem gerar links. Rollback: imagem `deploy-20261029-29cb4af4`, fonte `code.before-20261029-1c598d93`. Laudos foi investigado para a próxima etapa, sem alteração do módulo nesta publicação.

## Laboratório — conferência e liberação de laudos

Diagnóstico: conferência, validação, confirmação de resultado crítico, liberação e retificação estavam em um modal que escondia a worklist. O formulário era dependente do item já carregado; o PDF era gerado, mas a ação de impressão não o apresentava. A lista contém teto operacional explícito de 500 registros; a conferência por ID não depende desse limite.

Implementação: página `/laudos-lab/:coletaId` em `LaudoPage.tsx`. A worklist agora encaminha para a conferência com busca e status preservados no retorno. Acesso direto e notificações resolvem a coleta por ID e clínica. Detalhe de paciente/coleta, resultados, estado, histórico e ações ficam no mesmo contexto, com recuperação de leitura e histórico, estados vazios, bloqueio de ações em andamento e proteção de alterações locais não salvas. A ação de imprimir abre pré-visualização própria; o PDF também pode ser baixado. Observações para impressão ficam locais na sessão e não alteram o registro clínico.

Integrações preservadas: autorização de administração/médico/enfermagem e plano EloLab Pro; RPCs existentes de validação, liberação, ciência de resultado crítico e retificação; consulta de versões, invalidação da worklist e notificação de laudo liberado. Nenhuma transição clínica, regra de permissão, contrato, RLS ou migração alterada. A etiqueta urgente da worklist foi retirada de um parágrafo inválido para eliminar aviso de nesting no navegador.

Validação: 11 cenários Playwright passaram (10 fluxos já existentes e regressão de nesting adicionada), em telas 1440/768/390px, incluindo rascunho protegido, retorno com filtro, falhas e recuperação, fluxo de resultado crítico e liberação por RPC, histórico/retificação, registro ausente, PDF, permissão negada e ausência de avisos de nesting. 33 testes unitários do conjunto de laudos passaram; TypeScript e build de produção passaram. Capturas da página desktop e das ações no mobile foram efetivamente inspecionadas em `.qa-artifacts/lab-report-20261029/`. Os testes verificam a assinatura `%PDF` e a abertura do iframe local de pré-visualização; o visualizador nativo do PDF não foi inspecionado visualmente no Chromium headless. Nenhum resultado real foi alterado.

Limites: worklist continua limitada a 500 itens e histórico por consulta conserva o limite existente. RPCs e envio de notificação mantêm a semântica anterior; a interface não cria nova garantia de idempotência/entrega transacional. O processo conserva validação humana e confirmação de ciência clínica; testes sintéticos não constituem auditoria integral WCAG ou validação clínica.

Publicação: build `ddc17f58416203c6b8ab80fdd029850ca7cb3978`, imagem `easypanel/elolab/app:deploy-20261029-ddc17f58`. Swarm concluído com a única réplica atualizada em `stop-first` porque a porta 8080 em modo host impede coexistência das réplicas no único nó. Healthcheck do container `healthy`, `/healthz` retornou `ok` e `/version.json` conferiu o build. Fonte ativa atualizada com `.env` copiado sem expor conteúdo; fonte anterior preservada em `code.before-20261029-ddc17f58`. Nenhuma migration ou gravação clínica real. Rollback: imagem `deploy-20261029-1c598d93` e fonte `code.before-20261029-ddc17f58`.

## Triagem — formulário de classificação e sinais vitais

Diagnóstico: o registro de triagem era um formulário clínico extenso em modal dentro da worklist. Recepção, fila e pendências abriam a mesma sobreposição, escondendo o contexto e tornando arriscado preencher no celular.

Implementação: página `/triagem/nova`, com cabeçalho, identificação do paciente/agendamento, sinais vitais, antropometria e IMC, classificação Manchester, queixa/escala de dor/observações e ações persistentes no fim do formulário. A rota antiga `/fila?tab=triagem&paciente=…&agendamento=…` segue funcionando e encaminha ao formulário novo. Atalhos da recepção e da fila preservam o paciente/agendamento e retornam ao módulo que iniciou o fluxo. Os identificadores do paciente/agendamento são removidos da URL após inicialização. Rascunho e envio em andamento são protegidos contra saída acidental. Em largura inferior a 400 px, o resumo da worklist usa uma descrição compacta para manter a primeira ação acima da navegação inferior.

Integrações e segurança preservadas: rota autorizada aos mesmos perfis admin/médico/enfermagem; consulta por clínica e vínculo paciente-agendamento; exigência de check-in para uma triagem associada; validações existentes de PA, sinais, peso, altura, glicemia e dor; INSERT na tabela `triagens`; prevenção de duplicidade existente; propagação de Manchester para a fila e aviso ao médico nos casos urgentes. Falha da etapa operacional posterior continua sendo avisada sem sugerir repetir uma triagem já gravada. Nenhuma RPC, estado clínico, permissão, regra de negócio ou migration foi alterada.

Validação: 11 cenários Playwright passaram cobrindo rota nova e legado, atalhos de recepção/fila, contexto do paciente e agendamento, gravação e prioridade, recuperação de sincronização da fila, bloqueio de perfil, risco Manchester, proteção de rascunho e larguras 1280/390/320 px. Dezoito testes unitários de fila, liberação e pendências passaram. TypeScript, build, diff-check e lint focal passaram (zero erros; 99 avisos de `any`/dependências já presentes nesses arquivos). Capturas desktop e mobile do formulário, prioridade e worklist 320 px foram efetivamente inspecionadas em `test-results/ux-visual-synthetic-*`. Testes usaram clínica sintética e interceptaram gravações; nenhum dado clínico real foi modificado.

Limite desta entrega: a triagem pode ser acessada e concluída sem agendamento, conforme o fluxo avulso já existente. A decisão clínica permanece com profissional autorizado; os testes sintéticos não constituem auditoria clínica nem declaração completa de WCAG.

Publicação: build `93e867b95e1b0a16c81ec7c64684d7cc0f5156f5`, imagem `easypanel/elolab/app:deploy-20261029-93e867b9`. Swarm concluído em `stop-first`; `/healthz` respondeu `ok` e `/version.json` confirmou o build. Fonte ativa atualizada preservando `.env` sem exibir conteúdo; fonte anterior preservada em `code.before-20261029-93e867b9`. Rollback: imagem `deploy-20261029-ddc17f58`.

## Fila — registro de chegada e check-in

Diagnóstico: o check-in manual era um formulário dentro de modal na worklist. Ele exige selecionar atendimento, conferir elegibilidade de paciente, data e unidade e, conforme o perfil, observar a regra de cobrança vigente.

Implementação: `/fila/adicionar`, acessada pelo cabeçalho e pelo estado vazio da fila. A tela apresenta os agendamentos elegíveis do dia, mostra as três validações antes do envio e permite atribuir prioridade. Saída com alterações não salvas fica protegida; após sucesso, retorna para `/fila`.

Integração preservada: check-in atômico por `realizar_checkin`, cobrança automática existente e deferimento para o perfil médico continuam iguais. Perfis, permissões, estados, RPC, contratos e banco não foram alterados. Erros de leitura pausam o envio e permitem tentar novamente.

Validação: dois cenários Playwright passaram em 1280 e 390 px, incluindo validação do check-in, proteção contra perda, retorno e gravação sintética com prioridade urgente. Vinte e dois testes unitários de fila/check-in passaram; TypeScript e build passaram. Lint focal sem erros, 28 avisos legados de `any` e dependências. Capturas desktop e mobile foram visualizadas em `test-results/ux-visual-synthetic-queue--fcf32-check-in-validation-visible-chromium/` e `test-results/ux-visual-synthetic-doctor-20cb1-om-the-dedicated-queue-page-chromium/`. Todas as gravações foram interceptadas; nenhum dado real foi alterado.

Publicação: build `3b67483dc0fe33f0a60c8c8f1b9e277a59f20600`, imagem `easypanel/elolab/app:deploy-20261029-3b67483d`. Swarm atualizado em `stop-first`; `/healthz` respondeu `ok` e `/version.json` confirmou o build. Fonte anterior em `code.before-20261029-3b67483d`; rollback da imagem `deploy-20261029-93e867b9`.

## Recepção — encaixe sem agendamento

Diagnóstico: encaixe de paciente presencial dependia de um modal. O fluxo cria um agendamento para hoje e precisa confirmar paciente ativo, profissional, tipo, duração, conflitos e bloqueios de agenda antes de executar o check-in e a cobrança existente.

Implementação: `/recepcao/encaixe`, aberto pelo atalho da recepção. A página organiza pessoa, médico e tipo, informa o horário atual, protege o rascunho e bloqueia envio simultâneo. Depois de criar o agendamento, segue o check-in já existente e volta à recepção; uma falha no check-in deixa o agendamento visível na lista para retomada.

Integração e autorização preservadas: somente admin/recepção acessam este fluxo, os mesmos perfis do atalho. Mantidos consulta de profissionais/tipos, verificação de conflitos e bloqueios, INSERT em `agendamentos`, RPC de check-in, cobrança automática e invalidações. Sem contrato, permissão, estado, banco ou migration novos.

Validação: dois cenários Playwright passaram cobrindo larguras 390/1280 px, permissão de saída protegida e fluxo sintético completo de agendamento/check-in/cobrança. Quatorze testes unitários de recepção e check-in passaram; TypeScript e build passaram. Lint focal sem erros, 59 avisos existentes de `any`. Capturas mobile e desktop prontas para envio foram visualizadas em `test-results/ux-visual-synthetic-recept-b8549--a-dedicated-protected-form-chromium/` e `test-results/ux-visual-synthetic-recept-6c3c9-nd-check-in-without-a-modal-chromium/`. Testes interceptaram gravações; nenhum paciente real foi alterado.

Publicação: build `1e43732c02f325a5f8f24b0179334fcd96aee2c6`, imagem `easypanel/elolab/app:deploy-20261029-1e43732c`. Swarm atualizado em `stop-first`; `/healthz` respondeu `ok` e `/version.json` confirmou o build. Fonte anterior em `code.before-20261029-1e43732c`; rollback da imagem `deploy-20261029-3b67483d`.

## Recepção — recebimento em página própria (29/10/2026)

Diagnóstico: o recebimento era um modal longo sobre a worklist. A recepcionista precisava conferir paciente, cobrança, valor já recebido, saldo e forma de pagamento sem sair do contexto do atendimento.

Implementação: a rota `/recepcao/pagamentos/:lancamentoId` abre uma página acessível pela ação de recebimento e por URL direta. A cobrança é consultada pelo ID e pela clínica ativa; o paciente é confirmado antes de liberar a confirmação. O resumo mostra valor original, pagamentos anteriores e saldo. A tela mantém pagamento dividido, desconto, acréscimo, observações, comprovante e feedback do recibo. O rascunho fica protegido ao sair.

Integração preservada: verificação do caixa aberto, reparo de cobrança antiga de exame sem valor, RPC transacional `registrar_pagamento`, chave de idempotência, envio do recibo, invalidação dos painéis e comprovante PDF. A rota respeita admin, recepção e financeiro, como o acesso operacional existente. Sem alteração em contratos, permissões do backend, migrations, Edge Functions ou dados reais.

Validação: o teste Playwright primeiro falhou porque a rota ainda não existia; depois passou com leitura e recebimento sintéticos, conferência do payload e da idempotência, sem diálogo, em 390 e 1440 px. O botão principal foi conferido acima da navegação fixa no celular. 29 testes unitários de recepção/check-in passaram. Build passou; lint focal sem erros e com 59 avisos `any` nos arquivos verificados. Capturas mobile e desktop foram efetivamente inspecionadas em `test-results/ux-visual-synthetic-recept-90e2e--through-the-idempotent-RPC-chromium/`. Nenhum recebimento real foi executado.

Publicação: commit `af68e69f52f7a07f6bc6e19544038bed729ff3ee`, imagem `easypanel/elolab/app:deploy-20261029-af68e69`. Swarm confirmou `completed`, 1/1 réplica; `/healthz` respondeu `ok` e `/version.json` confirmou o build. A fonte anterior foi preservada em `code.before-20261029-af68e69`, incluindo o `.env` sem ler ou exibir seu conteúdo. Rollback da imagem: `deploy-20261029-1e43732c`.

## Finalização do atendimento — página própria (29/10/2026)

Diagnóstico: a escolha de retorno abria um modal em quatro pontos — Fila, Recepção, Agenda e atendimentos antigos. A camada escura cobria o workspace e ocultava informações usadas na decisão.

Implementação: `/atendimentos/:agendamentoId/finalizar` carrega consulta e entrada de fila por ID e clínica, mostra paciente, profissional, data, horário e estado, permite escolher retorno em 7/15/30/60/90/180 dias ou sem retorno, e confirma em página dedicada. O botão de ação permanece acima da navegação mobile; a data prevista fica visível na opção selecionada. Os quatro pontos de entrada preservam o retorno ao módulo. Atendimentos antigos sem fila seguem aceitos com `filaId` nulo e sem notificação com data enganosa.

Integração preservada: helper e RPC `finalizar_atendimento_atomico`, geração de cobrança, criação do retorno, notificação em fluxos atuais, validação de clínica e permissões existentes. Nenhum contrato, dado real, permissão, migration ou dependência alterado. Removido o modal compartilhado após migrar seus quatro usos.

Validação: Vitest 25/25 em três arquivos, cobrindo fila, atendimentos antigos e breadcrumbs; Playwright 2/2, cobrindo fila com retorno, atendimento antigo sem fila/sem notificação, payloads, navegação e responsividade em 390/768/1440 px; build e verificador de acessibilidade passaram. ESLint focal com zero erros e 85 avisos legados (`any`/dependências de hook). Capturas mobile, tablet e desktop renderizadas foram efetivamente inspecionadas em `test-results/ux-visual-synthetic-appoin-14df6-ps-return-scheduling-atomic-chromium/`.

Limites: os cenários usam dados e respostas sintéticas, sem gravação real ou validação de RLS. Revisão manual com leitor de tela e concorrência contra a RPC em ambiente isolado permanecem pendentes.


Publicação: commit `49e5056f1c9b3e963c1310fbf5822adf359e6db1`, imagem `easypanel/elolab/app:deploy-20261029-49e5056f`. Swarm confirmou 1/1 réplica; `/healthz` respondeu `ok` e `/version.json` confirmou o build completo. Fonte anterior preservada em `code.before-20261029-49e5056f`; `.env` comparado sem leitura ou exposição. Rollback da imagem: `deploy-20261029-af68e69`. Nenhum dado de produção ou migration foi alterado.

## Prontuário — criação de adendos em página própria (29/10/2026)

Diagnóstico: o médico responsável retificava ou complementava uma evolução assinada em um modal dentro da ficha. Isso comprimia uma ação clínica imutável e o formulário não tinha uma rota própria para recuperação, histórico do navegador ou retorno confiável à evolução.

Implementação: a rota `/prontuarios/:prontuarioId/adendos/novo` apresenta paciente, data da evolução e profissional responsável, formulário de tipo/motivo/conteúdo, aviso de imutabilidade e histórico anterior. A navegação de retorno restaura paciente, evolução selecionada e aba Adendos; a página de prontuário só reabre a evolução após a autorização auditável de leitura do paciente. O acesso à página é restrito ao perfil médico, e a leitura também exige clínica ativa, médico responsável e evolução assinada. A gravação continua na RPC atômica `registrar_prontuario_adendo`; falhas mantêm o texto preenchido e permitem nova tentativa. O modal foi removido do componente de histórico. Nenhuma regra de autorização do servidor, contrato, dado, migration ou integração clínica foi alterada.

Validação: 16 testes Vitest passaram em histórico e breadcrumbs. Playwright passou (1/1) no fluxo da ficha à página e de volta, incluindo validação de campos, falha de gravação com retenção do rascunho, segunda tentativa, escopo da consulta por clínica/médico/evolução assinada e navegação à mesma aba. Inspecionei as capturas renderizadas desktop (1280 px) e mobile (390 px); no celular, os campos não se sobrepõem aos botões e as duas ações ficam acessíveis acima da navegação fixa. TypeScript, `npm run check:a11y`, build, lint focal sem avisos e `git diff --check` passaram.

Limites: registro, autorização e resposta da RPC no navegador foram sintéticos; não houve escrita clínica, validação de RLS real ou leitor de tela manual. A elegibilidade para adendo continua sendo confirmada pelo servidor ao gravar. Uma correção independente no encaminhamento de ação secundária da Recepção removeu um argumento não aceito para que a verificação TypeScript global voltasse a passar.

Publicação: commit `4ec83bd1c549eb6fc1ee8e746cc58425089473d`, imagem `easypanel/elolab/app:deploy-20261029-4ec83bd-v2` (digest `sha256:2ba86dc4c673e6f2b8e3a5014423bc2e867083b830b0d8b59bddb98f10940def`). Swarm concluiu a atualização com 1/1 réplica; `/healthz` respondeu `ok` e `/version.json` confirmou o hash integral. `.env` foi comparado e preservado sem leitura/exposição; fonte anterior em `code.before-20261029-4ec83bd`. Rollback imediato da imagem: `deploy-20261029-4ec83bd`. Nenhum dado de produção ou migration foi alterado.

## Prontuário — inclusão de anexos em página própria (29/10/2026)

Diagnóstico: o envio de arquivo ficava em um modal na aba Anexos. A tela cobria a ficha, não apresentava o contexto do documento e misturava a escolha do arquivo, classificação e descrição com a consulta dos anexos existentes.

Implementação: `/prontuarios/:prontuarioId/anexos/novo` apresenta paciente, data da evolução e profissional responsável antes do formulário. Categoria, descrição, limite de 10 MB e tipos aceitos continuam iguais. O atalho fica desativado em modo somente leitura; a página bloqueia evoluções assinadas e verifica o vínculo do médico. O acesso de leitura e a edição são auditados; a RPC de edição confirma a permissão novamente antes do envio. O arquivo continua no bucket privado `medical-attachments`, a tabela e o path persistido mantêm os contratos atuais, e falha ao gravar metadados remove o arquivo temporário ou informa quando a limpeza também falhou. Erro mantém o arquivo e os campos preenchidos. Sucesso retorna à mesma paciente, evolução e aba Anexos; o deep link de retorno pode reabrir uma evolução não assinada apenas nessa seção. Nenhuma tabela, RLS, permissão, RPC, contrato, migration ou dado clínico foi alterado.

Validação: 28 testes Vitest passaram; Playwright passou (1/1) do modo de edição na ficha até o envio sintético e retorno com o anexo listado, em desktop e mobile (390 px). Testados validação de tipo, falha de metadados com limpeza e retenção do formulário, bloqueio de evolução assinada, retorno à aba correta e ausência de modal. TypeScript, build e `npm run check:a11y` passaram. ESLint com zero erros e 61 avisos legados de `any` (59 em `Prontuarios.tsx`, dois em `AnexosProntuario.tsx`). Inspecionei as capturas renderizadas de desktop (1280 px) e mobile (390 px); no celular, os botões ficam acima da navegação fixa e sem rolagem horizontal.

Limites: a autorização, Storage e gravação foram exercitados com respostas sintéticas; não houve validação real de RLS nem upload de arquivo clínico. O backend atual não oferece uma única gravação transacional para o objeto e seus metadados, por isso a tela preserva a compensação existente. Leitor de tela manual e corrida concorrente com assinatura não foram validados.

Publicação: commit `5aae8cbc719b0baae129f7782f4b15020feb12c2`, imagem `easypanel/elolab/app:deploy-20261030-5aae8cbc-v2`. Swarm concluiu a atualização com 1/1 réplica; `/healthz` respondeu `ok` e `/version.json` confirmou o hash integral. `.env` foi copiado e comparado sem leitura/exposição; fonte anterior em `code.before-20261030-5aae8cbc`. Rollback imediato: `deploy-20261029-4ec83bd-v2`. Nenhum dado de produção ou migration foi alterado.

## Pacientes — consentimentos em páginas próprias (29/10/2026)

Diagnóstico: registrar um novo consentimento e revogar um registro abriam diálogos sobre a ficha do paciente. O formulário de registro continha o termo e três opções; a revogação pedia um motivo. O histórico já era consultado com escopo de clínica e as gravações dependiam das políticas RLS existentes.

Implementação: `/pacientes/:patientId/consentimentos/novo` e `/pacientes/:patientId/consentimentos/:consentType/revogar` são páginas próprias, com o paciente identificado no contexto. A ficha navega para cada ação a partir da aba LGPD e, ao voltar, restaura essa aba e o endereço/estado de busca de origem. Links diretos usam a ficha do paciente como retorno seguro. Os dois diálogos foram removidos; o histórico e os estados aceito, revogado e pendente continuam na ficha. Versão do termo, tipos, dados gravados, atualização de registros, motivo da revogação, RLS e autorização do backend permaneceram iguais. Falhas preservam as seleções ainda não gravadas; gravações parciais atualizam o histórico sem reaplicar itens já confirmados. Nenhuma migration ou contrato foi alterado.

Validação: 23 testes Vitest passaram, cobrindo navegação, ausência dos diálogos, estados de carregamento/erro, gravação, revogação, falha parcial e retorno com busca preservada. Playwright passou (8/8) na suíte de Pacientes, incluindo registro e revogação com backend sintético, retorno à aba LGPD, ausência de modal, larguras 390/1440 px e botões acima da navegação móvel. As capturas desktop, mobile e rodapé mobile foram inspecionadas. TypeScript, build e `npm run check:a11y` passaram. ESLint reportou zero erros e 54 avisos `no-explicit-any` já existentes em `Pacientes.tsx`. A suíte Vitest integral foi iniciada, mas interrompida antes de terminar; não é reportada como aprovada.

Limites: as gravações e respostas do banco foram simuladas; não houve escrita de consentimento real nem revalidação das políticas RLS em produção. A tela preserva o mecanismo atual, que registra os campos existentes por ação do operador; esta entrega não adiciona assinatura do titular nem autoria nova no banco. Leitor de tela manual não foi validado.

Publicação: commit `a2c1eb0dc770796c4cc061dadc100a1e667c2f2f`, imagem `easypanel/elolab/app:deploy-20261030-a2c1eb0-v2`. Swarm concluiu a atualização com 1/1 tarefa; `/healthz` respondeu `ok` e `/version.json` confirmou o hash integral. `.env` foi comparado sem leitura/exposição; fonte anterior em `code.before-20261030-a2c1eb0`. Rollback imediato: `deploy-20261030-5aae8cbc-v2`. Nenhum dado de produção ou migration foi alterado.

## Prontuário — agendamento de retornos a partir da evolução

Diagnóstico: o componente de histórico do prontuário mantinha dois formulários longos e duplicados para agendar retorno, ambos em modal. A camada cobria o contexto clínico e dificultava salvar a evolução antes de sair para uma tarefa relacionada.

Implementação: `/prontuarios/retornos/novo?paciente=...&medico=...` atende retorno sem evolução persistida; `/prontuarios/:prontuarioId/retornos/novo?medico=...` vincula o retorno à evolução existente. O fluxo a partir do prontuário salva primeiro um rascunho quando necessário, preserva o paciente, identifica o profissional, valida os campos e volta ao contexto da ficha. A página verifica a clínica ativa, o vínculo do profissional e a autorização/auditoria de leitura do histórico; perfis médicos permanecem limitados ao próprio vínculo. O cadastro continua usando a tabela e os campos existentes de `retornos`. A lista, mudança de estado, conclusão e cancelamento mantêm os comportamentos existentes. Sem migration, nova permissão, alteração de contrato ou gravação clínica real.

Validação: 12 cenários Playwright passaram combinando `prontuario-return-page` e `return-booking-page`, incluindo retorno vinculado, sem evolução, prontuário indisponível, salvamento do rascunho antes da navegação, gravação sintética e retorno à ficha. TypeScript, `npm run check:a11y`, build exato, lint focal e `git diff --check` passaram. Inspecionei capturas desktop e mobile; no mobile, os controles ficam acima da navegação fixa. Os testes interceptam banco e gravações, sem alteração de dados reais.

Limites: validações de papel, escopo da clínica, auditoria e gravação foram sintéticas; RLS real, concorrência de agenda e leitor de tela manual não foram verificados. A aba de produção desta sessão estava na tela de autenticação; a publicação foi verificada por `/version.json`, `/healthz` e estado do Swarm, sem navegação autenticada à ficha real.

Publicação: commit `ec901d7acd04a2095effa5a949a6f51248c00646`, imagem `easypanel/elolab/app:deploy-20261030-ec901d7a`. Swarm concluiu com 1/1 tarefa; `/version.json` confirmou o hash integral e `/healthz` respondeu `ok`. Fonte anterior preservada em `/etc/easypanel/projects/elolab/app/code.before-20261030-ec901d7a`; `.env` copiado e comparado sem expor conteúdo. Rollback da imagem: `deploy-20261030-a2c1eb0-v2`. Nenhuma migration ou alteração de dados de produção.

## Prontuário — criação e edição de evoluções em página própria (30/10/2026)

Diagnóstico: a evolução clínica era preenchida em um diálogo grande sobre o histórico do paciente, reduzindo o espaço útil, dificultando o retorno direto por URL e misturando a tarefa de redigir com a leitura da ficha.

Implementação: `/prontuarios/atendimento?paciente=...&nova=1` inicia uma evolução e `/prontuarios/atendimento?paciente=...&prontuario=...` abre uma evolução existente. Cabeçalho identifica o paciente; conteúdo mantém seções, prescrições, exames, autosave e assinatura; rodapé fixa o salvamento e as ações disponíveis. A rota continua restrita aos mesmos perfis. A abertura direta confirma paciente, clínica, permissão e auditoria de leitura antes de carregar o registro. A navegação com alterações não salvas pede confirmação e preserva o formulário quando o usuário cancela; a saída por salvar, descartar ou agendar retorno conserva o contexto. A gravação otimista continua condicionada à versão `updated_at`. Nenhum contrato, permissão, RPC, dado, migration ou fluxo de assinatura foi alterado.

Validação: 14 cenários Playwright passaram nos fluxos de evolução e retorno, incluindo criação, autoria/paciente, recarregamento da URL, salvamento sintético, retorno à ficha, encaminhamento ao agendamento e proteção contra descarte. TypeScript, build, `npm run check:a11y` e `git diff --check` passaram. ESLint teve zero erros e 59 avisos `no-explicit-any` já existentes em `Prontuarios.tsx`. Capturas mobile (390 px) e desktop (1440 px) foram inspecionadas; a tela não abre diálogo para editar e não tem transbordamento horizontal no celular. As gravações e permissões foram interceptadas com dados sintéticos; a sessão autenticada de produção não foi usada para criar prontuário real.

Limites: leitores de tela manuais, RLS real e concorrência com outra sessão não foram validados. A assinatura digital permanece deliberadamente dependente do estado persistido e não é simplificada nesta entrega.

Publicação: commit `2208fb5073b71a6833f056741a253f0498c17a23`, imagem `easypanel/elolab/app:deploy-20261030-2208fb50`. Swarm convergiu com 1/1 réplica; `/version.json` confirmou o SHA integral e `/healthz` respondeu `ok`. Fonte anterior preservada em `/etc/easypanel/projects/elolab/app/code.before-2208fb50`; `.env` comparado sem leitura/exposição. Rollback imediato: `deploy-20261030-ec901d7a`. Nenhuma migration ou alteração de dados de produção.

## Financeiro — criação de conta a pagar em página própria (30/10/2026)

Diagnóstico: a criação de uma despesa ocupava um modal de até 95vh sobre a lista e reunia dados principais, documento, datas, recorrência, centro de custo e observações. Isso bloqueava a lista e dificultava a tarefa em telas menores.

Implementação: `/contas/pagar/nova` é uma página protegida pelos mesmos perfis admin/financeiro. Mantém campos, validações, defaults e inserção existente em `lancamentos`, com categoria, favorecido, valor, vencimento, competência, recorrência e centro de custo. O retorno preserva a aba, mês, status e busca local da lista. Edição ainda não existia neste fluxo e não foi simulada. Erros de gravação mantêm os campos; sair com alterações pede confirmação e permite continuar sem perda. Rótulos estão associados aos controles. O diálogo de pagamento foi mantido por ser confirmação curta de uma transação idempotente no caixa aberto. Sem alteração de contrato, RPC, regra de pagamento, migration ou dado financeiro real.

Validação: suíte Playwright de contas a pagar passou 6/6, cobrindo lista/resumo/pagamento existentes, nova rota e recarga, filtros e busca ao retornar, erro seguido de gravação com o payload atual, proteção e descarte sem escrita. Ações sem modal em celular/tablet/desktop; o botão de gravação foi conferido acima da navegação fixa em 390 px e não houve transbordamento horizontal. TypeScript, build exato, `npm run check:a11y` e `git diff --check` passaram. ESLint teve zero erros e 12 avisos existentes (`any` e dependências de hook em `ContasPagar.tsx`). Capturas mobile (incluindo rodapé), tablet e desktop foram efetivamente inspecionadas em `test-results/accounts-payable-workspace-d6884-eturns-to-the-filtered-list-chromium/`. Testes usaram respostas interceptadas; nenhum lançamento ou pagamento real foi criado.

Limites: o retorno usa o estado de navegação para manter a busca local; links diretos sem origem voltam à aba de contas a pagar. Não foi feita inspeção autenticada da página em produção, leitura de tela manual, nem revalidação real das policies/RLS; produção foi conferida por SHA, saúde e estado do Swarm. O escopo não completa caixa, conciliação, pagamento/estorno, repasses, faturamento ou glosas.

Publicação: commit `d9a12f6c25d72b6a80e12f321fd46678aedea39e`, imagem `easypanel/elolab/app:deploy-20261030-d9a12f6c`. Swarm concluiu com 1/1 réplica; `/version.json` confirmou o SHA integral e `/healthz` respondeu `ok`. Fonte anterior preservada em `/etc/easypanel/projects/elolab/app/code.before-d9a12f6c`; `.env` copiado e comparado sem leitura/exposição. Rollback imediato: `deploy-20261030-2208fb50`. Nenhuma migration ou alteração de dados de produção.

## Financeiro — criação de receita em página própria (30/10/2026)

Diagnóstico: o cadastro de receita ocupava um diálogo comprido sobre a lista. O bloqueio da tela escondia contexto e o formulário ficava apertado em dispositivos menores.

Implementação: `/contas/receber/nova` agora é uma página protegida para admin/financeiro. Preserva campos, validações e payload de `lancamentos`, incluindo associação opcional ao paciente. A volta mantém aba, filtros e busca; falhas mantêm o rascunho, e alterações não salvas pedem confirmação. Permanecem os diálogos curtos de recebimento e estorno, que confirmam operações transacionais existentes. Sem alteração de contrato, RLS, migration ou dado financeiro real.

Validação: Playwright passou 6/6 na suíte de recebíveis: lista, estados vazio/carregando/erro, nova rota, restauração dos filtros, seleção de paciente, erro e nova tentativa com payload preservado, descarte protegido e ausência de gravações fora dos mocks. TypeScript, `npm run check:a11y`, build e `git diff --check` passaram. ESLint: zero erros e 27 avisos (`any` e dependências de hooks) no arquivo. Inspecionei capturas renderizadas mobile (390 px), tablet (768 px) e desktop (1440 px); sem modal e sem transbordamento horizontal, com ação de salvar acima da navegação móvel.

Limites: operações de banco foram simuladas; não houve gravação financeira real, validação autenticada do fluxo em produção ou leitura manual com leitor de tela.

Publicação: commit `f7000e16890e9aca743eeed56445686fea1e13e7`, imagem `easypanel/elolab/app:deploy-20261030-f7000e1`. Swarm confirmou 1/1 réplica; `/healthz` respondeu `ok` e `/version.json` confirmou o SHA integral. Fonte anterior preservada em `code.before-f7000e1`; `.env` copiado e comparado sem leitura ou exposição. Rollback imediato: `deploy-20261030-d9a12f6c`. Nenhuma migration ou alteração de dados de produção.
## Financeiro — recebimento em página própria (30/10/2026)

Diagnóstico: recebimentos parciais eram registrados em um modal sobre a listagem, apesar de exigirem conferência do saldo anterior, ajustes, forma de pagamento, integração opcional com Mercado Pago Point e tratamento de resposta incerta.

Implementação: `/contas/receber/:lancamentoId/recebimento` abre uma tela protegida para admin/financeiro, valida saldo/estado da conta e mostra valor original, pagamentos anteriores e vencimento. Mantém pagamento parcial, desconto, acréscimo, observações, integração Point e a RPC `registrar_pagamento` com a mesma chave de idempotência. Falha explícita permite correção sem perder os dados; resposta incerta bloqueia edição/saída e exige repetir a mesma tentativa. Retornar restaura busca e filtros; o breadcrumb não expõe o ID. O modal foi removido. Nenhuma regra, RPC, contrato, migration, permissão ou operação real foi alterada.

Validação: suíte Playwright de recebíveis passou 8/8, incluindo navegação, retorno com filtro, ausência de modal, valores/payload, falha e repetição com a mesma chave, guarda contra descarte, estados vazio/carregando/erro. TypeScript, acessibilidade, build e `git diff --check` passaram. ESLint: zero erros e 28 avisos no arquivo (`any` e dependências de hooks). Inspecionei capturas mobile (390 px) e desktop (1440 px); o botão de confirmação fica acima da navegação móvel e não há transbordamento horizontal. Banco e terminal foram simulados; sem gravação de pagamento real.

Limites: não houve teste manual com leitor de tela, validação de RLS nem uso autenticado da página em produção. As capturas da tela inicial e das ações foram geradas com conta sintética.

Publicação: commit `6280cc336c9d921fd8da1c9a6598cb2b147712ca`, imagem `easypanel/elolab/app:deploy-20261030-6280cc33`. Swarm confirmou 1/1 réplica; `/healthz` respondeu `ok` e `/version.json` confirmou o SHA integral. Fonte anterior preservada em `code.before-6280cc33`; `.env` copiado e comparado sem leitura ou exposição. Rollback imediato: `deploy-20261030-f7000e1`. Nenhuma migration ou alteração de dados de produção.