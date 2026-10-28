# Auditoria de segurança — rodada 2

Autor: security-engineer. Data: 27/10/2026, 19:19. Worktree `admin-finance-realtime`, branch `feat/recepcao-painel-dia-melhorias`, HEAD `d2fb34b9`, com alterações locais não commitadas.

Fiz só leitura estática do código. Não houve acesso à VPS nem ao banco, e nada foi executado contra um sistema. Não editei código. Toda conclusão abaixo tem nível **E1** (leitura com `caminho:linha`), salvo indicação em contrário.

**Atenção às linhas citadas.** Outros agentes estão editando os mesmos arquivos nesta rodada. `supabase/functions/patient-portal/index.ts` mudou durante a minha leitura, porque o backend-developer extraiu `acessoPortal.ts`. As linhas abaixo valem para estes conteúdos (`git hash-object`, 10 primeiros caracteres):

| Arquivo | Hash | Linhas |
|---|---|---|
| `supabase/functions/patient-portal/index.ts` | `bf3129204f` | 990 |
| `supabase/functions/patient-portal/acessoPortal.ts` | `03aa669898` | 136 |
| `supabase/functions/public-booking/index.ts` | `dc3757f2d5` | 290 |
| `supabase/functions/whatsapp-webhook/index.ts` | `800fcfbda9` | 1235 |
| `supabase/functions/_shared/identificacaoPaciente.ts` | `d193540dd0` | 148 |
| `supabase/migrations/20261028100000_lgpd_anonimizacao_transacional.sql` | `2fb235e0e6` | 330 |
| `src/pages/Prontuarios.tsx` | `931f5d8f9f` | 2635 |

## 1. Resumo

| Item | Veredito | Gravidade proposta |
|---|---|---|
| CLIN-QA-512 (dependentes do portal pelo `cpf_responsavel`) | **Confirmado por leitura, com um caminho anônimo novo.** O CPF do titular pode ser escolhido por quem não tem sessão, pelo agendamento público. | **P0** (volta de P1 para P0) |
| CLIN-QA-545 (prontuário mostra um paciente e grava outro) | **Não derrubado.** A falta da invariante está confirmada. Um caminho de alcance foi identificado, estreito e ainda não reproduzido. | **P0 suspeito** (mantido) |
| `public-booking` (rodada 1) | A regra CPF + nascimento está correta para o vínculo. Sobram um oráculo lateral e cópias de dados pessoais. | P2 e P3 |
| `whatsapp-webhook` (rodada 1) | O vínculo pelo telefone foi removido corretamente. Sobram um oráculo de existência do CPF e a autenticação do webhook. | P2 e P3 |
| Migration `20261028100000` (anonimização LGPD) | O desenho é bom: transacional, com papel e clínica checados no servidor, e o grant está certo. Ela deixa cópias de dados pessoais e não exige MFA. | P2 e P3, mais **[AE]** |

Novos IDs desta revisão estão na faixa da segurança (571 a 579), conforme `docs/time/rodada-1/CONSOLIDADO.md:57`.

## 2. CLIN-QA-512: confirmado como P0

### 2.1 O que o diretor verificou na rodada 1, e continua válido

- O CPF do titular vem do token, no servidor: `patient-portal/index.ts:108` e `:142` passam `tokenData.pacientes.cpf`.
- A busca filtra pela clínica do token (`acessoPortal.ts:130`), e o dependente pedido precisa estar na lista (`index.ts:108-114`).
- Não há acesso entre clínicas.

### 2.2 O que faltou: quem escolhe o CPF do titular

O rebaixamento partiu de "não há CPF digitado pelo usuário". Esse CPF, porém, pode ser digitado **por qualquer pessoa sem sessão**, no agendamento público:

1. `public-booking/index.ts:221` chama `decidirVinculoPaciente`. Quando nenhum paciente da clínica tem aquele CPF, o resultado é `novo` (`_shared/identificacaoPaciente.ts`, `decidirVinculoPaciente`, `if (unicos.length === 0) return { tipo: 'novo' }`).
2. Com `novo`, `public-booking/index.ts:228-235` grava em `pacientes` o CPF, a data de nascimento, o telefone e o e-mail **informados pelo visitante**. Nada confere se o CPF pertence a quem preenche. O `cpfValido` só confere os dígitos verificadores.
3. `patient-portal/index.ts:934-963` (`solicitar_acesso`) localiza o paciente por `cpf_digitos` e pela data de nascimento (`:952`). O link é enviado aos contatos do cadastro (`:960-963`), que neste caso são os contatos que o próprio visitante informou no passo 2.
4. Com o token, `get_dependentes` (`index.ts:142`) lista todo paciente da clínica cujo `cpf_responsavel` seja aquele CPF (`acessoPortal.ts:128-133`). Depois, `dependente_id` (`index.ts:104-124`) troca `pacienteId`, e o visitante passa a ler consultas, exames, resultados e documentos do dependente.

