# Processo: pedido de exclusão e anonimização LGPD do titular

Autor: `business-analyst`, rodada 1, 27/10/2026.
Escopo: o pedido do paciente (titular) para eliminar os próprios dados, da entrada do pedido até a decisão e a execução. Exportação, acesso e correção aparecem só onde compartilham o mesmo fluxo.
Itens relacionados: CLIN-QA-004 (P0), CLIN-QA-508 (bloqueio), CLIN-QA-513 (anonimização transacional), CLIN-QA-020 e CLIN-QA-029.

**Conformidade:** este documento descreve o processo e o código. Não diz o que a LGPD, a Lei 13.787/2018 ou as resoluções do CFM exigem no caso concreto. Toda decisão sobre o que reter, por quanto tempo e com que base legal **requer avaliação especializada** (jurídico/DPO).

## 0. Estado do código e o que esta análise cobre

- As linhas citadas valem para o worktree `admin-finance-realtime`, branch `feat/recepcao-painel-dia-melhorias`, em 27/10/2026. O `tech-lead` está editando `src/lib/lgpdCompliance.ts` nesta rodada, então as linhas desse arquivo podem mudar.
- Há quatro estados distintos:
  1. **AS-IS antes da contenção** (diagnóstico, D.1 item 7): a tela `/lgpd-pacientes` chamava `deletePatientData`, que apagava dados clínicos tabela por tabela, no cliente.
  2. **AS-IS no worktree**: a exclusão automática está suspensa. A tela só registra o pedido como tarefa (item 7.3 do roadmap, CLIN-QA-508). **Ainda não commitado nem publicado.**
  3. **Proposta local do `backend-developer`**: a RPC `lgpd_anonimizar_paciente` (`supabase/migrations/20261028100000_lgpd_anonimizacao_transacional.sql`) e o cliente `src/lib/lgpdAnonimizacao.ts`. Não foi aplicada nem ligada a nenhuma tela.
  4. **Produção:** NÃO VERIFICADO. Como o deploy é manual (CLIN-QA-006), a hipótese mais provável é que produção ainda rode o estado 1.
- Nenhum fluxo foi executado. As regras foram extraídas por leitura de código.

## 1. Atores e dados

| Ator | Papel no processo |
|---|---|
| Titular (paciente) | Pede acesso, correção, exportação ou exclusão, no balcão ou no portal |
| Admin da clínica | Único perfil com acesso a `/lgpd-pacientes` (`src/App.tsx:348`). Registra o pedido e exporta os dados |
| Encarregado (DPO) da clínica | Analisa o pedido de exclusão. **Não existe como papel no sistema**: recebe uma tarefa comum |
| Admin da plataforma (EloLab) | Decide pedidos de acesso, correção e exportação em `/admin/lgpd` (`src/App.tsx:331`) pela RPC `platform_update_lgpd_request` |

Dados envolvidos: `pacientes`, `prontuarios`, `prescricoes`, `exames`, `triagens`, `anexos_prontuario`, `agendamentos`, `lancamentos`, `guias_externas`, `tarefas`, `audit_log`, `lgpd_consent_log`, `consentimentos_lgpd`, `lgpd_access_request_log`, `lgpd_deletion_log`, `paciente_portal_tokens`, `whatsapp_conversations` e `whatsapp_messages`, e o bucket `patient-photos`.

## 2. AS-IS antes da contenção (resumo do diagnóstico)

| Passo | Comportamento | Efeito |
|---|---|---|
| Admin clica em excluir em `/lgpd-pacientes` | `deletePatientData` grava `lgpd_deletion_log` e depois apaga, em laço no cliente, `anexos_prontuario`, `prescricoes`, `exames`, `triagens`, `prontuarios`, `agendamentos` e `pacientes` (`src/lib/lgpdCompliance.ts:204-252`) | Perda irreversível de dado clínico |
| Uma tabela falha | O laço continua (`:247-250`) e só no fim lança "Exclusão incompleta" (`:254-258`) | Estado parcial |
| Último passo (`pacientes`) | O gatilho `preservar_historico_ao_excluir_paciente` bloqueia a exclusão se sobrar qualquer linha com FK para o paciente, como `lancamentos`, `atestados` ou `lgpd_consent_log` (`supabase/migrations/20261007200000_preservar_historico_ao_excluir_paciente.sql:15-43`) | **Caso de borda grave (hipótese, por leitura):** o paciente com financeiro tinha prontuário, prescrições e exames apagados, e o cadastro sobrevivia. Era o pior dos dois mundos |

