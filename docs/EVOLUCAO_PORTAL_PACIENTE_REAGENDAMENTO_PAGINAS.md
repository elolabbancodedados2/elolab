# Portal do Paciente — reagendamento em página própria

- **Data:** 30/10/2026
- **Rota:** `/portal-paciente?tela=reagendar`
- **Entrega:** commit `4f716d336e335b8a9ca43e12f307a4d10356644b`
- **Publicação:** `deploy-20261030-4f716d3`
- **Rollback:** `deploy-20261030-5af4fd6`

## Diagnóstico atual

O reagendamento de consulta era um formulário com data, horários livres e tratamento de concorrência dentro de um diálogo. O reagendamento de retorno também usava diálogo, embora envolvesse alteração de uma data e atualização do processo com a clínica. A seleção era necessária durante a sessão e não podia ser gravada em URL ou armazenamento persistente.

## Direção de redesign

As duas tarefas agora ocupam uma página de trabalho no Portal do Paciente. O contexto mostra consulta/retorno atual, médico ou motivo, nova data e, para consulta, somente horários retornados pelo servidor. A página explica que uma consulta confirmada volta ao estado “Agendado” após a remarcação. A atualização do retorno informa que a clínica poderá confirmar o horário.

O endereço usa apenas `tela=reagendar`; não contém código de acesso, identidade nem ID de consulta/retorno. Seleção e rascunho ficam em memória. Ao abrir o endereço diretamente ou recarregar, sem seleção ativa, o paciente recebe uma recuperação segura e retorna à lista. Ao voltar, o foco retorna ao controle que abriu a tarefa.

## Implementação

- `src/pages/PortalPaciente.tsx`: os dois diálogos foram removidos e substituídos pela página. As ações existentes `get_available_slots`, `get_remarcacao_limite`, `reschedule_agendamento` e `reschedule_retorno` foram preservadas.
- A consulta continua usando o médico original, o limite informado pelo servidor, horários livres atuais e detecção de alteração concorrente.
- Se a operação no servidor for concluída, mas a atualização da lista falhar, o Portal informa o sucesso e mantém a nova data na interface para evitar uma tentativa duplicada com estado antigo.
- `src/pages/__tests__/portalPacienteCancelamento.test.tsx` e `src/pages/__tests__/portalDocumentos.test.tsx`: mocks de query atualizados e expectativas de fluxo adaptadas à página.
- `tests/patient-portal-reschedule-pages.spec.ts`: E2E sintético dos dois fluxos, URL sem dados identificáveis, retorno após falha de atualização, recuperação de abertura direta e viewport estreito.

Não houve alteração de API, função Edge, schema, autorização ou integração. Nenhum dado real foi alterado durante a validação.

## Validação

- Playwright: 3/3 cenários passaram.
- Vitest do Portal e contrato de histórico: 32/32 testes passaram.
- TypeScript, build de produção e `git diff --check` passaram.
- `check:a11y`, `check:permissoes`, `check:falhas` e `check:colunas` passaram.
- Capturas mobile (390 px) e desktop (1280 px) foram geradas pelo Playwright e inspecionadas. A página não teve rolagem horizontal no desktop; o fallback foi validado a 320 px.
- ESLint não encontrou erros; o arquivo mantém avisos preexistentes de `any`.

## Publicação

A imagem foi construída e passou por smoke isolado (`/healthz` e `/version.json`). Após a convergência, `elolab_app` permaneceu `1/1`. Os domínios `app.elolab.com.br` e `elolab.com.br` retornaram `/healthz=ok` e o SHA completo `4f716d336e335b8a9ca43e12f307a4d10356644b`. O hash do `.env` ativo permaneceu `f2bcf73f6d860dec143ae363f755d3d18e41dc2f3ea3919944af62899c2f3b65`. Nenhuma migration foi aplicada.

Esta entrega conclui somente os dois reagendamentos do Portal do Paciente. A auditoria operacional integrada e as demais pendências registradas em `SEQUENCIA_PAGINAS_OPERACIONAIS.md` continuam em andamento.
