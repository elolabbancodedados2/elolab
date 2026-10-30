# Solicitação de restauração de backup em página própria

**Data:** 30/10/2026
**Rota:** `/admin/backups/restaurar`

## Diagnóstico

A solicitação exigia escolher um arquivo de backup e justificar uma ação crítica em um modal. A confirmação deveria deixar claro que o pedido depende de um segundo administrador e não executa uma restauração.

## Implementação

- O formulário agora ocupa uma página dedicada com o arquivo, data, tamanho, justificativa e consequência operacional visíveis.
- O nome do arquivo é mantido no estado de navegação, sem expor o nome na URL ou em armazenamento local. Se a navegação direta ou recarga perder a seleção, a página orienta escolher novamente o arquivo.
- Foram preservados o escopo de plataforma, a validação de 20 a 1.000 caracteres, a RPC `platform_request_restore`, o escopo completo e a aprovação independente.
- O pedido não salva enquanto a justificativa estiver inválida. Rascunho tem proteção de saída e envio simultâneo é bloqueado.
- Aprovação e rejeição continuam com confirmação curta. Não foi automatizada a restauração destrutiva.

## Validação e publicação

Playwright sintético 1/1, teste de componente 2/2, TypeScript, build, acessibilidade, permissões, falhas silenciosas, colunas e diff check passaram. A captura mobile foi inspecionada: sem overflow horizontal, e o botão de envio fica acima da navegação inferior. A RPC foi interceptada; nenhuma restauração ou gravação real foi realizada. ESLint sem erros, com quatro avisos `no-explicit-any` existentes.

Commit `a96ed3f25aaa5e549fb04d26b14f71366d2252ab`; imagem `easypanel/elolab/app:deploy-20261030-a96ed3f`; rollback `deploy-20261030-9cf95b8`. `/healthz` respondeu 200 nos domínios do app e raiz, `/version.json` publicou o SHA esperado e o Swarm permaneceu 1/1. O hash da configuração de ambiente permaneceu igual. Nenhuma migration foi aplicada.

## Limitação operacional conhecida

A aprovação ainda não executa nem comprova uma restauração completa de banco e objetos. Procedimento, responsável, resultado auditável e ensaio isolado de recuperação continuam sendo trabalho operacional separado.
