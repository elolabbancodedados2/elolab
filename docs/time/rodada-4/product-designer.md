# Rodada 4 — product-designer

Data: 27/10/2026. Tarefa: portar a correção do texto de código de barras em `src/pages/LandingPage.tsx` e conferir se a landing da base nova ainda tem a promessa.

## Resultado

Nada foi portado, porque o patch não se aplica à base nova. Dois fatos mudaram em relação à base antiga (15/10):

1. **A landing foi reescrita.** `src/pages/LandingPage.tsx` tem 44 linhas e só monta as seções de `src/components/landing-v2/`. O `faqItems` e a `const C` em que o patch mexia não existem mais.
2. **A etiqueta agora imprime código de barras.** A premissa da rodada 3 ("a etiqueta imprime texto") era verdadeira na base antiga e não vale na nova:
   - `src/lib/sampleLabel.ts:21` (`barcode39Svg`) gera um SVG em Code 39, e `:43-46` (`sampleLabelHtml`) monta a etiqueta com o código em texto, as barras e o tubo.
   - `src/pages/MapaColeta.tsx:361-371` usa `sampleLabelHtml` na impressão em lote (`.barcode svg{width:48mm;height:12mm}`).
   - Commit `a1e4e420` (14/10/2026, "feat: print privacy-safe sample barcodes"), que já está no main.

## Conferência da promessa na landing nova

`grep -rn -i "barra|barcode|amostra|laborat|memed|icp|QrCode|rastreab" src/components/landing-v2 src/pages/LandingPage.tsx` encontrou um único texto relevante, em `src/components/landing-v2/FaqSection.tsx:34`:

> Sim, nos planos que incluem exames. O fluxo reúne coletas, identificação das amostras por código único e histórico de movimentações, além da conferência e liberação de resultados em laudos PDF. A liberação pode gerar o lançamento financeiro do exame; os lotes TISS são transmitidos à operadora por um canal externo.

| Afirmação | Evidência | Situação |
|---|---|---|
| Identificação por código único | `MapaColeta.tsx:175` (`codigo_amostra`), `sampleLabel.ts:43-46` | Verificado (leitura) |
| Histórico de movimentações | `MapaColeta.tsx:141` (`laboratorio_eventos_amostra`), `:1001` ("Rastreabilidade da amostra") | Verificado (leitura) |
| Conferência e liberação em laudo PDF | `src/pages/LaudosLab.tsx` (rodada 3: `gerarLaudoPDF`, `liberado`, `validado_por`) | Verificado na rodada 3, não reli nesta rodada |
| A liberação pode gerar o lançamento financeiro | `supabase/migrations/20260823010000_corrigir_resolucao_preco_exame.sql:105-123` insere em `lancamentos` por agendamento | NÃO VERIFICADO que a liberação do laudo dispare esse fluxo |
| TISS por canal externo | Texto honesto: não afirma integração | Sem objeção |

Conclusão: a landing nova **não promete** código de barras nem ICP-Brasil/Memed, e o texto de laboratório é mais contido que o da base antiga. O texto não cita as barras, que hoje existem; isso é subpromessa e não é defeito. Não alterei nada.

## O que descartei e por quê

- **A troca do texto do FAQ (o patch inteiro):** o alvo não existe mais e o texto atual já é preciso. Reaplicar "etiqueta de texto" seria falso na base nova.
- **As trocas de paleta, cantos e degradês do mesmo patch:** pertencem à outra frente (redesign) e o arquivo foi substituído pela `landing-v2`.
- **O `desc2` com "ICP-Brasil pela integração com a Memed":** era da outra frente e não está na base nova (grep sem resultado). A pendência 1 da rodada 3 se encerra.
- **O ícone `QrCode` (pendência 2 da rodada 3):** não existe na landing nova. Encerrada.

## Arquivos tocados

- `docs/time/rodada-4/product-designer.md` (este arquivo). Nenhum arquivo de código foi alterado.

## Evidências (comandos executados)

- `wc -l src/pages/LandingPage.tsx` → 44 linhas; o grep de `barra|amostra|laborat|memed|icp|QrCode` nesse arquivo não encontrou nada.
- `grep -rn "barcode" src/lib`: `src/lib/sampleLabel.ts:21` e `:45-46`.
- `grep -rln "sampleLabelHtml" src`: `sampleLabel.ts`, `__tests__/sampleLabel.test.ts` e `pages/MapaColeta.tsx`.
- `npx vitest run src/lib/__tests__/sampleLabel.test.ts` → 1 arquivo e 4 testes aprovados. Eles cobrem o Code 39 em SVG, a rejeição de caracteres fora do alfabeto e a etiqueta sem dados do paciente. Rodei só como evidência, porque o arquivo não foi alterado.

## Pendências

1. **Afirmação financeira do FAQ** (`FaqSection.tsx:34`): falta confirmar que a liberação do resultado gera o lançamento do exame. Dono: `backend-developer` ou `qa-engineer`. Se não se confirmar, troco o texto.
2. **Código de barras validado com leitor real:** o Code 39 existe em código e tem teste unitário, mas não há evidência de leitura em leitor físico nem em impressora térmica de 58 mm. Antes de citar "código de barras" em material comercial, é preciso validar no equipamento. Dono: `qa-engineer` com o `product-manager`.
3. **Cores fixas em `landing-v2`:** fora do escopo desta rodada. Fica registrado para a padronização de tokens (`animated-gradient.tsx` e `gradient-wave-text.tsx` sugerem degradês, o que conflita com a direção sóbria). NÃO VERIFICADO em detalhe.
4. A rodada 3 citava `src/pages/MapaColeta.tsx:346-352` como etiqueta só de texto. Na base nova, esse trecho mudou (`:353-379`). Os outros agentes não devem reusar essa citação.

## Próximo dono

`tech-lead` na consolidação da rodada; `backend-developer`/`qa-engineer` para a pendência 1.
