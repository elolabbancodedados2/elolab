# Plataforma — acesso assistido à clínica em página própria

## Diagnóstico atual

O início do acesso assistido estava dentro de um diálogo sobre a lista de clínicas. O overlay não deixava revisar com clareza qual clínica seria acessada nem o alcance dos dados, que inclui prontuários de pacientes.

## Direção e implementação

- A rota `/admin/clinicas/acesso` apresenta clínica, responsável, situação, plano e quantidade de pacientes antes de iniciar o acesso.
- A busca e os filtros da listagem são preservados ao voltar. O identificador da clínica fica no estado da navegação e é confirmado novamente pela consulta atual da plataforma; URL direta ou recarga pede que a clínica seja selecionada de novo.
- A justificativa continua obrigatória (5 a 500 caracteres). A RPC `platform_start_impersonation`, a atualização do perfil e a auditoria de entrada/saída existentes foram mantidas.
- A página explicita que a sessão acessará dados reais. Somente administrador da plataforma pode abrir a rota.

## Validação

Playwright sintético 1/1 passou, cobrindo rota própria, ausência de diálogo, filtro preservado, destino fora da URL, proteção do rascunho, payload da RPC e larguras desktop/celular. TypeScript, build, acessibilidade, permissões, falhas silenciosas, colunas e `git diff --check` passaram. Capturas desktop e mobile foram inspecionadas; não houve overflow horizontal e a ação final fica acima da navegação inferior. ESLint sem erros; os avisos `no-explicit-any` do arquivo legado continuam.

Todos os acessos do teste foram interceptados; nenhuma clínica real foi acessada. Nenhuma migration foi aplicada.

Commit `3f85b856b21781c7f03655c3a9885164831ff329`; imagem `easypanel/elolab/app:deploy-20261030-3f85b85`; rollback `deploy-20261030-a96ed3f`. Smoke isolado, `/healthz`, `/version.json`, domínios `app.elolab.com.br` e `elolab.com.br`, Swarm 1/1, fonte anterior e hash do ambiente foram conferidos.
