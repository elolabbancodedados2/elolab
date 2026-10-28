# Implantação

Data: 27/10/2026. Autor: `sales-customer-success`.

Vale para clínicas pequenas e médias, o único segmento com caminho aberto (beta fechado depois do gate de estabilização; `docs/estrategia/DIAGNOSTICO_16_FUNCOES.md`, seções F.6 e G). Laboratório, rede e odonto só como piloto acordado com o `product-manager`.

## 1. Pré-requisitos antes de começar

| Item | Responsável | Situação |
|---|---|---|
| Os cinco P0 fechados (CLIN-QA-001 a 005) | Time de engenharia e segurança | Aberto |
| Contrato de beta e DPA (a EloLab como operadora de dados) | Responsável comercial | Requer avaliação especializada (jurídica) |
| Expectativas registradas por escrito: sem TISS XML, sem ICP-Brasil, sem código de barras, sem NFS-e | CS | Ver `objecoes.md` |
| Plano contratado: Pro ou Ultra; Ultra só se for usar o WhatsApp | Cliente | — |

## 2. Cronograma

| Etapa | Quando | O que acontece | Saída |
|---|---|---|---|
| Kickoff | Semana 0 | Reunião de 45 min com o dono e o responsável pela recepção. Revisar o checklist da seção 3, definir a data do go-live e pedir as planilhas de exportação | Checklist preenchido e data marcada |
| Configuração | Semana 0–1 | O admin da clínica conclui o onboarding (`/onboarding`), com apoio do CS | Onboarding a 100% |
| Importação | Semana 1 | Teste com amostra anonimizada e depois a base completa (seção 4) | Relatório de importação |
| Treinamento | Semana 1–2 | Sessões por perfil (seção 5) | Lista de presença e tarefas concluídas |
| Go-live | Dia D | CS acompanha a primeira manhã, remoto ou presencial | Primeiro check-in real registrado |
| Revisão D+7 | 7 dias | Conferir o critério de ativação (seção 6) e os chamados abertos | Ativado ou plano de ação |
| Revisão D+30 | 30 dias | Saúde do cliente e NPS (`saude-do-cliente.md`) | Faixa de saúde registrada |

## 3. Checklist de configuração

Os itens marcados com (O) são os passos que o onboarding do sistema verifica sozinho (`src/pages/OnboardingClinica.tsx:17,27-53`, RPC `clinic_onboarding_overview`).

**Clínica e acesso**
- [ ] Dados da clínica e horário de funcionamento em Configurações (O, "Configure os horários")
- [ ] Equipe convidada, cada pessoa com o perfil certo: admin, recepção, médico, enfermagem, financeiro (O, "Monte sua equipe", em `/equipe`)
- [ ] Disponibilidade semanal de cada profissional (O)
- [ ] MFA ativado para os administradores (`src/components/MFASetupDialog.tsx`). O MFA hoje só é exigido na tela, não na API (CLIN-QA-007); recomende mesmo assim
- [ ] Usuário que aceita convite não pode estar vinculado a outra clínica (CLIN-QA-008). Confirme antes de convidar quem trabalha em duas clínicas

**Serviços e financeiro**
- [ ] Tipos de consulta com duração e preço (O, "Cadastre seus serviços", em `/precos-servicos?tab=tipos`). Sem tipo com preço, o check-in não gera cobrança
- [ ] Pelo menos um tipo gratuito para retorno, se a clínica usar
- [ ] Convênios cadastrados, se atender convênio (`/convenios`)
- [ ] Regras de repasse por médico, se houver (`/repasses-medicos`). Só depois de confirmar que as migrations de 24/10 estão aplicadas (CLIN-QA-006)
- [ ] Caixa: quem abre e quem fecha, e se a recepção recebe pagamentos

**Clínico**
- [ ] Templates de documentos clínicos revisados pelo médico responsável (`/todos-templates`). O sistema não gera conduta clínica
- [ ] Combinar com os médicos que a assinatura é eletrônica simples, não ICP (`objecoes.md`, seção 2)
- [ ] Exames e laboratório, só no plano Pro e se fizer parte do escopo acordado

