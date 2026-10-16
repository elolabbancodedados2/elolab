# Deduplicar notificações por evento

**Goal:** Agrupar notificações repetidas sobre a mesma origem e permitir abrir o recurso relacionado.

**Evidence:** Agrupamento por tipo e ID da origem, badge com quantidade de ocorrências e regra não lida enquanto qualquer cópia estiver pendente.

### Tasks

- [x] Adicionar agrupador puro e testes para deduplicação e precedência de leitura.
- [x] Integrar grupos na central, preservando navegação e leitura.
- [x] Validar a jornada em Playwright, Vitest, TypeScript, build e checks do projeto.
- [x] Marcar item #81 concluído no roadmap.
