# Gates de fase do EloLab

Dono: `clinical-quality-director`. Data: 27/10/2026.
Base: `docs/estrategia/DIAGNOSTICO_16_FUNCOES.md`, seções D.3, F e G. Os números entre parênteses (7.2, 30.1, 60.1…) são as ações do roteiro F. Os IDs `CLIN-QA-0xx` são os itens consolidados do diagnóstico.

Um gate só passa com **todos** os critérios obrigatórios cumpridos e com a evidência anexada. Sem evidência, o critério está `NÃO VERIFICADO`, e critério não verificado não passa.

## 1. Regras que valem para todos os gates

### 1.1 Quando um item conta como fechado

Para um item P0 ou P1 contar como **fechado**, ele precisa cumprir as seis condições abaixo, nesta ordem:

1. Código ou documento entregue, com caminho e linha.
2. Teste automatizado ou roteiro manual executado, com o comando e a saída real.
3. A mudança aplicada em homologação (staging com dados sintéticos) e o teste de aceite do diagnóstico executado lá. Na falta de staging, o item fica **contido**, mas não fechado.
4. A mudança publicada em produção com a aprovação do responsável e com backup feito antes, quando há banco.
5. Revisão do diretor de qualidade registrada no consolidado da rodada.
6. Parecer especializado anexado, quando o item pede um (marcado com **[AE]**).

Estados permitidos: `aberto` → `correção escrita` → `testado localmente` → `contido em homologação` → `fechado`. Nenhum item pula etapas.

### 1.2 Níveis de evidência

| Nível | O que é | Basta para |
|---|---|---|
| E0 | Afirmação sem prova | Nada |
| E1 | Leitura do código (`caminho:linha`) | Abrir ou classificar um item |
| E2 | Teste local executado (vitest, PGlite, shellcheck) | Estado `testado localmente` |
| E3 | Teste executado em homologação, com banco real e dados sintéticos | Estado `contido em homologação` |
| E4 | Verificação em produção (consulta só leitura, métrica, alerta disparado) | Estado `fechado` |
| E5 | Validação com usuários reais ou parecer especializado | Gates de usabilidade, beta e comercialização |

### 1.3 Aceite de risco

- **P0 não admite aceite de risco.** Qualquer P0 aberto mantém NO-GO em todas as fases.
- Um P1 só pode ser aceito em cenário não clínico, com registro escrito do responsável contendo prazo, mitigação e dono.
- P2 e P3 entram no planejamento da sprint e não bloqueiam gate, salvo indicação contrária abaixo.

### 1.4 Gate de mudança (vale para cada PR ou migration)

| Critério | Prova |
|---|---|
| Migration com `SECURITY DEFINER` tem `SET search_path` fixo (padrão: string vazia com nomes qualificados), `REVOKE ... FROM PUBLIC, anon` e `GRANT` explícito | Revisão do diff mais a consulta 1.2 de `docs/seguranca/consultas-vps-somente-leitura.sql` em banco efêmero |
| Função nova que precisa de anon entra na allowlist de `20261028090000_revogar_anon_e_privilegios_padrao.sql` e no teste | Diff mais o teste de grants |
| Prefixo de migration (14 primeiros caracteres) único | Listagem de `supabase/migrations` sem prefixo repetido |
| Mudança em RLS, grants ou helpers de tenant tem teste de duas clínicas | Job `security-e2e` verde, sem teste pulado (após 30.1) |
| Tela que grava dado clínico ou financeiro mostra a identificação do paciente | Revisão de UX mais o teste do componente (após 60.1) |
| Nenhuma promessa nova na landing sem a funcionalidade correspondente | Revisão de produto contra a landing |
| Nenhum dado real de paciente nem segredo no diff | Revisão mais busca por padrões de CPF, token e chave |

## 2. Fase 1: estabilização

Objetivo: fechar os P0 e provar o isolamento entre clínicas. Prazo de referência: 30 dias. Ela tem dois marcos.

### 2.1 Marco de contenção (7 dias)

Serve para proteger as clínicas que já usam o produto. Não autoriza venda.

