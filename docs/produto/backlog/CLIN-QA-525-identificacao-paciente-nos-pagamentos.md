# CLIN-QA-525: Identificação do paciente nos diálogos de pagamento da Recepção e do Caixa

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-012 (402, 403), ação 60.1 |
| Gravidade | P1 |
| Impacto | Financeiro e de confiança. Pagamento baixado na conta de outro paciente |
| Perfil | Recepção; financeiro (caixa) |
| Esforço | S |
| Dono sugerido | `frontend-developer`; `product-designer` |
| Dependências | Componente da CLIN-QA-524. `src/pages/Recepcao.tsx` e `src/pages/CaixaDiario.tsx` têm alterações de outra frente: integrar depois do commit dela |
| Status | Feito localmente (Recepção); caixa aberto (27/10, após a rodada 2) |

## Evidência
- `src/pages/Recepcao.tsx:1511-1521` (conferido nesta rodada): diálogo "Confirmar Pagamento" com descrição "Registre o pagamento do paciente.", sem o nome no cabeçalho. O conteúdo seguinte não foi lido por completo: NÃO VERIFICADO se o nome aparece mais abaixo.
- `src/pages/CaixaDiario.tsx:1611-1613`: diálogo "Ponto de Venda". Diagnóstico: SÓ RELATADO.

## Critérios de aceite
- **CA1 (caminho principal).** Dado um lançamento de um paciente, quando a recepção abre "Confirmar pagamento", então nome completo, data de nascimento e o valor aparecem no topo do diálogo, antes do botão de confirmar.
- **CA2 (caixa).** Dado o Ponto de Venda com paciente selecionado, quando o financeiro vai receber, então a identificação aparece da mesma forma; sem paciente selecionado, o recebimento vinculado a paciente fica bloqueado.
- **CA3 (outra clínica).** Dado um lançamento da clínica B, quando um usuário da clínica A tenta abri-lo por identificador, então nada aparece e nada é baixado.
- **CA4 (permissão negada).** Dado um usuário sem permissão financeira (por exemplo, médico ou laboratório), quando tenta abrir o diálogo, então o botão não aparece e a ação é negada no servidor.
- **CA5 (erro).** Dada falha ao confirmar, quando ocorre, então o diálogo mantém a identificação, mostra a mensagem traduzida e não registra pagamento parcial.
- **CA6 (CPF).** O CPF, se aparecer, é mascarado.

## Definição de pronto
DoD comum, mais: teste de componente dos dois diálogos; `check:a11y` e `check:falhas` passando.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **correção escrita (E1)**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- Rodada 2: o diálogo "Confirmar Pagamento" mostra `IdentificacaoPaciente` com `variante="dialogo"` e `contexto="cobranca"` logo abaixo do título (`src/pages/Recepcao.tsx:1528`, import em `:24`, conferido pelo PO). Cobre o 551 da UX (antigo 541). O frontend informa que o segundo diálogo citado na especificação não existe mais.
- Sem teste de tela da Recepção com o componente. O convênio e a carteirinha não aparecem no pagamento (fase 2 da especificação).
- O caixa (557 e 558 da UX) ainda não foi integrado e não tem dono.

### O que falta
- Teste de tela ou roteiro manual que confira o paciente no diálogo de pagamento.
- Integração no caixa diário (557, 558).

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
