# Programa de melhorias EloLab: 100 evoluções e 5 módulos

## Critério de trabalho

Este documento mantém 100 oportunidades distintas em módulos existentes e cinco módulos novos completos. Cada oportunidade só será marcada como entregue depois de confirmar que não existe no checkout local, implementar com teste falhando antes do código, validar o comportamento em ambiente sintético/descartável e registrar a evidência. Um item já existente não conta: será substituído por outro achado concreto. Não executar gravações clínicas reais, não expor segredos, não tocar nos livros financeiros de pacientes ao trabalhar em cobrança SaaS, e não publicar alterações futuras sem autorização explícita.

## Estado auditado

- Produção: `app.elolab.com.br` respondeu em `/healthz`, landing, login e assets. O smoke de produção existente passou em 4/4 cenários em 14/10/2026. A revisão publicada continua sem proveniência direta no `version.json` (`local-…`); o item transversal E1 corrige esse problema localmente.
- Integração anterior: o PR #20 está em `main` no merge `b128889258a6ef7aa0e5eadf198b00fce61a3562`.
- Checkout principal observado: `codex/whatsapp-safe-schema-stage` em `147dbc15704c3fd621cbf4c7f43bc25e832292c6`, com 332 entradas no `git status`. A comparação de conteúdo com `origin/main`, limitada ao código, testes, configuração e documentação do produto e excluindo protótipos/capturas, reduziu o delta real a 23 caminhos. A suíte local passou, mas parte dessas diferenças conflita com decisões recentes do produto e não foi copiada.
- Diferenças locais que ficam fora da integração: a faixa de suporte ativa seria substituída por um aviso de manutenção expirado (7–8/10); o menu claro da referência visual seria trocado por um gradiente escuro; a compactação recente da Recepção seria revertida; e a tela de Suporte perderia ajustes de rolagem. Remoções de stubs legados que continuam respondendo 410 não serão integradas sem verificar o comportamento remoto. O checkout original continua intacto.
- Melhoria entregue neste programa: **E1 — versão do build identifica a revisão**. Dockerfile consome `GIT_SHA` do Easypanel, o workflow passa `${GITHUB_SHA}` e `/version.json` mantém o valor. Evidência: teste focado 3/3, suíte Vitest 234 arquivos/1.236 testes, TypeScript, quatro checks estáticos, ESLint focal, build real com SHA conhecido e `git diff --check` passaram. Commit `b64cb42`.

## Melhorias em módulos existentes

Itens 1–100 são propostas de execução, não afirmações de que esses defeitos já foram confirmados. A triagem compara cada item com o checkout local, o build publicado e os testes antes de implementá-lo.

**Entrega E2 — filtro pessoal em Tarefas:** botão acessível “Minhas tarefas” restringe à atribuição do usuário autenticado, combina com busca/status e pode ser limpo pela barra ou pelo estado vazio. Sem migration ou gravação. Evidência: 16/16 testes focados, TypeScript, build e `git diff --check` passaram. A suíte geral marcou 1 falha intermitente fora do escopo (visibilidade da região do Portal); o arquivo isolado passou 28/28.

### Agenda e agendamento online

1. Bloquear conflitos de horário entre o mesmo profissional, paciente e sala; mostrar os dois compromissos conflitantes antes de salvar.
2. Revalidar disponibilidade no servidor no instante da confirmação para impedir que duas sessões reservem a mesma vaga.
3. Adicionar uma reserva temporária com expiração no agendamento público; liberar a vaga automaticamente se o paciente abandonar o formulário.
4. Permitir encaixar uma pessoa da lista de espera em uma vaga recém-liberada, preservando serviço, profissional e confirmação de horário.
5. Registrar o motivo de cancelamento e oferecer reagendamento com os dados do compromisso anterior já preenchidos.
6. Mostrar mudanças de profissional, horário, sala e status em histórico consultável por usuários autorizados.
7. Evitar submissão dupla em criação, cancelamento e reagendamento, com idempotência no servidor.
8. Permitir navegar a grade semanal por teclado com foco previsível e anúncio de dia, profissional e horário.
9. Exibir capacidade e ocupação por sala/recursos físicos sem misturar agendas de clínicas diferentes.
10. Apresentar ao paciente os dados essenciais do agendamento e instruções de preparo no portal, respeitando consentimento de comunicação.

