# Migração das tarefas para páginas próprias

Pedido do responsável: concluir os fluxos restantes em sequência, validar cada entrega e publicar. Confirmações curtas de exclusão, cancelamento e descarte permanecem em diálogos. Uma ocorrência de `DialogContent` não significa, isoladamente, uma tarefa pendente: é necessário verificar alcance, uso e responsabilidade.

## Entregas já publicadas

- Agenda: criação e edição de consultas; gestão de bloqueios em páginas próprias.
- Pacientes: cadastro, edição e detalhes.
- Prescrições: criação e conclusão.
- Atestados: criação, consulta e duplicação.
- Encaminhamentos: criação, consulta e contra-referência.
- Exames: solicitação, consulta e resultado.
- Agente IA: criação de sessão de WhatsApp em página própria.

## Ordem de execução e verificação

1. Laboratórios e fornecedores: listagem, cadastro e edição.
2. Salas e leitos: cadastro e edição, preservando ocupação e concorrência.
3. Tipos de consulta e preços: cadastro, edição e valores por convênio.
4. Lista de espera e retornos: inclusão, edição e continuidade com a agenda.
5. Convênios e tabela de exames: cadastro e configuração comercial.
6. Equipe: médicos, funcionários, usuários e convites.
7. Estoque, tarefas e modelos de documentos/comunicação.
8. Laboratório: pedidos, coleta, guias externas e laudos.
9. Recepção, fila e triagem: triagem, inclusão na fila, encaixe, pagamento e finalização em página própria publicados; outras tarefas da recepção ainda pendentes.
10. Prontuário e componentes clínicos: páginas próprias de adendos (`4ec83bd`), anexos (`5aae8cbc`), consentimentos (`a2c1eb0`), retornos (`ec901d7a`) e criação de evoluções (`2208fb50`) publicadas; outras tarefas documentais permanecem conforme o inventário.
11. Financeiro e relatórios: contas a pagar (`d9a12f6`), receitas (`f7000e1`), recebimento parcial (`6280cc33`), estorno (`6aef3d6`), abertura do caixa diário (`4bfa55a`), fechamento e venda/PDV; salvamento e agendamento de relatórios publicados em `/relatorios/salvar` (`7cdbf758`). Seguem outras operações do caixa, conciliação, repasses, faturamento, glosas e auditoria dos indicadores.
12. Configurações, suporte, LGPD, treinamento e operações de plataforma. A abertura de chamado (`/suporte/novo`), o histórico de versões (`/configuracoes/historico-versoes`), faturas (`/configuracoes/plano/faturas`), backup e recuperação (`/configuracoes/backup`) e importação (`/configuracoes/importar-dados`) usam páginas próprias; a gestão duplicada de salas foi consolidada com `/gestao-fluxo?tab=salas` e publicada (`57a7425`), e backup/importação publicados (`39660dbc`). Outros fluxos e a recuperação de desastre da plataforma continuam sob auditoria.

Cada item exige investigar os pontos de entrada e as permissões antes de editar. Componentes incorporados em abas precisam preservar o retorno à aba e os filtros. Formulários de dinheiro, ações clínicas, autenticação e segurança não serão convertidos por substituição global.

## Registro de aceite

O diagnóstico, os arquivos alterados, os testes executados, as capturas efetivamente inspecionadas, as limitações e o identificador publicado ficam em `EVOLUCAO_PAGINAS_OPERACIONAIS.md`. A existência de uma rota, compilação bem-sucedida ou botão que abre uma tela não constitui aceite completo.

