---
name: EloLab
description: Plataforma clínica com leitura clara, identidade violeta e operação confiável.
colors:
  primary: "hsl(248 71% 58%)"
  brand: "hsl(248 86% 64%)"
  highlight: "hsl(36 100% 64%)"
  background: "hsl(250 47% 97%)"
  foreground: "hsl(252 41% 12%)"
  card: "hsl(0 0% 100%)"
  secondary: "hsl(250 45% 94%)"
  muted: "hsl(250 40% 94%)"
  muted-foreground: "hsl(250 14% 42%)"
  border: "hsl(250 26% 88%)"
  success: "hsl(152 69% 30%)"
  warning: "hsl(34 92% 42%)"
  destructive: "hsl(0 72% 48%)"
  info: "hsl(220 85% 52%)"
  sidebar: "hsl(252 41% 12%)"
typography:
  display:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.375
  body:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "8px"
  md: "12px"
  lg: "14px"
  xl: "16px"
  pill: "9999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    height: "40px"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.pill}"
    height: "40px"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "20px"
---

# Design System: EloLab

## Overview

**Creative North Star: “Clínica premium tranquila”**

EloLab combina uma identidade acolhedora com a precisão de um espaço clínico. Violeta marca ações e foco; âmbar chama atenção para decisões pontuais; o azul-noite dá estrutura à navegação. A interface prioriza leitura rápida e previsível durante o atendimento, sem tirar destaque de dados clínicos ou estados de segurança.

O sistema usa Manrope em toda a experiência e componentes familiares de aplicação web. Cabeçalhos compactos, listas operacionais e formulários mantêm a densidade necessária para o trabalho diário. Gradientes fazem parte da marca em poucas superfícies de entrada e ações primárias; cores semânticas continuam reservadas para o significado de estados.

**Key Characteristics:**

- Identidade violeta com acentos âmbar contidos.
- Navegação estruturada em azul-noite e conteúdo em superfícies claras.
- Hierarquia compacta, consistente e voltada à leitura operacional.
- Estados clínicos e financeiros mantêm cores semânticas próprias.

## Colors

A paleta une violeta de marca, neutros levemente frios e tons semânticos de contraste definido.

### Primary

- **Violeta EloLab** (`hsl(248 71% 58%)`): ações principais, seleção e foco.
- **Violeta luminoso** (`hsl(248 86% 64%)`): início de gradientes de marca e destaques de interface.

### Secondary

- **Âmbar de destaque** (`hsl(36 100% 64%)`): chamadas pontuais e ações que precisam de atenção; combinar com foreground escuro.

### Neutral

- **Fundo frio** (`hsl(250 47% 97%)`): fundo geral das páginas.
- **Azul-noite clínico** (`hsl(252 41% 12%)`): texto principal e fundo da navegação lateral.
- **Branco de superfície** (`hsl(0 0% 100%)`): cartões, campos e painéis elevados.
- **Cinza-violeta suave** (`hsl(250 40% 94%)`): regiões secundárias e controles inativos.
- **Texto auxiliar** (`hsl(250 14% 42%)`): metadados e descrições; manter contraste legível.
- **Borda fria** (`hsl(250 26% 88%)`): contornos, separadores e limites de campo.

### Named Rules

**A Regra do Significado.** Violeta indica ação ou foco; verde, âmbar, vermelho e azul informam estados de sucesso, atenção, erro e informação. Não use uma cor semântica como decoração.

## Typography

**Display Font:** Manrope (com system-ui, sans-serif)
**Body Font:** Manrope (com system-ui, sans-serif)
**Label/Mono Font:** Manrope; não há família mono de interface.

**Character:** Manrope mantém uma voz humana e direta sem perder precisão em nomes, tabelas e dados clínicos. Títulos usam peso e escala moderados; rótulos seguem a mesma família para reduzir troca visual.

### Hierarchy

- **Display** (700, 28px, 1.2): títulos de página no `PageHeader`.
- **Title** (700, 16px, 1.375): títulos de cartões e seções.
- **Body** (400, 14px, 1.5): descrições, conteúdo de listas e formulários.
- **Label** (600, 12–14px): rótulos de controles, filtros e ações; usar caixa normal.

