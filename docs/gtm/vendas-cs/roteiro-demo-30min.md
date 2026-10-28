# Roteiro de demonstração de 30 minutos por segmento

Data: 27/10/2026. Autor: `sales-customer-success`. Base: worktree `admin-finance-realtime`, branch `feat/recepcao-painel-dia-melhorias`, com alterações locais não commitadas.

## Regras para quem vai demonstrar

1. **Mostre só o que está na coluna "Pode mostrar".** Cada item cita o arquivo que comprova que a tela existe. Existir no código não é o mesmo que funcionar em produção: nenhuma jornada foi executada de ponta a ponta (`docs/estrategia/DIAGNOSTICO_16_FUNCOES.md`, seção C). Antes de usar este roteiro com cliente, ensaie cada bloco no ambiente de demonstração e marque PASSOU ou FALHOU na tabela de ensaio (final do documento).
2. **Use só dados sintéticos.** A demonstração acontece numa clínica criada para isso (especificação na seção 6). Nunca abra a conta de um cliente real, nem com permissão.
3. **Não prometa prazo.** Quando o cliente perguntar por algo da coluna "Não mostrar", use a resposta de `objecoes.md`. Se o item estiver no roadmap, diga em que fase ele está (`DIAGNOSTICO_16_FUNCOES.md`, seção F), sem dar data.
4. **Situação comercial atual:** o veredito é NO-GO para escala e para redes, laboratório e odonto. Há GO CONDICIONAL para um beta fechado com 3 a 5 clínicas pequenas, depois que os cinco P0 forem fechados (`DIAGNOSTICO_16_FUNCOES.md`, seção G). Até lá, a demonstração serve para descoberta e para formar a lista do beta. Não serve para fechar contrato de produção.

## 1. O que existe e pode ser mostrado

