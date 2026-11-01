# Auditoria de fluxos e módulos: 31/10/2026

**Base:** main publicado (`b587dcd2`), com o PR #70 de teste ainda aberto.

**Método:**
- varredura por print das 78 rotas do menu, em 1440 e 390 (156 telas);
- leitura de código em quatro frentes: clínico, financeiro, gestão e transversal;
- conferência manual dos P0 no código.

**O que ficou de fora:** nenhum dado de produção foi alterado e não houve teste em aparelho real.

Legenda: **Banco** indica se precisa de migration ou RPC (e, portanto, de aprovação). ✔ = conferido manualmente no código.

## Visão geral

- **Telas:** nenhuma das 156 tem rolagem lateral, tela vazia ou erro. Só duas caixas informativas estão marcadas como `role="alert"` (Convites e Treinamento).
- **Auditoria de 29/10:**
  - Resolvidos: UX-01 (Agenda em página), UX-06 (proteção contra sair com alterações), UX-05 (Equipe e Estoque) e a maior parte de UX-04 (Financeiro).
  - Parcial: UX-03 (Prescrições e Atestados ainda em modal).
  - Seguem: FN-01 (TISS sem transmissão), FN-02 (backup) e FN-03 (LGPD só com exportação).
- **Isolamento entre clínicas:** nenhum vazamento encontrado no front.

## P0: erro de dado, dinheiro ou risco clínico

| # | Módulo | Problema | Evidência | Proposta | Banco |
|---|---|---|---|---|---|
| 1 | Fila / Agenda / Recepção | **Reclassificado para P2 em 31/10.** As regras "exigir triagem" e "exigir pagamento prévio" são aplicadas pelos triggers `triagem_antes_do_atendimento` e `pagamento_antes_do_atendimento` em `agendamentos` (migrations 20260814250000 e 20260814210000), seja qual for a tela que inicia o atendimento. Na Agenda e na Recepção o botão aparece e o clique devolve a mensagem do banco | `Fila.tsx:288-297`; `liberacaoTriagem.ts`; `liberacaoAtendimento.ts` | Opcional: mostrar o motivo antes do clique, como faz a Fila. Falta conferir em produção se os triggers estão ativos | Não |
| 2 ✔ | Caixa: despesa (**corrigido no PR da onda 1**) | `data_pagamento = new Date().toISOString()` (UTC). Depois das 21h, a despesa vai para o dia seguinte: em dinheiro é recusada ("caixa fechado"); nas outras formas some do caixa do dia e, no fim do mês, cai no mês seguinte no DRE | `CashOperationPage.tsx:165` | Usar `today` (já calculado na linha 109) | Não. Escreve em `lancamentos`, então precisa do seu ok |
| 3 | Atendimento (**aviso entregue no PR da onda 1 para médico e admin**) | Dá para finalizar o atendimento sem nenhuma evolução registrada | `FinalizarAtendimento.tsx:131-157` | Mostrar a situação da evolução (inexistente / rascunho / assinada) e pedir justificativa quando não houver | Sim para a recepção; não para médico/admin |
| 4 | Caixa: venda PDV | A venda não pode ser desfeita: não tem linha em `pagamentos`, então o estorno não a encontra; estoque e exames criados não voltam | `20261007210000:133-142`; `CaixaDiario.tsx:780` | RPC `estornar_venda_pdv` atômica, com devolução do estoque | Sim, mexe em `lancamentos` |
| 5 | TISS | O lote fica preso aos totais digitados na criação; se as guias não somarem exatamente aquilo, o envio é bloqueado | `20261011090001:5`; `20261024130000:160-208` | Recalcular quantidade e valor a partir das guias enquanto o lote estiver em rascunho | Sim |

## P1: atrito alto ou dado inconsistente

**Clínico**
- **Prontuário sem "Salvar e finalizar":** quem vem da Fila não tem como voltar a ela. Proposta: levar o `returnTo` e oferecer "Salvar e finalizar". Banco: não.
- **Retorno duplicado:** o retorno criado no prontuário não grava `agendamento_id`, e a finalização pede o prazo de novo. Banco: não.
- **Retorno não baixado:** o retorno não é marcado como realizado quando a consulta de retorno é finalizada. Banco: não para o paliativo; sim para a versão atômica.
- **Status sem volta:** não há como desfazer "faltou" nem um "iniciar" clicado no paciente errado. Proposta: transições de correção com motivo e auditoria. Banco: sim.
- **Documentos soltos:** exame, atestado e encaminhamento feitos pelos atalhos ficam sem vínculo com o atendimento. Banco: não para exames; sim para atestados e encaminhamentos.
- **Fuso na finalização (a confirmar):** `finalizar_atendimento_atomico` usa `current_date` para a data do retorno. Banco: sim.

