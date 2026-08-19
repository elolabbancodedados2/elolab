-- Inventário multi-tenant e diagnóstico seguro das integrações. Nenhum segredo é retornado.
create table if not exists public.integraciones (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('api','webhook','oauth','smtp')),
  chave text not null,
  chave_secreta text,
  webhook_url text,
  status text default 'inativo' check (status in ('ativo','inativo','erro')),
  config_data jsonb default '{}'::jsonb,
  ultimo_teste timestamptz,
  teste_resultado text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.integraciones enable row level security;
alter table public.integraciones
  add column if not exists clinica_id uuid references public.clinicas(id) on delete cascade;

create index if not exists integraciones_clinica_tipo_idx on public.integraciones(clinica_id, tipo);

drop policy if exists "Apenas admin pode ver integrações" on public.integraciones;
drop policy if exists "Apenas admin pode ver integraÃ§Ãµes" on public.integraciones;
create policy "clinica ou plataforma le integracoes" on public.integraciones for select to authenticated
  using (public.is_platform_admin() or clinica_id = public.current_clinica_id());
create policy "admin da clinica gerencia integracoes" on public.integraciones for all to authenticated
  using (clinica_id = public.current_clinica_id() and public.has_role(auth.uid(), 'admin'))
  with check (clinica_id = public.current_clinica_id() and public.has_role(auth.uid(), 'admin'));

create or replace function public.platform_clinic_integration_overview()
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Acesso restrito à plataforma'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.clinica_nome), '[]'::jsonb) into result from (
    select c.id as clinica_id, c.nome as clinica_nome, c.ativo,
      jsonb_build_object('configured',exists(select 1 from public.whatsapp_sessions w where w.clinica_id=c.id),'healthy',exists(select 1 from public.whatsapp_sessions w where w.clinica_id=c.id and lower(coalesce(w.status,'')) in ('connected','conectado','open')),'status',coalesce((select w.status from public.whatsapp_sessions w where w.clinica_id=c.id order by w.updated_at desc nulls last limit 1),'não configurado'),'last_activity',(select w.updated_at from public.whatsapp_sessions w where w.clinica_id=c.id order by w.updated_at desc nulls last limit 1)) whatsapp,
      jsonb_build_object('configured',exists(select 1 from public.integraciones i where i.clinica_id=c.id and i.tipo='smtp'),'healthy',exists(select 1 from public.integraciones i where i.clinica_id=c.id and i.tipo='smtp' and i.status='ativo'),'status',coalesce((select i.status from public.integraciones i where i.clinica_id=c.id and i.tipo='smtp' order by i.updated_at desc limit 1),'não configurado'),'last_activity',(select coalesce(i.ultimo_teste,i.updated_at) from public.integraciones i where i.clinica_id=c.id and i.tipo='smtp' order by i.updated_at desc limit 1)) email,
      jsonb_build_object('configured',exists(select 1 from public.integraciones i where i.clinica_id=c.id and i.tipo in ('api','oauth','webhook')),'healthy',exists(select 1 from public.integraciones i where i.clinica_id=c.id and i.tipo in ('api','oauth','webhook') and i.status='ativo'),'total',(select count(*) from public.integraciones i where i.clinica_id=c.id and i.tipo in ('api','oauth','webhook')),'last_activity',(select max(coalesce(i.ultimo_teste,i.updated_at)) from public.integraciones i where i.clinica_id=c.id and i.tipo in ('api','oauth','webhook'))) apis,
      jsonb_build_object('configured',exists(select 1 from public.platform_ai_usage a where a.clinica_id=c.id),'healthy',coalesce((select a.sucesso from public.platform_ai_usage a where a.clinica_id=c.id order by a.created_at desc limit 1),false),'status',coalesce((select case when a.sucesso then 'operacional' else 'falha recente' end from public.platform_ai_usage a where a.clinica_id=c.id order by a.created_at desc limit 1),'sem uso'),'last_activity',(select a.created_at from public.platform_ai_usage a where a.clinica_id=c.id order by a.created_at desc limit 1)) ia,
      jsonb_build_object('configured',exists(select 1 from public.assinaturas_mercadopago m where m.clinica_id=c.id),'healthy',exists(select 1 from public.assinaturas_mercadopago m where m.clinica_id=c.id and lower(coalesce(m.status,'')) in ('authorized','ativa','active')),'status',coalesce((select m.status from public.assinaturas_mercadopago m where m.clinica_id=c.id order by m.updated_at desc limit 1),'não vinculado'),'last_activity',(select m.updated_at from public.assinaturas_mercadopago m where m.clinica_id=c.id order by m.updated_at desc limit 1)) pagamentos
    from public.clinicas c
  ) x;
  return jsonb_build_object('generated_at',now(),'clinics',result);
end; $$;

revoke all on function public.platform_clinic_integration_overview() from public, anon;
grant execute on function public.platform_clinic_integration_overview() to authenticated;
