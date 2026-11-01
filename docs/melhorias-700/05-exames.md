## 05: Exames e Laboratório (L)
1. correção | Exames.tsx:964-973,1879-1898 | preço da guia repetido em cada exame | preço por exame, ou rótulo "por exame" e total | M
2. correção | Exames.tsx:217-219 | TUSS repetido (CA 19-9 e CA 15-3) | limpar e testar unicidade | P
3. correção | Exames.tsx:969,1866 | tipo único para a guia inteira (coleta indevida de imagem) | tipo pela categoria de cada exame | P
4. correção | lib/pdfGenerator.ts:1094 | parseFloat lê "5,8" errado no PDF | parseResultadoNumerico | P
5. correção | LaudosLab.tsx:569-572 | WhatsApp diz "disponível" com laudo pendente | texto pelo estado; esconder com crítico | P
6. correção | LaudosLab.tsx:119-125,199-201 | lista mescla dados velhos; realtime sem debounce | substituir o trecho recarregado; debounce de 400 ms | M
7. correção | Laboratorio.tsx:403-404 | "Próxima coleta" mostra a mais nova | urgente primeiro, depois a mais antiga | P
8. correção | Laboratorio.tsx:260-268,474 | SLA fixo de 4 h com todo o histórico | só os estados ativos; SLA do setor | P
9. correção | Laboratorio.tsx:745-748 | "Liberar laudo" sem o id | abrir /laudos-lab/:id | P
10. correção | Laboratorio.tsx:299-301 | erro da worklist derruba a página | erro só nessa aba | P
11. correção | MapaColeta.tsx:149,829 | lista pisca a cada evento | separar refreshing de loading; debounce | P
12. correção | MapaColeta.tsx:451-588 | componentes declarados dentro do componente | mover para fora + memo | M
13. correção | IndicadoresLaboratorioPanel.tsx:103,44 | contagem invisível; corte em 5.000 sem aviso | mostrar a contagem; aviso de truncado | P
14. correção | GuiaPage.tsx:74-80 | maybeSingle quebra com CPF duplicado | limit(1) + aviso | P
15. correção | Gestao/Pedidos/AmostraPage/LaudoPage | horário fora de SP; rótulos crus | formatDateTimeSaoPaulo; rótulos; mensagemDeErro | P
16. correção | LaboratorioSubnav.tsx:14; GuiasExternas; Laboratorio | links não respeitam o papel | filtrar com hasAnyRole | P
17. design | GuiasExternas; Laboratorio; LaudosLab | cores fora do padrão | preto no ativo; âmbar e vermelho só para problema | P
18. design | Laboratorio.tsx:873-879; Indicadores | cores soltas fora dos tokens | tokens | P
19. design | LaudosLab.tsx:546-661 | tabela cortada e crítico escondido no celular | fichas | M
20. design | GuiasExternas.tsx:410-497 | tabela de 8 colunas no celular | fichas | M
21. design | Exames.tsx:1415-1586 | pipeline em texto de 9 px | stepper + fichas | M
22. design | MapaColeta.tsx:850-854 | 11 colunas no celular | fichas com a cor do tubo | M
23. design | vários | alvos de toque pequenos; "×" em texto | 44 px; ícone X com aria | P
24. design | Laboratorio.tsx:750-767 | ícones sem aria; cancelar sem confirmação | aria + AlertDialog com motivo | P
25. design | GuiasExternas; Laboratorio; LaudosLab | atalhos repetidos | LaboratorioSubnav comum | P
26. design | vários | "(s)/(ões)", "Dr." fixo, emoji 💰 | plural correto; sem prefixo; sem emoji | P
27. design | PortalGuias; Gestao; Pedidos | Label sem htmlFor | useId + aria | P
28. design | LaudoPage.tsx:416,427-452 | cabeçalho sem idade, sexo, médico e convênio | ficha-quadro | P
29. design | GuiaPage.tsx:332,411-428 | cancelar sem confirmação | ConfirmDialog com motivo | P
30. design | PortalGuias; NovaGuiaPage | telefone sem máscara; UF sem limite | formatPhone, tel, maxLength 2 | P
31. feature | pdfGenerator gerarLaudoPDF | sem RT nem validação | RT + QR /validar-laudo | G | banco
32. feature | LaudoPage.tsx:472-532 | sem resultado anterior | anterior, variação e sparkline | M
33. feature | ResultadosColetaPage.tsx:261-309 | lançamento um a um | grade por perfil | G | banco
34. feature | CatalogoPerfisPanel | sem pânico nem faixa por sexo e idade | limites e faixas | M | banco
35. feature | GestaoLaboratorioPanel.tsx:149-154 | sem Levey-Jennings/Westgard | gráfico e regras | G | banco
36. feature | Gestao; NovaColetaPage | lote do insumo em texto livre | seleção de lote; baixa e descarte | M
37. feature | GestaoLaboratorioPanel.tsx:135-140 | equipamento sem histórico | linha do tempo; alerta de calibração | M | banco
38. feature | lib/sampleLabel.ts | etiqueta incompleta | nome, nascimento, data e exames; reimprimir | P
39. feature | MapaColeta | sem agrupar por paciente | agrupar pela ordem de tubos CLSI | M
40. feature | MapaColeta; Laboratorio | sem leitor de código de barras | campo "Bipar amostra" | P
41. feature | LaudoPage; LaudosLab | entrega manual | link seguro com registro de entrega | G | banco
42. feature | GuiaPage.tsx:346-357 | exames da guia externa soltos | "Converter em pedido" | M
43. feature | PortalGuias.tsx:208-238 | sem upload nem consentimento | upload + LGPD | M | banco
44. feature | PortalGuiasPage.tsx:61-157 | link sem validade nem limite | validade, limite, QR e confirmação ao excluir | M | banco
45. feature | GuiasExternas; GuiaPage | autorização vencendo sem aviso | selo, filtro e bloqueio | P
46. feature | GuiaPage; Exames | preparo não enviado | WhatsApp e impressão do preparo | P
47. feature | Exames.tsx:1740-1842 | sem kits | kits e favoritos | M | banco
48. feature | Exames.tsx:2047-2154 | sem reimprimir nem repetir | botões | P
49. feature | Laboratorio; Catalogo | sem previsão de entrega | "Previsto para…" e selo de atraso | M
50. feature | Laboratorio.tsx:796-922 | sem mapa de bancada | imprimir em A4 por setor | P
