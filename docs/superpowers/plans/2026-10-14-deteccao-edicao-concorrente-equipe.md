# Detectar edição concorrente na equipe

**Goal:** Impedir que uma edição antiga de funcionário sobrescreva dados ou papéis salvos por outro administrador e orientar recarga/reabertura.

**Architecture:** `funcionarios.edit_version` incrementa em todo UPDATE. A UI envia a versão original no compare-and-set de dados; a RPC autenticada compara novamente sob `FOR UPDATE` antes de alterar papéis, protegendo a janela entre os dois pedidos. RPCs antigas permanecem para compatibilidade. Em conflito de papéis após salvar dados gerais, a interface identifica a gravação parcial e pede reabertura.

## Review focus

- Versão monotônica é incrementada pelo banco, não controlada pelo cliente.
- Versão esperada é conferida no escopo da clínica e sob row lock.
- Erro `40001` não sobrescreve papéis e força recarga da ficha.
- Migration local apenas; sem aplicação ou deploy.

### Task 1: Adicionar versionamento e compare-and-set

- [x] Escrever contratos de migration e UI para versão, lock, autorização e erro de concorrência.
- [x] Confirmar falha inicial dos contratos.
- [x] Criar coluna/trigger e RPC versionada mantendo a RPC antiga para compatibilidade.
- [x] Atualizar editor, tipos gerados e fixture sintética.
- [x] Adicionar E2E da ficha desatualizada e verificar que a alteração não é enviada.
- [x] Rodar suíte completa, E2E de equipe, typecheck, build, checks e revisar diff.
- [x] Commit `feat: prevent stale team edits from overwriting roles`.

### Task 2: Registrar entrega

- [x] Marcar roadmap #79 após validação.
- [ ] Commit `docs: record team edit concurrency validation`.
