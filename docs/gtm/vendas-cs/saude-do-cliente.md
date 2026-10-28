# Saúde do cliente, NPS e SLA

Data: 27/10/2026. Autor: `sales-customer-success`.

## 1. O que existe hoje para medir

| Fonte | O que entrega | Evidência | Limite |
|---|---|---|---|
| CRM da plataforma (`/admin/crm`) | Por clínica: plano, valor, status da assinatura, teste, vencimento, total de médicos, funcionários, pacientes e agendamentos, última atividade, dias sem uso | `src/pages/PlatformCRM.tsx:33-54`, RPC `platform_crm_overview` (`:118`) | Sem uso por módulo. A última atividade junta "último acesso ou registro" (`:98`) |
| Saúde da plataforma (`/admin/saude`) | Por clínica: dias desde a última atividade, atendimentos parados, coletas esquecidas, exames solicitados há 7 dias, contas a receber vencidas (quantidade e valor), agendamentos no mês, registros de auditoria no mês | `src/pages/PlatformSaude.tsx:32-50`, RPC `platform_get_clinicas_saude` (`:105`) | Essa RPC faz parte do P0 CLIN-QA-001 (pode ser chamada sem login). Use o painel, mas não amplie o uso antes da correção |
| Central de suporte (`/suporte`, `/admin/suporte`) | Chamados com categoria, prioridade, status, prazo e data da primeira resposta | `src/pages/CentralSuporte.tsx:28-31,101`; `supabase/migrations/20260819040000_central_suporte.sql:7,15-16` | — |
| Relatório executivo | Chamados com prazo vencido | `supabase/migrations/20261008230000_alinhar_mrr_do_relatorio_executivo.sql:41` | — |
| Treinamento | Progresso por usuário | `src/pages/Treinamento.tsx:86`, tabela `user_training_progress` | — |
| Telemetria de produto | Não existe. A única ocorrência é o rastreio de erros (`src/lib/errorTracking.ts`) | busca por `telemetr`, `usage_event`, `track(` em `src`, 27/10/2026 | Sem uso por módulo e sem eventos de funil (CLIN-QA-016) |
| NPS do cliente (clínica) | Não existe. O único NPS é o do paciente, no portal | `src/pages/PortalPaciente.tsx:604-605` | — |

## 2. Métricas de saúde

Uma linha por clínica, revisada toda semana pelo CS.

| # | Métrica | Fonte hoje | Verde | Amarelo | Vermelho |
|---|---|---|---|---|---|
| M1 | Dias sem uso | CRM `dias_sem_uso`; os limites seguem os do código (`PlatformCRM.tsx:103-107`) | < 14 | 14 a 29 | ≥ 30, ou sem atividade após 30 dias de cliente |
| M2 | Agendamentos no mês, comparados com o mês anterior | Saúde `total_agendamentos_no_mes` | Estável ou em alta | Queda de 20% a 50% | Queda > 50% |
| M3 | Ativação (`implantacao.md`, seção 6) | Verificação manual na D+7 | Ativada até D+7 | Ativada entre D+8 e D+14 | Não ativada em D+14 |
| M4 | Uso por módulo: recepção, prontuário, caixa, laboratório e WhatsApp | **Não disponível.** Proxy até haver eventos: contagem semanal de check-ins, prontuários salvos, recebimentos e exames por clínica | 3 módulos contratados em uso semanal | 1 a 2 | Só agenda |
| M5 | Usuários ativos / convidados | Não disponível. Proxy: total de médicos e funcionários no CRM | ≥ 70% | 40% a 69% | < 40% |
| M6 | Chamados abertos e com prazo vencido | Central de suporte | 0 vencidos | 1 vencido ou ≥ 3 abertos | Chamado crítico vencido |
| M7 | Atendimentos parados e coletas esquecidas | Saúde `agendamentos_em_atendimento`, `coletas_esquecidas` (alertas em `PlatformSaude.tsx:53-58`) | 0 | Abaixo do limite crítico do painel | Acima do limite crítico |
| M8 | Assinatura | CRM `dias_para_vencer`, status | Ativa, > 7 dias | Vence em ≤ 7 dias ou em teste | Vencida ou expirada |
| M9 | NPS do admin | A implementar (seção 3) | Promotor (9–10) | Neutro (7–8) | Detrator (0–6) |

