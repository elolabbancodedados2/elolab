# Histórico de alterações das contas a pagar

## Diagnóstico atual

O histórico era carregado dentro de um diálogo aberto a partir da lista de contas a pagar. A tabela apresentava autor, data e valores anteriores e atuais, mas cobria a lista durante a consulta e não tinha endereço próprio.

## Direção e implementação

- A ação agora abre `/contas/pagar/:lancamentoId/historico`, em uma tela somente de leitura.
- O cabeçalho identifica a conta e resume valor e vencimento atuais; abaixo, uma tabela mostra data, autor, campo, valor anterior e valor novo.
- Estados de carregamento, erro recuperável e histórico vazio são explícitos.
- A conta é validada por ID, clínica ativa e tipo `despesa` antes da RPC existente consultar a trilha.
- A rota mantém os perfis `admin` e `financeiro`; a autorização e o escopo da RPC existente não foram alterados.
- A volta preserva URL, estado de navegação, busca textual e filtros da lista. O identificador interno não aparece no breadcrumb.
- Nenhum dado financeiro é criado ou alterado por esta tela.

## Validação

- Playwright sintético: 3/3 — leitura autorizada, bloqueio da trilha para conta fora da clínica e recuperação após falha.
- Vitest relacionado: 38/38; TypeScript sem erros.
- Verificações de acessibilidade, permissões e colunas passaram.
- Capturas desktop e mobile foram inspecionadas; a tabela adapta as linhas em telas estreitas e não cria rolagem horizontal da página.

## Limites

Esta entrega cobre o histórico de alterações de contas a pagar. A auditoria dos demais detalhes e ações financeiras e a revisão integral dos módulos ainda continuam.

## Publicação

- Commit publicado: `a74e6d00da6c445e7eed9cdd740c0d764144396a` (`deploy-20261030-a74e6d0`).
- Smoke isolado: `healthz=ok`; `version.json` retornou o SHA completo esperado.
- `https://app.elolab.com.br` e `https://elolab.com.br`: `healthz=ok`; ambos retornaram o SHA esperado.
- Swarm: `elolab_app` está `1/1`, com atualização `completed`.
- O hash do `.env` permaneceu `f2bcf73f6d860dec143ae363f755d3d18e41dc2f3ea3919944af62899c2f3b65`.
- Backup da versão anterior: `code.before-20261030-a74e6d0`.
- Rollback disponível: imagem `easypanel/elolab/app:deploy-20261030-b70884`.
