# EloLab: estratégia por segmento e roadmap trimestral

Data: 27/10/2026
Autor: `product-manager` (rodada 1)
Base: `docs/estrategia/DIAGNOSTICO_16_FUNCOES.md` (veredito NO-GO para escala e GO CONDICIONAL para beta, seção G), `docs/estrategia/funcoes/01-produto-dominio.md` e as fontes públicas da seção 3, reconferidas nesta data.

Este documento não define solução técnica, que cabe ao `software-architect`, nem fixa prazo. Os trimestres indicam ordem e janela-alvo; a capacidade e as datas dependem de confirmação do `tech-lead`. Itens ANS/TISS, ICP-Brasil, SBIS/CFM, LGPD e RDC/ANVISA estão marcados como "requer avaliação especializada".

Convenções:

- **Observação**: fato com `caminho:linha`, comando ou URL.
- **Hipótese**: aposta a validar, sempre com métrica e método de validação.
- IDs `CLIN-QA-0xx` são os consolidados do diagnóstico (seção D).

---

## 1. Princípios de priorização

1. **Estabilização antes de diferenciação.** Nenhuma iniciativa de diferenciação ou de novo segmento começa antes do gate de saída da estabilização: zero P0 aberto, CI de isolamento verde sem skip e smoke das jornadas críticas sem falha (diagnóstico F.2, linha 322).
2. **Segmentos em ordem e com gates.** A ordem é clínicas pequenas e médias, depois redes, laboratórios e, por último, odonto (diagnóstico F.6, linhas 362-367). Um segmento só é vendido como "produto pronto" depois que todos os itens do seu gate tiverem a prova exigida.
3. **Não vender o que não existe.** Landing, demo e proposta comercial não podem prometer TISS, ICP-Brasil, código de barras, multiunidade, odontograma, NFS-e ou Pix do paciente enquanto esses itens estiverem ausentes (diagnóstico G, condição 4).
4. **O gate vale mais que a pontuação.** Os itens de gate não entram no RICE: são pré-requisitos, ordenados por custo do atraso. O RICE ordena apenas o que vem depois de cada gate.

---

## 2. Segmentos

### 2.1 Clínicas pequenas e médias (1º segmento)

| Campo | Conteúdo |
|---|---|
| **Problema** | Recepção, agenda, atendimento e caixa ficam em ferramentas separadas (planilha, agenda de papel, WhatsApp pessoal, maquininha). O atendimento acontece e a cobrança se perde, e o gestor não sabe o resultado do dia. É hipótese, a validar nas entrevistas de UX (CLIN-QA-034 e diagnóstico F.3, item 60.2) |
| **ICP do beta (decisão D-01)** | Clínica particular ou de baixa dependência de convênio, com 1 a 5 profissionais e recepção própria, que agende pelo WhatsApp e não precise de prescrição controlada digital com ICP. Esse recorte foi escolhido porque TISS (CLIN-QA-010) e ICP-Brasil (CLIN-QA-011) não existem, e o beta não pode prometê-los (diagnóstico G, condição 4) |
| **ICP de comercialização (após T2)** | Clínica pequena ou média, com ou sem convênio, de 1 a 15 profissionais. A entrada de clínicas com convênio depende de TISS validado em uma operadora piloto |
| **Proposta de valor** | Um único sistema, do agendamento ao caixa: o check-in gera a cobrança na mesma transação (`src/lib/checkinWithBilling.ts:35-97`) e o painel do dia mostra a operação. O preço é cobrado por clínica, e não por profissional. **Observação**: os planos locais Pro e Ultra custam R$379 e R$499 por mês (`supabase/migrations/20261010230000_planos_pro_ultra_precos_e_recursos.sql:6,14`). O valor em produção está NÃO VERIFICADO |
| **Requisitos obrigatórios para vender** | (1) Os cinco P0 fechados (001 a 005). (2) Isolamento entre clínicas comprovado no CI (002). (3) Canais públicos com identificação por CPF e data de nascimento (003). (4) Backup fora da VPS com restauração medida (005). (5) Identificação do paciente nas telas que gravam dados (012). (6) Landing fiel ao produto (013, 018). (7) Para clínicas com convênio, TISS XML validado (010, requer avaliação especializada). (8) Para prescrição controlada, ICP-Brasil (011, requer avaliação especializada). (9) Para o plano médio, NFS-e e Pix do paciente (025) |
| **Gate do diagnóstico** | Zero P0; 30.1 verde; 30.9 sem falha crítica; 60.1 entregue; backup off-site com restauração medida. Prova: relatório de 30 dias do beta 90.4 (F.6, linha 364) |
| **Métrica de sucesso** | Norte: clínicas ativas por semana, ou seja, clínicas com pelo menos um check-in real na semana. Ativação: 4 passos do onboarding e 1 check-in real em até 7 dias (definição do 016, diagnóstico linha 206). Valor (H1): percentual de atendimentos sem lançamento financeiro em D+1. Retenção: clínicas ativas no mês 3 em relação às ativadas. Receita: MRR do segmento |

