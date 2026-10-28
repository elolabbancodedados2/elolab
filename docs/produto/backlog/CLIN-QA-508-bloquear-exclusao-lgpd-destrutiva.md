# CLIN-QA-508: Bloquear a exclusão LGPD destrutiva e registrar o pedido para tratamento manual

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-004 (307), contenção 7.3 |
| Gravidade | P0 |
| Impacto | Clínico e jurídico. A exclusão apagava prontuário, prescrições, exames e anexos em laço não transacional |
| Perfil | Administrador da clínica ou encarregado de dados (DPO) em `/lgpd-pacientes` |
| Esforço | S |
| Dono sugerido | `backend-developer` (biblioteca) + `frontend-developer` (tela); `qa-engineer` |
| Dependências | Nenhuma de banco |
| Status | Feito localmente (27/10, após a rodada 2) |

## Contexto
`deletePatientData` apagava sete tabelas em sequência no cliente. Em caso de falha, seguia e avisava "exclusão incompleta" depois de já ter apagado. Apagar prontuário conflita com a guarda legal (Lei 13.787/2018, requer avaliação jurídica).

## Evidência
- Diagnóstico D.1 #7: `src/lib/lgpdCompliance.ts:134-142,170-189`; chamada em `src/pages/LgpdPacientes.tsx:70`.
- Worktree: `src/lib/lgpdCompliance.ts:136` (`EXCLUSAO_LGPD_DESTRUTIVA_HABILITADA = false`) e `:138-145` (`ExclusaoLgpdBloqueadaError`).

## Proposta
Constante desligada e erro antes de qualquer acesso ao banco; a tela troca "Apagar" por "Solicitar exclusão" e grava o pedido como tarefa urgente vinculada ao paciente.

## Critérios de aceite
- **CA1 (caminho principal).** Dado um administrador da clínica A em `/lgpd-pacientes`, quando solicita a exclusão de um paciente da clínica A, então surge uma tarefa urgente "Solicitação LGPD de exclusão" vinculada ao paciente, e prontuário, prescrições, exames, triagens, anexos, agendamentos e cadastro continuam com as mesmas contagens.
- **CA2 (nenhum caminho destrutivo).** Dado o código da UI, quando se procura por `deletePatientData` em `src/pages` e `src/components`, então não há chamada.
- **CA3 (bloqueio na biblioteca).** Dada uma chamada direta a `deletePatientData`, quando executada, então lança `ExclusaoLgpdBloqueadaError` sem nenhuma consulta ao banco (teste com cliente simulado que falha se for chamado).
- **CA4 (outra clínica).** Dado um administrador da clínica A, quando tenta registrar pedido para um paciente da clínica B (por identificador forjado), então a tarefa não é criada na clínica B nem vinculada ao paciente da B.
- **CA5 (permissão negada).** Dado um usuário sem papel de administrador ou DPO (por exemplo, recepção ou médico), quando abre `/lgpd-pacientes` ou tenta registrar o pedido, então o acesso é negado pela rota e pela RLS de `tarefas`.
- **CA6 (erro).** Dada falha ao gravar a tarefa, quando ocorre, então a tela mostra a mensagem traduzida de `src/lib/erros.ts` e nada é apagado.
- **CA7 (texto).** O diálogo não promete exclusão; explica que o pedido fica registrado para o encarregado. Tom formal, sem exclamação.

## Definição de pronto
DoD comum, mais: `src/lib/__tests__/lgpdCompliance.test.ts` cobrindo CA3; passo 1 do roteiro do QA (ESTAB-7D) executado em homologação com paciente sintético e contagens anexadas.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **testado localmente (E2)**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- `src/lib/lgpdCompliance.ts:141`: `EXCLUSAO_LGPD_DESTRUTIVA_HABILITADA = false` (grep do PO em 27/10). Na rodada 2 o tech-lead separou a trava da anonimização (`:165`, também `false`), e a tela `src/pages/LgpdPacientes.tsx` só exporta e registra o pedido.
- Reexecutado pelo PO: `npx vitest run` com `lgpdExclusaoBloqueada`, `lgpdAnonimizacao`, `lgpdAnonimizacaoIntegracao` e mais três arquivos → 6 arquivos, 82 de 82 passaram.
- Ressalva: o pedido ainda vira registro em `tarefas`, visível a todos os papéis (conflito 3 da rodada 1, 574 da segurança). A história 538 trata o registro único.

### O que falta
- Verificação completa da rodada (tech-lead, `TAREFAS-C`).
- Build publicado sem caminho para `deletePatientData` (gate C3).

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