Estado atualizado em 30/10/2026: itens 1 a 8 publicados e validados, incluindo laudos (`ddc17f58`). Na etapa 9, triagem (`93e867b9`), check-in (`3b67483d`), encaixe (`1e43732c`), pagamento (`af68e69f`) e finalização do atendimento pelas quatro origens (`49e5056f`) estão publicados; outras tarefas da recepção continuam pendentes de auditoria operacional integrada. Na etapa 10, adendos, anexos, consentimentos, agendamento de retorno (`ec901d7a`) e criação/edição de evoluções (`2208fb50`) têm páginas próprias; demais documentos clínicos permanecem em auditoria. Na etapa 11, a criação de contas a pagar (`d9a12f6`) tem página própria; caixa, conciliação, pagamentos/estornos, repasses, faturamento e glosas continuam pendentes. A etapa 12 também segue pendente. Não há declaração de migração integral do aplicativo.

Orientação adicional do responsável: aplicar a referência Taskify ao visual geral do EloLab. Depois dos modelos clínicos, ajustar a estrutura compartilhada com validação de telas de domínios diferentes, mantendo marca, paleta e funcionalidades. A sequência operacional acima continua registrada e não está concluída.

Atualização de 30/10/2026: na etapa 11, contas a pagar (`d9a12f6c`) e contas a receber (`f7000e1`) agora possuem páginas próprias publicadas. Caixa, conciliação, pagamentos/estornos, repasses, faturamento e glosas seguem pendentes. As demais pendências das etapas 9, 10 e 12 ainda exigem auditoria e execução; não houve conclusão integral do aplicativo.
Atualização de 30/10/2026: recebimento parcial agora também ocorre em página própria (`6280cc33`). A etapa financeira ainda não está concluída: permanecem auditoria/execução de caixa e conciliação, estornos, repasses, faturamento e glosas. As pendências operacionais das etapas 9, 10 e 12 também continuam.
Atualização de 30/10/2026: estorno de pagamento agora também ocorre em página própria (`6aef3d6`), usando a RPC transacional existente e preservando o motivo de auditoria. Ainda faltam caixa, conciliação, repasses, faturamento e glosas; as pendências das etapas 9, 10 e 12 continuam em aberto.
Atualização de 30/10/2026: abertura do caixa diário ocorre em `/recepcao/caixa/abrir` (`4bfa55a`) e o fechamento agora está em `/recepcao/caixa/:caixaId/fechar` (`658f3cc`), com validação de divergência e justificativa preservada após erro. Venda, despesa, sangria, suprimento, conciliação, repasses, faturamento e glosas continuam pendentes; as demais pendências das etapas 9, 10 e 12 também permanecem.
Atualização de 30/10/2026: sangria, suprimento e despesa passaram a páginas próprias (`3af409f`) e foram publicadas após validação. Na etapa financeira, permanecem venda/PDV, conciliação, repasses, faturamento e glosas; as pendências das etapas 9, 10 e 12 também continuam abertas. A sequência não representa conclusão integral do EloLab.
Atualização de 30/10/2026: venda/PDV (`28e426e`) agora também tem workspace próprio e está publicada com a RPC de venda idempotente preservada. Permanecem conciliação bancária, pagamento de repasses, faturamento/glosas e auditoria das etapas 9, 10 e 12; o app ainda não foi integralmente auditado ou concluído.


Atualizacao de 30/10/2026: pagamento de repasse agora ocorre em pagina propria (`e71673f`), com verificacao da receita, RPC transacional e recuperacao idempotente. Permanecem conciliacao bancaria OFX e faturamento/glosas na etapa 11, alem das auditorias das etapas 9, 10 e 12. A sequencia integral ainda esta em andamento.


Atualização de 30/10/2026: importação do extrato OFX tem página própria (1ac12fc), preserva a competência do Fluxo de Caixa e não cria lançamentos automaticamente. Na etapa 11, criação de lote TISS agora também tem página própria (68782fe); retorno do lote, registro de glosa, preparação de recurso e decisão da operadora seguem em modais. As etapas 9, 10 e 12 ainda exigem auditoria operacional; a sequência integral continua em andamento.

