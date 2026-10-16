# Revogar sessões ao inativar funcionário

**Goal:** Encerrar sessões Auth e refresh tokens ao desativar um funcionário vinculado, sem alterar o histórico clínico nem a regra de reativação.

**Architecture:** A RPC `sync_employee_roles` mantém a autorização administrativa e o escopo da clínica; dentro da mesma transação, quando `_ativo = false`, chama `admin_encerrar_sessoes(v_user_id)`, auxiliar já restrita a `service_role` para chamadas diretas. JWTs já emitidos podem permanecer válidos até expirar, como documentado na política de sessões.

## Review focus

- Chamada só ocorre após validar admin, clínica, vínculo e conta.
- Reativar funcionário não encerra sessões e mantém os papéis configurados; o acesso volta após novo login.
- O helper de revogação continua sem EXECUTE para `authenticated`.
- Não aplicar migration nem alterar produção nesta etapa.

### Task 1: Implementar revogação transacional

- [x] Escrever contrato de migration para revogação apenas no ramo inativo, escopo clínico, segurança e privilégios do helper.
- [x] Confirmar falha inicial antes da migration.
- [x] Redefinir `sync_employee_roles` e encerrar sessões/refresh tokens apenas ao inativar usuário vinculado.
- [x] Informar na interface que um JWT aberto pode permanecer válido até expirar.
- [x] Rodar testes focados, typecheck, build, checks e revisar o diff.
- [x] Commit `feat: revoke sessions when staff is deactivated`.

### Task 2: Registrar entrega

- [x] Marcar roadmap #76 e registrar que a migration continua local.
- [x] Commit `docs: record staff session revocation`.
