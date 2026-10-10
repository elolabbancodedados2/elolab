# Acesso da conta dona ao app e ao Painel Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar somente a `contato@elolab.com.br` autoridade de plataforma e uma clínica EloLab própria, com seletor para alternar, na mesma sessão, entre o app clínico e o Painel Admin.

**Architecture:** Uma migration transacional provisiona o usuário existente como owner da plataforma e admin de uma clínica interna própria, desativando a autoridade de plataforma das outras contas sem alterar seus papéis clínicos, perfis ou assinaturas. A navegação determina o modo a partir da rota atual, mostra os grupos correspondentes e oferece links App/Painel Admin somente à dona; as proteções de rota e RLS existentes continuam sendo a autoridade.

**Tech Stack:** React 18, TypeScript, React Router, Vitest/Testing Library, Supabase PostgreSQL migrations.

**Spec:** `docs/superpowers/specs/2026-10-10-conta-dona-app-e-painel-design.md`

## Global Constraints

- Não criar conta de autenticação nem adicionar papéis a outros usuários.
- Somente `contato@elolab.com.br` pode manter uma linha ativa em `platform_admins` depois da migration.
- Desativar a autoridade de plataforma das demais contas sem apagar linhas, perfis, papéis clínicos, clínicas ou assinaturas.
- Assinantes mantêm o acesso ao app definido pelo plano e pelos papéis existentes.
- A migration deve ser transacional e idempotente.
- Se o perfil já estiver associado a uma clínica diferente, abortar sem trocar o vínculo; reutilizar a clínica própria se já existir.
- Administradores de clínica e demais usuários continuam sem acesso a `/painel-admin` e `/admin/*`.
- Não usar impersonação de clínicas de clientes.
- Não aplicar migration, fazer deploy ou alterar produção durante a implementação local.
- Não incluir credenciais, segredos ou dados de produção em código, logs ou testes.
- Não alterar os módulos `pagamentos_mercadopago` ou `lancamentos`.

## Review Focus

- Conta com o e-mail alvo ausente: migration aborta claramente sem criar associação parcial (Task 1, migration e revisão transacional).
- Perfil já associado a clínica de terceiro: migration aborta e preserva o vínculo (Task 1, bloco de validação da migration).
- Clínica própria já vinculada ao perfil, mesmo com outra clínica própria antiga: migration reutiliza a clínica indicada pelo perfil; se não houver vínculo e existirem múltiplas clínicas próprias, aborta por ambiguidade; nova execução não duplica clínica ou role (Task 1, migration idempotente e inspeção local).
- Outra conta tem papel ativo de plataforma: fica inativa para plataforma, enquanto seu `user_roles`, perfil, plano e assinatura permanecem iguais (Task 1, snapshot antes/depois no banco local descartável).
- Navegação sem provisionamento: admin da plataforma sem clínica permanece no menu da plataforma; assinante/admin clínico sem plataforma usa o App, sem seletor ou rota administrativa (Task 2, testes de `Sidebar` e `SupabaseProtectedRoute`).

---

### Task 1: Provisionar a conta dona em uma clínica interna

**Files:**
- Create: `supabase/migrations/20261010210000_provisionar_conta_dona_com_clinica_interna.sql`
- Create: `supabase/verificacoes/conta-dona-app-painel.sql`

**Interfaces:**
- A migration localiza `auth.users.id` por `lower(email) = lower('contato@elolab.com.br')`.
- A migration garante exatamente um `platform_admins.ativo = true` para o owner indicado; desativa as demais autoridades da plataforma sem apagar linhas nem alterar os outros dados dos usuários.
- A migration garante `platform_admins.nivel = 'owner'`, `user_roles.role = 'admin'`, e `profiles.clinica_id` apontando para uma clínica cujo `owner_id` é o mesmo usuário.
- A verificação SQL falha com `RAISE EXCEPTION` se não houver exatamente um administrador de plataforma ativo, o vínculo do perfil a uma clínica própria e as duas autoridades esperadas; a ausência de duplicação após reexecução é validada pela fixture local.

