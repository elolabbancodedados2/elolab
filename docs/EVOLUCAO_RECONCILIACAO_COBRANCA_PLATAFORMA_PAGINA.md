# Plataforma — reconciliação de cobrança em página própria

## Diagnóstico atual

A justificativa e a decisão para uma tentativa divergente eram preenchidas em um diálogo na carteira de assinaturas. O contexto da tentativa e a trilha de retorno ficavam separados da tarefa.

## Direção e implementação

- A rota `/admin/cobrancas/reconciliar/:origem/:attemptId` carrega a tentativa pela consulta da plataforma e exibe clínica/responsável, tipo, estado, valor, data e detalhe reportado.
- Se a tentativa não estiver mais entre as divergentes ou não estiver na consulta atual, a página bloqueia o envio e oferece retorno/atualização.
- Busca e filtro retornam preservados. A justificativa segue obrigatória, agora com validação explícita de 10 a 500 caracteres, proteção de alterações não salvas e bloqueio de envio duplicado.
- A chamada `platform_reconciliar_cobranca` e suas resoluções foram mantidas. A ação altera somente o registro local da EloLab e grava a auditoria; a tela avisa que não chama o Mercado Pago.
- Checkout, credenciais, migrations e o módulo financeiro de pacientes não foram alterados.

## Validação

Playwright sintético 1/1 e teste de componente 2/2 passaram, cobrindo URL própria, ausência de diálogo, preservação de filtros, aviso ao sair, payload da mesma RPC, responsividade desktop/mobile e ação final acima da navegação inferior. TypeScript, build, acessibilidade, permissões, falhas silenciosas, colunas e `git diff --check` passaram. Capturas desktop e mobile foram inspecionadas. ESLint sem erros; cinco avisos `no-explicit-any` permanecem no arquivo legado.

Todas as chamadas financeiras do teste foram interceptadas; nenhuma cobrança real foi reconciliada e não houve chamada ao gateway. Nenhuma migration foi aplicada.

Commit `3f85b856b21781c7f03655c3a9885164831ff329`; imagem `easypanel/elolab/app:deploy-20261030-3f85b85`; rollback `deploy-20261030-a96ed3f`. Smoke isolado, `/healthz`, `/version.json`, domínios `app.elolab.com.br` e `elolab.com.br`, Swarm 1/1, fonte anterior e hash do ambiente foram conferidos.
