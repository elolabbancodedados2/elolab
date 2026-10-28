# E11-designsystem-cores: resumo

Agente: product-designer. Data: 27/10/2026. Arquivos travados: `src/pages/LandingPage.tsx`, `tailwind.config.ts`, `src/index.css`.

## Resultado

Nenhum arquivo de código foi alterado. A premissa da tarefa está desatualizada nesta base.

- `src/pages/LandingPage.tsx` tem 44 linhas e não contém `const C`, hex, `rgb()` nem classe de paleta. Comandos: `grep -c "const C" src/pages/LandingPage.tsx` retornou `0`. A busca por `#[0-9a-fA-F]{3,8}`, `rgba?(` e `(bg|text|border)-<cor>-NNN` no arquivo também não encontrou nada. Hoje o arquivo só monta as seções de `src/components/landing-v2/` e importa `./landing-v2.css`.
- A paleta própria saiu do arquivo no commit `944ffb88` (16/10/2026, "new landing page (landing-v2)"). A linha `src/pages/LandingPage.tsx:53` citada em `docs/ux/design-system/README.md` (seção 2) não existe mais. Essa linha do README precisa ser atualizada.
- As cores fixas e os degradês foram para arquivos **fora da trava** deste item, então não os editei, como manda a regra "mexa só nos arquivos da tarefa". Esses componentes também são usados em outras 10 páginas públicas: `Auth`, `PlanoCheckout`, `AgendamentoOnline`, `AceitarConvite`, `RedefinirSenha`, `NotFound`, `VerificarAssinatura`, `PoliticaCookies`, `PoliticaPrivacidade` e `TermosUso` (`grep -rln "landing-v2/" src`). Trocá-los dentro deste item mudaria telas que não fazem parte da tarefa.

## Inventário medido (fora da trava)

| Arquivo | Hex | `rgb(a)` | Ocorrências de "gradient" | Observação |
|---|---|---|---|---|
| `src/pages/landing-v2.css` | 7 | 22 | 7 | Define a paleta paralela `--elolab-navy/blue/cyan/paper/ink` (linhas 4-13) e `.elolab-gradient-button` com degradê azul→ciano e sombra colorida (28-38) |
| `landing-v2/animated-gradient.tsx` | 36 | 5 | 7 | Fundo animado em WebGL; predefinições laranja, roxo, rosa e verde nunca usadas |
| `landing-v2/gradient-wave-text.tsx` | 6 | 2 | 11 | Texto com onda colorida (`defaultColors`, linha 8) |
| `landing-v2/PricingSection.tsx` | 4 | 18 | 18 | Borda com spotlight, botões em degradê (157, 254, 330), faixa de fundo (228-229) |
| `landing-v2/HeroSection.tsx` | 7 | 4 | 15 | `CTA_COLORS`, `BUTTON_WAVE_COLORS` (18-19), fundo animado |
| `landing-v2/DeviceShowcaseSection.tsx`, `EloAssistantSection.tsx`, `InstagramUpdatesSection.tsx`, `Motion.tsx`, `Logo.tsx`, `FaqSection.tsx`, `NotebookToAppSection.tsx` | 2 a 7 cada | 0 a 4 | 4 a 11 | `customColors` em hex, `drop-shadow` com `rgba(10,34,55,…)`, logotipo com degradê (`Logo.tsx:27-29`) |

Comando: um loop com `grep -Eo` por arquivo para hex, `rgba?(` e "gradient". Os números são ocorrências, não decisões de design.

`tailwind.config.ts:30-34` expõe `elolab-navy/blue/cyan/paper/ink` a partir de variáveis que só existem em `landing-v2.css`. É uma segunda marca (`#2f6bff` + `#2fe0c9`) concorrendo com `primary` (`204 85% 43%`, `src/index.css`). Isso fere o princípio de "uma cor de marca".

## Mapeamento proposto (para o item seguinte)

| Hoje | Token |
|---|---|
| `elolab-blue` `#2f6bff` | `primary` |
| `elolab-navy`, `elolab-ink`, `rgb(10,34,55)` | `foreground` |
| `elolab-paper` `#f2f9fd` | `background` |
| `elolab-cyan` `#2fe0c9` (2ª cor de marca) | Sai; em detalhes, usar `primary` ou `border` |
| `.elolab-gradient-button` e botões `bg-[linear-gradient(…)]` | `Button` padrão (`bg-primary text-primary-foreground`), sem sombra colorida |
| `GradientWaveText` | Texto estático em `text-foreground`; o destaque fica em `text-primary` |
| `AnimatedGradient` (hero, login, checkout) | Fundo `bg-background` liso |
| Spotlight e borda em degradê nos planos | `border-border bg-card shadow-sm` |
| `drop-shadow-[…rgba(10,34,55,x)]`, `shadow-[…]` | `shadow-sm` ou `shadow-lg` |
| Ícone do Instagram em degradê | Ícone monocromático `text-muted-foreground` |

Depois da troca, remover `elolab-*` de `tailwind.config.ts` e as variáveis de `landing-v2.css`.

## Pendências

1. **Novo item de backlog (sugestão: CLIN-QA-5xx, P3, esforço M, dono: `frontend-developer`).** Aplicar o mapeamento acima em `src/pages/landing-v2.css` e `src/components/landing-v2/*`, travando esses arquivos e `tailwind.config.ts`. Aceite: zero hex, `rgb()` e `linear/radial-gradient` nesses arquivos (o `mask-image` técnico é exceção), sem `elolab-*` no Tailwind, e revisão visual das 11 páginas públicas em 375 px e 1280 px.
2. **Decisão do responsável:** (a) se o logotipo (`Logo.tsx`) mantém o degradê azul→ciano como marca registrada ou passa a usar cor sólida; (b) se os botões da landing deixam o formato pílula (`rounded-full`) e passam a `rounded-md`, como no design system. Isso muda a forma, mas não o layout.
3. Atualizar `docs/ux/design-system/README.md`, seção 2, linha "Paleta própria na landing": trocar `LandingPage.tsx:53` pelos arquivos acima. Não editei esse arquivo porque ele está fora da trava.

## Verificação

Sem alteração de código, então não rodei `tsc`, `vitest` nem `eslint`.