### Named Rules

**A Regra da Leitura.** Dê nomes explícitos às ações, prefira frases curtas e mantenha os dados clínicos em texto normal, sem caps decorativas ou fontes de exibição.

## Layout

O shell combina navegação lateral persistente com área principal clara e cabeçalho de página alinhado à esquerda. `PageHeader` mantém título/descrição à esquerda e ações à direita; em larguras menores, as ações passam para a linha seguinte. A composição usa grupos compactos de controles e intervalos maiores entre seções, frequentemente `gap-4`, `space-y-6` e padding de 20px em cartões.

A densidade muda pela estrutura: tabelas podem rolar dentro de seus limites; grades reduzem colunas em telas menores; ferramentas de atendimento mantêm dados e ação principal próximos. No desktop, priorize conteúdo útil na primeira dobra sem comprimir rótulos ou esconder controles.

## Elevation & Depth

O sistema combina bordas frias com sombras suaves em cartões, menus e diálogos. A sombra separa superfícies quando há sobreposição; cartões de conteúdo usam elevação discreta. Gradientes e halos de marca não substituem estados de foco, contraste ou hierarquia.

### Shadow Vocabulary

- **Superfície de conteúdo** (`var(--shadow-sm)`): cartão em repouso.
- **Painel flutuante** (`var(--shadow-md)`): menu, popover ou painel sobre a página.
- **Diálogo** (`var(--shadow-lg)`): camada que requer atenção e foco.
- **Ênfase violeta** (`var(--shadow-glow)`): ação primária de marca em superfícies de destaque; usar com parcimônia.

### Named Rules

**A Regra da Camada.** Use borda para delimitar conteúdo e sombra para indicar elevação; evite empilhar as duas com intensidade alta no mesmo cartão.

## Shapes

Cartões usam cantos arredondados de 16px; campos e ícones usam cerca de 12px. Botões, abas compactas e chips são cápsulas. Contornos são finos e frios; reserva superfícies sólidas para estados que precisam ser identificados sem depender só do texto.

## Components

### Buttons

Controles são compactos, familiares e têm foco de teclado visível.

- **Shape:** cápsula (`9999px`).
- **Primary:** violeta com gradiente curto de marca; texto branco; 40px de altura e padding horizontal de 16px.
- **Secondary / Outline:** superfície neutra ou branca com borda; manter texto principal em azul-noite.
- **Destructive / Success:** fundo semântico sólido e foreground correspondente; não herdar gradiente de marca.
- **Hover / Focus:** transição de 200ms, anel violeta de 2px e estado desabilitado claramente atenuado.

### Chips

Chips e badges são compactos e arredondados. Estados usam pares semânticos com contraste adequado; seleção de filtro também indica estado por borda/anel ou `aria-pressed`, não só pela cor.

### Cards / Containers

- **Corner Style:** 16px.
- **Background:** branco sobre o fundo frio.
- **Border / Elevation:** borda fria com sombra baixa.
- **Spacing:** cabeçalho de 20px; conteúdo mantém intervalos consistentes.

### Inputs

Campos usam superfície branca, borda fria e cantos de 12px. O foco troca a borda e mostra anel violeta; placeholders e estado desabilitado permanecem discerníveis. Rótulos e instruções devem continuar associados ao campo.

## Do's and Don'ts

- **Faça** usar tokens para cores de marca, neutros e estados.
- **Faça** manter navegação e títulos previsíveis entre módulos.
- **Faça** deixar estados vazios explicarem o próximo passo permitido.
- **Faça** usar prioridade visual para tarefas clínicas e ações de risco.
- **Não** use gradiente violeta em confirmação destrutiva ou estado semântico.
- **Não** comunique sucesso, alerta ou erro somente pela cor.
- **Não** corte nomes, valores ou horários; prefira quebra de linha ou layout responsivo.
- **Não** indique que uma automação ou configuração está ativa sem execução confirmada.
- **Não** transforme preferência registrada em promessa de comportamento do sistema.
