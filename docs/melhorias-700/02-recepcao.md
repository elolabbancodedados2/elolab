## 02: Recepção, Fila e Triagem (R)
1. correção | Recepcao.tsx:538,552-554 | a query de triagens só roda para papéis clínicos; a recepção não vê a falta de triagem | habilitar para a recepção (selo "Aguardando triagem" sem link) | P | banco (grant da RPC listar_agendamentos_com_triagem para a recepção)
2. correção | Recepcao.tsx:825 | chamar sem salaId; o painel anuncia "Recepção" | passar a sala do agendamento ou da fila; avisar quando não houver | P
3. correção | Recepcao.tsx:693-697 | "Próximo a chamar" ignora a prioridade | ordenarFilaPorPrioridade | P
4. correção | Recepcao.tsx:368-383 | fila_atendimento com select('*') sem data | filtrar ids de hoje e colunas | P
5. correção | Recepcao.tsx:960,967 | voz e toast usam o nome civil | nome social (ou senha) | P
6. correção | Recepcao.tsx:236 | cadastrar no encaixe volta para /recepcao e perde o encaixe | returnTo /recepcao/encaixe e pré-selecionar o paciente | P
7. correção | Recepcao.tsx:1315 | sugestão do encaixe ignora o expediente | usar a medico_disponibilidade | P
8. correção | Recepcao.tsx:1893,2267; Fila.tsx:1153; checkinValidacao.ts:48 | códigos crus na tela | rótulos | P
9. correção | PainelTV.tsx:302-307 | fila de outros dias na TV | filtrar o dia de São Paulo | P
10. correção | PainelTV.tsx:65 | "dirija-se à Consultório" | artigo pelo tipo da sala, ou sem preposição | P
11. correção | PainelTV.tsx:671,857 | horário no fuso do aparelho | Intl com o fuso de São Paulo | P
12. correção | FinalizarAtendimento.tsx:269-271 | toast "Abrir Caixa" para o médico, que não tem acesso | mostrar só para admin, recepção e financeiro | P
13. correção | Fila.tsx:1117; FinalizarAtendimento.tsx:416 | abrir o prontuário sem returnTo | passar returnTo | P
14. correção | lib/triagemSinais.ts:54-62 | alerta crítico sem FC, FR, glicemia e dor | incluir esses campos e testes | P
15. correção | lib/triageQueue.ts:36 | pendentes de triagem sem prioridade | ordenar por prioridade e chegada; selo | P
16. correção | Salas.tsx:157-164,338-343 | ocupação de dias anteriores prende a sala | ignorar ocupações antigas; bloco "Vínculos antigos" | P
17. design | Recepcao.tsx:1663 | etapas escondidas no celular | chips roláveis | P
18. design | Recepcao.tsx:1840 | painel do paciente longe no celular | Sheet inferior | M
19. design | Recepcao.tsx:2230,2252,2358,2368 | botões verdes; diálogo genérico; spinner some | botões pretos, título claro, preventDefault | P
20. design | Recepcao.tsx:1400,1409 | instruções contraditórias no encaixe | texto único | P
21. design | Recepcao.tsx:1855-1857 | ficha sem idade e convênio | idade, convênio, carteirinha e selo "1ª vez" | P
22. design | components/recepcao/PainelDoDia.tsx | componente sem uso | usar no lugar dos 4 cartões ou remover | P
23. design | Fila.tsx:636,660 | emoji nos toasts | sem emoji | P
24. design | Fila.tsx:1244,1284 | botões "Liberar" de 24 px | 44 px e rótulo completo | P
25. design | Salas.tsx:37,557,591,608 | sala ocupada em vermelho | grafite | P
26. design | lib/roomOccupancy.ts:27 | "1 vínculos ativos" | "1 paciente" no singular e no plural | P
27. design | Triagem.tsx:1124,1126,1146 | decimais com ponto | pt-BR | P
28. design | Triagem.tsx:1093-1177 | tabela da triagem apertada no celular | fichas com a cor Manchester | M
29. design | PainelTV.tsx:155,645 | o navegador bloqueia o som sem gesto | "Toque para ativar" + tela cheia + wakeLock | P
30. design | vários | Maiúsculas Em Todas As Palavras | caixa de frase | P
31. feature | receptionTicket.ts; PainelTV | senha hexadecimal | senha sequencial diária N/P/U | M | banco
32. feature | PainelTV.tsx:789-868 | sem chamadas anteriores | coluna "Últimas chamadas" | P
33. feature | PainelTV | identificação fixa | configurar senha/nome/nome social | M | banco
34. feature | PainelTV.tsx:302 | uma TV só | ?setor= / ?salas= | P
35. feature | PendentesTriagem | enfermagem não chama pelo painel | "Chamar para triagem" | P
36. feature | Fila.tsx:934-1004 | sem "Chamar próximo" | botão e atalho Alt+P | P
37. feature | lib/filaChamada.ts | rechamada sem limite | contar chamadas; "Não respondeu" | M | banco
38. feature | fila_atendimento | sem horários de chamada e início | chamado_em/iniciado_em/finalizado_em e relatório | M | banco
39. feature | Recepcao.tsx:701-707 | espera sem alerta | limites e destaque | P
40. feature | /totem | sem totem | quiosque de check-in | G | banco
41. feature | ChecklistRecepcao.tsx | convênio sem guia, senha e validade | campos no check-in | M | banco
42. feature | Recepção / Finalizar | sem declaração de comparecimento | PDF | P
43. feature | Recepcao.tsx:1920 | sem etiqueta | etiqueta térmica 50×25 | P
44. feature | GestaoFluxo.tsx | sem grade de ocupação do dia | aba sala × hora | M
45. feature | Finalizar / Salas | sala não vai para limpeza | opção "limpeza ao finalizar" | M | banco
46. feature | Recepcao.tsx:300-314 | só o atalho "/" | atalhos de teclado do balcão | P
47. feature | Triagem.tsx:714-771 | sem alergias nem última triagem | cabeçalho com esses dados e tendência | M
48. feature | Triagem.tsx:809-834 | sem sugestão de risco | sugestão (regras/NEWS2) | M
49. feature | Triagem.tsx:548-561 | não dá para reavaliar | reavaliação com histórico | M | banco
50. feature | Recepcao.tsx:740-756,1024 | falta não oferece a vaga; desconto de 50% fixo | oferecer a vaga à lista de espera; limite configurável | M | banco
