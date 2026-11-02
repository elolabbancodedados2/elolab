## 07: Financeiro (F)

Formato: tipo | arquivo:linha | o que fazer | esforço | banco (quando houver).

1. correção | Financeiro.tsx:248-257,266-270 | "Outros" e "outros" viram duas categorias → normalizar a chave e usar um rotuloCategoria único | P
2. correção | ContasReceber.tsx:262; ContasPagar.tsx:233 | status "atrasado" fica fora dos vencidos → incluir | P
3. correção | ContasPagar.tsx:142,153 | editar troca a categoria por "outros" → manter a original no Select | P
4. correção | ContasPagar.tsx:543,319 | contagem do "Pago" não bate com o valor → mesmo filtro nos dois | P
5. correção | ContaPagarPagamentoPage / ContasReceber / ContaReceberEstorno | invalidações faltando → invalidarFinanceiro() único | P
6. correção | projecaoFluxoCaixa.ts:143 | prazo_retorno nulo vira 0 dias → tratar nulo como 30 + teste | P
7. correção | dre.ts:461; DrePlanoContas.tsx:143 | competência ignora data_emissao → ordem competencia, data_emissao, vencimento, data | P
8. correção | DrePlanoContas.tsx:725-740 | aba Categorias usa só 2 meses → consulta do ano inteiro | M
9. correção | DrePlanoContas.tsx:404 | subtítulo errado no regime por competência → texto por regime | P
10. correção | ContaReceberEstorno.tsx:288,295 | horário no fuso do navegador → São Paulo | P
11. correção | ContasReceber.tsx:1305 (e outros) | aria-label trocado; Label sem htmlFor → corrigir | P
12. correção | ContasPagar.tsx:847-848 | type=number e parseFloat → campo de texto e parseMoneyInput | P
13. correção | FluxoCaixa.tsx:384,410,459,504,565 | percentual e eixo crus → formatadores do Financeiro | P
14. correção | CobrancaInadimplentes.tsx:233 | cartão e filtro desalinhados → renomear o cartão | P
15. correção | CobrancaInadimplentes.tsx:321 | destaque cobra um título só → usar porPaciente | P
16. design | Financeiro.tsx:460-542 | segunda DRE no painel → resumo + link para a DRE | M
17. design | Financeiro.tsx:611-634 | atalhos errados → DRE, Cobrança e Extrato | P
18. design | ContasReceber / ContasPagar | tabelas no celular → fichas | M
19. design | CobrancaInadimplentes.tsx:449,500 | rolagem fixa e muitas colunas → fichas no celular | M
20. design | CobrancaInadimplentes.tsx:261,294-297,406 | gradiente e animação → padrão | P
21. design | ContasReceber.tsx:840,868,962,1005 | classes order-* → reordenar o JSX | P
22. design | ContasReceber / ContasPagar | contador repetido → um só | P
23. design | ContasReceber.tsx:1227-1252 | categoria com dois controles → um Select com chips | P
24. design | ContasReceber.tsx:1288,1301,1319 | grid fixo de 2 colunas → 1 coluna no celular; prefixo R$ | P
25. design | FluxoCaixa / DrePlanoContas | cabeçalho quebra no celular; sem "Hoje" → menu "Mais" + Hoje | P
26. design | ContasReceber / ContasPagar / Cobranca | toast com erro cru → mensagemDeErro | P
27. design | ContaReceberEstorno.tsx:65,325 | motivo com mínimo de 3 ou 5 → 5 com contador | P
28. design | CobrancaInadimplentes.tsx:176,319,467,521,543 | busca e nome social → pacienteCorresponde, nome social, aria-label | P
29. design | DrePlanoContas.tsx:213,238 | esqueleto da página inteira → por aba | P
30. design | vários | rótulos repetidos em várias telas → lib/financeiroRotulos.ts | M
31. feature | ContasReceber / ContasPagar | parcelamento | M
32. feature | migrations; ContasReceber | receita recorrente | M | banco
33. feature | /financeiro/recorrencias | gerenciar recorrências | M
34. feature | ContasPagar | "Repetir até" | M | banco
35. feature | ContasPagar | anexo | M | banco
36. feature | ContasPagar | linha digitável do boleto | M
37. feature | ContasPagar | pagar várias contas de uma vez | M
38. feature | ContaReceberDetalhes | recibo | M
39. feature | /contas/receber/:id/editar | renegociar conta a receber | M
40. feature | BankStatementImportPage | conciliação de extrato | G | banco
41. feature | /contas/pagar/:id/detalhes | detalhes da despesa + estorno | M
42. feature | Financeiro | aba Centros de custo | M
43. feature | Contas | cadastro de centros de custo | M | banco
44. feature | DrePlanoContas | DRE anual com 12 colunas | M
45. feature | DrePlanoContas | orçamento da DRE | G | banco
46. feature | DrePlanoContas | detalhar uma conta da DRE | M
47. feature | CobrancaInadimplentes | registrar contato de cobrança | M | banco
48. feature | CobrancaInadimplentes | link de Pix na cobrança | G | banco
49. feature | FluxoCaixa | contas bancárias e saldo inicial | G | banco
50. feature | ContasReceber | taxas de cartão | G | banco
