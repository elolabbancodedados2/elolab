# Posicionamento e mensagem por segmento

Data: 27/10/2026. Autor: `growth-marketing` (rodada 1). Status: proposta para decisão do responsável. Nada aqui foi publicado.

Base: `docs/estrategia/DIAGNOSTICO_16_FUNCOES.md` (seções C, E e G) e `docs/estrategia/funcoes/04-ux-gtm.md` §3. As capacidades citadas foram conferidas no código do worktree `admin-finance-realtime` (branch `feat/recepcao-painel-dia-melhorias`). "Existe em código" não significa "validado em operação": todas as jornadas da seção C do diagnóstico estão NÃO EXECUTADO.

## 1. Regras de mensagem

1. **Só prometer o que existe em código e cuja jornada passou no smoke (item 30.9 do diagnóstico).** Até lá, a mensagem pública descreve o que o sistema faz e evita resultados, como "reduz faltas em X%".
2. **Não usar número de cliente, depoimento, logotipo ou selo sem autorização escrita** (seção 6). Hoje não temos nenhum.
3. **Tom institucional:** frases declarativas, sem exclamação, sem superlativos ("o melhor", "revolucionário", "inteligente" como adjetivo vazio) e sem urgência artificial.
4. **Capacidades ausentes são ditas como ausentes** quando o cliente pergunta. Não usar "em breve" sem data aprovada pelo produto.
5. **Conformidade regulatória** (ANS/TISS, ICP-Brasil, SBIS/CFM, LGPD): não afirmar conformidade. Usar a descrição técnica do que o sistema faz e marcar "requer avaliação especializada" nos materiais internos.

## 2. O que existe, o que não existe

| Capacidade | Estado | Evidência | Uso na mensagem |
|---|---|---|---|
| Check-in que gera a cobrança na mesma transação | Existe em código | `src/lib/checkinWithBilling.ts:35-97` | Pode citar como funcionamento; não citar resultado |
| Agenda com anti-sobreposição | Existe em código | `src/components/agenda/AppointmentDialog.tsx:159-201`; diagnóstico §C | Pode citar |
| Confirmação de consulta (portal e lembretes) | Existe em código | `supabase/functions/appointment-confirmation`, `send-appointment-reminder`, `patient-portal/index.ts:795,853` | Pode citar, sem taxa de no-show |
| Agendamento online por link | Existe, com **P0 aberto** | `supabase/functions/public-booking/index.ts:196-198` (vínculo só por CPF, CLIN-QA-003) | **Não destacar** até o 003 fechar |
| Atendente de IA no WhatsApp | Existe, com **P0 aberto** | `supabase/functions/whatsapp-webhook/index.ts:173-179` (vínculo pelo final do telefone, CLIN-QA-003) | Pode citar como "sujeito à configuração", sem destaque de campanha até o 003 fechar |
| Prontuário com histórico e assinatura verificável | Existe em código | `src/components/clinical/DigitalSignature.tsx:79`; rota `/verificar-assinatura/:codigo` (`src/App.tsx:235`) | Pode citar "trilha de alterações e verificação"; **não** dizer "ICP-Brasil" |
| Receita com ICP-Brasil via Memed | **NÃO VERIFICADO em produção** | `supabase/functions/memed-prescription/index.ts:46` usa `homologacao` por padrão; diagnóstico §C "Memed fora de produção" | A frase da landing (`src/pages/LandingPage.tsx:146`) deve sair ou ser condicionada até a Memed estar em produção |
| Laboratório: pedido, mapa de coleta, laudo com liberação após validação | Existe em código | `src/pages/laboratorio/PedidosLaboratorioPanel.tsx:137`; `src/pages/MapaColeta.tsx:311`; `20261011180000…sql:396-412` | Pode citar o fluxo |
| Código de barras em amostra | **NÃO EXISTE** | `src/pages/MapaColeta.tsx:346-347` imprime texto; `Barcode` é só ícone (`src/pages/Laboratorio.tsx:74`); nenhuma biblioteca de código de barras em `package.json` | **Proibido.** A landing promete em `src/pages/LandingPage.tsx:209` (FAQ). Correção é do dono da landing (CLIN-QA-013, item 7.6) |
| Interfaceamento com equipamentos, controle de qualidade | NÃO EXISTE | diagnóstico §E | Proibido |
| Faturamento TISS em XML | NÃO EXISTE | `src/pages/FaturamentoConvenios.tsx:335` ("não é arquivo TISS de transmissão") | Proibido dizer "TISS". Pode dizer "controle de convênios e guias internas" |
| NFS-e, Pix do paciente | NÃO EXISTE | diagnóstico §C (0 ocorrências de `nfse`) | Proibido |
| Multiunidade | NÃO EXISTE | 0 ocorrências de `unidade_id` (diagnóstico §C) | Proibido vender rede |
| Odontograma | NÃO EXISTE | 0 ocorrências de `odontograma` | Proibido vender odonto como produto |
| Telemedicina | Fora de escopo | `docs/time/REGRAS_DO_TIME.md` | Não citar |