**Faixa da clínica:** vermelha se houver qualquer métrica vermelha entre M1, M3, M6 e M8, ou duas vermelhas quaisquer. Amarela se houver duas amarelas ou mais. Nos outros casos, verde. Os limites são hipótese e devem ser recalibrados depois de 60 dias com dados reais.

**Para virar painel:** a pontuação deve ser calculada no banco e exibida no `PlatformCRM` (CLIN-QA-033, ex-414). As métricas M4 e M5 dependem dos eventos do CLIN-QA-016. Nenhum evento pode levar nome, CPF ou conteúdo clínico.

## 3. NPS

- **Quem responde:** só administradores da clínica. Não perguntar a pacientes por este canal.
- **Quando:** 30 dias depois do go-live e depois a cada trimestre. No máximo uma pesquisa a cada 90 dias por pessoa.
- **Perguntas:** (1) "De 0 a 10, quanto você recomendaria o EloLab a outra clínica?" (2) "Qual o principal motivo da sua nota?" (texto livre, opcional).
- **Canal:** dentro do sistema, ao entrar, com opção de responder depois. Até existir, por formulário enviado pelo CS. Guardar o resultado vinculado à clínica no CRM.
- **Ação:** detrator recebe contato do CS em até 2 dias úteis. Neutro entra na revisão mensal. O motivo de cada resposta vai para o registro de feedback (seção 6).
- **Uso público:** nenhuma nota ou comentário vai para material de marketing sem autorização assinada (`docs/estrategia/funcoes/04-ux-gtm.md`, seção 6).

## 4. Playbook de risco de cancelamento

| Gatilho | Ação | Prazo | Dono |
|---|---|---|---|
| Faixa vermelha | Ligação com o admin; identificar a causa: configuração, treinamento, produto ou preço | 2 dias úteis | CS |
| M1 ≥ 14 dias | Mensagem com uma tarefa concreta: "importar a agenda da próxima semana" ou "registrar o primeiro check-in" | 1 dia útil | CS |
| Não ativou em 7 dias | Nova sessão de implantação e nova data | 7 dias | CS |
| Chamado crítico vencido | Escalar para o responsável técnico e avisar o cliente do prazo novo | Imediato | CS + engenharia |
| Pedido de cancelamento | Registrar o motivo. Não oferecer desconto que não exista. Se o motivo for funcionalidade ausente (TISS, ICP, multiunidade), registrar e encerrar sem promessa | 1 dia útil | CS |
| Assinatura vencendo em ≤ 7 dias | Lembrete e verificação do meio de pagamento | 7 dias antes | CS |
| Saída confirmada | Orientar a exportação. O procedimento completo de saída e a retenção do prontuário depois do cancelamento requerem avaliação especializada (jurídica) | — | CS + responsável |

## 5. SLA

### 5.1 O que existe

Cada chamado recebe um prazo de primeira resposta pela prioridade, calculado no banco (`supabase/migrations/20260819040000_central_suporte.sql:15-16`):

| Prioridade | Prazo de primeira resposta |
|---|---|
| Crítica | 1 hora |
| Alta | 4 horas |
| Normal | 12 horas |
| Baixa | 24 horas |

O prazo corre em horas corridas, sem horário comercial. Quem escolhe a prioridade é quem abre o chamado (`CentralSuporte.tsx:295-298`).

### 5.2 O que não publicar ainda

