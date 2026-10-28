# E07-querykeys-clinica (CLIN-QA-206)

Agente: frontend-developer. Data: 27/10/2026.

## O que foi feito
- Criei `src/lib/queryKeys.ts`, uma fábrica de query keys em que `clinica_id` é sempre o primeiro segmento (`queryKeys.clinica`, `agenda.todos/reagendar/expediente/ultimoAtendimento`, `medicoAtual` e `pacienteResumo`). Também inclui `chavePertenceAClinica` e `prefixoTabela`, que é o prefixo legado por tabela.
- Migrei para a fábrica:
  - `src/components/agenda/AgendaPage.tsx`: reagendar e expediente; as invalidações usam `prefixoTabela`.
  - `src/components/agenda/AppointmentDialog.tsx`: último atendimento e invalidações.
  - `src/components/agenda/AppointmentCard.tsx` e `BloqueioAgenda.tsx`: invalidações via `prefixoTabela`.
  - `src/hooks/useCurrentMedico.ts`: `medicoAtual`.
  - `src/hooks/useBuscaPacientes.ts`: apenas `usePacienteResumo`.
- Antes de trocar essas chaves, confirmei por grep que nenhuma delas é invalidada por prefixo em outro lugar de `src/` ou `tests/`. O comportamento visível não muda.
- Testes novos em `src/lib/__tests__/queryKeys.test.tsx`: formato das chaves, normalização para null, isolamento entre clínicas e um teste de hook que troca da clínica A para a B. Com a resposta da B ainda pendente, `medicoId` fica `null` e não reaproveita o médico da A.

## Fora do escopo, de propósito (pendência)
- As consultas por tabela de `useSupabaseQuery` (`agendamentos`, `bloqueios_agenda`, `lista_espera`, `convenios`, `tipos_consulta`, `salas`) continuam com a chave `[tabela, usuario, clinica, opções]` (`src/hooks/useSupabaseData.ts:42`). Elas já isolam a clínica, mas não pelo primeiro segmento.
- Mudar essa ordem quebraria as invalidações por prefixo de tabela usadas no app inteiro, como `useRealtimeSubscription.ts:8-15`, `usePlatformRealtime.ts:36` e `ListaEspera.tsx:237`.
- A migração precisa ser feita de uma vez: o hook genérico, o realtime e as telas. O dono é o frontend-developer, numa tarefa própria.
- O `queryClient.clear()` na troca de escopo (`SupabaseAuthContext.tsx:86`) continua sendo a primeira barreira.

## Verificação (comandos reais)
- `npx tsc --noEmit -p tsconfig.app.json`: nenhum erro nos arquivos tocados. Há 2 erros de outras tarefas em andamento: `src/lib/tiss/index.ts:21` (`replaceAll`) e `tests/fixtures/portalEdge.ts:132`.
- `npx vitest run src/lib/__tests__/queryKeys.test.tsx src/hooks/__tests__ src/components/agenda`: 15 arquivos e 42 testes aprovados.
- `npx eslint` nos 8 arquivos tocados: 0 erros e 99 avisos `no-explicit-any`, que já existiam. Nenhum `any` novo.
- `npm run check:a11y`: OK. `npm run check:falhas`: 0 casos.
- A suíte completa não foi rodada, conforme as regras de recursos; ela fica para a rodada final (E12).
