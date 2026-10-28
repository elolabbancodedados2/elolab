# Processo: identificação do paciente nos canais públicos

Autor: `business-analyst`, rodada 1, 27/10/2026.
Escopo: link público de agendamento online e atendimento automatizado pelo WhatsApp. O portal do paciente fica de fora, porque já autentica por link com token. Os dependentes do portal (`patient-portal/index.ts:129-137`, só relatado no diagnóstico) ficam para uma rodada seguinte.
Itens relacionados: CLIN-QA-003 (P0), CLIN-QA-009, CLIN-QA-018, CLIN-QA-029 e o plano `docs/time/planos/ESTAB-7D-itens-3-4.md` (item 7.4).

## 0. Estado do código e o que esta análise cobre

- As linhas citadas valem para o worktree `admin-finance-realtime`, branch `feat/recepcao-painel-dia-melhorias`, em 27/10/2026. O worktree já contém a contenção do item 7.4, **ainda não commitada nem publicada**.
- Por isso há três estados distintos:
  1. **AS-IS antes da contenção**, descrito no diagnóstico (`DIAGNOSTICO_16_FUNCOES.md`, D.1 itens 5 e 6). As linhas citadas lá (`public-booking/index.ts:196-198`, `whatsapp-webhook/index.ts:173-179,886-890,993`) já não correspondem ao arquivo atual.
  2. **AS-IS no worktree**, com a contenção. É o que este documento detalha regra a regra.
  3. **Produção:** NÃO VERIFICADO. Como o deploy de edge functions é manual, a hipótese mais provável é que produção ainda rode o estado 1. Só o responsável pode confirmar.
- Nenhum fluxo foi executado. As regras foram extraídas por leitura de código.

## 1. Atores e dados

| Ator | Papel no processo |
|---|---|
| Paciente (titular) | Informa nome, CPF, nascimento, telefone e e-mail no link, ou CPF e nascimento no WhatsApp |
| Agente de IA do WhatsApp | Conduz a conversa e chama as ferramentas do servidor |
| Recepção | Resolve as pendências de identificação e confirma o pedido de agendamento |
| Clínica (admin) | Liga o agendamento online, escolhe os médicos e configura o agente |

Dados envolvidos: `pacientes` (nome, cpf, data_nascimento, telefone, email), `agendamentos`, `tarefas`, `whatsapp_conversations.paciente_id`, `whatsapp_messages`, `configuracoes_clinica` (chave `agendamento_online`) e a tabela de rate limit consultada por `checar_rate_limit`.

## 2. AS-IS antes da contenção (resumo do diagnóstico)

| Canal | Como vinculava | Efeito |
|---|---|---|
| Link público | Reaproveitava o paciente só pelo CPF (RPC com `LIMIT 1`). O nascimento era opcional. Nome e telefone informados iam só para `observacoes` | Consulta gravada no cadastro de outra pessoa quando o CPF era digitado errado ou pertencia a outra pessoa |
| WhatsApp | Na conversa nova, `ilike` com os últimos 8 ou 9 dígitos do telefone, `limit 1` sem ordenação | O bot listava consultas de outro paciente, com médico e especialidade, e marcava em nome dele |

## 3. AS-IS no worktree: agendamento online (link público)

### 3.1 Fluxo

1. O paciente abre o link (`/agendar/:clinicaId`, `src/App.tsx:233`). A função responde `info`: clínica, médicos liberados, horários e antecedência (`public-booking/index.ts:144-146`).
2. Escolhe o médico e a data. `slots` devolve os horários livres (`:148-155`).
3. Preenche nome, CPF, nascimento, telefone e e-mail, aceita o termo e envia `book` (`:157-283`).
4. O servidor decide o vínculo (`:190-248`):
   - **novo:** nenhum cadastro com o CPF. Cria o paciente e agenda.
   - **vinculado:** um único cadastro com o CPF e o mesmo nascimento. Agenda nesse paciente.
   - **pendente:** qualquer outro caso. Não vincula, não agenda e cria uma tarefa para a recepção.
5. O paciente recebe a mesma mensagem nos três casos: "Pedido de agendamento recebido. A clínica vai entrar em contato para confirmar o horário." (`:76`, `:218`, `:282`).
6. A recepção confirma o agendamento (status `agendado`, observação `[agendamento online]`) ou trata a tarefa pendente.