- **Disponibilidade.** Não há monitoramento externo nem status page (CLIN-QA-015, CLIN-QA-033). Produção roda numa VPS única, com backup no mesmo servidor (CLIN-QA-005). Não publique percentual de disponibilidade.
- **Prazos de primeira resposta como compromisso.** Os prazos da tabela são metas internas. Não foram medidos. Uma resposta em 1 hora, às 3 da manhã, exige plantão que não está definido.
- **Prazo de resolução.** Não existe no sistema.

### 5.3 Proposta de SLA para publicar depois de 60 dias de medição

| Item | Proposta inicial | Condição para publicar |
|---|---|---|
| Canal oficial | Central de suporte no sistema; telefone ou WhatsApp só para incidente crítico | Canal de incidente definido |
| Horário de atendimento | Dias úteis, das 8h às 18h (horário de Brasília) | Equipe de plantão definida |
| Primeira resposta | Crítica 1 h, inclusive fora do horário; Alta 4 h úteis; Normal 1 dia útil; Baixa 2 dias úteis | 60 dias com ≥ 90% dos chamados dentro do prazo |
| Definição de crítica | Sistema fora do ar, perda de dado ou dado de outra clínica visível | — |
| Disponibilidade mensal | Definida depois da medição | Status page com 60 dias de histórico e monitoramento externo |
| Janela de manutenção | Comunicada com 48 h de antecedência, fora do horário de atendimento | Processo de deploy com aprovação (CLIN-QA-006) |
| Comunicação de incidente | Aviso no sistema e na status page em até 1 h após a detecção | Runbooks (CLIN-QA-015) |

Para contratos de rede, o SLA contratual, com créditos e penalidades, requer avaliação especializada (jurídica) e só depois que existir oferta para redes.

**Medição necessária:** o horário comercial no cálculo (a função hoje usa horas corridas), relatório mensal de cumprimento por prioridade e a prioridade revisada pelo suporte na triagem.

## 6. Base de conhecimento e feedback de produto

**Base de conhecimento.** Hoje o cliente tem as trilhas de `/treinamento`. `/documentacao` é só da plataforma (`src/App.tsx:321`). Proposta: artigos curtos com o mesmo padrão das trilhas, começando pelas perguntas de implantação: importar pacientes, importar agenda, configurar tipo de consulta, abrir e fechar caixa, lote e glosa, por que a assinatura não é ICP, o que fazer se o check-in não gerar cobrança. Revisão a cada release.

**Registro de feedback.** Uma linha por pedido ou objeção, revisada todo mês com o `product-manager`. Campos: data, clínica (sem dado de paciente), segmento, porte, perfil de quem pediu, funcionalidade, impacto (perdeu venda, risco de cancelamento ou incômodo) e evidência (chamado, NPS, ata de reunião). Fonte dentro do sistema: `/feedback` (`src/App.tsx:255`).

**Itens já identificados nesta rodada para o `product-manager`** (IDs a atribuir pelo PM; proposta na faixa 5xx):

| Proposta | Origem | Impacto comercial | Esforço estimado |
|---|---|---|---|
| Painel de saúde com faixa e ação no `PlatformCRM` (M1–M9) | Seção 2 | Detectar cancelamento antes do pedido | M |
| Eventos de uso por módulo e de ativação | Seção 2, M4/M5; CLIN-QA-016 | Medir ativação e retenção | M |
| NPS do administrador dentro do sistema, com resultado no CRM | Seção 3 | Medir satisfação; prova social futura | S |
| Prazo de suporte em horário comercial e relatório mensal de cumprimento | Seção 5 | Permite publicar SLA | S |
| Clínica de demonstração sintética com reinício diário | `roteiro-demo-30min.md`, seção 6; CLIN-QA-033 | Demo e treinamento sem dado real | M |
| Modelo de planilha para download no importador e importação de preços | `implantacao.md`, seção 4 | Reduz o tempo de implantação | S |
| Base de conhecimento acessível ao cliente | Seção 6 | Menos chamados | M |
| Exportação completa da clínica e procedimento de saída | `objecoes.md`, seção 3 | Objeção "e se eu sair?" | M (requer avaliação jurídica) |