**Classe do problema:** autenticação baseada em um dado não secreto e escolhido pelo próprio solicitante. O CPF não é segredo no Brasil. O cenário típico é o de alguém que conhece o CPF do responsável legal, quando esse responsável não é paciente da clínica (caso comum de pais e mães). Essa pessoa obtém acesso ao portal de menores sem nenhuma ação da equipe. Pré-condições:

- a clínica tem o agendamento online ligado (`public-booking/index.ts:106`);
- o CPF do responsável não está cadastrado como paciente naquela clínica. Se estiver, a decisão é `pendente` e nada é criado (`:222`).

**Agravante:** `update_contact` grava em `pacienteId` (`index.ts:282-298`, filtro em `:294`). Com um dependente ativo, quem está no portal troca o telefone e o e-mail **do dependente**. Isso desvia as notificações futuras da clínica, como as de resultado de exame e de acesso ao portal, e mantém o acesso mesmo que o cadastro falso seja apagado depois.

**Detecção:** o acesso a dependente não deixa rastro próprio. Só `ultimo_acesso` do token é atualizado (`index.ts:126-130`), e não há registro de qual `dependente_id` foi lido. Não dá para saber se isso já foi explorado (CLIN-QA-573).

### 2.3 A correção em andamento não fecha a cadeia

O backend-developer está mexendo no arquivo neste momento. `acessoPortal.ts:100-114` passou a aceitar só dependentes menores de idade e com CPF diferente do titular. Isso fecha os casos do vínculo vencido na maioridade e do autovínculo, **mas não fecha a cadeia da seção 2.2**, cujo alvo são justamente os menores. O vínculo continua sendo o texto `cpf_responsavel` comparado ao CPF de um titular que ninguém confirmou.

### 2.4 Correção recomendada (dono: backend-developer)

1. **Contenção imediata (S):** desligar `get_dependentes` e o `dependente_id` no portal até existir vínculo explícito. Como alternativa, aceitar dependentes só quando o titular tiver identidade confirmada pela clínica (item 3).
2. **Vínculo explícito (M) [AE]:** tabela `paciente_responsaveis` (`dependente_id`, `responsavel_paciente_id`, `confirmado_por`, `confirmado_em`, `expira_em`), preenchida pela recepção. O portal só usa essa tabela, nunca o texto `cpf_responsavel`. A maioridade e a guarda (judicial ou compartilhada) precisam de parecer.
3. **Origem do cadastro (S):** coluna de origem ou de confirmação em `pacientes`. Um cadastro criado pelo agendamento público fica como pré-cadastro e não recebe link em `solicitar_acesso` (`index.ts:952-963`) até a recepção confirmar a identidade.
4. **`update_contact` (S):** gravar só no titular. Recusar quando `pacienteId !== titularId`.
5. **Registro de acesso (S):** registrar cada leitura feita como dependente (titular, dependente, ação e horário).

**Teste de aceite:**

- Um cadastro criado pelo `public-booking` com o CPF X recebe `[]` em `get_dependentes` e `403` com o `dependente_id` de um menor cujo `cpf_responsavel` é X.
- `update_contact` com `dependente_id` devolve `403`.

### 2.5 Consulta só leitura para o responsável (exposição atual)

Mede quantos titulares criados pelo agendamento online já enxergam dependentes. Não grava nada.