| # | Critério obrigatório | ID | Evidência mínima |
|---|---|---|---|
| C1 | Consulta só leitura na VPS executada e anexada: funções `prosecdef` executáveis por anon, policies permissivas, migrations aplicadas contra o repositório | 001, 006 (7.1) | Saída de `docs/seguranca/consultas-vps-somente-leitura.sql` (E4) |
| C2 | Revogação de anon aplicada, com backup antes | 001 (7.2) | Chamada anon a `link_portal_paciente` e a `platform_get_clinicas_saude` retorna `42501`; a consulta 1.3 dá `anon_executa = false` fora da allowlist (E4) |
| C3 | Nenhum caminho da UI apaga dado clínico pela exclusão LGPD | 004 (7.3) | Build publicado sem chamada a `deletePatientData` alcançável; pedido gera registro, não apaga (E3) |
| C4 | Canais públicos não vinculam paciente por telefone nem por CPF sem data de nascimento | 003 (7.4) | Casos (a) e (b) do 003 e os casos B e C de `docs/qa/plano-regressao-rodada-1.md` executados em homologação (E3) |
| C5 | Decisão registrada sobre as conversas de WhatsApp com vínculo herdado pelo telefone | 003 / 507 | Decisão do responsável mais a execução da limpeza ou do encerramento (E4) |
| C6 | Backup off-site cifrado rodando e uma restauração em VM descartável com RTO medido | 005 (7.5) | Relatório do `restore-drill` com contagens e md5 conferidos (E4) |
| C7 | Landing sem promessa de código de barras e worktree sem mojibake novo | 013, 018 (7.6) | Diff da landing mais grep comparado com o HEAD |

### 2.2 Saída da estabilização (30 dias)

| # | Critério obrigatório | ID | Evidência mínima |
|---|---|---|---|
| S1 | **Zero P0 aberto**, incluindo os P0 suspeitos abertos depois do diagnóstico (ver o consolidado da rodada) | 001 a 005 e novos | Tabela de P0 do último consolidado, todos `fechado` |
| S2 | Job de CI com banco efêmero, seed de duas clínicas e cinco perfis, suítes de isolamento, RLS e RBAC **sem skip**, obrigatório para merge | 002 (30.1) | Execução verde mais um PR de prova que remove uma policy e quebra o CI |
| S3 | As asserções de isolamento falham com banco vazio e quando A enxerga dados de B | 565 | Execução de prova registrada |
| S4 | Diff de schema entre repositório e produção vazio; versões de migration únicas; deploy de banco por pipeline com aprovação; staging com dados sintéticos | 006 (30.2) | `migration list` sem divergência; o prefixo `20261010198000` resolvido |
| S5 | Smoke das 13 jornadas em staging, sem FALHOU em marcar, confirmar, recepcionar, atender, registrar prontuário e cobrar | C (30.9) | Roteiro versionado com PASSOU/FALHOU e evidência por jornada |
| S6 | Anonimização LGPD transacional com prontuário preservado e parecer do DPO | 004 (30.5) **[AE]** | Falha simulada no meio não deixa estado parcial (E3) mais o parecer anexado |
| S7 | MFA exigido no servidor (`aal2`) para admin da plataforma e para usuários com fator | 007 (30.3) | Token AAL1 negado na API (E3) |
| S8 | Convite não troca usuário de clínica | 008 (30.4) | Aceite cruzado retorna erro (E3) |
| S9 | Observabilidade mínima e runbooks (backup, disco cheio, incidente, rotação de segredos) | 015 (30.7) | Alerta disparado em teste (E4) |
| S10 | `ai-medical-assistant` desativado até haver governança | 020 (30.8) | Chamada retorna 404 ou 410 (E4) |

O webhook assíncrono do WhatsApp (009, 30.6) é P1. Ele pode ficar para a fase seguinte só com aceite de risco escrito e **se o bot estiver desligado nas clínicas do beta**.

**Quem assina:** `qa-engineer` (S2, S3, S5), `security-engineer` (C1, C2, S7, S8), `devops-sre` (C6, S4, S9), DPO (S6) e `clinical-quality-director` (gate).

## 3. Fase 2: usabilidade

Entrada: gate da estabilização aprovado. Prazo de referência: 60 dias.

| # | Critério obrigatório | ID | Evidência mínima |
|---|---|---|---|
| U1 | Cabeçalho de identificação do paciente (nome completo, nascimento, idade, alergias, CPF mascarado) em toda tela que grava dado clínico ou financeiro: prontuário, recepção (inclusive "Confirmar Pagamento"), caixa e laboratório | 012 (60.1), achados de UX da rodada 1 | Teste do componente mais a revisão das telas (E2 e E3) |
| U2 | Nenhuma tela mostra um paciente e grava em outro | 555 (antigo 545) | Teste automatizado que troca a rota com o diálogo aberto e confere o `paciente_id` gravado (E3) |
| U3 | Teste moderado: 5 participantes, 4 perfis, 5 tarefas, em staging | 60.2 | Relatório com sucesso, tempo, erros, SEQ e SUS. Meta: sucesso acima de 80% e SUS acima de 70, ou backlog derivado aprovado (E5) |
| U4 | Zero erro de identificação de paciente nas sessões do U3 | 012 | Planilha de observação (E5) |
| U5 | Tipografia mínima, abas excedentes em menu e Agenda acessível por teclado nas 5 telas diárias | 017, 019 (60.3) | `npm run check:a11y` mais teste por teclado registrado |
| U6 | Cache com tenant (`qk`) e tipos gerados no CI | 014 (60.4) | Troca de clínica ou impersonação sem dado anterior (E3) |
| U7 | Eventos de funil com consentimento e definição de ativação | 016 (60.6) | Painel com 7 dias de dados |