## 3. AS-IS no worktree

### 3.1 Fluxo

```
Titular pede exclusão (balcão, telefone ou e-mail; o portal não oferece exclusão)
  → Admin abre /lgpd-pacientes, busca por nome, CPF ou e-mail
  → "Solicitar exclusão" → informa o motivo → "Registrar solicitação"
  → Tarefa urgente "Solicitação LGPD de exclusão: <nome>" criada para a clínica
  → [fora do sistema] DPO analisa, decide e executa (ou não) manualmente
```

### 3.2 Regras extraídas do código

| ID | Regra | Evidência |
|---|---|---|
| RN-LG-01 | Só o perfil `admin` acessa a tela de direitos do titular | `src/App.tsx:348` |
| RN-LG-02 | A exclusão automática está desligada por constante. `deletePatientData` lança `ExclusaoLgpdBloqueadaError` antes de tocar no banco | `src/lib/lgpdCompliance.ts:136`, `:200-202` |
| RN-LG-03 | A tela não chama mais `deletePatientData`. "Solicitar exclusão" chama `registrarSolicitacaoExclusaoLgpd` | `src/pages/LgpdPacientes.tsx:24`, `:70-96` |
| RN-LG-04 | O motivo é obrigatório (o botão fica desabilitado sem texto e a função recusa string vazia) | `LgpdPacientes.tsx:231`; `lgpdCompliance.ts:160-161` |
| RN-LG-05 | O pedido vira `tarefas` com categoria `Administrativo`, prioridade `urgente`, status `pendente`, `paciente_id` preenchido e o texto "Encaminhe ao encarregado de dados (DPO)" | `lgpdCompliance.ts:167-183` |
| RN-LG-06 | O pedido de exclusão **não** entra em `lgpd_access_request_log`, porque o CHECK de `request_type` só aceita `export`, `access` e `correction` | `lgpdCompliance.ts:151-152`; `20260729140000_tabelas_lgpd_de_verdade.sql:64` |
| RN-LG-07 | A exportação (portabilidade) monta um JSON no navegador com cadastro, agendamentos, prontuários, exames, triagens, atestados, encaminhamentos, lançamentos, retornos, lista de espera, comorbidades, prescrições, anexos (metadados), adendos, auditoria, consentimentos e pedidos LGPD. Qualquer erro aborta | `lgpdCompliance.ts:45-123`; download em `LgpdPacientes.tsx:44-66` |
| RN-LG-08 | O cadastro do paciente só pode ser apagado quando não existe nenhuma linha em tabela com FK para `pacientes` | `20261007200000…sql:15-43`; mensagem traduzida em `src/pages/Pacientes.tsx:850-854` |
| RN-LG-09 | Fora da tela LGPD, `Pacientes.tsx` ainda permite o DELETE direto do cadastro, filtrado por `clinica_id`. Ele só funciona para paciente sem nenhum histórico (RN-LG-08) | `src/pages/Pacientes.tsx:836-837` |
| RN-LG-10 | No portal, o titular pede `access`, `correction` ou `export`, e o pedido de correção exige descrição. Um pedido pendente do mesmo tipo não é duplicado | `supabase/functions/patient-portal/index.ts:279-303` |
| RN-LG-11 | Pedidos do log têm prazo padrão de 15 dias (`prazo_em`) | `20260819080000_central_lgpd_plataforma.sql:1` |
| RN-LG-12 | Só o admin da plataforma decide um pedido do log (`fulfilled` ou `denied`), com justificativa de 20 a 1.000 caracteres, apenas a partir de `pending` e com registro em `audit_log` | `20261008200000_auditar_decisoes_de_solicitacoes_lgpd.sql:20-54` |
| RN-LG-13 | Os logs LGPD não têm política de UPDATE nem de DELETE para a clínica (log imutável); a exceção é o status do pedido | `20260729140000…sql:96-140` |
| RN-LG-14 | No portal, o consentimento `tratamento_dados` não pode ser revogado | `patient-portal/index.ts:248-250` |