```sql
BEGIN TRANSACTION READ ONLY;

-- Titulares com dependentes pelo cpf_responsavel, separados por origem provável
SELECT t.clinica_id,
       EXISTS (SELECT 1 FROM public.agendamentos a
                WHERE a.paciente_id = t.id
                  AND a.observacoes ILIKE '%[agendamento online]%') AS titular_veio_do_link_publico,
       count(DISTINCT t.id) AS titulares,
       count(DISTINCT d.id) AS dependentes
  FROM public.pacientes d
  JOIN public.pacientes t
    ON t.clinica_id = d.clinica_id
   AND t.id <> d.id
   AND t.cpf_digitos = regexp_replace(d.cpf_responsavel, '[^0-9]', '', 'g')
 WHERE d.cpf_responsavel IS NOT NULL
 GROUP BY 1, 2
 ORDER BY 1, 2;

-- Desses, quantos titulares têm token de portal ativo
SELECT count(DISTINCT tk.paciente_id)
  FROM public.paciente_portal_tokens tk
  JOIN public.pacientes t ON t.id = tk.paciente_id
 WHERE tk.ativo AND tk.expires_at > now()
   AND EXISTS (SELECT 1 FROM public.pacientes d
                WHERE d.clinica_id = t.clinica_id AND d.id <> t.id
                  AND regexp_replace(d.cpf_responsavel, '[^0-9]', '', 'g') = t.cpf_digitos);

ROLLBACK;
```

## 3. CLIN-QA-545: P0 suspeito mantido

### 3.1 O que está confirmado (E1)

O diálogo de evolução usa duas fontes de paciente que nada mantém iguais:

| Uso | Fonte | Linha |
|---|---|---|
| Cabeçalho do diálogo (nome) | `selectedPaciente` | `Prontuarios.tsx:2006` |
| Faixa de identificação (nome, idade, CPF, convênio) | `selectedPaciente` | `:2070-2077` |
| Alerta de alergias no diálogo | `selectedPaciente.alergias` | `:2355` |
| Anexos | `selectedPacienteId` | `:2397-2398` |
| PDF, WhatsApp, agendamento de retorno | `selectedPaciente` | `:2009-2023`, `:2054` |
| **Gravação de evolução nova** | `currentProntuario.paciente_id` | `:1271` |
| **Atualização de evolução existente** | `currentProntuario.id` | `:1259-1264` |
| Histórico recarregado depois de salvar | `currentProntuario.paciente_id`, gravado na lista do paciente selecionado | `:1394`, `:1398` |

Também confirmei o seguinte:

- `currentProntuario.paciente_id` é fixado na abertura (`:924-930`, `handleNovoProntuario`) e em `handleViewProntuario` (`:986`).
- Nenhum efeito fecha o diálogo ou compara os dois IDs quando `selectedPacienteId` muda. O efeito da rota (`:946-951`) troca o paciente sem consultar `isProntuarioOpen` nem `hasUnsavedChanges`.
- Antes de gravar (`:1255-1280`), nada confere se `currentProntuario.paciente_id === selectedPacienteId`.

Se os dois divergirem, o profissional vê o nome, as alergias e os anexos de B e grava em A. Isso é P0 pela regra do time: paciente errado e risco de prescrição.

### 3.2 Como a divergência pode ser alcançada

| # | Caminho | Estado |
|---|---|---|
| H1 | **Corrida com o rascunho.** O profissional clica para visualizar uma evolução de A (`:1842-1845`). `handleViewProntuario` espera a RPC de auditoria (`:977`) e só depois confere o `requestId` (`:985`). Se, nessa espera, ele clicar num rascunho de B na lista lateral, o clique (`:1682-1686`) troca `selectedPacienteId` **sem incrementar `prescricoesRequestRef`**, ao contrário da seleção comum (`:1725`) e da rota (`:948`). A evolução de A abre com o cabeçalho de B. O efeito do rascunho (`:1149-1175`) normalmente substitui o conteúdo pelo rascunho de B. Se esse passo não acontecer, porque a autorização do histórico de B falhou (`:1152`) ou o rascunho não foi achado (`:1164-1168`), o diálogo fica com o conteúdo de A e a identificação de B | **Plausível por leitura, NÃO VERIFICADO.** A janela de tempo é curta, e a lista de rascunhos só aparece para quem tem `medicoId` |
| H2 | **Mudança de `?paciente=` com o diálogo aberto** (efeito em `:946-951`). Os links que conheço navegam para fora da tela antes de voltar: `Fila.tsx:674` e `:975`, `Recepcao.tsx:1454`, `DoctorDashboard.tsx:409` e `:543`. O diálogo do Radix é modal, e `GlobalSearch.tsx:19-30` só leva para páginas fixas. Não achei um caminho que troque `?paciente=` sem desmontar a tela | **Não encontrado.** Continua possível por voltar e avançar no navegador ou por futuras ligações |
| H3 | Clique na lista de pacientes com o diálogo aberto | Bloqueado pelo modal e pela troca de `requestId` (`:1725`) |

