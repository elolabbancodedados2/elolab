# CLIN-QA-506: Consulta de agendamentos no WhatsApp devolve só data, hora e status

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-003 (103) |
| Gravidade | P0 (paciente errado expõe especialidade, que é dado de saúde) |
| Impacto | Clínico e LGPD. A especialidade do médico indica a condição de saúde do paciente |
| Perfil | Paciente no WhatsApp |
| Esforço | S |
| Dono sugerido | `backend-developer` |
| Dependências | CLIN-QA-505 |
| Status | Feito localmente (27/10, após a rodada 2) |

## Contexto
`consultar_agendamentos_paciente` buscava `medicos(crm, especialidade)`, contrariando o próprio comentário de `whatsapp-webhook/index.ts:334-335` (diagnóstico D.1 #6). Mesmo com a identificação certa, o dado não é necessário ao paciente pelo bot.

## Evidência
- Diagnóstico D.1 #6. Observação: no worktree, `whatsapp-webhook/index.ts:884` ainda monta a lista de horários livres com CRM e especialidade do médico. Isso é dado do profissional, não do paciente, e está fora deste item. Fica registrado para o PO decidir se o bot deve expor CRM.

## Critérios de aceite
- **CA1 (caminho principal).** Dado um paciente identificado (CLIN-QA-505) com dois agendamentos, quando pede "meus agendamentos", então o bot lista data, hora e status de cada um, sem CRM, especialidade nem nome do procedimento.
- **CA2 (sem identificação).** Dada uma conversa sem vínculo, quando o paciente pede os agendamentos, então nada é listado e o bot pede CPF e nascimento.
- **CA3 (outra clínica).** Dado um paciente identificado na clínica A que também tem agendamentos na clínica B, quando pede os agendamentos, então só os da clínica A aparecem.
- **CA4 (permissão negada).** Dado um agendamento cancelado ou de outro paciente, quando o paciente pede detalhes informando o identificador, então o bot não devolve nada sobre ele.
- **CA5 (erro).** Dada uma falha na consulta, quando ela ocorre, então o paciente recebe mensagem formal e nenhum dado parcial.

## Definição de pronto
DoD comum, mais: teste que confere o `select` da ferramenta (sem `crm` nem `especialidade`); passo 7 do roteiro do QA executado.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **correção escrita (E1)**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- Auditoria da rodada 2, seção 5: a consulta devolve só data, hora e status, e exige identificação (`whatsapp-webhook/index.ts:900-905`, `:937-944`). O contexto enviado à IA leva só o primeiro nome e as datas (`:321-350`).
- Sem teste automatizado próprio desta história.

### O que falta
- Teste que confira o formato da resposta.
- Publicação junto com a 505.

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