**Diferenciais propostos (hipóteses)**

| # | Hipótese de valor | Métrica | Validação com clínicas reais | Pré-requisito |
|---|---|---|---|---|
| H1 | O check-in com cobrança atômica reduz os atendimentos realizados e não cobrados | Percentual de atendimentos sem lançamento em D+1 | 3 clínicas do beta: 30 dias de linha de base e 30 dias de uso, só com dados agregados | Gate de estabilização |
| H5 | O portal com confirmação reduz faltas | Taxa de no-show | Comparação entre clínicas do beta com e sem portal ativo, por 60 dias | 001 e 003 |
| H4 | Transparência pública (preço por clínica, status page, histórico de disponibilidade) reduz a objeção de "parecer amador" | Taxa de demo para proposta; objeções registradas no CRM | 10 entrevistas com prospects antes e depois da página de confiança | 005, 015 e status page |
| H3 | TISS com controle de glosa no plano de entrada acelera a conversão de clínicas com convênio | Conversão de trial para pago nesse grupo | Teste A/B de oferta na landing | 010 aceito em operadora piloto |

### 2.2 Redes multiunidade (2º segmento)

| Campo | Conteúdo |
|---|---|
| **Problema** | O gestor da rede não tem visão consolidada, e cada unidade opera como uma ilha. O paciente que circula entre unidades é recadastrado. É hipótese, a validar em 5 entrevistas (CLIN-QA-034) |
| **ICP** | Rede com 2 a 10 unidades, gestão centralizada, faturamento de convênio e equipe que trabalha em mais de uma unidade |
| **Proposta de valor** | Consolidado gerencial da rede, com permissão por unidade e o mesmo fluxo de check-in com cobrança em cada uma. É hipótese: hoje não existe hierarquia rede → unidade (0 ocorrências de `unidade_id` em `src` e em `supabase/migrations`, diagnóstico C) |
| **Requisitos obrigatórios para vender** | Tudo do 2.1, mais: multiunidade com papéis por unidade (024, 008); TISS (010); ICP-Brasil (011); cache sem vazamento ao trocar de unidade (014); SSO conforme a demanda (026); regra jurídica para o paciente compartilhado entre unidades (LGPD, requer avaliação especializada) |
| **Gate do diagnóstico** | Gate de clínicas + 6m.4 + 008 + 90.1 + 90.2. Prova: pgTAP com unidades A e B, XML aceito em operadora, assinatura validada no ITI e uma rede piloto com 2 ou mais unidades (F.6, linha 365) |
| **Métrica de sucesso** | Unidades ativas por rede (unidade com check-in na semana); percentual de usuários de rede que acessam o consolidado semanalmente; retenção de logo em 12 meses; MRR por rede |
| **Status comercial** | NÃO VENDER como produto pronto. A landing `/redes` só pode ter formulário de interesse (6m.2) |

**Diferencial proposto (hipótese)**: um comparativo de unidades ligado ao caixa (atendido × cobrado por unidade) reduz o tempo de fechamento mensal da rede. Métrica: horas para fechar o mês. Validação: cronometrar o fechamento em uma rede piloto antes e depois. **Observação de mercado**: a Clinicorp lista "Gestão de unidades" e "Ranking de Unidades" (seção 3), o que mostra que o comparativo, sozinho, não é diferencial. O valor estaria na ligação com o atendido × cobrado.

### 2.3 Laboratórios (3º segmento)

