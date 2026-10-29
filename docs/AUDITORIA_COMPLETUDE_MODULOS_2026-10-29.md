# EloLab — auditoria de completude e fluxos em modal

Data: 29/10/2026. Escopo: diagnóstico, sem alterar funcionalidades, publicar ou modificar dados.

## Base e limites da avaliação

- Código examinado: `40712d6d`. Produção consultada por `/version.json`: `c537d6940c97522167c1834250884ce862d5a4ba`. A correção posterior do banner de impersonação ainda não está nesse build publicado.
- Inventário estático: 126 declarações de rotas, 115 caminhos distintos, incluindo aliases, rotas públicas e curinga. Não representam 115 módulos independentes.
- Inventário de overlays: 145 instanciações de `<DialogContent>` em 89 arquivos TSX, excluindo diretórios `__tests__`. Não inclui `AlertDialogContent`, `SheetContent`, outras implementações nem comprova que todos os arquivos são alcançáveis. Não são 145 defeitos.
- Inspeção visual: imagem de Agenda enviada pelo responsável; formulário vazio de Pacientes aberto no navegador de produção e visualizado em captura; formulário vazio de novo lote de convênio aberto e visualizado. Texto operacional de Faturamento também conferido no navegador. Nenhum formulário foi salvo.
- Os demais achados abaixo vêm do código. Não foram executados nesta rodada testes automatizados, transações, testes entre clínicas, chamadas pagas ou restauração de backup. Tablet, mobile e teclado permanecem pendentes de validação específica.
- Documentos antigos foram usados como pistas, não como prova do estado atual. Não se atribui percentual de completude nem se declara um módulo concluído só porque possui rota ou testes sintéticos históricos.

## Conclusão operacional

O produto possui implementações reais em muitos módulos. Há três problemas diferentes: tarefas ainda confinadas em modais; capacidades com escopo funcional limitado; integrações implementadas cuja operação completa precisa ser comprovada. Uma mudança visual não resolve as duas últimas categorias.

**Direção confirmada pelo responsável nesta auditoria:** páginas próprias para cadastros, edição, detalhes extensos e processos completos, em todos os módulos pertinentes. Painéis laterais não serão a substituição padrão. Modais ficam reservados a decisões curtas que precisam de confirmação contextual.

## Achados confirmados e prioridade

