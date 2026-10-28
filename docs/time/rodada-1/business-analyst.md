# Rodada 1: business-analyst

Data: 27/10/2026. Base: worktree `admin-finance-realtime`, branch `feat/recepcao-painel-dia-melhorias`, com alterações locais não commitadas de outra frente.

## O que fiz

Documentei AS-IS e TO-BE de três processos, com regras extraídas do código (`caminho:linha`), casos de borda, critérios de aceite, visão multiunidade e lacunas numeradas.

1. **Identificação do paciente nos canais públicos** (link de agendamento e WhatsApp). O documento já existia de uma execução interrompida. Conferi por amostragem as linhas de `public-booking/index.ts` (159, 190-248, 268) e de `whatsapp-webhook/index.ts` (693, 737, 1037, 1141-1149), e elas batem com o arquivo atual. Corrigi L-ID-05 (a pendência vence no mesmo dia, mas não escala) e indiquei as lacunas que o backlog já cobre (CLIN-QA-504 a 507 e 526).
2. **Exclusão e anonimização LGPD**: novo. Cobre o estado antes da contenção, o worktree (exclusão suspensa, pedido vira tarefa), a RPC proposta pelo `backend-developer` (não aplicada) e o TO-BE.
3. **Faturamento de convênio** (autorização, lote, retorno, glosa e recurso): novo, com glossário do processo.

## Arquivos tocados

- `docs/produto/processos/identificacao-paciente-canais-publicos.md` (completado: 3 edições pontuais)
- `docs/produto/processos/lgpd-exclusao-anonimizacao.md` (novo)
- `docs/produto/processos/faturamento-convenio.md` (novo)
- `docs/time/rodada-1/business-analyst.md` (este resumo)

Não editei código nem migrations.

## Evidências

Só leitura de código e grep. Nada executado em navegador nem contra banco: todos os fluxos estão como NÃO EXECUTADO.

Achados novos mais relevantes, todos por leitura:

| Achado | Evidência | Situação |
|---|---|---|
| A cobrança do check-in de convênio vira receita **pendente do paciente**, sem `convenio_id` nem pagador; o retorno do lote cria outra receita (`convenio_repasse`). Possível receita em dobro e bloqueio do paciente de convênio quando o pagamento prévio é exigido | `supabase/migrations/20261001140000_checkin_rollback_condicional.sql:221-227`; `20261008370000_conciliar_retorno_tiss_no_fluxo_financeiro.sql:109-120`; `src/pages/Fila.tsx:285-312` | Hipótese forte, NÃO VERIFICADO em execução. Sugiro P1 |
| O lote é digitado (quantidade e valor), sem vínculo com atendimentos. Lote não é editável nem cancelável; `rejeitado`, `cancelado` (lote) e `cancelada` (glosa) são inalcançáveis | `20260818040000_lotes_tiss_e_glosas.sql:1-38`; `20261011090001_tiss_gravacoes_controladas.sql:5,120-147` | Confirmado por leitura |
| Não há tela para registrar a resposta da autorização de convênio | Nenhum `update` em `autorizacoes_convenio` em `src` (grep) | Confirmado por leitura |
| A validade da carteira nunca é conferida | `validade_carteira` só em `Pacientes.tsx` e tipos (grep) | Confirmado por leitura |
| O consentimento do portal grava `consent_type = 'tratamento_dados'`, que viola o CHECK de `lgpd_consent_log`, e o erro não é verificado | `patient-portal/index.ts:267-274` × `20260729140000_tabelas_lgpd_de_verdade.sql:39` | Hipótese forte, NÃO VERIFICADO em execução |
| Pedido de exclusão fica em `tarefas`, fora do log com prazo; os demais pedidos do titular são decididos pelo admin da **plataforma** | `src/lib/lgpdCompliance.ts:151-183`; `20261008200000_auditar_decisoes_de_solicitacoes_lgpd.sql:20` | Confirmado por leitura. Quem decide requer avaliação especializada |
| No fluxo antigo, o gatilho que protege o cadastro com histórico só age no último passo: um paciente com financeiro podia perder prontuário e exames e manter o cadastro | `lgpdCompliance.ts:204-252` + `20261007200000_preservar_historico_ao_excluir_paciente.sql:15-43` | Hipótese por leitura (reforça o P0 CLIN-QA-004) |
| A RPC de anonimização proposta não limpa `agendamentos.observacoes`, onde o link público grava nome, telefone e e-mail | `20261028100000_lgpd_anonimizacao_transacional.sql:182-250` × `public-booking/index.ts:268` | Confirmado por leitura. Ajuste pequeno antes de aplicar |

## Riscos

- As linhas de `src/lib/lgpdCompliance.ts` podem mudar: o `tech-lead` está editando o arquivo.
- O estado de produção não foi verificado. As três contenções (canais públicos e exclusão LGPD) existem só no worktree.
- O achado da receita em dobro depende de como as clínicas operam (baixa com a forma "Convênio" em `ContasReceber.tsx:79`). Precisa de execução em homologação antes de virar P1 definitivo.
- `docs/produto/dominio/requisitos-regulatorios.md` ainda não existia quando conferi. Os pontos de TISS e LGPD estão marcados como "requer avaliação especializada".

## Próximo dono

- `product-owner`: converter as lacunas em `CLIN-QA-5xx`. Prioridade sugerida: L-FC-01 (receita em dobro), L-LG-02 e L-LG-05 (circuito único de pedidos do titular), L-ID-02 e L-ID-03 (vínculo manual no WhatsApp e duplicata de cadastro sem CPF).
- `backend-developer`: L-LG-08 (CHECK do consentimento) e L-LG-09 (`agendamentos.observacoes` na anonimização).
- `especialista-dominio-saude` e DPO: retenção pós-anonimização, quem decide o pedido do titular, prazos TISS de envio e recurso, motivos de glosa e coparticipação.
- `qa-engineer`: critérios de aceite das seções 5.4 (identificação e LGPD) e 3.4 (faturamento).