### 3.3 Regras implícitas e casos de borda

| Caso | Comportamento atual | Avaliação |
|---|---|---|
| Titular pede exclusão pelo portal | Não há opção. O portal só aceita acesso, correção e exportação (RN-LG-10) | O titular depende do balcão. Lacuna L-LG-03 |
| Pedido de exclusão sem prazo | A tarefa tem vencimento vazio (o insert não envia `data_vencimento`) e não aparece em `/admin/lgpd` | Dois circuitos paralelos: exclusão em `tarefas` e os demais pedidos no log, com prazo. Lacuna L-LG-02 |
| Quem decide | A exclusão fica com o DPO da clínica, fora do sistema; os outros pedidos ficam com o admin da **plataforma** (RN-LG-12) | A clínica é a controladora dos dados do paciente. Que o operador (EloLab) decida o pedido do titular **requer avaliação especializada**. Lacuna L-LG-05 |
| Paciente homônimo | A busca acha por nome, CPF ou e-mail (`LgpdPacientes.tsx:38-42`). A linha mostra nome, CPF completo e e-mail (`:156-159`). Não mostra nascimento | Risco de registrar o pedido no homônimo errado. O CPF aparece completo, contra a proposta de CLIN-QA-526 |
| Exportação com muitos dados | Monta tudo em memória no navegador; os anexos saem só como metadados (`anexos_prontuario`), sem os arquivos | O titular recebe as referências, não os arquivos. Lacuna L-LG-07 |
| Exportação sem registro | `handleExport` não grava nada em `lgpd_access_request_log` nem em `audit_log` (`LgpdPacientes.tsx:44-66`) | Não fica prova de que a portabilidade foi atendida. Lacuna L-LG-06 |
| Consentimento do portal no log | O portal grava `consent_type = 'tratamento_dados'` etc. em `lgpd_consent_log` (`patient-portal/index.ts:267-274`), mas o CHECK só aceita `data_processing`, `marketing`, `third_party` e `revocation` (`20260729140000…sql:39`; nenhuma migration posterior altera o CHECK, conferido por grep). O erro não é verificado | **Gravação falha em silêncio** (hipótese forte por leitura; NÃO VERIFICADO em execução). O histórico principal fica em `consentimentos_lgpd`. Lacuna L-LG-08 |
| Excluir pelo cadastro comum | RN-LG-09: apaga paciente sem histórico, sem gravar `lgpd_deletion_log` | Para cadastro criado por engano é aceitável. Para pedido do titular, deixa de existir prova. Lacuna L-LG-04 |
| Paciente com atendimento em aberto | Hoje nada é executado, então não se aplica | A proposta TO-BE bloqueia (seção 4) |

## 4. Proposta local: anonimização transacional (estado 3)

Arquivos: `supabase/migrations/20261028100000_lgpd_anonimizacao_transacional.sql` (não aplicada) e `src/lib/lgpdAnonimizacao.ts`.

