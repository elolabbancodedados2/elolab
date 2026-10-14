# Redesign EloLab: plano de design e de funções

Data: 13/10/2026 · Direção escolhida: **layout 1 · Clássico Premium**, com a **lista de pacientes do layout 2** na área do médico.
Prioridade combinada: primeiro o app da clínica e dos funcionários; o painel da plataforma (admin EloLab) fica por último.

---

## 1. O que já foi entregue (fase 1)

| Área | O que mudou | Arquivos principais |
|---|---|---|
| Identidade | Paleta violeta (`#6A55F2` / `#5B47E0`), destaque âmbar (`#FFB547`), azul-noite (`#17122B`), fonte **Manrope**, raios maiores, sombras com tom violeta | `src/index.css`, `tailwind.config.ts`, `index.html` |
| Cores fixas antigas | ~900 ocorrências de azul fixo convertidas para os tons violeta equivalentes (status verde, âmbar e vermelho preservados) | cerca de 100 arquivos em `src/` |
| Menu lateral | Fundo azul-noite, item ativo em pílula com degradê, grupos em caixa-alta, busca em pílula, logo para fundo escuro | `Sidebar.tsx`, `SidebarNavItem.tsx`, `sidebarMenu.ts` |
| Barra superior | Fundo translúcido sem borda, botão "+ Novo" em degradê, sino com ponto âmbar, avatar em degradê | `Navbar.tsx` |
| Componentes base | Botões em pílula com degradê; cards 22px; abas em pílula; tabelas com cabeçalho em caixa-alta; diálogos 28px; selects e badges novos | `src/components/ui/*` |
| Título de página | Título forte com ícone em bloco degradê (vale para todas as telas que usam `PageHeader`) | `PageHeader.tsx` |
| Estado vazio | Ícone em bloco degradê, brilhos de fundo e nova lista de **dicas** (`tips`) para orientar o próximo passo | `EmptyState.tsx` |
| Início do admin | Mosaico: destaque "Sua agenda de hoje", indicadores coloridos, agenda, pendências, gráfico e ações rápidas | `AdminDashboardOverview.tsx` |
| Início da recepção, enfermagem e financeiro | Antes era só saudação e atalhos. Agora tem próximo atendimento, consultas do dia, fila com tempo de espera, finalizadas, agenda e dicas do turno | `Dashboard.tsx` (`OperationalDashboard`) |
| Início do médico | Coluna "Pacientes de hoje" (layout 2), destaque do próximo paciente com alergias, indicadores, ações clínicas e produtividade do mês | `DoctorDashboard.tsx` |
| Login e cadastro | Fundo violeta/âmbar no lugar da imagem azul, cartão mais limpo, botão em degradê | `Auth.tsx` (as outras telas de acesso herdam os tokens) |

Validação: TypeScript sem erros, testes dos painéis passando e capturas de login, demonstração, início e pacientes conferidas.

---

## 2. Regras do sistema de design (para manter tudo consistente)

1. **Uma cor forte por bloco.** Degradê violeta no destaque principal; âmbar só em "atenção/agora"; azul-noite para o número mais importante. O resto fica branco.
2. **Títulos com peso misto:** saudação leve + nome em extranegrito (`font-light` + `font-extrabold`).
3. **Números grandes e finos** (`text-[34px] font-light tabular-nums`).
4. **Todo card responde "e agora?"**: além do número, uma frase de contexto ("espera média de 11 min") e um link de ação.
5. **Nunca tela vazia muda:** usar `EmptyState` com `description`, `action` e `tips`.
6. **Cores por token, nunca hex fixo.** Usar `bg-primary`, `bg-highlight`, `bg-[image:var(--gradient-primary)]`, `shadow-glow`. Hex novo no código é débito técnico.
7. **Alertas clínicos sempre em vermelho**, mesmo dentro de blocos coloridos (alergia, interação medicamentosa).
8. **Pílulas:** botões, abas e filtros são arredondados por completo. Campos de formulário ficam com raio 12px.

---

## 3. Próximas fases de design (telas)

### Fase 2: área clínica e funcionários (prioridade alta)

| Tela | O que fazer |
|---|---|
| **Prontuários / atendimento** (`Prontuarios.tsx`) | Layout 2 completo: pacientes do dia à esquerda, ficha no centro (blocos de convênio, sangue, alergia, idade; abas Resumo/Evolução/Exames/Documentos), anotações e chat da equipe à direita. Cronômetro do atendimento no topo. |
| **Agenda** | Cabeçalho com dias em chips; blocos de consulta coloridos por status; linha "agora" âmbar; painel lateral de encaixe com horários livres em pílulas (manhã/tarde). |
| **Fila e triagem** | Quadro da jornada (Aguardando → Triagem → Em atendimento → Finalizado) com tempo em cada etapa e alerta acima de 30 min. |
| **Recepção e caixa** | Mosaico: chegadas, confirmações pendentes, caixa do dia; botão grande "Registrar chegada". |
| **Pacientes** | Faixa de indicadores (ativos, novos no mês, sem retorno há 6 meses, aniversariantes), filtros em pílula e painel lateral com resumo do paciente selecionado. |
| **Ficha do paciente** | Cabeçalho em degradê com foto/iniciais, blocos de informação e linha do tempo com blocos de data. |
| **Financeiro** | Destaque "recebido hoje" em azul-noite, contas que vencem na semana, inadimplência em âmbar, gráfico receitas × despesas. |
| **Laboratório** | Pedidos em quadro por etapa (coleta, análise, laudo, entregue) e mapa de coleta com chips por sala. |
| **Equipe, configurações, ajuda** | Aplicar `PageHeader` + cards 22px + `EmptyState` com dicas. |