## 3. Posicionamento-base

> Gestão de clínica e laboratório num só sistema: agenda, recepção com cobrança no check-in, prontuário, coleta e laudo, com atendimento por IA no WhatsApp como opção.

Por que esse eixo: o diferencial verificável no código é a combinação clínica + coleta/laudo + atendimento no WhatsApp, e o check-in que já gera a cobrança. Não é preço nem conformidade. Contra iClinic, Feegow e ProDoctor, que trazem TISS e ICP nos planos de entrada (diagnóstico §E), não competimos em convênio até o CLIN-QA-010 existir.

Frase curta (para título): "Recepção, consulta e caixa no mesmo fluxo."

## 4. Mensagem por segmento

Status de venda segue o veredito do diagnóstico (§G): NO-GO para escala e novos segmentos; beta só com pequenas clínicas depois dos cinco P0.

### 4.1 Clínicas pequenas e médias (2 a 15 profissionais), particulares ou com poucos convênios

- **Status:** segmento principal. Beta fechado após o gate de estabilização (item 90.4).
- **Quem decide:** sócio médico ou dono; às vezes gerente administrativo.
- **Dor:** atendimentos realizados e não cobrados, caixa que não fecha com a agenda, faltas, recepção alternando entre planilha, WhatsApp e sistema.
- **Mensagem principal:** "A recepção marca, confirma, recebe o paciente e lança a cobrança no mesmo passo. O caixa do dia sai da agenda, não de uma planilha."
- **Mensagens de apoio:**
  - "Prontuário com modelos da sua equipe, histórico de alterações e verificação de documentos assinados."
  - "Confirmação de consulta pelo portal do paciente e por lembretes."
  - "Atendente de IA no WhatsApp como opção, configurada com a clínica."
- **Não dizer:** TISS, ICP-Brasil, NFS-e, Pix, "reduz faltas em X%", "zero atendimento sem cobrança".
- **Qualificação negativa (dizer com clareza):** clínicas com faturamento de convênio por XML TISS hoje não são atendidas.
- **Prova necessária antes de afirmar resultado:**
  - H1 (diagnóstico §E): percentual de atendimentos sem lançamento em D+1, em 3 clínicas piloto, 30 dias antes e depois.
  - H5: taxa de no-show com e sem portal, por 60 dias.
  - Depoimento escrito de pelo menos 2 gestores, com autorização (seção 6).

### 4.2 Laboratórios e clínicas com posto de coleta

- **Status:** piloto consultivo, não autosserviço. Bloqueado para venda ampla por código de barras (013), interfaceamento (026) e segregação de quem valida e libera (022).
- **Quem decide:** responsável técnico e gestor.
- **Dor:** redigitação entre pedido, coleta e laudo; entrega de laudos por canais soltos.
- **Mensagem (só para piloto):** "Pedido, mapa de coleta e laudo no mesmo sistema da clínica. O laudo só é liberado depois de validado, e o paciente acessa pelo portal."
- **Não dizer:** código de barras, etiqueta de amostra, interfaceamento, controle de qualidade, LIS completo, "rastreabilidade por código de barras".
- **Prova necessária:** H2: tempo do pedido ao laudo no prontuário e número de digitações duplicadas, cronometrados em 2 clínicas com posto de coleta. Depende do 013.

### 4.3 Redes multiunidade

