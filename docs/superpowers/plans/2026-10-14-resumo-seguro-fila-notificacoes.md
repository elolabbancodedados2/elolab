# Resumo seguro da fila de notificações

**Goal:** Mostrar próxima tentativa, tentativas e motivo resumido sem enviar conteúdo de mensagem, assunto ou contatos desnecessários ao navegador.

### Tasks

- [x] Criar classificador de erros conhecido com fallback que nunca devolve a entrada bruta.
- [x] Limitar o `select` da fila aos campos operacionais usados pela tela.
- [x] Ocultar e-mail/telefone na lista e remover o assunto como detalhe.
- [x] Identificar horário como próxima tentativa/agendado.
- [x] Validar resumos, tela Playwright sintética, TypeScript, build e checks.
- [x] Registrar item #83 no roadmap; nenhuma migration necessária.
