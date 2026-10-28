# CLIN-QA-515: Landing não promete código de barras, que não existe

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-013 (105), ação 7.6 |
| Gravidade | P1 |
| Impacto | Comercial e clínico. Promessa falsa ao laboratório; quem compra por isso troca amostra com leitura manual |
| Perfil | Visitante da landing (gestor de laboratório) |
| Esforço | S |
| Dono sugerido | `growth-marketing` (texto) com `product-designer`; `frontend-developer` aplica |
| Dependências | Nenhuma |
| Status | Aberto (27/10, após a rodada 2) |

## Contexto
A FAQ da landing diz que o módulo de laboratório tem "rastreabilidade de amostras por código de barras". A etiqueta imprime o código em texto monoespaçado e não há biblioteca de código de barras.

## Evidência
- `src/pages/LandingPage.tsx:209` (resposta da FAQ "O EloLab atende laboratórios também?"), conferido nesta rodada.
- `src/pages/MapaColeta.tsx:346-347`: etiqueta com `<div class="code">` em texto.

## Critérios de aceite
- **CA1 (caminho principal).** Dada a landing publicada, quando se procura por "código de barras", "barcode", "QR" e "leitor", então nenhuma frase promete o recurso como existente.
- **CA2 (texto fiel).** Dada a FAQ de laboratório, quando lida, então descreve o que existe (mapa de coleta, etiqueta com código da amostra em texto, laudo com liberação protegida) em tom formal, sem exclamação.
- **CA3 (outras promessas).** Dada a revisão produto × landing, quando o PO confere as promessas de TISS, ICP-Brasil, multiunidade e odontograma, então nenhuma aparece como pronta.
- **CA4 (outra clínica e permissão).** Não se aplica: página pública sem dado de clínica e sem controle de acesso.
- **CA5 (erro).** Não se aplica: mudança só de texto. A página continua renderizando sem erro no console.

## Definição de pronto
DoD comum (partes de UI), mais: grep de CA1 anexado; captura da FAQ anexada; nenhuma regressão de mojibake (grep não aumenta em relação ao HEAD).

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **aberto**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- `src/pages/LandingPage.tsx:209` ainda promete "rastreabilidade de amostras por código de barras" (grep do PO em 27/10).
- O growth-marketing (rodada 1) achou mais duas divergências na landing: ICP-Brasil via Memed (`:146`) e a FAQ sem os limites de usuários dos planos (`:212-213`, ver 540).

### O que falta
- Corrigir `:209` e `:146` (frontend-developer e growth-marketing). O arquivo tem alterações locais de outra frente.

### Critérios acrescentados na rodada 2
- **CA-R2.** Dada a landing publicada, quando se procura por "código de barras" e por "ICP-Brasil", então não há promessa sem a funcionalidade correspondente.

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
