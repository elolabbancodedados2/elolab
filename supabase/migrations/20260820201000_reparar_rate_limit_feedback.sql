create or replace function public.submit_product_feedback(p_categoria text,p_mensagem text,p_contexto jsonb default '{}'::jsonb)
returns table(id uuid,protocolo text,status text,created_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_clinic uuid:=public.current_clinica_id(); v_cat text:=lower(btrim(coalesce(p_categoria,'')));
 v_msg text; v_ctx jsonb:=coalesce(p_contexto,'{}'); v_id uuid:=gen_random_uuid(); v_code text;
begin
 if v_uid is null then raise exception 'Sessao invalida'; end if;
 if v_clinic is null then raise exception 'Usuario sem clinica ativa'; end if;
 if v_cat not in('duvida','problema','sugestao','elogio','acessibilidade') then raise exception 'Categoria invalida'; end if;
 v_msg:=btrim(regexp_replace(regexp_replace(coalesce(p_mensagem,''),'<[^>]*>',' ','g'),'[[:cntrl:]]',' ','g'));
 if char_length(v_msg) not between 10 and 2000 then raise exception 'A mensagem deve ter entre 10 e 2000 caracteres'; end if;
 if jsonb_typeof(v_ctx)<>'object' or exists(select 1 from jsonb_object_keys(v_ctx) k where k not in('tela','acao','erro'))
   or char_length(coalesce(v_ctx->>'tela',''))>100 or char_length(coalesce(v_ctx->>'acao',''))>300
   or char_length(coalesce(v_ctx->>'erro',''))>500 then raise exception 'Contexto tecnico invalido'; end if;
 if(select count(*) from public.product_feedback pf where pf.user_id=v_uid and pf.created_at>now()-interval '15 minutes')>=3
   then raise exception 'Limite temporario atingido. Aguarde 15 minutos'; end if;
 v_ctx:=jsonb_strip_nulls(jsonb_build_object(
  'tela',nullif(btrim(regexp_replace(coalesce(v_ctx->>'tela',''),'[[:cntrl:]<>]',' ','g')),''),
  'acao',nullif(btrim(regexp_replace(coalesce(v_ctx->>'acao',''),'[[:cntrl:]<>]',' ','g')),''),
  'erro',nullif(btrim(regexp_replace(coalesce(v_ctx->>'erro',''),'[[:cntrl:]<>]',' ','g')),'')));
 v_code:='FB-'||to_char(now(),'YYYY')||'-'||upper(substr(replace(v_id::text,'-',''),1,8));
 insert into public.product_feedback(id,protocolo,clinica_id,user_id,categoria,mensagem,contexto)
 values(v_id,v_code,v_clinic,v_uid,v_cat,v_msg,v_ctx);
 return query select v_id,v_code,'recebido'::text,now();
end$$;
revoke all on function public.submit_product_feedback(text,text,jsonb) from public,anon;
grant execute on function public.submit_product_feedback(text,text,jsonb) to authenticated;
