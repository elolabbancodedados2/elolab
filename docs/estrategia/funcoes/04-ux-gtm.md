# 04 — UX, Design System e Go-to-Market

Data: 27/10/2026. Escopo: diagnóstico por leitura de código no worktree `admin-finance-realtime` (branch `feat/recepcao-painel-dia-melhorias`, com alterações locais não commitadas). Sem navegador: nenhuma observação visual foi feita. Toda conclusão de usabilidade abaixo é hipótese a confirmar em teste com usuários reais.

Restrições aplicadas: visual sóbrio e institucional (uma cor de marca, cores só para estado, sem degradês, emojis ou exclamações); telemedicina fora de escopo; nenhum depoimento ou número de cliente inventado.

## 1. UX das telas de uso diário

### 1.1 Medição por tela

| Tela | Linhas | `useState` | Diálogos | Abas | Cores fixas | Atalhos |
|---|---|---|---|---|---|---|
| `src/pages/Recepcao.tsx` | 1.837 | 24 | 2 | 6 | 0 | nenhum |
| `src/pages/Prontuarios.tsx` | 2.635 | 48 | 3 | 2 conjuntos | 0 | só Enter/Espaço em itens (`:1840`, `:2429`) |
| `src/components/agenda/AgendaPage.tsx` | 712 | 13 | 1 | 0 | 0 | setas, `/` (`:102-112`) |
| `src/pages/CaixaDiario.tsx` | 2.353 | 33 | 8 | 5 | 25 | nenhum |
| `src/pages/Pacientes.tsx` | 2.491 | 50 | 3 | 9 na ficha | 0 | nenhum |

Contagem feita por `grep` sobre o código atual; "cores fixas" = classes Tailwind de paleta (`bg-red-500` etc.). Busca global por `Ctrl+K` existe em `src/components/GlobalSearch.tsx:45`.

### 1.2 Achados

**Estados de carregamento e erro: bom nível.** As cinco telas usam `ErrorState` com mensagem específica por consulta, por exemplo `Recepcao.tsx:1174-1179` (agenda, fila e lançamentos separados) e `AgendaPage.tsx:561-565`. Estado vazio existe na Recepção (`Recepcao.tsx:1188`, "Nenhum paciente nesta etapa"), mas sem ação sugerida. A Agenda não tem estado vazio próprio (0 ocorrências de `EmptyState`/"Nenhum" em `AgendaPage.tsx`) — NÃO VERIFICADO se as views internas tratam o dia vazio.

**Risco de paciente errado (principal achado).**
- Prontuário em edição: a faixa de identificação existe (`Prontuarios.tsx:2068-2080`), mas o nome fica num `Badge` com `text-[10px]` (`:2071`), a idade aparece abreviada como `42a` (`:2074`) sem data de nascimento completa, e alergias não aparecem nessa faixa — o `AllergyAlert` está só na ficha (`:332`), fora do diálogo de edição. A prática internacional (OMS/Joint Commission) pede dois identificadores visíveis ao registrar: nome completo e data de nascimento.
- O CPF é exibido completo na faixa (`:2075`), o que expõe dado pessoal sem necessidade para a tarefa clínica.
- Pagamento na Recepção: o diálogo "Confirmar Pagamento" mostra `selectedLancamento.descricao` (`Recepcao.tsx:1535`), não um campo explícito de paciente. NÃO VERIFICADO se a descrição sempre contém o nome.
- O prontuário é editado dentro de um `Dialog` `max-w-6xl` (`Prontuarios.tsx:2000`). Para o documento clínico principal, o modal limita espaço e favorece fechar por engano; há proteção de rascunho/alterações não salvas (26 ocorrências de `rascunho`/`beforeunload`/`isDirty`), o que reduz o risco de perda.

**Densidade e legibilidade.** Há 100 ocorrências de `text-[10px]`/`text-[11px]` nas cinco telas. A ficha do paciente tem 9 abas em 11 px (`Pacientes.tsx:1701-1713`), o que dificulta leitura para recepcionistas em monitores comuns e pessoas com baixa visão. Recomendação: corpo mínimo de 14 px, rótulos de 12 px, no máximo 5 abas visíveis e as demais em "Mais".

