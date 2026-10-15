# Redesign visual v2 — "Intellecta" (substitui o Clássico Premium violeta)

**Data:** 15/10/2026
**Status:** aprovado visualmente pelo responsável via mockups no canvas (Orca); aguardando aprovação deste documento antes do plano de implementação.

## Contexto

O app já passou por um redesign completo ("Clássico Premium": violeta `#5B47E0` + âmbar + Manrope), aplicado e testado em praticamente todas as ~90 rotas (ver `docs/REDESIGN_PLANO.md` e `docs/HANDOFF_DESIGN_COMERCIALIZACAO.md`), com centenas de testes Playwright de captura visual e contraste WCAG amarrados aos tokens atuais.

O responsável pediu um visual "totalmente novo". Depois de testar e rejeitar várias direções geradas às cegas (paletas inéditas, réplicas literais de concepts de Dribbble com emoji/gradiente — descritas por ele como "cara de IA"), chegamos por iteração a uma direção aprovada com base em referências reais: um dashboard de produtividade no estilo "Intellecta" (fundo claro, cards soltos, rail de navegação com degradê, paleta quase monocromática com acentos pontuais de cor) combinada com uma barra de horário em pílula flutuante (de uma referência de CRM) e um padrão de fila colorida por status (de uma referência da Salesforce).

Esta é uma mudança **de token/identidade**, não de arquitetura de componentes: a decisão já tomada antes (ver histórico de conversa) foi trocar a paleta/tipografia nos tokens centrais, preservando `PageHeader`, `EmptyState`, a estrutura de sidebar e os testes de contraste/a11y já validados — não reconstruir cada tela do zero.

## Por que essa direção (não as anteriores)

As tentativas anteriores (violeta descartado; depois 4 paletas inéditas; depois réplica literal de um CRM com emoji e blobs gradiente) foram todas rejeitadas. O padrão comum nas referências que o responsável de fato aprovou — "Intellecta", o app de arquivos, o SugarCRM, o app de tutoria, o app fitness, a Salesforce — é:

- Cor quase ausente: predomínio de preto, branco e cinza.
- Cor usada apenas como **dado** (status de uma fila, categoria de um bloco de agenda, um indicador de progresso) nunca como decoração geral da tela.
- Avatares foto-realistas (fotos reais de pessoas), nunca blocos de cor com iniciais nem gradientes "blob".
- Ícones de linha reais (não emoji).
- Cards brancos soltos com sombra suave, cantos bem arredondados, bastante espaço em branco.
- Botões de ação primária em preto (pílula), não na cor de marca.

## Tokens

Reaproveitar os mesmos nomes de tokens já usados pelo design system atual (`src/index.css`, `tailwind.config.ts`, `DESIGN.md`), só trocando os valores:

| Token | Valor novo | Uso |
|---|---|---|
| `background` | `#EDEDF3` | fundo da página |
| `card` | `#FFFFFF` | cartões, painéis |
| `foreground` | `#1B1B1F` | texto principal |
| `muted` / `muted-foreground` | `#F2F2F5` / `#9A9A9A` | superfícies e texto secundário |
| `primary` (ação) | `#111111` | botões primários, chips ativos, rail ativo |
| `sidebar` | degradê `#F3F3F6 → #8E82DD` (claro no topo, lilás na base) | rail de navegação |
| `brand-accent` | degradê `#1080CA → #2ED5E7` (azul→ciano da logo EloLab) | reservado a indicadores "ao vivo/agora" (barra de horário) e à marca — não usar em mais nada |
| `success/destaque` | `#CFF34D` (verde-limão) | blocos de agenda em andamento, check de tarefa concluída |
| `neutro secundário` | `#E7E7EA` | blocos de agenda neutros |
| `terciário` | `#8E82DD` (lilás) | blocos de agenda tipo "intervalo", tags de "1ª consulta" |
| `destructive` | mantém o semântico atual (`#E5463B`/`#FBDAD7`) | urgência, erro, cancelamento |
| `info` | `#1080CA`/`#D8F6F8` | tag "retorno" |

