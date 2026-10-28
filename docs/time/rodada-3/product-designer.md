# Rodada 3 — product-designer

Data: 27/10/2026. Tarefa: corrigir a promessa de código de barras na landing.

## O que fiz

Reescrevi a resposta da pergunta "O EloLab atende laboratórios também?" em `src/pages/LandingPage.tsx:209`. O texto agora descreve só o que existe no código.

Antes:
> Sim. Há um módulo completo de laboratório: organização das coletas, laudos digitais padronizados, mapa de coleta, rastreabilidade de amostras por código de barras e faturamento integrado.

Depois:
> Sim. O módulo de laboratório organiza as coletas no mapa de coleta, identifica cada amostra por um código impresso em etiqueta de texto, acompanha a situação da amostra da coleta à análise, incluindo recoleta e rejeição, e emite laudos em PDF após validação e liberação do resultado.

Base de cada afirmação (E1, leitura do código):

| Afirmação | Evidência |
|---|---|
| Mapa de coleta | `src/pages/MapaColeta.tsx` |
| Código impresso em etiqueta de texto, sem código de barras | `src/pages/MapaColeta.tsx:346-352`: a etiqueta imprime `codigo_amostra` como texto monoespaçado |
| Situação da coleta à análise, com recoleta e rejeição | `src/pages/MapaColeta.tsx:168` (`pendente`, `coletado`, `em_analise`, `recoleta`, `rejeitada`) |
| Laudo em PDF após validação e liberação | `src/pages/LaudosLab.tsx:26` (`gerarLaudoPDF`), `:119` (`liberado`, `validado_por`, `data_validacao`) |

Saíram do texto, por falta de evidência:
- "código de barras": a etiqueta só imprime texto.
- "módulo completo" e "laudos padronizados": afirmações amplas sem critério verificável.
- "faturamento integrado": não encontrei ligação entre os exames do laboratório e `src/pages/FaturamentoConvenios.tsx` nesta leitura (NÃO VERIFICADO; retirei por cautela).

## Arquivos tocados

- `src/pages/LandingPage.tsx` (só a linha 209)
- `docs/time/rodada-3/product-designer.md` (este arquivo)

## Evidências

- `grep -n -i "barra\|barcode" src/pages/LandingPage.tsx src/pages/MapaColeta.tsx`: antes, só uma ocorrência, em `LandingPage.tsx:209`. Depois, nenhuma.
- `grep -rln "código de barras\|faturamento integrado" src tests`: sem resultado, ou seja, nenhum teste depende do texto antigo.
- Sem teste de tela para essa string; não rodei vitest nem tsc (a mudança é só um literal de texto).

## Pendências

1. **Diff pré-existente na landing, que não é meu.** O working tree já trazia outras mudanças em `src/pages/LandingPage.tsx` (paleta `C` trocada para azul, cantos menores e retirada de degradês). Uma delas troca o `desc2` do prontuário para "Receitas com certificado ICP-Brasil pela integração com a Memed.", removendo a ressalva anterior de que a assinatura do prontuário não equivale a ICP-Brasil. É uma promessa de conformidade: **requer avaliação especializada** e confirmação de que a integração Memed está ativa. Não reverti. Dono: `product-manager` com o responsável.
2. **Ícone `QrCode` no card "Identificação de amostras"** (`src/pages/LandingPage.tsx:90`): o texto do card está correto, mas o ícone sugere leitura de código. Ficou fora do escopo ("não altere mais nada na landing"). Proposta: trocar por `Tag` ou `FlaskConical`. P3. Dono: `product-designer` numa próxima rodada.
3. Se o código de barras for desejado como função, a etiqueta em `MapaColeta.tsx:346` precisa gerar símbolo (Code 128, por exemplo) e ser validada com leitor real antes de voltar à landing. Decisão do `product-manager`.

## Próximo dono

`tech-lead` ou `qa-engineer` na verificação completa da rodada; `product-manager` para a pendência 1.