| Campo | Conteúdo |
|---|---|
| **Problema** | Laboratórios e clínicas com posto de coleta redigitam pedido e resultado entre sistemas, e a identificação manual da amostra aumenta o risco de troca. É hipótese, a validar com 2 clínicas com posto de coleta (H2) |
| **ICP inicial** | Clínica com posto de coleta próprio ou laboratório pequeno de análises clínicas ligado a clínicas. Laboratórios de alto volume com interfaceamento extenso ficam fora do ICP até o 026 |
| **Proposta de valor** | Pedido → coleta → laudo → prontuário em um só sistema, com a liberação já protegida no servidor (`supabase/migrations/20261011180000_integridade_tenant_laboratorio.sql:396-412`) |
| **Requisitos obrigatórios para vender** | Tudo do 2.1, mais: código de barras na etiqueta e leitura por leitor (013), já que hoje a etiqueta é texto (`src/pages/MapaColeta.tsx:346-347`); segregação entre quem valida e quem libera, com responsável técnico (022, RDC/ANVISA, requer avaliação especializada); interfaceamento HL7/ASTM com um equipamento piloto (026); TISS SP/SADT (010); laudo com ICP-Brasil (011); controle de qualidade (NÃO VERIFICADO no código, diagnóstico 01 §2.3) |
| **Gate do diagnóstico** | Gate de clínicas + 6m.5 + 6m.6 + segregação + avaliação RDC. Prova: etiqueta lida em bancada e resultado de equipamento piloto sem redigitação (F.6, linha 366) |
| **Métrica de sucesso** | Tempo do pedido até o laudo no prontuário; digitações duplicadas por exame (meta: zero); amostras identificadas por leitura, e não manualmente; recoletas por erro de identificação |
| **Status comercial** | NÃO VENDER. Corrigir já a promessa de código de barras da landing (`src/pages/LandingPage.tsx:209`, CLIN-QA-013) |

### 2.4 Odonto e especialidades (4º segmento)

| Campo | Conteúdo |
|---|---|
| **Problema** | O orçamento do tratamento é feito fora do prontuário, e a aprovação e o recebimento parcelado não ficam ligados ao plano de tratamento. É hipótese, a validar em 5 entrevistas (CLIN-QA-034) |
| **ICP** | A definir no discovery. Candidato: consultório ou clínica odontológica de 1 a 5 cadeiras, com orçamento parcelado |
| **Proposta de valor** | Hipótese: odontograma ligado ao orçamento e ao caixa, com conversão de orçamento medida. **Observação**: o Simples Dental já publica controle de ortodontia e alinhadores, NFS-e e plano Redes (seção 3). A proposta precisa de diferencial próprio, que só o discovery pode indicar |
| **Requisitos obrigatórios para vender** | Tudo do 2.1, mais: odontograma (0 ocorrências, diagnóstico C); plano de tratamento por dente ou face ligado ao financeiro (025); orçamento parcelado; modelos de prontuário por especialidade validados por profissional habilitado |
| **Gate do diagnóstico** | Gate de clínicas + odontograma (6m.7), com o plano de tratamento ligado ao financeiro. Prova: fluxo completo em uma clínica odonto piloto (F.6, linha 367) |
| **Métrica de sucesso** | Taxa de conversão de orçamento em tratamento aprovado; recebimento sobre o valor aprovado; clínicas ativas por semana |
| **Status comercial** | NÃO VENDER. A construção só começa se o discovery 034 indicar "construir" |

---

## 3. Concorrentes: baseline público reconferido

Coleta em 27/10/2026 nos sites oficiais, via leitura automatizada da página. Registro apenas o que está publicado e não atribuo fraqueza sem dado observável. Quando a página não menciona um recurso, isso não prova que ele não exista.

