# Padrão visual azul/preto (fase 2 do redesign)

Guia curto para refazer uma tela no padrão já aplicado em Dashboard, Tarefas, Minha fila, Agenda, Recepção e caixa, Fila, Pacientes, Financeiro e Salas e lista de espera. Referências de código: `src/pages/Fila.tsx` (indicadores e cabeçalho), `src/pages/Salas.tsx` e `src/pages/ListaEspera.tsx` (indicadores clicáveis, filtros em pílula, destaque "próximo", tabela).

## Cores e tokens

- Azul da marca `#1080CA`; degradê `bg-gradient-primary` (classe utilitária já existente) para a ação principal/positiva.
- Preto `#111111` (hover `#2b2b33`) para o botão primário do cabeçalho e para o card de destaque escuro. Número em destaque dentro do card escuro em ciano `#2ED5E7`.
- Azuis claros de apoio: fundo `#F3F8FC` / `#EEF4FA`, bordas `#DCE6F2` / `#BFD8EE`, hover de borda `#9CC7EC`.
- Status continuam semânticos: `success`, `warning`, `destructive`, `info`.
- Não usar lilás, roxo nem verde-limão como acento. Não usar `primary` solto para acentos novos; preferir `#1080CA`.

## Estrutura da tela

1. `PageHeader` com título, descrição dinâmica (contagens do dia, ex.: `12 pedidos ativos · 3 urgentes`) e ações:
   - secundárias em `variant="outline" className="rounded-full gap-2"`;
   - botão de atualizar `size="icon" className="rounded-full"`;
   - ação principal: `className="rounded-full bg-[#111111] text-white shadow-md hover:bg-[#2b2b33]"`.
2. Faixa de indicadores (`grid grid-cols-2 md:grid-cols-4` ou `xl:grid-cols-5`), cada um um `<button aria-pressed>` que filtra a lista ao clicar:
   - `rounded-2xl border border-border/60 bg-card shadow-xs hover:-translate-y-0.5 hover:shadow-md`;
   - o indicador mais importante é escuro: `border-transparent bg-[#111111] text-white` com ícone em `bg-white/15 text-[#2ED5E7]`;
   - ícone em bloco `h-10 w-10 rounded-xl` com fundo `bg-<cor>/10`; número `text-2xl font-bold tabular-nums`; legenda `text-[11px] text-muted-foreground`.
3. Destaque "próximo" (quando fizer sentido): card `rounded-2xl border-[#1080CA]/30 shadow-[0_8px_24px_rgba(16,128,202,0.12)]`, ícone em bloco `bg-gradient-primary`, rótulo `text-[11px] uppercase tracking-wide text-[#1080CA]`, nome `text-lg font-bold`, ações à direita.
4. Filtros: busca `h-10 rounded-full pl-9 focus-visible:ring-[#1080CA]`; selects `h-10 rounded-full`; filtros rápidos em pílulas `<button aria-pressed>` (`h-8 rounded-full border px-3 text-xs`; ativo = `border-transparent bg-gradient-primary text-white shadow-sm`); botão "Limpar filtros" aparece só quando há filtro; contador `x de y` alinhado à direita.
5. Listas/tabelas: card `rounded-2xl border-border/60 shadow-xs`; tabela dentro de `overflow-hidden rounded-xl border border-border/60`; badges `rounded-full`; posição/ordem em círculo (`h-7 w-7 rounded-full bg-[#111111] text-white` para o primeiro, `bg-muted` nos demais).
6. Botões de linha: `h-9 rounded-full text-xs`. Hierarquia: neutro → `variant="outline"`; avança o fluxo → preto; conclui/positivo → `bg-gradient-primary text-white shadow-[0_4px_12px_rgba(16,128,202,0.35)] hover:brightness-110`; destrutivo → `ghost` com `text-destructive`.
7. Agrupamentos: cabeçalho com ícone em bloco `h-8 w-8 rounded-xl bg-gradient-primary text-white` + título `text-base font-semibold` + badge de contagem `rounded-full border-[#BFD8EE] text-[#1080CA]`.
8. Estado vazio: ícone em bloco `h-14 w-14 rounded-2xl bg-gradient-primary text-white shadow-md`, título em `text-foreground`, texto de orientação, ação principal preta ou "Limpar filtros" outline. Preservar os textos que os testes de navegador procuram.

## Funções a completar junto com o visual

Ao refazer a tela, acrescentar o que falta para o fluxo ficar completo, sem mudar o banco: atalho WhatsApp via `linkWhatsApp` de `src/lib/whatsapp.ts`; filtros rápidos e ordenação; links cruzados para a tela seguinte do fluxo; descrição com contagens; estado vazio com próximo passo; ações inline que hoje exigem abrir outra tela. Não alterar `pagamentos_mercadopago`/`lancamentos` e não tocar em cobrança de planos.

## Verificação

- `npx tsc --noEmit -p tsconfig.app.json` sem erros.
- `npx eslint <arquivo>` sem erros novos (avisos de `any` preexistentes são aceitos).
- Manter textos, `aria-label` e `role` que `tests/ux-visual-synthetic.spec.ts` e os testes em `src/**/__tests__` consultam para a rota.
- Arquivos podem estar em CRLF no disco; normalizar antes de substituir texto por script.

## `framer-motion` nas telas de referência

`Fila.tsx`, `Pacientes.tsx` e `Recepcao.tsx` (citadas acima como referência de indicadores/cabeçalho) ainda usam `framer-motion` para microanimação de cartões (hover, stagger, layout). Isso é aceito nessas três telas — não removê-lo delas sem necessidade, pelo risco de regressão em UX já validada. Para toda tela nova ou refeita depois dessas, a convenção passou a ser não introduzir `framer-motion`; usar `transition`/`animate-in` do Tailwind quando precisar de alguma animação simples.
