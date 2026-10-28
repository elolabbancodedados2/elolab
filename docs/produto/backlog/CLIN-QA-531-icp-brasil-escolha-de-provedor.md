# CLIN-QA-531: ICP-Brasil, escolha do provedor de assinatura em nuvem

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-011 (111, 214) |
| Gravidade | P1 (comercial) |
| Impacto | Comercial e clínico. Prescrição controlada, atestado, laudo e prontuário sem papel dependem de assinatura qualificada |
| Perfil | Médico; responsável técnico do laboratório |
| Esforço | S |
| Dono sugerido | `software-architect` + `especialista-dominio-saude`; decisão do responsável |
| Dependências | **Requer avaliação especializada** (jurídica e de certificação) |
| Status | Bloqueado por decisão do responsável (27/10, após a rodada 2) |

## Evidência
- `src/components/clinical/DigitalSignature.tsx:29-41` (conferido nesta rodada): o código declara que nenhuma assinatura ICP acontece; assinaturas novas são só `eletronica_simples`.

## Critérios de aceite
- **CA1 (comparação).** Dados ao menos dois provedores de certificado em nuvem com OAuth, quando comparados, então o documento registra formatos (PAdES, CAdES), custo por assinatura, SLA, sandbox e a data da consulta das fontes públicas.
- **CA2 (outra clínica).** A proposta garante que o certificado é do profissional, não da clínica, e que um profissional que atua em duas clínicas assina em cada uma sem que uma veja os documentos da outra.
- **CA3 (permissão).** A proposta define quem pode pedir assinatura (só o profissional dono do certificado) e que a recepção não assina em nome de ninguém.
- **CA4 (erro).** A proposta define o comportamento quando o provedor está fora do ar: o documento fica pendente de assinatura e não é marcado como assinado.
- **CA5 (honestidade).** Sem afirmação de validade jurídica antes do parecer; "requer avaliação especializada" registrado.

## Definição de pronto
Decisão do responsável registrada (ADR); história CLIN-QA-532 atualizada com o provedor escolhido.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **aberto**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- Sem escolha de provedor. O especialista registrou que gov.br é assinatura avançada, não qualificada (item 592).

### O que falta
- Avaliação especializada e escolha do provedor pelo responsável.

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
