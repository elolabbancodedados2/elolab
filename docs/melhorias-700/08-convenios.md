## 08: Convênios, TISS, glosas, repasses e preços (V)
1. correção | GuiasLoteTissPage.tsx:242-243 | o AlertDialog de remover guia está vazio e não chama remover() | montar o diálogo com título, valor, deleteError e ação "Remover" | P
2. correção | NovaGlosaTissPage.tsx:61,69,96-99 | as chaves de cache não casam com as invalidações (lote novo não aparece; saldo antigo) | usar prefixos ['lotes-tiss',…] e ['glosas-convenio',…] | P
3. correção | RetornoLoteTissPage.tsx:71,123-128; GuiasLoteTissPage.tsx:79; FaturamentoConvenios.tsx:210 | caches de retorno e de guias não são invalidados | renomear para o prefixo lotes-tiss ou invalidar | P
4. correção | PrecosExames.tsx:665,717,734 × Convenios.tsx:146,231,254 | duas famílias de cache para precos_exames_convenio | chave comum ou invalidar as duas | P
5. correção | Convenios.tsx:489-498,145-153 | select simples corta em 1.000 linhas sem aviso | buscarEmBlocos e aviso de limite | P
6. correção | NovoLoteTissPage.tsx:140 | maxLength 80, mas a TISS exige até 12 | maxLength 12, contador e validação | P
7. correção | Convenios.tsx:1024,619-653 | Registro ANS sem validação (bloqueia o lote depois) | vazio ou 6 dígitos, máscara e texto de ajuda | P
8. correção | RepassesMedicos.tsx:347,163-168 | "cancelado" aparece como Pendente | rótulos do STATUS_REPASSE, selo neutro e pílula Cancelados | P
9. correção | PrecosExames.tsx:654,685,875-877 | editar preço de convênio inativo falha | carregar todos os convênios, marcando "(inativo)" | P
10. correção | PrecosExames.tsx:115-117 | TUSS repetido em CA 125, CA 19-9 e CA 15-3 | limpar os não conferidos e testar unicidade | P
11. correção | TiposConsulta.tsx:260-264,435,624 | grade de preço editável sem ser admin | esconder e mostrar "Somente leitura" | P
12. correção | TiposConsulta.tsx:245-252 | excluir tipo em uso mostra o erro 23503 cru | mensagem clara e ação "Inativar" | P
13. correção | FaturamentoConvenios.tsx:258-262 | consulta auxiliar com erro derruba a tela | erro compacto por aba | M
14. correção | FaturamentoConvenios.tsx:199-200 | "Atualizar" não refaz guias, autorizações, documentos e responsáveis | incluir essas consultas | P
15. correção | AutorizacaoConvenioWorkspace.tsx:72-76,82-86,92 | sem clinica_id; pré-seleciona o primeiro convênio | filtrar pela clínica; seletor vazio obrigatório | P
16. design | RetornoLoteTiss:166; NovaGlosaTiss:146,157; RepassePagamento:167; GuiasLoteTiss:237 | jargão ("RPC", "idempotente") | linguagem de clínica | P
17. design | GuiasLoteTiss, RetornoLoteTiss, RecursoGlosaTiss, RetornoGlosaTiss, RepassePagamento | status cru; competência "2026-10" | lib/tissStatus.ts com rótulos; competência MM/aaaa | P
18. design | AutorizacaoConvenioWorkspace.tsx:168,264,295-301,331 | emojis, bg-green-500, texto contraditório | ícones lucide, selo success, aviso conforme o convênio | P
19. design | RecursoGlosaTissPage.tsx:225 | select nativo | Select do padrão | P
20. design | Convenios.tsx:841-973 | tabela no celular | fichas com menu "⋯" | M
21. design | FaturamentoConvenios.tsx:325-343,354 | tabelas de lote e glosa no celular | fichas | M
22. design | FaturamentoConvenios.tsx:300-304; TiposConsulta.tsx:38 | vermelho e âmbar fora de problema | condicional / neutro | P
23. design | FaturamentoConvenios.tsx:316-321; Convenios.tsx:749-836 | filtros duplicados | deixar uma forma só | P
24. design | PrecosServicos.tsx:21-37; PrecosExames.tsx:968,974; TiposConsulta.tsx:302 | dois cabeçalhos; subaba fora da URL | um PageHeader só e ?sub= | M
25. design | TiposConsulta.tsx:46,493 | azul antigo na paleta; aria "Cor #hex" | paleta nomeada | P
26. design | TiposConsulta.tsx:607-626 | botões de 28 px; sem Esc nem "Salvar todos" | 44 px, Esc e salvar alterações | P
27. design | Convenios.tsx:1196-1197,438-439 | exclusão genérica | nome no título; "Inativar" como ação principal | P
28. design | Convenios.tsx:1067-1069,916-920 | "Prazo de retorno" é na verdade prazo de pagamento; `|| 30` | renomear; "Paga em N dias"; `?? 30` | P
29. design | RepassesMedicos.tsx:249,323,344 | "12.5%"; carregamento cru; botão Atualizar sem spinner | pt-BR, skeleton e spinner | P
30. design | PrecosExames.tsx:463,521-522,807-818 | sem aria-label; ícones pequenos; 9 colunas | aria, 44 px e esconder colunas | P
31. feature | AutorizacaoConvenioWorkspace | sem tela para registrar a resposta da operadora | "Registrar resposta" (autorizada/negada, senha, validade) | M
32. feature | FaturamentoConvenios (aba Autorizações) | sem fila central de autorizações | aba com pendentes, vencendo e negadas | M
33. feature | NovoLoteTissPage | lote digitado à mão | gerar a partir dos atendimentos | G | banco
34. feature | NovoLoteTissPage.tsx:140 | número do lote à mão | sugerir o próximo sequencial | P
35. feature | GuiasLoteTissPage | sem impressão da guia | PDF de Consulta / SP-SADT | M
36. feature | NovaGlosaTissPage.tsx:153 | código de glosa em texto livre | combobox com a tabela TISS de motivos | M
37. feature | NovaGlosaTissPage.tsx:153-154 | guia de referência em texto livre | escolher a guia do lote e limitar pelo valor dela | P
38. feature | FaturamentoConvenios.tsx:354 | recursos um por vez | recurso em lote e "marcar enviados" | M
39. feature | RelatorioFaturamentoCompetencia | sem análise de glosa | glosas por convênio e motivo, com CSV | M
40. feature | Convênios / PrecosExames | sem importação de tabela | importar CSV/XLSX com prévia | M
41. feature | Convenios.tsx:263-352 | sem reajuste em lote | "Reajustar tabela" com prévia | M
42. feature | TabelaExamesConvenio | sem cópia de tabela | "Copiar tabela de…" com fator | P
43. feature | PrecosExames.tsx:291-293,364-387 | tabela particular guardada em JSON | tabela precos_exames_particular | G | banco
44. feature | RepassesMedicos.tsx:35-115 | regra de repasse única | regras por convênio/procedimento | G | banco
45. feature | RepassesMedicos.tsx:343-353 | aprovar e pagar item a item | aprovar/pagar selecionados | M | banco
46. feature | lib/repasseDemonstrativo.ts:72 | demonstrativo sem data e paciente | juntar lançamento e paciente; PDF por médico | M
47. feature | /meus-repasses | o médico não vê os próprios repasses | visão só leitura do médico | M | banco
48. feature | Convênios / agendamento | carência e validade da carteira sem uso | validade da carteira e aviso na Agenda/Recepção | M | banco
49. feature | TiposConsulta.tsx:398-453,514-559 | preço por convênio tipo a tipo | grade Tipos × Convênios e "Duplicar tipo" | M
50. feature | FaturamentoConvenios + Tarefas | prazos só aparecem ao abrir a tela | faixa de alertas; tarefa automática | M
