create table if not exists public.product_feedback (
 id uuid primary key default gen_random_uuid(), protocolo text not null unique,
 clinica_id uuid not null references public.clinicas(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 categoria text not null check(categoria in('duvida','problema','sugestao','elogio','acessibilidade')),
 mensagem text not null check(char_length(mensagem) between 10 and 2000),
 contexto jsonb not null default '{}' check(jsonb_typeof(contexto)='object'),
 status text not null default 'recebido' check(status in('recebido','em_analise','planejado','resolvido','encerrado')),
 resposta_publica text check(resposta_publica is null or char_length(resposta_publica) between 2 and 2000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 responded_at timestamptz, responded_by uuid references auth.users(id)
);
alter table public.product_feedback enable row level security;
alter table public.product_feedback force row level security;
create policy "usuario acompanha proprio feedback" on public.product_feedback for select to authenticated
 using((user_id=auth.uid() and clinica_id=public.current_clinica_id()) or public.is_platform_admin());
revoke all on public.product_feedback from public,anon;
grant select on public.product_feedback to authenticated;
revoke insert,update,delete on public.product_feedback from authenticated;
create index product_feedback_user_created_idx on public.product_feedback(user_id,created_at desc);
create index product_feedback_queue_idx on public.product_feedback(status,created_at desc);

create or replace function public.submit_product_feedback(p_categoria text,p_mensagem text,p_contexto jsonb default '{}'::jsonb)
returns table(id uuid,protocolo text,status text,created_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_clinic uuid:=public.current_clinica_id(); v_cat text:=lower(btrim(coalesce(p_categoria,'')));
 v_msg text; v_ctx jsonb:=coalesce(p_contexto,'{}'); v_id uuid:=gen_random_uuid(); v_code text;
begin
 if v_uid is null then raise exception 'Sessão inválida'; end if;
 if v_clinic is null then raise exception 'Usuário sem clínica ativa'; end if;
 if v_cat not in('duvida','problema','sugestao','elogio','acessibilidade') then raise exception 'Categoria inválida'; end if;
 v_msg:=btrim(regexp_replace(regexp_replace(coalesce(p_mensagem,''),'<[^>]*>',' ','g'),'[[:cntrl:]]',' ','g'));
 if char_length(v_msg) not between 10 and 2000 then raise exception 'A mensagem deve ter entre 10 e 2000 caracteres'; end if;
 if jsonb_typeof(v_ctx)<>'object' or exists(select 1 from jsonb_object_keys(v_ctx) k where k not in('tela','acao','erro'))
   or char_length(coalesce(v_ctx->>'tela',''))>100 or char_length(coalesce(v_ctx->>'acao',''))>300
   or char_length(coalesce(v_ctx->>'erro',''))>500 then raise exception 'Contexto técnico inválido'; end if;
 if(select count(*) from public.product_feedback pf where pf.user_id=v_uid and pf.created_at>now()-interval '15 minutes')>=3
   then raise exception 'Limite temporário atingido. Aguarde 15 minutos'; end if;
 v_ctx:=jsonb_strip_nulls(jsonb_build_object(
  'tela',nullif(btrim(regexp_replace(coalesce(v_ctx->>'tela',''),'[[:cntrl:]<>]',' ','g')),''),
  'acao',nullif(btrim(regexp_replace(coalesce(v_ctx->>'acao',''),'[[:cntrl:]<>]',' ','g')),''),
  'erro',nullif(btrim(regexp_replace(coalesce(v_ctx->>'erro',''),'[[:cntrl:]<>]',' ','g')),'')));
 v_code:='FB-'||to_char(now(),'YYYY')||'-'||upper(substr(replace(v_id::text,'-',''),1,8));
 insert into public.product_feedback(id,protocolo,clinica_id,user_id,categoria,mensagem,contexto)
 values(v_id,v_code,v_clinic,v_uid,v_cat,v_msg,v_ctx);
 return query select v_id,v_code,'recebido'::text,now();
end$$;
revoke all on function public.submit_product_feedback(text,text,jsonb) from public;
grant execute on function public.submit_product_feedback(text,text,jsonb) to authenticated;
create or replace function public.manage_product_feedback(p_id uuid,p_status text,p_resposta text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_answer text:=nullif(btrim(regexp_replace(coalesce(p_resposta,''),'<[^>]*>',' ','g')),'');
begin
 if not public.is_platform_admin() then raise exception 'Acesso restrito à plataforma'; end if;
 if p_status not in('recebido','em_analise','planejado','resolvido','encerrado') then raise exception 'Status inválido'; end if;
 if v_answer is not null and char_length(v_answer) not between 2 and 2000 then raise exception 'Resposta inválida'; end if;
 update public.product_feedback set status=p_status,resposta_publica=v_answer,responded_at=case when v_answer is null then responded_at else now() end,
  responded_by=case when v_answer is null then responded_by else auth.uid() end,updated_at=now() where id=p_id;
 if not found then raise exception 'Feedback não encontrado'; end if;
end$$;
revoke all on function public.manage_product_feedback(uuid,text,text) from public;
grant execute on function public.manage_product_feedback(uuid,text,text) to authenticated;
comment on table public.product_feedback is 'Feedback individual. Contexto técnico é opcional e nunca coletado automaticamente.';