| ID | Regra proposta | Evidência |
|---|---|---|
| RP-LG-01 | Exige sessão, papel `admin` e mesma clínica, conferidos no servidor | `…100000…sql:120-133` |
| RP-LG-02 | Motivo com 10 a 2.000 caracteres | `:135-138`; cliente em `lgpdAnonimizacao.ts:24-28` |
| RP-LG-03 | Trava a linha do paciente (`FOR UPDATE`). Paciente de outra clínica recebe "não encontrado" | `:142-151` |
| RP-LG-04 | Idempotente: a segunda chamada devolve `ja_anonimizado` sem alterar nada | `:154-160` |
| RP-LG-05 | Confirmação: o admin digita o nome atual do paciente (sem diferenciar maiúsculas) | `:162-165` |
| RP-LG-06 | Recusa com agendamento de hoje em diante ou atendimento em aberto | `:168-178` |
| RP-LG-07 | O cadastro fica, com o nome trocado por "Paciente anonimizado XXXXXXXX" e 21 campos de identificação e contato anulados. Sexo, tipo sanguíneo, alergias, gestante e convênio ficam | `:180-208`; decisão em `:34-35` |
| RP-LG-08 | Limpa as cópias em `guias_externas`, substitui o nome em títulos e descrições de `tarefas`, desativa tokens do portal, apaga a lista de espera e desvincula conversas do WhatsApp | `:210-250` |
| RP-LG-09 | Na `audit_log` do cadastro, troca os valores pessoais por `[anonimizado]` e mantém quem, quando e quais campos | `:252-277` |
| RP-LG-10 | Grava `lgpd_deletion_log` com `operacao = 'anonimizacao'` e as contagens, na mesma transação | `:74-82`, `:280-293` |
| RP-LG-11 | Não toca em prontuário, prescrição, exame, laudo, anexo, `lancamentos` nem `pagamentos_mercadopago` | `:30-36` |
| RP-LG-12 | A foto é removida do Storage depois do commit. Se falhar, vira pendência manual | `lgpdAnonimizacao.ts:160-169` |

Casos de borda que a proposta **não** cobre (por leitura do SQL):

| Caso | Situação | Lacuna |
|---|---|---|
| Nome do paciente em texto livre clínico | Fica: prontuário, prescrição e atestado não são alterados (`:32-33`) | Decisão deliberada. Requer avaliação especializada |
| Nome em `agendamentos.observacoes` | Não é tratado. O link público grava ali o nome, o telefone e o e-mail informados (`public-booking/index.ts:268`, ver `identificacao-paciente-canais-publicos.md` RN-AO-14 e o caso do nome divergente) | L-LG-09 |
| Nome em `lancamentos.descricao` | Não é tratado. O check-in grava "`<tipo> - <nome> - <tipo>`" (`src/lib/autoBilling.ts:400-402`), e o time proibiu mexer em `lancamentos` | L-LG-10 (decisão do PO e do DPO) |
| Mensagens do WhatsApp e `remote_jid` | Ficam; o retorno lista a pendência (`:37-38`; `lgpdAnonimizacao.ts:171-175`) | L-LG-11 |
| `consentimentos_lgpd`, `lgpd_consent_log` e `lgpd_access_request_log` | Ficam ligados ao `paciente_id`, sem dado pessoal direto | Aceitável: servem de prova |
| Dependentes (`nome_responsavel`, `cpf_responsavel`) | Os campos do próprio cadastro são anulados. O cadastro do responsável, quando existe, não é tocado | Correto |
| Nome curto (menos de 3 caracteres) | A substituição em `tarefas` é pulada (`:223`) | Aceitável |
| Paciente duplicado (mesma pessoa em dois cadastros) | A função age em um `paciente_id` só | L-LG-12: o processo precisa procurar duplicatas antes |
| Backups | Cópias anteriores continuam com o dado | Requer avaliação especializada (política de retenção de backup, CLIN-QA-005) |

## 5. TO-BE

### 5.1 Princípios

1. Todo pedido do titular (acesso, correção, exportação e exclusão) entra no **mesmo registro**, com prazo, responsável e decisão.
2. Exclusão de quem tem histórico clínico vira **anonimização do cadastro**, nunca DELETE de dado clínico. O que fica retido e por quanto tempo é decisão jurídica (requer avaliação especializada).
3. A execução é uma transação única no servidor, com confirmação de identidade, e não deixa estado parcial.
4. Decide quem é controlador (a clínica, pelo seu DPO). A plataforma acompanha e audita.

### 5.2 Fluxo TO-BE