- **Status:** não vender. Sem modelo de unidades (024) e com papel global (008).
- **Ação de marketing permitida:** formulário de interesse que grava segmento e origem (CLIN-QA-412), alimentando o discovery de 5 redes (CLIN-QA-418). Sem página com promessa de "visão consolidada".
- **Mensagem para quem entra em contato:** "Hoje o EloLab atende uma unidade por conta. Estamos ouvindo redes para desenhar a gestão entre unidades; podemos conversar sobre isso e sobre um piloto em uma unidade."
- **Prova necessária para abrir o segmento:** ADR multiunidade aprovado, papéis por unidade implantados e suíte de isolamento rodando no CI (002).

### 4.4 Odontologia e especialidades

- **Status:** não vender como produto odontológico. Sem odontograma, plano de tratamento por dente nem ortodontia (025). Simples Dental e Clinicorp são referência nesse segmento.
- **Especialidades médicas** (dermatologia, cardiologia etc.) entram na mensagem 4.1, sem prometer recursos próprios da especialidade.
- **Ação permitida:** discovery com 5 clínicas odonto (CLIN-QA-418) antes de qualquer página.

## 5. Mensagens para revisão na landing (não editadas)

Não editei `src/pages/LandingPage.tsx`. Pontos para o dono da landing e o `product-designer`:

| Linha | Texto atual (resumo) | Problema | Proposta |
|---|---|---|---|
| `LandingPage.tsx:209` | "rastreabilidade de amostras por código de barras e faturamento integrado" | Código de barras não existe (013); "módulo completo" exagera | "Há um fluxo de laboratório: pedidos, mapa de coleta, laudos com liberação após validação e acesso pelo portal do paciente. Para laboratórios com interfaceamento, fale com a equipe." |
| `LandingPage.tsx:146` | "Receitas com certificado ICP-Brasil pela integração com a Memed" | Memed em homologação por padrão; produção NÃO VERIFICADA | Remover até a Memed estar em produção e confirmada pelo responsável |
| `LandingPage.tsx:197` | Teste de 3 dias com cartão | Coerente com o código, mas é o trial mais restritivo do benchmark | Ver `pricing-proposta.md` §4 |
| `LandingPage.tsx:101`, `:103` | "convênios sem dor de cabeça", "imagem muito mais profissional" | Tom promocional e promessa implícita sobre convênios sem TISS | "Histórico do paciente, lista de espera e cadastro de convênios." / "Chamada de pacientes em tela na recepção." |
| `LandingPage.tsx:54-55` | Objeto `C` com `grad` e cores próprias | Fora do design system (CLIN-QA-410) | Com o `product-designer` |

## 6. Plano de prova social

Nada existe hoje. Não criar seção de depoimentos, logos ou números na landing até haver material autorizado.

1. **Quem:** clínicas do beta fechado (item 90.4), depois de 30 dias de uso.
2. **O quê:**
   - depoimento escrito (2 a 3 frases) do gestor, com nome, cargo e clínica;
   - logotipo da clínica;
   - estudo de caso com métrica medida no próprio sistema, antes e depois, aprovada pelo cliente (H1, H5).
3. **Autorização por escrito** (modelo a revisar com o jurídico, "requer avaliação especializada"):
   - texto exato aprovado pelo cliente;
   - uso de nome, cargo, imagem e logotipo;
   - canais (site, apresentação, redes);
   - prazo e direito de revogação, com prazo de retirada;
   - declaração de que não há dado de paciente no material.
4. **Incentivo:** permitido desconto na mensalidade, declarado no próprio material ("cliente participante do programa de referência").
5. **Registro:** planilha interna com a autorização assinada, a data e o prazo; revisão trimestral.
6. **Proibido:** dados de pacientes, números estimados, depoimento de funcionário ou parente apresentado como cliente, "mais de N clínicas" sem contagem verificada no banco.

## 7. Próximos passos

| Passo | Dono | Dependência |
|---|---|---|
| Corrigir `LandingPage.tsx:209` e `:146` | Dono da landing + `product-designer` | Aprovação do responsável |
| Aprovar o posicionamento-base e as mensagens 4.1 | Responsável | — |
| Formulário de interesse para redes e laboratório com segmento e UTM (412) | Front + Growth | `plano-analytics.md` §5 |
| Modelo de autorização de depoimento | Jurídico (requer avaliação especializada) | — |
| Páginas `/clinicas` e `/laboratorios` | Growth + Design | Smoke das jornadas (30.9); para laboratório, 013 |
