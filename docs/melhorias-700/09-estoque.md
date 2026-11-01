## 09: Estoque, compras e operação (E)
1. correção | lib/workflowAutomation.ts:297-304 (Prontuarios.tsx:803) | Dispensação busca com ilike na primeira palavra (pode baixar o item errado) | buscar por estoque_id; senão nome inteiro normalizado; ambíguo → alerta, sem baixa | M
2. correção | workflowAutomation.ts:297-304 | Sem clinica_id e escolhe lote vencido | filtrar clínica e validade >= hoje (SP); alerta "apenas lote vencido" | P
3. correção | workflowAutomation.ts:294 | parseInt||1 para "½"/"meia caixa" | aceitar só inteiros positivos; senão pular com alerta | P
4. correção | Compras.tsx:543-552 | refetch apaga preços digitados em LancarProposta | inicializar só ao trocar fornecedor | P
5. correção | Compras.tsx:798-800 | recebimento falha se passar do máximo do item | listar itens que estouram e oferecer "Ajustar máximo" antes de confirmar | P
6. correção | Estoque.tsx:611 | botão "Cotar itens em falta" escondido quando só há itens no ponto de pedido | condição crítico || ponto de pedido; texto "Cotar reposição (N)" | P
7. correção | Salas.tsx:406-414 | refetch com erro derruba a lista | erro só sem dados; aviso compacto | P
8. correção | Salas.tsx:819 | capacidade volta a 1 ao apagar o campo | guardar string e validar no salvar | P
9. correção | PatrimonioEquipamentos.tsx:238 | refetch com erro derruba a tela | erro só sem dados | P
10. correção | PatrimonioEquipamentos.tsx:448 | ações de auditoria em inglês | mapa de rótulos | P
11. correção | PatrimonioEquipamentos.tsx:432 | sem cancelar ordem de serviço (impede aposentar o ativo) | botão "Cancelar OS" com motivo (update_order cancelled) | P
12. correção | PatrimonioEquipamentos.tsx:430 | ordens abertas antigas somem do cartão | abertas primeiro; "ver todas (N)" | P
13. correção | Estoque.tsx:133,161 | ?alerta= só aceita 2 filtros | aceitar os 5 e gravar na URL | P
14. correção | HigieneSalas.tsx:126 | checklist recusado com erro genérico | validar no cliente linha a linha | P
15. correção | Estoque.tsx:395,431,469 | toasts com erro cru | mensagemDeErro | P
16. design | Estoque.tsx:838-927 | tabela transborda em 390 px | fichas no celular com menu "Mais" | M
17. design | Estoque.tsx:288,698-700,775-779 | Curva ABC em vermelho/âmbar/verde | preto/cinza | P
18. design | Estoque.tsx:291,1026 | "Epis", "Ml", "Kg" | mapa de rótulos (EPIs, mL, kg…) | P
19. design | Estoque.tsx:965-988 | histórico sem usuário nem saldo resultante | usuário, saldo após, filtros, carregar mais | M
20. design | Estoque.tsx:680,141 | "Registrar saída" de vencido abre vazio | pré-preencher quantidade e motivo | P
21. design | Compras.tsx:596 | trocar fornecedor descarta preços sem aviso | confirmar descarte | P
22. design | Compras.tsx:335 | criar cotação desabilitado sem motivo; sem guarda | mostrar o motivo e usar UnsavedChangesGuard | P
23. design | Compras.tsx:474-526 | comparação item × fornecedor com rolagem lateral no celular | fichas por item | M
24. design | Compras.tsx:115-122 | abas sem tabpanel nem setas | Tabs do shadcn | P
25. design | HigieneSalas.tsx:30 | data com segundos | "01/11 14:03" e relativo para hoje | P
26. design | HigieneSalas.tsx:279,296 | botão desabilitado sem motivo | texto auxiliar | P
27. design | HigieneSalas.tsx:289,330 | reprovação sem motivo e sem executor | mostrar quem reprovou e a nota; "Refazer checklist" | M
28. design | PatrimonioEquipamentos.tsx:425 | aposentar sem confirmação | ConfirmDialog | P
29. design | PatrimonioEquipamentos.tsx:332-354 | Label sem htmlFor | id/htmlFor | P
30. design | Salas.tsx:704,724 | "Liberar" com dois sentidos | "Enviar para limpeza" / "Voltar a operar"; spinner ao atualizar | P
31. feature | Prontuarios.tsx:803-843 | dispensação automática por nome | painel para confirmar a dispensação (item, lote, quantidade), gravando estoque_id | M
32. feature | Estoque | lote único por item | tabela estoque_lotes e saída FEFO | G | banco
33. feature | /estoque/inventario | não há inventário | contagem física e ajustes com motivo | M
34. feature | Estoque.tsx:1121-1131 | motivo da saída livre | motivo obrigatório numa lista e relatório de perdas | M | banco
35. feature | Estoque | sem exportação | Excel/CSV da posição do estoque | P
36. feature | Estoque.tsx:802 | sem atalho para leitor de código de barras | EAN + Enter abre a entrada; modo de entrada rápida | M
37. feature | Estoque.tsx:249-266 | ABC só por valor parado | alternar valor / consumo de 90 dias | M
38. feature | Estoque e lib/compras.ts | sem previsão de ruptura | "dura ~N dias" e sugestão de quantidade | M
39. feature | Compras.tsx:718-773 | atalho de conta a pagar some | ação por pedido recebido e selo "Conta lançada" | P
40. feature | Compras.tsx:753-775 | pedido não sai do sistema | PDF e envio por WhatsApp/e-mail | M
41. feature | Compras.tsx:663-678 | recebimento tudo ou nada | recebimento parcial | G | banco
42. feature | Compras.tsx:748,766 | sem previsão de entrega | previsão e selo "Atrasado" | P
43. feature | Compras.tsx:612-624 | sem último preço pago | mostrar o último preço e a variação | M
44. feature | HigieneSalas.tsx:342-365 | histórico curto | relatório por período em PDF/CSV | M
45. feature | HigieneSalas | um checklist só | checklist por tipo de sala e modalidade | G | banco
46. feature | PatrimonioEquipamentos.tsx:432 | concluir OS não atualiza o próximo prazo | pedir a próxima calibração/manutenção | M
47. feature | PatrimonioEquipamentos | garantia sem alerta | alerta de 60 dias e selo "Na garantia" | P
48. feature | PatrimonioEquipamentos.tsx:223 | não dá para editar o ativo | "Editar ativo" (edge update_asset) | M
49. feature | Salas.tsx:682-726 | equipamentos da sala sem ligação com o Patrimônio | mostrar os ativos da sala e bloquear se algum estiver fora de operação | M
50. feature | Estoque e Prontuários | controlados (Portaria 344) | lista A/B/C, receita na saída, livro de registro | G | banco