### 3.2 Regras extraídas do código

| ID | Regra | Evidência |
|---|---|---|
| RN-AO-01 | O link só funciona com a clínica ativa (não suspensa nem arquivada) e com `agendamento_online.ativo = true` | `public-booking/index.ts:100-108` |
| RN-AO-02 | Só aparecem médicos ativos, com disponibilidade ativa e, se a clínica restringiu, presentes na lista configurada | `:127-136` |
| RN-AO-03 | A antecedência máxima é configurável entre 1 e 180 dias, com padrão de 60 | `:137-142`, `:179` |
| RN-AO-04 | Rate limit: 60 requisições/min por IP em todas as ações; 10 pedidos `book`/hora por IP; 3 pedidos/dia por CPF e clínica | `:94-96`, `:185-188` |
| RN-AO-05 | Honeypot: se o campo invisível `website` vier preenchido, a resposta é sucesso e nada é gravado | `:158-159` |
| RN-AO-06 | Obrigatórios: aceite do termo, nome com sobrenome, CPF com dígito verificador válido, telefone com DDD (10 dígitos ou mais) e nascimento válido. O e-mail é opcional, mas validado quando informado | `:170-176`; front em `src/pages/AgendamentoOnline.tsx:152-153,350-356` |
| RN-AO-07 | O nascimento aceita `AAAA-MM-DD` ou `DD/MM/AAAA`. Recusa data inexistente, futura ou anterior a 1900 | `supabase/functions/_shared/identificacaoPaciente.ts:46-61` |
| RN-AO-08 | O horário é revalidado no servidor antes de qualquer gravação. Pedido para horário inválido não consome a cota do CPF | `public-booking/index.ts:181-188` |
| RN-AO-09 | Os candidatos são todos os cadastros da clínica cujo CPF bate, com e sem máscara, mais o resultado da RPC normalizada (formatos legados) | `identificacaoPaciente.ts:110-136` |
| RN-AO-10 | Decisão do vínculo: 0 candidatos → novo; mais de 1 → pendente (`cpf_duplicado`); 1 sem nascimento → pendente (`nascimento_ausente_no_cadastro`); 1 com nascimento diferente → pendente (`nascimento_divergente`); 1 com nascimento igual → vinculado | `identificacaoPaciente.ts:70-82` |
| RN-AO-11 | O nome informado **não** participa da decisão | `identificacaoPaciente.ts:70-82` (a função não recebe nome) |
| RN-AO-12 | A pendência vira tarefa `Administrativo`, prioridade `alta`, vencimento hoje e `paciente_id = null`, com horário pedido, médico, nome, CPF, nascimento, telefone, e-mail e o motivo | `public-booking/index.ts:193-219` |
| RN-AO-13 | O motivo da pendência nunca é devolvido ao paciente | `identificacaoPaciente.ts:29-34`; resposta única em `public-booking/index.ts:218` |
| RN-AO-14 | Paciente novo é criado com nome, CPF formatado, telefone, e-mail e nascimento | `public-booking/index.ts:228-235` |
| RN-AO-15 | Corrida de CPF: se outra requisição criou o mesmo CPF entre a busca e o insert (`23505`), a decisão é refeita com a mesma regra | `:236-242` |
| RN-AO-16 | Um paciente não pode ter mais de 2 pedidos online futuros com status `agendado`. O limite é identificado pelo texto `[agendamento online]` em `observacoes` | `:250-259` |
| RN-AO-17 | O agendamento é criado pela RPC atômica `agendar_consulta_online_atomico`. Sobreposição devolve "horário acabou de ser ocupado" | `:261-280` |
| RN-AO-18 | Um CPF por clínica, comparado só pelos dígitos. CPF nulo ou vazio pode se repetir | `supabase/migrations/20260815150000_cpf_unico_por_clinica_e_sem_mascara.sql:100-102` |

### 3.3 Regras implícitas e casos de borda

