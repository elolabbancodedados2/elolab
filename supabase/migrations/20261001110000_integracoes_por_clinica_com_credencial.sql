-- Credenciais de integração por clínica (e, quando preciso, por profissional).
--
-- MODELO
--   Integração da PLATAFORMA (Brevo, IA, Mercado Pago da assinatura, chave de
--   parceiro da Memed): uma conta do EloLab, segredo em variável de ambiente.
--   Integração da CLÍNICA (token da empresa no emissor de NF, conta de
--   pagamento da clínica, token do prescritor na Memed): uma credencial por
--   clínica — ou por profissional, via `referencia_id` — guardada AQUI.
--
-- SEGURANÇA
--   * O segredo é gravado cifrado (AES-GCM) pela edge function
--     `clinic-integrations`, com a chave INTEGRACOES_CHAVE_CRIPTO, que só
--     existe no servidor. O banco nunca vê o segredo em claro.
--   * A tabela não tem política para `authenticated`: o navegador não lê nem
--     escreve nela. A leitura de status (sem segredo) é pela função
--     `integracoes_da_clinica()`; a escrita, pela edge function.

create table if not exists public.integracoes_clinica (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  provedor text not null check (provedor ~ '^[a-z0-9_]{2,40}$'),
  -- Profissional/recurso dono da credencial (ex.: médico na Memed). Nulo = a clínica.
  referencia_id uuid,
  status text not null default 'conectado' check (status in ('conectado', 'erro', 'desconectado')),
  -- Dados não sensíveis, exibidos na tela (ambiente, nº da empresa, CNPJ...).
  config jsonb not null default '{}'::jsonb,
  -- Segredo cifrado: base64(iv || ciphertext). Nunca devolvido ao navegador.
  segredo_cifrado text,
  -- Últimos caracteres do segredo, para o admin reconhecer qual está salvo.
  segredo_dica text,
  ultimo_erro text,
  ultimo_teste_em timestamptz,
  conectado_por uuid references auth.users(id) on delete set null,
  conectado_em timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists integracoes_clinica_unica_idx
  on public.integracoes_clinica (clinica_id, provedor, coalesce(referencia_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.integracoes_clinica enable row level security;
revoke all on public.integracoes_clinica from anon, authenticated;

-- Status das integrações da clínica do usuário, sem segredo. Só admin.
create or replace function public.integracoes_da_clinica()
returns table (
  provedor text,
  referencia_id uuid,
  status text,
  config jsonb,
  segredo_dica text,
  ultimo_erro text,
  ultimo_teste_em timestamptz,
  conectado_em timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select i.provedor, i.referencia_id, i.status, i.config, i.segredo_dica,
         i.ultimo_erro, i.ultimo_teste_em, i.conectado_em, i.updated_at
  from public.integracoes_clinica i
  where i.clinica_id = public.current_clinica_id()
    and public.has_role(auth.uid(), 'admin')
  order by i.provedor, i.referencia_id nulls first;
$$;

revoke all on function public.integracoes_da_clinica() from public, anon;
grant execute on function public.integracoes_da_clinica() to authenticated;

-- A tabela antiga `integraciones` guardava `chave_secreta` em texto puro e
-- qualquer membro da clínica (inclusive recepção) podia lê-la. Nenhuma tela a
-- usa; restringimos a leitura ao admin da clínica e à plataforma até ela ser
-- migrada para `integracoes_clinica` e removida.
drop policy if exists "clinica ou plataforma le integracoes" on public.integraciones;
create policy "admin da clinica ou plataforma le integracoes" on public.integraciones for select to authenticated
  using (
    public.is_platform_admin()
    or (clinica_id = public.current_clinica_id() and public.has_role(auth.uid(), 'admin'))
  );

-- Painel da plataforma (Integrações por Clínica) passa a contar as conexões
-- novas, sem expor segredo — só status, total e última atividade.
create or replace function public.platform_clinic_integration_overview()
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Acesso restrito à plataforma'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.clinica_nome), '[]'::jsonb) into result from (
    select c.id as clinica_id, c.nome as clinica_nome, c.ativo,
      jsonb_build_object('configured',exists(select 1 from public.whatsapp_sessions w where w.clinica_id=c.id),'healthy',exists(select 1 from public.whatsapp_sessions w where w.clinica_id=c.id and lower(coalesce(w.status,'')) in ('connected','conectado','open')),'status',coalesce((select w.status from public.whatsapp_sessions w where w.clinica_id=c.id order by w.updated_at desc nulls last limit 1),'não configurado'),'last_activity',(select w.updated_at from public.whatsapp_sessions w where w.clinica_id=c.id order by w.updated_at desc nulls last limit 1)) whatsapp,
      jsonb_build_object('configured',exists(select 1 from public.integraciones i where i.clinica_id=c.id and i.tipo='smtp'),'healthy',exists(select 1 from public.integraciones i where i.clinica_id=c.id and i.tipo='smtp' and i.status='ativo'),'status',coalesce((select i.status from public.integraciones i where i.clinica_id=c.id and i.tipo='smtp' order by i.updated_at desc limit 1),'não configurado'),'last_activity',(select coalesce(i.ultimo_teste,i.updated_at) from public.integraciones i where i.clinica_id=c.id and i.tipo='smtp' order by i.updated_at desc limit 1)) email,
      jsonb_build_object(
        'configured', exists(select 1 from public.integracoes_clinica n where n.clinica_id=c.id and n.status<>'desconectado')
                      or exists(select 1 from public.integraciones i where i.clinica_id=c.id and i.tipo in ('api','oauth','webhook')),
        'healthy', not exists(select 1 from public.integracoes_clinica n where n.clinica_id=c.id and n.status='erro')
                   and (exists(select 1 from public.integracoes_clinica n where n.clinica_id=c.id and n.status='conectado')
                        or exists(select 1 from public.integraciones i where i.clinica_id=c.id and i.tipo in ('api','oauth','webhook') and i.status='ativo')),
        'total', (select count(*) from public.integracoes_clinica n where n.clinica_id=c.id and n.status<>'desconectado')
                 + (select count(*) from public.integraciones i where i.clinica_id=c.id and i.tipo in ('api','oauth','webhook')),
        'last_activity', greatest(
          (select max(coalesce(n.ultimo_teste_em,n.updated_at)) from public.integracoes_clinica n where n.clinica_id=c.id),
          (select max(coalesce(i.ultimo_teste,i.updated_at)) from public.integraciones i where i.clinica_id=c.id and i.tipo in ('api','oauth','webhook')))
      ) apis,
      jsonb_build_object('configured',exists(select 1 from public.platform_ai_usage a where a.clinica_id=c.id),'healthy',coalesce((select a.sucesso from public.platform_ai_usage a where a.clinica_id=c.id order by a.created_at desc limit 1),false),'status',coalesce((select case when a.sucesso then 'operacional' else 'falha recente' end from public.platform_ai_usage a where a.clinica_id=c.id order by a.created_at desc limit 1),'sem uso'),'last_activity',(select a.created_at from public.platform_ai_usage a where a.clinica_id=c.id order by a.created_at desc limit 1)) ia,
      jsonb_build_object('configured',exists(select 1 from public.assinaturas_mercadopago m where m.clinica_id=c.id),'healthy',exists(select 1 from public.assinaturas_mercadopago m where m.clinica_id=c.id and lower(coalesce(m.status,'')) in ('authorized','ativa','active')),'status',coalesce((select m.status from public.assinaturas_mercadopago m where m.clinica_id=c.id order by m.updated_at desc limit 1),'não vinculado'),'last_activity',(select m.updated_at from public.assinaturas_mercadopago m where m.clinica_id=c.id order by m.updated_at desc limit 1)) pagamentos
    from public.clinicas c
  ) x;
  return jsonb_build_object('generated_at',now(),'clinics',result);
end; $$;

revoke all on function public.platform_clinic_integration_overview() from public, anon;
grant execute on function public.platform_clinic_integration_overview() to authenticated;
