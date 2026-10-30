# Agenda — bloqueios de horários em páginas próprias

## Diagnóstico

O acesso a bloqueios abria uma janela sobre o calendário. Dentro dela, a lista possuía outra janela para cadastrar profissional, categoria, datas, duração, horários e observação. O fluxo ocupava o espaço do calendário e o cadastro podia ser fechado sem aviso, descartando o que já havia sido preenchido.

## Fluxo e implementação

- O menu de opções da Agenda abre `/agenda/bloqueios`; a lista e o cadastro agora são rotas próprias em `/agenda/bloqueios` e `/agenda/bloqueios/novo`.
- A navegação carrega a data, a visão e os filtros da Agenda. Ao voltar, a busca e os filtros são restaurados.
- O formulário mantém as categorias existentes, períodos de um ou mais dias e bloqueios de dia inteiro ou por faixa horária. Datas impossíveis, período invertido e horário final anterior ao inicial são rejeitados antes da gravação.
- A regra existente de conflito com consulta continua no banco. A falha explica como corrigir o período, mantém os campos e permite tentar novamente.
- O trabalho não salvo é protegido ao cancelar, navegar ou recarregar. Depois de salvar, o usuário retorna à lista; um novo cadastro começa vazio.
- A lista mantém carregamento, recuperação de falha, estado vazio e a remoção de registros. Remover continua exigindo uma confirmação curta e a gravação permanece filtrada pelo identificador e pela clínica ativa.
- Membros com perfil exclusivamente médico recebem o próprio vínculo profissional e não escolhem outro profissional. A rota usa os mesmos perfis já autorizados para a Agenda.

## Integrações preservadas

Leitura, inclusão e remoção continuam usando `bloqueios_agenda`, o cliente Supabase, a invalidação React Query e a proteção/RLS existentes. O payload de inclusão e o tratamento do conflito `AGENDA_BLOQUEIO_CONFLITO` foram mantidos. Não houve mudança de API, permissões, schema, migration, Edge Function ou tabela financeira.

## Validação

- 5 cenários Playwright passaram: caminho Agenda → lista → novo bloqueio → retorno com busca preservada; bloqueio em faixa horária e rejeição de intervalo invertido; conflito do banco com recuperação dos campos; remoção com confirmação e filtro de clínica; layout em 1440, 768 e 390 px e proteção de rascunho.
- O teste sintético de conflito existente passou (1/1). Os writes do Playwright foram interceptados; nenhum bloqueio real foi criado ou removido.
- `npm run build` e `npm run check:a11y` passaram. ESLint: zero erros e 52 avisos de `any` — 49 em código legado da Agenda e três na integração Supabase de bloqueios.
- TypeScript global ainda apresenta nove erros em seis arquivos TISS não alterados: sete usos de `replaceAll` incompatíveis com `ES2020` e dois casts JSON. Nenhum erro está nos arquivos desta entrega.
- As capturas renderizadas de 1440, 768 e 390 px foram abertas e inspecionadas. Não há transbordamento horizontal; no celular as ações ficam acima da barra inferior. As capturas estão em `test-results/agenda-blocks-pages-formul-63046--protege-trabalho-não-salvo-chromium/`.

## Publicação

- Código publicado: `c580292d279b8aa509de8ecb3b88c2b72f79ee56`.
- Imagem: `easypanel/elolab/app:deploy-20261030-c580292`.
- O smoke isolado confirmou `healthz=ok` e o SHA integral em `/version.json`. O update do Swarm terminou com uma tarefa ativa e o domínio `app.elolab.com.br` confirmou `healthz=ok` e o mesmo SHA.
- O Swarm registrou uma disputa transitória da porta em modo host durante a troca; convergiu sem rollback. Rollback disponível: `easypanel/elolab/app:deploy-20261030-04c60a4`.
- Não houve migration nem alteração de dados em produção.

## Sequência

A entrega fecha o formulário de bloqueio que ainda ficava sobre a Agenda. Confirmações curtas e a personalização visual continuam em seus contextos. A auditoria e as demais páginas operacionais do EloLab continuam pendentes; esta mudança não declara o redesign integral concluído.
