# CLIN-QA-538: Pedidos do titular LGPD num registro único, restrito e com prazo

| Campo | Valor |
|---|---|
| Item de origem | Lacunas L-LG-02 e L-LG-05 do business-analyst (`docs/produto/processos/lgpd-exclusao-anonimizacao.md:184`, `:187`); conflito 3 do consolidado da rodada 1; achado 574 da segurança |
| Gravidade | P1 **[requer avaliação especializada]** para quem decide o pedido |
| Impacto | LGPD. Pedido de exclusão sem prazo e visível a todos os papéis, com o motivo informado pelo paciente |
| Perfil | Administrador da clínica; encarregado (DPO); paciente no portal |
| Esforço | M |
| Dono sugerido | `database-engineer` (registro), `backend-developer`, `frontend-developer`; parecer do DPO |
| Dependências | 508; parecer do DPO sobre quem decide (clínica ou plataforma) |
| Status | Bloqueado por decisão do responsável (27/10, criada na rodada 2) |

## Contexto
Hoje o pedido de exclusão vira uma tarefa comum (`tarefas`), fora de `lgpd_access_request_log`, sem prazo e visível a todos. Os demais pedidos do titular são decididos pelo admin da plataforma, não pela clínica.

## Evidência (E1)
- `src/lib/lgpdCompliance.ts:151-152` (business-analyst; o arquivo mudou depois, linhas a reconferir).
- CHECK de `lgpd_access_request_log`: `supabase/migrations/20260729140000_tabelas_lgpd_de_verdade.sql:64`.
- Decisão pelo admin da plataforma: `supabase/migrations/20261008200000_auditar_decisoes_de_solicitacoes_lgpd.sql:20`.
- Tarefa do link público com nome, CPF mascarado, nascimento, telefone e e-mail (`supabase/functions/public-booking/index.ts:195-217`, achado 574).

## Critérios de aceite
- **CA1 (caminho principal).** Dado um pedido de exclusão, acesso ou correção, quando é aberto, então fica em um único registro LGPD com tipo, prazo legal e situação.
- **CA2 (tarefa sem dado pessoal).** Dado o pedido aberto, quando a tarefa de acompanhamento é criada, então ela leva só o identificador do pedido, sem nome, CPF, contato nem motivo.
- **CA3 (prazo).** Dado um pedido perto do prazo, quando faltam 3 dias, então o administrador e o encarregado são avisados.
- **CA4 (erro).** Dada uma falha ao gravar o pedido, quando acontece, então a tela mostra erro traduzido e nada é registrado pela metade.
- **CA5 (permissão negada).** Dado um perfil que não é administrador nem encarregado, quando tenta ver os pedidos, então é negado na tela e no banco.
- **CA6 (outra clínica).** Dado um pedido da clínica B, quando o administrador da A lista os pedidos, então não o vê.

## Definição de pronto
DoD comum, mais: teste de banco de CA5 e CA6; parecer do DPO anexado sobre quem decide e sobre os prazos.
