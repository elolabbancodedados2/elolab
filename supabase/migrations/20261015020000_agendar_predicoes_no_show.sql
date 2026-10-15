-- Reconciliação retroativa: esta versão já está registrada em produção
-- (supabase_migrations.schema_migrations) mas nunca tinha um arquivo no git.
-- O texto original não foi preservado (a coluna `statements` ficou vazia),
-- então este arquivo recria o efeito observado na instância de produção,
-- não o script exato que rodou.
--
-- Efeito observado: a função `public.atualizar_predicoes_no_show()` (já
-- criada e versionada em 20260817294000_risco_no_show_baseado_em_historico.sql)
-- está agendada no pg_cron com o nome 'atualizar-risco-no-show' às :15 de
-- cada hora. Esse agendamento já existia desde a migration de 17/08 — esta
-- versão reagenda o mesmo job de forma idempotente (cron.schedule substitui
-- um job existente pelo nome), então não há mudança de comportamento real em
-- produção; o objetivo aqui é só fazer git e banco pararem de divergir.
SELECT cron.schedule(
  'atualizar-risco-no-show',
  '15 * * * *',
  $$SELECT public.atualizar_predicoes_no_show();$$
);
