# Design system do EloLab

Versão 0.1, de 27/10/2026. Dono: Product Designer. Vale para todas as telas autenticadas, o portal do paciente e as páginas públicas.

Este documento descreve o estado desejado. A seção 2 registra o estado atual medido. Onde os dois divergem, o código atual é dívida (CLIN-QA-019 e CLIN-QA-031) e não serve de modelo.

## 1. Princípios

1. **Sóbrio e institucional.** Uma cor de marca. Outras cores só indicam estado: sucesso, alerta, erro e informação. Sem degradês, brilhos, vidro, emojis ou exclamações.
2. **O paciente certo vem antes de tudo.** Toda tela que registra, prescreve ou cobra mostra a identificação do paciente (ver `docs/ux/telas/identificacao-paciente.md`).
3. **Legível no balcão e no consultório.** Texto de interface com no mínimo 12 px. Dado clínico importante com no mínimo 14 px. Contraste AA medido, não presumido.
4. **Uma forma de fazer cada coisa.** Página, tabela, formulário e diálogo seguem os padrões da seção 5. Uma variação nova precisa de justificativa escrita aqui.
5. **Tom formal.** Frases completas, sem gírias, sem exclamação. Erros sempre traduzidos por `src/lib/erros.ts`.

## 2. Estado atual (medido em 27/10/2026)

| Item | Valor | Comando ou evidência |
|---|---|---|
| Cores hexadecimais fixas em `.tsx` | 1.064 ocorrências | `grep -rEo "#[0-9a-fA-F]{6}\b" src --include=*.tsx \| wc -l` |
| Classes de paleta fixa (`bg/text/border-<cor>-NNN`) | 410 ocorrências | `grep -rEo "\b(bg\|text\|border)-(red\|blue\|…)-[0-9]{2,3}" src --include=*.tsx \| wc -l` |
| Texto de 9, 10 e 11 px | 37, 349 e 166 ocorrências; 10 e 11 px aparecem em 80 arquivos | `grep -rEo "text-\[(9\|10\|11)px\]" src --include=*.tsx` |
| Paleta própria na landing | Removida. `const C` não existe mais em `src/pages/LandingPage.tsx`; a landing-v2 usa tokens desde 27/10 (F05, abaixo) | `grep -n "const C" src/pages/LandingPage.tsx` sem resultado |
| Rótulo de seção com 11 px e 60% de opacidade | contraste 2,70:1 (reprova) | `src/index.css`, classe `.section-label` |
| Modo escuro | Desativado: o tema força `light` | `src/contexts/ThemeContext.tsx:16-22` |
| Classes do visual anterior ainda definidas | `.glass-card`, `.glow-*`, `.gradient-*`, `.fab`, `.btn-shimmer`, `.card-interactive` (sobe no hover), `animate-float`, `animate-pulse-glow` | `src/index.css:273-480`; `tailwind.config.ts` (`keyframes`, `backgroundImage`) |
| Alerta de alergia pulsando | `animate-pulse` no ícone e nos badges | `src/components/clinical/AllergyAlert.tsx:19,24` |
| Cores fixas no carregamento inicial | `.brand-loader` com hex e degradê radial | `src/index.css:3-90` |

As contagens diferem um pouco das do diagnóstico (1.064 hex e 410 de paleta aqui; 1.474 no relatório 04) porque o critério de regex é outro. A linha de base oficial será o script versionado pedido em CLIN-QA-031.

### Landing pública (landing-v2), revisada em 27/10/2026 (F05)

Arquivos: `src/pages/landing-v2.css` e `src/components/landing-v2/*.tsx`. Layout e textos não mudaram; só cores, sombras e efeitos de cor.

