# Rodada 1: frontend-developer

Data: 27/10/2026. Item: CLIN-QA-012 (identificação do paciente). Especificação seguida: `docs/ux/telas/identificacao-paciente.md` (product-designer).

## O que fiz

Concluí o componente de identificação do paciente, que estava parcial desde uma execução interrompida, e cobri com a seção 9 da especificação o que ainda faltava:

- Nome completo (16 px/600 na página, 14 px/600 no diálogo), sem truncar (`break-words`). Nome social abaixo, com rótulo.
- Data de nascimento (`parseDateOnly`, sem deslocamento de fuso) e idade por extenso: dias para menores de 1 mês, meses para menores de 1 ano e anos a partir daí.
- CPF mascarado `***.***.***-12`. O número completo nunca entra no DOM. O leitor de tela lê "Mascarado, final 12".
- Alergias em três estados: `null` mostra "Alergias não informadas" (com ícone e, em `contexto="prescricao"`, o pedido "Confirme com o paciente antes de prescrever."); `[]` mostra "Nenhuma alergia conhecida"; uma lista mostra um `Badge destructive` por item, sem pulso, e o aviso para leitor de tela. Itens duplicados ou em branco são descartados.
- Convênio opcional (prop omitida não exibe o campo; `null` ou vazio mostra "Particular").
- Variantes `pagina` (padrão) e `dialogo` (compacta, rótulos só para leitor de tela).
- Estados: carregando (`aria-busy`, esqueleto), sem paciente, erro (`ErrorState` compacto, mensagem traduzida, "Tentar novamente", sem mostrar dados do paciente) e carregado.
- Troca de paciente com a tela aberta: anúncio em `aria-live="polite"` ("Paciente alterado para …").
- Acessibilidade: `section` com `aria-label="Identificação do paciente"`, pares em `dl/dt/dd`, alergias em `ul` nomeada e ícones com `aria-hidden`. Usa só tokens e componentes de `src/components/ui`.
- Movi `mascararCpf` e `descreverIdade` para `src/lib/identificacaoPaciente.ts`, o que elimina os avisos `react-refresh/only-export-components`.

Não integrei o componente em nenhuma tela, como pede a tarefa.

## Arquivos tocados (todos novos, não rastreados)

- `src/components/clinical/IdentificacaoPaciente.tsx`
- `src/lib/identificacaoPaciente.ts`
- `src/components/clinical/__tests__/IdentificacaoPaciente.test.tsx`
- `docs/time/rodada-1/frontend-developer.md`

## Evidências

| Comando | Resultado |
|---|---|
| `npx vitest run src/components/clinical/__tests__/IdentificacaoPaciente.test.tsx` | 1 arquivo, 22 testes aprovados |
| `npx eslint` nos 3 arquivos | 0 erros, 0 avisos |
| `npx tsc --noEmit -p tsconfig.app.json` | saída 0, sem erros (rodado uma vez porque a tarefa pede) |
| `npm run check:a11y` | "OK — controles têm nome acessível e não há interativos aninhados." |
| `npm run check:falhas` | "0 caso(s) em 0 arquivo(s)" |

Os testes cobrem os itens 1 a 6 da seção 10 da especificação: 68 anos para 03/05/1958, "12 dias" e "8 meses", CPF fora do DOM, os três estados de alergia, `aria-busy`, ausência de `text-[9–11px]` e de `animate-pulse`. Cobrem também a variante diálogo, o erro com nova tentativa e o anúncio de troca. O item 7 (axe) ficou NÃO VERIFICADO porque o projeto não tem `vitest-axe` nem `jest-axe` no `package.json`. O teste completo (`npm run test:run`) e o lint do projeto inteiro ficam para a verificação única da rodada (qa-engineer ou tech-lead), conforme `REGRAS_DO_TIME.md`. Não abri o app no navegador.

## Decisões e divergências da especificação

- **Token `warning-text`:** não existe em `src/index.css` nem em `tailwind.config.ts`, e criá-lo está fora dos arquivos desta tarefa. Por isso, "não informada" e "não informadas" aparecem em `foreground` com ícone de alerta, e não em `text-warning`, que reprova em contraste (2,32:1, conforme `docs/ux/design-system/README.md:43`). Quando o token existir, basta trocar a classe no componente `Ausente`.
- **Idade sem data de nascimento:** quando a data falta ou é inválida, o campo "Idade" é omitido e só a data mostra "Não informada", para não repetir o aviso.
- **Data de nascimento no futuro:** aparece como "0 dias" (dado inválido no cadastro). Não bloqueei.
- **`ErrorState` compacto ignora `title`** (`src/components/ErrorState.tsx:87-105`), então o título vai no `description`, junto da mensagem traduzida por `friendlyErrorMessage`.
- **`ErrorState`** tem `animate-fade-in` no estado de erro. O critério "sem animação" da especificação vale para o estado carregado, que está coberto por teste.

## Riscos

- `pacientes.alergias` tem padrão `'{}'`. Se uma tela passar a lista vazia do banco sem convertê-la em `null`, o componente mostra "Nenhuma alergia conhecida" para quem nunca foi perguntado. O risco é assistencial, e a conversão fica a cargo de quem integrar o componente (ver a especificação, §5.3). O campo de confirmação depende do database-engineer e do business-analyst.
- Ainda não implementado (fase 2): revelar o CPF com auditoria, carteirinha e validade, aviso de homônimo e ordem do nome social (requer avaliação especializada).

## Próximo dono

- **frontend-developer (rodada 2):** integrar nas telas de prioridade 1 (`Prontuarios.tsx`, `Prescricoes.tsx`, `Recepcao.tsx`) quando a outra frente liberar esses arquivos.
- **product-designer / frontend:** criar o token `--warning-text`.
- **qa-engineer:** testes manuais da seção 10 após a integração, além da suíte completa.