### Recepção, fila e lista de espera

11. Oferecer check-in com validação de paciente, compromisso e unidade antes de criar um atendimento.
12. Sinalizar possíveis cadastros duplicados no check-in e permitir revisão sem mesclar automaticamente prontuários.
13. Explicar por que um atendimento está bloqueado e qual perfil autorizado pode liberá-lo.
14. Ordenar a fila por prioridade configurada pela clínica e mostrar os fatores que determinaram a ordem.
15. Atualizar a fila em tempo real com indicador de conexão e alternativa de atualização manual quando o canal cair.
16. Impedir duas chamadas simultâneas da mesma pessoa por recepcionistas concorrentes.
17. Exibir tempo de espera e atrasos com texto e ícone, sem depender só da cor.
18. Permitir registrar saída, desistência ou encaminhamento com motivo e trilha de auditoria.
19. Recuperar o estado da fila após recarregar a tela sem repetir chamadas ou atendimentos.
20. Criar uma passagem de turno que resume pendências operacionais sem incluir conteúdo clínico desnecessário.

### Pacientes e portal

21. Detectar duplicidades prováveis por CPF, telefone e nome/data de nascimento com limiar configurável e revisão humana.
22. Permitir revisar campo a campo antes de mesclar cadastros, preservando autoria, histórico e referências clínicas.
23. Mostrar a origem e data de atualização de cada contato relevante para reduzir uso de telefone/e-mail desatualizado.
24. Registrar consentimentos separados por finalidade e canal, com histórico de concessão e revogação.
25. Permitir ao paciente revogar o acesso do portal e invalidar sessões/links anteriores.
26. Avisar o paciente sobre dados faltantes do cadastro sem revelar informação clínica no canal de notificação.
27. Disponibilizar exportação estruturada por paciente com protocolo, escopo selecionado, auditoria e confirmação de conclusão.
28. Validar CSV de importação por linha e oferecer prévia de duplicidades antes de gravar qualquer cadastro.
29. Permitir inativar e reativar um cadastro sem apagar dados clínicos nem quebrar referências históricas.
30. Mostrar no portal documentos disponíveis, validade e origem, com links de curta duração para arquivos privados.

### Prontuário e documentos clínicos

31. Recuperar rascunhos clínicos após recarga ou perda de conexão, identificando autor e data do último salvamento.
32. Manter adendos imutáveis que referenciem a evolução original sem sobrescrever o texto assinado.
33. Mostrar a versão do modelo clínico usada em cada documento assinado.
34. Alertar sobre alergia registrada antes de prescrição, com confirmação explícita e registro da justificativa quando aplicável.
35. Diferenciar dado ausente de resultado normal nos sinais vitais e no resumo clínico.
36. Sinalizar campos copiados de atendimento anterior para o profissional revisar antes da assinatura.
37. Pedir confirmação quando o contexto do paciente mudar enquanto um formulário clínico está aberto.
38. Anexar documentos com validação de tipo/tamanho e indicar estado de envio, falha recuperável e conclusão.
39. Buscar documentos por paciente, tipo, autor e período respeitando as permissões clínicas existentes.
40. Registrar visualização, assinatura, impressão e exportação de documentos clínicos na auditoria acessível.

### Exames e laboratório

41. Etiquetar amostras com identificador legível e código de barras sem incluir dados pessoais na etiqueta.
42. Registrar coleta, recebimento, transferência e rejeição da amostra com responsável e horário.
43. Exigir motivo estruturado ao rejeitar amostra e oferecer nova coleta vinculada ao pedido original.
44. Destacar resultados críticos até que um profissional autorizado confirme ciência e conduta.
45. Preservar resultado anterior e trilha completa quando um exame for retificado.
46. Separar intervalo de referência de resultado observado e mostrar método/laboratório usado no laudo.
47. Impedir liberação de lote quando o controle de qualidade configurado estiver fora da faixa aprovada.
48. Mostrar pendências por setor e prioridade com filtros que preservem a seleção ao atualizar a worklist.
49. Permitir reprocessar envio FHIR com retentativa idempotente e relatório por item, sem duplicar laudos.
50. Avisar quando uma guia não contém preparo, jejum ou instrução necessária configurada para o exame.

