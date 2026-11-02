## 10: Equipe, configurações e conta (Q)

Formato: tipo | arquivo:linha | o que fazer | esforço | banco (quando houver)

1. correção | Configuracoes.tsx:604 | "Escolher plano" ilegível, texto preto sobre fundo preto → text-white + teste | P
2. correção | Configuracoes.tsx:467,324-380 | selo "Salvo" mesmo com edição pendente; sem guarda de saída → detectar alteração + UnsavedChangesGuard | M
3. correção | lib/auditTrail.ts:192-196; AuditLog.tsx:104-108 | erro de leitura aparece como lista vazia; limite de 500 sem aviso → ErrorState + aviso do limite | P
4. correção | AuditLog.tsx:100-101,244,211 | datas no fuso do aparelho; busca por e-mail não funciona → fuso de São Paulo; corrigir a busca | P
5. correção | ConvitesList.tsx:183,260-267,287 | cópias de convite reenviado → agrupar por e-mail e corrigir a contagem | M
6. correção | functions/invite-employee:115 | URL do convite fixa no código → APP_URL vindo da origem (a edge function pode mudar; não é migration) | P
7. correção | AceitarConvite.tsx:422,166-175 | mínimo de senha divergente; troca de sessão sem aviso → PASSWORD_MIN_LENGTH + aviso | P
8. correção | ConvidarFuncionario.tsx:89,70 | e-mail sem trim; returnTo ignorado → corrigir os dois | P
9. correção | Funcionarios.tsx:786,572 | carregamento do convite em todas as linhas; cargo sobrescrito → por linha; preencher só se vazio | P
10. correção | Funcionarios.tsx:66,269-321 | "Médico" cadastrado só como funcionário → levar ao cadastro de médico | M
11. correção | Medicos.tsx:182-185,201,250-253 | números do perfil errados → consulta do dia + contagens no servidor | M
12. correção | Medicos.tsx:583-591,990,1128 | upload sem limite e caminho sem a clínica → 2 MB, png/jpg/webp, caminho clinica/medicos/uuid, prévia | P
13. correção | MedicoAvailabilityManager.tsx:82-134,246 | blocos sobrepostos; step 15 → impedir sobreposição; step 5 | P
14. correção | useSubscriptionPlan.ts:51 | assinatura lida pelo usuário, não pela clínica → RPC por clínica | M | banco
15. correção | ConfiguracoesAvancadas.tsx:495,531,689 | retenção padrão de 7 anos → 20 anos (Lei 13.787) + aviso | P
16. correção | PlanoCheckout.tsx:629-633,378-385 | código do plano no lugar do nome; CPF/CNPJ sem validação → nome do plano; validar (só UX, sem tocar na cobrança) | P
17. correção | PreferenciasPessoais.tsx:70-74,134 | mudança aplicada sem salvar; permissão de notificação nunca pedida → reverter ao sair + guarda; requestPermission | P
18. design | Funcionarios.tsx:692-815 | tabela no celular → fichas | M
19. design | ConvitesList.tsx:430-523 | tabela no celular; datas só relativas; sem busca → fichas, title com a data, busca | M
20. design | Configuracoes.tsx:419-431,488-497 | 11 abas → menu lateral + cartão "Outros módulos" | M
21. design | Medicos / Funcionarios | emojis → ícones | P
22. design | Planos.tsx:47,180,206,224,351 | sombras azuis → grafite; borda preta no plano atual | P
23. design | AcessoAssistido.tsx:303,59 | cores dos estados; fuso → cores certas; fuso de São Paulo | P
24. design | CentralSuporte.tsx:344-433 | detalhe do chamado no celular → rota /suporte/:id ou rolar até ele; altura no desktop | M
25. design | CentralSuporte.tsx:371-387 | SLA à vista da clínica → esconder; destacar "Aguardando sua resposta" | P
26. design | ConfiguracoesAvancadas.tsx:784,642-682,209-213,760 | abas fora da URL; labels; jargão; data → corrigir | P
27. design | PerfisDeAcesso.tsx:33-51 | coluna não fica fixa no celular → sticky + abreviar cabeçalhos | P
28. design | AuditLog.tsx:216,252,255 | altura fixa; +N oculto; campos com nome técnico → corrigir | P
29. design | Medicos.tsx:303-305 | atalhos sem filtro → ?medico= nas telas de destino | P
30. design | PlanoCheckout.tsx:283,516-528 | Pix vencido sem botão; cancelar sem confirmar → botão + confirmação | P
31. feature | Seguranca.tsx | trocar senha | P
32. feature | Configuracoes / Segurança | exigir 2FA | G | banco
33. feature | Funcionarios.tsx:45 | convite pendente na linha (cruzar com os convites) | M
34. feature | Funcionarios | último acesso | M | banco
35. feature | Medicos | reativar; aviso de consultas futuras ao inativar | P
36. feature | Medicos | especialidades da clínica + CBO | M | banco
37. feature | MedicoAvailabilityManager | copiar dia + modelos | M
38. feature | Equipe | exportar a equipe | P
39. feature | Medicos | documentos do profissional com validade | G | banco
40. feature | Convites | convite em lote + WhatsApp | M
41. feature | PerfisDeAcesso | contagem por perfil + filtro | P
42. feature | PerfisDeAcesso | visualizar como outro perfil | M
43. feature | Configuracoes.tsx:515-547 | upload do logo, máscaras e CEP | M
44. feature | Configuracoes / Impressão | pré-visualizar o receituário | M
45. feature | ConfiguracaoHistoricoPage | mostrar quem alterou + versionar mais chaves | M | banco
46. feature | Planos | comparativo e aviso de limites (só UX) | M
47. feature | OnboardingClinica | etapas novas | M | banco
48. feature | AcessoAssistido | duração escolhida + o que foi consultado | M | banco
49. feature | CentralSuporte | reabrir, nota e anexo | G | banco
50. feature | Treinamento | progresso da equipe | M | banco