| ID | Impacto | Módulo e diagnóstico | Causa/evidência atual | Consequência e critério de conclusão |
|---|---|---|---|---|
| UX-01 | Alto | Agenda: criar/editar consulta bloqueia o calendário | `src/components/agenda/AppointmentDialog.tsx:453`, formulário em três abas; imagem fornecida | Perde-se a consulta ao contexto de horários. Criar página de consulta com contexto de data/profissional, disponibilidade e retorno à agenda preservados; manter validação de conflito, RPC, auditoria e confirmação de exceções. |
| UX-02 | Alto | Pacientes: cadastro e ficha extensa dentro de overlays | `src/pages/Pacientes.tsx:1503` e `:1910`; captura real do cadastro vazio | No desktop observado, cadastro tem aproximadamente 768 × 811 px, usa rolagem e ações ficam fora do recorte inicial. Criar páginas para cadastro, edição e ficha, com seções e navegação próprias. |
| UX-03 | Alto | Clínica e laboratório: processos extensos em modais | `Prontuarios.tsx:2180`, `Exames.tsx:1557`, `Laboratorio.tsx:1253` e `:1641`; Prescrições, Atestados e Guias Externas no inventário | Exames já reserva 95dvh ao formulário. Evolução, guia, pedido e resultado precisam de páginas de trabalho preservando paciente, pedido, autoria, rascunhos e estados. Não remover confirmações de assinatura/liberação/cancelamento. |
| UX-04 | Alto | Financeiro: operações distribuídas por múltiplos overlays | `CaixaDiario.tsx`: 9 conteúdos; `ContasReceber.tsx`: 5; `ContasPagar.tsx:665`; `FaturamentoConvenios.tsx`: 4 | Criar páginas de lançamento, conta e lote; detalhar conciliação na própria área de trabalho. Preservar pagamento parcial, estorno, locks e fechamento. Quantidade de overlays é indício, não julgamento automático sobre cada confirmação. |
| UX-05 | Médio | Estoque, convênios e gestão: edição extensa sobre listagens bloqueadas | `Estoque.tsx:948`, `Convenios.tsx:952`; equipe, modelos e configurações no inventário | Separar listagem e páginas de cadastro/edição; voltar com busca, filtros e paginação. Priorizar tarefas frequentes antes de ajustes administrativos raros. |
| UX-06 | Alto | Agenda: fechamento sem proteção contra descarte | `AppointmentDialog.tsx:453` e `:633` só verificam salvamento/exclusão; `:51` reinicializa campos ao abrir | Fechar e reabrir reinicializa o formulário sem checar alterações. Na migração, confirmar saída com alterações; não gravar dados clínicos em armazenamento local indiscriminadamente. Achado por leitura do código, sem preenchimento real nesta auditoria. |
| FN-01 | Alto se transmissão é necessária | TISS/glosas: gestão de lotes existe, transmissão não é completada pelo módulo | `FaturamentoConvenios.tsx:415`–exportação; XML declara ser resumo operacional. UI afirma que o sistema não transmite à operadora | Lotes, glosas, conferência e registro de envio existem. Faltam, para um ciclo integrado, arquivo aceito pelo destino, validação correspondente, transmissão e retorno conciliável. Não tratar o XML atual como TISS homologado. |
| FN-02 | Alto para recuperação | Backups: aprovação não executa restauração completa | `PlatformBackups.tsx:115` e `:141` chamam solicitar/decidir; `:153` avisa execução operacional pendente | Existe ferramenta separada `supabase/functions/backup-restaurar-arquivos`, mas aprovação na tela não comprova recuperação de banco e anexos. Concluir com procedimento executável, responsável, resultado rastreável e ensaio isolado; não automatizar restauração destrutiva sem salvaguardas. |
| FN-03 | Médio | LGPD: exportação possui cobertura e operação limitadas | `LgpdPacientes.tsx:145`–`:146`: anexos do prontuário até 30 MB; documentos externos requerem conferência; exclusão não concluída pela tela | Há protocolo e confirmação de entrega. Não classificar todo o módulo como ausente. Mapear documentos faltantes e fluxo humano de análise, retenção/exclusão e conclusão; não implementar exclusão indiscriminada. |
| FN-04 | Médio, condicionado ao volume | Estoque: indicadores/lista têm teto | `useSupabaseData.ts:13`: `MAX_LINHAS_AUTO=20000`; `Estoque.tsx:562`–`:566` avisa incompletude de total/ABC/lista ao atingir teto | Para operar acima desse volume, consultar registros com paginação/filtros no servidor e calcular agregados completos no backend. Não há evidência nesta rodada de que a clínica já tenha atingido o teto. |
| FN-05 | Médio, se troca bidirecional é requisito | Interoperabilidade é exportação, não integração clínica bidirecional completa | `Interoperabilidade.tsx:24`: chama `fhir-export`; abertura de arquivo descriptografa e baixa; referência a PACS é texto informativo | Exportar e descriptografar são recursos reais. Não existe nessa tela importação persistente, sincronização nem operação DICOM/PACS. Definir destinos e contratos antes de ampliar; escopo limitado não significa exportação quebrada. |
| FN-06 | Alto para uso em redes restritivas | Teleconsulta: conectividade sem relay configurado no cliente | `Teleconsulta.tsx:93`: `RTCPeerConnection` com um STUN e sem TURN | A chamada pode funcionar em algumas redes; disponibilidade entre redes restritivas não está assegurada por esse código. Validar redes diferentes, recuperação e relay quando necessário. Nenhuma chamada real foi feita nesta rodada. |

Nenhum achado crítico de segurança clínica ou isolamento foi comprovado nesta rodada. A ausência de prova não certifica esses controles.

## Inventário por domínio e o que falta para aprovação

“Validação pendente” significa que a auditoria não comprovou o ciclo completo; não significa funcionalidade inexistente.