- [ ] **Step 1: Implementar a migration transacional e idempotente**

Na migration, usar um bloco `DO` e `pg_advisory_xact_lock(hashtextextended('elolab:owner-clinic:contato@elolab.com.br', 0))` para serializar provisionamentos concorrentes dessa conta. Falhar antes de mutações se a conta ou o perfil não existirem, ou se `profiles.clinica_id` apontar para clínica cujo `owner_id` não seja o usuário. Reutilizar primeiro a clínica já apontada quando ela pertence ao usuário, mesmo que haja outra clínica própria antiga. Sem vínculo no perfil, procurar clínica existente pelo `owner_id`, reutilizá-la se única, abortar se houver várias por ambiguidade e criar `EloLab — Clínica Interna` apenas se nenhuma existir. Fazer upsert do registro `owner` ativo e do papel `admin`; atualizar `profiles.clinica_id`; por fim desativar os outros registros de `platform_admins`, sem removê-los. Não alterar perfil, papel clínico, clínica ou assinatura de outro usuário. PostgreSQL aplica a migration atomicamente.

- [ ] **Step 2: Criar verificação SQL somente para ambiente local/de teste**

O arquivo deve conferir por `lower(email)` que o usuário alvo é o único administrador de plataforma ativo, está no nível `owner`, tem role clínica `admin` e aponta para uma clínica de sua propriedade. O comentário inicial deve proibir explicitamente execução em produção sem autorização separada. A verificação de idempotência (sem criar clínica ou papel duplicado ao reexecutar) e a preservação de perfis, papéis, planos e assinaturas de outra conta pertencem à fixture local descartável da Task 3.

- [ ] **Step 3: Revisar o SQL sem conectar a produção**

Executar `git diff --check` e revisar a migration com `Get-Content`; verificar no diff que não há mudança em cobrança clínica, usuários diferentes além da desativação de `platform_admins.ativo`, credenciais ou comandos de deploy. Como Docker e `psql` não estão disponíveis, registrar que a verificação SQL será entregue para ambiente local descartável e não poderá ser executada nesta sessão. Não executar a migration sem autorização específica.

### Task 2: Alternar entre App e Painel Admin na navegação

**Files:**
- Modify: `src/config/sidebarMenu.ts`
- Modify: `src/components/layout/Sidebar.tsx`
- Test: `src/config/__tests__/sidebarMenu.test.ts`
- Create: `src/components/layout/__tests__/Sidebar.test.tsx`
- Reference: `src/components/SupabaseProtectedRoute.tsx` (proteger por comportamento existente; alterar apenas se o teste provar uma falha)

**Interfaces:**
- `getFilteredMenuGroups(userRoles, isAdmin, isSuperAdmin, temClinica, mode?)` recebe `mode: 'app' | 'platform'`; quando omitido, mantém exatamente o comportamento atual dos chamadores existentes.
- `getNavigationMode(pathname, isPlatformAdmin)` retorna `'platform'` para `/painel-admin`, `/usuarios`, `/documentacao`, `/admin/*` e `/feedback` quando a pessoa é admin da plataforma; nos demais caminhos retorna `'app'`.
- `Sidebar` usa a rota atual como fonte do modo, mas mantém admins da plataforma sem clínica no modo `platform`. O seletor navega para `/dashboard` (App) ou `/painel-admin` (Painel Admin) e só aparece quando `isPlatformAdmin` e `profile.clinica_id` são verdadeiros.

- [ ] **Step 1: Escrever testes de modo e filtragem de menus**

Adicionar casos em `sidebarMenu.test.ts` cobrindo: modo `app` de plataforma com clínica contém grupos clínicos e oculta grupos `superAdminOnly`; modo `platform` contém grupos `superAdminOnly` e não expõe grupos clínicos; os casos legados sem argumento mantêm os resultados existentes. Testar `getNavigationMode` para admin da plataforma e usuário comum nos caminhos `/painel-admin`, `/admin/crm`, `/usuarios`, `/documentacao`, `/feedback` e `/dashboard`.

