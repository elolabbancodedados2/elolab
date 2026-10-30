# Salas nas Configurações encaminhadas ao workspace próprio

## Diagnóstico

Configurações mantinha uma segunda gestão simplificada de salas com cadastro, edição e exclusão em diálogos. O produto já tinha o workspace `/gestao-fluxo?tab=salas`, com cadastro próprio, ocupação, disponibilidade e relação com a lista de espera. A duplicidade separava ações que precisam compartilhar o estado real da sala.

## Jornada e decisões

- A aba “Salas” em Configurações agora apresenta o contexto e encaminha para o workspace existente.
- Cadastro, edição, ocupação e disponibilidade continuam em Salas e Leitos.
- A tela duplicada de quatro campos e seu CRUD foram removidos de Configurações.

## Integrações preservadas

- O workspace continua usando as páginas `/gestao-fluxo/salas/nova` e `/gestao-fluxo/salas/:roomId/editar` já implementadas.
- Papéis e regras de acesso da rota existente não mudaram (`admin` e `recepcao`).
- Nenhum contrato, registro ou permissão foi alterado.

## Arquivos

- `src/pages/Configuracoes.tsx`
- `tests/configuration-history-page.spec.ts`

## Validação

Playwright 1/1, TypeScript, build, acessibilidade, permissões, falhas silenciosas, colunas e ESLint focal passaram. A tela mobile renderizada do workspace foi inspecionada; o teste interceptou o backend sintético e não gravou dados reais.

## Publicação

Commit `57a7425df9fd13ac8b7b9973c7a03bf46fa316aa`; imagem `easypanel/elolab/app:deploy-20261030-57a7425`; rollback `deploy-20261030-8f8cdd0`. O smoke isolado e o domínio público responderam `/healthz=ok` e `/version.json` confirmou o SHA integral. O Swarm ficou em 1/1. A fonte anterior foi preservada em `code.before-20261030-57a7425`; o hash do `.env` permaneceu `f2bcf73f6d860dec143ae363f755d3d18e41dc2f3ea3919944af62899c2f3b65`, sem ler ou exibir seu conteúdo. Nenhuma migration ou escrita de dados foi realizada. Durante a atualização houve contenção temporária da porta host-mode; o Swarm estabilizou e a nova versão foi confirmada publicamente.
