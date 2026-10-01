-- Configurações da clínica passam a ser da CLÍNICA, não de quem salvou.
--
-- O PROBLEMA
-- `configuracoes_clinica` guarda dois tipos de dado na mesma tabela:
--   * preferências pessoais (cor da agenda, visão padrão, aviso dispensado);
--   * dados da clínica (nome, endereço, CNPJ, logo, impressão, financeiro...).
-- A unicidade é (user_id, chave) e a política de leitura é `user_id = auth.uid()`.
-- Resultado:
--   * o médico que gera uma receita não enxerga o endereço/CNPJ que o admin
--     salvou — o PDF saía com dados fictícios (já corrigido no front para sair
--     sem eles; esta migração faz os dados reais chegarem);
--   * um segundo admin abre Configurações e vê o formulário vazio; ao salvar,
--     cria a própria cópia, e cada tela passa a ler uma versão diferente.
--
-- A CORREÇÃO
--   * `chave_config_da_clinica()` define quais chaves são da clínica;
--   * duplicatas dessas chaves são reduzidas à versão mais recente por clínica;
--   * índice único parcial (clinica_id, chave) para essas chaves;
--   * leitura por toda a equipe da clínica; escrita por admin da clínica
--     (precos_exames_internos mantém a escrita por qualquer membro, como antes).

create or replace function public.chave_config_da_clinica(p_chave text)
returns boolean
language sql
immutable
as $$
  select p_chave = any (array[
    'config_clinica', 'clinica_info', 'clinica_logo', 'config_impressao',
    'config_notificacoes', 'config_financeiro', 'config_seguranca',
    'lgpd_config', 'role_customization', 'precos_exames_internos',
    'agendamento_online'
  ]);
$$;

-- Mantém só a linha mais recente de cada chave da clínica.
delete from public.configuracoes_clinica c
using (
  select id,
         row_number() over (partition by clinica_id, chave order by updated_at desc nulls last, created_at desc nulls last, id) as ordem
  from public.configuracoes_clinica
  where clinica_id is not null and public.chave_config_da_clinica(chave)
) d
where c.id = d.id and d.ordem > 1;

create unique index if not exists configuracoes_clinica_chave_da_clinica_uidx
  on public.configuracoes_clinica (clinica_id, chave)
  where clinica_id is not null and public.chave_config_da_clinica(chave);

drop policy if exists config_select on public.configuracoes_clinica;
drop policy if exists config_insert on public.configuracoes_clinica;
drop policy if exists config_update on public.configuracoes_clinica;
drop policy if exists config_delete on public.configuracoes_clinica;

create policy config_select on public.configuracoes_clinica
for select to authenticated
using (
  user_id = auth.uid()
  or (
    clinica_id is not null
    and public.chave_config_da_clinica(chave)
    and public.is_same_clinica(clinica_id)
  )
);

create policy config_insert on public.configuracoes_clinica
for insert to authenticated
with check (
  user_id = auth.uid()
  and (clinica_id is null or public.is_same_clinica(clinica_id))
  and (
    not public.chave_config_da_clinica(chave)
    or chave = 'precos_exames_internos'
    or public.is_admin(auth.uid())
  )
);

create policy config_update on public.configuracoes_clinica
for update to authenticated
using (
  (user_id = auth.uid() and not public.chave_config_da_clinica(chave))
  or (
    clinica_id is not null
    and public.chave_config_da_clinica(chave)
    and public.is_same_clinica(clinica_id)
    and (chave = 'precos_exames_internos' or public.is_admin(auth.uid()))
  )
)
with check (
  clinica_id is null or public.is_same_clinica(clinica_id)
);

create policy config_delete on public.configuracoes_clinica
for delete to authenticated
using (
  (user_id = auth.uid() and not public.chave_config_da_clinica(chave))
  or (
    clinica_id is not null
    and public.chave_config_da_clinica(chave)
    and public.is_same_clinica(clinica_id)
    and public.is_admin(auth.uid())
  )
);