**Cliques para a tarefa principal.** Não mensurável sem navegador. Estimativa por código: check-in na Recepção depende da coluna/etapa e de um diálogo; encaixe exige abrir diálogo, buscar paciente, escolher médico e tipo (`Recepcao.tsx:1760-1810`). Medir no teste (seção 1.3).

**Acessibilidade.** Rótulos ARIA presentes em campos críticos (`Recepcao.tsx:1130`, `:1561-1639`), mas `AgendaPage.tsx` tem 0 atributos `aria-`. A grade da Agenda precisa de navegação por teclado entre horários e anúncio de mudanças (`aria-live`). Recomenda-se auditoria com leitor de tela (NVDA) e axe.

**Atalhos.** Existem na Agenda e na busca global; não existem para "próximo paciente", "check-in", "salvar evolução" ou "receber pagamento". O `OnboardingWizard.tsx:46` promete "Alt+H, Alt+P, Alt+A e outros atalhos documentados" — NÃO VERIFICADO onde estão implementados. A mesma linha tem mojibake (`ConfiguraÃ§Ã£o concluÃ­da`, `:45`) e exclamação ("Bom trabalho!"), em conflito com o tom formal.

**Tamanho dos arquivos.** Telas com 2.000+ linhas e 30–50 estados locais indicam acoplamento alto; mudanças de UX são caras e arriscadas. Extrair subcomponentes por tarefa (faixa de identificação, diálogo de pagamento, grade) antes de redesenhar.

### 1.3 Roteiro de pesquisa com usuários

Formato: 5 participantes por perfil, sessões moderadas de 45 min, presenciais na clínica ou remotas com compartilhamento de tela, em ambiente de homologação com dados sintéticos. Termo de consentimento para gravação conforme LGPD; não usar dados reais de pacientes.

| Perfil | Tarefas |
|---|---|
| Recepcionista | 1. Fazer check-in de paciente agendado. 2. Encaixar paciente sem agendamento. 3. Remarcar consulta para outro médico. 4. Receber pagamento dividido em Pix e cartão. 5. Atualizar telefone e convênio do paciente. |
| Médico ou dentista | 1. Chamar o próximo paciente da fila. 2. Registrar evolução com CID-10. 3. Emitir prescrição e assinar. 4. Consultar alergias e últimas consultas. 5. Agendar retorno. |
| Financeiro ou caixa | 1. Abrir o caixa. 2. Lançar venda no ponto de venda. 3. Estornar um lançamento. 4. Fechar o caixa com diferença. 5. Localizar pagamento pendente de um paciente. |
| Gestor ou dono | 1. Ver ocupação da agenda da semana. 2. Convidar um profissional. 3. Cadastrar tipo de consulta e preço. 4. Ver faturamento do mês. 5. Abrir chamado de suporte. |
| Laboratório (se houver piloto) | 1. Registrar coleta. 2. Lançar resultado. 3. Liberar laudo. 4. Localizar exame pendente. 5. Enviar resultado ao paciente. |

Métricas: taxa de sucesso sem ajuda, tempo na tarefa, número de cliques, erros (com destaque para seleção de paciente errado), SEQ (1–7) por tarefa e SUS ao final. Meta inicial: sucesso acima de 80% e SUS acima de 70. Instrumentar as mesmas tarefas com eventos (seção 5) para comparar laboratório e uso real.

## 2. Design system

Estado atual: 38 componentes em `src/components/ui`; 416 classes de paleta fixa e 1.064 cores hexadecimais em `.tsx`; 8 arquivos com degradê. Concentração hexadecimal: `AdminDashboardOverview.tsx` (64), `Auth.tsx` (40), `PortalPaciente.tsx` (27), `Tarefas.tsx` (25). Paleta fixa: `ClinicalAlertsDisplay.tsx` (30), `PortalPaciente.tsx` (29), `Triagem.tsx` (26), `CaixaDiario.tsx` (25). A landing usa um objeto `C` próprio (`LandingPage.tsx:53-59`) e um "degradê" de cor única (`:55`). Observação: o número de 1.118 citado no briefing não coincide com a medição atual (416 + 1.064, critérios diferentes); refazer a linha de base com um script versionado.

