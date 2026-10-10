# EloLab app — estado acessível do menu mobile

> **For agentic workers:** execute esta etapa por TDD, em mudanças locais pequenas.

**Goal:** Expor o estado aberto/fechado do menu mobile autenticado e associar o botão ao drawer, sem mudar autorização, destinos ou organização das rotas.

**Architecture:** `MainLayout` permanece fonte de verdade para `mobileMenuOpen` e passa o valor à `Navbar`; a Navbar publica `aria-expanded`/`aria-controls`, e o `SheetContent` recebe o ID correspondente. O teste da Navbar cobre ambos os estados com dependências de dados isoladas.

**Tech Stack:** React, TypeScript, React Router, Radix Sheet, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-09-elolab-app-design.md`

## Etapas concluídas

- [x] Criar teste focal da Navbar para `aria-expanded` em ambos estados e o alvo em `aria-controls`.
- [x] Rodar o teste e confirmar falha pelo estado/associação ausentes.
- [x] Adicionar prop controlada pela `MainLayout`, sincronizar atributos e ID do drawer.
- [x] Rodar teste focal, suíte, typecheck, lint e build; revisar o diff.
- [x] Abrir no Orca a tela pública `/auth` em desktop; captura autenticada do shell e teste manual de navegação protegida permanecem pendentes sem conta de QA.

## Limites

Arquivos-alvo: `src/components/layout/Navbar.tsx`, `src/components/layout/MainLayout.tsx` e um novo teste para Navbar. Não alterar menu por papel, rotas, auth, dados, API, integração Supabase, checkout, financeiro, WhatsApp ou migrations.