| Caso | Comportamento atual | Avaliação |
|---|---|---|
| Paciente homônimo (mesmo nome, CPFs diferentes) | Cada CPF tem o próprio cadastro. O nome não é conferido | Correto para o vínculo. A recepção pode confundir os dois na confirmação, porque a tarefa não traz os dados do cadastro existente |
| Mesma pessoa com nome digitado diferente | Vincula se CPF e nascimento conferem. O nome informado vai só para `observacoes` (`:268`) | Aceitável. Falta mostrar a divergência de nome à recepção |
| Criança ou dependente agendado com o CPF do responsável | O nascimento informado (da criança) diverge do cadastro (do responsável) → pendência | Correto, mas vira trabalho manual recorrente. Falta um campo "agendando para outra pessoa" |
| Paciente antigo sem CPF no cadastro | Zero candidatos → **cria um segundo cadastro** com CPF para a mesma pessoa | Lacuna L-ID-03: duplicidade silenciosa de prontuário |
| Cadastro antigo sem nascimento | Pendência `nascimento_ausente_no_cadastro` | Correto. A recepção precisa completar o cadastro |
| CPF duplicado na clínica | Pendência `cpf_duplicado`. Com o índice único aplicado, isso só acontece com formato legado não normalizado | Depende de a migration `20260815150000` estar em produção: NÃO VERIFICADO (CLIN-QA-006) |
| Tentativa de descobrir o nascimento de um paciente por força bruta | A resposta é idêntica nos três casos e há limite de 3 pedidos/dia por CPF | Bom. O rate limit falha aberto quando o banco erra (`_shared/rateLimit.ts:43-47`) |
| Remarcação ou cancelamento pelo link | Não existe. O link só cria pedido | Fora do canal. A remarcação passa pela recepção ou pelo portal |
| Tarefa de pendência ignorada | Vence no mesmo dia, mas sem escalonamento, aviso ao paciente ou expiração do pedido | Lacuna L-ID-05 |

## 4. AS-IS no worktree: WhatsApp

### 4.1 Fluxo

1. Chega a mensagem. A idempotência por `message_id` descarta reenvios (`whatsapp-webhook/index.ts:152-164`, `:216-220`).
2. Procura conversa aberta do mesmo `remote_jid` na sessão. Se não houver, cria uma com `paciente_id = null` (`:166-196`).
3. Se a conversa está com humano (`aguardando_humano` ou `em_atendimento_humano`), a IA não responde (`:254-259`).
4. Se há paciente vinculado, o contexto enviado ao provedor de IA leva só o primeiro nome e a data, hora e status de até 3 consultas futuras (`:321-354`).
5. O agente segue a regra 11 do prompt: antes de consultar ou marcar, pede CPF e nascimento e chama `identificar_paciente` (`:693`, `:737-748`).
6. `identificar_paciente` vincula a conversa ou recusa (`:1109-1171`).
7. Com o vínculo feito, `consultar_agendamentos_paciente` lista data, hora e status (`:900-935`) e `criar_agendamento` grava a consulta (`:937-1038`).

### 4.2 Regras extraídas do código

| ID | Regra | Evidência |
|---|---|---|
| RN-WA-01 | A conversa nova nasce sem paciente. O telefone não identifica ninguém | `whatsapp-webhook/index.ts:177-196` |
| RN-WA-02 | O vínculo só acontece por `identificar_paciente` (CPF + nascimento) ou por ação da equipe. A gravação usa `is('paciente_id', null)` para não sobrescrever um vínculo feito pela equipe | `:1155-1169` |
| RN-WA-03 | Mesma decisão do link público (helper compartilhado `decidirVinculoPaciente`) | `:1141-1144`; `identificacaoPaciente.ts:70-82` |
| RN-WA-04 | CPF inválido, nascimento inválido, CPF inexistente ou nascimento divergente geram a mesma resposta neutra, sem dizer o que divergiu | `:1137-1150`; mensagens em `:1094-1099` |
| RN-WA-05 | CPF duplicado, cadastro sem nascimento ou conflito na gravação do vínculo passam a conversa para `aguardando_humano` | `:1148-1153`, `:1166` |
| RN-WA-06 | Limite de 3 tentativas de identificação por conversa (`remote_jid`) e clínica em 24 h. Acima disso, a conversa vai para humano. Toda chamada conta, inclusive as com formato inválido | `:1100`, `:1128-1133` |
| RN-WA-07 | Sem vínculo, `consultar_agendamentos_paciente` e `criar_agendamento` não fazem nada e pedem CPF e nascimento | `:900-906`, `:937-944` |
| RN-WA-08 | A lista de consultas do paciente traz só data, hora e status | `:908-934` |
| RN-WA-09 | `criar_agendamento` exige médico ativo da clínica, data não passada, horário que caia na grade de `medico_disponibilidade` e ausência de conflito. Grava com status `agendado` e `tipo = 'consulta'` | `:946-1022` |
| RN-WA-10 | Sem cadastro (decisão `novo`), o bot não cria paciente: responde que não conseguiu confirmar | `:1145-1147` |
| RN-WA-11 | Fora do horário do agente (dias úteis entre início e fim configurados), envia a mensagem de fora do horário, salvo se `atende_fora_horario` | `:266-290` |
| RN-WA-12 | Erro do provedor de IA passa a conversa para humano | `:374-381` |