Atualização de 30/10/2026: criação de lote TISS (68782fe), retorno/conciliação (9f3c57f) e registro de glosas (84b4eac) estão em páginas próprias. Preparação de recurso, documentos e decisão da operadora ainda estão em modais e seguem para a próxima rodada. As etapas 9, 10 e 12 continuam em auditoria; o app não está integralmente concluído.


Atualizacao TISS (2026-10-30): recurso de glosa, decisao da operadora e conferencia de guias foram movidos para paginas proprias e publicados. Registro detalhado: [evolucao do fluxo TISS](EVOLUCAO_FATURAMENTO_TISS_RECURSO_GUIAS.md). Outras jornadas do EloLab seguem pendentes; esta entrega nao encerra a auditoria integral.

Atualização de 30/10/2026: o histórico e a reabertura do caixa diário agora têm páginas próprias (`df095a7`) e foram publicados. Próximos alvos financeiros: edição de lançamentos e auditoria de pagamentos/contas. Conciliação e demais fluxos das etapas 9, 10 e 12 continuam pendentes; o redesenho integral não está concluído.

Atualização de 30/10/2026: edição de saídas do caixa tem página própria e está publicada (`69571cf`). Próximos alvos financeiros: auditar telas de pagamentos e contas, depois concluir conciliação e os fluxos de repasses/faturamento pendentes. As pendências das etapas 9, 10 e 12 continuam na sequência; o EloLab ainda não está integralmente auditado.

Atualização de 30/10/2026: o pagamento de contas a pagar tem página própria e está publicado (`66a7606`); a RPC idempotente foi preservada. Próximo alvo: auditar detalhes e ações financeiras ainda em overlays, depois conciliação e jornadas das etapas 9, 10 e 12. A conclusão integral do EloLab permanece pendente.

Atualização de 30/10/2026: o detalhe/histórico de contas a receber foi migrado para página própria e publicado (`ccc8ee8`). A sequência financeira continua com auditoria da conciliação e demais operações pendentes; as etapas 9, 10 e 12 ainda exigem auditoria, e o EloLab não está integralmente concluído.

Atualização de 30/10/2026: na etapa 9, a liberação excepcional sem pagamento confirmado ou sem triagem agora tem página própria (`/fila/:agendamentoId/liberacao/:tipo`), preservando justificativa, perfis admin/médico e validações do banco. Detalhes e publicação: [liberação excepcional da Fila](EVOLUCAO_FILA_LIBERACAO_EXCEPCIONAL.md). A auditoria de Recepção, prontuário/documentos e demais pendências operacionais continua; não há conclusão integral do aplicativo.

Atualização de 30/10/2026: gerenciamento e cadastro de bloqueios da Agenda agora têm páginas próprias (`/agenda/bloqueios` e `/agenda/bloqueios/novo`), commit `c580292`, publicado e validado. Seguem pendentes a auditoria integral e as tarefas restantes das etapas 9, 10 e 12, além de operações financeiras registradas acima. O EloLab não está integralmente concluído.

Atualização de 30/10/2026: revisão, histórico e retificação de relatos de Segurança Assistencial agora usam páginas próprias (`6fa4c9f`), publicadas e validadas. A sequência continua; próximo foco documentado: auditar as tarefas restantes da Recepção, preservando o fluxo já implantado de triagem, check-in, encaixe, pagamento e finalização. Pendências das etapas 10 e 12 e auditoria integral continuam abertas.

Atualização de 30/10/2026: a Fila agora também usa páginas próprias para remoção com motivo (`/fila/:filaId/saida`) e passagem de turno (`/fila/passagem`), publicadas no commit `53dc694`. Os overlays de tarefa da Fila foram removidos; confirmações curtas de ações críticas continuam como diálogos. Próximo foco: auditar os documentos clínicos ainda pendentes da etapa 10. A auditoria integrada da Recepção, etapa 12 e o redesign geral continuam abertos.