O U2 é antecipado: enquanto o CLIN-QA-555 (antigo 545) não for derrubado por teste, ele conta como P0 suspeito e bloqueia o S1.

## 4. Fase 3: diferenciação

Ela corre em paralelo ao beta e **não** é pré-requisito dele. É pré-requisito para os segmentos rede, laboratório e odonto (seção 6).

| # | Critério obrigatório | ID | Evidência mínima |
|---|---|---|---|
| D1 | Cada diferencial tem hipótese de valor, métrica e método de validação escritos antes de construir | E (H1 a H5) | Documento de hipótese aprovado pelo `product-manager` |
| D2 | TISS XML validado contra o XSD da versão vigente | 010 (90.1) **[AE]** | XML aceito por uma operadora piloto |
| D3 | Assinatura ICP-Brasil por provedor | 011 (90.2) **[AE]** | Assinatura validada no verificador do ITI |
| D4 | PITR ativo e restauração mensal rotineira | 005 (90.3) | Restauração num instante escolhido (E4) |
| D5 | Fila de jobs para webhooks (ADR 0003), com idempotência e DLQ | 030 | Reenvio não duplica cobrança nem mensagem (E3) |
| D6 | Nenhum diferencial com impacto assistencial sem protocolo aprovado e revisão de profissional habilitado | 020, 021 **[AE]** | Parecer clínico anexado |

## 5. Fase 4: beta fechado

Entrada: estabilização aprovada **e** U1 e U2 entregues. Escopo: 3 a 5 pequenas clínicas.

| # | Critério obrigatório | ID | Evidência mínima |
|---|---|---|---|
| B1 | Contrato de beta e DPA assinados, sem promessa de TISS, ICP, código de barras ou SLA não medido | G | Contratos **[AE]** |
| B2 | Roteiro de demo e de implantação usam só o que passou no smoke (S5) | 033 | `docs/gtm/vendas-cs/roteiro-demo-30min.md` com a tabela de ensaio preenchida em staging |
| B3 | Funções que dependiam de P0 abertos só são ligadas depois do fechamento (WhatsApp, agendamento público, links do portal) | 001, 003 | Checklist de implantação por clínica |
| B4 | Suporte e incidente: canal, plantão e runbook | 015 | Runbook publicado e um teste de incidente |
| B5 | Métricas H1 e H5 instrumentadas antes do primeiro dia | E, 016 | Painel ativo |

Saída do beta, que é a entrada da comercialização: relatório de 30 dias com H1 e H5 medidas; nenhum incidente P0 no período; NPS coletado (90.5); nenhum erro de paciente relatado sem análise de causa concluída.

## 6. Fase 5: comercialização

Entrada: saída do beta aprovada. A venda é liberada **por segmento**, conforme a seção F.6 do diagnóstico.

| Segmento | Gate de entrada (todos obrigatórios) | Prova |
|---|---|---|
| Clínicas pequenas e médias | Saída do beta; backup com restauração medida no último mês; preço aprovado depois de pesquisa com 20 ou mais clínicas (6m.1) | Coorte de 60 dias medida |
| Redes multiunidade | Gate anterior mais multiunidade (ADR 0001, 6m.4), papéis por unidade (008), D2 e D3 | pgTAP unidade A contra B verde; uma rede piloto com 2 ou mais unidades |
| Laboratórios | Gate de clínicas mais código de barras (6m.5), interfaceamento (6m.6), segregação entre validar e liberar e avaliação RDC **[AE]** | Etiqueta lida em bancada; resultado do equipamento sem redigitação |
| Odonto e especialidades | Gate de clínicas mais odontograma ligado ao orçamento (6m.7) | Fluxo completo numa clínica odonto piloto |

Critérios comuns:
- SLA publicado só depois de 60 dias de medição (6m.3).
- Landing revisada contra o produto, sem divergência (6m.2).
- Avaliação SBIS/CFM e LGPD contratada (6m.9) **[AE]**.

## 7. Estado atual dos gates (27/10/2026)

| Gate | Situação | Motivo |
|---|---|---|
| Contenção (7 dias) | **Não atingido** | C1 a C7 sem evidência E3 ou E4; nada aplicado nem publicado |
| Estabilização | **Não atingido** | 5 P0 abertos e 1 P0 suspeito novo (CLIN-QA-555, antigo 545) (ver `docs/time/rodada-1/CONSOLIDADO.md`) |
| Usabilidade, diferenciação, beta, comercialização | Bloqueados | Dependem da estabilização |

Veredito vigente: **NO-GO** para escala; GO CONDICIONAL para o beta só depois da saída da estabilização.
