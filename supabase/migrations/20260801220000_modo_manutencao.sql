-- Modo manutenção: uma tela cheia que impede o uso do sistema enquanto durar.
--
-- Precisa ser ligado e desligado SEM publicar versão nova. Se depender de
-- deploy, ligar leva minutos e desligar leva os mesmos minutos — justamente
-- quando a pressa é maior. Por isso mora no banco.

create table if not exists public.plataforma_estado (
  -- Linha única: o CHECK impede uma segunda, que criaria a dúvida de qual vale.
  id                boolean primary key default true check (id),
  manutencao        boolean not null default false,
  titulo            text    not null default 'Estamos em manutenção',
  mensagem          text    not null default 'O sistema volta em instantes. Nenhum dado seu é perdido durante a manutenção.',
  previsao_retorno  timestamptz,
  atualizado_em     timestamptz not null default now(),
  atualizado_por    uuid
);

insert into public.plataforma_estado (id) values (true) on conflict (id) do nothing;

alter table public.plataforma_estado enable row level security;

-- LEITURA ABERTA, de propósito e sem chamar função nenhuma.
--
-- A tela de login também precisa saber que há manutenção, e nela o visitante
-- ainda é `anon`. Uma política que chamasse uma função que o `anon` não pode
-- EXECUTAR devolveria 42501 e derrubaria a consulta inteira — foi o que já
-- aconteceu na página de planos. `using (true)` não tem esse risco.
--
-- O que está exposto é se o sistema está em manutenção e o texto do aviso.
-- Nada disso é segredo: é o que a tela mostra para quem chegar.
drop policy if exists plataforma_estado_leitura_publica on public.plataforma_estado;
create policy plataforma_estado_leitura_publica on public.plataforma_estado
  for select to anon, authenticated
  using (true);

-- Só o dono da plataforma liga e desliga.
drop policy if exists plataforma_estado_escrita_dono on public.plataforma_estado;
create policy plataforma_estado_escrita_dono on public.plataforma_estado
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Sem política de INSERT nem DELETE: a linha é única e já existe. Ninguém
-- apaga o interruptor por engano.

create or replace function public.registrar_quem_mudou_manutencao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_plataforma_estado_carimbo on public.plataforma_estado;
create trigger trg_plataforma_estado_carimbo
  before update on public.plataforma_estado
  for each row execute function public.registrar_quem_mudou_manutencao();

comment on table public.plataforma_estado is
  'Interruptor do modo manutenção. Linha única. Para desligar em emergência: update public.plataforma_estado set manutencao = false;';
