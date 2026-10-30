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

Commit e imagem serão registrados após o rollout e a confirmação pública da versão.
