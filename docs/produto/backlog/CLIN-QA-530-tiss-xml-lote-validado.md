# CLIN-QA-530: Gerar o XML TISS do lote, validado pelo XSD da versão vigente

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-010 (110, 208), ação 90.1 |
| Gravidade | P1 (comercial) |
| Impacto | Comercial. Gate do segmento redes e de clínicas com convênio |
| Perfil | Faturista (financeiro) |
| Esforço | L |
| Dono sugerido | `backend-developer`; PO Faturamento valida |
| Dependências | CLIN-QA-529; fila de jobs (ADR 0003, CLIN-QA-030 no diagnóstico); **requer avaliação especializada** (ANS) |
| Status | Aberto (27/10, após a rodada 2) |

## Critérios de aceite
- **CA1 (caminho principal).** Dado um lote fechado da clínica A, quando o faturista gera o XML, então o arquivo valida sem erro no XSD oficial da versão registrada no lote, com o hash do epílogo correto, e fica guardado no storage da clínica.
- **CA2 (operadora piloto).** Dado o XML validado, quando enviado a uma operadora piloto, então é aceito, e o protocolo fica registrado.
- **CA3 (outra clínica).** Dado um faturista da clínica A, quando tenta gerar ou baixar o XML de um lote da clínica B, então é negado, e o arquivo da B não é acessível por URL.
- **CA4 (permissão negada).** Dado um médico ou recepção, quando tenta gerar o lote, então é negado.
- **CA5 (erro).** Dado um lote com campo obrigatório faltando, quando o faturista gera, então nada é emitido e a tela lista as guias e os campos a corrigir, em mensagens traduzidas.
- **CA6 (imutabilidade).** Dado um XML já emitido, quando o lote é alterado, então é preciso gerar uma nova versão; a anterior fica guardada.

## Definição de pronto
DoD comum, mais: teste automatizado que valida XMLs sintéticos contra o XSD no CI; aceite da operadora piloto anexado antes de qualquer promessa comercial.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **aberto**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- Sem trabalho. Depende da 529, da 594 (modelo de guia) e da fila de jobs.

### O que falta
- As dependências acima.

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
