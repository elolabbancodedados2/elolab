# Estorno de pagamento a partir da ficha do paciente

## Diagnóstico

Na aba Financeiro da ficha, a lista de pagamentos abria um diálogo para estornar. O overlay interrompia a leitura do extrato e escondia o contexto da cobrança durante uma operação auditável. Já existia uma página de estorno para Contas a Receber, mas ela não mantinha o contexto da ficha nem selecionava o pagamento acionado.

## Direção e implementação

- A ação agora abre `/pacientes/:patientId/cobrancas/:lancamentoId/estorno` em página própria.
- A rota mantém os perfis `admin` e `recepcao` da ação contextual existente. Enfermagem continua sem acesso ao estorno.
- A página confirma que a receita pertence à clínica ativa e que `paciente_id` corresponde ao paciente da rota. A tentativa de usar uma cobrança de outra pessoa é bloqueada com orientação clara.
- O pagamento escolhido fica pré-selecionado. Motivo e confirmação continuam obrigatórios; em caso de falha da RPC, o texto permanece disponível para correção.
- A RPC existente `estornar_pagamento`, os parâmetros, a trilha de auditoria e as invalidações financeiras foram preservados. Nenhum contrato ou regra do backend foi alterado.
- Cancelar ou concluir retorna à aba Financeiro da mesma ficha, com a posição de rolagem restaurada. O breadcrumb não mostra IDs internos da cobrança.

## Validação

- Playwright: 5/5 cenários da página e da regressão de Contas a Receber passaram. Cobrem retorno e scroll, pagamento pré-selecionado, erro da RPC, cobrança de outro paciente e perfil sem permissão; as escritas foram interceptadas.
- TypeScript sem erros; build de produção concluído.
- Acessibilidade, permissões, falhas silenciosas e colunas do banco passaram.
- ESLint focal sem erros; 55 avisos preexistentes de `any` em `Pacientes.tsx` (54) e `PagamentosDaCobranca.tsx` (1).
- As telas renderizadas em mobile (390 px) e desktop (1440 px) foram inspecionadas. No mobile, a ação principal permanece acima da navegação inferior e não há overflow horizontal.
- Nenhum pagamento real foi estornado; não houve migration nem escrita em dados de produção.

## Publicação

Commit `5b603fa525ac516630d513b16af024b7576ee22a`; imagem `easypanel/elolab/app:deploy-20261030-5b603fa`; rollback `deploy-20261030-7205376`. O container isolado respondeu `/healthz=ok` e publicou o SHA esperado em `/version.json`. `app.elolab.com.br` e `elolab.com.br` responderam `ok` e serviram o mesmo SHA. Swarm ficou em 1/1. A fonte anterior está preservada em `/etc/easypanel/projects/elolab/app/code.before-20261030-5b603fa`. O hash do `.env` permaneceu `f2bcf73f6d860dec143ae363f755d3d18e41dc2f3ea3919944af62899c2f3b65`, conferido sem ler ou exibir os valores.

## Continuidade

Esta entrega integra o estorno à ficha do paciente; não encerra a auditoria do módulo Financeiro nem a sequência de páginas próprias. Continuam pendentes a auditoria de conciliação, repasses, faturamento, indicadores e as demais jornadas registradas em `SEQUENCIA_PAGINAS_OPERACIONAIS.md`.
