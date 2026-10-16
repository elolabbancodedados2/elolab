import { supabase } from '@/integrations/supabase/client';

export type DocumentoClinicoAuditado = 'anexo_prontuario' | 'prescricao' | 'atestado' | 'encaminhamento';
export type AcaoDocumentoClinico = 'visualizacao' | 'impressao' | 'exportacao';

export async function registrarAcessoDocumentoClinico(
  tipo: DocumentoClinicoAuditado,
  documentoId: string,
  acao: AcaoDocumentoClinico,
): Promise<string> {
  const rpcClient = supabase as unknown as {
    rpc: (functionName: string, parameters: { p_tipo: DocumentoClinicoAuditado; p_documento_id: string; p_acao: AcaoDocumentoClinico }) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await rpcClient.rpc('registrar_acesso_documento_clinico', {
    p_tipo: tipo,
    p_documento_id: documentoId,
    p_acao: acao,
  });
  if (error) throw error;
  if (typeof data !== 'string' || !data) throw new Error('A auditoria não confirmou o acesso ao documento.');
  return data;
}