| Domínio / rotas principais | Estado observado | Pendência para aprovação |
|---|---|---|
| Acesso, convite, recuperação, onboarding — `/auth`, `/aceitar-convite`, `/redefinir-senha`, `/boas-vindas`, `/onboarding` | Rotas e implementações existentes | Reexecutar jornadas por papel, convite/expiração e recuperação; não concluído apenas com sessão de admin. |
| Dashboard, notificações e produtividade — `/dashboard`, `/notificacoes`, `/indicadores`, `/analytics` | Páginas existentes | Verificar fontes/períodos/permissões e caminhos até a pendência; auditoria profunda de indicadores pendente. |
| Agenda e agendamento online — `/agenda`, `/agendar/:clinicaId` | Fluxo implementado; UX-01/06 confirmados | Páginas próprias e teste de conflito, edição concorrente, cancelamento, retorno e agenda online. |
| Recepção, caixa, fila, triagem, salas, espera, TV — `/recepcao`, `/fila`, `/gestao-fluxo`, `/painel-tv` | Fluxos existentes; caixa concentra overlays | Jornada check-in → fila → triagem → atendimento e cobrança, por perfil e com erros, ainda requer execução integral nesta auditoria. |
| Pacientes, retornos e portal — `/pacientes`, `/retornos`, `/portal-pacientes`, `/portal-paciente` | Cadastro real inspecionado; UX-02 | Páginas de ficha/cadastro; duplicidade, inativação, retorno e token/expiração do portal precisam de validação completa. |
| Prontuário e documentos — `/prontuarios`, `/documentos-clinicos`, `/todos-templates`, `/vitais-graficos` | Implementações e rascunhos existentes; UX-03 | Preservar autoria, assinatura, adendo e rascunho nas páginas; validar Memed em ambiente autorizado. |
| Exames e laboratório — `/exames`, `/laboratorio`, `/mapa-coleta`, `/laudos-lab`, `/guias-externas`, `/portal-guias/:token` | Pedidos, coleta, resultados e laudos implementados; UX-03 | Executar pedido → coleta → resultado → validação → liberação → portal/financeiro, incluindo rejeição/recoleta e concorrência. Não declarar LIS completo só pelo código. |
| Contas e caixa — `/financeiro`, `/contas`, `/fluxo-caixa`, `/cobranca-inadimplentes`, `/repasses-medicos`, `/precos-servicos` | Operações existentes; UX-04 | Páginas próprias; comprovar persistência/reconciliação de pagamentos, parciais, estornos, repasses e fechamento. |
| Convênios e faturamento — `/convenios`, `/faturamento-convenios` | Gestão interna existe; FN-01 | Separar claramente gestão interna de transmissão; página do lote e integração externa quando contratada. |
| Estoque — `/estoque` | Cadastro/movimentos existentes; UX-05/FN-04 | Página de item/movimento, totais completos para grandes volumes e validação de consumo/devolução. |
| Equipe, configurações, templates — `/equipe`, `/configuracoes`, `/configuracoes-avancadas`, `/todos-templates` | Implementações existentes; overlays em subfluxos | Páginas de profissional/funcionário e modelos; validar convite, troca de perfil e reflexos nas permissões reais. |
| Comunicação e automações — `/chat`, `/automacoes`, `/agente-ia` | Registry atual tem endpoints/eventos reais; não há entrada marcada `available:false` | Confirmar provedor, fila, entrega, retry e duplicidade. Ter texto de “em desenvolvimento” no componente não prova automação desativada. |
| Tarefas, treinamento, ajuda — `/tarefas`, `/minha-fila`, `/treinamento`, `/suporte`, `/feedback`, `/meu-historico`, `/preferencias` | Rotas/implementações presentes | Auditoria detalhada de conclusão, responsabilidade, anexos, persistência e acesso ainda pendente. |
| Segurança e privacidade — `/seguranca`, `/lgpd-pacientes`, `/acesso-assistido` | Implementações presentes; FN-03 | Validar isolamento com duas clínicas e papéis reais; exportação/entrega e acesso assistido. Não inferir conformidade legal. |
| Interoperabilidade e teleconsulta — `/interoperabilidade`, `/teleconsulta/:sessionId` | Escopos concretos identificados; FN-05/06 | Validar exportação no destino e videoconferência entre redes; ampliar integrações só com requisitos definidos. |
| Segurança assistencial, higiene, patrimônio e risco de faltas — `/seguranca-assistencial`, `/higiene-salas`, `/patrimonio-equipamentos`, `/analise-preditiva` | Consultas/RPCs/Edge Functions ligadas ao frontend | Validação integral de incidentes, execução de checklist, manutenção e explicação/ação sobre risco ainda pendente. |
| Administração da plataforma — `/painel-admin`, `/admin/*`, `/usuarios`, `/documentacao` | Áreas de clínicas, CRM, suporte, operações, integrações, filas, incidentes, consumo, domínios, relatórios e segurança existem | Auditoria operacional profunda ainda pendente; backup tem FN-02. Não confundir plataforma com permissões de clínica. |
| Cobrança de planos — `/planos`, `/planos/checkout/:slug`, `/admin/cobrancas`, `/admin/historico-financeiro` | Implementação e histórico de sandbox documentados no handoff | Handoff registra testes históricos e pendência visual/webhook real. Nesta rodada não houve pagamento, nova homologação ou verificação atual do gateway; não classificar como ausente nem aprovado. |

## Plano de substituição de modais por páginas

