# 🧪 Plano de Testes — EloLab SaaS

## Comandos

| Comando | Descrição |
|---------|-----------|
| `npm test` | Vitest em modo watch |
| `npm run test:run` | Vitest execução única |
| `npm run test:e2e` | Playwright (requer app rodando) |
| `npm run test:e2e:ui` | Playwright com UI interativa |

---

## Arquivos de Teste

### Unitários (Vitest + React Testing Library)

| Arquivo | Cobertura |
|---------|-----------|
| `src/lib/__tests__/formatters.test.ts` | formatCPF, formatCNPJ, formatPhone, formatCEP, formatCurrency, parseCurrency, formatDate, formatTime, calculateAge, getInitials, validateCPF, validateEmail |
| `src/lib/__tests__/utils.test.ts` | cn() — merge de classes Tailwind |
| `src/hooks/__tests__/useFormValidation.test.ts` | Validação de campos: required, minLength, maxLength, pattern, custom validators, validateAll, reset |
| `src/hooks/__tests__/useFormState.test.ts` | Estado de formulário: initialData, updateField, reset, clearError, isDirty, validators, composeValidators |
| `src/components/__tests__/ErrorBoundary.test.tsx` | Captura de erros, fallback default e customizado |
| `src/components/__tests__/EmptyState.test.tsx` | Renderização com props, ações, presets |
| `src/components/__tests__/SupabaseProtectedRoute.test.tsx` | Loading, redirect sem auth, acesso pendente, acesso negado, renderiza children |
| `src/test/utils.test.ts` | cn() (teste existente) |
| `src/test/formatters.test.ts` | Formatters (teste existente) |

### Integração (MSW + Supabase Client)

| Arquivo | Cobertura |
|---------|-----------|
| `src/components/__tests__/PatientListIntegration.test.tsx` | GET pacientes, GET médicos, erro 500 |
| `src/mocks/handlers.ts` | Handlers REST para pacientes, medicos, agendamentos, auth |
| `src/mocks/server.ts` | Servidor MSW |

### E2E (Playwright)

| Arquivo | Cobertura |
|---------|-----------|
| `tests/auth.spec.ts` | Redirect sem login, page load, login com erro, landing page |
| `tests/crud.spec.ts` | Validação de formulário vazio, carga de páginas protegidas |
| `tests/navigation.spec.ts` | Rotas públicas, 404, responsividade mobile/desktop |
| `tests/ui.spec.ts` | Console errors, formulário auth, conteúdo visível, título |
| `tests/rls.spec.ts` | RLS: select/insert/delete sem auth bloqueados por tabela |

---

## Cobertura Esperada

| Área | Tipo de Teste | Nível |
|------|--------------|-------|
| **Auth** | Unitário + E2E | ProtectedRoute, redirect, login flow |
| **CRUD** | Integração + E2E | Pacientes (MSW), formulários |
| **RLS/Segurança** | E2E (API direta) | 6 tabelas principais |
| **UI/UX** | Unitário + E2E | EmptyState, ErrorBoundary, console, responsividade |
| **Utilitários** | Unitário | Formatters, cn(), validators |
| **Hooks** | Unitário | useFormValidation, useFormState |

---

## CI/CD (GitHub Actions)

Arquivo: [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)

**Triggers:** PRs para `main`, push em `main` e execução manual.

### Secrets necessários no GitHub

Vá em **Settings → Secrets and variables → Actions** do repositório e adicione:

| Secret | Valor |
|--------|-------|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` ou `VITE_SUPABASE_ANON_KEY` | Chave pública do Supabase |

### Deploy na VPS

O workflow valida a imagem Docker, mas não publica nem controla o Easypanel.
O webhook Git do painel pode começar o deploy antes do CI terminar. Proteja
`main` e exija o check antes de habilitar deploy automático; consulte
[`docs/EASYPANEL-VPS.md`](../EASYPANEL-VPS.md).

### Pipeline

O CI executa `npm ci`, typecheck, verificações estáticas, testes unitários e de
integração, auditoria de dependências e build Docker. E2E não roda no workflow
atual; execute localmente somente contra ambiente de homologação.

---

## Como adicionar novos testes

### Unitários
Crie arquivos `*.test.ts(x)` em `src/**/__tests__/` ou ao lado do componente.

### E2E
Crie arquivos `*.spec.ts` na pasta `tests/`.

### MSW Handlers
Adicione novos handlers em `src/mocks/handlers.ts` para interceptar endpoints do Supabase.
