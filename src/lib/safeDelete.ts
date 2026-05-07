import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Executa um DELETE garantindo que linhas foram realmente apagadas.
 * Quando RLS bloqueia, o Supabase retorna sucesso com 0 linhas — esta função
 * detecta isso e exibe um erro real ao invés de mentir ao usuário.
 */
export async function safeDelete(
  table: string,
  filters: Record<string, any>,
  options?: { successMessage?: string; entity?: string }
): Promise<{ ok: boolean; error?: string }> {
  let q = (supabase.from(table as any) as any).delete();
  Object.entries(filters).forEach(([k, v]) => { q = q.eq(k, v); });
  const { data, error } = await q.select();
  if (error) {
    toast.error(`Erro ao excluir ${options?.entity || 'registro'}: ${error.message}`);
    return { ok: false, error: error.message };
  }
  if (!data || data.length === 0) {
    const msg = `Não foi possível excluir: você não tem permissão ou o registro já foi removido.`;
    toast.error(msg);
    return { ok: false, error: msg };
  }
  if (options?.successMessage) toast.success(options.successMessage);
  return { ok: true };
}