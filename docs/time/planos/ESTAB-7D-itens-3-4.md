# ESTAB-7D — itens 7.3 e 7.4 (contenção)

Origem: `docs/estrategia/DIAGNOSTICO_16_FUNCOES.md`, seção F.1, ações 7.3 (CLIN-QA-004) e 7.4 (CLIN-QA-003).
Dono do plano: `tech-lead`. Data: 27/10/2026.

Restrições: sem deploy, sem migration (nem escrita nem aplicada; nenhuma é necessária), sem commit. O branch `feat/recepcao-painel-dia-melhorias` tem alterações locais de outra frente; só os trechos listados abaixo são desta entrega. Em `src/pages/LgpdPacientes.tsx` e `src/pages/AgendamentoOnline.tsx` já existem alterações alheias (troca por `friendlyErrorMessage`), que são preservadas.

## Item 7.3 — bloquear a exclusão LGPD destrutiva (CLIN-QA-004)

Problema: `src/lib/lgpdCompliance.ts:134-189` apaga `anexos_prontuario`, `prescricoes`, `exames`, `triagens`, `prontuarios`, `agendamentos` e `pacientes` em laço no cliente, sem transação. Única chamada na UI: `src/pages/LgpdPacientes.tsx:70`.

Decisão: bloqueio em duas camadas, sem apagar o código.

1. **Biblioteca (`src/lib/lgpdCompliance.ts`)**
   - Constante exportada `EXCLUSAO_LGPD_DESTRUTIVA_HABILITADA = false`.
   - `deletePatientData` lança `ExclusaoLgpdBloqueadaError` antes de qualquer acesso ao banco (nem log, nem DELETE) enquanto a constante for `false`. O laço original permanece no arquivo, inalcançável, para a futura RPC transacional usar como referência.
   - Nova função `registrarSolicitacaoExclusaoLgpd({ pacienteId, pacienteNome, motivo, clinicaId })`: grava o pedido como tarefa em `tarefas` (`categoria = 'Administrativo'`, `prioridade = 'urgente'`, vinculada ao paciente), para tratamento manual. Nada é apagado.
   - Por que não `lgpd_access_request_log`: o CHECK de `request_type` aceita só `export`, `access` e `correction` (`supabase/migrations/20260729140000_tabelas_lgpd_de_verdade.sql:64`). Incluir `deletion` exige migration; fica como follow-up para o `database-engineer`, junto com a RPC transacional de anonimização.
2. **Tela (`src/pages/LgpdPacientes.tsx`)**
   - O botão "Apagar" vira "Solicitar exclusão"; o diálogo deixa de prometer exclusão e explica que o pedido fica registrado para tratamento manual pelo encarregado (DPO), porque a exclusão automática está suspensa.
   - A tela deixa de importar `deletePatientData`.

Aceite (do diagnóstico): nenhum caminho da UI chama `deletePatientData`; pedidos ficam registrados.

## Item 7.4 — identificação nos canais públicos (CLIN-QA-003)

### 7.4a WhatsApp (`supabase/functions/whatsapp-webhook/index.ts`)

Problema: `:171-179` vincula a conversa nova ao primeiro paciente cujo telefone contém os últimos 8 ou 9 dígitos (`ilike` + `limit 1`). Com isso, `consultar_agendamentos_paciente` (`:886-890`) revela especialidade e CRM e `criar_agendamento` (`:993`) marca em nome de outra pessoa.

Mudanças:
1. A conversa nova nasce com `paciente_id = null`. O vínculo por telefone é removido.
2. Nova ferramenta do agente `identificar_paciente(cpf, data_nascimento)`, nos agentes de agendamento e geral. A verificação é feita no servidor pelo helper compartilhado (abaixo): vincula só se houver **exatamente um** paciente da clínica com aquele CPF **e** a data de nascimento for igual.
   - Qualquer outro caso (CPF não encontrado, nascimento divergente, nascimento ausente no cadastro, CPF duplicado na clínica) devolve a mesma mensagem neutra, sem vincular, e não revela qual foi o motivo.
   - Limite de 3 tentativas por conversa em 24 h (`checarRateLimit`); excedido, a conversa vai para `aguardando_humano`.
   - CPF duplicado ou cadastro sem nascimento também passa a conversa para `aguardando_humano`, porque só a recepção resolve.
3. `consultar_agendamentos_paciente` e `criar_agendamento` sem vínculo respondem pedindo CPF e nascimento (antes pediam "CPF ou nome completo"). `criar_agendamento` sem vínculo não cria nada.
4. `consultar_agendamentos_paciente` deixa de buscar `medicos(crm, especialidade)` e devolve só data, hora e status.
5. Instrução no prompt do sistema: antes de consultar ou marcar em nome do paciente, pedir CPF e data de nascimento e chamar `identificar_paciente`.