### Fase 3: portal do paciente e mobile
- Portal do paciente no padrão das referências mobile: saudação, card "Próxima consulta", agendamento com dias em chips e horários em pílulas, documentos e exames em lista com bloco de data.
- Menu inferior com botão "+" central no celular (PWA) para todos os perfis.

### Fase 4: painel da plataforma (por último)
- Mesmo sistema, com o layout 5 (central de comando) opcional para Saúde do serviço e Operações.

---

## 4. Telas que ainda mostram vazio "seco" (completar)

Encontradas com texto simples do tipo "Nenhum … encontrado". Trocar por `EmptyState` (ícone, explicação, ação e dicas):

- **Clínica:** Pacientes (exames e evoluções), Prontuários (evoluções), Triagem, Sinais vitais, Exames (catálogo), Laboratório (resultados), Laudos (versões), Mapa de coleta.
- **Operação:** Caixa diário (tipos de consulta, preços), Estoque (produtos, movimentações, gráfico), Médicos (agendamentos, lista), Funcionários, Tarefas, Painel TV (mídias), Chat interno.
- **Configuração:** Configurações (salas, faturas), Tipos de consulta, Preços de exames, Modelos de e-mail, Automações (logs), Analytics (gráficos sem dados).
- **Plataforma (por último):** Clínicas, Cobranças, Backups, Comunicação, Incidentes, Segurança, Operações, Domínios, Consumo, Erros.

Regra para cada uma: dizer **por que** está vazio, **o que** aparecerá ali e **um botão** para criar o primeiro registro.

---

## 5. Módulos e funções que ainda não existem

Prioridade pensada para clínicas pequenas e médias. Esforço estimado: P = até 3 dias, M = 1 a 2 semanas, G = mais de 2 semanas.

| # | Módulo | Por que importa | Design | Implementação | Esforço |
|---|---|---|---|---|---|
| 1 | **Teleconsulta** | Atender a distância e cobrar pelo app | Sala de vídeo com o prontuário ao lado; botão "Entrar" no card do próximo paciente; link enviado por WhatsApp | Provedor de vídeo (Daily, Whereby ou Jitsi), tabela `teleconsultas` (agendamento, link, status, duração), Edge Function para criar sala, consentimento do paciente | G |
| 2 | **Orçamentos para pacientes** | Procedimentos e pacotes precisam de aprovação antes | Lista de orçamentos em cards com status (rascunho, enviado, aprovado, recusado); PDF com a marca; aprovação pelo portal | Tabelas `orcamentos` e `orcamento_itens`; conversão em lançamentos ao aprovar (sem mexer no fluxo atual de `lancamentos`, só criar a partir dele) | M |
| 3 | **Pacotes e planos de tratamento** | Fisioterapia, estética e terapias vendem sessões | Card do pacote com barra de sessões usadas/restantes; agendamento em série | Tabelas `pacotes`, `pacote_sessoes`; baixa automática quando a consulta é finalizada | M |
| 4 | **Pesquisa de satisfação (NPS)** | Medir experiência e gerar avaliações | Pergunta 0–10 enviada após a consulta; painel com nota, comentários e evolução mensal | Tabela `pesquisas_satisfacao`, envio pela automação de WhatsApp existente, rota pública com token | P |
| 5 | **Emissão de NFS-e** | Obrigatório para muitas clínicas | Botão "Emitir nota" no recebimento; lista de notas com status | Integração com emissor (NFE.io, Focus NFe ou eNotas), tabela `notas_fiscais`, Edge Function com secrets | G |
| 6 | **Campanhas e CRM de pacientes** | Reativar quem sumiu e fidelizar | Segmentos prontos (sem retorno há 6 meses, aniversariantes, crônicos) e envio em lote com prévia | Reaproveitar automações e WhatsApp; tabela `campanhas` e `campanha_envios`; respeitar opt-out LGPD | M |
| 7 | **Escala e ponto da equipe** | Organizar plantões e horas | Calendário semanal por profissional, trocas de plantão e banco de horas | Tabelas `escalas`, `registros_ponto`; integra com bloqueios de agenda já existentes | M |
| 8 | **Check-in por QR / totem** | Reduz fila na recepção | QR no lembrete; tela de totem grande para confirmar a chegada | Rota pública com token do agendamento que muda o status para "aguardando" e entra na fila | P |
| 9 | **Compras e fornecedores** | O estoque já cita fornecedores, mas não há pedido de compra | Pedido de compra com aprovação e recebimento que dá entrada no estoque | Tabelas `pedidos_compra`, `pedido_compra_itens`; ligação com `Estoque` | M |
| 10 | **Odontograma** (se atender dentistas) | Especialidade com prontuário próprio | Arcada interativa com status por dente e procedimentos | Componente SVG, tabela `odontograma_registros` ligada ao prontuário | G |

Recomendação de ordem: **4 → 8 → 2 → 3 → 6 → 1 → 5 → 7 → 9 → 10**. As primeiras são rápidas, usam o que já existe (WhatsApp, fila, financeiro) e dão resultado visível.

---

## 6. Como seguir

1. Revisar este documento e escolher a próxima tela da fase 2 (sugestão: **Prontuários** no layout 2).
2. Cada módulo novo da seção 5 ganha sua própria especificação e plano antes do código.
3. Migrations e integrações (vídeo, NFS-e) só com aprovação explícita, testando primeiro em ambiente local ou de testes.
4. Não alterar a lógica do financeiro de pacientes (`pagamentos_mercadopago`, `lancamentos`) nem a cobrança dos planos sem combinar antes.