| Concorrente | O que a página publica | URL | Diferença em relação ao baseline do diagnóstico |
|---|---|---|---|
| Feegow | Starter R$129, Plus R$199 e VIP R$249 por profissional/mês; Personalizado para 10 ou mais profissionais. TISS a partir do Starter. "Assinatura digital" no Plus, sem menção a ICP-Brasil. NFS-e no VIP, "mediante viabilidade da cidade de emissão". "Multiclínica" na comparação, sem indicar o plano | https://feegowclinic.com.br/precos-e-planos/ | Preço confirmado. A página abriu nesta coleta (o 04 havia relatado falha de TLS) |
| iClinic | Starter R$99, Plus R$129, Pro R$169 e Premium R$299 por profissional/mês. TISS a partir do Plus; "Não incluído" no Starter. "Assinatura Digital" em todos os planos, sem menção a ICP na página de preços. "Teste grátis por 5 dias, sem cartão" | https://iclinic.com.br/precos/ | Confirmado. O suporte a ICP A1/A3, citado no diagnóstico via central de ajuda, não foi reconferido |
| ProDoctor | Cloud "a partir de R$ 135,00"; +Clínica "a partir de R$ 215,00"; +Corp e Corp sob consulta. "Assinatura Digital no Padrão ICP-Brasil" nos quatro planos. TISS Básico no Cloud e Avançado nos demais. Multilocal com asterisco: "Serviços opcionais, contratados à parte" | https://prodoctor.net/precos | Confirmado |
| Clinicorp | Standard R$159,90/mês e Premium R$369,90/mês, com "custos adicionais conforme utilização" e "implementação personalizada obrigatória". Pix Cobrança e boleto em todos os planos. A comparação marca "Gestão de unidades" e "Ranking de Unidades" nos planos, mas o FAQ associa o ranking ao Enterprise. A página não usa o termo TISS | https://www.clinicorp.com/planos | A página não diz explicitamente "por clínica". A informação sobre unidades é contraditória na própria página |
| Simples Dental | Basic R$137,41, Plus R$229,08 e Pro R$320,74 por mês, com cobrança anual e 10% de desconto. Ortodontia e alinhadores no Plus. NFS-e no Plus, como "serviços pagos à parte". Plano Redes sem preço. "7 dias de forma gratuita, sem precisar cadastrar o cartão" | https://www.simplesdental.com/planos-e-precos | **Divergente**: o diagnóstico registrou R$149,90–349,90. Os valores atuais podem ser o equivalente mensal do plano anual; a confirmar. O plano em que o odontograma aparece não ficou legível |
| Doctoralia Pro, Amplimed, Ninsaúde, Shift, Matrix, Pleres | Não reconferidos nesta rodada. Valem os dados do diagnóstico (01 §3), coletados em 27/10/2026 e marcados como SÓ RELATADO | ver 01 §3 | — |

**Leituras para a estratégia (observação + inferência):**

1. **Preço por clínica × por profissional.** Para uma clínica com 3 profissionais, a conta é feita apenas com os valores publicados: Feegow Starter custa 3 × R$129 = R$387, iClinic Plus custa 3 × R$129 = R$387, e o EloLab Pro custa R$379 por clínica (valor local, NÃO VERIFICADO em produção). A comparação não considera módulos equivalentes. Inferência: o argumento de preço por clínica ganha força a partir de 3 profissionais, desde que o plano entregue o que o concorrente inclui (TISS).
2. **TISS e ICP separam o plano de entrada do plano médio.** A iClinic deixa o TISS fora do Starter, e a ProDoctor publica ICP-Brasil em todos os planos. Sem esses itens, o EloLab só disputa clínicas particulares, o que justifica a decisão D-01.
3. **Trial.** iClinic (5 dias) e Simples Dental (7 dias) publicam teste sem cartão. O EloLab exige cartão por 3 dias (`src/pages/LandingPage.tsx:197,603`). O impacto na conversão é hipótese (CLIN-QA-016) e só pode ser medido depois do analytics.
4. **Pix e unidades já aparecem publicados** na Clinicorp. Não são diferenciais, mas a ausência deles bloqueia a venda no plano médio e em redes.

---

## 4. Métricas de resultado e como medi-las

**Situação atual (observação):** não há analytics nem UTM (CLIN-QA-016, grep vazio por `gtag/posthog/utm_`), e o cadastro da clínica não tem atributo de segmento. Uma busca por `segmento|tipo_clinica|tipo_estabelecimento` em `supabase/migrations` devolveu 1 ocorrência, e ela é um comentário sem relação (`20261011000000_laboratorio_lis_foundation.sql:303`). Sem esse atributo, a receita por segmento não pode ser medida. A forma de registrar o atributo cabe ao `software-architect`.