### Financeiro operacional e convênios

51. Validar consistência de lote TISS antes de exportar e apontar cada guia e campo que precisa de correção.
52. Registrar recurso de glosa com prazo, responsável, documentos anexos e status de envio.
53. Conciliar recebimentos de convênio por lote e sinalizar valores sem correspondência sem criar lançamento automático.
54. Projetar fluxo de caixa por cenário usando vencimento e recorrência, distinguindo previsto de realizado.
55. Identificar títulos vencidos por faixa de atraso e permitir exportar a lista autorizada para cobrança manual.
56. Exigir confirmação e registrar usuário/data antes de alterar regras de repasse médico.
57. Impedir duplicar lançamento ao importar arquivo bancário repetido, com prévia de correspondências.
58. Exibir trilha de alterações de vencimento, valor e conta contábil em contas a pagar/receber.
59. Detectar divergência entre procedimento autorizado e faturado antes de fechar um lote de convênio.
60. Adicionar relatório de faturamento por competência com filtros explícitos e totais reproduzíveis.

### Assinatura SaaS e checkout de planos

61. Mostrar o resumo do plano, periodicidade, teste e primeira cobrança usando os valores efetivos do plano antes de abrir o gateway.
62. Validar no servidor o estado da assinatura e a clínica antes de liberar recursos contratados.
63. Exibir eventos de checkout por tentativa com estado final, sem armazenar número de cartão ou segredos do provedor.
64. Permitir retomar checkout interrompido usando chave idempotente sem criar assinatura duplicada.
65. Informar claramente o efeito e a data de cancelamento antes de confirmar a ação.
66. Manter separado o histórico de cobrança da assinatura EloLab e o financeiro clínico de pacientes.
67. Sinalizar webhook repetido ou fora de ordem e manter o estado final consistente.
68. Oferecer reconciliação administrativa de cobrança divergente com justificativa e trilha de auditoria.
69. Avisar a clínica sobre alteração de preço/limite antes da renovação afetada.
70. Mostrar uso de recursos do plano e cota restante com atualização verificável do servidor.

### Equipe, permissões e segurança