### 4.3 Regras implícitas e casos de borda

| Caso | Comportamento atual | Avaliação |
|---|---|---|
| Dois pacientes com o mesmo final de telefone (caso b do 003) | A conversa nasce sem vínculo. O bot pede CPF e nascimento | Correto no worktree |
| Conversas abertas antes da contenção | Podem manter um `paciente_id` vindo do vínculo antigo por telefone e não há como distinguir | Pendente do responsável (`ESTAB-7D-itens-3-4.md`, risco remanescente). Lacuna L-ID-01 |
| Paciente novo pelo WhatsApp | Não consegue marcar. O bot só oferece humano | Decisão de produto pendente (L-ID-06) |
| Recepção precisa vincular manualmente após o handoff | Não há tela para vincular conversa a paciente: nenhum `update` de `paciente_id` em `src/components/whatsapp` (grep sem resultado em `useWhatsAppMutations.ts`) | Lacuna L-ID-02. O vínculo "pela equipe" citado no código não tem interface |
| Motivo do handoff | Só muda o status. Não registra por que foi para humano (CPF duplicado, sem nascimento, excesso de tentativas) | Lacuna L-ID-04 |
| Agendamento pelo WhatsApp × pelo link | O link diz "pedido recebido, a clínica confirma". O WhatsApp diz "Agendamento confirmado!" (`:1037`), com emojis, e não respeita a lista de médicos nem a antecedência do agendamento online | Inconsistência de processo (L-ID-07) e de tom (CLIN-QA-018) |
| Disponibilidade revela CRM e especialidade | `consultar_disponibilidade` monta "Dr(a). CRM ... (especialidade)" (`:884`) | Não é dado do paciente. Sem risco de identificação, mas o texto mostra CRM em vez do nome |
| CPF e nascimento no histórico enviado à IA | O histórico das últimas 10 mensagens vai ao provedor (`:292-303`) | Transferência internacional de dado pessoal: **requer avaliação especializada** (DPO). O comentário em `:308` cita `api.deepseek.com`, mas o código chama `runOpenAIAgent` (`:363`). Divergência de documentação |
| Triagem pelo bot | `registrar_triagem` grava queixa e sintomas no `contexto` da conversa, mesmo sem paciente vinculado, e promete que "o médico terá acesso" (`:1041-1070`) | Fora do escopo desta análise. Dado de saúde ligado a uma conversa não identificada: requer avaliação especializada |
| Rate limit com o banco fora | `checarRateLimit` devolve "pode passar" (`_shared/rateLimit.ts:43-47`) | Tentativas ilimitadas de identificação durante falha do banco (CLIN-QA-027) |

## 5. TO-BE

### 5.1 Princípios

1. Nenhum canal público vincula paciente por um único dado. O mínimo é CPF + data de nascimento, e só existe vínculo com exatamente um cadastro.
2. A ambiguidade nunca é resolvida pela máquina: vira pendência com dono (recepção), motivo registrado e prazo.
3. A resposta ao público não revela se a pessoa é paciente nem qual dado divergiu.
4. Os dois canais seguem a mesma política de criação de agendamento (pedido a confirmar ou agendamento firme), definida pela clínica.

### 5.2 Fluxo TO-BE (os dois canais)