Atualização de 30/10/2026: no Prontuário, protocolos clínicos e prévia do relatório de alta agora ocupam telas próprias no contexto do paciente/evolução. Commit `8245ac7`, imagem `deploy-20261030-8245ac7`, publicada e validada em produção. As sugestões de protocolo não criam pedidos de exames, e a prévia de alta não persiste documentos. Próximo foco: concluir a auditoria operacional integrada da Recepção; outras jornadas clínicas, financeiras e de plataforma continuam pendentes. A sequência e o redesign integral ainda não estão concluídos.

Atualização de 30/10/2026: a Recepção agora leva a origem às páginas próprias de encaixe e pagamento, e retorna para o contexto validado ao cancelar ou concluir. Commit `94315b9`, imagem `deploy-20261030-94315b9`, smoke, saúde pública, SHA e Swarm 1/1 confirmados; rollback `deploy-20261030-8245ac7`. Detalhes e validação: [continuidade da Recepção](EVOLUCAO_RECEPCAO_CONTINUIDADE.md). A auditoria integrada foi retomada; esta alteração não encerra as pendências dos módulos 9, 10 e 12 nem a reformulação geral.

Atualização de 30/10/2026: revisão de segurança clínica da prescrição migrou do modal para a etapa em página própria `?tela=alertas-seguranca`. Rascunho e justificativa ficam no mesmo workspace; alertas críticos não ignoráveis continuam bloqueando emissão. Commit `df8c0c1`, imagem `deploy-20261030-df8c0c1`, smoke, saúde pública, SHA e Swarm 1/1 confirmados; rollback `deploy-20261030-94315b9`. Registro detalhado: [revisão de segurança da prescrição](EVOLUCAO_REVISAO_SEGURANCA_PRESCRICAO.md). As demais jornadas clínicas e dos módulos 9 e 12 continuam abertas.

Atualização de 30/10/2026: o resumo clínico inteligente da Timeline agora abre em tela própria no contexto do paciente, com link recuperável, busca preservada, revisão profissional explícita e conteúdo apenas em memória. Commit `db8b582`, imagem `deploy-20261030-db8b582`, smoke, saúde pública, SHA e Swarm 1/1 confirmados; rollback `deploy-20261030-df8c0c1`. Detalhes: [resumo clínico da Timeline](EVOLUCAO_TIMELINE_RESUMO_IA.md). A auditoria integral e as jornadas restantes das etapas 9, 10 e 12 continuam pendentes.

Atualização de 30/10/2026: a leitura detalhada de alertas de medicamentos saiu do modal e passou à tela própria `?tela=alertas-medicamentos`, preservando paciente, prontuário, seção e retorno de foco. Falha no carregamento, ausência de medicamentos e nenhuma correspondência local são estados distintos; o aviso explicita os limites das regras simplificadas. Commit `66c5849`, imagem `deploy-20261030-66c5849`, smoke, saúde pública, SHA e Swarm 1/1 confirmados; rollback `deploy-20261030-db8b582`. Detalhes: [revisão dos alertas de medicamentos](EVOLUCAO_ALERTAS_MEDICAMENTOS_PAGINA.md). A lógica farmacológica precisa de validação clínica, e a auditoria integral e as jornadas das etapas 9, 10 e 12 continuam pendentes.


Atualização de 30/10/2026: publicação e revogação de anexos no Portal do Paciente agora têm página própria (`?tela=anexo-portal&anexo=<id>`), preservando permissões, RPC e retorno ao prontuário. Commit `e0b2ae3`, imagem `deploy-20261030-e0b2ae3`, smoke, `/healthz`, SHA público e Swarm 1/1 confirmados; rollback `deploy-20261030-66c5849`. Registro: [gestão de anexos no portal](EVOLUCAO_ANEXO_PORTAL_PAGINA.md). A auditoria integral e as tarefas restantes das etapas 9, 10 e 12 continuam abertas.
Atualização de 30/10/2026: auditoria das telas de Recepção, Fila e Triagem não encontrou formulários longos de operação escondidos em modais. Permanecem diálogos curtos de confirmação para transições críticas, como falta, conclusão e cancelamento de exame; essas confirmações continuam adequadas e não são uma fila de conversão para páginas.

