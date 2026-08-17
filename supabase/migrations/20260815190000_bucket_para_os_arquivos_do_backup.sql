-- ============================================================================
-- Um bucket para os ARQUIVOS do backup
--
-- O backup copiava as 78 tabelas e deixava de fora os arquivos: exame em PDF,
-- foto do paciente, documento assinado. Restaurar devolvia a linha "anexo tal"
-- apontando para um arquivo que não existe mais — o pior tipo de falha, porque
-- quem restaura acha que recuperou tudo e só descobre quando um paciente pede
-- um exame antigo.
--
-- A primeira tentativa copiou para dentro do bucket `backups` e foi recusada:
--
--   patient-photos/medicos/1776189499471.png: mime type image/png is not supported
--
-- `backups` só aceita `application/json`, e essa restrição é boa — impede que
-- qualquer coisa seja despejada onde ficam os backups. Em vez de afrouxá-la,
-- os arquivos ganham bucket próprio.
--
-- Ninguém lê pelo app: restaurar arquivo é operação de servidor, e dar leitura
-- a um perfil de clínica aqui daria acesso aos anexos de TODAS as clínicas
-- num lugar só, sem o filtro que protege o bucket de origem.
-- ============================================================================

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('backups-arquivos', 'backups-arquivos', false, 524288000, NULL)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 524288000,
      allowed_mime_types = NULL;

-- Nenhuma política é criada para este bucket, de propósito. `storage.objects`
-- tem RLS ligado e as políticas existentes são todas escopadas por bucket:
-- sem política que o mencione, nenhum usuário comum lê ou escreve aqui. Só a
-- chave de serviço, que passa por cima do RLS — a função de backup e mais
-- ninguém.

COMMIT;
