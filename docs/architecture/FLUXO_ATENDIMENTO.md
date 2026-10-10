# Fluxo de Atendimento — EloLab

> Este documento descreve o fluxo **implementado e ativo** no código. O fluxo
> antigo (pagamento após a consulta, status `pagamento_confirmado`) foi
> substituído pelo pagamento antecipado; este arquivo é a fonte atual.

## Visão geral

O pagamento acontece **antes** da consulta. Cada transição relevante é feita por
RPC atômica no banco (`realizar_checkin`, `registrar_pagamento`,
`iniciar_atendimento_atomico`, `finalizar_atendimento_atomico`) — idempotentes e
com `FOR UPDATE`, para que clique duplo, refresh no meio ou duas recepcionistas
simultâneas não corrompam o estado.

```
PACIENTE CHEGA
      │
      ├─ tem agendamento ──────────────┐
      │                                ▼
      │   PASSO 1 — CHECK-IN (Recepção)
      │   • RPC realizar_checkin: fila_atendimento('aguardando') +
      │     agendamento → 'aguardando' e prioridade da fila, na mesma transação
      │   • cria a cobrança pendente (preço do tipo de consulta/exame)
      │   • Recepção, Fila e Agenda compartilham a confirmação da cobrança;
      │     se uma nova cobrança falhar, o check-in é desfeito
      │   • requer caixa aberto
      │
      └─ sem agendamento ── ENCAIXE (Recepção)
          • "Encaixe sem agendamento": busca o paciente, médico e tipo,
            cria a consulta de hoje/agora e faz o check-in na sequência

      ▼
PASSO 2 — BALCÃO / PAGAMENTO (Recepção)
  • RPC registrar_pagamento: transação única, idempotente por tentativa
  • Valor / Já pago / Saldo na tela; pagamento dividido e parcial aceitos
  • Parcial NÃO libera a consulta: o saldo fica visível
  • "Chamar ao Balcão" grava status 'chamado' na fila → o Painel TV
    anuncia na sala de espera (chime + voz)
  • Quitado → agendamento 'pago'
      ▼
[TRIAGEM — opcional por clínica, desligada por padrão]
  • clinicas.exigir_triagem;Manchester com prazo-alvo visível (30 min...)
  • urgente entra no topo da fila; trigger exige triagem antes do atendimento
      ▼
PASSO 3 — FILA DO PROFISSIONAL (Fila de Atendimento)
  • Quem deve/pede triagem aparece em seção própria com o motivo — não some
  • Chamar → grava status 'chamado' + sala_id (do agendamento) →
    Painel TV anuncia "Maria S., dirija-se à Sala 1"
  • Iniciar → RPC iniciar_atendimento_atomico → 'em_atendimento'
  • EMERGÊNCIA COM SALDO? "Liberar" com justificativa obrigatória
    (grava liberado_sem_pagamento com autor e horário)
      ▼
PASSO 4 — ATENDIMENTO (Prontuários)
  • SOAP, CID-10, prescrição, procedimentos
  • Procedimento lançado na consulta vira item da conta; se a clínica usa a
    trava, o fechamento deixa saldo a cobrar no balcão
      ▼
PASSO 5 — FINALIZAÇÃO (com pergunta de retorno)
  • RPC finalizar_atendimento_atomico: faturamento + fila + retorno
    na MESMA transação
  • "Este paciente volta?" — perguntado em TODAS as vias de finalização:
    Fila, Recepção, Agenda e AtendimentosEmAberto
      ▼
PASSO 6 — PÓS-CONSULTA (Balcão / Recepção)
  • Saldo adicional, reagendamento, retorno, exames, prontuário
  • "Concluir" encerra o ciclo (fila → 'concluido')
```

## Responsabilidades por tela

| Tela | Papel |
|---|---|
| **Recepção** | Check-in, encaixe sem agendamento, pagamento, chamar ao balcão, pós-consulta, concluir |
| **Fila de Atendimento** | Visão do profissional: chamar, iniciar, finalizar (com retorno), liberar com justificativa |
| **Triagem** | Sinais vitais, Manchester, IMC — quando a clínica ligar |
| **Painel TV** | Chamadas em tempo real (nome reduzido — LGPD), fila de espera, mídia institucional |
| **Agenda** | Criar/reagendar/cancelar (cancelar remove a fila), iniciar e finalizar pela via da agenda |
| **Retornos** | KPIs, agendar/remarcar/realizar (com confirmação e reabertura), lembretes 7 e 1 dia antes |

## Estados do agendamento (produzidos pelo fluxo)

`agendado → confirmado → aguardando (check-in) → pago → em_atendimento →
finalizado → (concluido na fila)` · cancelado / faltou por desistência ·
`aguardando_pagamento_adicional` quando a trava está ligada e ficou saldo —
pagar o adicional devolve o agendamento a `finalizado`.

## Liberação excepcional (trava ligada)

Emergência sem pagamento ou sem triagem: botão **Liberar** na seção
correspondente da Fila, com justificativa obrigatória (mín. 5 caracteres).
Fica registrado quem liberou, quando e por quê — o banco exige
(migration 20260814210000).

## Configuração

**Configurações → Fluxo do Atendimento** (somente o titular da conta):
- `exigir_pagamento_previo` — trava de pagamento antes da consulta
- `exigir_triagem` — triagem obrigatória entre balcão e fila
