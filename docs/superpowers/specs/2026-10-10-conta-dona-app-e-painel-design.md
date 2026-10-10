# Conta da dona com acesso ao app e ao Painel Admin

## Objetivo

Permitir que `contato@elolab.com.br` use, pela mesma conta, o app clínico do EloLab e o Painel Admin da plataforma. A conta terá uma clínica interna própria; os demais usuários não receberão acesso ao Painel Admin nem serão adicionados a essa clínica.

## Contexto atual

- O login é compartilhado pelo app e pela administração da plataforma.
- `platform_admins` identifica administradores da plataforma e `is_platform_admin()` autoriza o acesso de servidor às rotas e dados administrativos.
- `user_roles` contém papéis clínicos, incluindo `admin`, e `profiles.clinica_id` associa a conta à sua clínica.
- A rota `/painel-admin` e as rotas `/admin/*` já exigem uma conta ativa em `platform_admins`.
- O carregamento do perfil evita criar uma clínica automaticamente para contas de plataforma. Portanto, apenas abrir as rotas do app não basta para oferecer um espaço clínico próprio.
- A navegação já diferencia itens da plataforma, mas não apresenta uma escolha explícita entre o app clínico e a administração da plataforma.

## Abordagem escolhida

Manter uma única identidade com as duas autoridades existentes: administrador da plataforma e administrador de uma clínica interna exclusiva. Criar uma migração idempotente que localiza a conta pelo e-mail confirmado, garante o registro `owner` em `platform_admins`, associa o perfil a uma clínica dedicada do EloLab e concede o papel clínico `admin`. A migração não cria uma conta de autenticação nem concede papéis a outras contas.

Adicionar à navegação uma opção explícita para alternar entre “App” e “Painel Admin”. A opção administrativa aparece apenas para administradores da plataforma. O modo App leva ao dashboard e mostra a navegação clínica; o modo Painel Admin leva a `/painel-admin` e mostra a navegação administrativa. As proteções de rota e as políticas do banco permanecem como autoridade de acesso; ocultar itens na interface não é considerado proteção.

## Alternativas consideradas

1. **Dois logins separados:** separaria sessões, mas duplica identidade e fluxo de recuperação, contrariando o pedido de alternância na mesma conta.
2. **Transformar a conta de plataforma em um usuário clínico comum:** facilitaria o uso clínico, mas removeria o acesso necessário ao painel e enfraqueceria a separação de autoridades.
3. **Uma conta com ambas as autoridades e clínica dedicada (recomendada):** reaproveita o RBAC atual e mantém a clínica interna isolada por associação própria, com mudança explícita de contexto na navegação.

## Provisionamento e segurança

- A migração deve ser transacional e idempotente: nova execução não cria clínicas duplicadas nem papéis duplicados.
- A conta deve ser identificada por comparação sem distinção entre maiúsculas e minúsculas do e-mail, sem armazenar credenciais ou incluir segredos no código.
- Se não existir usuário autenticado com esse e-mail, a migração deve falhar com mensagem clara, em vez de criar identidade ou associar outra conta.
- A clínica interna deve ter nome identificável como ambiente próprio do EloLab, proprietário igual à conta dona, e nenhuma associação com clínicas de clientes.
- Se o perfil já estiver ligado a uma clínica diferente, o provisionamento deve falhar sem trocar o vínculo. Se já houver clínica própria do usuário, ela deve ser reutilizada em vez de criar outra.
- O Painel Admin continua protegido no servidor por `is_platform_admin()`; administradores de clínica e demais usuários continuam sem acesso.
- O app usa o vínculo de `profiles.clinica_id` para carregar o espaço clínico da conta. A alternância não usa impersonação de cliente nem altera o escopo de outras contas.
- Não haverá chamada à produção nem deploy como parte desta implementação. A ativação no banco e publicação do frontend exigem as respectivas etapas autorizadas após a revisão do plano.

## Interface e comportamento

- Uma opção acessível e visível apenas à conta com acesso de plataforma permite abrir o App ou o Painel Admin.
- Selecionar App abre o dashboard da clínica interna; selecionar Painel Admin abre o painel existente.
- O destino atual deve ser indicado visualmente, e em telas pequenas a opção deve continuar acessível.
- Usuários comuns mantêm navegação e destinos atuais, sem novos itens administrativos.
- Acesso direto a rota sem autoridade válida continua negado pelas proteções existentes.

## Critérios de aceite

1. `contato@elolab.com.br` tem registro ativo de proprietário da plataforma, perfil ligado a uma clínica interna própria e papel clínico `admin` após o provisionamento autorizado.
2. A mesma sessão consegue acessar o dashboard clínico e `/painel-admin` através da opção de navegação.
3. Um usuário comum não vê a opção administrativa e continua impedido de abrir `/painel-admin` diretamente.
4. Rodar o provisionamento novamente não duplica clínica, vínculo ou papel.
5. Um e-mail de conta diferente não ganha vínculo, papel ou autoridade por causa desta mudança.
6. Nenhuma alteração é aplicada em produção durante a implementação local.

## Verificação

Cobrir o RBAC e a navegação para conta da plataforma com e sem vínculo clínico, usuário comum e conta sem autenticação. Validar a idempotência e o escopo da migração em ambiente local/de teste. Fazer build e checagens relevantes do repositório antes de concluir. Não usar dados ou credenciais de produção para os testes.

## Limites

Esta especificação trata apenas da conta indicada, da clínica interna e da alternância entre contextos. Não inclui novos papéis administrativos, painel clínico novo, impersonação, mudanças de cobrança ou permissões para outras contas.
