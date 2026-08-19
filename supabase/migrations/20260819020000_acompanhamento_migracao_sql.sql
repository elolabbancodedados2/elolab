create table if not exists public.platform_migration_runs (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  status text not null default 'pendente' check (status in ('pendente','executando','validando','concluida','falhou')),
  progresso smallint not null default 0 check (progresso between 0 and 100),
  etapa_atual text,
  total_etapas integer not null default 0 check (total_etapas >= 0),
  etapas_concluidas integer not null default 0 check (etapas_concluidas >= 0 and etapas_concluidas <= total_etapas),
  mensagem text,
  iniciada_em timestamptz,
  concluida_em timestamptz,
  atualizada_em timestamptz not null default now(),
  atualizada_por uuid references auth.users(id)
);

alter table public.platform_migration_runs enable row level security;

drop policy if exists "platform admin le migracoes" on public.platform_migration_runs;
create policy "platform admin le migracoes" on public.platform_migration_runs
for select to authenticated using (public.is_platform_admin());

drop policy if exists "platform admin gerencia migracoes" on public.platform_migration_runs;
create policy "platform admin gerencia migracoes" on public.platform_migration_runs
for all to authenticated using (public.is_platform_admin())
with check (public.is_platform_admin() and atualizada_por = auth.uid());

create index if not exists platform_migration_runs_status_idx
on public.platform_migration_runs(status, atualizada_em desc);

insert into public.platform_migration_runs
  (nome, status, progresso, etapa_atual, total_etapas, etapas_concluidas, mensagem, iniciada_em)
select
  'Migração principal para SQL', 'executando', 10, 'Preparação e validação do esquema', 5, 0,
  'A plataforma permanece bloqueada até a validação integral dos dados.', now()
where not exists (select 1 from public.platform_migration_runs where nome = 'Migração principal para SQL');

