# Painel TV — gestão de mídias em página própria

## Diagnóstico atual

Upload, ativação, pausa e exclusão de imagens e vídeos ficavam em um diálogo com rolagem sobre o painel de chamada. O diálogo ocupava boa parte da tela e não diferenciava claramente uma lista vazia de uma falha ao consultar as mídias.

## Direção e implementação

- A gestão agora abre em `/painel-tv/midias`, com retorno explícito ao painel de chamada.
- A rota exige papel `admin`; as operações continuam vinculadas à clínica atual e às mesmas tabelas e bucket Supabase.
- Upload, preview, ativação/pausa e exclusão mantêm os handlers e contratos existentes.
- O painel de chamada não assina atualizações, não atualiza a fila e não avança o carrossel enquanto a rota de gestão está aberta.
- A lista diferencia carregamento, erro com nova tentativa e estado vazio.
- O seletor de arquivos tem rótulo acessível e usa o idioma do produto.

## Validação

- Vitest de `PainelTV`: 5/5, incluindo navegação, erro versus vazio, retorno ao painel e acesso por perfil.
- Playwright: 1/1; GET e PATCH de mídia interceptados, escopo por `clinica_id` conferido, sem gravação real.
- TypeScript, build de produção, acessibilidade e verificação de permissões passaram.
- Capturas renderizadas e inspecionadas em `test-results/painel-tv-midias-desktop.png` e `test-results/painel-tv-midias-mobile.png`; sem modal ou estouro horizontal.
- A checagem mobile inicialmente encontrou o campo de arquivo oculto expandindo a página. O controle foi corrigido e a checagem passou após a correção.

## Limites

O fluxo de upload em navegador foi mantido e validado por componente; o E2E validou leitura e ativação usando respostas sintéticas. Não houve upload, exclusão ou alteração de dados reais nesta validação.

## Publicação

Publicado em 30/10/2026 no commit `885bfe55ac06a186fcbad933689cdf2c33a906ca`, imagem `easypanel/elolab/app:deploy-20261030-885bfe55`. O container isolado e o domínio público confirmaram `/healthz=ok`; `/version.json` confirmou o SHA integral e o serviço Swarm ficou em 1/1. Rollback: `deploy-20261030-7cdbf758`; fonte anterior preservada em `code.before-20261030-885bfe55`. O hash do `.env` permaneceu igual, sem revelar valores. Nenhuma migration ou alteração de dados de produção.
