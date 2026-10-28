# Time EloLab

Dezesseis funções e um gate de qualidade, todos definidos como subagentes em `.claude/agents/`. Regras comuns: `docs/time/REGRAS_DO_TIME.md`.

## Composição

| # | Função | Agente | Pode editar código? | Entregável principal |
|---|---|---|---|---|
| 1 | Product Manager | `product-manager` | Não | `docs/produto/estrategia/` |
| 2 | Product Owner | `product-owner` | Não | `docs/produto/backlog/` |
| 3 | Business Analyst | `business-analyst` | Não | `docs/produto/processos/` |
| 4 | Software Architect | `software-architect` | Só docs | `docs/arquitetura/adr/` |
| 5 | Tech Lead | `tech-lead` | Sim | plano de execução e revisão |
| 6 | UX Researcher | `ux-researcher` | Não | `docs/ux/pesquisa/` |
| 7 | Product Designer | `product-designer` | UI e tokens | `docs/ux/design-system/` e componentes |
| 8 | Frontend Developer | `frontend-developer` | Sim | código em `src/` |
| 9 | Backend Developer | `backend-developer` | Sim | `supabase/functions/` e `src/lib/` |
| 10 | Database Engineer | `database-engineer` | Sim, migrations locais | `supabase/migrations/` |
| 11 | QA Engineer | `qa-engineer` | Só testes | `tests/`, `__tests__/` e `docs/qa/` |
| 12 | Security Engineer | `security-engineer` | Não | `docs/seguranca/` |
| 13 | DevOps / SRE | `devops-sre` | CI, Docker e docs | `.github/`, `docker/` e `docs/operations/` |
| 14 | Especialista de Domínio | `especialista-dominio-saude` | Não | `docs/produto/dominio/` |
| 15 | Growth / Marketing | `growth-marketing` | Landing (com o designer) | `docs/gtm/` |
| 16 | Sales / Customer Success | `sales-customer-success` | Não | `docs/gtm/vendas-cs/` |
| — | Gate de qualidade | `clinical-quality-director` | Não | veredito GO/NO-GO |

## Fluxo de uma entrega
1. **Descoberta**
   - `product-manager` define o problema, o segmento e a métrica.
   - `ux-researcher`, `business-analyst` e `especialista-dominio-saude` trazem evidências do uso real e das regras do setor.
   - `growth-marketing` e `sales-customer-success` informam o impacto comercial.
2. **Definição**
   - `product-owner` escreve as histórias com critérios de aceite.
   - `product-designer` desenha o fluxo e a tela.
   - `software-architect` registra uma ADR quando a mudança afeta a estrutura.
3. **Construção**
   - `tech-lead` divide o trabalho e define a ordem.
   - `database-engineer`, `backend-developer` e `frontend-developer` implementam.
4. **Verificação**
   - `qa-engineer` testa contra os critérios de aceite.
   - `security-engineer` revisa acesso e isolamento.
   - `devops-sre` confere o build, o CI e a operação.
5. **Gate:** `clinical-quality-director` consolida e dá GO, GO CONDICIONAL ou NO-GO.
6. **Publicação:** só com pedido explícito do responsável.

## Como acionar
- Peça pelo nome, por exemplo: "use o product-owner para quebrar o item CLIN-QA-202 em histórias".
- Para uma iniciativa inteira, peça ao `tech-lead` um plano com as etapas acima.
- Itens mudam de dono pelo backlog em `docs/produto/backlog/`, sempre com o ID `CLIN-QA-###`.

## Escritório visual (Pixel Agents)
- Servidor local na porta 3100. Ele inicia com o Windows (`C:\Users\lopes\tools\pixel-agents-elolab.ps1`, chamado por um atalho na pasta Inicializar) e grava log em `~/.pixel-agents/server.log`.
- Endereço: `http://127.0.0.1:3100/?token=<token>`. O token fica em `~/.pixel-agents/standalone-token`; não compartilhe o link.
- Em **+ Agent**, os itens de "01 Product Manager" a "17 Quality Director" abrem o Claude Code já no papel do agente.
- Cada agente tem uma pasta local em `.time/<agente>/`, ignorada pelo git só nesta máquina, com:
  - `"agent": "<nome>"`;
  - um `CLAUDE.md` que aponta para a raiz do repositório;
  - travas em `permissions.deny`.
- As travas valem mesmo com Skip Permissions ligado:
  - **Todos os agentes:** sem push, deploy, `supabase db push`, `supabase link`, `supabase migration repair`, SSH, `psql`, `rm -rf`, `git reset --hard` e leitura de `.env`.
  - **Agentes só de documentação** (PM, PO, BA, arquiteto, UX Research, especialista, growth, sales, segurança e diretor): também não editam `src/`, `supabase/`, `tests/`, `.github/`, `docker/`, `scripts/` e `public/`.
- Para abrir todos os agentes de uma vez no escritório, rode `node scripts/time/abrir-agentes-pixel.mjs`. Para abrir só alguns, passe os nomes: `node scripts/time/abrir-agentes-pixel.mjs tech-lead qa-engineer`.
- A planta do escritório é gerada por `scripts/time/gerar-escritorio.js`. Rode com o servidor parado.
- Correção local no Windows: o `dist/cli.js` do pixel-agents 1.5.0 foi alterado para abrir `claude.exe`; o original está em `cli.js.orig`. Uma atualização do pacote desfaz a correção, então reaplique depois de atualizar.
- Fora do Pixel Agents: `powershell -File scripts/time/abrir-terminais.ps1` abre uma aba do Windows Terminal por agente.

## Prioridade atual
Siga o roadmap e os gates de `docs/estrategia/DIAGNOSTICO_16_FUNCOES.md`. Comece pela estabilização: isolamento entre clínicas, drift do banco, backup e staging. Diferenciação e vendas a novos segmentos só depois.
