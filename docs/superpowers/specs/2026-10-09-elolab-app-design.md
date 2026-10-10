# EloLab app/sistema — direção e critérios

## Objetivo

Elevar a experiência diária do sistema de gestão clínica EloLab para uma UX/UI sofisticada, consistente e responsiva, preservando rotas, permissões, dados clínicos, APIs, autenticação e integrações.

## Contexto observado

- `src/App.tsx` carrega rotas lazy e escolhe o modo app fora dos hosts institucionais. Há rotas públicas, portais, rotas protegidas, redirecionamentos legados, `SupabaseProtectedRoute` e `SubscriptionGuard`.
- A aplicação tem módulos de atendimento, pacientes, clínica, laboratório, financeiro, administração e portais. A lista de rotas documentada em `README.md` complementa a árvore de rotas do app.
- `src/components/layout/MainLayout.tsx`, `Sidebar.tsx`, `SidebarNavItem.tsx` e `src/config/sidebarMenu.ts` concentram a navegação autenticada e filtrada por papel.
- Stack atual: React 18, TypeScript, Tailwind, shadcn/ui, Supabase e Framer Motion; a aplicação já tem testes Vitest e Playwright e scripts de acessibilidade.
- O README descreve RLS multi-tenant, papéis, MFA, privacidade, PWA e limites importantes de capacidades clínicas. Essas afirmações limitam o que a interface pode prometer.

## Direção de design

Criar uma linguagem de produto profissional, calma e densa o bastante para operação clínica, com consistência entre navegação, páginas, formulários, tabelas e feedback. Manter os tokens e componentes existentes como base e aprimorá-los com hierarquia tipográfica, espaçamento, contraste e estados previsíveis. Priorizar tarefas frequentes e contexto da pessoa usuária, sem impor uma reorganização global de rotas ou esconder ações existentes.

No mobile, definir comportamentos adequados a cada tarefa — navegação, leitura, filtros e edição — mantendo acesso a funções já autorizadas. Loading, erro, vazio, sucesso e ausência de permissão devem ser compreensíveis e coerentes com os padrões já usados. Motion é breve, útil e compatível com movimento reduzido.

## Escopo

- Auditar navegação, layout, dashboard e principais jornadas de ponta a ponta antes de selecionar mudanças incrementais.
- Melhorar componentes compartilhados quando a evidência indicar ganho amplo e baixo risco; depois tratar páginas/fluxos em unidades revisáveis.
- Rever uso em breakpoints mobile, tablet e desktop; teclado, foco, landmarks, nomes acessíveis, contraste e feedback.
- Verificar estados de carregamento, erro e vazio, permissões por papel e mensagens sem expor dados sensíveis.
- Preservar contratos Supabase/RLS, autenticação/MFA, APIs, cache por escopo, recursos PWA e integrações existentes.
- Adicionar ou ajustar testes pertinentes para fluxos alterados, incluindo autorização quando aplicável.

## Fora de escopo

- Novas funcionalidades ou mudanças em contratos, tabelas, regras de negócio, integração, navegação pública ou permissões sem requisito explícito.
- Alterar checkout de planos, finanças de pacientes (`pagamentos_mercadopago`, `lancamentos`), edge function de WhatsApp ou arquivos já modificados localmente sem necessidade aprovada.
- Aplicar migration, acessar/escrever dados reais, deploy, DNS, produção ou publicar.
- Usar dados identificáveis de pacientes em capturas ou testes; fixtures e evidências devem ser sintéticas.

## Critérios de aceite

1. Rotas, redirecionamentos, operações e permissões existentes continuam funcionando.
2. A linguagem visual é consistente sem tornar telas operacionais menos legíveis ou esconder densidade útil.
3. Fluxos selecionados foram verificados de ponta a ponta em estados de sucesso, vazio e falha relevantes.
4. Layout e controles foram inspecionados em 375, 768, 1024 e 1440 px, com teclado e movimento reduzido.
5. Typecheck, lint e testes pertinentes passam; verificações remotas que dependem de contas/serviços são claramente identificadas e não usam dados reais.
6. Preview local foi inspecionado; alterações e pendências são descritas com evidências e sem alegações de homologação não executada.

## Restrições de trabalho

Trabalhar apenas localmente e em etapas pequenas. Preservar alterações preexistentes, particularmente arquivos de WhatsApp, integração Supabase, migration, `docker/evolution/` e o plano não rastreado já presente em `docs/superpowers/plans/`. Não ler ou expor credenciais. Não fazer deploy nem aplicar migrations.