**Financeiro**
- **Edição indevida no caixa:** o caixa deixa editar e excluir despesas que vieram de outros módulos (repasse, ajuste TISS). Banco: não.
- **Conta a pagar só com data de hoje:** o pagamento só pode ser registrado hoje e com caixa aberto, mesmo por transferência. Banco: sim, envolve `pagamentos`.
- **Saldos diferentes:** sangria e suprimento entram no saldo do Fluxo, mas não no Financeiro nem no DRE. Banco: não.
- **Convênio fora do fluxo:** lote enviado não aparece como "a receber" na projeção; o campo `prazo_retorno` do convênio não é usado. Banco: não com prazo fixo na tela.
- **Glosa sem fechamento:** pago + glosado pode passar do apresentado, e o valor recuperado não chega ao financeiro. Banco: sim.
- **Compra recebida:** não gera conta a pagar nem atualiza o custo. Banco: não para abrir a conta a pagar preenchida; sim para custo e lote.
- **"Cotar itens em falta":** ignora cotações e pedidos já abertos e duplica pedidos. Banco: não.

**Gestão**
- **Telas fora do menu:**
  - `/configuracoes-avancadas`, onde ficam o DPO, a retenção LGPD e as especialidades;
  - `/lgpd-pacientes`, que tem prazo legal;
  - `/admin/backups` e `/admin/dominios`.

  Banco: não.
- **Dashboard frágil:** a falha de qualquer uma das 9 consultas derruba a tela inteira (`Dashboard.tsx:778-782`). Banco: não.
- **Implantação com números diferentes:** o checklist do Dashboard tem 4 passos próprios e o onboarding usa outra RPC, com etapas diferentes. Banco: não.
- **Menu e assinatura:** o item "Notificações" leva a uma aba que só manda para Automações; o plano e a assinatura existem em duas telas, cada uma com seu próprio cancelamento. Banco: não.

**Transversal**
- **Primeira carga pesada:** o `manualChunks` usa `/node_modules/react` sem a barra no fim, e o React acabou no `charts-vendor`. Com isso, o recharts (109 KB gzip) entra na primeira carga de todas as telas, inclusive login (`vite.config.ts:20-32`).
- **Três E2E instáveis** (contas a pagar "loading", exportação LGPD, "doctor reopens"): verificações síncronas sobre requisições assíncronas. Proposta: `expect.poll` e respostas seguradas por Promise.
- **Polling global:** o Navbar consulta a cada 15 e 20 s em todas as telas e ignora o erro; a Recepção faz polling de 10 s com realtime ao mesmo tempo.
- **Consultas pesadas:** Analytics faz 9 consultas `select('*')` e agrega no navegador; Contas a pagar baixa todas as despesas.

## P2: melhorias

**Clínico**
- **Agenda:** aceita data passada sem aviso; falta trava contra duplo clique; não há consulta recorrente.
- **Lista de espera:** abre sempre às 09:00 em vez de sugerir a próxima vaga livre.
- **Triagem:** não pode ser corrigida depois de gravada; a mensagem de "atualizado para aguardando" aparece mesmo quando o paciente já estava na fila.
- **Laboratório:** a validade de lotes e reagentes é comparada em UTC.
- **Textos:** há acentos corrompidos (`Prontuarios.tsx:1971`).
- **Código morto:** `autoAgendarListaEspera`, `autoMarcarFaltasHoje`, `autoNotificarRetornos` e `autoIniciarAtendimento` em `workflowAutomation.ts`, alguns sem filtro de `clinica_id`.

**Financeiro**
- **Fechamento do caixa:** confere só dinheiro; poderia conferir cartão e Pix por forma.
- **Categorias:** as do caixa são texto livre, diferentes das de Contas a pagar, e caem como "sem conta" no DRE.
- **DRE:** só por caixa; poderia ter visão por competência.
- **Contas a receber:** o "Total" usa o valor bruto e não fecha com pendente + atrasado + pago.
- **Cobrança:** listada por lançamento, não por paciente.

**Gestão**
- **Aniversariantes:** falham em 29/02 (`Dashboard.tsx:551`).
- **Risco de faltas:** lista consultas de hoje que já passaram.
- **Perfis de acesso:** a matriz ignora os nomes personalizados dos perfis.
- **Indicadores:** repetidos em Analytics, Relatórios e Relacionamento.
- **Tarefas:** sobrepõem-se à Minha fila.
- **Feature flags:** não têm nenhum consumidor.

**Visual**
- 24 cartões de indicador pintados de preto.
- Resíduos do azul antigo: `#9CC7EC` (28), `#EEF4FA` (9) e `#1456C0` como cor padrão de sala e tipo de consulta.
- "Expirados 0" em vermelho em Convites.

**Acessibilidade**
- Cerca de 1.100 ícones sem `aria-hidden`.
- 21 botões de ícone com menos de 44 px.
- 337 textos de 8 a 10 px.

**Qualidade**
- Prontuarios.tsx (3.367 linhas), Pacientes, Recepcao e Exames sem teste unitário.
- `strict:false`.
- 296 usos de `supabase as any`.

## Enxugamento do menu (proposta)

