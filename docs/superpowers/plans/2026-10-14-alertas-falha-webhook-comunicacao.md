# Alertas de falha em webhook de comunicação

**Objetivo:** tornar falhas de processamento do webhook WhatsApp visíveis aos administradores da clínica, com diagnóstico técnico seguro e sem dados pessoais ou clínicos.

### Etapas

- [x] Adicionar contrato de persistência atômica, com deduplicação por clínica e hora e execução exclusiva por service role.
- [x] Registrar falha de processamento após identificação da clínica sem gravar corpo, número, evento externo ou texto de erro bruto.
- [x] Usar a central de notificações existente para alertar administradores da clínica.
- [x] Expor contagem agregada no diagnóstico de saúde da plataforma.
- [x] Testar contrato SQL, sanitização, autorização e visibilidade em navegador.
- [x] Validar TypeScript/build/checks e registrar limites de execução sem Deno/Supabase.
- [x] Atualizar roadmap.

### Validação

- Vitest: 5/5 (contrato de alerta e autorização do diagnóstico).
- Playwright Chromium: 2/2 na central de notificações; o alerta técnico é exibido e não carrega dados de paciente.
- `npx tsc --noEmit`, `npm run build` e checks `permissoes`, `a11y`, `colunas` e `falhas` passaram.
- ESLint: zero erros e 41 avisos `no-explicit-any` nos arquivos verificados.
- Parser TypeScript confirmou sintaxe do webhook WhatsApp e do diagnóstico de saúde.
- A migration não foi aplicada, não houve chamada ao Supabase, e Deno não está instalado nesta máquina. Falhas sem clínica resolvida (por exemplo, token inválido) não recebem alerta por clínica.
