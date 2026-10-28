# 01 — Produto e domínio (PM, PO, BA, especialista em clínicas, laboratórios e odonto)

Data: 27/10/2026. Base: worktree `admin-finance-realtime`, branch `feat/recepcao-painel-dia-melhorias`, com leitura estática do código. Não executei a aplicação, não fiz chamadas ao Supabase e não usei dados de pacientes.

Legenda: **declarado** = landing, comentário ou documento; **implementado** = código presente; **testado** = teste automatizado no repositório. Nesta rodada não houve execução real, então toda jornada aparece como NÃO EXECUTADO, com a evidência do código.

## 1. Mapa de jornadas

| Jornada | Status | Evidência (implementado / testado) | Observação de domínio |
|---|---|---|---|
| Contratar e ativar | NÃO EXECUTADO | Trial ou compra em `supabase/functions/public-checkout/index.ts:47,76`. Checkout autenticado em `src/App.tsx:236`. Bloqueio por assinatura em `src/components/SubscriptionGuard.tsx:36`. Testes `planCheckout`, `platformPlanOrders` e `mercadoPagoWebhookRouting` | Onboarding em `src/App.tsx:314`. O trial depende de Brevo (`public-checkout/index.ts:252`) |
| Marcar | NÃO EXECUTADO | O diálogo checa conflito de médico, paciente e sala (`src/components/agenda/AppointmentDialog.tsx:159-201`). Há constraint no banco (`supabase/migrations/20260728140000_agenda_sem_dupla_marcacao.sql`, `20261008380000_agenda_evitar_conflito_de_paciente_e_sala.sql`). O agendamento público fica em `src/App.tsx:233` | O link público reaproveita o paciente só pelo CPF (`supabase/functions/public-booking/index.ts:197`). Ver CLIN-QA-102 |
| Confirmar | NÃO EXECUTADO | Confirmação ou cancelamento pelo portal em `supabase/functions/patient-portal/index.ts:795,853`. Aviso por e-mail ou WhatsApp em `appointment-confirmation/index.ts:144-160` | A mensagem de WhatsApp tem emojis (`appointment-confirmation/index.ts:160`), o que contraria a direção sóbria |
| Recepcionar | NÃO EXECUTADO | Check-in com cobrança atômica (`src/lib/checkinWithBilling.ts:35-97`, `src/lib/autoBilling.ts:404`). Recibo em `src/pages/Recepcao.tsx:850`. Teste `checkinWithBilling.test.ts` | Em produção, o vínculo `tipo_consulta_id` está aplicado e o código correspondente não foi publicado (memória de produção de 27/10). NÃO VERIFICADO no deploy |
| Atender | NÃO EXECUTADO | `iniciar_atendimento_atomico`, `concluir_fila_atomico` e `marcar_atendimento_nao_realizado` em `src/lib/operationalTransitions.ts:60,96,120`. Teste `operationalTransitions.test.ts` | — |
| Prontuário | NÃO EXECUTADO | Assinatura verificável com hash (`src/components/clinical/DigitalSignature.tsx:79`). Dependências do prontuário assinado ficam bloqueadas (`supabase/migrations/20261011160000_prontuario_integridade_assinado.sql:38`). Há adendos e auditoria de leitura (`prontuarioAuditReadCoverage.test.ts`) | Não existe ICP-Brasil: só assinatura eletrônica simples (`DigitalSignature.tsx:29-41`) |
| Prescrever e solicitar exame | NÃO EXECUTADO | Memed em `src/pages/Prescricoes.tsx:704` e `supabase/functions/memed-prescription/index.ts:46,65` (ambiente padrão `homologacao`). Pedido de laboratório em `src/pages/laboratorio/PedidosLaboratorioPanel.tsx:137` | Memed fora de produção. O verificador de interações é uma lista fixa de 11 pares (`src/components/clinical/DrugInteractionChecker.tsx:61`) e não mostra nada quando não encontra um par (`:180-181`). Ver CLIN-QA-106 |
| Coletar e laudar | NÃO EXECUTADO | Eventos e recoleta da amostra em `src/pages/MapaColeta.tsx:311`. A liberação exige o status `validado` no servidor (`supabase/migrations/20261011180000_integridade_tenant_laboratorio.sql:396-412`) e na tela (`src/pages/LaudosLab.tsx:210-224`). Testes `laudoWorkflow`, `mapaColetaWorkflow` e `laboratorioIntegridadeTenantMigration` | A etiqueta só imprime o código em texto, sem código de barras (`MapaColeta.tsx:346`), enquanto a landing promete "código de barras" (`src/pages/LandingPage.tsx:90,209`). O RPC não separa quem valida de quem libera (`:402` exige só `can_access_clinical`) |
| Cobrar | NÃO EXECUTADO | Abertura e fechamento de caixa em `src/pages/CaixaDiario.tsx:657,686`. Estorno em `src/pages/ContasReceber.tsx:592`. Maquininha em `src/components/financeiro/MercadoPagoPointPayment.tsx:26` | NÃO EXISTE Pix cobrado do paciente nem NFS-e |
| Faturar convênio | NÃO EXECUTADO (TISS XML: NÃO EXISTE) | Lote e glosas em `src/pages/FaturamentoConvenios.tsx:122,292`. A exportação gera um resumo, não um TISS (`:335-336`) | Autorização por e-mail ou registro manual (`src/components/AutorizacaoConvenioModal.tsx:100-118`), mas o texto da tela diz "você receberá a resposta" (`:293`). Ver CLIN-QA-109 |
| Repassar | NÃO EXECUTADO | Configuração, geração e aprovação em `src/pages/RepassesMedicos.tsx:61,124,163` | As migrations de repasse de 24/10 ficaram no `main` e não foram aplicadas (memória do roadmap). NÃO VERIFICADO em produção |
| Relatórios | NÃO EXECUTADO | `/relatorios` e `/relatorios/salvos` (`src/App.tsx:309-310`). A previsão de faltas se apresenta honestamente como "índice heurístico" (`src/pages/AnalisePreditiva.tsx:175`) | Não encontrei mock silencioso |
| Cancelar (consulta e assinatura) | NÃO EXECUTADO | Consulta: `alterar_status_agendamento_com_fila` (`src/components/agenda/AppointmentCard.tsx:151`). Assinatura: `cancel_subscription` (`supabase/functions/mercadopago-checkout/index.ts:116`, `src/pages/Planos.tsx:100`) | A exportação dos dados ao cancelar existe (`ExportacaoClinicaProtegida`). A retenção legal do prontuário após o churn requer avaliação especializada |