| Antes | Depois |
|---|---|
| Segunda paleta em `.landing-v2` (`--elolab-navy`, `-blue`, `-cyan`, `-paper`, `-ink`) e override de `--background`/`--foreground` | Removidos. Ficam só `--elolab-blue-rgb` e `--elolab-ink-rgb`, exclusivos do logotipo |
| `text-elolab-ink`/`-navy` e as variantes com opacidade (`/60`, `/65`, `/70`) | `text-foreground` e `text-muted-foreground` (sem opacidade extra) |
| `text-`/`bg-elolab-blue` e `-cyan` | `primary` (uma cor de marca) |
| Bordas `border-elolab-blue/10` a `/25`, `border-gray-200` | `border-border`; destaque no hover com `border-primary` |
| `bg-white`, `bg-white/NN` | `bg-card`, `bg-card/NN` |
| Botões com degradê azul para ciano (`.elolab-gradient-button` e `bg-[linear-gradient(110deg,…)]` nos planos) | `bg-primary` sólido, texto `primary-foreground`, hover `brand-hover`, sem `scale` nem brilho |
| Moldura de cartão de plano, divisória e faixa do topo de Planos com degradê | `bg-primary/30` (plano em destaque `bg-primary`), `bg-border` e `bg-primary/[0.06]`; véu radial branco removido |
| Sombras coloridas `shadow-[…rgba(…)]` e `drop-shadow-[…]` | `shadow-sm`, `shadow-md`, `shadow-lg`, `drop-shadow-lg`, `drop-shadow-xl` |
| Rodapé `bg-elolab-navy` com `text-white/NN` e ciano | `bg-foreground` com `text-background` (80% e 70% no texto secundário) |
| Selo do Instagram com degradê da marca Instagram | `bg-primary` |
| `GradientWaveText`: cores padrão e `baseColor` em hex/rgb | `hsl(var(--primary))`, `hsl(var(--foreground))`; sobre botão de marca, `primary-foreground` e `muted` |
| `AnimatedGradient` (WebGL) com presets em hex | Preset `Prism` lê `--background`, `--primary` e `--card` em tempo de execução; presets não usados (Lava, Plasma, Pulse, Vortex, Mist) removidos |

Exceções mantidas: `Logo.tsx` (degradê azul e ciano do símbolo e cores do nome), máscaras de transparência com `black` (não pintam cor) e o parser de cor de `animated-gradient.tsx`.

Verificação: `grep -nE "#[0-9a-fA-F]{3,8}\b|rgba?\(" src/components/landing-v2/*.tsx src/pages/landing-v2.css` só encontra `Logo.tsx` e o parser; `grep -nE "elolab-(navy|ink|blue|cyan|paper)"` só encontra `Logo.tsx` e as duas variáveis do logotipo.

Contraste dos pares novos (fórmula WCAG 2.x sobre os valores atuais de `src/index.css`): `muted-foreground` sobre `background` 5,93; texto secundário do rodapé 10,76 e 8,51; `primary-foreground` sobre `brand-hover` 5,65. **Reprovam:** `primary-foreground` sobre `primary` (4,21) e `primary` como texto sobre `background` (4,03). É dívida do token `--primary` (`204 85% 43%`), não da landing; resolve com a proposta da seção 3.1.

Dívidas que ficaram fora do escopo (não são cor): fonte Kanit em `.landing-v2`; `text-[9px]`, `text-[11px]` e `text-[13px]` em `PricingSection.tsx`; manchas desfocadas decorativas (`bg-primary/[0.0N] blur-[…]`), o brilho que segue o cursor nos cartões de plano e o fundo animado do hero, que continuam como efeito, agora em tokens. Remover esses efeitos é decisão do responsável.

### Contraste dos tokens atuais

Calculado com a fórmula de luminância relativa da WCAG 2.x, a partir dos valores HSL de `src/index.css:121-205` (script em `docs/time/rodada-1/product-designer.md`). Fundo `card` é branco; fundo `background` é `203 41% 95%`.

| Token como texto | Sobre branco | Sobre `background` | Sobre o próprio tom a 10% | Resultado |
|---|---|---|---|---|
| `foreground` | 15,28 | 13,70 | — | Aprova |
| `muted-foreground` | 6,64 | 5,95 | — | Aprova |
| `primary` | 5,97 | 5,35 | 5,14 | Aprova |
| `brand` | 4,27 | 3,83 | 3,75 | **Reprova** para texto normal |
| `success` | 3,55 | 3,18 | 3,17 | **Reprova** |
| `destructive` | 5,24 | 4,69 | 4,46 | Reprova sobre o tom a 10% (badges) |
| `warning` | 2,32 | 2,08 | 2,14 | **Reprova**; nunca usar como cor de texto |
| `info` | 4,81 | 4,31 | 4,18 | Reprova sobre `background` e tom a 10% |
| `input` como contorno de campo (`ui/input.tsx:11`) | 1,34 | 1,20 | — | **Reprova** WCAG 1.4.11 (mínimo 3:1 para o limite de um campo) |
| `border` (divisória e cartão, decorativo) | 1,48 | 1,33 | — | Aceitável só como decoração; não pode delimitar campo |