Plano:
1. **Tokens semânticos** em `src/index.css`: `--brand`, `--surface`, `--text`, `--border`, e estados `--success`, `--warning`, `--destructive`, `--info`. Cores de categoria (agenda por profissional) num conjunto neutro limitado, documentado como exceção.
2. **Regra de lint**: regra ESLint (`no-restricted-syntax` sobre literais de `className`) em `eslint.config.js` proibindo `-(red|green|…)-\d+`, `#hex` e `gradient`. Começar como `warn` com contagem congelada no CI (a contagem só pode cair) e passar a `error` quando zerar.
3. **Migração por lotes**: primeiro telas clínicas e de caixa (risco de leitura), depois administrativas, por fim landing e portal.
4. **Padrões de composição** (componentes em `src/components/patterns`):
   - `PageHeader`: título, descrição, ações primária e secundária, breadcrumb.
   - `PatientIdentityBar`: nome completo, data de nascimento, idade, convênio, alergias; obrigatório em toda tela que grava dado clínico ou financeiro de paciente.
   - `DataTable`: ordenação, paginação no servidor, estados vazio/erro/carregando, densidade única.
   - `FormSection` + `FormField`: rótulo, ajuda, erro com `role="alert"`, obrigatório marcado.
   - `EmptyState` sempre com ação.
5. **Governança**: um responsável pelo design system; checklist de PR (tokens, padrões, contraste AA, teclado); catálogo vivo (Storybook ou página interna `/design`); revisão mensal da contagem de exceções.

## 3. Posicionamento e ICP

Posicionamento-base proposto: "Gestão clínica e laboratorial com atendimento por IA no WhatsApp, num só sistema, com implantação acompanhada." O diferencial verificável no código é a combinação clínica + laboratório + agente de IA, não preço.

| Segmento | Mensagem | Dor principal | Decisor | Ciclo estimado |
|---|---|---|---|---|
| Clínicas pequenas e médias (2–15 profissionais) | Recepção, agenda, prontuário e caixa conectados, com confirmação automática | Faltas, filas e caixa sem conciliação | Dono ou sócio médico, às vezes gerente | 1–4 semanas, autosserviço com apoio |
| Redes multiunidade | Visão consolidada e padrão de atendimento entre unidades | Dados fragmentados por unidade | Diretoria de operações e financeira, TI | 2–6 meses, proposta e contrato |
| Laboratórios | Do pedido ao laudo liberado, com portal do paciente | Retrabalho no lançamento de resultados e entrega de laudos | Responsável técnico e gestor | 1–3 meses |
| Odonto e especialidades | Fluxo de tratamento por etapas e orçamento | Orçamentos não convertidos, retornos perdidos | Dono ou dentista-gestor | 1–4 semanas |

Lacunas que limitam a mensagem: não foi encontrado modelo de unidades/filiais (nenhuma coluna `unidade_id` relevante em `supabase/migrations`) nem odontograma (`grep odontograma` sem resultado). Até existirem, não vender para redes e odonto como produto pronto; tratar como pilotos.

### Benchmark público (consultado em 27/10/2026)

| Produto | Preço publicado | Unidade | Teste | Fonte |
|---|---|---|---|---|
| iClinic | R$ 99, 129, 169, 299/mês; anual com 8% de desconto; acima de 5 profissionais, sob medida | por profissional de saúde | 5 dias sem cartão | https://iclinic.com.br/precos/ |
| Clinicorp | Standard R$ 159,90/mês; Premium R$ 369,90/mês; combos de IA sob consulta; implantação obrigatória cobrada no 1º mês | por clínica (não explicitado) | não há; demonstração com consultor | https://www.clinicorp.com/planos |
| Simples Dental | Basic R$ 149,90; Plus R$ 249,90; Pro R$ 349,90 (anual com 10% de desconto); Secretária IA e confirmação por WhatsApp pagos à parte | não informado | 7 dias sem cartão | https://www.simplesdental.com/planos-e-precos |
| Amplimed | sem preço; planos por porte (consultório 1–2 profissionais, clínica 3+, operadora) e complementos de WhatsApp e IA | não informado | "Começar gratuitamente", termos não claros | https://www.amplimed.com.br/planos |
| Ninsaúde | sem preço; foco em clínicas médicas e franquias (white label) | não informado | não informado | https://www.ninsaude.com/ |
| ProDoctor | sem preço; linhas Cloud, Cloud +Clínica, Cloud +Corp e Corp | não informado | não informado | https://prodoctor.net/ |
| Feegow | NÃO VERIFICADO (site recusou conexão TLS em 27/10/2026) | — | — | https://feegow.com/ |

