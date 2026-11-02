## 03: Prontuário e documentos clínicos (P)

Formato: tipo | arquivo:linha | o que fazer | esforço | banco (quando houver).

1. correção | Prontuarios.tsx:252-258,2932,3000,3031,3046 | seções recolhidas não abrem no modo leitura → tirar o botão de dentro do fieldset, abrir se houver texto, aria-expanded | P
2. correção | Prontuarios.tsx:2541 | aria-label mostra o dia anterior → parseDateOnly | P
3. correção | Prontuarios.tsx:3039 | não dá para digitar o segundo diagnóstico → estado de texto e conversão ao salvar | P
4. correção | Prontuarios.tsx:3087-3096 | "Receita PDF" imprime o prontuário inteiro → buildReceitaPdf ou gerarReceita | P
5. correção | Prontuarios.tsx:738,749; App.tsx:408,425 | "Ver todos" perde o filtro → link direto e repassar location.search | P
6. correção | ClinicalTemplateEditor.tsx:328-332 × Atestados.tsx:315-326 | variáveis divergentes → dicionário único com sinônimos | P
7. correção | pdfGenerator.ts:430,439 | cidade "São Paulo" fixa, data de hoje, CRM "N/A" → cidade da clínica, data de emissão, UF | P
8. correção | ClinicalSafetyPanel.tsx:84-99 | erro na consulta exibido como "sem alerta" → estado âmbar com "Tentar novamente" | P
9. correção | ClinicalSafetyPanel.tsx:56-58,77 | triagem antiga tratada como atual; sem filtro de clinica_id → usar a mais recente (≤ 24 h), mostrar a data, filtrar a clínica | P
10. correção | Prontuarios.tsx:1161-1164,3181-3187 | checagem de interações ignora "medicamentos em uso" → incluir | P
11. correção | VitalSignsChart.tsx:48-54,78-79 | gráfico lê só triagens → consolidarHistoricoVitais | M
12. correção | FaixaSinaisVitais / ClinicalSafetyPanel / VitaisGraficos | três limiares diferentes → lib/limiaresVitais.ts | P
13. correção | Encaminhamentos.tsx:770; EncaminhamentoMedico.tsx:389-391,435 | contra-referência sem pre-wrap → whitespace-pre-wrap | P
14. correção | SegurancaAssistencial.tsx:32-35,53 | occurred_at calculado ao carregar o módulo → calcular ao montar | P
15. correção | Prescricoes.tsx:508-515,750,198 | tipo do modelo ignorado → Select de tipo, gravar e usar no título do PDF | P
16. correção | Prontuarios.tsx:3063-3069 | procedimentos dependem da URL → usar currentProntuario.agendamento_id | P
17. design | Prontuarios.tsx:2535-2566 | lista de evoluções sem rascunho/assinada nem médico → fichas com selo e filtros | P
18. design | Prontuarios.tsx:2480,2508,2589-2591 | aba "Ficha" duplicada → remover e pôr "Editar cadastro" na lateral | P
19. design | Prontuarios.tsx:191-202,260,3266-3268 | ícones em degradê; PA e FC sempre vermelhas → neutros; vermelho só acima do limiar | P
20. design | Prontuarios / ClinicalSafetyPanel | botões de 24–28 px, X sem aria, texto de 9–10 px → tamanhos mínimos e aria | P
21. design | Prontuarios.tsx:2704,2727-2789,3329-3371 | atendimento apertado no 390 px → menu "Mais", faixas recolhidas, rodapé fixo | M
22. design | Prontuarios.tsx:2794-2804 | CPF completo, "34a", selo LGPD decorativo, "0 anos" → mascarar CPF, idade por extenso ou em meses, alergia na faixa | P
23. design | Prescricoes / Atestados / Encaminhamentos | tabelas no celular → fichas | M
24. design | Atestados / Encaminhamentos / Templates / EncaminhamentoMedico | gradiente e cores cruas → chip preto e tokens | P
25. design | VerificarAssinatura.tsx:57,61,93-97 | azul antigo; hash pequeno; sem clínica emissora → fundo gelo, botão copiar, clínica | P | banco (RPC devolver o nome da clínica)
26. design | Prescricoes.tsx:172-192 | PDF em azul → preto e grafite | P
27. design | Atestados.tsx:410-432 | emitir e imprimir em passos separados → "Emitir e imprimir" | P
28. design | Atestados.tsx:886-899 | modelo é div clicável → button | P
29. design | Encaminhamentos.tsx:353-512 | tela empilhada → lista única filtrável | M
30. design | EncaminhamentoMedico.tsx:160-165,503-510 | médico de destino sem nome → incluir o nome | P
31. feature | Prontuarios / Templates | modelos SOAP editáveis pela clínica | M | banco
32. feature | Prontuarios.tsx:1245-1252 | "Copiar da última evolução" | P
33. feature | Prontuarios | atalhos Ctrl+S, Ctrl+Enter e Alt+1…9 | P
34. feature | Prontuarios | ditado (Web Speech pt-BR) nas caixas de texto | M
35. feature | Prescricoes | medicamentos estruturados (base CMED) | G | banco
36. feature | Prescricoes.tsx:1335-1405 | "Renovar receita" | P
37. feature | Prescricoes.tsx:140-283 | PDF de controle especial em 2 vias e de antimicrobiano | M
38. feature | pdfGenerator.ts:689-990 | rodapé de assinatura e adendos no PDF do prontuário | M
39. feature | DigitalSignature | assinatura verificável também para receita e atestado | G | banco
40. feature | DigitalSignature | ICP-Brasil em nuvem | G | banco
41. feature | Atestados / Prescricoes | pré-visualizar o PDF | P
42. feature | Atestados.tsx:950-967 | comparecimento preenchido pelo check-in | P
43. feature | Encaminhamentos | PDF da carta de encaminhamento + WhatsApp | M
44. feature | EncaminhamentoMedico.tsx:131-142 | preencher o encaminhamento a partir da evolução | P
45. feature | EncaminhamentoMedico.tsx:87-104 | especialidades da clínica | P
46. feature | VitaisGraficos | curvas de crescimento da OMS | M
47. feature | VitaisGraficos | faixa normal nos gráficos + exportar e imprimir | P
48. feature | Interoperabilidade.tsx:116-122 | filtros e histórico da exportação FHIR | M
49. feature | SegurancaAssistencial | painel mensal + exportação NOTIVISA | M
50. feature | SegurancaAssistencialDetalhe | análise de causa e plano de ação | G | banco