- [ ] **Step 2: Executar os testes de menu e confirmar que falham**

Run: `npm run test:run -- src/config/__tests__/sidebarMenu.test.ts`
Expected: os testes novos falham pela falta de `mode` e `getNavigationMode`.

- [ ] **Step 3: Implementar seleção de grupos por modo**

Em `sidebarMenu.ts`, exportar `getNavigationMode` e acrescentar o argumento opcional a `getFilteredMenuGroups`. No modo `platform`, retornar só grupos administrativos; no modo `app`, ocultar todos os grupos administrativos exclusivos e conservar os filtros de papéis clínicos existentes. Se `mode` for omitido, preservar exatamente o comportamento anterior, inclusive para admins da plataforma com clínica.

- [ ] **Step 4: Implementar seletor responsivo na Sidebar**

Em `Sidebar.tsx`, derivar o modo de `location.pathname`, passar o modo para `getFilteredMenuGroups` e incluir dois links com nomes acessíveis (“App” e “Painel Admin”) no cabeçalho da navegação apenas para admin da plataforma com clínica. Admins de plataforma sem clínica permanecem no modo de plataforma mesmo que abram uma rota clínica. Indicar o modo atual com estado visual e `aria-current`; manter os mesmos controles na sidebar desktop e no drawer móvel, que compartilham o componente. “App” navega para `/dashboard`; “Painel Admin” para `/painel-admin`.

- [ ] **Step 5: Testar seletor e isolamento por conta**

Criar `Sidebar.test.tsx` com React Testing Library e `MemoryRouter`: admin da plataforma com clínica vê os dois modos; selecionar cada opção navega ao destino esperado; admin de clínica e usuário comum não veem o seletor nem item administrativo. Confirmar que `/painel-admin` continua negado a conta sem `isPlatformAdmin` com o teste existente `src/components/__tests__/SupabaseProtectedRoute.test.tsx`.

- [ ] **Step 6: Rodar os testes e checagens focados**

Run: `npm run test:run -- src/config/__tests__/sidebarMenu.test.ts src/components/layout/__tests__/Sidebar.test.tsx src/components/__tests__/SupabaseProtectedRoute.test.tsx`
Expected: todos os testes passam; o filtro anterior de menus e RBAC mantém o comportamento para usuários sem privilégios de plataforma.

### Task 3: Verificação de integração local e fechamento

**Files:**
- Verify: migration e SQL de verificação da Task 1
- Verify: rotas e navegação de `src/App.tsx`, `src/components/layout/Sidebar.tsx` e `src/config/sidebarMenu.ts`

**Interfaces:**
- Não introduz nova API nem executa alteração remota.

- [ ] **Step 1: Aplicar e validar apenas em Supabase local descartável**

Se Supabase local estiver disponível, criar fixtures da conta dona e de uma conta de plataforma secundária, com perfil/role/assinatura conhecidos; aplicar a migration, executar `supabase/verificacoes/conta-dona-app-painel.sql`, aplicar novamente e confirmar um único owner ativo, uma clínica e um papel. Conferir que a segunda conta perdeu somente `platform_admins.ativo`, mantendo perfil, papel clínico, plano e assinatura. Executar também fixtures de e-mail ausente e clínica pertencente a outro owner, confirmando rollback e preservação do vínculo. Nunca apontar para o projeto remoto.

- [ ] **Step 2: Rodar build e testes da mudança**

Run: `npm run build`
Expected: build completa sem erros TypeScript/Vite. Executar os testes focados da Task 2 se ainda não tiverem sido rodados após a integração.

- [ ] **Step 3: Revisar diff e registrar limites de ativação**

Run: `git diff --check; git status --short`
Expected: somente os arquivos listados no plano foram alterados; nenhuma migration foi aplicada remotamente e nenhum deploy foi feito. Registrar a migration pendente para etapa de ativação separadamente autorizada.
