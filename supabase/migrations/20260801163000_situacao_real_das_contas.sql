-- O painel mostrava uma chave "Ativo" que não impedia nada.
--
-- Ela grava profiles.ativo, e nada no sistema lê esse campo para negar acesso:
-- nem o contexto de autenticação, nem as rotas, nem uma política de RLS
-- sequer. Quem fosse "desativado" continuava entrando e trabalhando
-- normalmente. Pior que uma ferramenta ausente: uma que o dono usa achando que
-- resolveu.
--
-- O bloqueio de verdade mora em auth.users.banned_until, no schema `auth`, que
-- o PostgREST não expõe. Esta função traz de lá o que o painel precisa mostrar,
-- para todas as contas de uma vez — em vez de uma chamada por linha da tabela.

create or replace function public.admin_situacao_contas()
returns table (
  user_id           uuid,
  bloqueado         boolean,
  bloqueado_ate     timestamptz,
  email_confirmado  boolean,
  ultimo_login      timestamptz,
  sessoes_abertas   integer
)
language plpgsql
stable
security definer
set search_path to 'auth', 'public'
as $$
begin
  -- SECURITY DEFINER lê o schema auth com os privilégios do dono da função.
  -- Sem esta guarda, qualquer usuário logado listaria o último login e o
  -- estado de confirmação de e-mail de toda a base.
  if not public.is_platform_admin() then
    raise exception 'Apenas o dono da plataforma pode consultar a situação das contas'
      using errcode = '42501';
  end if;

  return query
  select u.id,
         (u.banned_until is not null and u.banned_until > now()) as bloqueado,
         u.banned_until,
         (u.email_confirmed_at is not null) as email_confirmado,
         u.last_sign_in_at,
         (select count(*)::integer from auth.sessions s where s.user_id = u.id)
    from auth.users u;
end;
$$;

revoke all on function public.admin_situacao_contas() from public;
revoke all on function public.admin_situacao_contas() from anon;
grant execute on function public.admin_situacao_contas() to authenticated;

comment on function public.admin_situacao_contas() is
  'Estado de acesso de cada conta (bloqueio, confirmação, último login). Só para o dono da plataforma.';
