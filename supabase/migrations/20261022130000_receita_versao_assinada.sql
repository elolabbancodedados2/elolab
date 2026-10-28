-- Auditoria médica 2026-10-16, item 15: versão assinada externamente volta à receita.
-- A receita original fica intacta (prescricoes é somente inserção e, quando ligada a
-- prontuário assinado, imutável por trigger). A cópia assinada vive em tabela própria,
-- uma por receita, gravada só pelo RPC abaixo.

create table if not exists public.prescricoes_versoes_assinadas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  prescricao_id uuid not null references public.prescricoes(id) on delete cascade,
  arquivo_pdf text not null,
  anexado_por uuid not null default auth.uid(),
  anexado_em timestamptz not null default now(),
  constraint prescricoes_versoes_assinadas_prescricao_key unique (prescricao_id)
);

create index if not exists prescricoes_versoes_assinadas_clinica_idx
  on public.prescricoes_versoes_assinadas (clinica_id);

alter table public.prescricoes_versoes_assinadas enable row level security;
revoke all on table public.prescricoes_versoes_assinadas from public, anon, authenticated;
grant select on table public.prescricoes_versoes_assinadas to authenticated;

drop policy if exists prescricoes_versoes_assinadas_select on public.prescricoes_versoes_assinadas;
create policy prescricoes_versoes_assinadas_select
  on public.prescricoes_versoes_assinadas for select to authenticated
  using (public.can_access_clinical(auth.uid()) and clinica_id = public.get_my_clinica_id());

create or replace function public.anexar_receita_assinada(p_prescricao_id uuid, p_arquivo_pdf text)
returns public.prescricoes_versoes_assinadas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica_id uuid := public.get_my_clinica_id();
  v_receita public.prescricoes%rowtype;
  v_versao public.prescricoes_versoes_assinadas%rowtype;
begin
  if auth.uid() is null or v_clinica_id is null then
    raise exception 'Sessão sem clínica ativa.' using errcode = '42501';
  end if;

  select * into v_receita from public.prescricoes
   where id = p_prescricao_id and clinica_id = v_clinica_id;
  if not found then
    raise exception 'Receita não encontrada na clínica atual.' using errcode = 'P0002';
  end if;

  -- Só o médico prescritor ou um administrador da clínica anexa a versão assinada.
  if not (
    public.is_admin(auth.uid())
    or exists (select 1 from public.medicos m
                where m.id = v_receita.medico_id and m.clinica_id = v_clinica_id and m.user_id = auth.uid())
  ) then
    raise exception 'Somente o médico prescritor ou um administrador pode anexar a versão assinada.'
      using errcode = '42501';
  end if;

  if v_receita.arquivo_pdf is null then
    raise exception 'A receita não tem PDF emitido no EloLab para ser assinado.' using errcode = '23514';
  end if;

  if p_arquivo_pdf is null
     or p_arquivo_pdf not like 'prescricoes/' || v_receita.paciente_id::text || '/%'
     or lower(p_arquivo_pdf) not like '%.pdf'
     or p_arquivo_pdf = v_receita.arquivo_pdf
     or position('..' in p_arquivo_pdf) > 0 then
    raise exception 'Arquivo assinado inválido para esta receita.' using errcode = '23514';
  end if;

  insert into public.prescricoes_versoes_assinadas (clinica_id, prescricao_id, arquivo_pdf, anexado_por)
  values (v_clinica_id, v_receita.id, p_arquivo_pdf, auth.uid())
  returning * into v_versao;

  return v_versao;
exception when unique_violation then
  raise exception 'Esta receita já tem uma versão assinada anexada.' using errcode = '23505';
end;
$$;

revoke all on function public.anexar_receita_assinada(uuid, text) from public, anon;
grant execute on function public.anexar_receita_assinada(uuid, text) to authenticated;

drop trigger if exists trg_audit on public.prescricoes_versoes_assinadas;
create trigger trg_audit after insert or update or delete on public.prescricoes_versoes_assinadas
  for each row execute function public.fn_audit_row();
