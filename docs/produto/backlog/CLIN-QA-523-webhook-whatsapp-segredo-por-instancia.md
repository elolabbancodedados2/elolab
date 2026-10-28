# CLIN-QA-523: Webhook do WhatsApp com segredo por instância e comparação em tempo constante

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-009 (316, 217) |
| Gravidade | P1 |
| Impacto | Segurança. Uma chave global aceita evento de qualquer instância: quem tem a chave de uma clínica forja mensagens em outra |
| Perfil | Integração Evolution por clínica |
| Esforço | S |
| Dono sugerido | `backend-developer`; revisão do `security-engineer` |
| Dependências | Nenhuma obrigatória; combinar com a CLIN-QA-522 |
| Status | Aberto (27/10, após a rodada 2) |

## Evidência
- `supabase/functions/whatsapp-webhook/index.ts:40-46` (conferido nesta rodada): token lido de `apikey`, `x-webhook-token` ou `Authorization` e comparado com `!==` a uma chave global (`evolutionApiKey`).

## Critérios de aceite
- **CA1 (caminho principal).** Dada a instância da clínica A com seu segredo, quando o evento chega com esse segredo, então é aceito.
- **CA2 (outra clínica).** Dado o segredo da instância da clínica A, quando enviado num evento que declara a instância da clínica B, então é recusado (401) e nada é gravado.
- **CA3 (permissão negada).** Dado um evento sem token ou com token errado, quando chega, então é recusado com 401, sem detalhe do motivo.
- **CA4 (tempo constante).** A comparação usa função de tempo constante; teste unitário cobre tamanhos diferentes.
- **CA5 (rotação).** Dada a troca do segredo de uma instância, quando feita, então o antigo para de valer e as demais instâncias não são afetadas.
- **CA6 (sigilo).** O segredo é guardado em hash ou cifrado, nunca aparece em log nem na resposta.

## Definição de pronto
DoD comum, mais: testes de CA1 a CA4; runbook curto de rotação.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **aberto**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- Sem correção. A auditoria da rodada 2 confirma a chave global com comparação comum (`whatsapp-webhook/index.ts:45`, CLIN-QA-316). A citação `:38` do relatório 02 está desatualizada (conflito 10 da rodada 1).

### O que falta
- Segredo por instância e comparação em tempo constante (backend-developer).

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
