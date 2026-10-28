# CLIN-QA-513: Anonimização LGPD transacional que preserva o prontuário

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-004 (307), ação 30.5 |
| Gravidade | P0 |
| Impacto | Clínico e jurídico. Atende o pedido do titular sem destruir o prontuário que a lei manda guardar |
| Perfil | Encarregado de dados (DPO) da clínica; administrador da clínica (segunda aprovação) |
| Esforço | M |
| Dono sugerido | `backend-developer` (RPC e cliente); `database-engineer` (revisão da migration); DPO (regra) |
| Dependências | Parecer jurídico sobre anonimização × guarda de 20 anos (Lei 13.787/2018, CFM): **requer avaliação especializada**. CLIN-QA-508 em produção. Incluir `deletion` no CHECK de `lgpd_access_request_log.request_type` (`supabase/migrations/20260729140000_tabelas_lgpd_de_verdade.sql:64`) |
| Status | Bloqueado por decisão do responsável (27/10, após a rodada 2) |

## Contexto
Hoje o pedido só vira tarefa manual (CLIN-QA-508). É preciso tratar o pedido no servidor, numa transação, mascarando identificadores e mantendo o conteúdo clínico.

## Evidência
- Laço destrutivo de referência: `src/lib/lgpdCompliance.ts` (bloqueado em `:136`).
- CHECK sem `deletion`: `supabase/migrations/20260729140000_tabelas_lgpd_de_verdade.sql:64` (citado no plano ESTAB-7D).

## Proposta
RPC `SECURITY DEFINER` com `search_path` fixo, checagem de `clinica_id`, sem `EXECUTE` para anon, que numa única transação mascara nome, CPF, contato e endereço, mantém prontuário, prescrições e exames, e grava o registro do pedido. Exige aprovação de dois usuários distintos.

## Critérios de aceite
- **CA1 (caminho principal).** Dado um pedido aprovado pelo DPO e por um administrador da clínica A, quando a RPC roda, então os identificadores do paciente ficam mascarados, as contagens de prontuários, prescrições, exames e anexos ficam iguais, e o pedido fica registrado como concluído.
- **CA2 (atomicidade).** Dada uma falha simulada no meio (por exemplo, exceção depois do primeiro UPDATE), quando a RPC roda, então nada muda e o pedido fica como "falhou", com o motivo.
- **CA3 (outra clínica).** Dado um usuário da clínica A, quando chama a RPC com um paciente da clínica B, então ela recusa e nada muda na B.
- **CA4 (permissão negada).** Dado um usuário sem papel de DPO ou administrador, ou a anon key, quando chama a RPC, então recebe erro de permissão.
- **CA5 (aprovação dupla).** Dado que o mesmo usuário tenta aprovar duas vezes, quando tenta, então a segunda aprovação é recusada.
- **CA6 (prontuário assinado).** Dado um prontuário assinado, quando a anonimização roda, então o hash e a verificação de integridade do documento assinado continuam válidos, ou a RPC recusa e explica. A regra é decidida no parecer.
- **CA7 (erro traduzido).** A tela mostra os erros de CA3 a CA5 com mensagens de `src/lib/erros.ts`.
- **CA8 (idempotência).** Dado um paciente já anonimizado, quando a RPC roda de novo, então não muda nada e informa que o pedido já foi tratado.

## Definição de pronto
DoD comum, mais: teste de banco com CA1 a CA5 e CA8; testes de `src/lib/lgpdAnonimizacao.ts`; parecer jurídico anexado antes de habilitar na tela; a constante da CLIN-QA-508 continua desligada (a anonimização é caminho novo, não reativa o DELETE).

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **correção escrita (E1)**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- A RPC `lgpd_anonimizar_paciente` está em `supabase/migrations/20261028100000_lgpd_anonimizacao_transacional.sql` e **nunca rodou em Postgres**.
- Na rodada 2 o tech-lead integrou a tela com a trava desligada: `ANONIMIZACAO_LGPD_HABILITADA = false` (`src/lib/lgpdCompliance.ts:165`) e o diálogo `src/components/lgpd/AnonimizarPacienteDialog.tsx`, com o nome do paciente e confirmação pelo nome. Testes reexecutados pelo PO dentro dos 82 de 82.
- A auditoria da rodada 2 abriu 578 (cópias de dado pessoal que sobram: tarefas sem paciente, `agendamentos.observacoes`, `audit_log` de agendamentos e `cpf_responsavel` de terceiros; é também a L-LG-09 do business-analyst) e 579 (operação irreversível sem `aal2`). O `search_path` está fora do padrão (`:95`).

### O que falta
- Parecer do DPO sobre a redação de `audit_log` e o escopo **[requer avaliação especializada]**.
- Trabalho do time que não depende de decisão: teste PGlite com falha simulada no meio, `search_path = ''`, `aal2`, aprovação dupla e as cópias da 578 (database-engineer e backend-developer).
- TL-R2-11: remover o parâmetro `habilitada` antes de ligar a trava.

### Critérios acrescentados na rodada 2
- **CA9 (MFA).** Dada uma sessão de administrador em AAL1, quando chama a anonimização, então a RPC recusa com erro traduzido que pede a verificação em duas etapas.
- **CA10 (aprovação dupla).** Dado um pedido de anonimização aberto por um administrador, quando o mesmo usuário tenta aprovar, então é negado; só um segundo administrador da mesma clínica aprova.
- **CA11 (cópias).** Dado um paciente com agendamento criado pelo link público, quando é anonimizado, então `agendamentos.observacoes`, a tarefa pendente correspondente e o `audit_log` desse agendamento não guardam mais nome, telefone nem e-mail.

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
