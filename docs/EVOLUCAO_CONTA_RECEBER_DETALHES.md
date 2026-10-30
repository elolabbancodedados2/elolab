# Conta a receber — detalhes e histórico

Data: 30/10/2026

## Diagnóstico

O comando “Ver Detalhes” abria um modal compacto com identificação, classificação, vencimento, valor e observações. O histórico de alterações era outro modal dentro desse contexto. Os pagamentos registrados e estornos não estavam visíveis na consulta da conta.

## Direção e implementação

O detalhe passou a ser a página protegida `/contas/receber/:lancamentoId/detalhes`, disponível aos mesmos perfis `admin` e `financeiro` da lista. O carregamento busca a conta por ID, clínica ativa e tipo receita; recupera apenas os dados básicos de identificação do paciente; e consulta pagamentos e a RPC de auditoria existente. A página apresenta saldo, estado, datas, classificação, pagamentos/estornos e mudanças de vencimento/valor/categoria/centro de custo em listas legíveis no mobile.

Os botões de recebimento e estorno encaminham às páginas existentes e mantêm URL, busca e categoria da lista no retorno. As telas e contratos financeiros, permissões, RPCs e dados persistidos foram preservados. O modal curto de confirmação de cancelamento continua na lista, pois confirma uma ação destrutiva.

## Validação

- Playwright de detalhe: 2/2, incluindo navegação a partir da lista filtrada, retorno com busca preservada, leitura limitada à clínica, histórico com autor/antes/depois, retentativa após falha, ações e ausência de modal.
- Playwright financeiro relacionado: detalhe e contas a pagar, 9/9.
- Vitest: breadcrumbs e histórico, 31/31.
- TypeScript, `npm run check:a11y`, ESLint focal e `git diff --check` passaram; ESLint sem avisos novos na página.
- Capturas renderizadas de 390 px e 1440 px foram inspecionadas. A navegação inferior não cobre o fim do histórico. Nenhuma gravação real foi executada.

## Publicação

Commit `ccc8ee894d442f6bd73cbd4141a03e25ea8b76b9`; imagem `easypanel/elolab/app:deploy-20261030-ccc8ee8`; rollback `deploy-20261030-66a7606`. O smoke isolado e o domínio público confirmaram `/healthz=ok` e o SHA integral em `/version.json`; o Swarm está com 1/1 réplica ativa. Durante a troca houve uma disputa transitória de porta host-mode, resolvida quando o Swarm convergiu. Nenhuma migration ou alteração de dados de produção.

Sem migration, alteração de dados, exercício real de recebimento/estorno, validação autenticada de RLS em produção ou ensaio manual com leitor de tela.