Leituras: (a) o mercado autosserviço testa sem cartão por 5–7 dias; (b) IA no WhatsApp é vendida como complemento pago, o que valida o Ultra; (c) quem atende clínicas maiores e redes esconde preço e vende com consultor e implantação paga.

## 4. Pricing e packaging

Hoje: Pro R$ 379 e Ultra R$ 499 por clínica (`supabase/migrations/20261010230000_planos_pro_ultra_precos_e_recursos.sql:6,14`), com limites por plano de médicos e funcionários (`supabase/migrations/20260522171216_*.sql:86-93`, aplicados em `src/hooks/usePlanLimits.ts`). NÃO VERIFICADO quais limites valem para Pro e Ultra.

Proposta:
1. **Clínica (autosserviço)**: preço base por clínica com profissionais incluídos e valor por profissional adicional. Exemplo de estrutura a validar: Essencial (até 2 profissionais), Clínica (até 5), Clínica Plus (até 10). Isso compete com iClinic, que cobra por profissional, sem pesar para consultórios pequenos. Valores definidos pelo responsável após entrevistas de disposição a pagar (Van Westendorp com 20+ clínicas).
2. **Laboratório**: plano próprio por volume de exames/mês ou por bancada, com portal de laudos incluído.
3. **Rede (enterprise)**: por unidade, contrato anual, implantação paga, SLA contratual, faturamento por boleto/nota. Só após existir modelo multiunidade.
4. **Add-ons**: IA no WhatsApp (mensal mais franquia de conversas, excedente por faixa), módulo Laboratório para clínicas com coleta própria, TISS/faturamento de convênio (quando houver geração de XML TISS — gap registrado na direção de 27/10), armazenamento adicional, implantação assistida e migração de dados.
5. **Anual** com desconto de 10–15%, alinhado ao mercado.

**Trial de 3 dias com cartão** (`LandingPage.tsx:197`, `PlanoCheckout.tsx:168-169`): é o mais curto e restritivo do benchmark. Três dias não cobrem uma semana de agenda, e a ativação exige equipe, agenda, serviços e primeiro agendamento (`src/pages/OnboardingClinica.tsx:17`). Recomendação: 14 dias sem cartão para Clínica, com onboarding guiado e contato humano no dia 2; opção "comprar agora" mantida. Teste A/B se o volume permitir; senão, coorte antes/depois com conversão trial→pago e taxa de ativação.

## 5. Funil e analytics

Não há biblioteca de analytics nem captura de UTM (`grep` por `gtag|posthog|plausible|umami|utm_|dataLayer` sem resultado em `src`).

**Eventos mínimos** (nomes em inglês, propriedades sem dado de paciente):
- Aquisição: `landing_viewed` (utm_*, segmento), `cta_clicked`, `signup_started`, `signup_completed`.
- Conversão: `checkout_started`, `checkout_completed` (plano, modo trial/compra), `trial_converted`, `subscription_canceled` (motivo).
- Ativação — definição concreta: clínica que, em até 7 dias do cadastro, concluiu os 4 passos obrigatórios de `OnboardingClinica.tsx` **e** registrou pelo menos 1 check-in de paciente real na Recepção. Eventos: `onboarding_step_completed`, `first_appointment_created`, `first_checkin_done`, `activated`.
- Retenção: `weekly_active_clinic` (≥ 3 dias com check-in na semana), `prontuario_saved`, `payment_received`; coortes semanais.

**Ferramenta**: PostHog Cloud EU ou autohospedado na VPS (dados fora de terceiros nos EUA), ou Plausible/Umami para a landing sem cookies. Carregar analytics de produto só após consentimento em `CookieConsent.tsx`; eventos de servidor (checkout, ativação) registrados no Supabase como interesse legítimo, documentado no registro de tratamento. Nunca enviar nome, CPF ou conteúdo clínico.

**UTM**: capturar `utm_*` na primeira visita, guardar em cookie de primeira parte após consentimento e gravar na clínica no `signup_completed`.