| Métrica | Definição | Fonte até existir analytics | Fonte depois | Frequência | Meta inicial |
|---|---|---|---|---|---|
| Ativação | Clínica que conclui os 4 passos do onboarding e faz 1 check-in real em até 7 dias da conta criada | Consulta agregada no banco, sem PII, executada por quem tem acesso autorizado | Eventos com consentimento (60.6) | Semanal | Calibrar depois de 30 dias de linha de base. Hipótese para o beta: 4 de 5 clínicas ativadas |
| Clínicas ativas por semana (norte) | Clínica com pelo menos 1 check-in real na semana | Idem | Idem | Semanal | Crescimento semana a semana após o beta |
| Retenção | Clínicas ativas no mês 3 / ativadas na coorte; logo churn mensal | Assinaturas e check-ins agregados | Idem + health score (033) | Mensal por coorte | Calibrar com o beta |
| Valor H1 | Atendimentos concluídos sem lançamento em D+1 / atendimentos concluídos | Consulta agregada por clínica piloto | Painel interno | Semanal no beta | Queda em relação à linha de base de 30 dias |
| No-show H5 | Faltas / agendamentos | Agregado por clínica | Idem | Mensal | Queda nas clínicas com portal |
| Receita por segmento | MRR, ARPA e expansão por segmento | Indisponível: falta o atributo de segmento | Assinaturas + segmento | Mensal | — |
| Conversão do funil | Visita → trial → ativação → pago, por UTM | Indisponível | Eventos + UTM (016) | Semanal | Linha de base de 60 dias antes de mudar o trial |

Regras de medição: dados sempre agregados por clínica, sem dado de paciente; consultas em produção só com autorização do responsável; nenhum número de cliente vai a público sem autorização assinada (diagnóstico E, linha 289).

---

## 5. Priorização

### 5.1 Nível 0: gate de estabilização (obrigatório, fora do RICE)

Ordenado por custo do atraso. Nos itens em que o atraso pode gerar dano irreversível (vazamento, paciente errado ou perda de dado clínico), o custo do atraso é tratado como ilimitado: são feitos primeiro, sem comparação de valor.

| Ordem | ID | Iniciativa | Custo do atraso | Classe | Esf. (diagnóstico) |
|---|---|---|---|---|---|
| 1 | 004 | Esconder a exclusão LGPD destrutiva | Perda irreversível de prontuário a cada uso | Crítico, contenção S | S |
| 2 | 003 | Identificação por CPF e data de nascimento nos canais públicos | Consulta e dado de saúde vinculados ao paciente errado a cada mensagem ou agendamento | Crítico | M |
| 3 | 001 | Revogar anon nas RPCs `SECURITY DEFINER` | Vazamento entre clínicas (suspeito), com correção pequena | Crítico | S |
| 4 | 005 | Backup off-site e restauração medida | Perda total se a VPS cair; risco latente e diário | Crítico | M |
| 5 | 002 | Isolamento, RLS e RBAC no CI sem skip | Sem prova, nenhuma venda em escala; bloqueia todo o restante | Gate | M |
| 6 | 006 | Diff de schema, baseline, pipeline de banco e staging | Nenhuma correção pode ser dada como aplicada; bloqueia 007 e 30.9 | Gate | M |
| 7 | 013, 018 | Landing fiel ao produto; mojibake | Promessa falsa a cada visita | Comercial, S | S |
| 8 | 009 | Webhook do WhatsApp assíncrono e secret por instância | Respostas duplicadas; bloqueia vender o plano Ultra (IA) com segurança | P1 | M |
| 9 | 007, 008 | MFA `aal2` no servidor; convite entre clínicas | Contorno de MFA; acúmulo de papéis | P1 | M + S |
| 10 | 020 | Desativar `ai-medical-assistant` | Conduta clínica por IA sem governança | P2, S | S |
| 11 | 015 | Observabilidade mínima e 6 runbooks | Incidente sem detecção | Gate do beta | M |
| 12 | 30.9 | Smoke das 13 jornadas em staging | Sem ele não há saída do gate | Gate | — |

**Decisão D-05 (para o responsável):** o plano Ultra vende "atendente de IA para a clínica" (`20261010230000_planos_pro_ultra_precos_e_recursos.sql:13-16`). Enquanto 003 e 009 estiverem abertos, a recomendação é não oferecer o Ultra a novas clínicas.

### 5.2 RICE dos itens pós-gate

Escala: **Alcance** é o percentual estimado das clínicas do segmento ativo (clínicas pequenas e médias) afetadas nos dois trimestres seguintes, uma hipótese, porque não há linha de base de uso. **Impacto**: 3 bloqueia a venda, 2 alto, 1 médio, 0,5 baixo. **Confiança**: 80% com evidência no código e demanda observada no mercado; 50% só com hipótese; 30% com dependência regulatória ou técnica não avaliada. **Esforço**: pessoa-semana estimada pelo PM a partir do S/M/L do diagnóstico (S = 1, M = 3, L = 8; M/L = 5), **a confirmar pelo `tech-lead`**.