As rotas abaixo são propostas, não endpoints já criados. Antes de implementá-las, conferir convenções e guardas de rota atuais.

| Ordem | Tarefa | Página proposta | Contexto a preservar |
|---|---|---|---|
| 1 | Nova/editar consulta | `/agenda/nova`, `/agenda/:id/editar` | Data, médico, unidade/sala quando disponíveis, filtros e visão dia/semana/mês; conflitos e confirmação de exceção. |
| 2 | Cadastro, edição e ficha do paciente | `/pacientes/novo`, `/pacientes/:id`, `/pacientes/:id/editar` | Busca/página anterior, paciente correto, campos condicionais, duplicidades, acessos e histórico. |
| 3 | Evolução e documentos | Páginas por prontuário/documento com identificador | Autoria, paciente, atendimento de origem, rascunho, revisão, assinatura e adendos. |
| 4 | Solicitação de exame, pedido e resultado laboratorial | Páginas por guia/pedido/coleta/resultado | Procedência clínica, agrupamento de exames, status, validação, liberação e rastreabilidade. |
| 5 | Lançamento, conta e lote | Páginas sob recepção/contas/faturamento | Caixa aberto, competência, centro de custo existente, estado de pagamento, conciliação e filtros. |
| 6 | Estoque, convênios, equipe e modelos | Páginas de detalhe/cadastro/edição por entidade | Listagem anterior, permissões, vínculos existentes e dependências. |

### Contrato de interação para as novas páginas

1. Cabeçalho identifica tarefa e entidade; contexto essencial permanece visível sem duplicação de informações sensíveis.
2. URL permite acesso direto com autenticação e autorização equivalentes às atuais, inclusive após recarregar.
3. Voltar/Cancelar retorna à origem interna válida, preservando filtros e período. Não usar `history.back()` como única solução quando o usuário chegou por link direto.
4. Mudanças não salvas exigem proteção de saída. Rascunho só quando houver armazenamento adequado e contrato real; nada de botão falso de salvar rascunho.
5. Salvar mostra progresso, impede duplicação e mantém os campos se falhar. Conclusão oferece próximo passo real e atualiza dados relacionados.
6. Campos agrupados pela tarefa; múltiplas etapas apenas quando justificadas. Aproveitar espaço da página sem simplesmente ampliar o modal.
7. Foco, erros, teclado, zoom, carregamento, acesso negado e mobile devem ser verificados na interface renderizada.
8. Confirmações curtas permanecem contextuais: cancelar consulta, estornar, excluir quando permitido, assinar/liberar, substituir paciente com edição pendente. Não remover salvaguardas para atender à preferência visual.
9. Não mudar `Dialog` globalmente nem converter todos os overlays de uma vez. Extrair formulário mantendo handlers, validações, RPCs e testes; migrar um fluxo por entrega validada.

## Achados antigos que não devem ser repetidos como atuais

- Ausência de etiqueta/código de barras no laboratório: `MapaColeta.tsx:362`–`:371` já contém geração/impressão de etiqueta com SVG. O histórico anterior não demonstra ausência hoje; leitura por dispositivos ainda exige validação própria.
- QR do laudo apontando para `/validar`: o código atual e `src/lib/__tests__/laudoPdfRoutes.test.ts` indicam remoção desse link. O teste não foi executado nesta rodada.
- “Memed não existe”: há `supabase/functions/memed-prescription/index.ts`, autorização e verificação de callback. Configuração/homologação não foi comprovada agora.
- “Automações em desenvolvimento”: a estrutura suporta esse estado, mas as entradas atuais não estão marcadas indisponíveis. Endpoints nulos também podem representar eventos automáticos, não botões falsos.
- Migrations antigas “não aplicadas”: há atualizações posteriores de implantação no handoff. Sem comparar schema atual, não afirmar ausência em produção.

## Validação e próximos critérios de aceite

Esta entrega conclui o inventário e diagnóstico inicial de completude, com verificação aprofundada dos achados listados, não uma homologação integral de todos os módulos. A listagem de caminhos e overlays está no arquivo complementar `AUDITORIA_INVENTARIO_ROTAS_MODAIS_2026-10-29.md`.

Antes de considerar cada módulo completo: validar caminho principal e recuperação de erro; executar permissões reais em ambiente isolado; verificar integrações necessárias; inspecionar desktop/tablet/mobile, zoom e teclado; registrar evidências antes/depois. Testes sintéticos anteriores não substituem esses itens.

Nenhuma funcionalidade foi alterada, nenhuma migration aplicada e nenhum deploy realizado nesta auditoria. Foram criados somente estes registros de diagnóstico.