**Landings por segmento**: `/clinicas`, `/laboratorios`, `/odontologia` (quando houver produto) e `/redes` (formulário de contato, não checkout). **SEO**: `index.html:6-40` tem título, descrição e Open Graph; `public/robots.txt` existe, sem `sitemap.xml` encontrado. Adicionar sitemap, pré-renderização das páginas públicas (SPA prejudica indexação), dados estruturados `SoftwareApplication`, e conteúdo por dor (confirmação de consultas, controle de caixa, entrega de laudos).

## 6. Vendas e Customer Success

**Demo navegável**: `DemonstracaoClinica.tsx` é estática. Criar uma clínica de demonstração com dados sintéticos (nomes gerados, CPFs inválidos por construção), reinicializada a cada noite, acesso por link com papel somente leitura ou sandbox por visitante.

**Roteiro de demonstração (30 min)**
1. 0–5: descoberta (porte, sistema atual, dor principal).
2. 5–12: dia da recepção — agenda, check-in, encaixe, pagamento.
3. 12–19: consulta — prontuário com identificação, prescrição, retorno.
4. 19–24: caixa e financeiro do dia.
5. 24–27: IA no WhatsApp ou laboratório, conforme segmento.
6. 27–30: implantação, preço, próximo passo com data.

**Playbook de implantação**
- Semana 0: reunião de kickoff, checklist de cadastro, contrato de tratamento de dados (operador LGPD).
- Migração: usar `src/components/importacao/ImportadorDePlanilha.tsx` como base; publicar modelos de planilha para pacientes, agenda futura e preços, com guias de exportação dos principais concorrentes (NÃO VERIFICADO quais formatos cada concorrente exporta).
- Treinamento por papel em sessões de 45 min, com as mesmas tarefas da pesquisa como roteiro; vídeos curtos em `Documentacao.tsx`.
- Go-live acompanhado no primeiro dia; revisão em 7 e 30 dias.

**Saúde do cliente** (painel em `PlatformCRM.tsx`): dias ativos por semana, check-ins/semana versus agendamentos, usuários ativos/convidados, chamados abertos, uso de IA, inadimplência. Pontuação verde/amarelo/vermelho com ação definida para cada faixa.

**NPS**: pesquisa in-app aos 30 dias e depois trimestral, só para administradores, com pergunta aberta; resultado no CRM.

**Status page**: página pública (por exemplo, Upptime no GitHub Pages ou serviço equivalente) monitorando app, API Supabase e WhatsApp.

**SLA publicado**: disponibilidade-alvo mensal, tempo de primeira resposta por severidade e canal, janela de manutenção. Só publicar números que a operação atual na VPS consegue cumprir; medir 60 dias antes.

**Prova social a coletar**: depoimentos escritos ou em vídeo de clientes reais, com autorização assinada (nome, cargo, clínica, uso de imagem e logotipo, prazo e revogação); estudos de caso com métricas medidas antes/depois no próprio sistema, aprovados pelo cliente; selos e certificações reais (por exemplo, SBIS, se obtida). Incentivo permitido: desconto em mensalidade, declarado. Nunca usar dados de pacientes.

## 7. Backlog

