# Rodada 1 — tech-lead: ESTAB-7D itens 7.3 e 7.4

Data: 27/10/2026. Branch: `feat/recepcao-painel-dia-melhorias`. Plano: `docs/time/planos/ESTAB-7D-itens-3-4.md`.

Sem deploy, sem migration (nem escrita nem aplicada) e sem commit. As alterações locais da outra frente foram preservadas, inclusive as trocas por `friendlyErrorMessage` em `src/pages/LgpdPacientes.tsx` e `src/pages/AgendamentoOnline.tsx`.

## O que foi feito

### 7.3 — exclusão LGPD destrutiva bloqueada (CLIN-QA-004)
- `src/lib/lgpdCompliance.ts`: com `EXCLUSAO_LGPD_DESTRUTIVA_HABILITADA = false`, `deletePatientData` lança `ExclusaoLgpdBloqueadaError` antes de qualquer acesso ao banco (nem log, nem DELETE). O laço original continua no arquivo, inalcançável, como referência para a futura RPC transacional.
- Nova função `registrarSolicitacaoExclusaoLgpd`: registra o pedido como tarefa urgente em `tarefas`, vinculada ao paciente, para tratamento manual pelo encarregado de dados. Nada é apagado.
- `src/pages/LgpdPacientes.tsx`: o botão "Apagar" virou "Solicitar exclusão" (sem variante destrutiva), e o diálogo e o aviso da página explicam que a exclusão automática está suspensa. A tela não importa mais `deletePatientData`.
- O pedido não vai para `lgpd_access_request_log` porque o CHECK de `request_type` só aceita `export`, `access` e `correction` (`supabase/migrations/20260729140000_tabelas_lgpd_de_verdade.sql:64`).

### 7.4a — WhatsApp sem vínculo pelo telefone (CLIN-QA-003)
`supabase/functions/whatsapp-webhook/index.ts`:
- Conversa nova nasce com `paciente_id = null`. A busca pelos últimos 8 ou 9 dígitos do telefone (`ilike` + `limit 1`) foi removida.
- Nova ferramenta `identificar_paciente(cpf, data_nascimento)`: vincula só com um único cadastro da clínica com o CPF e o nascimento igual. A gravação usa `.is('paciente_id', null)` para não sobrescrever um vínculo feito pela equipe.
- Ambiguidade tratada de forma explícita. O paciente recebe uma mensagem neutra, que não diz qual dado divergiu:
  - CPF não encontrado ou nascimento divergente: o bot pede para conferir os dados;
  - CPF duplicado, cadastro sem nascimento ou mais de 3 tentativas em 24 h: a conversa vai para `aguardando_humano`.
- `consultar_agendamentos_paciente` e `criar_agendamento` sem vínculo pedem CPF e nascimento e não criam nem revelam nada. A listagem deixou de trazer `medicos(crm, especialidade)` e mostra só data, hora e status.
- Regra 11 no prompt do sistema: identificar por CPF e nascimento, nunca por nome ou telefone.
- `src/components/whatsapp/types.ts`: textos de duas habilidades do agente ajustados ao novo fluxo.

### 7.4b — agendamento público com CPF + nascimento (CLIN-QA-003)
- `src/pages/AgendamentoOnline.tsx`: nascimento obrigatório (`required` e validação com foco), e a tela de conclusão mostra "Horário solicitado".
- `supabase/functions/public-booking/index.ts`: nascimento obrigatório e validado. A decisão de vínculo:
  - CPF novo: cria o paciente com o nascimento e agenda;
  - um cadastro com nascimento igual: agenda nesse paciente;
  - nascimento divergente ou ausente, ou CPF duplicado: não vincula nem agenda e cria a tarefa "Agendamento online pendente" para a recepção, com os dados informados.
- A corrida de CPF (`23505`) passa pela mesma regra.
- A resposta ao paciente é idêntica nos três casos, e a exclamação saiu da mensagem.

### Helper compartilhado
- `supabase/functions/_shared/identificacaoPaciente.ts` (novo), com estas funções:
  - `normalizarDataNascimento`: aceita `AAAA-MM-DD` e `DD/MM/AAAA`;
  - `decidirVinculoPaciente`;
  - `buscarCandidatosPorCpf`: consulta direta pelos dois formatos de CPF, reforçada pela RPC `find_patient_id_by_normalized_cpf`, para a duplicidade aparecer apesar do `LIMIT 1` da RPC;
  - `cpfValido` e `mascararCpf`.
- Tipado sem `any`.

## Arquivos tocados

| Arquivo | Situação |
|---|---|
| `docs/time/planos/ESTAB-7D-itens-3-4.md` | novo |
| `supabase/functions/_shared/identificacaoPaciente.ts` | novo |
| `src/lib/__tests__/identificacaoPaciente.test.ts` | novo |
| `src/lib/__tests__/lgpdExclusaoBloqueada.test.ts` | novo |
| `src/lib/lgpdCompliance.ts` | alterado |
| `src/pages/LgpdPacientes.tsx` | alterado (sobre alterações da outra frente) |
| `src/pages/AgendamentoOnline.tsx` | alterado (sobre alterações da outra frente) |
| `supabase/functions/public-booking/index.ts` | alterado |
| `supabase/functions/whatsapp-webhook/index.ts` | alterado |
| `src/components/whatsapp/types.ts` | alterado (textos) |
| `tests/agendamento-online.spec.ts` | alterado (preenche nascimento; mensagem nova) |

