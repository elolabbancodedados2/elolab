# EloLab site — navegação mobile acessível

> **For agentic workers:** execute esta etapa por TDD, em mudanças locais pequenas.

**Goal:** Tornar explícito e verificável o estado do menu mobile institucional para leitores de tela e teclado, preservando links, destinos e visual existentes.

**Architecture:** Manter a navegação no `LandingPage`; acrescentar estado ARIA e nome dinâmico ao botão atual, além de um identificador estável no painel móvel. O teste renderiza a página com catálogo de planos isolado.

**Tech Stack:** React, TypeScript, React Router, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-09-elolab-site-institucional-design.md`

## Etapas concluídas

- [x] Criar teste de interação mobile: menu começa recolhido, abre com `aria-expanded=true` e `aria-controls` aponta ao painel existente; ativar um link fecha o painel.
- [x] Rodar o teste e confirmar falha pelos atributos/estado ausentes.
- [x] Implementar os atributos sem alterar destinos ou conteúdo; manter o CTA de contato e login.
- [x] Rodar teste focal, suíte, typecheck, lint, build e check de acessibilidade; revisar o diff.
- [x] Inspecionar preview local em mobile e desktop; abrir/fechar o menu via teclado e ativar seção no teste automatizado; registrar capturas.

## Limites

Arquivos-alvo: novo teste em `src/pages/__tests__/LandingPage.test.tsx` e `src/pages/LandingPage.tsx`. Não alterar checkout, textos de planos, API, dados, integrações, credenciais ou configuração global.