RICE = Alcance × Impacto × Confiança / Esforço.

| Pos. | ID | Iniciativa | A | I | C | E | RICE | Segmento que destrava | Nota |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 012 | `PatientIdentityBar` nas telas que gravam dados; CPF mascarado | 100 | 2 | 80% | 3 | 53,3 | Clínicas (é parte do gate 60.1) | Obrigatório para o beta |
| 2 | 016 | Eventos com consentimento, UTM e definição de ativação | 100 | 1 | 80% | 3 | 26,7 | Todos | Habilita todas as métricas da seção 4 |
| 3 | 033a | Clínica demo sintética com reinício diário | 100 | 1 | 50% | 3 | 16,7 | Clínicas | Substitui a demo estática |
| 4 | 017, 019 | Tipografia mínima e Agenda por teclado, após teste com usuários (60.2) | 100 | 1 | 50% | 3 | 16,7 | Clínicas | O escopo depende do relatório 60.2 |
| 5 | 011 | ICP-Brasil por provedor em nuvem | 60 | 2 | 50% | 5 | 12,0 | Clínicas (prescrição controlada), redes, laboratórios | Requer avaliação especializada |
| 6 | 025a | Pix do paciente | 70 | 1 | 50% | 3 | 11,7 | Clínicas (plano médio) | — |
| 7 | 014 | Cache com tenant e `gen types` no CI | 30 | 2 | 50% | 3 | 10,0 | Redes (gate) | Fica em posição alta por ser pré-requisito de rede |
| 8 | 010 | TISS XML validado pelo XSD vigente, depois do 030 | 50 | 3 | 50% | 8 | 9,4 | Clínicas com convênio, redes, laboratórios | Requer avaliação especializada. É o maior alcance comercial entre os itens L |
| 9 | 013b | Código de barras e leitura na etiqueta | 15 | 2 | 80% | 3 | 8,0 | Laboratórios (gate); clínicas com coleta | Para o segmento de laboratórios, o RICE seria de 53 (A = 100) |
| 10 | 025b | NFS-e por agregador | 70 | 1 | 50% | 5 | 7,0 | Clínicas (plano médio) | Varia por município (a Feegow publica a mesma ressalva) |
| 11 | 031 | Script de contagem e teto no CI | 100 | 0,5 | 80% | 8 | 5,0 | Todos (custo de mudança) | Pode ser fatiado |
| 12 | 022 | Segregação entre validar e liberar | 15 | 2 | 50% | 3 | 5,0 | Laboratórios (gate) | Requer avaliação RDC |
| 13 | 024 | Multiunidade e papéis por unidade | 10 | 3 | 50% | 13 | 1,2 | Redes (gate) | Valor só depois do discovery de redes |
| 14 | 026 | Interfaceamento HL7/ASTM | 10 | 3 | 30% | 8 | 1,1 | Laboratórios (gate) | — |
| 15 | 025c | Odontograma ligado ao orçamento | 0 | — | — | 8 | 0 | Odonto | Só se o discovery 034 indicar "construir" |

**Itens fora do RICE, mas obrigatórios no tempo certo:**

- **034, discovery de redes e odonto (5 entrevistas por segmento).** O esforço é baixo e o valor da informação é alto: decide se 024 e 025c, os itens mais caros, devem ser construídos. Deve rodar durante a estabilização, porque não usa engenharia.
- **030, fila de jobs.** Habilita 010, 025b e 026. Entra imediatamente antes do TISS.
- **90.3, PITR,** e **90.5, status page e NPS.** São condições do H4 e do SLA (6m.3).

**Decisão D-03 (para o responsável):** o diagnóstico põe redes antes de laboratórios. Depois de TISS e ICP, os dois segmentos ainda dependem de um item L cada um (024 para redes e 026 para laboratórios). Os itens M do laboratório (013b e 022) corrigem uma promessa pública e servem às clínicas com coleta (H2). Recomendação: manter a ordem de abertura comercial do diagnóstico, mas antecipar 013b e 022 para o T3, porque são baratos. Se o discovery 034 não confirmar a demanda de redes, reavaliar a ordem.

---

## 6. Roadmap trimestral

Janelas-alvo, não prazos. Cada trimestre só começa a diferenciação se o gate anterior tiver sido cumprido. Se um gate atrasar, o trimestre seguinte desliza; o gate não é pulado.

