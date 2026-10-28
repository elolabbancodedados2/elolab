# CLIN-QA-532: Assinatura ICP-Brasil (PAdES) de prontuário e receita

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-011 (111, 214), ação 90.2 |
| Gravidade | P1 (comercial) |
| Impacto | Comercial e clínico |
| Perfil | Médico |
| Esforço | L |
| Dono sugerido | `backend-developer` + `frontend-developer`; PO Clínico valida |
| Dependências | CLIN-QA-531; **requer avaliação especializada** |
| Status | Aberto (27/10, após a rodada 2) |

## Critérios de aceite
- **CA1 (caminho principal).** Dado um médico com certificado no provedor escolhido, quando assina uma receita, então o PDF gerado é validado como assinatura ICP-Brasil no Verificador do ITI, e o resultado fica anexado.
- **CA2 (prontuário).** Dado um registro de prontuário, quando assinado, então o documento fica imutável e a verificação de integridade existente continua valendo.
- **CA3 (outra clínica).** Dado um médico da clínica A, quando tenta assinar um documento de paciente da clínica B, então é negado.
- **CA4 (permissão negada).** Dado um usuário que não é o autor do documento, quando tenta assinar em nome do autor, então é negado; o método `icp-brasil` nunca é gravado sem assinatura real do provedor.
- **CA5 (erro).** Dada falha ou recusa do provedor, quando ocorre, então o documento fica "pendente de assinatura", com mensagem traduzida, e não aparece como assinado.
- **CA6 (honestidade).** Até o CA1 passar, nenhuma tela, landing ou material comercial cita ICP-Brasil como disponível.

## Definição de pronto
DoD comum, mais: comprovante do Verificador ITI para receita e para prontuário com dados sintéticos; parecer especializado anexado.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **aberto**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- Sem trabalho. Depende da 531.

### O que falta
- A 531.

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