- **Início:** Dashboard e Tarefas (Minha fila vira aba de Tarefas).
- **Gestão:** sai "Convites" (já é aba da Equipe) e "Baixo estoque" (é filtro do Estoque); entra "Privacidade (LGPD)".
- **Comunicação:** um item só, Automações, com a aba Fila de mensagens.
- **Relatórios:** de 5 itens para 3 (Relatórios, absorvendo Analytics e os salvos; Produtividade; Risco de faltas).
- **Configurações:** sai "Notificações"; o Plano fica num lugar só; as abas LGPD e Especialidades das Configurações avançadas passam para Configurações.
- **Plataforma:** CRM se funde com Clínicas; Visão geral se funde com Resumo do negócio; nasce o grupo "Operação" (Saúde, Erros, Filas, Backups, Consumo, Domínios, Incidentes).

## Plano de execução sugerido

**Onda 1: só front, sem banco, 1 PR por tema**
- **Correções:**
  - P0-2: data da despesa (aguarda seu ok, porque escreve em `lancamentos`);
  - P0-1: paliativo das regras de triagem e pagamento na Agenda e na Recepção;
  - aviso de "sem evolução" na finalização para médico e admin.
- **Atendimento:** "Salvar e finalizar" no prontuário, retorno sem duplicar e documentos vinculados (exames).
- **Gestão:** Dashboard tolerante a falhas, checklist unificado com o onboarding, aniversariantes em 29/02 e risco de faltas.
- **Menu e configurações:** telas órfãs no menu, enxugamento e plano em um lugar só.
- **Financeiro:** trava de edição de despesas de outros módulos no caixa, saldos coerentes e cotação sem duplicar.
- **Transversal:**
  - `manualChunks` corrigido;
  - os três E2E estabilizados;
  - Navbar sem polling;
  - limpeza visual (cartões pretos e azul antigo).

**Onda 2: precisa de banco e da sua aprovação**
- Regras de triagem e pagamento dentro do RPC.
- Estorno de venda PDV.
- Totais do lote TISS recalculados.
- Conciliação apresentado = pago + glosado.
- Transições de correção de status.
- Vínculo de atestados e encaminhamentos ao atendimento.
- Fuso nos RPCs.
- Conta a pagar com data retroativa.

**Onda 3: estrutural**
- Quebrar Prontuarios e Pacientes com `useQuery` e testes.
- Agregações no servidor (Analytics, Contas a pagar).
- `strict` gradual.

## Situação em 01/11/2026 (branch `feat/telas-concluir`)

O branch junta os PRs #71 a #75 da Onda 1 e acrescenta o que ainda dava para fazer sem banco.

**Feito, só front:**
- P0-1: Agenda e Recepção antecipam a triagem obrigatória. Na Agenda, "Iniciar atendimento" fica desabilitado com o motivo; na Recepção, a ação principal vira "Abrir triagem".
- Retorno baixado como realizado ao finalizar a consulta de retorno (via `marcar_retorno_realizado_atomico`, que já existe).
- Agenda: confirmação para data e hora já passadas e trava contra clique duplo ao salvar.
- Lista de espera: sugere a próxima vaga livre do médico (expediente, consultas e bloqueios dos próximos 14 dias).
- Triagem: a mensagem "atualizado para aguardando" só aparece quando o paciente entrou agora na fila.
- Laboratório: validade de lotes e reagentes comparada com o dia de São Paulo.
- Contas a receber: o total é a soma de em aberto, vencidas e recebido.
- Projeção do fluxo de caixa: lotes TISS enviados entram como receita prevista, pelo prazo de retorno do convênio.
- Plano e assinatura num lugar só: o Planos virou catálogo e o cancelamento, com motivo, ficou em Configurações → Plano.
- Menu enxuto: saem Minha fila, Convites e acessos, Itens com baixo estoque, Indicadores da clínica e Relatórios salvos. Todos continuam acessíveis por atalhos nas próprias telas.
- Visual: resíduos do azul antigo, cartões pretos do Início e do plano, Painel TV em grafite e paleta da Agenda com nomes certos.
- Textos: acentos corrompidos em telas e testes, e código morto em `workflowAutomation.ts`.

**Conferido e já resolvido antes:** UX-03 (Prescrições e Atestados não usam mais modal).

**Não feito, com o motivo:**
- Perfis de acesso com nomes personalizados: não existe nome personalizado de perfil no sistema.
- Categorias do caixa: a lista fixa identifica a origem das despesas (PR #75). O vínculo com o DRE é feito em DRE e plano de contas.
- Ícones sem `aria-hidden` (cerca de 1.100): troca em massa com risco alto e pouco ganho, porque SVG sem nome acessível já é ignorado pelos leitores de tela.
- Analytics e Contas a pagar com agregação no servidor: ficam na Onda 3, porque precisam de RPC.

**Continua dependendo de banco e de aprovação (Onda 2):** regras de triagem e pagamento dentro do RPC, estorno de venda PDV, totais do lote TISS, conciliação de glosa, correção de status com motivo, vínculo de atestado e encaminhamento, fuso nos RPCs e conta a pagar retroativa.
