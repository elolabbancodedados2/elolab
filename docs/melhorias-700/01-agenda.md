## 01: Agenda, lista de espera, retornos, agendamento online e teleconsulta (A)

Formato: tipo | arquivo:linha | o que fazer | esforço | banco (quando houver).

1. correção | AgendaPage.tsx:313-317 | lateral da espera mostra só "aguardando" e na ordem errada → incluir notificado e confirmado e ordenar por prioridade (levar compararPorPrioridade para lib/listaEsperaPrioridade) + selo | P
2. correção | AgendaPage.tsx:313; WaitingListSidebar.tsx:88 | médico vê a espera de todos → para isMedicoOnly, filtrar medico_id do médico ou nulo | P
3. correção | useAgendaColorScheme.ts:104 | cor por convênio usa ag.convenio_id, que nunca é gravado → fallback para pacientes.convenio_id | P
4. correção | AgendaColorSettingsPage.tsx:16-24,73 | só 7 status e sem os tipos fixos → reutilizar STATUSES do AgendaHeader e incluir os 5 tipos fixos | P
5. correção | DailyMultiDoctorView.tsx:52-71,87 | "Livre HH:MM" ignora o expediente → usar as faixas de medico_disponibilidade | P
6. correção | AppointmentCard.tsx:145; DailyMultiDoctorView.tsx:20-21 | consulta fora de 06–22 some → grade dinâmica ou aviso "N consultas fora da grade" | M
7. correção | AgendaPage.tsx:578-586 | totais de semana e mês contam só o dia → contar o período e ajustar o rótulo | P
8. correção | AppointmentCard.tsx:488 | "Marcar faltou" em consulta futura e sem confirmar → só depois do horário, com ConfirmDialog | P
9. correção | AppointmentDialog.tsx:713-714 | "Total de consultas" aplica o limite a cada tecla → aplicar no blur e ao salvar | P
10. correção | AppointmentDialog.tsx:405-416 | série recorrente ignora erro de bloqueios e o expediente → parar e avisar; pular e avisar datas fora do expediente | P
11. correção | Retornos.tsx:216-224,879 | retorno remarcado aparece "Atrasado" → considerar a consulta futura e mostrar a data marcada | P
12. correção | Retornos.tsx:133-144,200-205 | baixa o cadastro inteiro de pacientes → join pacientes(...) | P
13. correção | BloqueioAgenda.tsx:107-110,433 | lista bloqueios encerrados; médico remove o dos colegas → filtrar data_fim >= hoje e restringir ao próprio médico | P
14. correção | PainelNovoAgendamento.tsx:34 | trocar de mês muda o dia → mesExibido em estado local | P
15. correção | AgendamentoOnline.tsx:81-88,124-127 | liberação no pagehide é cancelada → fetch com keepalive ou sendBeacon | P
16. correção | ListaEspera.tsx:70-83; waitingListSlotCompatibility.ts | especialidade fixa e comparação exata → especialidades cadastradas + comparar sem acento | M
17. design | AgendaHeader.tsx:54-58,313; AgendaPage.tsx:584 | "Aguard." mistura situações → separar "A confirmar" e "Na clínica" | P
18. design | BloqueioAgenda.tsx:212-218 | selos vermelho e azul → neutros com ícone | P
19. design | AgendaPage.tsx:49-109 | lista do celular sem bloqueios nem horários livres → intercalar essas fichas; texto-xs | M
20. design | AppointmentCard.tsx:338-491 | ações só no botão direito → botão "⋯" e Sheet no celular | M
21. design | AppointmentDialog.tsx:525,740-765 | dois "Voltar"; botão de salvar longe → rodapé fixo | P
22. design | AppointmentDialog.tsx:526-529 | título genérico → ficha-resumo atualizada ao vivo | P
23. design | WaitingListSidebar.tsx:121-123 | vazio com instrução inútil → texto + "Adicionar paciente" | P
24. design | WaitingListSidebar.tsx:36-85 | só funciona por arraste → botão "Agendar" | P
25. design | ListaEspera.tsx:580-752; Retornos.tsx:827-953 | tabelas no celular → fichas | M
26. design | ListaEspera.tsx:688-720; AgendaPage.tsx:455 | 3 cliques para agendar → "Agendar" em qualquer status ativo | P
27. design | AgendamentoOnline.tsx:325-466 | passo seguinte fora da tela → indicador de etapas e scrollIntoView | P
28. design | AgendamentoOnline.tsx:426,459 | sem contagem da reserva; botão cinza sem motivo → contador + texto | P
29. design | Teleconsulta.tsx:199,208-209 | gradiente; microfone e câmera em vermelho → padrão | P
30. design | AgendaHeader.tsx:98,248-274,304 | filtro de médicos sempre ativo para o médico → esconder | P
31. feature | AppointmentDialog.tsx:602-633 | chips de horários livres do médico no dia | M
32. feature | /agenda/confirmacoes | tela de confirmação das consultas de amanhã | M
33. feature | AppointmentDialog.tsx:634-684 | campo Convênio na consulta, gravando agendamentos.convenio_id | M
34. feature | AppointmentDialog.tsx:553-583 | faltas, saldo em aberto e retorno previsto na ficha | M
35. feature | BloqueioAgenda.tsx:276-291 | bloquear vários médicos de uma vez | P
36. feature | BloqueioAgenda | bloqueio por dia da semana | M | banco
37. feature | BloqueioAgenda.tsx:171-179 | listar as consultas que conflitam com o bloqueio | M
38. feature | BloqueioAgenda.tsx:410-436 | editar bloqueio | P
39. feature | AgendaHeader.tsx:200 | /agenda/imprimir com lista A4 | M
40. feature | WeeklyView.tsx:96-187 | arrastar entre dias na semana | M
41. feature | AppointmentDialog / AgendaPage | "Remarcar" de verdade, cancelando a original | M
42. feature | AppointmentCard.tsx:418-439 | teleconsulta: get_or_create, entrar e enviar o link | M
43. feature | Teleconsulta.tsx:93 | servidor TURN | M
44. feature | AgendamentoOnline; public-booking | escolher convênio e tipo no agendamento online | M
45. feature | AgendamentoOnline | .ics e link para gerenciar a consulta | G | banco
46. feature | public-booking | dias com vaga | M
47. feature | public-booking; AgendaHeader | origem='online' e filtro "Online a confirmar" | P
48. feature | ListaEspera.tsx:679-746 | "Encontrar vaga" | M
49. feature | Retornos.tsx:57,899-946 | lembrete de retorno em lote | M
50. feature | AgendaHeader | "Buscar vaga" entre profissionais | M
