# Reserva temporária no agendamento público

## Escopo

Quando uma pessoa escolhe um horário, reservar a faixa por cinco minutos enquanto preenche os dados. Uma reserva abandonada volta a aparecer automaticamente quando expira.

## Implementação

- A Edge Function valida clínica, profissional, data, agenda e limite por IP antes de pedir uma reserva.
- Uma RPC com advisory lock serializa reservas para o mesmo profissional e dia; outra pessoa não pode segurar uma faixa sobreposta.
- O browser cria um token UUID aleatório; somente o SHA-256 fica persistido. As tabelas não têm grants para `anon` ou `authenticated` e RLS permanece habilitada.
- A confirmação exige o token e a faixa exata, verifica novamente os conflitos e consome a reserva na mesma transação da criação do agendamento.
- A consulta dos horários disponíveis inclui reservas ainda válidas e falha fechada se a leitura falhar.

## Validação

- Vitest completo: 277 arquivos, 1.376 testes aprovados.
- Playwright Chromium: 9 jornadas aprovadas, incluindo disputa entre pacientes e confirmação só depois da reserva.
- PGlite descartável: migration aplicada; lock, conflito, consumo, isolamento de clínica e expiração executados.
- PostgreSQL parser: 18 instruções e 3 funções PL/pgSQL.
- `tsc --noEmit`, `deno check`, build de produção e checks de colunas, falhas silenciosas, permissões e acessibilidade aprovados.

## Estado de publicação

Migration e Edge Function continuam locais. Não houve deploy, escrita clínica real ou uso de Docker.