```
Pedido → validação de formato → busca de candidatos (CPF, só dígitos)
   ├─ 0 candidatos → [link] cria pré-cadastro "não confirmado" + pedido
   │                 [WhatsApp] oferece o link público ou humano
   ├─ 1 candidato + nascimento igual → vincula → cria pedido (status conforme a política da clínica)
   └─ demais → pendência de identificação (tarefa + registro estruturado) → recepção resolve:
          vincular a um cadastro existente | criar cadastro | recusar pedido
          → paciente avisado pelo canal de origem
```

### 5.3 Regras TO-BE

| ID | Regra | Muda o quê |
|---|---|---|
| TB-ID-01 | Manter RN-AO-10 e RN-WA-03 como regra única, no helper compartilhado | Já implementado no worktree. Falta publicar e testar em homologação |
| TB-ID-02 | Paciente criado pelo link nasce marcado como "cadastro não confirmado" até a recepção conferir documento no primeiro atendimento | Hoje nasce igual a qualquer cadastro (RN-AO-14) |
| TB-ID-03 | Antes de criar paciente novo, procurar cadastro **sem CPF** com o mesmo nascimento e nome semelhante. Se existir, gerar pendência `possivel_duplicado` em vez de criar | Fecha L-ID-03 |
| TB-ID-04 | A pendência deixa de ser só texto em `tarefas`: um registro estruturado (pedido, canal, motivo, dados informados, status, quem resolveu, quando) ligado à tarefa | Permite métrica, prazo e auditoria |
| TB-ID-05 | Prazo para a pendência (sugestão: 1 dia útil). Vencido, a tarefa escala para o admin | Fecha L-ID-05 |
| TB-ID-06 | Tela na central do WhatsApp para a recepção vincular ou desvincular a conversa a um paciente, com registro em auditoria | Fecha L-ID-02 |
| TB-ID-07 | O handoff por falha de identificação grava o motivo na conversa (nota interna) | Fecha L-ID-04 |
| TB-ID-08 | Conversas abertas na data do deploy perdem o vínculo automático (expirar ou limpar `paciente_id`), conforme decisão do responsável | Fecha L-ID-01 |
| TB-ID-09 | O WhatsApp aplica a mesma configuração do agendamento online: médicos liberados, antecedência e política de confirmação. A mensagem final segue a política ("pedido recebido" ou "agendado"), sem emojis | Fecha L-ID-07 |
| TB-ID-10 | Pedido feito para outra pessoa: campo "o paciente é outra pessoa" no link, com nome e nascimento do paciente e CPF opcional. Sempre gera pendência | Reduz pendências de dependentes |
| TB-ID-11 | Registrar o aceite do termo com versão, data, IP e canal | Fecha CLIN-QA-029 (o aceite hoje é só checado, em `public-booking/index.ts:170`) |
| TB-ID-12 | Rate limit dos endpoints de identificação falha fechado | CLIN-QA-027 |
| TB-ID-13 | A tarefa de pendência mostra à recepção o CPF mascarado (`***.***.***-09`). O completo só aparece com revelação auditada | Hoje a tarefa traz o CPF completo, porque `mascararCpf` só formata (`identificacaoPaciente.ts:84`) |

### 5.4 Critérios de aceite do processo (para o PO e o QA)

Reaproveitar o roteiro de `docs/time/planos/ESTAB-7D-itens-3-4.md` (casos 2 a 8) e acrescentar:

- Dado um paciente antigo sem CPF, com nome e nascimento iguais, quando o link recebe o CPF dele, então nenhum cadastro novo é criado e uma pendência `possivel_duplicado` é aberta (TB-ID-03).
- Dada uma conversa encaminhada a humano por CPF duplicado, quando a recepção abre a conversa, então vê o motivo e consegue vincular o paciente certo, e o vínculo aparece na auditoria (TB-ID-06/07).
- Dado um usuário da clínica B, quando tenta vincular uma conversa da clínica A, então recebe permissão negada.

## 6. Multiunidade