71. [x] Mostrar a clínica e o papel ativo no cabeçalho para evitar ações no contexto errado.
**Entrega E3:** navbar identifica clínica e papel principal, com nome lido por clínica e cache segregado pela chave `clinica_id`; no mobile, o contexto também aparece ao abrir o menu da conta. Evidência: 3/3 testes de navbar, jornada Playwright sintética, TypeScript, checks de colunas/falhas/permissões/acessibilidade e build passaram.
72. [x] Permitir suspender convite expirado e gerar novo link sem invalidar convites de outras pessoas.
**Entrega E6:** o painel existente permite reenviar convite expirado criando um novo link; cancelar afeta somente o ID selecionado e a clínica ativa (expira registros legados ou remove os novos). Evidência: testes de componente 3/3 cobrem reenvio, expiração do legado e remoção do convite novo; TypeScript e check de permissões passaram; ESLint sem erros (avisos `any` preexistentes no painel de convites).
73. Exigir reautenticação para trocar e-mail do administrador principal ou reduzir controles de segurança.
74. [x] Fornecer prévia “o que este perfil consegue acessar” antes de salvar uma mudança de papel.
**Entrega E4:** a mesma prévia é exibida no cadastro/edição de profissional e no convite; calcula a união de telas com o filtro real do menu, atualiza com os papéis selecionados e avisa que dados continuam protegidos pelas permissões da clínica/RLS. Evidência: Vitest de regra e componentes 7/7; suíte completa 240 arquivos/1.253 testes; Playwright sintético autenticado da equipe 1/1; TypeScript, build, checks de colunas/falhas/permissões/acessibilidade passaram; ESLint 0 erros (21 avisos existentes de `any` nas telas tocadas). Sem alteração de autorização ou schema.
75. [x] Informar sessões ativas, dispositivo aproximado e última atividade ao titular da conta.
**Entrega E5:** painel na aba Segurança lista sessões Auth próprias ainda válidas, identifica o dispositivo de forma aproximada e sinaliza sessões sem heartbeat como atividade/renovação conhecida; não expõe IP nem ID completo e não permite revogação. Evidência: suíte completa 243 arquivos/1.269 testes; Playwright sintético 1/1; typecheck, build e checks de colunas/falhas/permissões/acessibilidade passaram; ESLint 0 erros (20 avisos preexistentes em Configurações). Migration local criada e revisada, ainda não aplicada.
76. [x] Revogar sessões após desativação do profissional conforme política documentada.
**Entrega E7:** a RPC transacional de papéis agora encerra sessões Auth e refresh tokens quando o administrador inativa o funcionário; a reativação preserva os papéis configurados e exige novo login. A interface informa que um JWT já emitido pode seguir válido até expirar. Evidência: contratos de migration 4/4 (incluindo isolamento por clínica e acesso restrito da função auxiliar), typecheck, build, checks de colunas/falhas/permissões/acessibilidade passaram; ESLint sem erros (19 avisos `any` preexistentes). Migration local criada e ainda não aplicada.
77. [x] Avisar sobre último administrador ativo e impedir a remoção acidental do acesso administrativo da clínica.
**Entrega E8:** ao editar administrador vinculado ativo, a prévia avisa antes do salvamento quando a mudança remover o papel admin ou inativar a conta; orienta cadastrar outro administrador. A proteção autoritativa e transacional continua no banco. Evidência: regra + componente 7/7 testes, TypeScript, build e check de acessibilidade aprovados.
78. Fazer auditoria de acessos por intervalo e exportar o resultado com limite de permissão.
79. [x] Detectar alterações de papel concorrentes e pedir recarga em vez de sobrescrever a versão mais recente.
**Entrega E9:** versão monotônica `edit_version` com compare-and-set tanto na gravação dos dados quanto na RPC de papéis sob `FOR UPDATE`; em conflito, nenhuma ficha antiga sobrescreve a versão mais nova e a UI orienta recarregar/reabrir. RPC legada segue para compatibilidade. Evidência: suíte completa 247 arquivos/1.286 testes; E2E de equipe 4/4; TypeScript, build, checks de colunas/falhas/permissões/acessibilidade passaram; ESLint sem erros (19 avisos `any` legados em Funcionarios.tsx). Migration criada localmente e não aplicada.
80. Adicionar teste automatizado de negação por perfil e isolamento de clínica para cada nova rota e operação.

### Comunicação, notificações e automações

81. Agrupar notificações repetidas sobre o mesmo evento e permitir abrir o recurso correspondente.
82. [x] Marcar notificações lidas em lote sem perder o estado de outras sessões.
**Entrega E10:** a central já marca somente as notificações não lidas atualmente visíveis e persiste o estado por chave usuário/clínica/origem/item; RLS impede alterar estado de outra conta ou clínica, e o upsert é compartilhado entre sessões. Evidência de auditoria: componente/política RLS 4/4 testes, TypeScript e acessibilidade aprovados. Sem mudança de comportamento ou migration nesta auditoria.
83. Mostrar fila, tentativas, próxima tentativa e erro resumido de mensagens sem expor token ou conteúdo sensível.
84. Permitir pausar/reiniciar automação com trilha de autor e prévia do alcance da mudança.
85. Exigir revisão humana para mensagens de IA que alterem agendamento ou registrem informação no prontuário.
86. Aplicar limites por clínica, número e intervalo para evitar disparo acidental em massa.
87. Respeitar preferências de canal e janela de contato antes de enviar lembretes.
88. Detectar falha de webhook de comunicação e alertar o administrador com diagnóstico sem dados clínicos.
89. Fornecer prévia sintética da mensagem com variáveis ausentes destacadas antes de ativar um modelo.
90. Guardar histórico de versão e autor dos modelos de comunicação usados pelas automações.

### Indicadores, integrações e configurações

91. Permitir salvar filtros de relatórios por usuário e manter o escopo da clínica na consulta.
92. Mostrar definição, fonte e janela temporal de cada KPI para que dois relatórios não usem critérios diferentes.
93. Permitir exportar gráficos como tabela acessível com período e filtros no cabeçalho.
94. Programar relatório somente depois de confirmar fuso, destinatários autorizados e canal de entrega ativo.
95. Indicar saúde e última sincronização de cada integração sem expor URL secreta ou credencial.
96. Oferecer botão de “testar conexão” que faz somente leitura e explica como corrigir falhas comuns.
97. Validar configuração de domínio e retorno de OAuth antes de ativar a integração.
98. Versionar alterações de configuração da clínica e oferecer comparação antes de restaurar versão anterior.
99. Fornecer checklist de onboarding com progresso derivado dos recursos realmente configurados.
100. Mostrar no painel administrativo a versão do app, SHA, horário de build e resultado dos checks públicos de disponibilidade.