**Telas falsas, mocks e botões sem backend.** A busca por `Em breve`, `mock`, `Math.random` e `TODO` em `src` não encontrou mock silencioso. Os achados foram estes:

- A função `ai-medical-assistant` (`suggest_diagnosis` e `fill_prescription`, em `supabase/functions/ai-medical-assistant/index.ts:158,209`) não é chamada por nenhum arquivo de `src`. É backend sem tela, gera conduta clínica e envia dados à OpenAI (`:56`).
- O histórico de encaminhamentos falha em produção porque a tabela `encaminhamento_status_history` está ausente (`docs/AUDITORIA_MODULOS_QA.md:60,78`). Observado em 07/10; não reexecutado.
- Os testes de isolamento entre clínicas e de RBAC existem, mas foram pulados (`tests/isolamento-entre-clinicas.spec.ts:63`, `docs/AUDITORIA_MODULOS_QA.md:73-74`).

## 2. Requisitos por segmento

### 2.1 Clínicas pequenas e médias

| Must-have para vender | Existe | Falta |
|---|---|---|
| Agenda sem dupla marcação, confirmação e agendamento online | Sim (seção 1) | Smoke autenticado em produção |
| Prontuário com trilha de auditoria e assinatura | Assinatura simples verificável | ICP-Brasil e SBIS/CFM (requer avaliação especializada) |
| Prescrição digital | Memed integrado em homologação | Memed em produção, ou ICP próprio |
| Financeiro e caixa com recibo | Sim | NFS-e e Pix do paciente |
| Faturamento TISS | Lote e glosa | XML TISS ANS válido (requer avaliação especializada) |
| Isolamento comprovado | RLS e triggers de tenant | Execução dos testes pulados |

