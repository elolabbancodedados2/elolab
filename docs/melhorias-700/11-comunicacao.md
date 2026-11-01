## 11: Comunicação, automações, WhatsApp, atendente de IA, campanhas e chat (M)

Formato: tipo | arquivo:linha | o que fazer | esforço | banco (quando houver).

1. correção | useChatInterno.ts:381-385 | update de lida_em nunca é executado → await | P
2. correção | useChatInterno.ts:140-155; ChatInterno.tsx:96-97 | conversa com inativo some, mas não lidas continuam contando → mostrar com o selo Inativo | P
3. correção | useChatInterno.ts:106 | conversas vazias primeiro → nullsFirst:false | P
4. correção | useChatInterno.ts:366-427 | recarga a cada evento → debounce, filtrar o canal, atualizar só o recibo local | P
5. correção | ChatInterno.tsx:204-211 | sem estado de carregamento → skeleton | P
6. correção | Automacoes.tsx:104-184 | 3 automações escondidas → incluir os cartões | P
7. correção | Automacoes.tsx:442-451 | toast errado → "adicionadas à fila", com link "Ver fila" | P
8. correção | Automacoes.tsx:296,833 | "Repetir" reenvia campanha cancelada → bloquear | P
9. correção | ConversationsTab.tsx:130,168 | contagem de Encerradas ≠ filtro → filtro composto | P
10. correção | ConversationsTab / SessionsTab | carregamento global trava todos os botões → por id | P
11. correção | ConversationsTab.tsx:92-96,233 | conversa aberta não marca como lida → marcar com trava | P
12. correção | SessionsTab.tsx:162 | agente inativo some do select → mostrar "(inativo)" + aviso | P
13. correção | AgentsTab.tsx:56-59,373-376 | salva sem validar → validar + confirmar a troca de agente | P
14. correção | AgentsTab.tsx:201-208,325-332 | mensagens de fora do horário e de encerramento escondidas → campos | P
15. correção | KnowledgeBaseEditor.tsx:47-52,151 | erro aparece como vazio → ErrorState | P
16. correção | Relacionamento.tsx:199-205 | gráfico com 11 meses (fuso) → montar a data como texto | P
17. correção | relacionamento.ts:164; Relacionamento.tsx:659 | "Na fila" para sempre → Concluída ou "Enviando x de y" + refetch | P
18. correção | TemplatesEmail.tsx:45-52; templatePreview.ts | paleta com variáveis que a categoria não aceita → filtrar pela categoria | P
19. design | AgenteIA / StatsCards | 12 cartões → faixa compacta | P
20. design | ConversationsTab.tsx:206-298 | conversa abre embaixo da lista → duas colunas; tela cheia no celular | M
21. design | ConversationsTab.tsx:210,254 | status cru; prioridade sem destaque → rótulos e selo de urgente | P
22. design | ConversationsTab.tsx:424; ChatInterno.tsx:574 | Input de uma linha → Textarea que cresce | P
23. design | AgentsTab / ChatInterno / useChatInterno | emojis → ícones | P
24. design | AgentsTab.tsx:177-238,274-281 | Label sem htmlFor → id/htmlFor | P
25. design | Automacoes.tsx:476-485,734,827-829 | valores crus → rótulos e duração em segundos | P
26. design | Automacoes.tsx:540,583,842-864 | "Erros do navegador" fora de lugar → mover; indicador de falhas de envio | P
27. design | Automacoes.tsx:589-674 | cartões soltos → agrupar pela jornada + linha "Dispara:" | M
28. design | TemplatesEmail.tsx:741-752 | botão com "●/○"; "Template" e "modelo" → Switch; "modelo" | P
29. design | ChatInterno.tsx:533-572 | botões pequenos e sem aria → 44 px + aria | P
30. design | Relacionamento.tsx:636-697 | tabela no celular → fichas | M
31. design | CentralNotificacoes.tsx:96-108,176 | botões longos; sem grupos por dia → menu + grupos | P
32. feature | Automacoes.tsx:616-670 | interruptores de canal (WhatsApp/e-mail) | P
33. feature | Automacoes (aba Confirmações) | confirmações de amanhã | M
34. feature | migration jornada | textos editáveis | M | banco
35. feature | Automacoes | antecedência e janela de silêncio | M | banco
36. feature | Automacoes.tsx:231-234,812-838 | coluna Origem e filtros da fila | P
37. feature | Automacoes.tsx:832-835 | ações para envio "incerto" | P
38. feature | AgentsTab | testar o agente (simulate) | M
39. feature | AgentsTab | horário por dia da semana + feriados | M | banco
40. feature | ConversationsTab | respostas rápidas | M | banco
41. feature | ConversationsTab | transferir conversa | M | banco
42. feature | ConversationsTab | vincular paciente / abrir ficha / agendar | M
43. feature | useWhatsAppQueries | som e notificação de "aguardando" | P
44. feature | ConversationsTab | mídia e status de entrega | M
45. feature | ChatInterno | canais por setor | G | banco
46. feature | Relacionamento | enviar teste para mim | P | banco
47. feature | Relacionamento | interromper envio e duplicar | P | banco
48. feature | Relacionamento.tsx:884-897 | ações na lista de sem retorno + CSV | P
49. feature | Relacionamento | página de comentários do NPS | M
50. feature | TemplatesEmail.tsx:561-590 | restaurar versão | P