| Bloco | Pode mostrar | Evidência no código | Cuidado na fala |
|---|---|---|---|
| Agenda | Visões diária com vários profissionais, semanal e mensal; bloqueio de horário; cores por profissional | `src/components/agenda/AgendaPage.tsx`; `views/DailyMultiDoctorView.tsx`, `WeeklyView.tsx`, `MonthlyView.tsx`; `BloqueioAgenda.tsx`; rota `src/App.tsx:258` | O banco impede dois agendamentos no mesmo horário para o mesmo profissional (diagnóstico, seção C, "Marcar (interno)"). A navegação por teclado ainda é limitada (CLIN-QA-017) |
| Recepção | Painel do dia por etapa, check-in que encaminha à fila e gera a cobrança a partir do tipo de consulta, encaixe | `src/pages/Recepcao.tsx`; `src/lib/checkinWithBilling.ts:16-40`; rota `App.tsx:293` | Não diga que check-in e cobrança são "uma única transação". O próprio código diz que são operações separadas, com desfazimento parcial (`checkinWithBilling.ts:11-14`). Diga: "o check-in já cria a cobrança, então não fica atendimento sem lançamento" |
| Fila | Chamada do próximo paciente, visível também ao médico | `App.tsx:278` (comentário `:273-277`) | — |
| Prontuário | Evolução com busca de CID-10, alergias, anexos, adendos, linha do tempo do paciente, sinais vitais | `src/pages/Prontuarios.tsx`; `src/components/clinical/Cid10Search.tsx`, `AllergyAlert.tsx`, `AnexosProntuario.tsx`, `ProntuarioAdendos.tsx`, `PatientTimeline.tsx`, `VitalSignsChart.tsx` | Na edição, o nome do paciente aparece pequeno e sem data de nascimento (CLIN-QA-012). Na demonstração, confirme o paciente em voz alta antes de registrar |
| Assinatura do prontuário | Assinatura eletrônica simples: bloqueia a edição e grava profissional, CRM, data e hash; verificação pública por código | `src/components/clinical/DigitalSignature.tsx:193,209-212`; rota pública `/verificar-assinatura/:codigo` (`App.tsx:235`) | **Não é ICP-Brasil.** Fale "assinatura eletrônica com verificação de integridade" |
| Documentos clínicos | Prescrição, atestado e encaminhamento na mesma tela | `App.tsx:261-266` (`/documentos-clinicos`) | A prescrição pela Memed está só em homologação (`supabase/functions/memed-prescription/index.ts:46,53`). Não demonstre a Memed |
| Retornos | Lista de retornos a agendar | `App.tsx:267` | — |
| Caixa | Abrir, fechar e reabrir caixa; receber na recepção | `src/pages/CaixaDiario.tsx:652,681,729`; `/caixa` redireciona para `/recepcao?tab=caixa` (`App.tsx:294`) | O diálogo de pagamento não mostra o nome do paciente em destaque (CLIN-QA-012). Leia a descrição antes de confirmar |
| Financeiro | Contas a receber e a pagar, fluxo de caixa, cobrança de inadimplentes, repasse médico (regra fixa ou percentual) | `App.tsx:296-311`; `src/pages/RepassesMedicos.tsx` | O repasse depende de migrations de 24/10 que não foram aplicadas em produção (CLIN-QA-006). Só mostre se o ensaio passar |
| Convênios | Cadastro de convênio, lotes, registro de glosa e de recurso | `src/pages/FaturamentoConvenios.tsx:31-39`; `App.tsx:285-286` | **Não gera TISS de transmissão.** A tela avisa isso (`FaturamentoConvenios.tsx:335`) e pede que o envio seja feito no portal da operadora (`:409`). Mostre como controle administrativo |
| Laboratório | Pedido, mapa de coleta, resultado com validação e liberação, laudos | `App.tsx:264,268-271`; `src/pages/LaudosLab.tsx:119-121`; `src/pages/MapaColeta.tsx` | Só no plano Pro (`PlanFeatureGuard feature="exames"`). **Não há código de barras**: a etiqueta sai em texto (`MapaColeta.tsx:346-347`). O mesmo perfil pode validar e liberar (CLIN-QA-022) |
| Portal do paciente | Acesso do paciente a agendamentos e resultados | `src/pages/PortalPaciente.tsx`; `App.tsx:232` | O link de portal faz parte do P0 CLIN-QA-001. Não demonstre a criação de link até ele fechar |
| Agente de IA no WhatsApp | Sessões, agentes, conversas, resposta humana, notas internas, pedido de avaliação | `src/pages/AgenteIA.tsx:34-51,75` (plano Ultra) | **Não demonstre o agendamento pelo WhatsApp** enquanto o CLIN-QA-003 (paciente identificado pelo final do telefone) estiver aberto. Mostre só a caixa de conversas e a passagem para atendimento humano |
| Configuração inicial | Onboarding com 5 passos: equipe, horários, serviços, WhatsApp (opcional), primeira agenda | `src/pages/OnboardingClinica.tsx:27-53` | — |
| Importação | Pacientes e agenda por planilha (.csv, .xlsx, .xls), com prévia antes de gravar | `src/components/importacao/ImportadorDePlanilha.tsx:1-11,160-162`; em Configurações (`src/pages/Configuracoes.tsx:1215`) | Não importa prontuário, preços nem convênios (`src/lib/importacao/campos.ts:16-23`) |
| Suporte | Chamado com prioridade e prazo de primeira resposta | `src/pages/CentralSuporte.tsx:28-31,44`; `supabase/migrations/20260819040000_central_suporte.sql:15` | Os prazos internos (1 h, 4 h, 12 h, 24 h) ainda não são um SLA publicado (ver `saude-do-cliente.md`) |

## 2. O que não pode ser mostrado nem prometido

| Item | Situação | Evidência |
|---|---|---|
| TISS XML de transmissão | Não existe | `FaturamentoConvenios.tsx:335`; CLIN-QA-010 |
| Assinatura ICP-Brasil | Não existe | `DigitalSignature.tsx:29-32`; CLIN-QA-011 |
| Prescrição Memed em produção | Só homologação | `memed-prescription/index.ts:46-54` |
| Código de barras na etiqueta | Não existe | `MapaColeta.tsx:346-347`; CLIN-QA-013 |
| Interfaceamento com equipamentos (HL7/ASTM) | Não existe | CLIN-QA-026 |
| Multiunidade e visão consolidada de rede | Não existe | 0 ocorrências de `unidade_id`; CLIN-QA-024 |
| Odontograma e orçamento odontológico | Não existe | busca por `odontograma`, `orcamento` e `orçamento` em `src`: 0 resultados (27/10/2026) |
| NFS-e e Pix do paciente | Não existem | CLIN-QA-025 |
| Agendamento por link público e pelo WhatsApp | Existe, mas com P0 aberto | CLIN-QA-003 |
| Assistente médico por IA (`ai-medical-assistant`) | Sem tela; não oferecer | CLIN-QA-020 |
| Telemedicina | Fora do escopo do produto | `docs/time/REGRAS_DO_TIME.md:8` |

## 3. Roteiros por segmento

Estrutura comum: descoberta (5 min), operação (19 min), segmento (3 min), próximo passo (3 min). Faça as perguntas de qualificação da seção 4 durante a descoberta.

### 3.1 Clínicas pequenas e médias (2 a 15 profissionais): segmento principal