Risco remanescente (não tratado aqui, registrar no backlog):
- Conversas **ativas** criadas antes desta mudança podem ter `paciente_id` vindo do vínculo por telefone. Não dá para distinguir de um vínculo feito por pessoa sem coluna nova. Proposta: decisão do responsável sobre um UPDATE pontual (limpar `paciente_id` de conversas ativas) ou expirar as conversas abertas no deploy. **Pendente do responsável.**
- CPF e nascimento digitados pelo paciente entram no histórico enviado ao provedor de IA, como qualquer mensagem já entra hoje. Transferência internacional: **requer avaliação especializada** (DPO).

### 7.4b Agendamento público (`supabase/functions/public-booking/index.ts` e `src/pages/AgendamentoOnline.tsx`)

Problema: `:196-198` reaproveita o paciente só pelo CPF (RPC com `LIMIT 1`); data de nascimento é opcional.

Mudanças:
1. **Front:** data de nascimento obrigatória (`required` + validação antes do envio). Tela de conclusão fala em "horário solicitado".
2. **Edge function:** nascimento obrigatório e válido. Busca de candidatos pelo CPF com o helper (formatos com e sem máscara, mais a RPC normalizada como reforço). Decisão:
   - nenhum candidato → cria o paciente (com nascimento) e agenda, como hoje;
   - um candidato com o mesmo nascimento → agenda nesse paciente;
   - um candidato com nascimento divergente ou ausente, ou mais de um candidato → **pendência**: não vincula, não agenda, cria uma tarefa em `tarefas` para a recepção (`categoria = 'Administrativo'`, `prioridade = 'alta'`, `paciente_id = null`) com o pedido e os dados informados.
   - A corrida de CPF (`23505`) passa pela mesma decisão.
3. A resposta ao paciente é a mesma nos três casos ("Pedido de agendamento recebido. A clínica vai entrar em contato para confirmar o horário."), para o link não servir para descobrir quem é paciente nem qual nascimento está cadastrado. Também tira a exclamação da mensagem.

### Helper compartilhado

`supabase/functions/_shared/identificacaoPaciente.ts`, puro e testável no vitest:
- `normalizarDataNascimento` (aceita `AAAA-MM-DD` e `DD/MM/AAAA`, rejeita data inválida ou futura);
- `decidirVinculoPaciente(candidatos, nascimento)` → `novo | vinculado | pendente(motivo)`;
- `buscarCandidatosPorCpf(db, clinicaId, cpf)`.

## Ordem e donos

| Passo | Dono | Verificação |
|---|---|---|
| 1. Helper + teste | backend (tech-lead executa) | `src/lib/__tests__/identificacaoPaciente.test.ts` |
| 2. public-booking | backend | revisão do diff; casos do helper |
| 3. whatsapp-webhook | backend | revisão do diff |
| 4. AgendamentoOnline | frontend | tsc, lint |
| 5. lgpdCompliance + LgpdPacientes | backend + frontend | `src/lib/__tests__/lgpdCompliance.test.ts` |
| 6. tsc, testes tocados, lint | tech-lead | saída real no resumo |
| 7. QA em homologação | `qa-engineer` | roteiro abaixo |
| 8. Revisão de acesso | `security-engineer` | rotas públicas |

Banco: nenhuma migration. `tarefas` e `find_patient_id_by_normalized_cpf` já existem.

## Roteiro para o QA (homologação, dados sintéticos)

1. LGPD: em `/lgpd-pacientes`, "Solicitar exclusão" cria a tarefa urgente "Solicitação LGPD de exclusão" vinculada ao paciente e nenhum dado do paciente some.
2. Link público, caso (a) do 003: CPF existente, outro nome, nascimento diferente → mensagem neutra, nenhum agendamento criado, tarefa "Agendamento online pendente" visível em Tarefas.
3. Link público: CPF existente com o nascimento certo → agendamento no paciente certo.
4. Link público: CPF novo → paciente criado com nascimento; envio sem nascimento é recusado na tela e na função.
5. Link público: CPF duplicado em dois cadastros → pendência.
6. WhatsApp, caso (b) do 003: dois pacientes com o mesmo final de telefone; mensagem do segundo número → a conversa nasce sem paciente; pedir "meus agendamentos" → o bot pede CPF e nascimento e não revela nada.
7. WhatsApp: CPF e nascimento corretos → vincula e lista só data, hora e status. Nascimento errado 3 vezes → conversa vai para atendimento humano.
8. WhatsApp: pedir para marcar sem identificação → nada é criado.
