-- Registro de tudo que o dono da plataforma faz sobre a conta de outra pessoa:
-- bloquear, trocar senha, apagar. São as ações mais graves do sistema — quem
-- pode trocar a senha de alguém pode entrar na conta dessa pessoa e ler
-- prontuário. Sem registro não há como distinguir manutenção legítima de abuso,
-- nem responder a uma auditoria da LGPD.
--
-- O registro tem que sobreviver ao alvo: apagar a conta não pode apagar a prova
-- de que ela foi apagada. Por isso `alvo_id` não tem chave estrangeira e o
-- e-mail é copiado como texto.

create table if not exists public.admin_acoes (
  id          uuid primary key default gen_random_uuid(),

  -- Se o próprio ator for removido um dia, o texto permanece.
  ator_id     uuid references auth.users(id) on delete set null,
  ator_email  text not null,

  -- Sem FK de propósito: o alvo pode deixar de existir, o registro não.
  alvo_id     uuid,
  alvo_email  text not null,

  acao        text not null check (acao in (
                'bloquear', 'desbloquear', 'trocar_senha',
                'enviar_reset', 'confirmar_email', 'apagar'
              )),
  motivo      text,
  sucesso     boolean not null default true,
  erro        text,
  ip          text,
  detalhe     jsonb not null default '{}'::jsonb,
  criado_em   timestamptz not null default now()
);

create index if not exists idx_admin_acoes_criado_em on public.admin_acoes (criado_em desc);
create index if not exists idx_admin_acoes_alvo      on public.admin_acoes (alvo_email);
create index if not exists idx_admin_acoes_ator      on public.admin_acoes (ator_id);

alter table public.admin_acoes enable row level security;

-- Só o dono da plataforma lê. Não existe política de INSERT/UPDATE/DELETE:
-- quem escreve é a Edge Function com service_role, que ignora RLS. Nenhuma
-- sessão de navegador consegue inserir uma linha forjada.
drop policy if exists admin_acoes_select_plataforma on public.admin_acoes;
create policy admin_acoes_select_plataforma on public.admin_acoes
  for select to authenticated
  using (public.is_platform_admin());

-- Imutabilidade de verdade. A política acima já impede a alteração pelo
-- navegador, mas o service_role passa por cima de RLS — e é justamente ele que
-- a Edge Function usa. O gatilho vale para todos, inclusive para ela.
create or replace function public.admin_acoes_imutavel()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  raise exception 'admin_acoes é registro de auditoria: não pode ser alterado nem apagado';
end;
$$;

drop trigger if exists admin_acoes_sem_update on public.admin_acoes;
create trigger admin_acoes_sem_update
  before update on public.admin_acoes
  for each row execute function public.admin_acoes_imutavel();

drop trigger if exists admin_acoes_sem_delete on public.admin_acoes;
create trigger admin_acoes_sem_delete
  before delete on public.admin_acoes
  for each row execute function public.admin_acoes_imutavel();

comment on table public.admin_acoes is
  'Auditoria imutável das ações do dono da plataforma sobre contas de terceiros. Escrita apenas pela Edge Function admin-contas.';
