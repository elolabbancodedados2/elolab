# F04: query keys gerais na fábrica (useSupabaseQuery e realtime)

## O que foi feito
- **`src/lib/queryKeys.ts`**:
  - Nova família `queryKeys.tabela`: `todos(clinica, tabela)` e `consulta(clinica, tabela, usuario, opções)`, com a chave `[clinica_id, 'tabela', tabela, usuario, opções]`.
  - `instalarCompatibilidadeTabelas(queryClient)`, idempotente: os filtros de prefixo legado `{ queryKey: ['pacientes'] }` continuam alcançando as chaves novas em `invalidateQueries`, `refetchQueries`, `cancelQueries`, `removeQueries`, `resetQueries`, `isFetching`, `getQueriesData` e `setQueriesData`.
    - A troca do filtro só acontece quando existe no cache uma chave nova que o prefixo deveria alcançar. Fora disso, o filtro original segue intacto, e espiões de teste continuam vendo o mesmo argumento.
    - Filtros `exact` ou com `predicate` próprio ficam como estão.
  - `filtroSomenteLegado(chave)` alcança só as chaves `[chave, ...]`.
- **`src/hooks/useSupabaseData.ts`**:
  - `useSupabaseQuery` usa `queryKeys.tabela.consulta`, com `clinica_id` no primeiro segmento.
  - O `placeholderData` (`keepPrevious`) passou a comparar os índices novos: clínica em `[0]`, usuário em `[3]`.
  - O hook e `useSupabaseUpdate` instalam a compatibilidade. A invalidação de `useSupabaseUpdate` passou a usar `prefixoTabela`.
- **`src/hooks/useRealtimeSubscription.ts`**:
  - Novo `invalidarChavesDaClinica`. Para cada chave, invalida `queryKeys.tabela.todos(clinica atual, chave)` e as chaves legadas por meio de `filtroSomenteLegado`.
  - A clínica fica em ref, então trocar de clínica não recria o canal.
  - O mapeamento tabela → chaves e o polling de reserva não mudaram.
- **Comportamento visível:** o mesmo. As ~410 invalidações das telas (`{ queryKey: ['tabela'] }`) continuam recarregando as listas. Uma única diferença é intencional: o realtime agora invalida as consultas genéricas só da clínica atual, em vez de todas as clínicas em cache.

## Testes
- `src/lib/__tests__/queryKeys.test.tsx`: cobre a fábrica nova, a compatibilidade (prefixo legado, escopo por clínica, filtro somente legado, `removeQueries`, idempotência, filtros exatos ou com predicate, filtro original intacto) e o teste existente de troca de clínica.
- `src/hooks/__tests__/cachePorEscopo.test.tsx`: novo caso que confere a chave com `clinica_id` primeiro e que `invalidateQueries({ queryKey: ['pacientes'] })` ainda refaz a busca. Os casos antigos de troca de clínica e de usuário continuam aprovados.
- `src/hooks/__tests__/useRealtimeSubscription.test.tsx`, novo: um evento invalida a clínica atual e a chave legada, não toca outra clínica nem outra tabela, e o canal não é assinado sem usuário.

## Verificação (comandos reais)
- `npx tsc --noEmit -p tsconfig.app.json`: 0 erros.
- `npx vitest run` nos 4 testes de chaves e realtime: 4 arquivos e 19 testes aprovados.
- `npx vitest related --run` nos 6 arquivos tocados: 27 arquivos e 109 testes aprovados.
- `npx eslint` nos 6 arquivos: código de saída 0. Os 4 avisos de `no-explicit-any` em `useSupabaseData.ts` já existiam (`.from(tableName as any)` e afins).

## Pendências e riscos
- **Compatibilidade temporária:** ela só existe porque as telas ainda invalidam por `['tabela']`. Ao migrar cada tela para `queryKeys.tabela.todos(clinicaId, tabela)`, ela pode encolher. Remover quando não houver mais prefixo legado. Dono: frontend-developer, por tela.
- Filtros legados com mais de um segmento no formato antigo `[tabela, usuario, clinica]` deixariam de alcançar a chave nova, porque a ordem mudou. Não procurei esses casos de forma exaustiva: NÃO VERIFICADO.
- `usePlatformRealtime` ficou fora: as chaves dele são do painel da plataforma, que cruza clínicas e não tem escopo de clínica. `useRealtimeNotifications` e `useRealtimePushNotifications` não usam o cache do React Query.
- `useMinhasTarefasPendentes` e os demais hooks com chave própria seguem no formato legado. Ficam para as próximas migrações.
- Não houve decisão do responsável nesta tarefa, e nenhuma foi necessária.

ESTEIRA: CONCLUIDO