**Conclusão:** não derrubo o 545. A invariante "o paciente exibido é o paciente gravado" não existe no código, e há ao menos um caminho plausível (H1). A correção é barata e não depende de reproduzir o defeito.

### 3.3 Correção recomendada (dono: frontend-developer; teste do qa-engineer)

1. Antes de qualquer gravação (`:1255`), recusar quando `currentProntuario.paciente_id !== selectedPacienteId`, com mensagem e sem gravar.
2. Fazer o cabeçalho, a faixa, as alergias e os anexos do diálogo lerem o paciente de `currentProntuario.paciente_id`, e não de `selectedPaciente`.
3. No clique do rascunho (`:1682`), incrementar `prescricoesRequestRef`, como já faz a seleção comum.
4. Quando `selectedPacienteId` mudar com o diálogo aberto, fechar o diálogo, perguntando antes se houver alterações não salvas.

**Teste de aceite:**

- Simular H1 com a RPC de auditoria atrasada e o rascunho de B indisponível. O diálogo não pode mostrar B com o conteúdo de A, e salvar não pode gravar.
- Teste unitário da guarda do item 1.

Achado lateral (P3): `Prontuarios.tsx:1153-1154` e `:1166` têm texto com codificação corrompida ("NÃ£o foi possÃ­vel"). O problema já existe em `HEAD` (`git show HEAD:src/pages/Prontuarios.tsx | grep -c "NÃ£o"` devolveu 1).

## 4. Revisão de `public-booking` (rodada 1)

**Correto:**

- A data de nascimento é obrigatória e validada (`:168`, `:175-176`).
- O vínculo só acontece com um único candidato e com o nascimento igual (`_shared/identificacaoPaciente.ts`, `decidirVinculoPaciente`).
- Os casos ambíguos viram tarefa, sem paciente e sem agendamento (`:193-219`).
- A resposta ao visitante é igual para `novo`, `vinculado` e `pendente` (`MENSAGEM_PEDIDO_RECEBIDO`).
- A corrida no `23505` é tratada com a mesma regra (`:236-244`).
- O agendamento passa pela RPC atômica restrita a `service_role` (`:261`).
- As tentativas para horários inválidos não consomem a cota por CPF (`:181-187`).

**Achados:**

| ID | P | Achado | Evidência | Correção |
|---|---|---|---|---|
| 571 | **P0** | Faz parte da cadeia da seção 2: o visitante cria um titular com CPF de terceiro e contatos próprios | `:221-235` | Seção 2.4, item 3 |
| 572 | P2 | **Oráculo pela agenda.** A mensagem é igual nos três casos, mas `novo` e `vinculado` ocupam o horário, e `pendente` não. Quem consulta `slots` (`:148-155`) depois do pedido descobre se aquele CPF já é paciente da clínica, o que pode revelar dado sensível conforme a especialidade. A cota por CPF (`:186`, 3 por dia) limita a adivinhação da data de nascimento. A cota por IP (`:185`) depende do `clientIp`, que é forjável (CLIN-QA-312) | `:221-247` | Em `pendente`, segurar o horário provisoriamente, como em `novo`, ou deixar de mostrar o horário ao público até a confirmação. Corrigir CLIN-QA-312 |
| 573 | P2 | **O 409 de "2 pedidos pendentes"** (`:254-259`) só acontece para paciente existente vinculado, o que confirma CPF e nascimento corretos a quem já os tem. É menor que o 572 | `:249-259` | Responder com a mensagem padrão e registrar a tentativa como pendência |
| 574 | P2 | **Cópias de dados pessoais fora do cadastro.** A tarefa pendente (`:195-217`) guarda nome, CPF mascarado, nascimento, telefone e e-mail com `paciente_id: null`, visível a todos os papéis (ressalva do tech-lead na rodada 1). `observacoes` do agendamento (`:268`) repete nome, telefone e e-mail. A anonimização LGPD não alcança nenhuma das duas cópias (seção 6) | `:195-217`, `:268` | Guardar os dados informados num registro LGPD restrito, ligado à tarefa por ID, e manter a tarefa sem dado pessoal (conflito 3 do consolidado) |
| 575 | P3 | O aceite LGPD continua sem registro: só é conferido (`:170`), nunca gravado com versão do termo (CLIN-QA-320 ainda aberto) | `:170` | Gravar em `lgpd_consent_log` com a versão |
| — | P2 | O rate limit falha aberto (`_shared/rateLimit.ts:43-47`) e o IP vem de header (`:55-58`). Isso enfraquece as cotas de `:185-186` e as do portal (CLIN-QA-312, já aberto) | `rateLimit.ts:43-58` | Falhar fechado em `book` e `solicitar_acesso` |