Cores semânticas de sucesso/alerta/erro/informação **continuam reservadas ao significado**, igual à regra já documentada no `DESIGN.md` atual — isso não muda.

## Tipografia

- Títulos de saudação/hero (`h1` de página, estilo "Bom dia, Dra. Marina!"): **Baloo 2** (700/800) — única concessão "lúdica", só em títulos curtos de boas-vindas.
- Todo o resto (corpo, tabelas, formulários, dados clínicos/financeiros): **Inter** (400–700) — mantém a leitura densa e séria que módulos clínicos/financeiros exigem. Não usar Baloo 2 em dado clínico, valor monetário ou tabela.

## Componentes novos/alterados

1. **Barra de horário em pílula** (novo componente, topo de Recepção/Agenda/Dashboard): trilho preto com 3 segmentos (anterior, atual, próximo); o segmento "atual" usa o degradê azul→ciano da marca; avatares das pessoas envolvidas; ícones de atalho à direita (expandir, notificação, perfil).
2. **Rail de navegação** (substitui o sidebar atual): ícones em círculo, item ativo em preto sólido, fundo com degradê claro→lilás na base, toggle de colapsar no topo.
3. **Fila por status** (novo componente de lista, ex.: fila de pacientes/tarefas): card branco com **barra lateral colorida por status** (vermelho=urgente, azul=retorno, lilás=1ª consulta/nova), avatar, nome, papel/contexto, tag e ação.
4. **Bloco de agenda tipo gantt**: trilha horizontal por hora com blocos coloridos (limão=em andamento, cinza=neutro, lilás=intervalo) e avatares empilhados.
5. **Painel do Agente IA** (reaproveita o painel de chat da referência): tabs (ajuda/chat/config), bolha de mensagem, input com anexo/emoji/áudio — pode futuramente hospedar o chat real do Agente IA do WhatsApp.
6. **Estatística inline com badge de variação**: número grande + seta/variação em pílula pequena (substitui os cartões de KPI coloridos usados na v1 deste redesign, rejeitados por ficarem "genéricos").
7. **Avatares**: sempre foto (produção) ou, na ausência de foto, círculo neutro em gradiente foto-realista (tons terrosos/neutros) — nunca iniciais sobre cor chapada, nunca blob de gradiente colorido.
8. **Ícones**: biblioteca de ícones de linha já usada no app (`lucide-react`) — não introduzir emoji em nenhuma tela.

## O que NÃO muda

- Arquitetura de componentes (`PageHeader`, `EmptyState`, estrutura de rotas, lógica de dados).
- Cores semânticas de sucesso/alerta/erro/informação e seu significado.
- Testes de contraste/a11y — serão revalidados com os novos valores de token, não removidos.
- Módulo financeiro de pacientes (`pagamentos_mercadopago`, `lancamentos`) — fora de escopo, conforme regra do projeto.
- Nenhuma migration, deploy ou alteração de produção — só frontend.

## Escopo e fora de escopo desta spec

Dentro: tokens globais (`src/index.css`, `tailwind.config.ts`), o rail de navegação (`Sidebar.tsx`), a barra de horário (novo componente), e o rollout módulo a módulo reaproveitando os padrões acima (fila por status, estatística inline, avatares).

Fora: redesenhar manualmente cada tela do zero sem reaproveitar os padrões acima; qualquer mudança em `Planos.tsx`/`PlanoCheckout.tsx`/arquivos de cobrança Mercado Pago (fora de escopo deste redesign, igual ao handoff anterior).

## Validação

Mesma barra de qualidade já em uso no app: `npx tsc --noEmit`, `npx vitest run` (suíte completa), `npx eslint`, `npx playwright test tests/ux-visual-synthetic.spec.ts` (baselines visuais precisarão ser regeneradas e re-inspecionadas tela por tela), `npm run check:a11y`. Nenhuma migration/deploy.
