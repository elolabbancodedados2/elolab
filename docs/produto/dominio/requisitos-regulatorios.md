# Requisitos regulatórios por domínio: TISS, assinatura, laboratório, odonto e prontuário

Data: 27/10/2026. Autor: `especialista-dominio-saude`. Base: worktree `admin-finance-realtime`, branch `feat/recepcao-painel-dia-melhorias`, com leitura estática do código. Não executei a aplicação e não usei dados de pacientes.

**Aviso.** Este documento compara o código com normas públicas. Não declara conformidade nem a ausência dela. Todas as seções **requerem avaliação especializada** (jurídica, regulatória, de faturamento e de responsável técnico de laboratório) antes de virar requisito fechado ou texto comercial. Onde a fonte é secundária (blog, entidade ou compilação de legislação), isso está indicado. Todas as fontes foram acessadas em 27/10/2026.

Legenda da coluna "Situação": **existe** = há código que atende à parte operacional da regra; **parcial** = há código com lacuna; **não existe** = nada no código; **NÃO VERIFICADO** = não consegui confirmar.

---

## 1. TISS (ANS): faturamento de convênios

### 1.1 Regra e fontes

| Tema | O que a fonte diz | Fonte |
|---|---|---|
| Versão vigente | Página "Padrão TISS – Julho/2026", publicada em 30/07/2026 e atualizada em 01/09/2026. Componentes: Organizacional **202607**; Conteúdo e Estrutura **202511**; Representação de Conceitos (TUSS) **202607**; Segurança e Privacidade **202511**; Comunicação **04.03.00** e 01.06.00. O componente de Comunicação adota XML | [ANS, Padrão TISS jul/2026](https://www.gov.br/ans/pt-br/assuntos/prestadores/padrao-para-troca-de-informacao-de-saude-suplementar-2013-tiss/padrao-tiss-julho-2026) |
| Prazos de implantação | Ficam na seção XII do Componente Organizacional. A regra geral exige no mínimo 3 meses entre o início de vigência e o fim da implantação. **Não consegui ler as datas da versão 202607: NÃO VERIFICADO** | [Componente Organizacional 202607 (PDF)](https://www.gov.br/ans/pt-br/assuntos/prestadores/padrao-para-troca-de-informacao-de-saude-suplementar-2013-tiss/PadroTISS_ComponenteOrganizacional_202607.pdf) |
| Guias, lote e XSD | O padrão define guias (consulta, SP/SADT, honorários, resumo de internação e tratamento odontológico, entre outras), lote de guias, demonstrativos de retorno e recurso de glosa como mensagens XML. A página não confirma se os pacotes .zip trazem os XSD (o histórico do padrão indica que sim): **NÃO VERIFICADO nesta coleta** | idem |
| Terminologias | A TUSS (componente de Representação de Conceitos) inclui as tabelas de procedimentos e as de domínio, como motivos de glosa. O número exato de cada tabela não foi conferido nesta coleta | idem |

### 1.2 Situação no sistema

| Requisito operacional | Situação | Evidência |
|---|---|---|
| Cadastro da operadora com registro ANS e versão TISS | existe | `src/pages/Convenios.tsx:75-77`, `:832`, `:841-846` |
| Lista de versões TISS atualizada | **parcial: desatualizada** | `src/pages/Convenios.tsx:32` oferece só `04.01.00`, `04.00.02`, `03.05.00` e `03.04.01`, com padrão `04.01.00` (`:90`, `:478`, `:738`). O componente de Comunicação vigente é 04.03.00 |
| Lote de faturamento por convênio e competência | parcial | `supabase/migrations/20260818040000_lotes_tiss_e_glosas.sql:1-20`. O lote tem `quantidade_guias` como **número digitado** (`:8`; formulário em `src/pages/FaturamentoConvenios.tsx:25`), sem vínculo com as guias |
| Guia TISS como entidade (consulta, SP/SADT, honorários, GTO) | **não existe** | Não há tabela de guias de faturamento. `guias_externas` (`20260522163342…sql:3`) atende a pedidos externos do laboratório, não ao faturamento. `autorizacoes_convenio` (`20260729150000…sql:140-155`) guarda o status e o número da autorização, sem estrutura de guia |
| XML TISS de envio de lote | **não existe** | `src/pages/FaturamentoConvenios.tsx:333-337` gera um "resumo operacional" que se declara "não é arquivo TISS de transmissão" (`:335`). O comentário da tabela admite o mesmo (`20260818040000…sql:75`) |
| Validação contra o XSD da ANS e hash do epílogo | **não existe** | Nenhuma ocorrência de XSD ou validação de schema em `src` ou `supabase/functions` |
| Glosa com código e motivo | parcial | `20260818040000…sql:22-38`. `codigo_glosa` é texto livre (`:26`), sem a tabela de domínio de motivos de glosa da TUSS |
| Recurso de glosa | parcial | Estados `recurso_preparacao` e `recurso_enviado` e justificativa em texto (`20260818040000…sql:30-32`). Não há mensagem TISS de recurso de glosa |
| Retorno financeiro e conciliação do lote | existe (operacional) | Migrations `20261007310000_registrar_retorno_financeiro_lote_tiss.sql`, `20261008370000_conciliar_retorno_tiss_no_fluxo_financeiro.sql`; aviso de divergência em `FaturamentoConvenios.tsx:357` |
| Procedimentos com código TUSS | parcial | Há código TUSS em preços de exames e procedimentos (`src/pages/PrecosExames.tsx`, `src/pages/Exames.tsx`, `src/lib/autoBilling.ts`). A tabela TUSS vigente 202607 não é importada nem versionada: NÃO VERIFICADO |
| Guia odontológica (GTO) com situação dos dentes | **não existe** | Não há odontograma (seção 4) |

### 1.3 Lacunas e recomendação

1. **Atualizar a lista de versões** (`Convenios.tsx:32`) para incluir a versão vigente de Comunicação (04.03.00) e deixar de propor 04.01.00 como padrão. Esforço S. Depende de confirmar as datas de vigência na seção XII do 202607.
2. **Pré-requisito de modelo para o CLIN-QA-010:** antes de gerar XML, é preciso ter a guia como entidade (tipo de guia, número da guia no prestador e na operadora, senha de autorização, beneficiário e carteira, profissional executante com conselho e CBO, itens com código TUSS e tabela). Ela precisa nascer do atendimento e do check-in já existentes, e o lote deve ser formado por guias, não por um número digitado.
3. Glosa com a tabela de motivos de glosa da TUSS e recurso como mensagem TISS.
4. Validação contra o XSD oficial no servidor e guarda do XML enviado e do protocolo.
5. A tela continua a dizer "Lotes TISS" (`FaturamentoConvenios.tsx:356`). Enquanto não houver XML, o termo correto para a operação é "lote de faturamento". Sugiro trocar os rótulos por "Lotes de faturamento (controle interno)" para não sugerir transmissão TISS.

Requer avaliação especializada (faturamento e ANS).

---

## 2. Assinatura eletrônica e ICP-Brasil: prescrição, atestado e documentos médicos

### 2.1 Regra e fontes

| Tema | O que a fonte diz | Fonte |
|---|---|---|
| Níveis de assinatura | Lei 14.063/2020, art. 4º: simples; **avançada**, com certificado não ICP-Brasil ou outro meio admitido; **qualificada**, com certificado ICP-Brasil | [Lei 14.063/2020 (Planalto)](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14063.htm) |
| Receita de controle especial e atestado eletrônico | Art. 13: só valem com assinatura eletrônica **qualificada**. O parágrafo único dispensa os atos internos do ambiente hospitalar | idem |
| Demais documentos de saúde | Art. 14: valem com assinatura avançada ou qualificada. O Ministério da Saúde e a Anvisa podem especificar critérios | idem |
| Documentos médicos eletrônicos (CFM) | Res. CFM 2.299/2021: assinatura digital ICP-Brasil **NGS2**, validável no ITI ou no validador do CFM; identificação do médico (nome, CRM, endereço e RQE) e do paciente, com data e hora. Plataformas devem confirmar a regularidade do médico. Fonte secundária; o texto integral não foi conferido | [Mattos Filho](https://www.mattosfilho.com.br/unico/cfm-emissao-documentos-eletronicos/), [íntegra (PDF, ABMES)](https://abmes.org.br/public/arquivos/legislacoes/Resolucao-CFM-2299-2021-09-30.pdf) |
| Receituário eletrônico de controlados (Anvisa) | RDC 1.000/2025, atualizada pela RDC 1.028/2026. Receita de Controle Especial e receita sujeita a retenção (inclui antimicrobianos) emitidas eletronicamente precisam de numeração do **SNCR** e de plataforma **integrada ao SNCR por API**. A página do CFM indica ICP-Brasil qualificada para receita de controle especial, notificação e retenção. **Divergência:** o CFF indica que a retenção aceita assinatura avançada ou qualificada. PDF assinado depois de impresso não conta como receita eletrônica. A receita em papel continua válida | [CFM, RDC 1.000](https://prescricaoeletronica.cfm.org.br/rdc-1000.html), [CFF, 10/12/2025](https://site.cff.org.br/noticia/Noticias-gerais/10/12/2025/anvisa-aprova-nova-rdc-que-regulamenta-o-receituario-eletronico-de-medicamentos-controlados), [CFF, 21/05/2026](https://site.cff.org.br/noticia/Noticias-gerais/21/05/2026/sncr-o-que-muda-para-farmacias-e-drogarias-com-o-novo-sistema-de-controle-de-receitas) |
| Prazo do SNCR | Funcionalidades eletrônicas em 30/09/2026, com transição até 29 ou 30/10/2026. A exigência começa em **30/10/2026, três dias depois desta coleta**. As fontes divergem em um dia, e um blog fala em adiamento para 2027. **Confirmar no comunicado oficial da Anvisa** | [Correio Braziliense](https://www.correiobraziliense.com.br/cbradar/receita-eletronica-de-remedio-controlado-e-de-antibiotico-passa-a-exigir-a-numeracao-do-sistema-sncr-da-anvisa-no-fim-de-outubro-de-2026-depois-de-um-mes-de-transicao-e-a-receita-em-papel-fica-fora/), [Vigilância Sanitária SC](https://vigilanciasanitaria.saude.sc.gov.br/index.php/component/content/article/novas-regras-para-prescricoes-eletronicas-de-medicamentos-com-a-rdc-n-1-000-2025-anvisa-entenda-as-principais-alteracoes.html?catid=61&Itemid=109), [usebip (adiamento, não confirmado)](https://www.usebip.com/blogs/bip-insights/prescricao-eletronica-2026-prazo-do-sncr-muda-para-setembro) |
| Atestado (Atesta CFM) | A Res. CFM 2.382/2024 tornava o Atesta CFM obrigatório, mas está suspensa por liminar da 3ª Vara Federal Cível do DF. Segundo nota do CFM de 10/12/2025, atestados em papel e digitais seguem válidos. Fonte secundária | [Resolução (PDF)](https://atestacfm.org.br/assets/images/2382-2024-regulamenta%20emiss%C3%A3o%20atestados%20m%C3%A9dicos.pdf), [Metrópoles](https://www.metropoles.com/saude/atestados-medicos-em-papel-2026), [Pontotel](https://www.pontotel.com.br/atesta-cfm/) |

### 2.2 Situação no sistema

| Requisito | Situação | Evidência |
|---|---|---|
| Assinatura ICP-Brasil (qualificada) de qualquer documento | **não existe** | `src/components/clinical/DigitalSignature.tsx:28-35`: o comentário admite que nenhuma assinatura ICP acontece. `method: 'icp-brasil'` só existe para ler registros antigos (`:41`) |
| Assinatura eletrônica do prontuário com hash e código de verificação | existe (nível simples ou avançado: **classificação requer avaliação**) | RPC `assinar_prontuario_verificavel` (`supabase/migrations/20260818030000_assinatura_prontuario_verificavel.sql:38-76` hash SHA-256; `:105-109`; `:126-147`); chamada em `DigitalSignature.tsx:79` |
| Assinatura de prescrição, atestado ou laudo no sistema | **não existe** | `DigitalSignature.tsx:78` lança "ainda não disponível" para tipos que não sejam prontuário |
| Receita local declara corretamente que não está assinada | existe | `src/pages/Prescricoes.tsx:253-257` (o texto falso "assinado digitalmente" foi removido); aviso em `:266` e `:1086` |
| **Texto sobre o assinador gov.br** | **incorreto** | `Prescricoes.tsx:1100`: "O assinador digital do ITI utiliza certificado ICP-Brasil via Gov.br". `Atestados.tsx:788-789`: "Para assinatura com validade ICP-Brasil, assine o PDF no assinador gov.br". A assinatura gov.br é **avançada**, não qualificada ICP-Brasil (Lei 14.063, art. 4º, II e III). Para atestado eletrônico e receita de controle especial, o art. 13 exige a qualificada. Também em `Atestados.tsx:919` e `Prontuarios.tsx:2348` ("assine o PDF no gov.br", sem a ressalva) |
| Receita local e medicamentos controlados ou antimicrobianos | **lacuna** | A receita local é texto livre gravada sempre como `tipo: 'simples'` (`Prescricoes.tsx:586-595`, `:593`), sem aviso quando o caso exige outro receituário. Os modelos aceitam `controle_especial` e `antimicrobiano` (`src/pages/Templates.tsx:46-50`). `gerarReceita` em `src/lib/pdfGenerator.ts:218-350` monta "RECEITUÁRIO DE CONTROLE ESPECIAL" (`:238`) sem numeração SNCR; não encontrei chamada a essa função fora dela mesma (NÃO VERIFICADO em testes) |
| Integração com plataforma SNCR | **não existe** no código próprio. Memed em homologação | `supabase/functions/memed-prescription/index.ts:46` (ambiente padrão `homologacao`). `DigitalSignature.tsx:211-212` orienta usar a Memed para controle especial. A integração da Memed ao SNCR e o ambiente de produção estão NÃO VERIFICADOS |
| QR "Validação digital" no PDF de `gerarReceita` | **enganoso, se usado** | `pdfGenerator.ts:312-329`: o QR contém um JSON com nome do paciente e medicamentos em texto aberto, e o rótulo diz "Validação digital" (`:327`). Não há serviço de validação |
| CID no atestado só com autorização expressa do paciente | existe | `src/pages/Atestados.tsx:199-201`, `:354-355`, `:728-742` |
| Identificação do profissional (conselho e RQE) no documento | parcial | O PDF imprime "CRM" fixo (`Prescricoes.tsx:249`; `pdfGenerator.ts:339`). Não encontrei RQE. Para dentista deveria aparecer CRO (ver 4.2) |

### 2.3 Lacunas e recomendação

1. **Corrigir já os textos do gov.br** (`Prescricoes.tsx:1100`, `Atestados.tsx:788-789`, `:919`, `Prontuarios.tsx:2348`). Proposta de redação: "A assinatura gov.br é avançada. Atestado eletrônico e receita de controle especial exigem certificado ICP-Brasil. Sem ele, imprima e assine à mão." Esforço S. O texto atual leva a clínica a entregar documento que pode não ter validade. Ver CLIN-QA-502.
2. **Receita local e SNCR:** o sistema não deve gerar receituário de controle especial ou de retenção por PDF local. Na tela de prescrição local, mostrar um aviso fixo de que esses receituários são emitidos em papel oficial ou por plataforma integrada ao SNCR. Não propor classificação automática de substâncias, porque isso exige base regulatória validada. Ver CLIN-QA-501.
3. Remover ou corrigir o QR "Validação digital" de `gerarReceita` e não expor nome nem medicamentos em texto aberto no QR.
4. ICP-Brasil por provedor em nuvem (CLIN-QA-011), começando por atestado e prescrição, que são os documentos com exigência legal de assinatura qualificada.
5. Atesta CFM: nada a fazer agora. Acompanhar a ação judicial.

Requer avaliação especializada (jurídica e regulatória: Anvisa, CFM e ITI).

---

## 3. Laboratório clínico (Anvisa)

### 3.1 Regra e fontes

Norma de referência: **Resolução Anvisa (RDC) 978, de 6/6/2025** (DOU de 10/06/2025), alterada pela **RDC 1.043, de 01/10/2026** (arts. 5º XLIV, 25, 43, 44, 50, 51, 53 e 146). Ela revoga a RDC 786/2023 (art. 193), dá 90 dias para adequação (art. 191) e entra em vigor na publicação (art. 194). Os artigos abaixo vêm da compilação da LegisWeb, fonte secundária. Conferir no DOU.

Fontes: [LegisWeb, RDC 978/2025 consolidada](https://www.legisweb.com.br/legislacao/?id=479369); [PDF no LACEN-SC](https://lacen.saude.sc.gov.br/arquivos/RDC_978_2025.pdf); [SBAC, documento técnico de 27/08/2025](https://www.sbac.org.br/wp-content/uploads/2025/08/PR__978_2025_1a-versao-revisada_Portal_27ago2025.pdf).

| Tema | Artigo | Conteúdo resumido |
|---|---|---|
| Rastreabilidade e cadastro | 128, 132, 134 | Rastreabilidade em todas as fases; documento com foto; cadastro completo |
| Identificação da amostra | 138, §1º | No mínimo: **nome do paciente, data de nascimento ou idade, tipo de material e número de registro do paciente** |
| Rejeição de amostra | 139 | Critérios definidos de aceitação e rejeição |
| Valores críticos | 154, III; 165, parágrafo único | Definir os valores críticos e o **fluxo de comunicação** ao profissional ou paciente, quando é preciso decisão imediata |
| Liberação e laudo | 165, 166, 167 | Instruções escritas para liberação; laudo datado e assinado por **profissional de nível superior legalmente habilitado**; conteúdo mínimo |
| Retificação | 170 | Correção feita em **novo laudo**, com a alteração clara. Mudança relevante após a entrega é comunicada ao paciente, com registro |
| Controle interno da qualidade (CIQ) | 177-184; 180, III e IV | Liberação ou rejeição **das análises após avaliar as amostras controle**; registro de inadequações, investigação e ações |
| Controle externo (CEQ) e proficiência | 185-190; 189 | Participação em CEQ; verificação anual da disponibilidade de ensaios de proficiência |
| Sistema informatizado | 105, II; 106 | Controle de acesso a lançamentos e alterações, com histórico (data, hora, usuário e local); sistema avaliado e documentado antes da implantação |
| Guarda de registros | 115 | No mínimo 5 anos |

### 3.2 Situação no sistema

| Requisito | Situação | Evidência |
|---|---|---|
| Fluxo pendente → coletado → em análise → validado → liberado, protegido no servidor | existe | `supabase/migrations/20261011180000_integridade_tenant_laboratorio.sql:256-291` (validar), `:396-435` (liberar, exige `validado` em `:411-413`), trigger `:300-340`; tela em `src/pages/LaudosLab.tsx:203-224` |
| Histórico de eventos da amostra (recebimento, transporte, armazenamento, rejeição, recoleta) | existe | `supabase/migrations/20261011000000_laboratorio_lis_foundation.sql:91-102`; eventos do pedido `:79-89`; tela `src/pages/MapaColeta.tsx:311` |
| Etiqueta com os identificadores do art. 138 | **parcial** | `MapaColeta.tsx:346-351` imprime o código da amostra, o nome, a idade, o sexo, o tubo e o exame. **Falta o número de registro do paciente.** O nome impresso é o **nome social quando existe** (`:53`), sem o nome civil. Não há código de barras (CLIN-QA-013) |
| Quem valida e quem libera, com profissional habilitado | **parcial: sem segregação nem perfil de laboratório** | Validar e liberar exigem só `can_access_clinical` (`20261011180000…sql:262`, `:402`), que vale para `admin`, `medico` ou `enfermagem` (`20260131002504…sql:127-137`). Os papéis do sistema são `admin`, `medico`, `recepcao`, `enfermagem` e `financeiro` (`:6`): **não há papel de biomédico, farmacêutico-bioquímico, técnico de laboratório nem de responsável técnico**. A mesma pessoa pode validar e liberar (CLIN-QA-022) |
| Autoria da validação e da liberação | existe | `validado_por`, `data_validacao` (`:274-278`); `liberado_por`, `data_liberacao` (`:421-423`) |
| Retificação com versão anterior preservada e motivo | existe | `resultados_laboratorio_versoes` (`20261011000000…sql:104-114`); motivo de no mínimo 10 caracteres (`20261011180000…sql:372-374`); aviso ao paciente (`LaudosLab.tsx:167-174`) |
| Retificação de laudo **já liberado** | **lacuna** | O resultado retificado continua `liberado` e recebe nova `data_liberacao` e `liberado_por` = quem retificou (`20261011180000…sql:386-387`; trigger `:327-333`). **Não volta para conferência** antes de ser republicado. A permissão de "responsável técnico" é `admin` ou `enfermagem` (`:375-376`; `src/lib/laudoWorkflow.ts:9-11`), sem vínculo com habilitação no laboratório |
| Valor crítico | **parcial** | Só existe a marcação `critico` (`20261011000000…sql:127`) e o selo "Crítico · revisão prioritária" (`LaudosLab.tsx:483`; marcação manual em `:538`). **Não há registro de comunicação** (quem comunicou, a quem, quando e por qual meio) |
| Controle interno da qualidade | **parcial** | `laboratorio_controles_qualidade` com `aprovado` calculado por limite inferior e superior (`20261011000000…sql:169-190`); tela em `src/pages/laboratorio/GestaoLaboratorioPanel.tsx:62-63`. Não há regras multirregra (por exemplo, Westgard), não há registro de ação corretiva e **a liberação não consulta o CQ** (`20261011180000…sql:396-435`) |
| Controle externo e proficiência | **não existe** | Nada no código |
| Equipamentos, calibração e lotes de insumos | existe (cadastro) | `20261011000000…sql:133-167` |
| Interfaceamento de equipamentos (HL7/ASTM) | **não existe** | CLIN-QA-026 |
| Laudo assinado por profissional habilitado | **parcial** | O laudo não tem assinatura (`DigitalSignature.tsx:78`). Fica só a autoria de quem liberou |
| Histórico de alterações com usuário e data | existe | Versões e eventos acima. O "local" da alteração (art. 105, II) não é registrado: NÃO VERIFICADO |

### 3.3 Lacunas e recomendação

1. **Retificação de laudo liberado (CLIN-QA-505, P1):** a nova versão deve voltar para conferência técnica e ser liberada por profissional habilitado, emitida como novo laudo identificado como retificado (art. 170). A versão anterior continua preservada, como já acontece.
2. **Perfis de laboratório (CLIN-QA-022 ampliado):** criar papéis de laboratório, cadastrar o responsável técnico com conselho (CRBM, CRF ou CRM) e exigir habilitação para validar e liberar. Quem valida não libera, salvo regra explícita do laboratório. A definição de quem pode o quê é do responsável técnico, não do software.
3. **Valor crítico (CLIN-QA-506):** registro obrigatório da comunicação antes de concluir a liberação de um resultado crítico. Os limites críticos são definidos pelo laboratório. O sistema não deve sugerir valores.
4. **CQ (CLIN-QA-507):** bloquear ou alertar a liberação de análises de um analito ou equipamento com CQ reprovado no período, com registro de ação corretiva. Incluir o CEQ.
5. **Etiqueta (CLIN-QA-508):** incluir o número de registro do paciente e definir com o responsável técnico se o nome civil deve aparecer junto com o nome social. Código de barras: CLIN-QA-013.
6. **Vocabulário:** o botão "Validar Coleta" (`LaudosLab.tsx:562`) valida resultados, não a coleta. O termo do setor é "Conferência técnica" ou "Validar resultados". Trocar "Crítico · revisão prioritária" (`:483`) por "Valor crítico · comunicar".

Requer avaliação especializada (responsável técnico de laboratório e vigilância sanitária).

---

## 4. Odontologia (CFO)

### 4.1 Regra e fontes

| Tema | O que a fonte diz | Fonte |
|---|---|---|
| Prontuário eletrônico odontológico | Res. CFO 91/2009 aprova normas técnicas de digitalização e de sistemas informatizados para guarda e manuseio do prontuário, com base no manual CFM/SBIS. **Vigência atual NÃO VERIFICADA** | [Normas Brasil, Res. CFO 91/2009](https://www.normasbrasil.com.br/norma/?id=109448) |
| Dever de manter o prontuário | Código de Ética Odontológica (Res. CFO 118/2012): elaborar e manter o prontuário atualizado, inclusive em meio digital. Fonte secundária (artigo acadêmico) | [CFO](https://website.cfo.org.br/), consulta recomendada |
| Odontograma | Não encontrei uma norma do CFO que fixe um formato de odontograma. Na prática, ele faz parte do exame clínico registrado no prontuário. A guia TISS de tratamento odontológico (GTO) registra a situação inicial dos dentes. **NÃO VERIFICADO em fonte primária** | ANS, seção 1.1 |
| Prazo de guarda | Um blog atribui à Res. CFO 91/2009 guarda mínima de 10 anos em papel e permanente no digital. **Não confirmado em fonte oficial** | — |

### 4.2 Situação no sistema

| Requisito | Situação | Evidência |
|---|---|---|
| Odontograma, plano de tratamento e orçamento por dente ou face | **não existe** | Nenhuma ocorrência de `odontogram` ou `odontol` em `src` e `supabase` (busca de 27/10/2026); só aparecem as categorias financeiras "Odontologia" (`src/pages/ContasReceber.tsx:91`, `src/pages/ContasPagar.tsx:69`) |
| Cadastro do profissional com CRO | parcial | A lista de conselhos inclui CRO (`src/pages/Medicos.tsx:52`). Os documentos imprimem "CRM" fixo (`Prescricoes.tsx:249`; `pdfGenerator.ts:339`) |
| Assinatura do prontuário por dentista | **NÃO VERIFICADO** | A RPC exige um registro em `medicos` com `crm` preenchido e responde "Somente médico ativo com CRM pode assinar" (`20260818030000…sql:105-109`). Se o número do CRO for gravado no campo `crm`, o dentista assina com o rótulo errado; se não for, não assina |
| GTO (TISS odonto) | **não existe** | Seção 1 |

### 4.3 Lacunas e recomendação

1. Odontograma ligado ao plano de tratamento e ao orçamento por procedimento, dente e face, com aprovação do paciente registrada (CLIN-QA-025). A notação (FDI de dois dígitos, padrão no Brasil) e as faces (M, D, O/I, V/B, L/P) devem ser validadas com dentistas antes da construção (CLIN-QA-034).
2. **Vocabulário do conselho (CLIN-QA-509):** documentos e mensagens devem usar o conselho real do profissional (CRM, CRO, CRP etc.), não "CRM" fixo. A RPC de assinatura não deve dizer "médico" quando o signatário é outro profissional habilitado.

Requer avaliação especializada (CFO e dentistas).

---

## 5. Prontuário (CFM e lei)

### 5.1 Regra e fontes

| Tema | O que a fonte diz | Fonte |
|---|---|---|
| Guarda | Lei 13.787/2018, art. 6º: eliminação só depois de no mínimo **20 anos** do último registro; regulamento pode fixar outros prazos; o prontuário pode ser devolvido ao paciente | [Lei 13.787/2018 (Câmara)](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13787-27-dezembro-2018-787543-publicacaooriginal-157119-pl.html) |
| Digitalização | Art. 2º: integridade, autenticidade e confidencialidade; certificado ICP-Brasil ou outro padrão legalmente aceito (§2º); requisitos adicionais em regulamento | idem |
| Prontuário eletrônico | Res. CFM 1.821/2007: permite documento eletrônico ou digitalizado e institui a certificação opcional do PEP pela SBIS com assinatura ICP-Brasil. Fonte secundária; vigência atual não conferida | [ITI Certforum, Sabbatini](https://certforum.iti.gov.br/2019/wp-content/uploads/2019/09/RENATO-SABBATINI-Certificação-dos-Registros-Eletrônicos-de-Saúde-e-o-Uso-do-Certificado-Digital-na-Documentação-Clínica.pdf) |
| Documentos médicos eletrônicos | Res. CFM 2.299/2021 (seção 2.1) | idem 2.1 |

### 5.2 Situação no sistema

| Requisito | Situação | Evidência |
|---|---|---|
| Imutabilidade depois da assinatura e alteração só por adendo | existe | `supabase/migrations/20261011160000_prontuario_integridade_assinado.sql:57-59`; `src/components/clinical/ProntuarioAdendos.tsx` |
| Auditoria de acesso e leitura | existe | `src/lib/prontuarioAudit.ts:5-52` (RPCs `registrar_prontuario_acesso` e similares) |
| Assinatura com autor, data e integridade | existe (não ICP) | Seção 2.2 |
| Guarda de 20 anos e proibição de eliminar | **conflito** | A exclusão LGPD apaga prontuário, prescrição e exames (`src/lib/lgpdCompliance.ts:134-189`, CLIN-QA-004). Em andamento na rodada 1: anonimização transacional (backend-developer) |
| Retenção depois do cancelamento da assinatura do SaaS | **NÃO VERIFICADO** | Existe a exportação (`ExportacaoClinicaProtegida`). A política de guarda e devolução ao fim do contrato não está definida |
| Certificação SBIS | **não existe** | — |

### 5.3 Lacunas e recomendação

1. Substituir a exclusão do prontuário por anonimização que preserve o registro clínico pelo prazo legal (CLIN-QA-004, já em andamento).
2. Política escrita de guarda e de devolução do prontuário quando a clínica encerra o contrato. É uma decisão jurídica e contratual.
3. Certificação SBIS só depois de ICP-Brasil e de estabilização (seção F do diagnóstico).

Requer avaliação especializada (jurídica e DPO).

---

## 6. Itens novos de backlog (faixa 5xx)

Os donos são sugestões por papel. Nenhum item gera conduta clínica: os limites, as listas e as regras clínicas ficam com os profissionais habilitados.

| ID | Gravidade | Achado e evidência | Impacto | Causa provável | Proposta | Esforço | Teste de aceite | Dono |
|---|---|---|---|---|---|---|---|---|
| CLIN-QA-501 | P1 (regulatório) | A receita local é texto livre gravada sempre como `simples` (`Prescricoes.tsx:593`), sem aviso para controle especial ou antimicrobiano. A exigência de SNCR para receitas eletrônicas de controle especial e de retenção começa por volta de 30/10/2026 (RDC 1.000/2025) | A clínica pode emitir um receituário eletrônico que a farmácia recusa | Prescrição local anterior à norma | Aviso fixo na prescrição local: controle especial e retenção só em papel oficial ou por plataforma integrada ao SNCR. Confirmar se a Memed está integrada ao SNCR e levá-la à produção. Não gerar PDF de controle especial | S (aviso) + M (Memed em produção) | A tela de prescrição local mostra o aviso; não existe caminho que gere PDF com o título "Controle Especial" | PO Clínico + Backend |
| CLIN-QA-502 | P2 | Os textos afirmam que o gov.br é ICP-Brasil (`Prescricoes.tsx:1100`; `Atestados.tsx:788-789`; também `Atestados.tsx:919` e `Prontuarios.tsx:2348`) | Atestado ou receita entregues com assinatura que pode não ter a validade exigida (Lei 14.063, art. 13) | Confusão entre assinatura avançada e qualificada | Texto da seção 2.3, item 1 | S | Nenhuma tela associa gov.br a ICP-Brasil | UX + PO Clínico |
| CLIN-QA-503 | P2 | A lista de versões TISS vai só até 04.01.00, que também é o padrão (`Convenios.tsx:32,90`). A versão vigente de Comunicação é 04.03.00 (ANS, jul/2026) | Cadastro com versão desatualizada; base errada para o futuro XML | Lista fixa no código | Atualizar a lista e guardar a versão por convênio com data de vigência | S | O cadastro oferece a versão vigente | PO Faturamento |
| CLIN-QA-504 | P1 (comercial, refina o 010) | Não existe guia de faturamento. O lote tem `quantidade_guias` digitada (`20260818040000…sql:8`). Glosa com código livre (`:26`). Recurso só em texto (`:30-32`) | Sem a guia não há XML TISS, conferência de glosa por guia nem GTO | Lote modelado como controle financeiro | Modelar a guia (seção 1.3, item 2) a partir do atendimento, formar o lote com as guias, usar a tabela de motivos de glosa da TUSS | L | O lote soma as guias vinculadas; a glosa referencia uma guia e um motivo da tabela | PO Faturamento + Arquiteto |
| CLIN-QA-505 | P1 | A retificação de laudo já liberado é republicada na hora, sem nova conferência, e quem retifica passa a constar como quem liberou (`20261011180000…sql:386-387`, `:327-333`). A permissão de "responsável técnico" é `admin` ou `enfermagem` (`:375-376`; `laudoWorkflow.ts:9-11`) | Resultado alterado chega ao paciente e ao médico sem dupla checagem; risco de resultado errado | Retificação tratada como edição | A versão retificada volta para "em conferência"; liberação por profissional habilitado; novo laudo identificado como retificado (RDC 978, art. 170) | M | Um laudo retificado fica indisponível até nova liberação por outro usuário habilitado, e o histórico mostra as duas versões | PO Lab + Backend |
| CLIN-QA-506 | P2 | O valor crítico é só uma marcação (`20261011000000…sql:127`; `LaudosLab.tsx:483`), sem registro de comunicação | Sem prova de que o resultado crítico foi comunicado (RDC 978, arts. 154, III e 165, parágrafo único) | Fluxo não modelado | Registro obrigatório da comunicação (quem, a quem, quando, meio) antes de concluir a liberação de um resultado crítico. Os limites ficam a cargo do laboratório | M | Não é possível liberar um resultado crítico sem registrar a comunicação | PO Lab |
| CLIN-QA-507 | P2 | O CQ compara com limites simples e a liberação não consulta o CQ (`20261011000000…sql:169-190`; `20261011180000…sql:396-435`). Não existe CEQ | Resultado liberado de uma corrida com controle reprovado (RDC 978, art. 180, III) | CQ como cadastro isolado | Ligar o CQ ao analito e equipamento; alertar ou bloquear a liberação com CQ reprovado no período; registrar a ação corretiva; cadastrar o CEQ | M/L | Com CQ reprovado no dia, a liberação do analito pede justificativa ou é bloqueada, conforme a configuração do responsável técnico | PO Lab |
| CLIN-QA-508 | P2 | A etiqueta não tem o número de registro do paciente e imprime o nome social no lugar do nome civil (`MapaColeta.tsx:53`, `:346-351`) | Identificação da amostra abaixo do mínimo do art. 138, §1º; risco com homônimos | Etiqueta pensada para leitura humana | Incluir o número de registro; definir com o responsável técnico a exibição do nome civil e do social; código de barras pelo CLIN-QA-013 | S | A etiqueta mostra nome, data de nascimento ou idade, material e número de registro | PO Lab + Front |
| CLIN-QA-509 | P3 | "CRM" fixo nos documentos (`Prescricoes.tsx:249`; `pdfGenerator.ts:339`) e mensagem "Somente médico… com CRM" na assinatura (`20260818030000…sql:108-109`), embora o cadastro aceite CRO e outros conselhos (`Medicos.tsx:52`) | Documento de dentista ou de outro profissional com o conselho errado | Modelo pensado só para médicos | Usar o conselho e a UF do profissional; texto neutro na assinatura | S | O PDF de um dentista mostra "CRO-UF nº" | Front + Backend |

Itens já existentes que este documento reforça: CLIN-QA-010 (TISS), 011 (ICP), 013 (código de barras), 022 (validar e liberar), 025 (odontograma) e 004 (exclusão do prontuário).

---

## 7. Não realizado e limites desta análise

- Não li os textos integrais da RDC 978/2025, da RDC 1.000/2025, da RDC 1.028/2026, da Res. CFM 2.299/2021 nem da Res. CFO 91/2009. Usei compilações e páginas de entidades, indicadas em cada linha. O PDF do LACEN não pôde ser lido (falta extrator de PDF no ambiente).
- Não li as datas de vigência da seção XII do TISS 202607 nem o conteúdo dos pacotes .zip (XSD).
- A data exata da exigência do SNCR diverge entre as fontes (29/10, 30/10 ou adiamento para 2027).
- Não confirmei se a Memed está integrada ao SNCR.
- Não verifiquei o que está publicado na VPS. As linhas citadas valem para o worktree atual, que tem alterações não commitadas.
- Nenhuma conclusão aqui é parecer jurídico ou regulatório: **requer avaliação especializada**.