## 5. Revisão de `whatsapp-webhook` (rodada 1)

**Correto:**

- A conversa nasce com `paciente_id: null`. O vínculo pelo final do telefone foi removido (diff contra `HEAD`, bloco `@@ -168`).
- `consultar_agendamentos_paciente` e `criar_agendamento` exigem a identificação (`:900-905`, `:937-944`).
- A consulta devolve só data, hora e status.
- `identificar_paciente` tem cota de 3 por dia por `remote_jid` (`:1128-1133`).
- O vínculo usa `.is('paciente_id', null)` contra corrida (`:1156-1165`).
- O contexto enviado à IA leva só o primeiro nome e as datas (`:321-350`).

**Achados:**

| ID | P | Achado | Evidência | Correção |
|---|---|---|---|---|
| 576 | P3 | **Oráculo de existência do CPF** (é o 561 do QA, confirmado). `novo` e `nascimento_divergente` dão a mesma resposta (`:1145-1151`), mas `cpf_duplicado` e `nascimento_ausente_no_cadastro` levam a `encaminharHumano` (`:1152`), com outra mensagem e outro status. Isso revela que o CPF existe na clínica. A cota é por número de WhatsApp | `:1145-1152` | Responder com `MENSAGEM_IDENTIFICACAO_NAO_CONFIRMADA` também nesses casos e encaminhar à equipe em silêncio |
| 577 | P2 | **CPF + nascimento é conhecimento, não posse.** Os dois dados vazam com frequência juntos. Depois do vínculo, quem conversa pode consultar, criar e (pelas ferramentas existentes) remarcar ou cancelar consultas do titular. O risco residual é aceitável para agendamento, mas não para ampliar o que o bot revela | `:1093-1170` | Manter o escopo atual das ferramentas. Qualquer ferramenta nova com dado clínico exige confirmação por posse (código enviado ao telefone do cadastro) |
| — | P2 | A autenticação do webhook continua com uma chave global e comparação comum (`providedToken !== evolutionApiKey`, `:45`). Esse é o CLIN-QA-316, ainda aberto | `:39-51` | Segredo por instância e comparação em tempo constante |
| — | P3 | `registrar_triagem` (`:1041-1070`) aceita queixa, sintomas e medicamentos sem identificação e responde que "o médico terá acesso". Para quem conversa, é uma promessa falsa se a conversa nunca for vinculada. E é dado de saúde guardado em `contexto` | `:1041-1070` | Exigir `paciente_id` ou mudar a resposta |
| — | P3 | `.from('pacientes').select('nome').eq('id', conversation.paciente_id)` sem filtro de clínica (`:323-327`). O ID vem do servidor, então não há exploração. É só defesa em profundidade | `:323-327` | Acrescentar `.eq('clinica_id', session.clinica_id)` |
| — | — | As conversas herdadas, vinculadas pelo telefone antes desta mudança, continuam vinculadas. `identificar_paciente` responde "já confirmado" para elas (`:1115-1117`). Isso é o 507 e a decisão C5 do responsável, ainda pendente | `:1115-1117` | Decisão C5 |

## 6. Revisão da migration `20261028100000_lgpd_anonimizacao_transacional.sql`

**Correto:**

- `SECURITY DEFINER` exige sessão (`:120-123`), papel de admin e a mesma clínica (`:130-133`).
- O paciente fica travado com `FOR UPDATE` e é filtrado pela clínica (`:142-151`).
- A confirmação pelo nome (`:162-165`) e a recusa com agendamento ativo (`:167-178`) estão presentes.
- A operação é idempotente (`:153-160`).
- O registro em `lgpd_deletion_log` acontece na mesma transação (`:280-293`).
- Os tokens do portal são desativados (`:234-239`).
- `REVOKE ... FROM PUBLIC, anon` e `GRANT ... TO authenticated` estão certos (`:316-317`).
- As funções e tabelas usadas são qualificadas com `public.` e `auth.`.
- Conferi o formato de `audit_log.changes` em `fn_audit_row` (`20261001200000_caixa_diario_eventos_e_reabertura.sql:160-166`: `{campo: {de, para}}`). A redação de `:255-276` cobre esse formato. Também verifiquei que não há trigger de imutabilidade em `audit_log` que faria o `UPDATE` falhar: o único trigger de `UPDATE` é `trg_sanitizar_auditoria_prontuario`, em `20261011160000:175-177`.

