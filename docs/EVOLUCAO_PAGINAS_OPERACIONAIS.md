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