## Evidências (comandos executados e resultados reais)

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit -p tsconfig.app.json` | saída 0, nenhum erro (rodado antes do aviso de memória) |
| `npx vitest run src/lib/__tests__/identificacaoPaciente.test.ts src/lib/__tests__/lgpdExclusaoBloqueada.test.ts src/lib/__tests__/availabilitySlots.test.ts` | 3 arquivos, 19/19 testes passaram |
| `npx vitest run src/lib/__tests__/whatsappEdgeAdminGate.test.ts src/components/configuracoes/AgendamentoOnlineConfig.test.tsx` | 5/5 passaram |
| `npx playwright test tests/agendamento-online.spec.ts` | 8/8 passaram; 6 na segunda tentativa, todos com timeout em `page.goto` enquanto a suíte vitest completa rodava em paralelo |
| `npx eslint` nos arquivos tocados | 0 erros; 64 avisos `no-explicit-any` já existentes; 0 ocorrências de `any` nas linhas adicionadas (`git diff -U0 … \| grep "^+" \| grep -c "\bany\b"` = 0) |
| `npm run test:run` (rodado antes do aviso) | 1131/1132. Única falha em `src/pages/__tests__/portalPacienteCancelamento.test.tsx` ("região acessível e abas"), que testa `src/pages/PortalPaciente.tsx`, alterado pela outra frente e não tocado aqui |
| `npm run lint` (rodado antes do aviso) | 1 erro, 1871 avisos. O erro é `no-control-regex` em `src/components/agenda/AppointmentDialog.tsx:36`, arquivo da outra frente |

NÃO VERIFICADO: `deno check` e `deno lint` das edge functions, porque o Deno não está instalado nesta máquina. Também não verificado: comportamento contra banco real e o fluxo real com a IA do WhatsApp.

## Riscos
- **P1:** conversas de WhatsApp ativas criadas antes desta mudança podem manter `paciente_id` vindo do vínculo por telefone, e não dá para distingui-las de vínculos feitos pela equipe. Requer decisão do responsável: limpar `paciente_id` das conversas ativas ou encerrá-las no deploy.
- **P2:** CPF e nascimento digitados pelo paciente entram no histórico enviado ao provedor de IA, como qualquer mensagem já entra hoje. Transferência internacional: requer avaliação especializada (DPO).
- **P2:** `checarRateLimit` deixa passar quando o banco falha (CLIN-QA-027). Nesse caso o limite de 3 tentativas de identificação não segura tentativa de adivinhar o nascimento.
- **P2:** as tarefas de pendência e de LGPD ficam visíveis a todos os papéis com acesso a `tarefas` da clínica, e a de LGPD inclui o motivo informado.
- **P3:** o pedido de exclusão fica em `tarefas`, não no log LGPD. É preciso uma migration para aceitar `deletion` em `lgpd_access_request_log` (dono: `database-engineer`).
- Continua pendente: RPC transacional de anonimização que preserve o prontuário, com aprovação dupla e registro (CLIN-QA-004, esforço M, Backend + DPO).

## O que precisa do QA (`qa-engineer`)
1. Rodar a verificação completa única (tsc e vitest) e o Playwright sem carga paralela, para confirmar que as 6 retentativas eram só ambiente.
2. Em homologação, com dados sintéticos, seguir o roteiro do plano. Prioridades:
   - caso (a): CPF existente com outro nascimento gera tarefa e nenhum agendamento;
   - caso (b): dois pacientes com o mesmo final de telefone; o bot pede CPF e nascimento e não revela nem cria nada;
   - três identificações erradas levam a conversa para atendimento humano;
   - "Solicitar exclusão" cria a tarefa e não apaga nenhum dado;
   - nenhum caminho da UI chama `deletePatientData`.
3. Rodar `deno check` em `supabase/functions/public-booking/index.ts` e `supabase/functions/whatsapp-webhook/index.ts`.

## O que precisa do `security-engineer`
1. Revisar as duas rotas públicas: a resposta do `public-booking` não pode servir para descobrir quem é paciente nem qual nascimento está cadastrado, e as mensagens de `identificar_paciente` não podem revelar o motivo da recusa.
2. Avaliar o limite de tentativas de identificação (3 em 24 h por conversa) e a dependência de `checarRateLimit`, que deixa passar quando falha.
3. Opinar sobre os vínculos por telefone herdados nas conversas ativas e sobre a visibilidade das tarefas com dados pessoais.
4. Encaminhar ao DPO a questão do CPF e do nascimento no histórico enviado ao provedor de IA (requer avaliação especializada).

Próximo dono: `qa-engineer`, depois `security-engineer`. A decisão sobre as conversas herdadas é do responsável.
