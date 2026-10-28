# CLIN-QA-534: Papéis por clínica (`membros_unidade`) no lugar do papel global

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-008 (202), médio prazo; ligado ao CLIN-QA-024 (multiunidade, P2) |
| Gravidade | P1 (bloqueio estrutural das redes) |
| Impacto | Segurança e comercial. Com `user_roles` sem clínica, um usuário em duas clínicas tem o mesmo papel nas duas, e não há papel por unidade |
| Perfil | Gestor de rede; profissional que atende em mais de uma clínica |
| Esforço | L |
| Dono sugerido | `software-architect` (ADR 0001) + `database-engineer` |
| Dependências | ADR 0001 (rodada 1); CLIN-QA-510 e CLIN-QA-511 verdes; CLIN-QA-517 (deploy controlado); CLIN-QA-519 |
| Status | Aberto (27/10, após a rodada 2) |

## Evidência
- `user_roles` com `UNIQUE(user_id, role)` e sem `clinica_id`: `20260131002504…sql:43-50` (diagnóstico D.1 #4).

## Critérios de aceite
- **CA1 (caminho principal).** Dado um usuário médico na clínica A e recepcionista na clínica B, quando trabalha na A, então tem só as permissões de médico, e na B só as de recepção.
- **CA2 (outra clínica).** Dado um admin da clínica A, quando acessa dados da B (sem vínculo), então pgTAP confirma que não lê nem escreve nada da B.
- **CA3 (permissão negada).** Dado um usuário removido da clínica A, quando faz a próxima requisição, então perde o acesso à A imediatamente, sem afetar a B.
- **CA4 (compatibilidade).** Durante o expand/contract, quando as helpers forem reescritas, então a suíte de isolamento e RBAC continua verde em cada passo.
- **CA5 (erro).** Dada uma migração de dados de papéis que falha, quando ocorre, então nada muda (transação) e os papéis antigos continuam valendo.
- **CA6 (desempenho).** As policies usam `(select auth.uid())` e índices por `clinica_id`; `EXPLAIN` mostra InitPlan nas tabelas críticas.

## Definição de pronto
DoD comum, mais: pgTAP A × B verde no CI; plano de expand/contract com rollback por etapa; aplicação só com autorização e backup.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **aberto**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- A ADR 0001 está escrita (rodada 1) e aguarda aprovação do responsável. Só começa depois do gate S2.

### O que falta
- Aprovação da ADR 0001 e a 510 verde.

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