Texto branco sobre `success` (3,55) e sobre `brand` (4,27) também reprova. Os botões e badges que usam esses fundos com texto branco precisam do token novo da seção 3.1.

## 3. Tokens

Os tokens vivem em `src/index.css` (valores HSL sem `hsl()`) e são expostos em `tailwind.config.ts`. Componentes usam só classes semânticas (`bg-primary`, `text-muted-foreground`, `border-input`). Hex, `rgb()` e classes de paleta (`text-blue-600`) ficam proibidos fora de `src/index.css`.

### 3.1 Cor

**Marca (uma só).** `primary` (`212 100% 40%`) é a cor de marca na interface: botão principal, link, item ativo do menu, foco. `brand` (`215 98% 53%`) reprova contraste e duplica `primary`; proposta: `brand` passa a apontar para os mesmos valores de `primary` e é removido quando não houver mais uso. `brand-glow`, `primary-glow`, `shadow-glow` e `shadow-glow-success` saem.

**Neutros.**

| Token | Uso |
|---|---|
| `background` | Fundo da página |
| `card`, `popover` | Superfícies: cartão, diálogo, menu |
| `foreground` | Texto principal |
| `muted-foreground` | Texto secundário, rótulo, ajuda. Sem opacidade extra (`/60` reprova) |
| `muted`, `secondary`, `accent` | Fundos de apoio: linha selecionada, área de filtro, chip neutro |
| `border` | Divisórias e contorno de cartão (decorativo) |
| `input` | Contorno de campo de formulário. Precisa de 3:1 |
| `ring` | Anel de foco |

**Estado.** Cada estado tem fundo, texto sobre o fundo e texto sobre superfície clara.

| Estado | Uso | Valor atual | Proposta | Contraste da proposta |
|---|---|---|---|---|
| `success` | Pago, concluído, liberado | `152 69% 36%` | `152 72% 26%` | 5,96 com branco; 5,17 sobre o tom a 10% |
| `warning` | Pendência, atraso, dado incompleto | `38 92% 48%` (fundo) | Manter o fundo; criar `--warning-text: 30 90% 30%` para texto e ícone | 6,44 sobre branco; 5,69 sobre `warning` a 15% |
| `destructive` | Erro, alergia, ação irreversível, valor crítico | `0 72% 48%` | `0 72% 42%` | 6,47 com branco; 5,47 sobre o tom a 10% |
| `info` | Informação neutra, em andamento | `215 100% 49%` | Igual a `primary` (`212 100% 40%`) | 5,97 |
| `input` | Contorno de campo | `203 25% 87%` | `205 15% 52%` | 3,71 sobre branco |

As propostas são para o `frontend-developer` aplicar numa rodada sem outras alterações em `src/index.css`, com revisão visual das 5 telas diárias. Não alteram regra de negócio.

**Regras de uso.**
- Cor nunca é o único sinal. Estado sempre tem texto ("Pago", "Atrasado") e, quando couber, ícone.
- Badge de estado: fundo do tom a 10%, borda do tom a 20% e texto no token de texto do estado (`text-warning-text` para alerta).
- `chart-1` a `chart-6` só em gráficos, nunca para estado de registro.
- Cores por profissional ou por tipo de consulta na Agenda (`ColorSchemeDialog`) são dado do usuário, não token. Exibir sempre com rótulo de texto.

### 3.2 Tipografia

Fonte única: Inter (`tailwind.config.ts`, `fontFamily.sans`). Números de valor, horário e documento usam `tabular-nums`.

| Papel | Classe | Tamanho / altura | Peso |
|---|---|---|---|
| Título de página | `text-2xl` | 24 / 32 | 600 |
| Título de seção ou diálogo | `text-lg` | 18 / 28 | 600 |
| Corpo e célula de tabela | `text-sm` | 14 / 20 | 400 |
| Dado clínico importante (nome do paciente, alergia, dose, valor a cobrar) | `text-base` ou `text-sm` | mínimo 14 px | 600 |
| Rótulo, legenda, ajuda | `text-xs` | 12 / 16 | 500 |
| Mínimo absoluto | `text-xs` | 12 px | — |

Proibido: `text-[9px]`, `text-[10px]`, `text-[11px]`, título em `text-3xl` ou maior nas telas internas, `uppercase` com `tracking` largo em texto corrido, peso 800.

