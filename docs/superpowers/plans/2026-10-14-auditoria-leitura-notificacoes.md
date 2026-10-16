# Auditoria de leitura em lote de notificações

**Goal:** Confirmar que “marcar visíveis como lidas” altera apenas itens não lidos no filtro atual e que o estado não atravessa usuário ou clínica.

**Evidence:** A página já envia `unreadVisiveis`; a tabela tem chave única por clínica, conta, origem e item, com RLS por `auth.uid()` e `current_clinica_id()`. Esta etapa registra testes de caracterização e não muda o comportamento do produto.

### Task 1: Validar estado de leitura

- [x] Cobrir filtro atual, itens já lidos e payload do upsert autenticado.
- [x] Verificar contrato RLS, chave por conta/clínica e limite da RPC.
- [x] Rodar 4 testes focados, TypeScript, lint e check de acessibilidade.
- [x] Registrar item #82 como já implementado e auditado.
- [x] Commit `test: verify scoped bulk notification reads`.