```
Pedido (portal | balcão | e-mail)
  → registro em lgpd_access_request_log (request_type = 'deletion'), prazo_em = +15 dias
  → triagem pelo DPO da clínica:
       ├─ titular sem histórico clínico → exclusão do cadastro + lgpd_deletion_log (operacao = 'exclusao')
       ├─ titular com histórico        → anonimização transacional (lgpd_anonimizar_paciente)
       └─ indeferido (base legal)      → status 'denied' + justificativa
  → pendências pós-execução (foto, WhatsApp, observações) tratadas e marcadas
  → resposta ao titular pelo canal de origem, com data
  → pedido 'fulfilled' com evidência
```

### 5.3 Regras TO-BE

| ID | Regra | Muda o quê |
|---|---|---|
| TB-LG-01 | Ampliar o CHECK de `request_type` para incluir `deletion`. `registrarSolicitacaoExclusaoLgpd` passa a gravar no log, e a tarefa fica como aviso | Unifica os dois circuitos (L-LG-02) |
| TB-LG-02 | O portal oferece "pedir exclusão" com aviso de que o prontuário tem guarda legal | Fecha L-LG-03 |
| TB-LG-03 | Papel de **encarregado** na clínica (ou permissão `lgpd.decidir`), que decide os pedidos da própria clínica. O admin da plataforma só consulta e audita | Fecha L-LG-05 (requer avaliação especializada) |
| TB-LG-04 | A ação de anonimizar só aparece a partir de um pedido aprovado e referencia o `id` do pedido no `lgpd_deletion_log` | Liga pedido, decisão e execução |
| TB-LG-05 | Antes de anonimizar, a tela lista possíveis duplicatas da mesma pessoa (mesmo CPF, ou mesmo nome e nascimento) para tratar todas juntas | Fecha L-LG-12 |
| TB-LG-06 | Aprovação dupla: quem registra o pedido não executa a anonimização sozinho (diagnóstico, CLIN-QA-004) | Segregação de funções |
| TB-LG-07 | A exportação registra no log (`export`, `fulfilled`) quem exportou e quando, e inclui os arquivos dos anexos ou links temporários | Fecha L-LG-06 e L-LG-07 |
| TB-LG-08 | O DELETE comum de `Pacientes.tsx` também grava `lgpd_deletion_log` (`operacao = 'exclusao'`, motivo "cadastro sem histórico") | Fecha L-LG-04 |
| TB-LG-09 | Corrigir o mapeamento do consentimento do portal para `lgpd_consent_log` (ou ampliar o CHECK) e verificar o erro da gravação | Fecha L-LG-08 |
| TB-LG-10 | A anonimização também limpa `agendamentos.observacoes`, para as linhas de origem online | Fecha L-LG-09 |
| TB-LG-11 | A linha de busca da tela LGPD mostra nome, nascimento e CPF mascarado | Reduz o risco de homônimo (CLIN-QA-526) |
| TB-LG-12 | Painel do encarregado: pedidos por status, vencendo e vencidos | Prazo visível |

### 5.4 Critérios de aceite do processo (para o PO e o QA)

- Dado um paciente com prontuário, quando o pedido aprovado é executado, então o prontuário continua íntegro, o cadastro mostra o rótulo anonimizado e existe uma linha em `lgpd_deletion_log` ligada ao pedido.
- Dado um erro simulado no meio da anonimização, quando a função falha, então nenhuma tabela foi alterada (cadastro, guias, tarefas e auditoria iguais ao estado anterior).
- Dado um admin da clínica B, quando chama a anonimização para um paciente da clínica A, então recebe "não encontrado" e nada muda.
- Dado um usuário com papel `recepcao`, quando tenta anonimizar, então recebe permissão negada.
- Dado um pedido de exclusão feito no portal, quando o DPO abre o painel, então vê o pedido com prazo de 15 dias.
- Dada uma exportação, quando o arquivo é baixado, então existe um registro `export` atendido com usuário e data.

## 6. Multiunidade