**Para virar referência:** TISS XML validado pelo schema, ICP-Brasil, certificação SBIS e um painel do dia que reduza faltas, com a métrica publicada.

### 2.2 Redes multiunidade

| Must-have | Existe | Falta |
|---|---|---|
| Hierarquia rede → unidade (cadastro, agenda e financeiro por unidade) | Não: o tenant tem um nível (`clinica_id`). `grep unidade_id` só retorna `ContasPagar.tsx` | Modelo de unidade, permissões por unidade e paciente compartilhado na rede (LGPD: requer avaliação especializada) |
| Consolidado gerencial da rede | Não | BI agregado entre unidades |
| SSO e provisionamento | Não | SAML/OIDC |
| Repasse e centro de custo por unidade | Repasse por médico | Dimensão de unidade |

**Para virar referência:** paciente único na rede com consentimento, transferência de agenda entre unidades e comparativo de unidades. A Clinicorp já publica um "ranking de unidades".

### 2.3 Laboratórios

| Must-have | Existe | Falta |
|---|---|---|
| Pedido, coleta, rastreio, recoleta, validação e liberação | Sim (seção 1) | Segregar quem valida de quem libera, com responsável técnico (RDC/ANVISA: requer avaliação especializada) |
| Etiqueta com código de barras | Não: a etiqueta é texto (`MapaColeta.tsx:346`) | Code128 ou QR na etiqueta e leitura por leitor |
| Interfaceamento de equipamentos (HL7/ASTM) | Não. Só há o cadastro de equipamentos (`GestaoLaboratorioPanel.tsx:119`) | Middleware de interfaceamento |
| Controle de qualidade (Westgard/CEQ) | NÃO VERIFICADO | Módulo de CQ |
| Faturamento TISS SP/SADT | Não | XML TISS |
| Laudo com assinatura do responsável | Assinatura simples | ICP-Brasil |

**Para virar referência:** interfaceamento com analisadores, delta-check, apoio a laboratórios parceiros e um portal do médico solicitante. É uma venda consultiva: nenhum LIS do benchmark publica preço.

### 2.4 Odonto e especialidades

| Must-have | Existe | Falta |
|---|---|---|
| Odontograma e plano de tratamento por dente ou face | Não (`grep odontograma` não encontra nada) | Odontograma, orçamento por procedimento e aprovação do paciente |
| Orçamento parcelado e financiamento | Financeiro genérico | Plano de pagamento vinculado ao tratamento |
| Ortodontia (manutenção recorrente) | Não | Contrato recorrente |
| Prontuário por especialidade | Templates (`/templates`) | Modelos especializados validados |
| App do profissional e do paciente | O app Expo está em desenvolvimento (memória: falta teste em aparelho) | Publicação nas lojas |

**Para virar referência:** odontograma integrado ao financeiro, com conversão do orçamento medida. Os concorrentes de odonto cobram por clínica (R$130–370/mês), não por profissional.

## 3. Benchmark público (coleta em 27/10/2026)

