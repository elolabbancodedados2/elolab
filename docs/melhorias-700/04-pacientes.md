## 04: Pacientes, portal do paciente e LGPD (C)

Formato: tipo | arquivo:linha | o que fazer | esforço | banco (quando houver).

1. correção | Pacientes.tsx:1930,1965,1168 | alergias e comorbidades não aceitam vírgula; item vazio vira "Alergia" → guardar o texto digitado e converter no blur e ao salvar | P
2. correção | Pacientes.tsx:829-836 | CSV sem proteção contra fórmula → sanitizar | P
3. correção | Pacientes.tsx:1003-1008 | CPF comparado só em 2 formatos → usar cpf_digitos e gravar com máscara | P
4. correção | Pacientes.tsx:1122 | conferência de duplicados só no cadastro → também na edição (p_excluir) | P
5. correção | Pacientes.tsx:586,677,692 | data_emissao das prescrições se perde; recordName vazio → manter a data; usar selectedPaciente.nome | P
6. correção | Pacientes.tsx:2341,2343,2476,2484 | status e tipo crus; "..." fixo → rótulos; line-clamp | P
7. correção | Pacientes.tsx:2186,2247,2300 | agendamento pela ficha sem checagens → horário passado, duração do tipo, toast de sucesso, invalidar consultas | P
8. correção | PatientStatusPage.tsx:101-104 | invalidações incompletas → incluir as chaves que faltam | P
9. correção | Pacientes.tsx:1995-2002 | ficha mesclada abre normalmente → faixa "unificada em" e esconder ações | P
10. correção | PainelPaciente.tsx:54,69 | chave de cache sem clínica e usuário; saldo para quem não tem acesso → corrigir a chave e o enabled | P
11. correção | ExtratoDoPaciente.tsx:96-105 | qualquer erro vira "sem acesso" → ErrorState; 42501 só quando for permissão | P
12. correção | PortalPacientesClinica.tsx:35; PatientPortalLinkPage.tsx:57 | link do portal montado de duas formas → montarLinkPortal único | P
13. correção | PortalPaciente.tsx:1779-1782 | wa.me sem número → ir para a aba Agendar | P
14. correção | PortalPaciente.tsx:273-295,1982 | pesquisa com legenda de NPS e sempre visível → "Ruim/Ótima", só após consulta e uma vez | P
15. correção | PortalPaciente.tsx:1929,784,1162,1172,1426 | fuso do aparelho → horário e "hoje" de São Paulo | P
16. correção | ConsentimentoLGPDTaskPage.tsx:101-105 | "tratamento de dados" obrigatório não é exigido → exigir | P
17. correção | patientConsent / Relacionamento | consentimento de marketing nunca é consultado → filtrar as campanhas | M | banco
18. design | PatientListTable.tsx:160-189 | seis botões por cartão no celular → 2 + menu "Mais" | M
19. design | Pacientes / PatientListTable / PainelPaciente | nome social, "34a", ♂/♀ → nome social em destaque, "34 anos", sexo por extenso | P
20. design | Pacientes.tsx:2023,2091; PatientListTable.tsx:269 | CPF inteiro → mascarado, com botão de mostrar e auditoria | P
21. design | Pacientes.tsx:2042-2055 | nove abas de 11 px → barra rolável, 7 abas | M
22. design | Pacientes.tsx:1998-2001 | ações espalhadas → barra de ações no topo da ficha | P
23. design | Pacientes.tsx:1598-1615,1028-1107 | erros só por toast → erro inline com foco | M
24. design | Pacientes.tsx:1636,1655,1786 | teclado errado no celular → inputMode e autoComplete | P
25. design | Pacientes.tsx:2801-2815 | diálogo de duplicados sem atalho → "Abrir ficha" e selos | P
26. design | Pacientes.tsx:2183-2229,2382-2406 | formulários pequenos → 44 px e 1 coluna no celular | P
27. design | Pacientes.tsx:2316-2356 | consultas futuras e passadas misturadas → "Próximas" e "Histórico" | P
28. design | PortalPaciente.tsx:130,1072,1078,1806 | "EloLab" no lugar da clínica; sem nome social → nome da clínica e nome social | P | banco (get_profile devolver a clínica)
29. design | PortalPaciente.tsx:1340-1369,1920-1980 | abas demais no celular → subir as vagas; barra inferior | M
30. design | PortalPaciente.tsx:1395,1416,1193 | labels sem vínculo; select nativo → htmlFor e Select do app | P
31. design | PortalPacientesClinica.tsx; LgpdPacientes.tsx:338,383 | tela duplicada; gradiente → unificar com o fluxo do link; botão preto | M
32. feature | Pacientes (nova aba) | aba "Documentos" | M
33. feature | Pacientes.tsx:1620 | foto do paciente (webcam) | P
34. feature | Pacientes / PatientListTable | alerta de validade da carteirinha | P
35. feature | Pacientes | filtro de aniversariantes + parabéns em lote | M | banco
36. feature | Pacientes | etiquetas | M | banco
37. feature | PatientListTable / Pacientes | modelos de mensagem no WhatsApp | M
38. feature | Pacientes | "Registrar contato" | M | banco
39. feature | Pacientes.tsx:1185-1196 | auditoria do cadastro (diferença salva) | P
40. feature | Pacientes | CNS, RG, contato de emergência e origem | M | banco
41. feature | Pacientes | imprimir ficha com o termo | P
42. feature | ConsentimentoLGPDTaskPage | assinatura na tela, PDF e versão do termo | M | banco
43. feature | PortalPaciente | privacidade no portal | M | banco
44. feature | PortalPaciente | entrada com CPF + nascimento + código | G | banco
45. feature | PortalPaciente | próximos horários livres em 14 dias | P
46. feature | PortalPaciente.tsx:748 | motivo do cancelamento + remarcar | P
47. feature | Pacientes / PatientListTable | status do link do portal | P | banco
48. feature | PortalPaciente | recibo e Pix no portal | M | banco
49. feature | ExtratoDoPaciente | ações no extrato e declaração para o IR | M
50. feature | LgpdPacientes.tsx:428-451 | prazo legal dos pedidos + PDF legível | M