**Comunicação**
- [ ] WhatsApp, só no plano Ultra (O, opcional, `/agente-ia`). Explicar o risco de bloqueio do número. Manter o agendamento automático desligado até o CLIN-QA-003 fechar
- [ ] Link de agendamento público (`/agendar/:clinicaId`): não divulgar até o CLIN-QA-003 fechar
- [ ] Portal do paciente: não emitir links até o CLIN-QA-001 fechar

**Primeiro uso**
- [ ] Primeiro agendamento real criado (O, "Crie a primeira agenda")

## 4. Importação de pacientes e agenda

Ferramenta: Configurações → "Trazer dados de outro sistema" (`src/components/importacao/ImportadorDePlanilha.tsx`; `src/pages/Configuracoes.tsx:1215`). Aceita .csv, .xlsx, .xls e .txt com cabeçalho na primeira linha (`ImportadorDePlanilha.tsx:206-219`).

**Ordem obrigatória:** primeiro pacientes, depois agenda. Uma linha de agenda cujo paciente não existe é recusada (`ImportadorDePlanilha.tsx:195-203`; `src/lib/importacao/campos.ts:232-241`).

### 4.1 Passo a passo

1. **Pedir a exportação ao cliente.** Pacientes ativos e agenda a partir do dia do go-live. Quais colunas cada concorrente exporta: NÃO VERIFICADO. Peça um arquivo de exemplo com no máximo 20 linhas, com nomes e documentos substituídos por dados fictícios pelo próprio cliente.
2. **Ensaiar com a amostra.** Rodar a importação numa clínica de teste, não na conta do cliente. Conferir a correspondência das colunas.
3. **Importar pacientes na conta do cliente.** Quem executa é o admin da clínica, com o CS acompanhando por tela compartilhada. O CS não manipula a planilha real do cliente nem a guarda.
4. **Conferir a prévia** (`ImportadorDePlanilha.tsx:280-320`): "vão entrar", "já cadastrados", "com erro", "com aviso". Se mais de 5% das linhas tiverem erro, parar e corrigir na origem.
5. **Baixar as recusadas** (`:139-147`), corrigir e subir de novo. Quem já entrou não duplica, porque é reconhecido pelo CPF (`:397-400`).
6. **Importar a agenda.** Na prévia, conferir quantas linhas ficaram sem profissional definido (`:365-371`). Situação desconhecida entra como "agendado" (`campos.ts:283-293`).
7. **Conferência final** com a recepção: abrir a agenda do primeiro dia e comparar com o sistema antigo.

### 4.2 Campos aceitos

| Tipo | Obrigatórios | Opcionais | Validações |
|---|---|---|---|
| Pacientes | Nome | CPF, nascimento, telefone, e-mail, sexo, CEP, endereço, número, complemento, bairro, cidade, UF, responsável, CPF do responsável, carteirinha, observações | CPF com dígito verificador; telefone com 10 ou 11 dígitos; CEP com 8; UF válida; data em dd/mm/aaaa, aaaa-mm-dd ou número de série do Excel (`campos.ts:79-115,122-224`) |
| Agenda | Paciente, data, hora | CPF, nascimento, profissional, tipo, situação, observações | Hora em 14:30, 14h30, 1430 ou fração do Excel (`campos.ts:244-274`) |

### 4.3 O que não é importado

Histórico de prontuário, anexos, prescrições, resultados de exame, preços, convênios e financeiro. Para esses:
- **Preços e convênios:** cadastro manual no checklist (seção 3).
- **Histórico clínico:** fica no sistema antigo. Recomende ao cliente manter acesso de leitura pelo prazo de guarda. Requer avaliação especializada (jurídica).
- **Saldo financeiro em aberto:** lançar manualmente em contas a receber só o que estiver em aberto.

Pedido ao `product-manager`: modelo de planilha para download e importação de preços (seção 6 de `saude-do-cliente.md`).

## 5. Treinamento por perfil

