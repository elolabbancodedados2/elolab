## 12: Início, relatórios e indicadores (I)

Formato: tipo | arquivo:linha | o que fazer | esforço | banco (quando houver).

1. correção | RelatorioCustomizado.tsx:133 | status de exame que não existe → usar os valores do enum | P
2. correção | RelatorioCustomizado.tsx:83,107 | status incompletos → enums completos; "Finalizado" agrupando os dois status | P
3. correção | RelatorioCustomizado.tsx:201 | data do prontuário com um dia a menos → formato 'date' | P
4. correção | RelatorioCustomizado.tsx:420 | busca quebra o .or() → escapar o texto | P
5. correção | RelatorioCustomizado.tsx:585-598 | totais incluem cancelados e somam despesa como receita → corrigir | P
6. correção | RelatorioCustomizado.tsx:530-535 | Excel com texto no lugar de número e data → tipos certos; await + try | P
7. correção | scheduled-reports-runner:349-355; SalvarRelatorioPage.tsx:188 | período fixo no relatório agendado; dia_mes sem validação → período relativo; validar de 1 a 28 | M
8. correção | Analytics.tsx:386,424 | gráficos cortam em 14 dias → até 31 dias e semanal acima disso | P
9. correção | Analytics.tsx:414-419,950-953 | risco azul ignorado → incluir | P
10. correção | Relatorios.tsx:538-551 | taxa por médico errada → finalizados ÷ (finalizados + faltas); só médicos com atendimento | P
11. correção | Relatorios.tsx:577,1432; excelExporter.ts:209,285 | replace só no primeiro "_" → rotuloForma e formatAppointmentStatus | P
12. correção | Dashboard.tsx:1029 | observação aparece como nome do paciente → "Paciente sem cadastro" | P
13. correção | Dashboard.tsx:722-725; InicioPainel.tsx:255 | compara o mês parcial com o mês inteiro → mesmo intervalo de dias; "—" sem base | P
14. correção | DoctorDashboard.tsx:189,300,313,534 | hora nula derruba; avatar "DR"; CRM fixo → corrigir | P
15. correção | DoctorDashboard.tsx:264-273 | erro de um quadro derruba o painel → erro só no quadro | P
16. correção | MinhaFilaTarefas.tsx:132-136,223,220,349 | "adiar para amanhã" errado; carregamento em todos os botões → hoje + 1; carregamento por item | P
17. design | InicioPainel.tsx:22,200-210 | cores dos status pela frequência → mapa fixo por status | P
18. design | InicioPainel.tsx:222,307,331,351 | listas cortadas sem aviso; linhas sem link → "+N" e links | P
19. design | InicioPainel.tsx:95-107 | números do topo quebram no celular → grade 2×2 | P
20. design | InicioPainel.tsx:275 | rótulos das barras se sobrepõem → formato curto | P
21. design | DoctorDashboard.tsx:398,297,477 | selo de alergia de baixo contraste; rótulos → corrigir | P
22. design | Tarefas / RelatoriosSalvos / Indicadores / AnalisePreditiva | gradientes → bg-primary | P
23. design | vários | Maiúsculas Em Cada Palavra → caixa de frase | P
24. design | RelatorioCustomizado / SalvarRelatorioPage | aria sem acento → corrigir | P
25. design | RelatorioCustomizado / RelatoriosSalvos | valores crus → rótulos | P
26. design | RelatorioCustomizado.tsx:808-816,862 | selos coloridos; tabela no celular → fichas | M
27. design | AnalisePreditiva.tsx:279-281,449-545 | cores de risco invertidas; tabela no celular → corrigir; fichas | M
28. design | Analytics.tsx:521-543,594-616,114 | período em dois popovers → Calendar com intervalo | P
29. design | Relatorios.tsx:173-174 | abre no construtor; aba e período fora da URL → abrir no resumo; ?aba= e ?periodo= | P
30. design | Relatorios / Analytics | eixos de valor crus → formato curto compartilhado | P
31. feature | Metas | metas da clínica | G | banco
32. feature | Dashboard | previsão de fechamento do mês | M
33. feature | InicioPainel / AnalisePreditiva | botões "Confirmada" e "Não atendeu" | P
34. feature | Dashboard.tsx:824-835 | próximo dia útil + lembrete para todos | P
35. feature | AnalisePreditiva | horizonte, médico e busca | P
36. feature | AnalisePreditiva | oferecer a vaga à lista de espera | M
37. feature | AnalisePreditiva | seleção em lote + CSV | P
38. feature | Relatorios | comparar períodos | M
39. feature | Relatorios | aba Convênios | M
40. feature | Analytics | mapa de ocupação | M
41. feature | Analytics | exportar | P
42. feature | runner | envio agendado em xlsx e PDF | M
43. feature | RelatoriosSalvos | baixar, duplicar e compartilhar | M | banco
44. feature | RelatorioCustomizado | ordenar e reordenar colunas | P
45. feature | RelatorioCustomizado | fontes novas: pagamentos, tarefas e triagens | M
46. feature | RelatorioCustomizado | impressão com a identidade da clínica | P
47. feature | Tarefas | recorrência + checklist | M | banco
48. feature | Tarefas / MinhaFila | criação rápida de tarefa | P
49. feature | Analytics | satisfação por médico | M
50. feature | DoctorDashboard | pendências do médico | M
