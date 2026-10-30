# Caixa diário: histórico e reabertura em páginas próprias

Data: 30/10/2026  
Código publicado: `df095a7f2dc89511de9080444fcee2f249535a46`

## Diagnóstico

A consulta de caixa anterior abria um diálogo rolável com resumo, movimentos, exportação, impressão e trilha de auditoria. A reabertura do caixa encerrado também era um diálogo, embora exija justificativa longa e registre uma transição financeira auditável.

## Implementação

- `/recepcao/caixa/historico/:caixaId` é um workspace de consulta. Busca caixa e movimentos no escopo da clínica ativa, mostra resumo, tabela adaptável, observações e eventos de abertura/fechamento, permite imprimir e exportar CSV e direciona um caixa ainda aberto à página existente de fechamento. O CSV protege texto iniciado por caracteres que planilhas podem interpretar como fórmula.
- `/recepcao/caixa/reabrir` mostra o estado confirmado do caixa diário e exige justificativa entre 10 e 500 caracteres. A rota exige `admin` ou `financeiro`, mantém a RPC `reabrir_caixa_diario` e registra que a reabertura preserva o evento de fechamento anterior.
- Antes da RPC, a tela reconfirma se o caixa do dia está fechado. Se a resposta se perder, consulta o registro persistido e reconhece que já está aberto antes de permitir repetição, evitando uma segunda reabertura. Em sucesso, invalida consultas de caixa/recepção/histórico e atualiza o estado local já usado pela recepção.
- A lista histórica mantém o retorno à aba de histórico. O resumo do dia e as confirmações curtas de exclusão continuam no caixa diário.

Não foram alteradas permissões de backend, RPCs, contratos, tabelas, migrations ou dados financeiros reais.

## Validação

- Playwright: 3/3 fluxos com clínica sintética. Cobriu isolamento da consulta por clínica, perfil de recepção sem ação de reabertura, erro com formulário preservado e payload idêntico na nova tentativa, além da confirmação persistida após perda simulada de resposta sem repetir a RPC.
- TypeScript, `npm run check:a11y` e `git diff --check` passaram. ESLint sem erros; dois avisos `any` permanecem no arquivo legado `CaixaDiario.tsx`.
- Capturas renderizadas foram inspecionadas em 390 px e 1440 px. O histórico apresenta a tabela em blocos legíveis no celular; a ação de reabertura permanece acima da navegação inferior depois da rolagem.
- As gravações do E2E foram interceptadas com dados sintéticos. Não foi feita operação financeira real, validação de RLS numa sessão de produção nem avaliação manual por leitor de tela.

## Publicação

- Imagem: `easypanel/elolab/app:deploy-20261030-df095a7`.
- O container novo passou em `/healthz` e confirmou o SHA integral em `/version.json` antes da troca. Depois da atualização, o serviço Swarm convergiu para 1/1 réplica; `/healthz` permaneceu `ok` e o domínio público confirmou a revisão publicada.
- Rollback preservado: `easypanel/elolab/app:deploy-20261030-ef6509b`.
- Nenhuma migration, alteração de banco, nem mudança nos secrets/configuração de produção.

## Continuidade

Esta entrega conclui a consulta histórica e a reabertura do caixa, não a etapa financeira inteira nem a auditoria integral do EloLab. Continuam para auditoria as edições de lançamentos do caixa, as demais operações de pagamentos/contas, conciliação, faturamento e tarefas das etapas 9, 10 e 12.