### 3.3 Espaço, raio, sombra e movimento

- **Espaço.** Escala de 4 px do Tailwind. Padrão: `gap-2` (8) dentro de grupos, `gap-4` (16) entre campos, `space-y-6` (24) entre seções. Respeitar `data-density='compact'` (`src/index.css:208`).
- **Raio.** `--radius: 0.5rem`. Usar `rounded-md` em campos e botões e `rounded-lg` em cartões e diálogos. `rounded-2xl`, `rounded-3xl` e `rounded-full` só em avatar, indicador de status e chip.
- **Sombra.** `shadow-sm` em cartão, `shadow-lg` em diálogo e menu. Sem sombra colorida.
- **Movimento.** Transições de cor e opacidade de até 200 ms. Sem `translate` no hover, sem `float`, `pulse-glow`, `shimmer` ou `animate-pulse` em alertas. Esqueleto de carregamento pode pulsar. `prefers-reduced-motion` já é respeitado (`src/index.css`, `@layer base`).

### 3.4 Ícones

`lucide-react`, 16 px em texto e botão, 20 px em título. Ícone sozinho exige `aria-label` e `Tooltip`. Ícone decorativo leva `aria-hidden="true"`.

## 4. Componentes base

Componentes de `src/components/ui` (shadcn) são a fonte. Componente de tela não redefine cor, raio ou tipografia por `className` quando existe variante.

| Necessidade | Componente | Observação |
|---|---|---|
| Ação | `Button` | Variantes: `default` (principal, uma por área), `outline` (secundária), `ghost` (terciária), `destructive` (irreversível). Altura mínima 36 px; 44 px no celular |
| Ação com espera | `LoadingButton` (`ui/loading-button.tsx`) | Desabilita e mostra o texto de progresso ("Salvando") |
| Estado | `Badge` + classes `.badge-success/-warning/-destructive/-info` | Sempre com texto |
| Aviso em linha | `Alert` | `destructive` para erro e alergia; sem `border-2` nem pulso |
| Campo | `Input`, `MaskedInput`, `Textarea`, `Select`, `Checkbox`, `Switch` + `Label` + `Form` | Ver seção 5.4 |
| Tabela | `Table` | Ver seção 5.3 |
| Diálogo | `Dialog` (formulário), `AlertDialog` via `ConfirmDialog` (confirmação), `Sheet` (detalhe lateral) | Ver seção 5.7 |
| Carregamento | `ui/loading-skeleton.tsx` (`TableSkeleton`, `FormSkeleton`, `PageSkeleton`) | Ver seção 5.6 |
| Vazio e erro | `EmptyState`, `ErrorState` | Ver seção 5.6 |
| Notificação | `sonner` | Ver seção 5.8 |

Classes de `src/index.css` a remover quando não houver mais uso: `.glass-card`, `.glass-surface`, `.glow-primary`, `.glow-success`, `.gradient-*`, `.fab`, `.btn-shimmer`, `.badge-premium`, `.card-interactive`, `.dot-grid`, `.input-focus-ring`. Até lá, não usar em código novo.

## 5. Padrões

### 5.1 Página

```
┌ Sidebar ┬─────────────────────────────────────────────────────────┐
│         │ Breadcrumbs (opcional)                                  │
│         │ Cabeçalho da página                    [Secundária] [Principal] │
│         │ Descrição curta (1 linha, opcional)                     │
│         │ ─────────────────────────────────────────────────────── │
│         │ [Identificação do paciente, quando a tela é de paciente] │
│         │ Filtros                                                 │
│         │ Conteúdo (tabela, formulário ou painel)                 │
└─────────┴─────────────────────────────────────────────────────────┘
```

- Largura máxima de conteúdo 1400 px (`container` do Tailwind). Margem lateral 16 px no celular, 24 px a partir de `md`.
- Uma única `h1` por página, no cabeçalho. Seções usam `h2`.
- O `RouteAccessibility` move o foco para o `main` e anuncia a rota na troca de página (`src/components/RouteAccessibility.tsx:46-50`). A `h1` deve ser o primeiro conteúdo do `main` para que o leitor de tela encontre o título logo em seguida.
- Abas: no máximo 5 visíveis. Acima disso, agrupar ou usar navegação secundária (CLIN-QA-019).

### 5.2 Cabeçalho de página

