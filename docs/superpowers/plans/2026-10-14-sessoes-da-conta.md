# Sessões da conta: dispositivo e atividade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar ao titular da conta os dispositivos aproximados e a última atividade observada por sessão ainda registrada no Supabase Auth.

**Architecture:** Uma tabela privada de metadados associa a sessão identificada pelo JWT ao agente do dispositivo e ao heartbeat recente do app. RPCs `SECURITY DEFINER` derivam o usuário e a sessão dos claims autenticados, consultam somente sessões próprias e não retornam endereço IP; a tela de Segurança usa essas RPCs e não recebe credenciais.

**Tech Stack:** React, TypeScript, Supabase Auth/Postgres RPC, Vitest, React Testing Library e Playwright sintético.

**Spec:** Item 75 em `docs/ROADMAP_MELHORIAS_100_E_5_MODULOS.md`; [Supabase User Sessions](https://supabase.com/docs/guides/auth/sessions) documenta `session_id` no JWT e a relação com `auth.sessions`, e [User Management](https://supabase.com/docs/guides/auth/managing-user-data) alerta que o schema Auth não é exposto ao cliente.

## Global Constraints

- Não usar ou registrar endereço IP; armazenar somente agente de usuário sanitizado e atividade do app.
- Cada RPC deriva usuário e sessão de `auth.uid()` e `auth.jwt()`; o cliente não envia `user_id` nem `session_id` para escolher os dados consultados.
- `auth.sessions` serve apenas para confirmar que a sessão continua registrada e que `not_after` ainda não expirou; os metadados próprios ficam no schema `public`, fora de tabelas do schema `auth`.
- O recurso é informativo; não altera timeout, refresh token, revogação nem autorizações clínicas.
- Criar a migration local e validar o contrato; não aplicá-la nem alterar produção nesta etapa.

## Review Focus

- Chamada sem sessão autenticada: não deve listar nem registrar metadados.
- Tentativa de consultar outra conta: as RPCs não aceitam identidade escolhida pelo cliente e restringem por `auth.uid()`.
- Agente de usuário ausente, longo ou com controles: armazenar texto vazio ou limitado, sem controles e sem exceder 500 caracteres.
- Sessão encerrada/removida do Auth ou com `not_after` vencido: não deve continuar aparecendo na lista, mesmo que exista metadado antigo.
- Duas abas da mesma sessão enviando heartbeat: uma linha por sessão, com `last_activity_at` avançando sem duplicação.

---

### Task 1: Contrato seguro das sessões próprias

**Files:**
- Create: `supabase/migrations/20261014100000_sessoes_proprias_por_conta.sql`
- Modify: `src/integrations/supabase/types.ts`
- Test: `src/lib/__tests__/accountSessionsMigration.test.ts`

**Interfaces:**
- Produces: `touch_my_account_session(p_user_agent text) -> void` e `list_my_account_sessions() -> { session_id, created_at, last_activity_at, user_agent, is_current }[]`.

- [x] **Step 1: Escrever testes de contrato** para RLS sem leitura direta, grants apenas de execução para `authenticated`, funções sem parâmetro de identidade, filtro por `auth.uid()`, associação ao `auth.sessions` e filtro `not_after IS NULL OR not_after > now()`, sanitização/teto do agente e upsert por usuário/sessão.
- [x] **Step 2: Rodar os testes** e confirmar falha porque a migration e as RPCs ainda não existem.
- [x] **Step 3: Criar tabela privada e RPCs** com `SECURITY DEFINER`, `SET search_path = ''`, sessão extraída do JWT, filtro próprio, retorno apenas de metadados necessários, limpeza de sessões expiradas no heartbeat e remoção em cascata de sessões apagadas pelo Auth.
- [x] **Step 4: Atualizar os tipos gerados localmente** para a tabela/RPCs e rodar os testes de contrato, typecheck e checks de permissões.
- [ ] **Step 5: Commit** `feat: add owner-scoped account session metadata`.

### Task 2: Registrar atividade e estimar dispositivo

**Files:**
- Create: `src/lib/accountSessionDevice.ts`
- Modify: `src/contexts/SupabaseAuthContext.tsx`
- Test: `src/lib/__tests__/accountSessionDevice.test.ts`
- Test: `src/contexts/__tests__/SupabaseAuthContext.test.tsx` (ou teste de integração de auth já existente).

**Interfaces:**
- Produces: `describeAccountDevice(userAgent: string | null) -> string`.
- Consumes: `touch_my_account_session` sem identificador de usuário/sessão fornecido pela UI.

- [ ] **Step 1: Escrever testes** para Safari/iPhone, Chrome/Android, Edge/Windows, agente ausente/desconhecido e heartbeat sem usuário/sessão.
- [ ] **Step 2: Confirmar falha inicial** dos testes do formatador.
- [ ] **Step 3: Implementar o rótulo aproximado** sem dependência externa e enviar heartbeat junto da atividade autenticada visível, no máximo a cada cinco minutos; manter o timeout atual intacto.
- [ ] **Step 4: Testar** normalização, ciclo de vida e ausência de chamadas quando deslogado.
- [ ] **Step 5: Commit** `feat: record per-session account activity`.

### Task 3: Exibir sessões em Segurança

**Files:**
- Create: `src/components/security/AccountSessionsPanel.tsx`
- Modify: `src/pages/Configuracoes.tsx`
- Test: `src/components/security/__tests__/AccountSessionsPanel.test.tsx`
- Test: `tests/qa-security-sessions.spec.ts`

**Interfaces:**
- Consumes: `list_my_account_sessions` e `describeAccountDevice`.
- Produces: painel acessível com sessões do usuário atual, indicação “Este dispositivo”, dispositivo aproximado, última atividade, loading, erro, vazio e atualização manual.

- [ ] **Step 1: Escrever testes** para sessão atual e adicional, dispositivo desconhecido, estados loading/erro/vazio e atualização; verificar que a UI não exibe IP nem IDs completos.
- [ ] **Step 2: Confirmar falha inicial** do painel inexistente.
- [ ] **Step 3: Implementar o painel** na aba Segurança sem incluir ações de revogação nesta melhoria.
- [ ] **Step 4: Rodar Vitest e Playwright** em clínica sintética, confirmando que a consulta/RPC usa apenas os dados da conta autenticada e não grava dados clínicos.
- [ ] **Step 5: Commit** `feat: show active account sessions`.

### Task 4: Fechar evidência e regressões

**Files:**
- Modify: `docs/ROADMAP_MELHORIAS_100_E_5_MODULOS.md`
- Modify: `docs/superpowers/plans/2026-10-14-sessoes-da-conta.md`

- [ ] **Step 1: Rodar** suíte Vitest completa, Playwright sintético relevante, TypeScript, build, checks de colunas/falhas/permissões/acessibilidade e lint dos arquivos tocados.
- [ ] **Step 2: Revisar** migration e diff buscando leitura cross-user, função executável por `anon`, segredo, IP ou escrita fora do registro de sessão.
- [ ] **Step 3: Registrar #75 como entregue** apenas depois de todas as validações; documentar que a migration foi criada localmente e ainda não foi aplicada.
- [ ] **Step 4: Commit** `docs: record account session visibility validation`.
