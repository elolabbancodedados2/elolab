# Histórico de versões das configurações da clínica

## Escopo

- Versionar as configurações administrativas `config_clinica`, `config_impressao` e `config_seguranca` em todos os fluxos de gravação.
- Permitir comparar uma versão com os dados atuais antes de restaurá-la.
- Manter isolamento por clínica, acesso restrito a administradores, restauração atômica e proteção contra edição concorrente.

## Implementação

1. Criar tabela de snapshots com baseline para dados atuais, RLS de leitura para admin da mesma clínica e sem escrita direta por clientes.
2. Criar trigger de captura para INSERT/UPDATE das chaves cobertas, inclusive fluxos legados de onboarding.
3. Criar RPC de restauração com validação de clínica, chave e versão atual; registrar a restauração como nova revisão ligada à origem.
4. Adicionar comparação de campos e seletor de versões à tela de Configurações.
5. Validar política/RPC por contrato, jornada sintética, parser PostgreSQL, typecheck, build e checks de CI.

## Evidência

- Vitest: `src/lib/__tests__/configHistory.test.ts` e `clinicConfigVersionsMigration.test.ts`, 4/4.
- Playwright Chromium sintético: `tests/qa-clinic-config-history.spec.ts`, 1/1; comparação antes da restauração, RPC com versão esperada e atualização visível após restaurar.
- Parser PostgreSQL: 21 instruções parseadas.
- `npx tsc --noEmit`, `npm run build`, `check:permissoes`, `check:colunas`, `check:falhas`, `check:a11y` e ESLint sem erros.
- Migration local em `supabase/migrations/20261014160000_historico_configuracoes_clinica.sql`; não aplicada.