- Título (`h1`, `text-2xl font-semibold`), descrição opcional (`text-sm text-muted-foreground`, uma linha), ações à direita.
- No máximo uma ação principal (`Button` padrão) e duas secundárias (`outline`). Demais ações num menu "Mais ações" (`DropdownMenu`).
- No celular, as ações descem para baixo do título, com largura total; a principal fica por último, perto do polegar.
- Nada de ícone colorido em caixa ao lado do título, contadores animados ou cartões de estatística no cabeçalho. Indicadores vão numa faixa própria abaixo.

### 5.3 Tabela

- `Table` dentro de `Card` sem padding extra. Cabeçalho `text-xs font-medium text-muted-foreground`, sem caixa alta. Células `text-sm`.
- Colunas numéricas e monetárias alinhadas à direita, com `tabular-nums`. Datas no formato `dd/mm/aaaa`; horário `HH:mm`.
- Primeira coluna identifica o registro (nome do paciente completo, não abreviado). CPF sempre mascarado em listas.
- Linha clicável: a linha inteira abre o detalhe, mas existe um link ou botão real na primeira coluna para teclado. `hover:bg-muted/50`, sem `cursor-pointer` sem ação.
- Ações por linha: até 2 botões `ghost` com ícone e `aria-label`; acima disso, menu `MoreHorizontal`.
- Ordenação: cabeçalho com `button` e `aria-sort`.
- Paginação ou "Carregar mais" abaixo, com o total ("1–25 de 312").
- Celular: abaixo de `md`, a tabela vira lista de cartões com as 3 colunas mais importantes, ou rola horizontalmente dentro do próprio contêiner. A página nunca rola na horizontal.
- Seleção múltipla só quando existe ação em lote; barra de ação em lote aparece acima da tabela com a contagem selecionada.

### 5.4 Formulário

- Uma coluna por padrão; duas colunas a partir de `md` só para campos curtos e relacionados (CEP e número, data e hora).
- `Label` sempre visível acima do campo. Placeholder só como exemplo de formato ("000.000.000-00"), nunca no lugar do rótulo.
- Obrigatório marcado com "(obrigatório)" no rótulo, ou o formulário diz no topo que todos são obrigatórios e marca os opcionais. Não usar só asterisco vermelho.
- Validação ao sair do campo e ao enviar. Mensagem abaixo do campo, em `text-xs text-destructive`, ligada por `aria-describedby`, com `aria-invalid="true"`. Ao enviar com erro, foco no primeiro campo inválido e resumo no topo quando houver mais de 3 erros.
- Máscara com `MaskedInput` para CPF, telefone, CEP e moeda. O valor salvo é sem máscara.
- Botões no rodapé: principal à direita ("Salvar", "Registrar pagamento"), "Cancelar" à esquerda dela. O rótulo diz a ação, não "OK" ou "Enviar".
- Enquanto salva: botão em `LoadingButton`, campos bloqueados, sem fechar o diálogo. Depois de salvar: notificação de sucesso e foco de volta para o elemento que abriu o formulário.
- Rascunho: formulários clínicos longos usam `DraftRecoveryNotice` para recuperar o que foi digitado.
- Formulário que grava dado de paciente começa com a identificação do paciente (seção 6).

### 5.5 Filtros

- Barra acima da tabela: busca textual primeiro (`Input` com ícone e `aria-label`), depois até 3 filtros visíveis (`Select` ou `Popover` com calendário). Demais filtros em "Mais filtros" (`Sheet` no celular).
- Filtros ativos aparecem como chips removíveis com o texto do filtro e um botão "Limpar filtros".
- Busca com espera de 300 ms; os filtros ficam na URL (`searchParams`) para que voltar e compartilhar preserve o estado.
- Período padrão explícito ("Hoje", "Últimos 30 dias"), nunca vazio por omissão.
- Quando o filtro não devolve nada, usar o estado vazio de filtro (seção 5.6), não o de primeira vez.

### 5.6 Estados vazio, erro e carregamento

Toda área que busca dado trata os três estados. Uma tela sem esses estados conta como defeito.

