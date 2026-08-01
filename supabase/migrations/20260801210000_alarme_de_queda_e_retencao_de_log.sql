-- 1. Ninguém era avisado quando o app saía do ar.
--
-- Em 01/08 o app ficou fora do ar e a descoberta foi por acaso, olhando outra
-- coisa. Sem vigilância, quem descobre é o cliente ligando — e até lá a clínica
-- passou a manhã sem conseguir marcar consulta.
--
-- LIMITE HONESTO: esta vigilância roda dentro do Supabase. Se o Supabase cair,
-- ela cai junto e nada avisa. Ela cobre a queda do site — que é exatamente o
-- que aconteceu, e o caso mais provável, porque o site muda toda semana e o
-- banco quase nunca.

create table if not exists public.monitor_saude (
  id            uuid primary key default gen_random_uuid(),
  alvo          text        not null,
  ok            boolean     not null,
  status_code   integer,
  erro          text,
  ms            integer,
  -- Marca a verificação que MUDOU o estado (no ar -> fora, ou fora -> no ar).
  -- É por essas que o aviso é disparado; as demais só formam o histórico.
  virada        boolean     not null default false,
  verificado_em timestamptz not null default now()
);

create index if not exists idx_monitor_saude_recente
  on public.monitor_saude (alvo, verificado_em desc);

alter table public.monitor_saude enable row level security;

-- Só o dono da plataforma lê. Escrita é do service_role (a função de
-- vigilância), que ignora RLS.
drop policy if exists monitor_saude_select_plataforma on public.monitor_saude;
create policy monitor_saude_select_plataforma on public.monitor_saude
  for select to authenticated
  using (public.is_platform_admin());

comment on table public.monitor_saude is
  'Histórico de disponibilidade do app. Escrito pela Edge Function monitor-app.';


-- 2. O registro de automação voltaria a crescer sem limite.
--
-- Ele chegou a 41.700 linhas — 400 vezes a tabela de pacientes — quase todas
-- dizendo que um cron rodou e não encontrou nada para fazer. As funções pararam
-- de gravar essas linhas, mas quem grava de verdade também acumula, e sem teto
-- o problema volta devagar.

create or replace function public.limpar_logs_antigos()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_apagadas integer;
begin
  delete from public.automation_logs
   where created_at < now() - interval '90 days';
  get diagnostics v_apagadas = row_count;

  -- A vigilância grava a cada 5 minutos; 30 dias de histórico bastam para
  -- entender um episódio, e as viradas ficam guardadas por um ano.
  delete from public.monitor_saude
   where verificado_em < now() - interval '30 days'
     and not virada;

  delete from public.monitor_saude
   where verificado_em < now() - interval '365 days';

  return v_apagadas;
end;
$$;

revoke all on function public.limpar_logs_antigos() from public;
revoke all on function public.limpar_logs_antigos() from anon;
revoke all on function public.limpar_logs_antigos() from authenticated;
grant execute on function public.limpar_logs_antigos() to service_role;

-- Domingo 4h, depois do backup semanal das 3h — para que o que for apagado já
-- tenha entrado no arquivo daquela semana.
select cron.schedule(
  'limpar-logs-antigos',
  '0 4 * * 0',
  $cron$ select public.limpar_logs_antigos(); $cron$
);
