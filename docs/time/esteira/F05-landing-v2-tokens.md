# F05: landing-v2 com tokens do design system

Agente: product-designer. Data: 27/10/2026.

## O que foi feito
- `src/pages/landing-v2.css`: removidos a segunda paleta (`--elolab-navy`, `-blue`, `-cyan`, `-paper`, `-ink` e versões rgb) e o override de `--background` e `--foreground`. Ficam só `--elolab-blue-rgb` e `--elolab-ink-rgb`, exclusivos do logotipo. Seleção, botão `.elolab-gradient-button` (agora `primary` sólido, hover `brand-hover`, sem brilho nem `translate`), chips de recursos e o halo da seção passam a usar `hsl(var(--token))`.
- `src/components/landing-v2/*.tsx` (exceto `Logo.tsx`): `elolab-*` → `foreground`, `muted-foreground`, `primary`, `border`, `card`, `ring`; degradês de botões, molduras, divisória e faixa de Planos → cores sólidas de token; sombras coloridas → `shadow-*`/`drop-shadow-*`; rodapé → `bg-foreground`/`text-background`; selo do Instagram → `bg-primary`; véu radial branco de Planos removido.
- `gradient-wave-text.tsx`: cores padrão e `baseColor` em tokens. Textos sobre botão de marca usam `primary-foreground`.
- `animated-gradient.tsx`: o preset `Prism` lê `--background`, `--primary` e `--card` em tempo de execução (`resolveColor`). Presets não usados com hex foram removidos. Isso também vale para `Auth.tsx` e `PlanoCheckout.tsx`, que usam `Prism` (esses arquivos não foram tocados).
- Layout e textos sem alteração.
- `docs/ux/design-system/README.md`, seção 2: linha da landing atualizada e nova subseção "Landing pública (landing-v2)", com o mapeamento, as exceções, a verificação, o contraste e as dívidas.

## Evidência (comandos executados)
- `grep -nE "#[0-9a-fA-F]{3,8}\b|rgba?\(" src/components/landing-v2/*.tsx src/pages/landing-v2.css`: só restam `Logo.tsx` (exceção) e o parser de cor em `animated-gradient.tsx:320-377`.
- `grep -nE "elolab-(navy|ink|blue|cyan|paper)" …`: só restam `Logo.tsx` e as duas variáveis do logotipo.
- `npx tsc --noEmit -p tsconfig.app.json`: exit 0.
- `npx eslint src/components/landing-v2/*.tsx`: 0 erros e 5 avisos em `PricingSection.tsx` (4 `no-explicit-any` e 1 `only-export-components`). Os avisos são de trechos que eu não alterei.
- `npx vitest related --run src/components/landing-v2/*.tsx src/pages/landing-v2.css`: 3 arquivos, 20 testes aprovados.
- Contraste (fórmula WCAG 2.x): `muted-foreground`/`background` 5,93; rodapé 10,76 e 8,51; `primary-foreground`/`brand-hover` 5,65.

## Riscos e pendências
- **NÃO VERIFICADO visualmente:** não abri o navegador. Antes do commit, conferir hero, Planos e rodapé em 375 px e 1440 px.
- **Contraste do token `--primary` (P2):** branco sobre `primary` (`204 85% 43%`) dá 4,21, e `primary` como texto sobre `background` dá 4,03. Os dois ficam abaixo de 4,5:1. O problema afeta botões e links da landing e do app. A correção está no token, em `src/index.css` (proposta da seção 3.1), fora da trava desta tarefa. Dono: `frontend-developer`.
- `PricingSection.tsx` já tinha alterações de outro item (analytics, E10). Editei por cima e mantive essas alterações.
- `tailwind.config.ts` ainda declara as cores `elolab-*`. Elas só servem ao `Logo.tsx`; o arquivo não estava na trava desta tarefa.
- Decisões do responsável, que segue indisponível: manter ou remover os efeitos que restaram (fundo WebGL do hero, manchas desfocadas, brilho que segue o cursor nos planos, onda no texto), todos já em tokens; cores do logotipo; fonte Kanit na landing; `text-[9px]`, `[11px]` e `[13px]` em Planos (fora de "sem mudar layout").

Próximo dono: tech-lead (F07, verificação completa).

ESTEIRA: CONCLUIDO