### T1: nov/2026 a jan/2027 (estabilização e usabilidade)

| Objetivo | Iniciativas | Resultado esperado | Métrica de saída |
|---|---|---|---|
| Conter os riscos irreversíveis | 004 (contenção), 003, 001, 005 (F.1) | P0 fechados com o teste de aceite registrado | Zero P0 aberto |
| Provar o isolamento e alinhar repositório e produção | 002, 006, 007, 008, 009, 015, 020, smoke 30.9 (F.2) | Gate de estabilização cumprido | 30.1 verde sem skip; 30.9 sem falha crítica |
| Parar de prometer o que não existe | 013 (texto), 018; recomendação D-05 sobre o Ultra | Landing e planos fiéis ao produto | Revisão produto × landing sem divergência |
| Preparar a medição e o beta | 012 (`PatientIdentityBar`), 016 (eventos e ativação), teste com usuários 60.2, discovery 034 | Beta pronto para começar | 60.1 entregue; relatório 60.2; relatório 034 com decisão |

Não entra no T1: TISS, ICP, multiunidade, odontograma, interfaceamento.

### T2: fev a abr/2027 (beta fechado e primeira diferenciação)

Pré-condição: gate de estabilização cumprido.

| Objetivo | Iniciativas | Resultado esperado | Métrica de saída |
|---|---|---|---|
| Validar o valor com clínicas reais | Beta fechado com 3 a 5 clínicas do ICP D-01, com contrato de beta e DPA (90.4) | Relatório de 30 dias com H1 e H5 | Ativação, clínicas ativas por semana, H1, H5 |
| Abrir o plano médio | 030 e então 010 (TISS); 011 (ICP); 90.3 (PITR) | XML aceito em operadora piloto; assinatura válida no ITI | Aceites 90.1 e 90.2 |
| Reduzir o atrito de venda | 033a (demo), 017 e 019 conforme o 60.2, 90.5 (status page e NPS) | Demo navegável; NPS coletado | Demo → proposta; NPS aos 30 dias |

### T3: mai a jul/2027 (comercialização de clínicas)

Pré-condição: relatório do beta com resultado, mesmo que negativo, e decisão do responsável.

| Objetivo | Iniciativas | Resultado esperado | Métrica de saída |
|---|---|---|---|
| Vender clínicas pequenas e médias | 6m.1 (preço por porte após pesquisa com 20 ou mais clínicas); landing `/clinicas` (6m.2); decisão sobre o trial com base em 60 dias de funil | Primeiras vendas fora do beta | Conversão do funil; ativação; MRR do segmento |
| Completar o plano médio | 025a (Pix) e 025b (NFS-e) | Fluxo atendimento → recebimento → nota em homologação | Aceite 6m.8 |
| Preparar os segmentos seguintes (sem vender) | 013b e 022 (D-03); início do 024 conforme a ADR do arquiteto; 014 | Pré-requisitos de laboratório e rede em andamento | Aceites 6m.5 e 014 |
| Publicar confiabilidade | SLA só após 60 dias de medição (6m.3) | Página de SLA com histórico | H4 |

### T4: ago a out/2027 (pilotos de segmento)

Pré-condição: gate de clínicas cumprido e decisão D-03.

| Objetivo | Iniciativas | Resultado esperado | Métrica de saída |
|---|---|---|---|
| Piloto de rede | 024 concluído, 1 rede piloto com 2 ou mais unidades | Prova do gate de redes (F.6) | Unidades ativas por rede |
| Piloto de laboratório | 026 com 1 equipamento; avaliação RDC | Prova do gate de laboratórios | Digitações duplicadas por exame; tempo do pedido ao laudo |
| Odonto | 025c, só se o 034 indicar "construir" | Fluxo dente → orçamento → aprovação → recebimento em uma clínica piloto | Conversão de orçamento |
| Conformidade | 6m.9 (SBIS/CFM e LGPD, requer avaliação especializada) | Parecer contratado | Relatório do avaliador |

---

## 7. Decisões pendentes do responsável

