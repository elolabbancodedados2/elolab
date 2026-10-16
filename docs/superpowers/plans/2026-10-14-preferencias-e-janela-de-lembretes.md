# Preferências e janela de contato para lembretes

**Objetivo:** respeitar a preferência de canal e a janela de contato individual antes de enviar lembretes de consulta.

### Etapas

- [x] Criar política pura para escolha de canal e janela local, incluindo virada da meia-noite e ausência de preferência persistida.
- [x] Testar os casos de política antes da integração (5/5).
- [x] Persistir preferência do paciente com defaults compatíveis e validadores no banco (migration criada, não aplicada).
- [x] Adicionar edição acessível dos campos de preferência no cadastro do paciente.
- [x] Integrar a política aos envios de lembrete de 24h e 2h e às confirmações, com revalidação no worker.
- [x] Testar integração, TypeScript, build, checks e fluxo relevante no navegador.
- [x] Atualizar roadmap com alcance e evidências reais.

### Validação

- Vitest: 22/22 em cinco arquivos.
- Playwright Chromium: 2/2; formulário sintético salvou os novos campos no payload e a fila continuou sem expor dados privados.
- `npx tsc --noEmit`, `npm run build`, checks `permissoes`, `a11y`, `colunas` e `falhas` passaram.
- ESLint: zero erros; 66 avisos da regra `no-explicit-any` nos arquivos verificados.
- Parser TypeScript confirmou sintaxe das duas Edge Functions e do helper compartilhado. Deno não está instalado nesta máquina, então não houve typecheck/runtime Deno.
