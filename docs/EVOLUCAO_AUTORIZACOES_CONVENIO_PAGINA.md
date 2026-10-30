# Autorizações do convênio em página própria

## Diagnóstico

Histórico e solicitação de autorização ocupavam um diálogo com até 90% da altura da janela dentro da ficha do paciente. No celular, a tarefa comprimia o contexto clínico e exigia rolagem interna. O fluxo é usado pela equipe da clínica para acompanhar a resposta do convênio e registrar pedidos.

## Jornada e decisões

- A ação da ficha abre `/pacientes/:patientId/autorizacoes`, mantendo busca, aba e estado da ficha para o retorno.
- A página registra a leitura com `registrar_visualizacao_historico_paciente` antes de consultar o paciente e filtra a leitura pelo identificador da clínica ativa.
- Histórico e solicitação ficam no mesmo workspace: é uma tarefa curta vinculada ao paciente, não uma etapa clínica separada.
- A pessoa seleciona um convênio ativo, confere contato e carência e informa procedimento e observações. A RPC existente registra a solicitação; o fluxo informa se o pedido foi encaminhado por e-mail ou precisa de contato manual.
- A confirmação curta para descartar alterações não salvas continua disponível. Uma trava local impede envio duplo enquanto a RPC está em andamento.
- Carregamento, falha com nova tentativa, paciente fora da clínica, ausência de convênios ativos, histórico vazio e solicitação pendente têm mensagens próprias.

## Integrações preservadas

- A criação continua usando `solicitar_autorizacao_convenio` e os mesmos parâmetros. O backend mantém as validações, a autorização e o eventual envio de e-mail.
- A rota usa os perfis já aceitos pela área de pacientes: administrador, recepção, enfermagem e médico. O escopo do paciente é filtrado pela clínica antes da leitura.
- Não foram alteradas tabelas, permissões, regras de negócio ou contratos. Nenhum pedido real foi criado; gravações de teste foram interceptadas com dados sintéticos.

## Arquivos

- `src/pages/AutorizacoesConvenioPage.tsx`
- `src/components/patients/AutorizacaoConvenioWorkspace.tsx`
- `src/pages/Pacientes.tsx`
- `src/App.tsx`
- `src/config/routeLabels.ts`
- `tests/patient-insurance-authorizations.spec.ts`
- `src/components/patients/__tests__/AutorizacaoConvenioWorkspace.test.tsx`

## Validação

- Vitest: 3/3 passaram, incluindo contexto de paciente, falha de leitura recuperável e proteção de alterações não salvas.
- Playwright: 2/2 passaram em 1440 px e 390 px, da ficha à página, envio sintético e retorno com aba preservada. As requisições de paciente verificaram o filtro da clínica e as gravações foram interceptadas.
- Capturas efetivamente inspecionadas no estado vazio, formulário e ações finais no celular. A área de envio permanece acima da navegação inferior após rolagem; não há transbordamento horizontal nem diálogo aberto.
- Build de produção, acessibilidade, permissões, falhas silenciosas, colunas do banco e ESLint focal passaram. O ESLint não apresentou avisos novos; os 54 avisos restantes são `any` já existentes em `Pacientes.tsx`.
- O typecheck global continua acusando 9 erros em 6 páginas financeiras/TISS não alteradas: sete usos de `replaceAll` incompatíveis com `ES2020` e dois casts de retorno JSON.

## Publicação

Commit, imagem, versão pública, rollback e estado do Swarm serão registrados após o deploy. Nenhuma migration ou escrita de produção.