Atualização de 30/10/2026: assinatura eletrônica do prontuário agora tem página própria em `?tela=assinatura-eletronica`, com recarga e retorno ao contexto validados. Commit `e98e83e`, imagem `deploy-20261030-e98e83e`, smoke, `/healthz`, SHA público e Swarm 1/1 confirmados; rollback `deploy-20261030-e0b2ae3`. A RPC `assinar_prontuario_verificavel` e as regras de autorização do banco foram preservadas. Registro: [assinatura eletrônica do prontuário](EVOLUCAO_ASSINATURA_PRONTUARIO_PAGINA.md). A auditoria geral do EloLab e as demais pendências das etapas 9, 10 e 12 continuam abertas.

Atualização de 30/10/2026: o cancelamento em lote de coletas pendentes antigas saiu do diálogo e passou para `/laboratorio/coletas/limpar`, com prévia, motivo auditável e escopo da clínica preservados. Commit `66e9522`, imagem `deploy-20261030-66e9522`, smoke, `/healthz`, SHA público e Swarm 1/1 confirmados; rollback `deploy-20261030-e98e83e`. Registro: [limpeza da fila do laboratório](EVOLUCAO_LIMPEZA_FILA_LABORATORIO_PAGINA.md). A auditoria geral e as pendências dos módulos 9, 10 e 12 continuam abertas.

Atualização de 30/10/2026: a proteção de exportações clínicas em Interoperabilidade e Prontuário agora usa página própria, sem colocar conteúdo clínico, senha ou arquivo na URL ou em armazenamento persistente. Commit `7c4a69d`, imagem `deploy-20261030-7c4a69d`, smoke, `/healthz`, SHA público e Swarm 1/1 confirmados; rollback `deploy-20261030-66e9522`. Registro: [proteção de exportações clínicas](EVOLUCAO_EXPORTACAO_CLINICA_PAGINA.md). As demais tarefas documentais e operacionais das etapas 9, 10 e 12 continuam abertas.

Atualização de 30/10/2026: a consulta do histórico e a solicitação de autorização de convênio saíram do modal e agora usam `/pacientes/:patientId/autorizacoes`, com contexto de retorno preservado e escopo da clínica validado. Commit `9f987a7`, imagem `deploy-20261030-9f987a7`, smoke, `/healthz`, SHA público e Swarm 1/1 confirmados; rollback `deploy-20261030-7c4a69d`. Registro: [autorizações de convênio em página própria](EVOLUCAO_AUTORIZACOES_CONVENIO_PAGINA.md). A sequência geral, demais fluxos das etapas 9, 10 e 12 e o redesign visual continuam em andamento.

Atualização de 30/10/2026: a revisão de duplicidades de pacientes agora ocorre em `/pacientes/duplicidades`. A comparação preserva a escolha campo a campo e acrescenta confirmação explícita da mesclagem e proteção de rascunho. Commit `4947716`, imagem `deploy-20261030-4947716`, smoke, `/healthz`, SHA público e Swarm 1/1 confirmados; rollback `deploy-20261030-9f987a7`. Detalhes: [revisão de duplicidades de pacientes](EVOLUCAO_DUPLICIDADES_PACIENTES_PAGINA.md). As demais jornadas e o redesign geral continuam pendentes.


Atualização de 30/10/2026: a gestão de imagens e vídeos do Painel TV saiu do diálogo e foi para `/painel-tv/midias`, restrita ao perfil administrador. Validações unitárias, E2E sintético, acessibilidade, permissões, TypeScript, build e inspeção desktop/mobile passaram; publicado no commit `885bfe55`, imagem `deploy-20261030-885bfe55`; smoke, `/healthz`, SHA público e Swarm 1/1 confirmados, rollback `deploy-20261030-7cdbf758`. Outras pendências das etapas 9, 10, 11 e 12 e o redesign visual geral continuam abertos. Detalhes: [gestão de mídias do Painel TV](EVOLUCAO_PAINEL_TV_MIDIAS.md).


