# CLIN-QA-535: Atendimento de convênio não vira dívida do paciente nem receita em dobro

| Campo | Valor |
|---|---|
| Item de origem | Lacuna L-FC-01 do business-analyst (`docs/produto/processos/faturamento-convenio.md:187`) |
| Gravidade | P1 (cobrança errada), **hipótese forte**. Confirmar em homologação antes de priorizar a correção |
| Impacto | Comercial e operacional. Paciente de convênio cobrado ou bloqueado na fila; receita contada duas vezes no financeiro |
| Perfil | Recepção (check-in), financeiro (conciliação do lote) |
| Esforço | M |
| Dono sugerido | `qa-engineer` (reprodução), depois `database-engineer` e `backend-developer` |
| Dependências | 518 (homologação) para a reprodução |
| Status | Aberto (27/10, criada na rodada 2) |

## Contexto
No check-in de convênio, a cobrança vira receita pendente do paciente, sem `convenio_id` nem pagador. Quando o lote retorna, outra receita (`convenio_repasse`) é criada. Se a clínica exige pagamento prévio, o paciente de convênio pode ficar bloqueado.

## Evidência (E1, business-analyst, rodada 1; não reconferida pelo PO)
- `supabase/migrations/20261001140000_checkin_rollback_condicional.sql:221-227`
- `supabase/migrations/20261008370000_conciliar_retorno_tiss_no_fluxo_financeiro.sql:109-120`
- `src/pages/Fila.tsx:285-312`

## Critérios de aceite
- **CA1 (caminho principal).** Dado um agendamento de convênio na clínica A, quando a recepção faz o check-in, então a cobrança fica com o convênio como pagador e não aparece como dívida do paciente.
- **CA2 (retorno do lote).** Dado o retorno do lote com esse atendimento, quando o financeiro concilia, então a receita é uma só, sem lançamento duplicado.
- **CA3 (pagamento prévio exigido).** Dada a regra de pagamento prévio ligada, quando o paciente é de convênio, então ele não é bloqueado na fila.
- **CA4 (erro).** Dado um convênio sem dados obrigatórios, quando o check-in roda, então o erro aparece traduzido e o check-in não fica pela metade.
- **CA5 (permissão negada).** Dado um perfil sem acesso ao financeiro, quando consulta os lançamentos de convênio, então é negado.
- **CA6 (outra clínica).** Dado um lote da clínica B, quando o financeiro da A concilia, então nenhum lançamento da B é criado ou alterado.

## Definição de pronto
DoD comum, mais: roteiro de reprodução executado em homologação antes da correção; teste de banco de CA1 a CA3; não alterar `pagamentos_mercadopago` nem a cobrança de planos.
