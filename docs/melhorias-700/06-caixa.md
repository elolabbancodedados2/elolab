## 06: Caixa e PDV (X)
1. correção | CaixaDiario.tsx:340,793 | comprovante sem data; estorno sai como comprovante de pagamento | dataHoraSP; esconder no estorno ou gerar "COMPROVANTE DE ESTORNO" | P
2. correção | CaixaDiario.tsx:831 | Editar/Excluir com o caixa fechado | só com caixa aberto; dica "Reabra o caixa" | P
3. correção | CaixaDiario.tsx:437 | podeReabrir ignora profile.role | usar a variável roles (linha 141) | P
4. correção | MercadoPagoPointPayment.tsx:105 (+17) | invalidam ['caixa-diario'], chave que não existe | ['caixa-hoje'] e ['lancamentos-caixa'] | P
5. correção | CashOperationPage.tsx:159,241 | se o saldo falha, a sangria fica sem limite | bloquear e oferecer "Tentar novamente" | P
6. correção | EditarLancamentoCaixaPage.tsx:193 | sangria editada para Pix e acima do saldo | forma fixa em dinheiro; checar o saldo | P
7. correção | CashierSalePage.tsx:260-261 | desconto acima de 50% só falha no banco | validar no campo | P
8. correção | Recepcao.tsx:1519,354 | valor recebido não acompanha desconto/acréscimo | recalcular enquanto o operador não editar | P
9. correção | Recepcao.tsx:1517 | forma de pagamento repetida no dividido | filtrar as formas já usadas | P
10. correção | Recepcao.tsx:1142-1145; pdfReceipt.ts:140 | pop-up do comprovante bloqueado | botão "Imprimir comprovante"; booleano de retorno; revokeObjectURL | M
11. correção | pdfReceipt.ts:58,30 | texto cortado em 30 caracteres | splitTextToSize e altura dinâmica | M
12. correção | Recepcao.tsx:981-997 | recibo parcial sem o já pago e o saldo | jaPagoAntes e saldoRestante | P
13. correção | MercadoPagoPointPayment.tsx:139,203 | falha de rede vira "Conecte a conta" | ErrorState antes; conexão só com resposta ok | P
14. correção | CaixaHistoricoDetalhePage.tsx:29-38,62 | sem coluna Paciente | incluir na tabela e no CSV | P
15. correção | FecharCaixaPage.tsx:106-121,145 | esperado desatualizado | refetch a cada 15 s e antes do RPC; avisar se mudou | P
16. design | CashOperationPage.tsx:286; FecharCaixaPage.tsx:257 | selo "Aberto" em âmbar | selo neutro com ponto verde | P
17. design | CaixaDiario.tsx:582-597 | sem cartão de dinheiro na gaveta | cartão "Na gaveta"; renomear o saldo | P
18. design | CaixaDiario.tsx:469,528,658,698,994 | "Nova venda" duplicado; gradientes | um botão preto; fundo secondary | P
19. design | CaixaDiario.tsx:994,1017 | histórico sem estados nem diferença | estados distintos; chevron visível; "Bateu"/"Falta" | P
20. design | CaixaDiario.tsx:292 | busca só pela descrição | incluir paciente, forma e valor, sem acento | P
21. design | CaixaDiario.tsx:791-852 | três ícones no celular | menu "⋯" abaixo de sm | P
22. design | CashOperationPage.tsx:39-42; EditarLancamentoCaixaPage.tsx:57-59 | Crédito e Débito duplicados | só credito e debito | P
23. design | FecharCaixaPage.tsx:294-304 | diferença sem texto | "Falta"/"Sobra" + esperado | P
24. design | Recepcao.tsx:1516-1519 | type=number; parseMoneyInput copiado | lib/dinheiro parseMoneyInput; text + decimal | M
25. design | Recepcao.tsx:1517-1518 | restante da forma principal não aparece | "Restante em PIX: R$ X" | P
26. design | Recepcao.tsx:70-75 | ícones e cores das formas | ícones neutros e a lista de FORMA_LABELS | P
27. design | CashierSalePage.tsx:449-480,390,458 | total fora da tela no celular | barra fixa; aria; rótulos | M
28. design | CaixaHistoricoDetalhePage.tsx:84-99 | relatório diferente do de hoje | lib/relatorioCaixa.ts comum | P
29. design | EstornarVendaPdvPage.tsx:111,119,88 | data sem fuso; forma crua; erro só no toast | dataHoraSP, rotuloForma, role=alert | P
30. design | MercadoPagoPointPayment.tsx:168,191 | status_detail e modo em inglês | mapas de rótulos | P
31. feature | pdfReceipt.ts:42 | recibo não serve para reembolso | "Recibo para reembolso" com CNPJ, CRM, CPF e valor por extenso | M
32. feature | pdfReceipt.ts:147; CaixaDiario.tsx:793 | getReceiptWhatsAppText sem uso | botão "Enviar no WhatsApp" | P
33. feature | Recepcao.tsx:1507 | Point fora do balcão | MercadoPagoPointPayment no recebimento | M
34. feature | MercadoPagoPointPayment.tsx:196-198 | Point sem tipo e parcelas | valor, tipo e parcelas | M | banco
35. feature | Recepção | uma cobrança por vez | receber todas do paciente | G | banco
36. feature | Recepcao.tsx:1510 | Pix sem QR | QR dinâmico com baixa automática | G | banco
37. feature | Recepcao.tsx:1513 | crédito sem parcelas | seletor de 1 a 12 parcelas | P
38. feature | Recepção / PDV | sem troco | "Valor entregue" e troco | P
39. feature | Recepção / PDV | desconto só em R$ e sem motivo | % ou R$; motivo; filtro de descontos | M
40. feature | Recepcao.tsx:69-75 | sem crédito do paciente | usar o crédito do paciente | M | banco
41. feature | FecharCaixaPage.tsx:276-292 | contagem num número só | contar por cédula | M
42. feature | FecharCaixaPage.tsx:306-334 | sem valor do extrato por forma | campo por forma | M | banco
43. feature | FecharCaixaPage.tsx:251 | fecha com cobranças de hoje em aberto | bloco de cobranças em aberto | M
44. feature | FecharCaixaPage.tsx:154-169 | sem impressão ao fechar; sem fechamento cego | opção de imprimir; fechamento cego | M
45. feature | CashOperationPage.tsx:314-320 | sangria sem destino nem comprovante | destino + comprovante de 80 mm | P
46. feature | CashOperationPage.tsx:330-354 | despesa sem anexo | anexo e fornecedor | M | banco
47. feature | CashierSalePage.tsx:472,333 | PDV sem pagamento dividido nem tela de sucesso | dividido + tela de sucesso | M | banco
48. feature | CashierSalePage | sem atalhos | F2, Enter, F4, F9, Esc | P
49. feature | CaixaDiario.tsx:479-491 | sem resumo por médico e por operador | aba Resumo | M | banco
50. feature | CaixaDiario.tsx:955-1025 | histórico sem filtros | filtros + consolidado do mês em Excel | M
