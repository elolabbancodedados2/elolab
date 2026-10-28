# CLIN-QA-526: CPF mascarado nas telas, com revelação auditada

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-012 (401) |
| Gravidade | P1 |
| Impacto | LGPD. CPF completo exposto sem necessidade em telas de uso diário |
| Perfil | Recepção, médico, financeiro |
| Esforço | M |
| Dono sugerido | `frontend-developer` + `backend-developer` (registro de auditoria); DPO (regra) |
| Dependências | CLIN-QA-524 |
| Status | Aberto (parcial) (27/10, após a rodada 2) |

## Evidência
- `src/pages/Prontuarios.tsx:2076`: CPF exibido sem máscara (conferido nesta rodada).

## Critérios de aceite
- **CA1 (caminho principal).** Dada a faixa de identificação, quando aparece, então o CPF vem como `***.***.***-12`.
- **CA2 (revelação).** Dado um usuário com permissão, quando clica em "Mostrar CPF", então o número aparece por tempo limitado e fica registrado em auditoria (usuário, paciente, data, tela).
- **CA3 (permissão negada).** Dado um perfil sem permissão de ver CPF completo (definido pelo DPO, por exemplo laboratório), quando tenta revelar, então a ação não aparece e o servidor não devolve o número completo.
- **CA4 (outra clínica).** Dado um paciente da clínica B, quando um usuário da A tenta revelar por identificador, então é negado e nada é registrado como revelado.
- **CA5 (erro).** Dada falha ao gravar a auditoria, quando ocorre, então o CPF não é revelado.

## Definição de pronto
DoD comum, mais: teste de CA2 a CA5; lista das telas que mostram CPF (grep) anexada, com o estado de cada uma.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **aberto**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- A máscara já está no componente da 524: o CPF completo não entra no DOM (teste do componente). A revelação auditada não existe.

### O que falta
- Revelação com registro em auditoria (frontend e backend).

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
