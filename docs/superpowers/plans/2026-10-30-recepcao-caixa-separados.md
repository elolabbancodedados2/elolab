# Recepção e Caixa Diário Separados — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar Recepção e Caixa Diário em destinos próprios, mantendo atalhos de fluxo e permissões atuais.

**Architecture:** `/recepcao` exibe somente o fluxo de recepção; `/caixa-diario` abre diretamente o caixa operacional. Rotas antigas de caixa continuam redirecionando para o destino novo. O Caixa Diário mantém abertura, movimentações e histórico; áreas financeiras e de configuração permanecem nos módulos próprios.

**Tech Stack:** React, React Router, TypeScript, shadcn/ui, Vite.

**Spec:** Pedido do usuário nesta conversa: separar Recepção e Caixa Diário.

## Global Constraints

- Não alterar banco de dados nem dependências.
- Preservar acesso de `admin` e `recepcao` à Recepção; Caixa Diário permanece para `admin`, `recepcao` e `financeiro`.
- Preservar os fluxos de pagamento e retorno para o Caixa Diário.
- Não adicionar nem executar testes automatizados sem pedido do usuário.
- Publicar após build, lint e conferência visual, conforme autorização anterior.

## Review Focus

- Acesso por perfil às duas rotas.
- Acesso legado `/recepcao?tab=caixa` e `/caixa` direciona ao Caixa Diário.
- Ações de venda, movimentação, fechamento e histórico retornam ao Caixa Diário.
- Caixa Diário não duplica telas já disponíveis nos módulos Financeiro/gestão.

---

### Task 1: Rotas e navegação separadas

**Files:** `src/App.tsx`, `src/pages/RecepcaoCaixa.tsx`, `src/lib/cashierAccess.ts`, `src/config/sidebarMenu.ts`, `src/config/routeLabels.ts`, `src/components/layout/MobileTabBar.tsx`, páginas de retorno do caixa.

- [x] Criar destinos distintos para recepção e caixa, com permissões correspondentes.
- [x] Adicionar dois itens claros no menu e preservar aliases antigos.
- [x] Atualizar links e retornos do caixa para `/caixa-diario`.

### Task 2: Caixa operacional enxuto

**Files:** `src/pages/CaixaDiario.tsx`.

- [x] Manter somente Caixa Hoje e Histórico como abas internas.
- [x] Remover atalhos e abas duplicadas de contas, fluxo, preços, tipos e relatórios.
- [x] Renomear o cabeçalho para “Caixa Diário”.

### Task 3: Verificação e publicação

- [x] Rodar build e lint dos arquivos alterados.
- [ ] Conferir as duas telas e os destinos de menu no app publicado.
- [ ] Publicar e verificar réplica e rota de saúde.