| Produto | Preço publicado | Módulos | TISS | ICP | Multiunidade | App | Prova social | Fonte |
|---|---|---|---|---|---|---|---|---|
| Feegow | R$129 / 199 / 249 por profissional/mês; 10+ sob consulta | Agenda, PEP com IA, financeiro, glosas, NFS-e | Guia TISS desde o Starter | "Assinatura digital" (ICP não citado) | "Multiclínica" | Não encontrado | SBIS NGS2 (2021) | feegowclinic.com.br/precos-e-planos/ |
| iClinic | R$99 / 129 / 169 / 299 por profissional/mês | Agenda, PEP, prescrição, repasse, estoque | A partir do Plus | Sim, A1/A3 (central de ajuda) | Citada | Não encontrado | +70 mil profissionais | iclinic.com.br/precos/ |
| Doctoralia Pro | R$429 / 529 / 679 por mês (anual) | Marketplace, agendamento, prontuário (Plus+) | Não encontrado (fica no Feegow) | Não encontrado | Não encontrado | App do paciente | +280 mil clientes no mundo | pro.doctoralia.com.br/preco |
| Amplimed | Sob consulta | PEP por especialidade, repasse, NFS-e, IA | Sim ("até 99% menos glosas") | Sim | Não encontrado | Portal do paciente | +70 mil usuários | amplimed.com.br/planos/ |
| ProDoctor | A partir de R$135 / R$215; Corp sob consulta | PEP, laudos, filas, painel, API | Básico e Avançado | Sim, todos os planos | "Multilocal" (add-on) | Apps para licenciados | +65 mil clientes | prodoctor.net/precos |
| Ninsaúde | Sob consulta | PEP, faturamento, CRM, Sign, franquias | "Faturamento de guias" | "Sign" (ICP não citado) | Perfil de franquias | Não encontrado | Logos de clientes | ninsaude.com |
| Clinicorp | R$159,90 / R$369,90 por clínica/mês; Enterprise sob consulta | Agenda, PEP, Clinipay (Pix e boleto), IA | Não encontrado | Assinatura do profissional | Sim, com ranking de unidades | Profissional e paciente | +32 mil clínicas | clinicorp.com/planos |
| Simples Dental | R$149,90–349,90 por mês; Redes sob consulta | Agenda, PEP, ortodontia, CRM, NFS-e (add-on) | Não encontrado | Assinatura eletrônica | Plano Redes | Dentista e paciente | +19 mil clínicas | simplesdental.com/planos-e-precos |
| Shift (LIS) | Sob consulta | Coleta, produção, laudos, BI, faturamento | Não encontrado | Não encontrado | Caso de rede em 15 UFs | Não encontrado | 580 mi exames/ano | shift.com.br |
| Matrix (LIS) | Não encontrado | LIS e CQ (parceria Controllab) | Não encontrado | Não encontrado | Atende redes | Não encontrado | Adquirida pela Perseus/Constellation em 11/2024 | businesswire.com/news/home/20241120291506/en |
| Pleres / Korus (LIS) | Não encontrado | Análises clínicas e imagem | Não encontrado | Não encontrado | Não encontrado | Não encontrado | Não encontrado | pleres.net |

O que o benchmark mostra:

- **Commodity:** agenda, PEP, agendamento online, WhatsApp e IA.
- **TISS e ICP separam o plano de entrada do plano médio:** a iClinic só libera TISS a partir do Plus, e a ProDoctor oferece ICP em todos os planos.
- **Prova social pública:** números de usuários; SBIS só aparece publicada pela Feegow.
- **Lacunas da coleta:** não achei preço do Ninsaúde, a lista da SBIS deu 404, o domínio da Matrix não resolveu e a ligação entre Pleres e Pixeon está NÃO VERIFICADA.

## 4. Backlog de produto