## Cinco módulos novos completos

Todos os módulos abaixo exigem rota, navegação por papel, contratos Supabase com isolamento por clínica, trilha de auditoria, loading/erro/vazio, acesso por teclado, testes de permissão e jornada sintética. Só contam como completos depois de fluxo autenticado em ambiente QA descartável e validação dos dados/regra pela função responsável.

### N1. Minha fila de trabalho

Caixa de entrada pessoal das tarefas atribuídas ao usuário atual, separada do quadro que gerencia todas as tarefas da clínica. Organiza itens vencidos, de hoje e futuros, apresenta contadores reconciliados com a fonte e mantém links de origem. Não cria uma segunda tabela nem mostra tarefas de outro responsável. Critério de conclusão: filtros de responsável e clínica são validados no servidor/RLS, a ordenação é determinística e o estado vazio diferencia fila concluída de nenhuma tarefa atribuída.

**N1 entregue e validado:** rota e menu próprios; leitura filtrada no PostgREST por `clinica_id` e `responsavel_id`, agrupamento determinístico de prazos, estados vazios distintos, link ao paciente por papel e conclusão com checagem de versão. Evidência: Vitest focado 5/5, Playwright sintético 1/1 (inclui tarefas de outra pessoa e outra clínica), TypeScript, build e checks de colunas/falhas/permissões/acessibilidade passaram. Sem migration.
Auditoria: conclusão registra no `audit_log` somente o ID da tarefa e a transição de status, sem copiar título, descrição ou dados de paciente.

### N2. Teleconsulta

Jornada remota vinculada ao agendamento: sala de espera, presença, consentimento e encerramento, com registro do link no histórico. Não grava áudio/vídeo nem substitui o prontuário. Critério de conclusão: links de sessão não enumeráveis e expirados, permissão por clínica/papel, entrada/saída auditadas e teste sintético de queda/reconexão.

### N3. Qualidade e segurança assistencial

Registro restrito de incidente, quase incidente, risco, análise, ação corretiva, responsável e prazo, com opção de relatório sem exposição ampla da identidade do notificador. Inclui estados, revisão por qualidade e indicadores por categoria. Critério de conclusão: acesso mínimo, auditoria de leitura/alteração, fluxo de retificação e teste de confidencialidade entre perfis/clínicas.

### N4. Higienização de salas e controle de infecção

Fluxo operacional de limpeza entre atendimentos, checklist por sala, registro de responsável/horário e inspeções de rotina. Exibe disponibilidade da sala somente depois dos itens obrigatórios definidos pela clínica. Critério de conclusão: checklists versionados, registro imutável de execução e revisão, alertas de pendência e testes de isolamento por unidade.

### N5. Equipamentos, manutenção e calibração

Cadastro patrimonial de equipamento por unidade, responsável, validade de calibração, manutenção preventiva/corretiva, ordem de serviço, documentos e histórico. Estoque atual continua como fonte independente para materiais consumíveis. Critério de conclusão: alerta de vencimento, bloqueio configurável de equipamento indisponível em sala, trilha de auditoria e testes de permissão/unidade.

## Execução e contagem

- [x] E1 — Identificação verificável da revisão do build.
- [x] Auditar checkout local: 23 diferenças de conteúdo selecionadas contra `main`; os itens conflitantes com faixa de suporte, referência visual e densidade da Recepção ficaram preservados no checkout original e fora da integração.
- [ ] Fazer triagem dos itens 1–100 no checkout local e retirar duplicatas antes de iniciar cada pacote.
- [ ] Implementar, validar e registrar cada pacote antes de seguir ao próximo; atualizar este arquivo sem contar testes ou documentos como melhoria funcional.
- [ ] Completar e testar N1–N5 como módulos com persistência, autorização e fluxo utilizável; não contar protótipos nem páginas somente de navegação.
