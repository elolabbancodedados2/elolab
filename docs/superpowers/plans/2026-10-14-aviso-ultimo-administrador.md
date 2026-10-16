# Aviso antes de remover o último administrador

**Goal:** Avisar antes de salvar quando um administrador ativo vinculado está sendo desativado ou perdendo o papel `admin`, mantendo a validação transacional no banco.

**Architecture:** Uma função pura compara situação atual e próxima situação do funcionário. O editor de equipe passa o resultado para `RoleAccessPreview`, que apresenta uma mensagem acessível. O banco segue responsável por contar os administradores reais e recusar a remoção do último.

## Review focus

- Mostrar somente para conta vinculada, ativa e atualmente administradora quando a mudança remove esse acesso.
- A mensagem não promete bloqueio local nem substitui a verificação transacional.
- Não alterar papéis, autorização, dados clínicos ou financeiros.

### Task 1: Exibir aviso preventivo

- [x] Escrever testes da regra para remoção, inativação, manutenção do acesso, conta não vinculada e reativação.
- [x] Confirmar falha inicial por módulo ausente.
- [x] Implementar regra pura e renderização acessível da mensagem.
- [x] Rodar 7 testes focados, TypeScript, build, ESLint e check de acessibilidade.
- [x] Commit `feat: warn before removing last clinic admin`.

### Task 2: Registrar entrega

- [x] Marcar roadmap #77.
- [x] Commit `docs: record last admin warning`.