| Minuto | Bloco | Roteiro |
|---|---|---|
| 0–5 | Descoberta | Número de profissionais, sistema atual, como confirmam consultas, como fecham o caixa, se atendem convênio |
| 5–12 | Dia da recepção | Abrir a Agenda no dia com vários profissionais. Na Recepção, fazer check-in de "Ana Teste Silva" e mostrar a cobrança criada. Fazer um encaixe. Mostrar a Fila |
| 12–19 | Consulta | Pela Fila, o médico chama o paciente. Registrar evolução com CID-10, mostrar o alerta de alergia e a linha do tempo. Assinar (eletrônica simples) e mostrar a verificação pelo código. Emitir atestado. Registrar retorno |
| 19–24 | Caixa e financeiro | Receber o pagamento do check-in no caixa. Fechar o caixa. Abrir contas a receber e fluxo de caixa |
| 24–27 | Opcional | Plano Ultra: caixa de conversas do WhatsApp com passagem para humano. Se atende convênio: lote e glosa, dizendo claramente que o XML TISS não é gerado |
| 27–30 | Próximo passo | Explicar o beta (seção 5), a importação e a implantação (`implantacao.md`). Combinar data da próxima conversa |

### 3.2 Laboratórios e clínicas com posto de coleta: só piloto

Use só para descoberta e para candidatos a piloto. O gate do segmento exige código de barras, interfaceamento e segregação entre validar e liberar (`DIAGNOSTICO_16_FUNCOES.md`, F.6).

| Minuto | Bloco | Roteiro |
|---|---|---|
| 0–7 | Descoberta | Volume diário de exames, equipamentos e interfaceamento atual, como identificam a amostra, quem valida e quem libera, como entregam o laudo |
| 7–17 | Pedido e coleta | Pedido de exame a partir do atendimento. Mapa de coleta com tubos e recoleta. Mostrar que a etiqueta sai em texto |
| 17–24 | Resultado e laudo | Lançar resultado, validar, liberar e mostrar a retificação com motivo (`LaudosLab.tsx:83`). Mostrar o laudo no portal, sem criar link novo |
| 24–27 | Lacunas | Dizer o que falta: código de barras, interfaceamento, segregação de funções. Perguntar o peso de cada um na decisão |
| 27–30 | Próximo passo | Convidar para entrevista de requisitos. Não há contrato de produção para laboratório |

### 3.3 Redes multiunidade: só descoberta

Não há produto para redes: falta multiunidade, papéis por unidade, TISS, ICP e SSO. Esta conversa é uma entrevista de requisitos (CLIN-QA-034) com uma demonstração curta de uma unidade.

| Minuto | Bloco | Roteiro |
|---|---|---|
| 0–10 | Descoberta | Número de unidades, centralização do cadastro de pacientes, faturamento de convênio, relatórios consolidados, TI e SSO, processo de compra |
| 10–22 | Uma unidade | Blocos de recepção, consulta e caixa do roteiro 3.1, dizendo que cada unidade hoje seria uma conta separada |
| 22–27 | Lacunas | Multiunidade, TISS e ICP estão no roadmap como gate de redes, sem data |
| 27–30 | Próximo passo | Pedir para participar da discovery de redes |

### 3.4 Odontologia e especialidades: só descoberta

Não há odontograma nem orçamento. Demonstre o núcleo comum e colete requisitos.

| Minuto | Bloco | Roteiro |
|---|---|---|
| 0–8 | Descoberta | Como montam o plano de tratamento, como fazem orçamento, ortodontia, convênio odontológico |
| 8–22 | Núcleo | Agenda, Recepção, prontuário com anexos e Caixa, como no roteiro 3.1 |
| 22–27 | Lacunas | Dizer que odontograma e orçamento não existem |
| 27–30 | Próximo passo | Convidar para a discovery de odonto (CLIN-QA-034) |

## 4. Perguntas de qualificação

| Pergunta | Por que importa | Sinal de que não é o momento |
|---|---|---|
| Quantos profissionais e quantas unidades? | Define o segmento e o plano | Mais de uma unidade com cadastro compartilhado |
| Qual sistema usam hoje, e conseguem exportar pacientes e agenda em planilha? | Viabilidade da migração | Só exportam PDF, ou não exportam nada |
| Que parte do faturamento vem de convênio? | TISS não existe | Convênio é a maior parte e o envio precisa sair do sistema |
| Precisam de receita de controle especial ou de documento com ICP-Brasil? | ICP não existe; Memed só em homologação | Sim, todos os dias |
| Fazem coleta ou laboratório próprio? | Plano Pro; limites do módulo | Precisam de código de barras ou interfaceamento já |
| Usam WhatsApp para marcar? | Plano Ultra; risco do 003 | Querem agendamento automático pelo WhatsApp no primeiro dia |
| Quem decide e quem usa? | Treinamento por perfil | Decisor ausente da conversa |
| Quando pretendem trocar e por quê? | Prioridade | Sem dor nem prazo |
| Aceitam participar de um beta, com contrato de beta e DPA? | Gate atual | Exigem SLA contratual hoje |