Formato: sessões de 45 min por perfil, na clínica de demonstração com dados sintéticos, com no máximo 6 pessoas. Cada participante faz as tarefas com as próprias mãos. Material de apoio dentro do sistema: trilhas em `/treinamento`, com progresso por usuário (`src/pages/Treinamento.tsx:21-54`, tabela `user_training_progress`, `:86`). A documentação em `/documentacao` é restrita à plataforma (`src/App.tsx:321`) e não serve como base de conhecimento do cliente.

| Perfil | Tarefas da sessão (mesmas da pesquisa de UX) | Trilha em `/treinamento` | Pontos de atenção |
|---|---|---|---|
| Recepção | Check-in de paciente agendado; encaixe; remarcar para outro médico; receber pagamento dividido; atualizar telefone e convênio | "Agenda e chegada do paciente" (`Treinamento.tsx:26-29`) | Pesquisar antes de cadastrar para não duplicar; conferir o nome e a data de nascimento antes de receber (CLIN-QA-012) |
| Médico | Chamar o próximo da fila; evolução com CID-10; atestado e assinatura; consultar alergias e últimas consultas; agendar retorno | "Fluxo clínico responsável" (`:31-34`) | Confirmar o paciente antes de registrar: na edição, o nome aparece pequeno e sem nascimento (CLIN-QA-012); assinatura não é ICP; o verificador de interações cobre poucos pares (CLIN-QA-021) |
| Enfermagem | Triagem e sinais vitais; mapa de coleta; recoleta | "Fluxo clínico responsável"; "Pedido, coleta e laudo" (`:41-44`) | Etiqueta sem código de barras: conferir paciente e tubo pela leitura |
| Financeiro | Abrir caixa; lançar venda; estornar; fechar com diferença; localizar pendência; repasse | "Rotina financeira confiável" (`:36-39`); "Convênios, lotes e glosas" (`:46-49`); "Fechamento de repasses médicos" (`:51-54`) | O XML de convênio é resumo operacional e não substitui o envio pela operadora (`:48`) |
| Admin ou dono | Convidar profissional; cadastrar tipo de consulta e preço; ver ocupação da semana; ver faturamento do mês; abrir chamado | "Comece o dia com segurança" (`:21-24`) | Abrir chamados em `/suporte`, não por mensagem pessoal, para que o prazo seja medido |

Registro: lista de presença por perfil e, para cada tarefa, "concluiu sem ajuda", "concluiu com ajuda" ou "não concluiu". As tarefas não concluídas vão para o feedback de produto.

## 6. Critério de ativação concluída

Uma clínica está **ativada** quando, em até 7 dias depois do go-live:

1. O onboarding está em 100% nos passos obrigatórios: equipe, horários, serviços e primeira agenda (o WhatsApp é opcional) (`OnboardingClinica.tsx:17,27-53`);
2. Registrou pelo menos 1 check-in de paciente real na Recepção;
3. Registrou pelo menos 1 recebimento no caixa ou em contas a receber; e
4. Pelo menos 1 médico salvou um prontuário.

Os itens 1 e 2 seguem a definição de ativação do `growth-marketing` (`docs/estrategia/funcoes/04-ux-gtm.md`, seção 5). Os itens 3 e 4 são acréscimo do CS para garantir que os três perfis principais usaram o sistema; precisam ser alinhados com o `growth-marketing` antes de virar evento.

**Como medir hoje:** o item 1 vem de `clinic_onboarding_overview`. Os itens 2 a 4 não têm evento nem painel. O CRM mostra só o total de agendamentos e a última atividade (`src/pages/PlatformCRM.tsx:48-53`). Até existirem os eventos (`first_checkin_done`, `activated`; CLIN-QA-016), o CS confere na revisão D+7 com o admin da clínica, por tela compartilhada.

**Se não ativar em 7 dias:** ligação com o admin, identificar o bloqueio (configuração, importação, treinamento ou produto), nova data em até 7 dias e registro no CRM. Duas tentativas sem ativação colocam a clínica na faixa vermelha de saúde (`saude-do-cliente.md`).
