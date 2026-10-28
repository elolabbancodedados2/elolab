# CLIN-QA-533: Código de barras na etiqueta da amostra e leitura na coleta e na bancada

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-013 (105), ação 6m.5 |
| Gravidade | P1 |
| Impacto | Clínico. Leitura manual do código facilita a troca de amostra e de resultado |
| Perfil | Técnico de laboratório (coleta e bancada) |
| Esforço | M |
| Dono sugerido | `frontend-developer`; PO Laboratório valida; `especialista-dominio-saude` (rastreio) |
| Dependências | CLIN-QA-515 (a landing deixa de prometer antes). Requisitos de rastreio (RDC Anvisa): requer avaliação especializada |
| Status | Aberto (27/10, após a rodada 2) |

## Evidência
- `src/pages/MapaColeta.tsx:346-347` (conferido nesta rodada): a etiqueta imprime `codigo_amostra` como texto.

## Critérios de aceite
- **CA1 (caminho principal).** Dada uma amostra da clínica A, quando a etiqueta é impressa, então traz Code128 (ou QR) com o código da amostra, mais nome e data de nascimento do paciente em texto.
- **CA2 (leitura).** Dado um leitor USB de código de barras, quando o técnico lê a etiqueta na coleta ou na bancada, então abre a amostra correta, sem digitação.
- **CA3 (outra clínica).** Dada a etiqueta de uma amostra da clínica B, quando lida por um técnico da clínica A, então a tela mostra "Amostra não encontrada" e nada da B.
- **CA4 (permissão negada).** Dado um usuário sem perfil de laboratório, quando lê uma etiqueta, então não abre a tela de bancada.
- **CA5 (erro).** Dada uma leitura ilegível ou parcial, quando ocorre, então nada é aberto e a tela pede nova leitura.
- **CA6 (unicidade).** Dois códigos de amostra nunca coincidem dentro da clínica (restrição no banco).

## Definição de pronto
DoD comum, mais: teste da geração do código; teste em bancada com leitor real anexado (fotos sem dado real).

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **aberto**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- Sem trabalho. A etiqueta também não tem o número de registro do paciente (item 598 do especialista, RDC 978).

### O que falta
- Depende da 515.

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