Atualização de 30/10/2026: as etapas de treinamento saíram do diálogo e passaram a `/treinamento/:tutorialKey`, com retomada de etapa pela query e gravação de conclusão preservada. Vitest, Playwright sintético, acessibilidade, permissões, TypeScript, build e inspeção desktop/mobile passaram. Publicado no commit `ade77ff4`, imagem `deploy-20261030-ade77ff4`; smoke, `/healthz`, SHA público e Swarm 1/1 confirmados, rollback `deploy-20261030-885bfe55`. Permanecem outros fluxos das etapas 9, 10, 11 e 12 e o redesign visual geral. Detalhes: [etapas de treinamento em páginas próprias](EVOLUCAO_TREINAMENTO_ETAPAS_PAGINA.md).

Atualização de 30/10/2026: a edição do plano de ativação saiu do modal e passou a `/admin/onboarding/:clinicId`, mantendo autorização de plataforma e RPC existente. Busca/filtros retornam preservados e rascunhos pedem confirmação ao sair. Playwright sintético 2/2, verificações estáticas, build e inspeção desktop/mobile passaram. Publicado no commit `8b043c4`, imagem `deploy-20261030-8b043c4`; health, SHA público e Swarm 1/1 confirmados, rollback `deploy-20261030-ade77ff4`. Outras jornadas e o redesign visual geral continuam em andamento. Detalhes: [plano de ativação em página própria](EVOLUCAO_ONBOARDING_PLANO_PAGINA.md).

Atualização de 30/10/2026: as cotas por clínica saíram do modal e passaram para `/admin/consumo/:clinicId/limites`, preservando autorização e RPC. A tela mostra uso, valida intervalos e avisa sobre cotas abaixo do uso atual. Playwright sintético 2/2, verificações estáticas, build e captura mobile passaram. Publicado no commit `f81a78c`, imagem `deploy-20261030-f81a78c`; health, SHA público e Swarm 1/1 confirmados; rollback `deploy-20261030-8b043c4`. Próximos na fila: incidente e privacidade. Detalhes: [limites de consumo em página própria](EVOLUCAO_CONSUMO_LIMITES_PAGINA.md).

Atualização de 30/10/2026: status e justificativa de incidentes saíram do modal e passaram para `/admin/incidentes/:incidentId/atualizar`, com contexto e timeline preservados. E2E sintético, build e verificações estáticas passaram; captura mobile foi inspecionada. Publicado no commit `76c94c9`, imagem `deploy-20261030-76c94c9`; health, SHA público e Swarm 1/1 confirmados; rollback `deploy-20261030-f81a78c`. Próximo na fila: decisão de privacidade. Detalhes: [atualização de incidentes em página própria](EVOLUCAO_INCIDENTES_ATUALIZACAO_PAGINA.md).

Atualização de 30/10/2026: a decisão de solicitações LGPD passou para `/admin/lgpd/:requestId/decisao`, mantendo RPC, escopo e evidência somente em memória. Publicado em `9cf95b8` (`deploy-20261030-9cf95b8`); rollback `deploy-20261030-76c94c9`. Registro: [decisão LGPD](EVOLUCAO_LGPD_DECISAO_PAGINA.md).

