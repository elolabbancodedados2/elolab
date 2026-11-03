# QA e UX por área — plano de execução

**Objetivo:** encontrar e corrigir falhas reproduzíveis da equipe e do portal do paciente no worktree atual.

**Arquitetura:** manter os componentes, hooks e serviços existentes. Reproduzir cada problema com a clínica sintética antes de aplicar a menor correção e acrescentar regressão.

**Stack:** React/Vite, TypeScript, Supabase, Vitest e Playwright.

**Especificação:** pedido do responsável nesta sessão, em 03/11/2026.

## Restrições

- Executar uma área por vez, com um subagente ativo e Playwright `--workers=1`.
- Não iniciar Docker, WSL ou Supabase local; não acessar produção, SSH, secrets ou arquivos `.env*`.
- Não alterar cobrança dos planos, aplicar migrations, atualizar dependências, publicar, fazer push ou abrir PR.
- Preservar UTF-8 e as convenções do repositório. Commits pequenos em português.
- Usar `tests/helpers/syntheticClinic.ts`, viewports 1280 e 390 e portas 4181–4185; encerrar Vite ao terminar cada área.
- Logs, capturas e relatórios de execução ficam em `test-results/`, sem commit.

## Execução

Cada área lê seus componentes e testes existentes, executa typecheck e Vitest, percorre as telas com Playwright, registra erros de console/rede e verifica overflow, rótulos, confirmação e feedback. Uma falha não trivial precisa de teste vermelho antes da correção e verde depois. Registrar arquivos/linhas, comandos, resultados e limitações. Revisar o diff antes de iniciar a próxima área.

- [ ] Área 1 — Estoque, compras e fornecedores. Porta 4181. Base: `tests/qa-area1-estoque-compras.spec.ts`, `tests/stock-task-pages.spec.ts`, `tests/inventory-workspace.spec.ts`.
- [ ] Área 2 — Convênios, TISS, guias e glosas. Porta 4182. Base: `tests/qa-convenios-r2.spec.ts`, `tests/tiss-*.spec.ts`, `tests/agreement-pages.spec.ts`, `tests/external-guide*.spec.ts`.
- [ ] Área 3 — Relatórios, indicadores, DRE, CSV/PDF. Porta 4183. Base: `tests/qa-loop-relatorios.spec.ts`, `tests/qa-analytics-*.spec.ts`, `tests/qa-saved-report-edit.spec.ts`.
- [ ] Área 4 — Comunicação, teleconsulta, equipe e permissões. Porta 4184. Base: `tests/qa-loop-comunicacao.spec.ts`, `tests/teleconsulta.spec.ts`, `tests/qa-equipe-suporte-interactions.spec.ts`, `tests/perfis-*.spec.ts`. Incluir comunicação do portal.
- [ ] Área 5 — Configurações, onboarding, plataforma, erros, acesso e modo escuro. Porta 4185. Base: `tests/qa-configuracoes-r2.spec.ts`, `tests/qa-loop-transversal.spec.ts`, `tests/onboarding-clinica-solo.spec.ts`, `tests/initial-product-tour.spec.ts`. Incluir recuperação de acesso do paciente.
- [ ] Revisar o conjunto, executar typecheck, Vitest completo e a seleção Playwright sintética das cinco áreas em série. Conferir branch, commits, ausência de artefatos versionados e servidores restantes.

## Foco da revisão

- Falha de rede não pode aparecer como sucesso nem apagar o trabalho digitado.
- Perfil sem permissão deve receber orientação e não disparar escritas proibidas.
- Valores, datas e filtros precisam produzir os mesmos resultados em tela e exportações.
- Ações precisam de nome acessível e os fluxos devem caber em celular.
- Confirmações destrutivas e estados vazios devem ter uma saída compreensível.
