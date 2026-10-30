# Histórico de faturas em página própria

## Diagnóstico

O histórico da assinatura EloLab era aberto em um diálogo alto, com tabela e rolagem próprias. Isso escondia a página de Plano, não oferecia endereço recuperável e tornava a consulta ruim em telas estreitas.

## Jornada e implementação

- A rota administrativa `/configuracoes/plano/faturas` apresenta os eventos da assinatura.
- A ação “Ver histórico de faturas” na aba Plano abre essa página; “Voltar ao plano” retorna a `/configuracoes?tab=plano`.
- Desktop usa tabela; mobile usa uma lista legível sem rolagem horizontal.
- Carregamento, erro com nova tentativa e lista vazia possuem estados separados.
- A página informa que exibe até 50 eventos recentes e distingue essa cobrança do financeiro de pacientes.

## Integrações preservadas

- Consulta somente de leitura pela RPC existente `historico_cobranca_assinatura`, com `p_limit: 50`.
- A rota continua limitada a `admin`.
- Nenhuma regra de checkout, cobrança, assinatura, migration ou API foi alterada.
- Nenhuma tabela de finanças de pacientes (`pagamentos_mercadopago`, `lancamentos`) foi acessada ou alterada.

## Arquivos

- `src/pages/ConfiguracaoFaturasPage.tsx`
- `src/pages/Configuracoes.tsx`
- `src/App.tsx`
- `src/config/routeLabels.ts`
- `src/lib/__tests__/subscriptionBillingHistory.test.ts`
- `tests/configuration-history-page.spec.ts`

## Validação

Playwright 4/4 e Vitest 3/3 passaram; build, acessibilidade, permissões, falhas silenciosas e colunas passaram. ESLint sem erros, com 12 avisos já existentes em `Configuracoes.tsx`. A captura renderizada foi inspecionada em desktop e mobile. Os testes usaram respostas sintéticas e interceptaram a RPC; nenhuma cobrança real foi consultada ou alterada.

`npx tsc --noEmit -p tsconfig.app.json` ainda acusa 10 erros em 7 arquivos fora desta alteração (`RevisaoDuplicidadesPacientesPage.test.tsx` e páginas TISS/conta a pagar). O build de produção foi concluído.

## Publicação

Commit `d99ee0ef9586ce71ebe3de428d7bb27c40708a50`; imagem ativa `easypanel/elolab/app:deploy-20261030-d99ee0ef`; rollback `deploy-20261030-57a7425`. O smoke isolado e o domínio público responderam `/healthz=ok`; `/version.json` confirmou o SHA integral e o Swarm ficou em 1/1. A primeira imagem do rollout tinha um build ID divergente e foi substituída antes de promover a fonte; a imagem final publica o SHA exato do commit. A fonte anterior foi preservada em `code.before-20261030-d99ee0ef`. O hash do `.env` permaneceu `f2bcf73f6d860dec143ae363f755d3d18e41dc2f3ea3919944af62899c2f3b65`, sem leitura ou exposição do conteúdo. Nenhuma migration ou escrita de dados foi realizada. A disputa transitória da porta host-mode se resolveu antes da confirmação final.
