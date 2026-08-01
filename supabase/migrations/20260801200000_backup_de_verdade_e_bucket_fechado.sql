-- 1. O backup semanal nunca guardou um único arquivo.
--
-- A função montava o JSON e mandava para o bucket `medical-attachments`, que
-- aceita apenas imagem e PDF. `application/json` era recusado — nas 18
-- execuções, ao longo de quatro meses. E ela respondia HTTP 200 com
-- `success: true` mesmo assim, então nada nunca acusou.
--
-- Um sistema de prontuário sem backup é o risco que acaba com o negócio: um
-- erro de migration, um DELETE sem WHERE, e não há de onde voltar.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backups', 'backups', false, 524288000, array['application/json'])
on conflict (id) do update
  set public = false,
      file_size_limit = 524288000,
      allowed_mime_types = array['application/json'];

-- Nenhuma política de acesso, de propósito. Um backup traz TODOS os pacientes
-- de TODAS as clínicas num arquivo só — é o objeto mais sensível do sistema.
-- Só o service_role, que ignora RLS, escreve e lê. Nenhuma sessão de navegador
-- alcança, nem a do dono da plataforma.
drop policy if exists backups_sem_acesso_publico on storage.objects;


-- 2. O bucket de fotos continuava público.
--
-- O código já foi migrado para links assinados (StorageImage.tsx), e o
-- comentário lá diz "era público" — mas o bucket nunca chegou a ser fechado.
-- Público no Supabase significa que quem souber o caminho abre a foto sem
-- login. Foto de paciente é dado de saúde.
--
-- Só existe um arquivo hoje, de um médico de teste, cuja URL completa está
-- gravada e deixará de abrir. A foto pode ser reenviada pela tela.
update storage.buckets set public = false where id = 'patient-photos';


-- 3. Que tabelas entram no backup.
--
-- A função tinha uma lista fixa de 17 nomes, escrita à mão. Ficaram de fora
-- clinicas, profiles, user_roles, assinaturas_plano, triagens, caixa_diario,
-- fila_atendimento, retornos e outras — restaurar aquele arquivo devolveria os
-- pacientes sem as clínicas a que pertencem, e sem saber quem trabalha onde.
-- Pior: tabela nova criada depois nunca entrava, e ninguém era avisado.
--
-- Agora a lista é o próprio banco, menos o que é ruído regenerável.
create or replace function public.tabelas_para_backup()
returns setof text
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.relname::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and c.relname not in (
       -- Ruído que se refaz sozinho e inflaria o arquivo sem servir para nada
       -- numa restauração.
       'automation_logs',
       'mercadopago_webhook_logs',
       'notification_queue'
     )
   order by c.relname;
$$;

revoke all on function public.tabelas_para_backup() from public;
revoke all on function public.tabelas_para_backup() from anon;
revoke all on function public.tabelas_para_backup() from authenticated;
grant execute on function public.tabelas_para_backup() to service_role;

comment on function public.tabelas_para_backup() is
  'Tabelas que o backup automático deve copiar. Tabela nova entra sozinha.';