| ID | P | Evidência | Proposta | Esforço | Teste de aceite | Dono |
|---|---|---|---|---|---|---|
| CLIN-QA-401 | P1 | `Prontuarios.tsx:2068-2080` (nome em 10 px, sem nascimento e alergias) | `PatientIdentityBar` com nome, nascimento, idade, alergias e convênio em toda gravação clínica | M | Em edição de prontuário, nome em ≥ 14 px, data de nascimento e alergias visíveis sem rolagem | Produto + Front |
| CLIN-QA-402 | P1 | `Recepcao.tsx:1535` | Nome e nascimento do paciente no diálogo de pagamento e no PDV (`CaixaDiario.tsx:1611`) | S | Diálogo exibe nome completo e nascimento antes de confirmar | Front |
| CLIN-QA-403 | P1 | `Prontuarios.tsx:2075` CPF completo | Mascarar CPF por padrão, revelar sob ação auditada | S | CPF aparece como `***.***.***-12` e revelação gera registro de auditoria | Front + Segurança |
| CLIN-QA-404 | P1 | 100 usos de `text-[10px]/[11px]`; `Pacientes.tsx:1701-1713` | Escala tipográfica mínima e abas excedentes em menu | M | Nenhum texto < 12 px nas 5 telas; ficha com ≤ 5 abas visíveis | Design |
| CLIN-QA-405 | P1 | `OnboardingWizard.tsx:45-46` | Corrigir mojibake, remover exclamação, documentar ou remover atalhos prometidos | S | Texto em UTF-8 correto; cada atalho citado funciona | Front |
| CLIN-QA-406 | P1 | `AgendaPage.tsx` sem `aria-` | Navegação por teclado e `aria-live` na grade | M | Fluxo de agendamento completo só com teclado e NVDA | Front |
| CLIN-QA-407 | P1 | Ausência de analytics em `src` | Eventos da seção 5 com consentimento | M | Funil signup→ativação visível no painel com dados de 7 dias | Growth |
| CLIN-QA-408 | P1 | `LandingPage.tsx:197` trial 3 dias com cartão | Trial de 14 dias sem cartão para plano Clínica | M | Conversão e ativação medidas por coorte durante 60 dias | Responsável comercial |
| CLIN-QA-409 | P2 | 416 classes fixas e 1.064 hex | Tokens, regra de lint e migração por lotes | L | CI falha se a contagem aumentar; meta zero nas 5 telas | Design system |
| CLIN-QA-410 | P2 | `LandingPage.tsx:53-59` | Landing usando tokens e páginas por segmento | M | Landing sem objeto `C`; 3 páginas de segmento publicadas | Growth + Design |
| CLIN-QA-411 | P2 | `DemonstracaoClinica.tsx` estática | Clínica demo com dados sintéticos e reinício diário | M | Visitante navega agenda, prontuário e caixa sem cadastro | Produto |
| CLIN-QA-412 | P2 | Contato só `wa.me` (`LandingPage.tsx:359`) | Formulário de contato para redes e laboratórios com UTM | S | Lead grava segmento e origem | Growth |
| CLIN-QA-413 | P2 | Sem NPS/status page | NPS in-app e status page pública | M | NPS coletado aos 30 dias; status page com 3 componentes | CS |
| CLIN-QA-414 | P2 | `PlatformCRM.tsx` | Pontuação de saúde do cliente | M | Cada clínica com faixa e ação recomendada | CS |
| CLIN-QA-415 | P2 | Telas com 2.000+ linhas | Extrair subcomponentes por tarefa antes de redesenhar | L | Nenhuma das 5 telas acima de 1.200 linhas; testes existentes passam | Front |
| CLIN-QA-416 | P2 | Sem `sitemap.xml`; SPA | Sitemap, pré-renderização e dados estruturados | M | Páginas públicas indexáveis no Search Console | Growth |
| CLIN-QA-417 | P2 | Planos por clínica | Estrutura por porte e add-ons após pesquisa de preço | M | Tabela publicada e aprovada pelo responsável | Responsável comercial |
| CLIN-QA-418 | P3 | Sem unidades nem odontograma | Discovery com 5 redes e 5 clínicas odonto | M | Relatório de requisitos com decisão de construir ou não | Produto |
| CLIN-QA-419 | P3 | Atalhos ausentes nas telas operacionais | Atalhos para check-in, próximo paciente e salvar | S | Atalhos listados em `?` e funcionando | Front |
| CLIN-QA-420 | P3 | Sem SLA publicado | Publicar SLA após 60 dias de medição | S | Página de SLA com números medidos | CS + Infra |

Não há P0: nenhum achado indica dano imediato comprovado; os itens de identificação do paciente (401–403) devem ser reclassificados como P0 se o teste mostrar seleção de paciente errado.

## Não realizado

- Nenhuma inspeção visual, medição real de cliques ou teste com usuários; tudo baseado em código.
- Preços de Feegow não obtidos (falha TLS); Ninsaúde, Amplimed e ProDoctor não publicam preço.
- Não verificado: limites efetivos de Pro/Ultra, implementação dos atalhos Alt citados no tour, conteúdo da descrição de lançamentos no pagamento, estado vazio nas views da Agenda, formatos de exportação dos concorrentes.
- Linha de base de cores fixas diverge do número do briefing (1.118); critério precisa ser unificado.
- Sem auditoria automática de acessibilidade (axe/Lighthouse) nem de contraste.
- Nenhuma alteração de código, commit ou deploy.
