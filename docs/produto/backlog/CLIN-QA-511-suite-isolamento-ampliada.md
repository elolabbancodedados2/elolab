# CLIN-QA-511: Suíte de isolamento cobre `clinica_id` nulo, RPCs, Storage, Realtime, UPDATE e DELETE

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-002 (101, 305) |
| Gravidade | P0 (gate) |
| Impacto | Clínico. A suíte atual só testa leitura em tabelas e ignora linhas sem clínica |
| Perfil | Equipe de engenharia; todas as clínicas |
| Esforço | M |
| Dono sugerido | `qa-engineer`; revisão do `security-engineer` |
| Dependências | CLIN-QA-510 (banco efêmero no CI) |
| Status | Aberto (parcial) (27/10, após a rodada 2) |

## Contexto
`tests/isolamento-entre-clinicas.spec.ts:114` descarta `clinica_id` nulo com `.filter(Boolean)`. Uma linha sem clínica visível a todos passa como isolada. Não há casos para RPC, Storage, Realtime nem escrita cruzada.

## Evidência
- `tests/isolamento-entre-clinicas.spec.ts:114`: `linhas.map((linha) => linha.clinica_id).filter(Boolean)`.
- Diagnóstico D.3, CLIN-QA-002, proposta.

## Critérios de aceite
- **CA1 (`clinica_id` nulo).** Dada uma tabela sensível com uma linha de `clinica_id` nulo no seed, quando um usuário da clínica A consulta, então a suíte falha se a linha for devolvida.
- **CA2 (outra clínica, escrita).** Dado um usuário da clínica A, quando tenta `UPDATE` e `DELETE` em `pacientes`, `prontuarios`, `prescricoes`, `agendamentos` e `lancamentos` da clínica B, então zero linhas são afetadas e as contagens da B não mudam.
- **CA3 (outra clínica, RPC).** Dadas as RPCs autenticadas que recebem identificador de clínica, paciente ou agendamento, quando chamadas pela clínica A com identificador da B, então recusam ou devolvem vazio.
- **CA4 (outra clínica, Storage).** Dado um anexo de prontuário da clínica B, quando um usuário da A tenta baixar, listar ou criar URL assinada, então é negado.
- **CA5 (outra clínica, Realtime).** Dado um usuário da A inscrito em canais de tabelas sensíveis, quando a B insere uma linha, então o usuário da A não recebe o evento.
- **CA6 (permissão negada, anon).** Dada a anon key, quando acessa tabelas, Storage e RPCs fora da allowlist (CLIN-QA-502), então tudo é negado.
- **CA7 (erro do teste é falha).** Dado que um caso não consegue preparar o cenário, quando roda, então falha, não pula.

## Definição de pronto
DoD comum, mais: suíte executando no job da CLIN-QA-510; lista das tabelas, RPCs, buckets e canais cobertos versionada junto da suíte.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **correção escrita (E1)**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- A rodada 2 do QA cobriu parte dos critérios nas specs: pré-condição de linhas pela service role, escrita cruzada sobre linha real (CA2 parcial) e falha em vez de pulo no CI (CA7). `tests/isolamento-entre-clinicas.spec.ts:138` já relata linhas estranhas, inclusive com `clinica_id` nulo.
- CA1 (linha com `clinica_id` nulo no seed), CA3 (RPC), CA4 (Storage), CA5 (Realtime) e CA6 (anon em Storage e RPC) ainda não têm caso. Nada foi executado contra banco.

### O que falta
- Casos de CA1 e de CA3 a CA6 depois do primeiro run verde da 510.

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
