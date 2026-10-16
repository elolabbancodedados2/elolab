# Versão publicada e disponibilidade no painel admin

## Auditoria local

- O processo de build já gerava `dist/version.json` com `build_id` e `built_at` e verificava o SHA embutido nos bundles.
- O smoke de produção já conferia a versão servida, mas o painel administrativo não mostrava o SHA/horário nem resultados de disponibilidade.
- Não havia uma verificação pública, sem dados, para confirmar execução de uma consulta no PostgreSQL pelo PostgREST.

## Implementação

1. Mostrar SHA e horário do build no painel do proprietário.
2. Checar `version.json`, o health endpoint público do Supabase Auth e uma RPC pública que executa somente `SELECT` constante no banco.
3. Aplicar timeout, mostrar apenas `Disponível/Indisponível` e deduplicar chamadas concorrentes.
4. Adicionar teste unitário dos caminhos de sucesso/falha, contrato da RPC e jornada sintética autenticada.

## Evidência

- Vitest: `platformRuntimeStatus.test.ts` e `publicAvailabilityMigration.test.ts`, 5/5, incluindo timeout de banco.
- Playwright Chromium sintético: `tests/admin-build-health.spec.ts`, 1/1, incluindo atualização manual.
- PostgreSQL parser: 4 instruções parseadas; TypeScript, build e checks de permissões/colunas/falhas/acessibilidade passaram.
- Supabase Auth health endpoint: `/auth/v1/health`, documentado no [guia oficial de self-hosting](https://supabase.com/docs/reference/self-hosting-auth/verifies-a-sign-up).
- Migration local em `supabase/migrations/20261014180000_check_publico_disponibilidade.sql`; não aplicada.