| ID | Gravidade | Achado e evidência | Impacto | Proposta | Esforço | Teste de aceite | Dono |
|---|---|---|---|---|---|---|---|
| CLIN-QA-101 | **P0** | Isolamento entre clínicas e RBAC nunca testados ponta a ponta: cenários pulados (`tests/isolamento-entre-clinicas.spec.ts:63`, `docs/AUDITORIA_MODULOS_QA.md:73-74`) | Risco cross-tenant não descartado; inviabiliza a venda para redes e laboratórios | Homologação com duas clínicas e cinco perfis; rodar `isolamento`, `rls` e `perfis-rbac` no CI | M | 100% dos cenários executados, sem skip, e zero leitura cruzada | Eng + QA |
| CLIN-QA-102 | P1 | O agendamento público vincula ao paciente existente só pelo CPF, sem conferir nome ou data de nascimento (`public-booking/index.ts:197`) | Consulta no prontuário de outro paciente (paciente errado) | Exigir a correspondência de nome e nascimento; sem ela, criar uma pendência na recepção | S | Um CPF existente com nome diferente não vincula e gera pendência | PO Agenda |
| CLIN-QA-103 | P1 | O WhatsApp vincula o paciente pelos últimos 8–9 dígitos do telefone, com `limit 1` e sem ordenação (`whatsapp-webhook/index.ts:176`). Depois agenda e consulta por esse vínculo (`:886-890,994`), e a consulta retorna `medicos(crm, especialidade)`, contrariando a regra de `:334` | Paciente errado: familiares com o mesmo telefone e exposição de dado de saúde | Exigir confirmação de identidade (CPF + nascimento) antes de qualquer ação; tratar o telefone compartilhado | M | Dois pacientes com o mesmo telefone: o bot pede identificação e não revela agendamentos | PO WhatsApp + DPO |
| CLIN-QA-104 | P1 | Esquema divergente: 15 tabelas locais ausentes na VPS, histórico de encaminhamentos quebrado (`docs/AUDITORIA_MODULOS_QA.md:60-67,78`) e migrations de 24/10 não aplicadas | Funções podem falhar em produção; perda de rastreabilidade | Staging espelho; um gate de deploy que compare o esquema; aplicar as migrations com backup | M | `check:colunas` com SCHEMA_REAL sem divergências | Eng/DevOps |
| CLIN-QA-105 | P1 | A landing promete código de barras (`LandingPage.tsx:90,209`), mas a etiqueta é texto (`MapaColeta.tsx:346`) | Promessa falsa ao laboratório; risco de troca de amostra na leitura manual | Imprimir Code128 ou QR e aceitar leitura por leitor na coleta e na bancada; até lá, ajustar o texto da landing | S | A etiqueta lida pelo leitor abre a amostra correta | PO Lab |
| CLIN-QA-106 | P2 | Interações com 11 pares fixos e silêncio quando não há par (`DrugInteractionChecker.tsx:61,180`) | Falsa sensação de cobertura | Mostrar o escopo da checagem ou usar uma base licenciada (requer avaliação especializada) | S/L | A tela informa a cobertura | PO Clínico |
| CLIN-QA-107 | P2 | `ai-medical-assistant` sugere diagnóstico e prescrição via OpenAI, sem tela (`ai-medical-assistant/index.ts:56,158,209`) | Conduta clínica gerada por IA e dados enviados a terceiro (LGPD: requer avaliação especializada) | Desativar a função ou documentar a governança; não expor sem avaliação | S | A função fica inacessível ou passa a ter consentimento e registro | PM + DPO |
| CLIN-QA-108 | P2 | O mesmo perfil clínico valida e libera o resultado (`20261011180000…sql:402`) | Sem dupla checagem no laudo | Segregar funções e registrar o responsável técnico (requer avaliação especializada) | M | O usuário que validou não consegue liberar | PO Lab |
| CLIN-QA-109 | P2 | O texto da autorização promete uma resposta que o sistema não recebe (`AutorizacaoConvenioModal.tsx:293` versus `:116-118`) | Expectativa falsa na recepção | Trocar por "registre a resposta da operadora quando chegar" | S | O texto bate com o fluxo | UX |
| CLIN-QA-110 | P1 (comercial) | Não existe TISS XML ANS (`FaturamentoConvenios.tsx:335-336`) | Bloqueia clínicas com convênio e laboratórios | Gerar XML no schema ANS vigente e validar com XSD (requer avaliação especializada) | L | XML válido no XSD oficial e aceito em uma operadora piloto | PO Faturamento |
| CLIN-QA-111 | P1 (comercial) | Não existe ICP-Brasil (`DigitalSignature.tsx:29-41`) | Prescrição controlada, laudo e prontuário sem papel ficam bloqueados | Integrar um provedor de assinatura ICP em nuvem (requer avaliação especializada) | L | Documento validado no validador ITI | PO Clínico |
| CLIN-QA-112 | P2 | Não existe multiunidade (tenant `clinica_id`) | Bloqueia redes | Camada "organização" acima da clínica, com escopo de unidade | L | Um usuário de rede vê o consolidado; o de unidade vê só a sua | Arquiteto + PO |
| CLIN-QA-113 | P2 | Não existem odontograma, NFS-e nem Pix do paciente | Bloqueia odonto e reduz a conversão | Odontograma (M/L); NFS-e via agregador (M); Pix com o token da clínica (M) | L | Fluxo do orçamento até o recebimento | PO por módulo |
| CLIN-QA-114 | P3 | Emojis nas mensagens de WhatsApp (`appointment-confirmation/index.ts:160`, `whatsapp-webhook/index.ts:1017`) | Contraria a direção sóbria | Templates formais | S | Nenhum emoji nos templates | UX |
| CLIN-QA-115 | P2 | WhatsApp via Evolution API (`appointment-confirmation/index.ts:144`); o uso de Cloud API oficial está NÃO VERIFICADO | Risco de bloqueio do número em escala | Avaliar a WhatsApp Cloud API oficial | M | Envio por um provedor oficial | Eng |

