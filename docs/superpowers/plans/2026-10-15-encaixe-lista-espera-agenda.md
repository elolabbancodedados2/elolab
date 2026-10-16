# Encaixe compatível da lista de espera

## Escopo

Ao arrastar uma pessoa para uma vaga, validar o médico preferencial, a especialidade e o período de atendimento escolhidos antes de abrir a confirmação.

## Implementação

- Vaga incompatível é recusada com a preferência que não foi atendida.
- O rascunho preserva paciente, profissional, data, hora, especialidade, motivo, observações e turno preferido.
- A confirmação continua no diálogo de agendamento; o status da lista só muda após salvar.
- A verificação é pura e tem contrato testado; não altera agenda ou lista antes da confirmação.

## Validação

- Vitest focado: 9 testes de compatibilidade, preparação do rascunho, integração no `AgendaPage` e anúncios DnD aprovados.
- `tsc --noEmit`, build de produção, checks de permissões/acessibilidade e `git diff --check` aprovados.
- Sem migration, deploy ou gravação clínica real.
