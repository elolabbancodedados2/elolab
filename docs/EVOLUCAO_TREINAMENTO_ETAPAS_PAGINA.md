# Treinamento — etapas em páginas próprias

## Diagnóstico atual

Os roteiros do Treinamento abriam cada etapa em um diálogo alto. A sequência tinha navegação para módulos externos e gravação de conclusão, então era um fluxo de várias etapas ocupando quase toda a tela.

## Direção e implementação

- Cada roteiro agora usa `/treinamento/:tutorialKey`; a etapa atual fica na query `etapa` para permitir continuar após recarga e usar o histórico do navegador.
- A tela mostra progresso, orientação da etapa, link contextual, ações de anterior/próxima e conclusão.
- A lista de roteiros permanece em `/treinamento` e o retorno é explícito.
- A disponibilidade do roteiro e das etapas continua filtrada pelas funções do perfil.
- A conclusão continua gravada em `user_training_progress` com `user_id`, `clinica_id` e `tutorial_key`.
- A área de conteúdo recebe espaço inferior para manter a ação final acima da navegação fixa no celular.

## Validação

- Vitest: 3/3; inclui roteiro filtrado por função, retomada direta de etapa e ausência de modal.
- Playwright: 1/1; URL sobrevive à recarga, navegação, conclusão e payload de gravação; backend substituído por respostas sintéticas.
- TypeScript, build, acessibilidade, permissões, falhas silenciosas e ESLint focal passaram. ESLint manteve avisos já existentes de `any` e dependência de hook em `Treinamento.tsx`.
- Capturas renderizadas de desktop e mobile foram inspecionadas. No celular a ação de conclusão fica acima da navegação inferior, sem overflow horizontal.
- Nenhuma conclusão ou gravação real foi realizada.

## Publicação

Publicado em 30/10/2026 no commit `ade77ff4efeb955289eca4f2b22d6c9f8a906a73`, imagem `easypanel/elolab/app:deploy-20261030-ade77ff4`. O container isolado e o domínio público confirmaram `/healthz=ok`; `/version.json` confirmou o SHA integral e o serviço Swarm ficou em 1/1. Rollback: `deploy-20261030-885bfe55`; fonte anterior preservada em `code.before-20261030-ade77ff4`. O hash do `.env` permaneceu igual, sem revelar valores. Nenhuma migration ou alteração de dados de produção.
