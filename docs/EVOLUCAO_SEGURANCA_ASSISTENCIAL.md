# Qualidade e segurança assistencial — revisão em páginas próprias

## Diagnóstico atual

O detalhe de um relato, seu histórico, a revisão administrativa e o pedido/decisão de retificação estavam reunidos em um modal longo sobre a lista. Isso escondia a continuidade da ocorrência e misturava tarefas de perfis diferentes. O registro do relato já era feito na própria página e continua assim.

## Fluxo e implementação

- A lista abre o relato em `/seguranca-assistencial/:reportId`; o formulário de retificação usa `/seguranca-assistencial/:reportId/retificacao`.
- Busca, gravidade, status e ordenação retornam preservados ao voltar para a lista. Breadcrumbs mostram o nome da tarefa e ocultam o identificador interno.
- A página de detalhe reúne a descrição e ação imediata registradas, status, histórico de revisão e retificações. Administradores podem atribuir um profissional, definir prazo, registrar análise/ação corretiva e decidir uma retificação pendente.
- Somente quem registrou o relato recebe a ação de pedir retificação. O texto original permanece visível e preservado enquanto a solicitação aguarda decisão.
- As alterações não salvas são protegidas ao navegar ou recarregar. Campos permanecem preenchidos quando uma operação falha; o servidor continua rejeitando atualizações concorrentes pela versão esperada.
- A interface respeita os mesmos papéis autorizados na rota anterior: administrador, médico e enfermagem. O servidor mantém o escopo da clínica, o acesso do relator aos próprios relatos e a revisão/decisão exclusiva de administrador.

## Integrações preservadas

As ações `list`, `get`, `create`, `update`, `request_correction` e `resolve_correction` da Edge Function `seguranca-assistencial` permanecem com os mesmos payloads e validações. Nenhum endpoint, regra de status, permissão, auditoria, migration ou tabela foi alterado.

## Validação

- Playwright do módulo: 6/6 cenários passaram, incluindo revisão e ação corretiva, retificação/decisão, preservação de filtros, proteção de rascunho, perfil médico, falha recuperável e bloqueio de retificação para quem não registrou o relato.
- Regras da Edge Function: 4/4 testes Deno passaram. Breadcrumbs: 31/31 testes Vitest passaram.
- `npm run build`, `npm run check:a11y`, `npm run check:permissoes`, `npm run check:falhas`, `npm run check:colunas`, ESLint focado e `git diff --check` passaram.
- `npx tsc --noEmit -p tsconfig.app.json` ainda aponta nove erros preexistentes em seis arquivos TISS não alterados: sete usos de `replaceAll` incompatíveis com o alvo `ES2020` e dois casts JSON.
- Inspecionei capturas renderizadas desktop e mobile; as páginas não apresentam transbordamento horizontal. Evidências em `test-results/seguranca-assistencial-flu-2211c-a-a-identidade-na-interface-chromium/`.
- Todos os writes dos testes E2E foram interceptados. Nenhum relato ou retificação real foi criado.

## Publicação

- Código: commit `6fa4c9f6a202e0d2527cb951f32cf961a5ea0499`.
- Imagem: `easypanel/elolab/app:deploy-20261030-6fa4c9f`.
- O smoke isolado confirmou `/healthz=ok` e o SHA integral em `/version.json`. O serviço `elolab_app` convergiu para 1/1 réplica ativa; a verificação pública confirmou a mesma saúde e versão.
- Houve contenção transitória de porta em modo host durante a atualização; o Swarm convergiu com a nova imagem e sem rollback. Rollback disponível: `easypanel/elolab/app:deploy-20261030-c580292`.
- Nenhuma migration ou alteração de dados de produção.

## Sequência

Este módulo está concluído. A auditoria operacional e as outras páginas pendentes do EloLab continuam em andamento; esta publicação não declara o aplicativo integralmente concluído.
