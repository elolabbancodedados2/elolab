-- A lista de ações permitidas era estreita demais para a auditoria.
--
-- Quando alguém sem permissão era recusado, o registro não sabia ainda o que a
-- pessoa tinha pedido — a checagem vinha antes de ler o corpo — e gravava
-- "bloquear" para tudo. O log dizia que tentaram bloquear uma conta quando na
-- verdade tentaram APAGAR. Numa auditoria, essa diferença é a única que importa.
--
-- Agora a função lê o pedido antes de recusar, e precisa poder gravar dois
-- valores que não são ações de verdade: a consulta de prévia e o caso em que a
-- pessoa mandou algo que o sistema nem reconhece.

alter table public.admin_acoes drop constraint if exists admin_acoes_acao_check;

alter table public.admin_acoes add constraint admin_acoes_acao_check check (acao in (
  'bloquear', 'desbloquear', 'trocar_senha',
  'enviar_reset', 'confirmar_email', 'apagar',
  -- Só leitura, registrada apenas quando é recusada: consultar quem é uma
  -- conta já é reconhecimento de alvo.
  'previa',
  -- Pedido irreconhecível. O texto exato vai em `detalhe`, sem virar coluna,
  -- para que ninguém consiga inventar valores novos nesta lista.
  'desconhecida'
));
