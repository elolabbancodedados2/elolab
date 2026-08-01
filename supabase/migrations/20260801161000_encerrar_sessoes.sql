-- Bloquear uma conta no Auth impede o PRÓXIMO login, mas não derruba quem já
-- está dentro: o token de acesso é assinado e vale sozinho até expirar. Apagar
-- as sessões faz a renovação falhar, então o acesso acaba no fim do token
-- corrente em vez de continuar indefinidamente.
--
-- Ainda existe a janela do token já emitido (1 h no padrão do Supabase). Não dá
-- para fechá-la sem encurtar a validade do token para todo mundo — a tela avisa
-- disso em vez de prometer corte imediato.

create or replace function public.admin_encerrar_sessoes(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'auth', 'public'
as $$
declare
  v_removidas integer;
begin
  delete from auth.refresh_tokens where user_id = p_user_id::text;
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics v_removidas = row_count;
  return v_removidas;
end;
$$;

-- Só o service_role, que é a Edge Function admin-contas. Nenhuma sessão de
-- navegador chega aqui: sem este REVOKE, `authenticated` herdaria o EXECUTE
-- padrão de PUBLIC e qualquer usuário logado poderia derrubar a sessão de
-- qualquer outro pelo id.
revoke all on function public.admin_encerrar_sessoes(uuid) from public;
revoke all on function public.admin_encerrar_sessoes(uuid) from anon;
revoke all on function public.admin_encerrar_sessoes(uuid) from authenticated;
grant execute on function public.admin_encerrar_sessoes(uuid) to service_role;

comment on function public.admin_encerrar_sessoes(uuid) is
  'Encerra as sessões de uma conta. Chamada apenas pela Edge Function admin-contas.';
