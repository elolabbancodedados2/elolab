# Rodada 4: tech-lead (porte LGPD e agendamento online)

## O que portei

### `src/lib/lgpdCompliance.ts`
- **Situação na base nova:** `deletePatientData` e o laço que apagava tabela por tabela não existem mais. O main removeu os dois (`git log -S deletePatientData` mostra que o último a tocar foi `3ff63e39`). A tela já não oferecia exclusão.
- **O que entrou** (bloco logo depois de `exportPatientData`):
  - `EXCLUSAO_LGPD_DESTRUTIVA_HABILITADA = false` e `ExclusaoLgpdBloqueadaError`.
  - `deletePatientData`, que agora **sempre** recusa sem tocar no banco. O código destrutivo **não** voltou. A função continua exportada só como guarda: se alguém voltar a chamá-la, recebe o erro em vez de apagar dados.
  - `ANONIMIZACAO_LGPD_HABILITADA = false`, `AnonimizacaoLgpdIndisponivelError` e `anonimizarPacienteLgpd`, que fica entre a tela e a RPC transacional de `lgpdAnonimizacao.ts`.
  - `registrarSolicitacaoExclusaoLgpd`: grava o pedido em `tarefas` como tarefa urgente, ligada ao paciente e à clínica, e não apaga nada. O `insert` é tipado pelo `types.ts`, sem `as any`.

### `src/pages/LgpdPacientes.tsx`
- Botão **Solicitar exclusão** em cada paciente. Ele abre um `Dialog` que pede o motivo e chama `registrarSolicitacaoExclusaoLgpd`. Erros passam por `friendlyErrorMessage`.
- Botão **Anonimizar** e `AnonimizarPacienteDialog`, que só aparecem com `ANONIMIZACAO_LGPD_HABILITADA` ligada. Hoje ela está desligada.
- O aviso sobre a exclusão diz agora que o pedido vai para Tarefas e que a tela não apaga dados.
- Nos elementos novos usei só tokens e componentes de `ui`, sem cor fixa. O arquivo tem 398 linhas.

### `src/pages/AgendamentoOnline.tsx` (CLIN-QA-003)
- A data de nascimento passou a ser obrigatória: o rótulo ganhou `*`, o campo ganhou `required`, e o formulário valida antes do envio ("Informe a data de nascimento." ou "Data de nascimento inválida." para data futura) e leva o foco a `ag-nasc`.
- A tela de conclusão agora diz "Horário solicitado: …", conforme `docs/time/planos/ESTAB-7D-itens-3-4.md:50`.

### `src/pages/__tests__/LgpdPacientes.test.tsx` (ajuste do teste copiado)
- A tela da base nova busca por `useBuscaPacientes` (no lugar de `usePacientes`), usa `useQuery` e `Link`. Por isso troquei o mock e envolvi a tela em `QueryClientProvider` e `MemoryRouter`. As asserções continuam as mesmas, e acrescentei uma: não existe botão "Apagar".

## O que descartei e por quê
- **Trocas `err.message` → `friendlyErrorMessage` (AgendamentoOnline e LgpdPacientes):** a base nova já faz isso (commit `3b5a738c`).
- **Ícone `Download` e `AlertDialog` da versão antiga de LgpdPacientes:** a tela foi reescrita no main (escopo da exportação, protocolo, confirmação de entrega). Por isso usei o `Dialog` que a tela já tinha.
- **Laço destrutivo de `deletePatientData`:** foi removido no main e não foi reintroduzido.
- **Cores fixas que já existiam na tela** (`#BFD8EE`, `#1080CA`, `bg-gradient-primary`): são de outra frente e ficaram fora desta tarefa. Ver pendência 3.

## Arquivos tocados
- `src/lib/lgpdCompliance.ts`
- `src/pages/LgpdPacientes.tsx`
- `src/pages/AgendamentoOnline.tsx`
- `src/pages/__tests__/LgpdPacientes.test.tsx`

## Evidências
- `npx vitest run src/lib/__tests__/lgpdExclusaoBloqueada.test.ts src/pages/__tests__/LgpdPacientes.test.tsx src/lib/__tests__/lgpdAnonimizacaoIntegracao.test.ts src/lib/__tests__/lgpdAnonimizacao.test.ts src/components/lgpd/__tests__/AnonimizarPacienteDialog.test.tsx`: 5 de 5 arquivos e 29 de 29 testes passaram.
- `npx eslint` nos quatro arquivos: 0 erros e 2 avisos `no-explicit-any`, em `lgpdCompliance.ts:22` (`db as any`) e `AgendamentoOnline.tsx:46`. Os dois já existem no `HEAD`: o ESLint na versão do `HEAD` dá a mesma contagem. A porta não acrescentou nenhum `any`.
- `tsc`: **NÃO VERIFICADO.** Não rodei, pela regra de recursos. Fica para a verificação completa da rodada.

## Pendências
1. **Teste da validação de nascimento no AgendamentoOnline: não existe teste unitário da tela.** A cobertura depende de `tests/agendamento-online.spec.ts`, que está com o `qa-engineer` nesta rodada.
2. **A anonimização continua desligada.** Para ligar, é preciso aplicar `20261028100000_lgpd_anonimizacao_transacional.sql`, ter o parecer do DPO (requer avaliação especializada) e a aprovação do responsável.
3. **P3:** `LgpdPacientes.tsx` ainda tem cores fixas fora dos tokens (Alert e realce da linha). Fica para o `product-designer`.
4. **Botão "Solicitar análise ao suporte" no cabeçalho:** convive com o novo "Solicitar exclusão". O `product-owner` deve decidir se mantém os dois.
5. **Verificação completa da rodada** (`tsc`, `vitest` e lint) quando os outros agentes terminarem.