Não encontrei P0 de paciente, resultado ou prescrição errado comprovado. A liberação de resultado está protegida no servidor, e o tenant do laboratório é validado por triggers. O P0 registrado é a **ausência de prova** do isolamento.

## 5. Hipóteses de diferencial

| # | Hipótese | Métrica | Validação com clínicas reais |
|---|---|---|---|
| H1 | Check-in com cobrança atômica e painel do dia reduzem as consultas "atendidas e não cobradas" | Percentual de atendimentos sem lançamento em D+1 | Medir 30 dias antes e depois em 3 clínicas piloto, com dados agregados |
| H2 | Clínica e laboratório no mesmo sistema (pedido → coleta → laudo → prontuário) atraem clínicas com coleta própria | Tempo do pedido até o laudo no prontuário; nº de digitações duplicadas | Mapear o fluxo em 2 clínicas com posto de coleta; cronometrar |
| H3 | TISS XML + glosa no plano de entrada (concorrentes cobram mais por isso) acelera a conversão de clínicas com convênio | Taxa de conversão trial → pago nas clínicas com convênio | Teste A/B de oferta na landing, depois do CLIN-QA-110 |
| H4 | Transparência (preço por clínica, confiabilidade e auditoria publicadas) reduz a objeção de "parecer amador" | Taxa de demo → proposta e objeções registradas no CRM | Entrevistas com 10 prospects antes e depois da página de confiança |
| H5 | O portal do paciente com confirmação e dependentes reduz faltas | Taxa de no-show | Comparar clínicas com e sem o portal ativo por 60 dias |

## Não realizado

- Execução da aplicação, smoke autenticado, testes E2E, RLS ou isolamento: todas as jornadas ficaram como NÃO EXECUTADO.
- Verificação do que está publicado na VPS (versão do container, migrations aplicadas): só a memória de 27/10 e a auditoria de 07/10.
- Checagem de quem pode mudar o status da coleta para `validado` e de controle de qualidade laboratorial: NÃO VERIFICADO.
- Branch `origin/feat/mobile-web` e app Expo: não inspecionados.
- Benchmark: preço do Ninsaúde, lista oficial da SBIS (404), site da Matrix (domínio não resolveu), vínculo Pleres/Pixeon e apps de vários concorrentes ficaram não encontrados. Nenhum dado de concorrente foi testado em uso.
- Avaliação regulatória (ANS/TISS, ICP-Brasil, SBIS/CFM, LGPD, ANVISA/RDC de laboratório): requer avaliação especializada.
