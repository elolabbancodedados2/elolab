# Decisão de solicitação LGPD em página própria

**Data:** 30/10/2026
**Rota:** `/admin/lgpd/:requestId/decisao`

## Diagnóstico

A decisão de uma solicitação de titular era registrada em um modal sobre a fila, embora exigisse avaliar tipo, prazo, clínica, base legal, resultado e evidência. O formulário também podia conter justificativa sensível, que não deve aparecer na URL nem ser gravada em armazenamento local.

## Implementação

- A decisão agora tem página dedicada e contexto do caso, prazo, situação atual e lembrete de revisão de dados de saúde.
- A evidência permanece apenas em memória. O caminho da rota contém o identificador do pedido; a lista recupera busca e filtro ao voltar.
- A RPC `platform_update_lgpd_request`, o escopo de plataforma e a validação de 20 a 1.000 caracteres foram mantidos.
- Alteração não salva é protegida; caso ausente, erro, carregamento e pedido já decidido têm tratamento próprio.
- A configuração inline de retenção permaneceu no módulo; esta entrega migrou somente a decisão de solicitações.

## Validação e publicação

Playwright sintético 1/1, TypeScript, build de produção, acessibilidade, permissões, falhas silenciosas, colunas e diff check passaram. ESLint não apontou erros; houve cinco avisos `no-explicit-any` já existentes no arquivo. A tela mobile foi aberta e inspecionada. A gravação da RPC foi interceptada e nenhum dado real foi alterado.

Commit `9cf95b89d9799f500f707b37f41876ec0a438e0c`; imagem `easypanel/elolab/app:deploy-20261030-9cf95b8`; rollback `deploy-20261030-76c94c9`. `/healthz` respondeu 200, `/version.json` publicou o SHA esperado e o Swarm permaneceu 1/1. O hash da configuração de ambiente não mudou. Nenhuma migration foi aplicada.
