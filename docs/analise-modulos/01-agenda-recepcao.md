# Módulo 1: Agenda + Recepção

Análise de 03/11/2026, feita sobre `origin/main` `aa8387f3`, com os prints da clínica sintética em computador e celular.

## Situação atual

- ~45 rotas e ~30 telas. O menu "Atendimento" tem Agenda, Recepção, Caixa Diário, Fila e triagem, Salas e lista de espera, Retornos.
- Arquivos grandes:
  - `Recepcao.tsx`: 2684 linhas, 43 `useState`, 3 telas no mesmo arquivo (quadro, encaixe e recebimento), sem teste unitário.
  - `Fila.tsx`: 1396 linhas.
  - `AgendaPage.tsx`: 1273 linhas.
- A Recepção chama as etapas de Check-in / Balcão / Atendimento / Concluído e a Fila, de Aguardando / Triagem / Em atendimento / Finalizado.
- O cartão da Agenda mostra o código cru de `aguardando_triagem`, `em_triagem` e `fila_atendimento` (`AppointmentCard.tsx:28-56,123`).
- As listas de status "encerrado" divergem (`pacienteFicha.ts:171`, `filaPorData.ts:7`).
- Funções que já existem:
  - lembretes de 24h e 2h, e agente de WhatsApp que confirma e cancela;
  - série recorrente e encaixe;
  - lista de espera com sugestão de vaga;
  - visão com vários médicos e aviso de conflito de sala;
  - agendamento online e painel de TV com voz;
  - indicador de espera e "Chamar próximo".

## Escopo aprovado (03/11)

Os itens mais importantes vêm primeiro.

1. **Status centralizado** (`src/lib/agendamentoStatus.ts`). Uma só fonte de rótulo, cor, grupo (a confirmar / na clínica / encerrado) e etapa da recepção para cada status permitido pelo banco. Substitui as cópias espalhadas:
   - `agendaStatus.ts`, `AppointmentCard.tsx:28`, `auditAppointmentChanges.ts:24`, `FinalizarAtendimento.tsx:45`;
   - `checkinValidacao.ts:24`, `filaPorData.ts:7`, `BarraHorario.tsx:25`, `resumoDiaAgenda.ts:4`, `DailyMultiDoctorView.tsx:66`;
   - `STATUS_FINALIZADO` em `analyticsKpis.ts:1`, `Analytics.tsx:38` e `Relatorios.tsx:87`.

   Mudam apenas os rótulos. Os valores gravados no banco continuam iguais.
   *Aceite:* um teste percorre todos os status do CHECK/trigger do banco e exige rótulo e cor para cada um. Nenhum cartão mostra código com `_`.
2. **Ações únicas da Recepção** (`acoesDaEtapa(item)`): ação principal e ações secundárias por etapa, usadas pelo quadro, pela lista e pela linha do tempo. Hoje existem duas versões: `boardActionFor` em `Recepcao.tsx:717-752` e os botões do JSX em `:2328-2570`.
   *Aceite:* as 3 visões mostram as mesmas ações para o mesmo paciente.
   Antes, criar testes de caracterização de `patientStep` (`receptionWorkflow.ts:46`). Esse status hoje devolve -1 para `pago`, `aguardando_pagamento` e `aguardando_triagem` sem item na fila, e o paciente some do quadro. Corrigir para que ele apareça na etapa correta.
3. **Confirmações com o estado do lembrete e confirmação em lote** (`AgendaConfirmacoesPage.tsx`).
   - Cada linha mostra o estado do lembrete: enviado, respondeu ou sem resposta, vindo de `notification_queue` e da resposta do agente.
   - Filtro "sem resposta".
   - Seleção com "Confirmar selecionadas" e a trava `updated_at`, informando quais falharam.
4. **Vocabulário único.** Agenda, Recepção e Fila usam os mesmos nomes de etapa e de ação, com o glossário em um único arquivo.
   - "Enviar para a fila" vira "Fazer check-in" (`useAcoesConsulta.tsx:299`), porque a ação faz check-in e gera cobrança.
   - A etapa "Atendimento" da Recepção abre `/fila` já filtrada.
5. **Fechar o dia**, ou faltas em lote, na Recepção. Um diálogo lista quem não chegou depois do horário mais a tolerância e marca falta só nos selecionados. Quem já chegou ou foi atendido nunca entra na lista. O `autoMarcarFaltasHoje` de `workflowAutomation.ts`, hoje morto, pode ser reaproveitado ou removido.
6. **Retorno grátis com prazo configurável por tipo de consulta.**
   - Nova coluna em `tipos_consulta`, `prazo_retorno_dias integer` (padrão 30, `NULL` significa sem prazo).
   - O retorno é grátis só dentro do prazo, contado da última consulta paga com o mesmo médico. Fora do prazo, o aviso aparece ao agendar e no check-in, e a cobrança é feita.
   - Hoje `autoBilling.ts:366-380` dá retorno grátis sem prazo.
   - Exige migration (só no repositório, sem aplicar), formulário de tipos de consulta e testes.
   - Não alterar `lancamentos` nem `pagamentos_mercadopago` além da regra de decisão.
7. **Ajustes pequenos de interface**:
   - Celular da Recepção: retirar os 4 cartões de KPI, que repetem a faixa de etapas, e mostrar busca e lista primeiro. Os chips de etapa não podem ficar cortados (`Recepcao.tsx:1919-1922`).
   - Celular da Agenda: Médicos, Status, ⋯ e Legenda ficam numa folha "Filtros (n)". O estado vazio ganha o botão "Nova consulta" (`AgendaPage.tsx:104`).
   - Computador da Agenda: retirar o seletor de data duplicado e o segundo botão de criar (`PainelNovoAgendamento.tsx:49`). Num dia vazio, sombrear o expediente e os bloqueios.
   - Paciente concluído: a ação principal passa a ser "Agendar retorno" (já com médico e tipo retorno) em vez de "Reagendar" (`Recepcao.tsx:723,2549`).
   - Fila: trocar o aviso âmbar fixo "Tempo real indisponível" por "Atualizado há Xs", com o detalhe no tooltip (`filaRealtimeStatus.ts:11`).
   - Cache do caixa: usar uma chave só (`caixa-hoje`). `Recepcao.tsx:1335,1385` invalida `['caixa-diario']`, que não existe. Retirar o polling de 10 s quando houver realtime (`Recepcao.tsx:537`).
   - "Minha fila" passa a se chamar "Minhas tarefas", mantendo a rota.

## Fora deste lote

- Encaixe controlado no mesmo horário: altera a constraint `agendamentos_sem_sobreposicao`.
- Divisão completa de `Recepcao.tsx` em arquivos.
- Separar Salas da lista de espera no menu.
- Itens já planejados nas listas 700: oferecer vaga cancelada à lista de espera, totem/QR, pré-consulta, pacotes, sinal via Pix, senha diária, tempos e alerta da fila, .ics.
