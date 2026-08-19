create table if not exists public.support_tickets (
 id uuid primary key default gen_random_uuid(), clinica_id uuid not null references public.clinicas(id), solicitante_id uuid not null references auth.users(id),
 titulo text not null check (length(trim(titulo)) between 5 and 160), descricao text not null check (length(trim(descricao)) between 10 and 5000),
 categoria text not null default 'duvida' check (categoria in ('duvida','incidente','financeiro','integracao','seguranca')),
 prioridade text not null default 'normal' check (prioridade in ('baixa','normal','alta','critica')),
 status text not null default 'aberto' check (status in ('aberto','em_atendimento','aguardando_cliente','resolvido','fechado')),
 responsavel_id uuid references auth.users(id), sla_limite timestamptz not null,
 primeira_resposta_em timestamptz, resolvido_em timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.support_ticket_messages (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.support_tickets(id) on delete cascade,
 autor_id uuid not null references auth.users(id), mensagem text not null check (length(trim(mensagem)) between 1 and 5000), interno boolean not null default false, created_at timestamptz not null default now()
);
alter table public.support_tickets enable row level security; alter table public.support_ticket_messages enable row level security;
create or replace function public.support_sla(p text) returns interval language sql immutable as $$ select case p when 'critica' then interval '1 hour' when 'alta' then interval '4 hours' when 'normal' then interval '12 hours' else interval '24 hours' end $$;
create or replace function public.support_ticket_defaults() returns trigger language plpgsql security definer set search_path=public as $$ begin new.updated_at=now(); if tg_op='INSERT' then new.solicitante_id=auth.uid(); new.clinica_id=current_clinica_id(); new.sla_limite=now()+support_sla(new.prioridade); end if; return new; end $$;
drop trigger if exists support_ticket_defaults_trigger on public.support_tickets; create trigger support_ticket_defaults_trigger before insert or update on public.support_tickets for each row execute function public.support_ticket_defaults();
create policy "clinica cria ticket" on public.support_tickets for insert to authenticated with check (clinica_id=current_clinica_id() and solicitante_id=auth.uid());
create policy "clinica le ticket" on public.support_tickets for select to authenticated using (clinica_id=current_clinica_id() or is_platform_admin());
create policy "plataforma gerencia ticket" on public.support_tickets for update to authenticated using (is_platform_admin()) with check (is_platform_admin());
create policy "participantes leem mensagens" on public.support_ticket_messages for select to authenticated using (exists(select 1 from public.support_tickets t where t.id=ticket_id and (t.clinica_id=current_clinica_id() or is_platform_admin()) and (not interno or is_platform_admin())));
create policy "participantes respondem" on public.support_ticket_messages for insert to authenticated with check (autor_id=auth.uid() and exists(select 1 from public.support_tickets t where t.id=ticket_id and (t.clinica_id=current_clinica_id() or is_platform_admin())) and (not interno or is_platform_admin()));
create index if not exists support_tickets_queue_idx on public.support_tickets(status, prioridade, sla_limite); create index if not exists support_messages_ticket_idx on public.support_ticket_messages(ticket_id,created_at);