| Item | Compartilhado na organização | Isolado por unidade |
|---|---|---|
| Cadastro do paciente e regra CPF + nascimento | Sim. O CPF deveria ser único por organização, não por unidade, para não duplicar a pessoa | — |
| Link de agendamento e configuração | — | Sim. Cada unidade tem link, médicos e antecedência próprios |
| Número de WhatsApp e agente | Decisão da rede: um número central com escolha de unidade ou um número por unidade | A fila de pendências pertence à unidade do horário pedido |
| Pendências de identificação | Visíveis para a recepção central da rede, se existir | Resolvidas pela unidade de destino |

Pré-requisito: CLIN-QA-024 (multiunidade inexistente). Hoje o índice único é por `clinica_id` (RN-AO-18).

## 7. Lacunas

Os IDs abaixo são locais deste documento. O `product-owner` deve converter em `CLIN-QA-5xx` para evitar colisão com outros agentes da rodada. Já cobertos no backlog: L-ID-00 (CLIN-QA-504, 505 e 506), L-ID-01 (CLIN-QA-507) e TB-ID-13 (CLIN-QA-526).

| ID | Lacuna | Gravidade sugerida | Evidência | Proposta |
|---|---|---|---|---|
| L-ID-00 | Contenção do 003 só no worktree, sem commit nem deploy. Produção provavelmente ainda vincula por CPF e por telefone | **P0** (até publicar) | Estado do worktree; deploy manual (CLIN-QA-006) | Revisar, commitar e publicar as duas funções com autorização do responsável |
| L-ID-01 | Conversas abertas antes da contenção mantêm vínculo por telefone | P1 | `ESTAB-7D-itens-3-4.md`, riscos | TB-ID-08 |
| L-ID-02 | Não há tela para a equipe vincular conversa a paciente | P1 | Nenhum `paciente_id` em `src/components/whatsapp/useWhatsAppMutations.ts` | TB-ID-06 |
| L-ID-03 | Cadastro antigo sem CPF gera duplicata silenciosa pelo link | P1 (prontuário dividido) | `identificacaoPaciente.ts:75`; índice permite CPF nulo (`20260815150000…sql:100-102`) | TB-ID-03 |
| L-ID-04 | Handoff sem motivo registrado | P2 | `whatsapp-webhook/index.ts:1119-1126` | TB-ID-07 |
| L-ID-05 | Pendência vence no mesmo dia (`data_vencimento`, `:214`), mas não escala, não avisa o paciente e não gera métrica | P2 | `public-booking/index.ts:195-216` | TB-ID-04, TB-ID-05 |
| L-ID-06 | Paciente novo não agenda pelo WhatsApp | P2 (comercial) | `whatsapp-webhook/index.ts:1145-1147` | Decisão do PO: oferecer o link público na conversa |
| L-ID-07 | WhatsApp ignora a configuração do agendamento online e diz "confirmado" com emojis | P2 | `whatsapp-webhook/index.ts:937-1038`, `:1037` | TB-ID-09 |
| L-ID-08 | Aceite do termo não registrado | P2 | `public-booking/index.ts:170` | TB-ID-11 (CLIN-QA-029) |
| L-ID-09 | Limite de pedidos pendentes depende de texto em `observacoes` | P3 | `public-booking/index.ts:251-253` | Coluna `origem = 'online'` no agendamento |
| L-ID-10 | `mascararCpf` não mascara: grava e exibe o CPF completo na tarefa | P2 | `identificacaoPaciente.ts:84`; uso em `public-booking/index.ts:192,204,231` | Renomear para `formatarCpf` e criar uma máscara de exibição (TB-ID-13) |
| L-ID-11 | Rate limit falha aberto | P2 | `_shared/rateLimit.ts:43-47` | TB-ID-12 |
| L-ID-12 | Comentário cita DeepSeek e o código usa OpenAI | P3 (documentação), avaliação de DPO | `whatsapp-webhook/index.ts:308` × `:363` | Corrigir o comentário e registrar o provedor real no inventário de operadores |

## 8. Repasse

- `product-owner`: transformar TB-ID-02 a TB-ID-13 em histórias, priorizando L-ID-00 a L-ID-03.
- `especialista-dominio-saude`: validar a política para dependentes e menores (TB-ID-10) e o uso do nascimento como segundo fator.
- `security-engineer` / DPO: avaliar L-ID-12 e a transferência internacional (requer avaliação especializada).
- `qa-engineer`: incluir os critérios da seção 5.4 no plano de regressão.
