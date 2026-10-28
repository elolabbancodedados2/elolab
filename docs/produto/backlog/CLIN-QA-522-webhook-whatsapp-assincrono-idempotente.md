# CLIN-QA-522: Webhook do WhatsApp responde em menos de 1 s e processa em fila, sem resposta duplicada

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-009 (207, 217, 115), ação 30.6 |
| Gravidade | P1 |
| Impacto | Clínico e de experiência. A IA síncrona estoura o tempo, o Evolution reenvia o evento e o paciente recebe a resposta duas vezes, podendo gerar ação duplicada |
| Perfil | Paciente no WhatsApp; recepção |
| Esforço | M |
| Dono sugerido | `backend-developer`; `database-engineer` (tabela de jobs) |
| Dependências | ADR 0003, fila de jobs (rodada 1, `software-architect`); CLIN-QA-505 |
| Status | Aberto (27/10, após a rodada 2) |

## Evidência
- `supabase/functions/whatsapp-webhook/index.ts:410`: chamada a `https://api.openai.com/v1/responses` dentro do request (conferido nesta rodada).
- Idempotência por `message_id` existe (diagnóstico seção C, "Reversão e concorrência"); o efeito sob latência é SÓ RELATADO.

## Critérios de aceite
- **CA1 (caminho principal).** Dada uma mensagem do paciente, quando o webhook a recebe, então responde 200 em menos de 1 s (p95 medido em staging) e a resposta do bot chega depois, pela fila.
- **CA2 (reenvio).** Dado o mesmo evento reenviado 3 vezes, quando processado, então o paciente recebe uma resposta só, e no máximo um agendamento é criado.
- **CA3 (outra clínica).** Dado um job da instância da clínica A, quando processado, então lê e grava só dados da clínica A, mesmo que o corpo traga identificador da B.
- **CA4 (permissão negada).** Dada uma requisição sem token válido, quando chega, então é recusada antes de entrar na fila.
- **CA5 (erro e DLQ).** Dada falha do provedor de IA, quando o job falha N vezes, então vai para o estado `dead`, a conversa passa para `aguardando_humano` e o paciente recebe mensagem formal de que será atendido por uma pessoa.
- **CA6 (ordem).** Dadas duas mensagens seguidas da mesma conversa, quando processadas, então as respostas saem na ordem das mensagens.

## Definição de pronto
DoD comum, mais: teste de idempotência automatizado; medição de p95 em staging anexada.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **aberto**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- Sem correção. A ADR 0003 (fila de jobs) aguarda aprovação do responsável.

### O que falta
- Aprovação da ADR 0003.

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
