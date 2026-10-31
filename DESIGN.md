---
name: EloLab
description: Plataforma clínica com leitura clara, identidade azul clínica e operação confiável.
colors:
  primary: "#111214"
  brand-dark: "#111214"
  background: "#F7F9FB"
  foreground: "#111214"
  card: "hsl(0 0% 100%)"
  secondary: "#EEF1F5"
  muted-foreground: "#6E737B"
  border: "#E3E8EE"
  success: "hsl(152 69% 30%)"
  warning: "hsl(34 92% 42%)"
  destructive: "hsl(0 72% 48%)"
  info: "hsl(220 85% 52%)"
  sidebar: "#F7F9FB"
typography:
  display:
    fontFamily: "Manrope, DM Sans, Inter, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "Manrope, DM Sans, Inter, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.375
  body:
    fontFamily: "DM Sans, Inter, system-ui, sans-serif"
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

**Creative North Star: clínica precisa, clara e confiável.**

O app EloLab usa branco gelo nos fundos, quadros brancos e preto nos botões, no item ativo e no foco. Cor aparece só para estado: vermelho para erro ou pendência, âmbar para atenção, verde para sucesso. Visual aprovado em 30/10/2026; a página inicial pública mantém as cores anteriores em `landing-v2.css`. A interface prioriza leitura rápida e previsível durante o atendimento, sem tirar destaque de dados clínicos ou estados de segurança.

O sistema migra por módulo para Manrope nos títulos e DM Sans nos textos e controles. A barra global, o Dashboard e a Agenda já seguem essa tipografia; os demais módulos preservam Inter até passarem pela revisão. Cabeçalhos compactos, listas operacionais e formulários mantêm a densidade necessária para o trabalho diário. Superfícies são claras e neutras; cores semânticas continuam reservadas ao significado dos estados. Gradientes decorativos não fazem parte da identidade cromática.

A iconografia dos módulos migrados usa Phosphor Icons, com peso regular no repouso e preenchido para indicar navegação ativa. Evite misturar bibliotecas de ícones dentro da mesma tela.

**Key Characteristics:**

- Branco gelo nos fundos e preto nos destaques; pouca cor.
- Menu lateral em branco gelo com item ativo em preto.
- Hierarquia compacta, consistente e voltada à leitura operacional.
- Estados clínicos e financeiros mantêm cores semânticas próprias.

## Colors

A paleta usa os tokens cromáticos EloLab abaixo e mantém estados semânticos separados da identidade de marca.

### Primary

- **Preto** (`#111214`): ações principais, item ativo do menu, foco e série principal dos gráficos.

### Secondary

- Tons de cinza (`#3B3E44`, `#6E737B`, `#A9ADB4`, `#C9CCD1`) separam séries e etapas sem usar cor.

### Neutral

- **Fundo da interface** (`#F7F9FB`, branco gelo): plano geral das páginas e menu lateral.
- **Texto principal** (`#111214`): títulos, dados e conteúdo.
- **Superfície** (`#FFFFFF`): cartões, campos e painéis elevados.
- **Superfície selecionada** (`#EEF1F5`): regiões ativas, filtros e etiquetas neutras.
- **Texto auxiliar** (`#6E737B`): metadados e descrições.
- **Borda** (`#E3E8EE`): contornos, separadores e limites de campo.
### Named Rules

**A Regra do Significado.** Preto identifica ação primária, seleção e foco; o resto é branco gelo e cinza. Verde, âmbar e vermelho continuam reservados a sucesso, atenção e erro. Não use cor semântica como decoração.

## Typography

**Display Font:** Manrope (com DM Sans, Inter e system-ui como fallback)
**Body Font:** DM Sans (com Inter e system-ui como fallback)
**Label/Mono Font:** DM Sans; não há família mono de interface.

**Character:** Manrope dá mais personalidade aos títulos; DM Sans mantém nomes, tabelas e dados clínicos legíveis. Títulos usam peso e escala moderados; rótulos seguem a família de texto para reduzir troca visual.

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
- **Ênfase de marca** (`var(--shadow-glow)`): sombra neutra discreta; não tingir a elevação com a cor primária.

### Named Rules

**A Regra da Camada.** Use borda para delimitar conteúdo e sombra para indicar elevação; evite empilhar as duas com intensidade alta no mesmo cartão.

## Shapes

Cartões usam cantos arredondados de 16px; campos e ícones usam cerca de 12px. Botões, abas compactas e chips são cápsulas. Contornos são finos e frios; reserva superfícies sólidas para estados que precisam ser identificados sem depender só do texto.

## Components

### Buttons

Controles são compactos, familiares e têm foco de teclado visível.

- **Shape:** cápsula (`9999px`).
- **Primary:** azul `#1456C0` sólido, com texto branco; 40px de altura e padding horizontal de 16px.
- **Secondary / Outline:** superfície neutra ou branca com borda; manter texto principal em azul-noite.
- **Destructive / Success:** fundo semântico sólido e foreground correspondente; não herdar gradiente de marca.
- **Hover / Focus:** transição funcional de 200ms, anel azul de 2px e estado desabilitado claramente atenuado.

### Chips

Chips e badges são compactos e arredondados. Estados usam pares semânticos com contraste adequado; seleção de filtro também indica estado por borda/anel ou `aria-pressed`, não só pela cor.

### Cards / Containers

- **Corner Style:** 16px.
- **Background:** branco sobre o fundo frio.
- **Border / Elevation:** borda fria com sombra baixa.
- **Spacing:** cabeçalho de 20px; conteúdo mantém intervalos consistentes.

### Inputs

Campos usam superfície branca, borda fria e cantos de 12px. O foco troca a borda e mostra anel azul; placeholders e estado desabilitado permanecem discerníveis. Rótulos e instruções devem continuar associados ao campo.

## Do's and Don'ts

- **Faça** usar tokens para cores de marca, neutros e estados.
- **Faça** manter navegação e títulos previsíveis entre módulos.
- **Faça** deixar estados vazios explicarem o próximo passo permitido.
- **Faça** usar prioridade visual para tarefas clínicas e ações de risco.
- **Não** use gradientes decorativos para substituir hierarquia, estados ou identidade; não comunique sucesso, alerta ou erro somente pela cor.
- **Não** comunique sucesso, alerta ou erro somente pela cor.
- **Não** corte nomes, valores ou horários; prefira quebra de linha ou layout responsivo.
- **Não** indique que uma automação ou configuração está ativa sem execução confirmada.
- **Não** transforme preferência registrada em promessa de comportamento do sistema.
