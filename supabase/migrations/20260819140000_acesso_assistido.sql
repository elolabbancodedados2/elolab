create table if not exists public.support_access_requests(
 id uuid primary key default gen_random_uuid(),clinica_id uuid not null references public.clinicas(id),requested_by uuid not null references auth.users(id),approved_by uuid references auth.users(id),
 reason text not null check(length(trim(reason)) between 10 and 500),scopes text[] not null default array['diagnostics']::text[],status text not null default 'requested' check(status in('requested','approved','denied','revoked','expired')),
 expires_at timestamptz,decided_at timestamptz,revoked_at timestamptz,created_at timestamptz not null default now()
);
alter table public.support_access_requests enable row level security;
create policy "plataforma gerencia acesso assistido" on public.support_access_requests for all to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin() and requested_by=auth.uid());
create policy "clinica consulta pedidos de suporte" on public.support_access_requests for select to authenticated using(clinica_id=public.current_clinica_id() and public.is_admin(auth.uid()));

create or replace function public.request_support_access(p_clinica_id uuid,p_reason text,p_scopes text[] default array['diagnostics']::text[]) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if not public.is_platform_admin() then raise exception 'Acesso restrito'; end if;
 if length(trim(p_reason))<10 then raise exception 'Informe um motivo detalhado'; end if;
 if p_scopes<@array['diagnostics','configuration','integration_logs']::text[] is not true then raise exception 'Escopo inválido'; end if;
 insert into public.support_access_requests(clinica_id,requested_by,reason,scopes) values(p_clinica_id,auth.uid(),trim(p_reason),p_scopes) returning id into v_id;
 insert into public.audit_log(user_id,clinica_id,action,collection,record_id,changes) values(auth.uid(),p_clinica_id,'create','support_access',v_id::text,jsonb_build_object('reason',trim(p_reason),'scopes',p_scopes));
 return v_id;
end; $$;

create or replace function public.decide_support_access(p_request_id uuid,p_decision text,p_hours integer default 2) returns void language plpgsql security definer set search_path=public as $$
declare v_req public.support_access_requests;
begin
 select * into v_req from public.support_access_requests where id=p_request_id for update;
 if v_req.id is null or v_req.clinica_id<>public.current_clinica_id() or not public.is_admin(auth.uid()) then raise exception 'Pedido não encontrado'; end if;
 if v_req.status<>'requested' then raise exception 'Pedido já decidido'; end if;
 if p_decision not in('approved','denied') then raise exception 'Decisão inválida'; end if;
 update public.support_access_requests set status=p_decision,approved_by=auth.uid(),decided_at=now(),expires_at=case when p_decision='approved' then now()+make_interval(hours=>least(greatest(p_hours,1),8)) end where id=p_request_id;
 insert into public.audit_log(user_id,clinica_id,action,collection,record_id,changes) values(auth.uid(),v_req.clinica_id,'update','support_access',p_request_id::text,jsonb_build_object('decision',p_decision,'hours',p_hours));
end; $$;

create or replace function public.revoke_support_access(p_request_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_req public.support_access_requests;
begin
 select * into v_req from public.support_access_requests where id=p_request_id for update;
 if v_req.id is null or not(public.is_platform_admin() or(v_req.clinica_id=public.current_clinica_id() and public.is_admin(auth.uid()))) then raise exception 'Pedido não encontrado'; end if;
 update public.support_access_requests set status='revoked',revoked_at=now(),expires_at=least(coalesce(expires_at,now()),now()) where id=p_request_id;
end; $$;

create or replace function public.platform_support_context(p_request_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_req public.support_access_requests;
begin
 if not public.is_platform_admin() then raise exception 'Acesso restrito'; end if;
 select * into v_req from public.support_access_requests where id=p_request_id and status='approved' and expires_at>now();
 if v_req.id is null then raise exception 'Autorização ausente ou expirada'; end if;
 return jsonb_build_object('clinica_id',v_req.clinica_id,'expires_at',v_req.expires_at,'scopes',v_req.scopes,
  'active_users',(select count(*) from public.profiles where clinica_id=v_req.clinica_id and ativo),
  'failed_automations_24h',(select count(*) from public.automation_logs where clinica_id=v_req.clinica_id and status='erro' and created_at>=now()-interval '24 hours'),
  'open_support_tickets',(select count(*) from public.support_tickets where clinica_id=v_req.clinica_id and status not in('resolvido','fechado')));
end; $$;
revoke all on function public.request_support_access(uuid,text,text[]),public.decide_support_access(uuid,text,integer),public.revoke_support_access(uuid),public.platform_support_context(uuid) from public,anon;
grant execute on function public.request_support_access(uuid,text,text[]),public.decide_support_access(uuid,text,integer),public.revoke_support_access(uuid),public.platform_support_context(uuid) to authenticated;