| Estado | Componente | Conteúdo |
|---|---|---|
| Carregando | `TableSkeleton`, `FormSkeleton`, `PageSkeleton` | Esqueleto com o mesmo formato do conteúdo. Sem spinner de página inteira depois do primeiro carregamento. Recarga em segundo plano mostra só um indicador discreto no cabeçalho da área |
| Vazio, primeira vez | `EmptyState` | Título que diz o que falta ("Nenhum convênio cadastrado"), uma frase de por que importa e uma ação principal ("Cadastrar convênio") |
| Vazio por filtro | `EmptyState` com ícone `SearchX` | "Nenhum resultado para os filtros escolhidos." e a ação "Limpar filtros" |
| Erro | `ErrorState` | Mensagem traduzida (`friendlyErrorMessage` / `mensagemDeErro`), ação "Tentar novamente" e, se persistir, orientação de contato. Nunca mostrar código técnico, inglês ou `undefined` |
| Sem permissão | `ErrorState` com título "Acesso não permitido" | Diz qual perfil tem acesso. Não esconde a tela sem explicação |
| Sem conexão | `OfflineIndicator` | Mantém o que já foi carregado e avisa que alterações aguardam conexão quando houver fila |

Regras visuais:
- `EmptyState` hoje usa ícone de 40 px em caixa de 80 px com fundo da cor primária (`src/components/EmptyState.tsx:35-39`) e animação. Proposta: ícone de 24 px em `text-muted-foreground`, sem fundo colorido e sem animação de entrada.
- Erro de uma área não derruba a página: cada consulta tem seu `ErrorState` (bom exemplo: `src/pages/Recepcao.tsx:1174-1179`, citado no diagnóstico).
- `ErrorState` tem uma verificação duplicada com regex digitada errado (`2d{4}` em vez de `2\d{4}`) em `src/components/ErrorState.tsx:38`, repetindo a verificação da linha 35. É inofensiva porque a anterior já cobre o caso, mas deve ser removida pelo `frontend-developer` (CLIN-QA-031).

### 5.7 Diálogos

**Escolha do tipo.**

| Situação | Componente |
|---|---|
| Confirmar ação com consequência (excluir, cancelar consulta, estornar, liberar laudo, assinar) | `ConfirmDialog` (`AlertDialog`) |
| Formulário curto, até 6 campos | `Dialog` |
| Detalhe ou formulário longo com contexto da lista atrás | `Sheet` à direita |
| Fluxo longo (prontuário, cadastro completo) | Página própria, não diálogo |

**Diálogo de confirmação.**
- Título como pergunta com o objeto: "Cancelar a consulta de Maria Aparecida da Silva?".
- Descrição diz a consequência e se é reversível: "A vaga volta para a agenda. O paciente não é avisado automaticamente."
- Botões com o verbo: "Cancelar consulta" (destrutivo) e "Voltar". Evitar o par ambíguo "Cancelar" / "Confirmar".
- Foco inicial no botão seguro ("Voltar"). `Esc` fecha sem executar.
- Ação irreversível sobre dado clínico ou financeiro exige digitar ou selecionar o objeto (por exemplo, o nome do paciente ou o valor), além do clique.
- Enquanto executa: botão em carregamento, diálogo não fecha por clique fora (`ConfirmDialog` já tem `isLoading` e `closeOnConfirm`).
- Diálogo que registra, prescreve ou cobra mostra a identificação do paciente logo abaixo do título (seção 6).

**Acessibilidade de diálogo.** Título em `DialogTitle`, descrição em `DialogDescription` (ou `aria-describedby={undefined}` declarado). Foco preso dentro; ao fechar, volta ao elemento de origem. Altura máxima de 90 vh com rolagem só no corpo; título e rodapé de ações fixos.

### 5.8 Notificações

- `sonner`, no canto inferior direito; no celular, acima da navegação inferior.
- Sucesso some em 4 s. Erro fica até ser fechado e traz a mensagem traduzida.
- Texto: frase curta com o objeto e sem exclamação ("Pagamento de R$ 150,00 registrado."). Ação de desfazer quando a operação permitir.
- Notificação não substitui erro de campo nem confirmação de ação irreversível.

## 6. Identificação do paciente

Obrigatória em toda tela ou diálogo onde se registra, prescreve ou cobra algo de um paciente. Especificação completa em `docs/ux/telas/identificacao-paciente.md`. Componente: `src/components/clinical/IdentificacaoPaciente.tsx` (em construção pelo `frontend-developer` na rodada 1).

## 7. Acessibilidade e teclado (WCAG 2.2 AA)

