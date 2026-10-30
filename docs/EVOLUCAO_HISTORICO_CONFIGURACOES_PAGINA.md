# Histórico de versões das configurações em página própria

## Diagnóstico

A comparação de snapshots ocupava um diálogo de até 85% da janela, com lista, tabela de diferenças e ação de restauração. O fluxo exige leitura cuidadosa antes de uma alteração compartilhada da clínica.

## Jornada e decisões

- O botão “Histórico e versões” abre `/configuracoes/historico-versoes` e informa a chave e a aba de origem por parâmetros controlados.
- A página carrega até 50 versões e o snapshot atual, escolhe uma diferença inicial quando disponível e permite comparar outras versões.
- A tabela identifica o valor atual e o valor da versão escolhida, com tratamento para valores iguais, ausência da configuração atual, histórico vazio e falha recuperável.
- Restaurar informa que será criada uma nova versão, usa controle otimista de concorrência e volta à aba de origem após sucesso.
- A rota é restrita a `admin`. Reautenticação continua sendo solicitada pelo diálogo curto existente quando o banco a exige.
- Valores de configuração não são colocados na URL.

## Integrações preservadas

- Leituras continuam em `configuracoes_clinica_versoes` e `lerConfigsClinicaComVersoes`.
- A restauração mantém a RPC `restaurar_configuracao_clinica_versao`, o ID da versão e a versão esperada atual.
- Erros de conflito permanecem visíveis e exigem atualizar/comparar antes de tentar outra vez.
- Nenhuma tabela, regra de autorização ou contrato do banco foi alterado.

## Arquivos

- `src/pages/ConfiguracaoHistoricoPage.tsx`
- `src/pages/Configuracoes.tsx`
- `src/pages/__tests__/ConfiguracaoHistoricoPage.test.tsx`
- `tests/configuration-history-page.spec.ts`
- `src/App.tsx`
- `src/config/routeLabels.ts`

## Validação

Vitest 3/3 e Playwright 1/1 passaram. TypeScript, build, acessibilidade, permissões, falhas silenciosas, colunas e ESLint focal passaram sem erros. Inspecionei capturas renderizadas em 1440 px e 390 px: tabela e botões cabem na tela; a ação mobile fica acima da navegação inferior; a página não abre diálogo para a comparação. O teste interceptou a RPC e não restaurou configurações reais.

## Publicação

Commit `8f8cdd0ad70275a6692ac070b3623dc8a810ec51`, imagem `easypanel/elolab/app:deploy-20261030-8f8cdd0`, rollback `deploy-20261030-85afcc0`. O container isolado confirmou `/healthz=ok` e o SHA esperado em `/version.json`; o domínio público confirmou os mesmos resultados e o Swarm ficou em 1/1. O código anterior foi preservado em `code.before-20261030-8f8cdd0`; o `.env` manteve o mesmo hash, sem leitura ou exposição. Não houve migration ou alteração de dados de produção. O rollout teve contenção transitória da porta host-mode, resolvida antes da confirmação pública.
