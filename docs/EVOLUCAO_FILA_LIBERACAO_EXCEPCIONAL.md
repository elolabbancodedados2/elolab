# Fila — liberação excepcional em página própria

## Diagnóstico

A liberação para seguir sem pagamento confirmado ou sem triagem ficava em um diálogo por cima da Fila. Era uma operação clínica/administrativa auditável, com justificativa obrigatória, e o diálogo ocultava o estado do atendimento usado para decidir. A ação já era limitada a médico e administrador e as regras do banco também aplicam essa limitação.

## Jornada e implementação

- As ações contextuais de pagamento e triagem agora abrem `/fila/:agendamentoId/liberacao/:tipo`.
- A tela identifica paciente, profissional, horário e o bloqueio. Explica que a exceção de pagamento não quita valores e que a exceção de triagem não cria sinais vitais nem substitui avaliação clínica.
- Antes de liberar, consulta o agendamento e a fila no escopo da clínica ativa, confere estados terminais e regras da clínica e revalida a trava pelo RPC existente. Para triagem, consulta a RPC que informa se ela já foi registrada.
- Exige justificativa com pelo menos cinco caracteres, preserva o rascunho ao navegar por engano e impede uma segunda atualização concorrente pelo filtro condicional da coluna de liberação.
- Em uma resposta de rede incerta, relê o estado antes de permitir nova tentativa. Em sucesso, invalida as consultas operacionais e retorna à URL original da Fila.
- A rota restringe acesso a `admin` e `medico`. A gravação mantém as colunas, campos de autor/horário, justificativas e RLS existentes; nenhuma RPC, permissão do banco, migration ou contrato foi alterado.
- Permanecem em diálogo apenas a confirmação curta de remoção da fila e o resumo de passagem de turno.

## Validação

- Vitest focal: 41/41 em Fila, nova página e breadcrumbs. Cobriu pagamento e triagem, justificativa mínima, escopo de clínica, prevenção de gravação duplicada, perfis e retorno.
- Playwright sintético: 2/2. Conferiu a página sem modal em 390 px e 1440 px, impacto explicado, largura sem transbordamento e ação mobile acima da navegação inferior. Os writes foram interceptados; nenhum atendimento real foi alterado.
- `npm run check:a11y`, build de produção e `git diff --check` passaram. ESLint não reportou problemas na página nem no teste novos; permanecem 23 avisos legados no arquivo `Fila.tsx`.
- A verificação TypeScript global continua reportando nove erros em seis arquivos TISS não alterados nesta entrega: sete usos de `replaceAll` incompatíveis com o `lib` ES2020 configurado e dois casts de retorno JSON. Nenhum erro foi apontado nos arquivos desta mudança.
- Capturas renderizadas mobile e desktop foram inspecionadas em `test-results/fila-exceptional-release-p-318ac-s-and-a-clinic-scoped-write-chromium/` e `test-results/fila-exceptional-release-t-b75ba-d-remains-usable-on-desktop-chromium/`.

## Publicação

- Código: commit `04c60a4ffaeddbc59889d335a82c7209b913dc08`, imagem `easypanel/elolab/app:deploy-20261030-04c60a4`.
- Smoke isolado: `/healthz=ok` e `/version.json` confirmou o SHA integral.
- Produção: `https://app.elolab.com.br/healthz` respondeu `ok`; `/version.json` confirmou o mesmo SHA. O Swarm convergiu para uma tarefa ativa na imagem nova. Durante a troca, houve disputa transitória pela porta em modo host, resolvida pelo `stop-first`; não houve rollback.
- Rollback disponível: `deploy-20261030-ccc8ee8`. Nenhuma migration ou alteração de dados de produção.
