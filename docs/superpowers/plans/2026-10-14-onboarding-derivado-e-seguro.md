# Checklist de onboarding derivado e seguro

## Auditoria local

- A tela `/onboarding` já mostrava progresso calculado pelo RPC, estado vazio/erro, ação para atualizar e links para cada etapa.
- O backend já contava registros reais de equipe, agenda, serviços e agendamentos; WhatsApp aparecia como opcional e ficava fora das quatro etapas essenciais.
- A jornada de clínica solo já tinha cobertura unitária e sintética.
- O RPC `SECURITY DEFINER` usava `SET search_path = public` e a chamada TypeScript estava forçada para `any`.

## Alterações

1. Recriar `clinic_onboarding_overview()` com `search_path` vazio e referências qualificadas.
2. Preservar autorização do admin, escopo pela clínica ativa, critérios existentes e WhatsApp opcional.
3. Revogar acesso público/anônimo e conceder execução autenticada.
4. Adicionar contrato Supabase para a RPC e remover o cast `any` da chamada.
5. Testar os invariantes de autorização/escopo e a jornada de onboarding solo.

## Evidência

- Vitest de onboarding e migration: 8/8.
- Playwright Chromium sintético: `tests/onboarding-clinica-solo.spec.ts`, 1/1.
- PostgreSQL parser: 4 instruções e PL/pgSQL parser: 1 função parseados.
- TypeScript, build, ESLint e checks de permissões/colunas/falhas/acessibilidade passaram.
- Migration local em `supabase/migrations/20261014170000_hardening_onboarding_clinica.sql`; não aplicada.