## 5. Próximo passo que pode ser oferecido hoje

- **Antes do gate de estabilização:** lista de interesse para o beta e entrevista de requisitos. Sem contrato de produção.
- **Depois do gate:** beta fechado para 3 a 5 clínicas pequenas, com contrato de beta e DPA, sem promessa de TISS, ICP ou código de barras (`DIAGNOSTICO_16_FUNCOES.md`, G, condição 4). O contrato e o DPA requerem avaliação especializada (jurídica).

## 6. Especificação da clínica de demonstração (para o `product-owner`)

Hoje `/demonstracao` é estática: mostra três agendamentos fixos e não lê o banco (`src/pages/DemonstracaoClinica.tsx:7-13`). Para este roteiro funcionar, é preciso uma clínica de demonstração com dados sintéticos. Proposta de história:

**Como** vendedor, **quero** uma clínica de demonstração com dados sintéticos, que volta ao estado inicial todas as noites, **para** demonstrar recepção, consulta e caixa sem tocar em dados reais.

Conteúdo mínimo:

| Entidade | Quantidade | Regras |
|---|---|---|
| Clínica | 1, "Clínica Demonstração EloLab" | CNPJ inválido por construção; plano Ultra com exames ativos |
| Usuários | 5: admin, recepção, médico, enfermagem, financeiro | E-mails em domínio reservado (`@exemplo.invalid`) |
| Profissionais | 3 (clínico, pediatra, dermatologista) | CRM fictício marcado como demonstração |
| Pacientes | 40 | Nomes gerados com o sufixo "Teste"; CPF com dígito verificador inválido de propósito; telefones `(00) 0000-0000`; 3 com alergia cadastrada; 2 homônimos para treinar a identificação |
| Agenda | Dia corrente e 7 dias seguintes, cerca de 60% ocupados | Status variados: agendado, confirmado, em espera, finalizado, faltou |
| Tipos de consulta | 4 com preço | Uma gratuita (retorno) |
| Prontuários | 10 assinados, 3 em rascunho | Texto clínico genérico revisado por profissional habilitado; não gerar conduta |
| Laboratório | 5 pedidos em estados diferentes | Um com recoleta, um liberado |
| Financeiro | Caixa do dia fechado e caixa de hoje aberto; 5 contas a receber vencidas | — |
| Convênio | 1 convênio fictício, 1 lote, 1 glosa | Registro ANS fictício |

Critérios de aceite:

1. Os dados voltam ao estado inicial todo dia às 03:00, e as datas são recalculadas a partir do dia atual.
2. Nenhum CPF passa na validação de `cpfValido` (`src/lib/importacao/campos.ts:53`), nenhum telefone é real e nenhum e-mail entrega mensagem.
3. A clínica não envia WhatsApp, e-mail nem cobrança: as integrações ficam desligadas ou em sandbox.
4. A clínica fica isolada das demais pelo tenant normal, e o isolamento é coberto pela mesma suíte do CLIN-QA-002.
5. O vendedor entra com um usuário por perfil, sem acesso à plataforma.

Dependências: P0 CLIN-QA-002 (isolamento comprovado) e ambiente de staging (CLIN-QA-006). Rodar a demonstração na produção, com clientes reais na mesma base, só com autorização do responsável.

## 7. Tabela de ensaio (preencher antes do primeiro uso)

| Bloco | Ambiente | Data | Resultado | Observação |
|---|---|---|---|---|
| Agenda | | | NÃO EXECUTADO | |
| Check-in com cobrança | | | NÃO EXECUTADO | |
| Fila e chamada | | | NÃO EXECUTADO | |
| Prontuário, CID-10, alergia | | | NÃO EXECUTADO | |
| Assinatura e verificação | | | NÃO EXECUTADO | |
| Atestado | | | NÃO EXECUTADO | |
| Caixa: receber e fechar | | | NÃO EXECUTADO | |
| Repasse | | | NÃO EXECUTADO | |
| Lote e glosa | | | NÃO EXECUTADO | |
| Laboratório: pedido, coleta, laudo | | | NÃO EXECUTADO | |
| WhatsApp: caixa de conversas | | | NÃO EXECUTADO | |
| Importação de planilha sintética | | | NÃO EXECUTADO | |
