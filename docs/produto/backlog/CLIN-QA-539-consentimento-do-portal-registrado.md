# CLIN-QA-539: O consentimento dado no portal fica registrado

| Campo | Valor |
|---|---|
| Item de origem | Lacuna L-LG-08 do business-analyst (`docs/produto/processos/lgpd-exclusao-anonimizacao.md:190`); relacionado ao 575 da segurança (aceite do link público sem registro) |
| Gravidade | P2 (prova de consentimento perdida) |
| Impacto | LGPD. A clínica não consegue provar o consentimento dado pelo paciente |
| Perfil | Paciente no portal; encarregado (DPO) |
| Esforço | S |
| Dono sugerido | `backend-developer` + `database-engineer` |
| Dependências | Nenhuma |
| Status | Aberto (27/10, criada na rodada 2) |

## Contexto
O portal aceita os tipos `tratamento_dados`, `compartilhamento_convenio` e `comunicacao_marketing` e grava o tipo recebido em `lgpd_consent_log`. A tabela só aceita `data_processing`, `marketing`, `third_party` e `revocation`. O erro do `insert` não é conferido.

## Evidência (E1, reconferida pelo PO em 27/10)
- `supabase/functions/patient-portal/index.ts:221` (lista de tipos em português) e `:243-250` (`insert` em `lgpd_consent_log` com `consent_type: tipo`, sem checar `error`).
- `supabase/migrations/20260729140000_tabelas_lgpd_de_verdade.sql:39`: `CHECK (consent_type IN ('data_processing', 'marketing', 'third_party', 'revocation'))`. Nenhuma migration posterior muda esse CHECK (`grep -ln consent_type supabase/migrations`).
- Falha em execução: NÃO VERIFICADO.

## Critérios de aceite
- **CA1 (caminho principal).** Dado um paciente que aceita o tratamento de dados no portal, quando confirma, então há uma linha em `lgpd_consent_log` com o tipo correspondente, a versão do termo, a data e o paciente.
- **CA2 (erro).** Dada uma falha ao gravar o registro, quando acontece, então o portal responde com erro traduzido e não informa sucesso.
- **CA3 (permissão negada).** Dado um token do portal inválido, quando tenta registrar consentimento, então recebe 401.
- **CA4 (outra clínica).** Dado o token de um paciente da clínica A, quando registra consentimento, então a linha fica com a clínica A, sem depender de valor enviado pelo cliente.

## Definição de pronto
DoD comum, mais: teste Deno do mapeamento de tipos e de CA2; teste de banco que insere cada tipo aceito.