**Achados:**

| ID | P | Achado | Evidência | Correção |
|---|---|---|---|---|
| 578 | P2 | **Cópias de dados pessoais que sobram.** (a) Tarefas com `paciente_id` nulo criadas pelo agendamento público, com nome, CPF, nascimento, telefone e e-mail (`public-booking/index.ts:195-217`). O passo 5b só alcança tarefas com `paciente_id` igual ao paciente e com o nome exato (`:222-231`). (b) `agendamentos.observacoes` com "Nome/Telefone/E-mail informado" (`public-booking/index.ts:268`), além das linhas de `audit_log` com `collection = 'agendamentos'` que repetem esses valores. O passo 5c só redige `collection = 'pacientes'` (`:275`). (c) `cpf_responsavel` e `nome_responsavel` de **outros** pacientes que apontam para o titular anonimizado. (d) `whatsapp_messages` e `remote_jid`, já declarados em `pendencias` (`:308-311`) | `:222-231`, `:275` | Incluir (a) e (b) por `agendamento_id` e `paciente_id`; tratar (c) com o vínculo explícito da seção 2.4. O escopo final é **[AE]** |
| 579 | P2 | **Operação irreversível sem MFA no servidor.** Basta uma sessão AAL1 de admin. O CLIN-QA-304/007 continua sem correção, e isso pesa mais aqui, porque o dano não tem volta | `:120-133` | Exigir `(auth.jwt()->>'aal') = 'aal2'` nesta função. A aprovação dupla fica como critério do PO (conflito 4 do consolidado) |
| — | P2 | O papel vem de `public.is_admin(v_user)`, que é `has_role(_user_id, 'admin')`, sem clínica (`20260131002504_...sql:72-80`). Junto com `is_same_clinica`, isso é suficiente hoje. Mas, se o CLIN-QA-314 continuar aberto (o convite troca a clínica e acumula papéis), um admin da clínica B que aceita convite de A como recepção vira admin em A e pode anonimizar | `:130` | Corrigir o 314, ou checar o papel por clínica |
| — | P3 | `SET search_path = public, pg_temp` (`:95`) diverge do padrão do time (string vazia com nomes qualificados, `GATES.md` 1.4). O risco é baixo, porque `pg_temp` vem por último e os objetos são qualificados | `:95` | Trocar por `SET search_path = ''` |
| — | P3 | O caminho da foto volta ao cliente para remoção (`:309`). A remoção do arquivo no Storage fica fora da transação e pode não acontecer | `:308-311` | Fila de remoção no servidor ou registro em `lgpd_deletion_log.detalhes` |
| — | **[AE]** | Redigir valores antigos de `audit_log` (`:252-276`) contra a exigência de trilha (CFM 1.821/2007), e manter o prontuário ligado a um cadastro anonimizado (Lei 13.787/2018) | `:42-48` | Parecer do DPO antes da aplicação |

**A migration nunca rodou em Postgres** (consolidado da rodada 1, linha 41). Depois de aplicada em homologação, conferir com a verificação já incluída (`:327-330`).

## 7. Consultas só leitura sugeridas ao responsável

Além da seção 2.5, as consultas abaixo devem ser rodadas em homologação depois que a migration for aplicada:

```sql
BEGIN TRANSACTION READ ONLY;
SELECT has_function_privilege('anon', 'public.lgpd_anonimizar_paciente(uuid, uuid, text, text)', 'EXECUTE');          -- esperado: false
SELECT has_function_privilege('authenticated', 'public.lgpd_anonimizar_paciente(uuid, uuid, text, text)', 'EXECUTE'); -- esperado: true
SELECT prosecdef, proconfig FROM pg_proc WHERE proname = 'lgpd_anonimizar_paciente';
ROLLBACK;
```

## 8. O que não foi feito

- Nada foi executado: não há Deno nem Supabase local nesta sessão. As cadeias das seções 2 e 3 estão em E1, e não em E2.
- Não li `src/lib/lgpdAnonimizacao.ts` nem a tela do tech-lead (rodada 2, em andamento).
- Não revisei o diff final do backend-developer no portal, porque ele ainda estava em edição às 19:19. Por isso a seção 2.3 descreve o estado observado.
- Não inspecionei a configuração do proxy (headers de IP) na VPS.