| Item | Compartilhado na organização | Isolado por unidade |
|---|---|---|
| Pedido do titular | Sim. O titular é uma pessoa da organização, e o pedido vale para todas as unidades onde foi atendido | — |
| Encarregado (DPO) | Em geral um por organização (controladora) | — |
| Execução da anonimização | Precisa alcançar o cadastro em todas as unidades numa só transação | Hoje a função recebe uma `clinica_id` (`…100000…sql:86-91`) |
| Logs LGPD | Visíveis para o DPO da organização | Cada unidade vê os seus |

Pré-requisito: CLIN-QA-024 (multiunidade inexistente).

## 7. Lacunas

Os IDs são locais. O `product-owner` converte em `CLIN-QA-5xx`. As já cobertas pelo backlog estão indicadas.

| ID | Lacuna | Gravidade sugerida | Evidência | Proposta |
|---|---|---|---|---|
| L-LG-00 | Contenção (exclusão suspensa) só no worktree; produção provavelmente ainda apaga dado clínico | **P0** (até publicar) | Estado do worktree; CLIN-QA-006 | Commitar e publicar com autorização (CLIN-QA-508) |
| L-LG-01 | Não há execução do pedido de exclusão no sistema: só uma tarefa | P1 | `lgpdCompliance.ts:154-189` | Anonimização transacional após parecer (CLIN-QA-513) |
| L-LG-02 | A exclusão fica fora de `lgpd_access_request_log`: sem prazo, sem decisão registrada e fora do painel | P1 | `lgpdCompliance.ts:151-152`; CHECK em `20260729140000…sql:64` | TB-LG-01 |
| L-LG-03 | O portal não aceita pedido de exclusão | P2 | `patient-portal/index.ts:282` | TB-LG-02 |
| L-LG-04 | O DELETE comum de paciente não deixa registro LGPD | P2 | `Pacientes.tsx:836-837` | TB-LG-08 |
| L-LG-05 | Pedidos do titular são decididos pelo admin da plataforma, não pela clínica | P1 (requer avaliação especializada) | `20261008200000…sql:20` | TB-LG-03 |
| L-LG-06 | A exportação não é registrada | P2 | `LgpdPacientes.tsx:44-66` | TB-LG-07 |
| L-LG-07 | A exportação leva só os metadados dos anexos | P2 | `lgpdCompliance.ts:90` | TB-LG-07 |
| L-LG-08 | O consentimento do portal viola o CHECK de `lgpd_consent_log` e falha em silêncio | P2 (prova de consentimento perdida) | `patient-portal/index.ts:267-274` × `20260729140000…sql:39` | TB-LG-09. NÃO VERIFICADO em execução |
| L-LG-09 | A anonimização não limpa `agendamentos.observacoes` | P2 | `public-booking/index.ts:268`; ausente em `…100000…sql:182-250` | TB-LG-10 |
| L-LG-10 | O nome fica em `lancamentos.descricao` | P3 (decisão) | `autoBilling.ts:400-402` | Decisão do PO e do DPO, respeitando a regra de não alterar `lancamentos` |
| L-LG-11 | Mensagens do WhatsApp ficam após a anonimização | P2 | `…100000…sql:37-38` | Rotina de expurgo com o DPO |
| L-LG-12 | A anonimização não trata duplicatas da mesma pessoa | P2 | Função por `paciente_id` | TB-LG-05 |
| L-LG-13 | A tela LGPD mostra o CPF completo e não mostra nascimento | P2 | `LgpdPacientes.tsx:156-159` | TB-LG-11; CLIN-QA-526 |

## 8. Repasse

- `product-owner`: L-LG-01 e L-LG-02 juntas formam a próxima história depois de CLIN-QA-513; converter L-LG-03 a L-LG-13.
- `especialista-dominio-saude` e DPO: o que reter após a anonimização, o texto livre clínico, os backups e quem decide (L-LG-05). Requer avaliação especializada.
- `backend-developer`: L-LG-08 e L-LG-09 são pequenas e podem entrar na RPC antes de aplicá-la.
- `qa-engineer`: critérios da seção 5.4.