- Contraste: 4,5:1 para texto normal, 3:1 para texto a partir de 18,66 px em negrito ou 24 px, e 3:1 para contorno de campo, ícone que transmite informação e anel de foco.
- Foco visível em todo elemento interativo (`*:focus-visible` em `src/index.css`). Não remover `outline` sem substituto.
- Alvos de toque com no mínimo 24 × 24 px (2.5.8); 44 × 44 px no celular para ações principais.
- Ordem de tabulação segue a leitura. `SkipLink` (`ui/skip-link.tsx`) presente no layout.
- Mudanças assíncronas importantes (paciente chamado, pagamento registrado, erro ao salvar) anunciadas por `aria-live="polite"`; erro bloqueante por `role="alert"`.
- Atalhos só quando funcionam e estão listados em `KeyboardShortcutsDialog` (CLIN-QA-018 e CLIN-QA-035). Atalho de uma tecla só ativo fora de campos de texto.
- Verificação automática: `npm run check:a11y`. Teste manual com teclado e NVDA nas 5 telas diárias antes de cada liberação.

## 8. Redação

- Português formal, voz ativa, sem exclamação, sem emoji, sem caixa alta para ênfase ("ALERTA DE ALERGIAS" em `AllergyAlert.tsx:37` vira "Alergias").
- Botão diz o que faz: "Registrar pagamento", não "Confirmar".
- Datas `27/10/2026`, horários `14:30`, moeda `R$ 1.250,00`, idade "42 anos".
- Não prometer o que o sistema não faz (por exemplo, "a operadora responderá aqui" quando não existe integração; CLIN-QA-023).
- Codificação UTF-8. Nenhum `Ã§`, `Ã£` ou `Ã©` no código (CLIN-QA-018).

## 9. Checklist de revisão de tela

Use antes de aprovar qualquer tela nova ou alterada.

**Visual**
- [ ] Nenhuma cor fixa (hex, `rgb`, `text-blue-600`); só tokens.
- [ ] Nenhum degradê, brilho, vidro, emoji ou exclamação.
- [ ] Nenhum texto abaixo de 12 px; dado clínico importante com 14 px ou mais.
- [ ] Uma ação principal por área.
- [ ] Estado indicado por texto, não só por cor.

**Paciente**
- [ ] Se registra, prescreve ou cobra: identificação do paciente visível sem rolagem, com nome completo, data de nascimento, idade e alergias.
- [ ] CPF mascarado em listas e cabeçalhos.

**Estados**
- [ ] Carregamento com esqueleto no formato do conteúdo.
- [ ] Vazio de primeira vez e vazio por filtro distintos.
- [ ] Erro traduzido, com "Tentar novamente".
- [ ] Botão de salvar bloqueado durante o envio; sem envio duplo.

**Formulário e diálogo**
- [ ] Rótulo visível em todo campo; erro ligado ao campo.
- [ ] Confirmação com verbo e objeto; foco inicial no botão seguro.
- [ ] Foco volta ao elemento de origem ao fechar.

**Acessibilidade**
- [ ] Fluxo completo só com teclado.
- [ ] Contraste conferido nas combinações novas.
- [ ] `npm run check:a11y` sem erro novo.
- [ ] Funciona em 360 px de largura sem rolagem horizontal da página.

**Texto**
- [ ] Português formal, sem mojibake, datas e moeda no formato brasileiro.

## 10. Plano de adoção

| Ordem | Ação | Dono | Item |
|---|---|---|---|
| 1 | Componente `IdentificacaoPaciente` e integração em prontuário, prescrição e diálogos de pagamento | Frontend | CLIN-QA-012 |
| 2 | Ajuste dos tokens de estado e de `input` (seção 3.1), com captura antes e depois das 5 telas diárias | Frontend + Designer | CLIN-QA-031 |
| 3 | Script versionado de contagem de cores fixas e texto menor que 12 px, com teto no CI que só pode cair | Frontend + DevOps | CLIN-QA-031 |
| 4 | Remover `text-[9px]`, `text-[10px]` e `text-[11px]` nas 5 telas diárias (Agenda, Recepção, Fila, Prontuários, Caixa) | Frontend | CLIN-QA-019 |
| 5 | Trocar `const C` de `LandingPage.tsx:53` e o `.brand-loader` por tokens | Frontend + Growth | CLIN-QA-031 |
| 6 | Remover classes e animações do visual anterior (seção 4) quando o uso chegar a zero | Frontend | CLIN-QA-031 |
| 7 | Decidir se o modo escuro volta; se voltar, definir `.dark` com os mesmos critérios de contraste | Designer | — |