| ID | Decisão | Recomendação do PM | Base |
|---|---|---|---|
| D-01 | ICP do beta | Clínica particular, de 1 a 5 profissionais, sem dependência de TISS nem de ICP | Seções 2.1 e 3 |
| D-02 | Trial (3 dias com cartão × 7 a 14 dias sem cartão) | Não mudar antes de ter 60 dias de funil medido (016) | Seção 3, leitura 3 |
| D-03 | Ordem de laboratórios e redes | Manter a ordem de abertura; antecipar 013b e 022 para o T3 | Seção 5.2 |
| D-04 | `ai-medical-assistant` | Desativar até haver governança (020) | Diagnóstico D.4 |
| D-05 | Venda do plano Ultra (IA no WhatsApp) | Não oferecer a novas clínicas até 003 e 009 fecharem | Seção 5.1 |

---

## 8. Repasse ao `product-owner`

Lista priorizada. O PO transforma cada item em histórias com critérios de aceite; o `tech-lead` confirma o esforço e a capacidade.

| Prioridade | Iniciativa (IDs) | Objetivo | Métrica |
|---|---|---|---|
| 1 | Contenção LGPD (004) | Nenhum caminho da UI apaga dado clínico | Chamadas a `deletePatientData` pela UI = 0 |
| 2 | Identificação nos canais públicos (003) | Nenhum vínculo de paciente por um único dado | Casos (a) e (b) do 003 passam; vínculos divergentes viram pendência |
| 3 | Revogação de anon (001) | Nenhuma RPC sensível executável por anon fora da allowlist | Consulta de grants = allowlist; anon recebe `42501` |
| 4 | Backup off-site (005) | Recuperação possível se a VPS for perdida | RTO medido ≤ 4 h na restauração |
| 5 | Isolamento no CI (002) | Prova contínua de que uma clínica não acessa outra | Job com mais de 0 testes e 0 skip; remover uma policy quebra o CI |
| 6 | Alinhamento de repositório e produção e staging (006) | Toda correção verificável em produção | Diff de schema vazio |
| 7 | Landing fiel e mojibake (013, 018) | Zero promessa não entregue | Revisão produto × landing sem divergência |
| 8 | WhatsApp assíncrono (009), MFA no servidor (007), convite (008), IA desativada (020), observabilidade (015) | Fechar os P1 do gate | Aceites do diagnóstico D.3 e D.4 |
| 9 | Smoke das jornadas (30.9) | Saída do gate de estabilização | Jornadas críticas com PASSOU |
| 10 | `PatientIdentityBar` (012) | Reduzir o risco de gravar no paciente errado | Nome, nascimento e alergias visíveis sem rolagem; seleção errada no teste 60.2 = 0 |
| 11 | Eventos e ativação (016) e atributo de segmento da clínica | Medir ativação, retenção e receita por segmento | Funil com 7 dias de dados; MRR por segmento disponível |
| 12 | Discovery de redes e odonto (034) | Decidir construir ou não 024 e 025c | Relatório com 5 entrevistas por segmento |
| 13 | Beta fechado (90.4) | Validar H1 e H5 | Relatório de 30 dias |
| 14 | Fila de jobs (030) e então TISS (010) | Abrir clínicas com convênio | XML aceito em operadora piloto |
| 15 | ICP-Brasil (011) | Prescrição controlada e laudo assinados | Verificador ITI válido |
| 16 | Demo sintética e status page (033a, 90.5) | Reduzir a objeção de confiança (H4) | Demo → proposta; NPS |
| 17 | Pix e NFS-e (025a, 025b) | Plano médio completo | Nota emitida e cancelada em homologação |
| 18 | Código de barras e segregação (013b, 022) | Pré-requisito de laboratório | Leitor abre a amostra certa; quem valida não libera |
| 19 | Multiunidade (024, 014) | Pré-requisito de rede | pgTAP A × B verde |
| 20 | Interfaceamento (026) e odontograma (025c) | Pilotos de segmento | Provas do F.6 |

---

## 9. Limites desta análise

- O alcance e a confiança do RICE são estimativas do PM, sem base de uso. Precisam ser recalculados com os dados do 016 e do beta.
- O esforço em pessoa-semana é uma conversão do S/M/L do diagnóstico e não foi validado pelo `tech-lead`.
- Os concorrentes foram reconferidos por leitura automatizada das páginas, que pode perder conteúdo dinâmico, como a marcação do odontograma por plano no Simples Dental. Nenhum produto concorrente foi testado em uso.
- O preço do EloLab vem de uma migration local; o valor em produção está NÃO VERIFICADO.
- Os problemas por segmento são hipóteses até o teste com usuários (60.2) e o discovery (034).