Atualização de 30/10/2026: a solicitação de restauração de backup passou para `/admin/backups/restaurar`, com pedido auditável e aprovação independente preservados. Publicado em `a96ed3f` (`deploy-20261030-a96ed3f`); rollback `deploy-20261030-9cf95b8`. A execução e o ensaio de recuperação completa continuam pendentes. Registro: [solicitação de restauração](EVOLUCAO_BACKUP_RESTORE_REQUEST_PAGE.md). A auditoria dos demais fluxos em diálogo segue aberta.
Atualização de 30/10/2026: acesso assistido à clínica e reconciliação administrativa de cobranças passaram a páginas próprias em /admin/clinicas/acesso e /admin/cobrancas/reconciliar/:origem/:attemptId. Publicado em 3f85b85 (deploy-20261030-3f85b85), com smoke, SHA público, health, Swarm 1/1 e ambiente conferidos. Nenhum acesso real ou ajuste financeiro real foi executado. Continuam abertas as etapas 9, 10, 11 e 12, a auditoria operacional integrada e o ensaio de restauração.

Atualização de 30/10/2026: as credenciais manuais das integrações da clínica passaram para /configuracoes/integracoes/conectar/:integrationId, mantendo os segredos fora da URL e do armazenamento local. Publicado em 7714c00 (deploy-20261030-7714c00), com health, SHA público, Swarm 1/1 e ambiente conferidos. Nenhuma credencial real foi usada. Permanecem a auditoria operacional integrada, jornadas dependentes de provedores/contas, recuperações reais e demais pendências das etapas 9–12.

Atualização de 30/10/2026: escopo da exportação e confirmação de entrega de solicitações LGPD da clínica agora usam telas próprias, sem identidade ou evidência na URL. Publicado em `5af4fd6` (`deploy-20261030-5af4fd6`), com Playwright sintético, build, smoke isolado, `/healthz`, SHA público e Swarm 1/1 confirmados. Detalhes: [fluxos LGPD de pacientes](EVOLUCAO_LGPD_PACIENTES_PAGINAS.md). Permanecem abertas a cobertura integral dos dados, exclusão assistida, demais tarefas da sequência e auditoria global.

Atualização de 30/10/2026: reagendamento de consulta e retorno no Portal do Paciente agora usam `/portal-paciente?tela=reagendar`, sem IDs ou código de acesso na URL. Commit `4f716d3`, imagem `deploy-20261030-4f716d3`, Playwright 3/3, Vitest 32/32, build e verificações de acessibilidade, permissões e integração passaram; ambos os domínios, health, SHA, Swarm 1/1 e ambiente foram conferidos. Detalhes: [reagendamento do Portal do Paciente](EVOLUCAO_PORTAL_PACIENTE_REAGENDAMENTO_PAGINAS.md). A auditoria integrada e outras pendências seguem em andamento.

Atualização de 30/10/2026: criação de sessão do WhatsApp agora usa `/agente-ia/sessoes/nova`, com proteção de acesso e plano preservada, validação de nome alinhada à Edge Function e QR continuando no workspace de sessões. Playwright sintético 2/2, Vitest 9/9, TypeScript, build, acessibilidade, permissões e inspeção visual mobile/desktop passaram. Publicado em `ea619d0`, imagem `deploy-20261030-ea619d0`, rollback `deploy-20261030-4f716d3`; os dois domínios, health, SHA e Swarm 1/1 foram confirmados. Outras tarefas do Agente IA e módulos restantes continuam pendentes; esta entrega não conclui a auditoria integral do EloLab. Detalhes: [criação de sessão WhatsApp](EVOLUCAO_SESSAO_WHATSAPP_PAGINA.md).


Atualização de 30/10/2026: inativação e reativação de pacientes agora usam `/pacientes/:patientId/status`, com motivo auditável, contexto de lista preservado e RPC transacional existente. Playwright 3/3, Vitest relacionado 10/10, TypeScript, build, acessibilidade, permissões, colunas e inspeção mobile/desktop passaram; nenhuma escrita real foi feita. A auditoria e as demais etapas continuam abertas. Detalhes: [alteração de status do paciente](EVOLUCAO_STATUS_PACIENTE_PAGINA.md). Publicação: pendente.
