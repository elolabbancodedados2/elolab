# CLIN-QA-514: PITR e restauração mensal de rotina

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-005 (309), ação 90.3 |
| Gravidade | P0 (risco latente; segunda fatia do 005) |
| Impacto | Clínico. Sem WAL contínuo, a perda máxima é de um dia de atendimento |
| Perfil | Responsável técnico; SRE |
| Esforço | M |
| Dono sugerido | `devops-sre` |
| Dependências | CLIN-QA-509 (backup off-site e chave fora da VPS) |
| Status | Aberto (27/10, após a rodada 2) |

## Contexto
O dump diário da CLIN-QA-509 resolve a perda da VPS, mas não o erro humano ou a corrupção no meio do dia. O diagnóstico pede RPO de até 5 min.

## Evidência
- Diagnóstico D.3, CLIN-QA-005: "PITR restaurado em timestamp escolhido (RPO ≤ 5 min)". Hoje não há WAL arquivado (SÓ RELATADO, SRE 1–3).

## Proposta
WAL-G ou pgBackRest com arquivamento contínuo no mesmo storage externo; restauração mensal agendada, com relatório.

## Critérios de aceite
- **CA1 (caminho principal).** Dado o arquivamento contínuo ativo, quando se restaura numa VM descartável para um horário escolhido, então o banco volta ao estado daquele horário, com perda de até 5 min, conferida por um registro sintético gravado antes e outro depois do alvo.
- **CA2 (rotina).** Dado o calendário mensal, quando o mês fecha, então existe um relatório de restauração com RTO, RPO e contagens.
- **CA3 (outra clínica).** Dado o banco restaurado, quando um usuário da clínica A consulta, então só vê dados da A.
- **CA4 (permissão negada).** Dada a credencial da aplicação ou de qualquer clínica, quando tenta ler o repositório de WAL, então é negada.
- **CA5 (erro).** Dado que o arquivamento para por mais de 15 min, quando isso acontece, então um alerta externo chega ao responsável.

## Definição de pronto
DoD comum, mais: runbook de PITR em `docs/operations/`; primeiro relatório anexado; nada instalado na VPS sem autorização.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **aberto**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- Sem trabalho nas rodadas 1 e 2. Depende da 509.

### O que falta
- Decisões D1 a D4 e o primeiro ensaio da 509.

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
