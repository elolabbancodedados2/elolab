import { supabase } from '@/integrations/supabase/client';

/**
 * Único jeito de transformar a resposta de `link_portal_paciente` no link que
 * a clínica compartilha. Antes cada tela montava do seu jeito: uma aceitava
 * qualquer token e trocava o domínio, a outra exigia o domínio de produção.
 *
 * Só o token sai da resposta; o endereço é sempre o desta instalação. Assim
 * uma resposta adulterada não consegue mandar o paciente para outro site.
 */
export function montarLinkPortal(valor: unknown, origem: string = window.location.origin): string {
  if (typeof valor !== 'string' || !valor.trim()) throw new Error('O servidor não retornou um link válido.');
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new Error('O servidor retornou um link inválido.');
  }
  const token = url.searchParams.get('token');
  if (url.pathname !== '/portal-paciente' || !token || !/^[a-f0-9]{64}$/i.test(token)) {
    throw new Error('O servidor retornou um link em formato inesperado. O acesso não foi exibido.');
  }
  const link = new URL('/portal-paciente', origem);
  link.searchParams.set('token', token);
  return link.toString();
}

export async function revokePatientPortalLinks(patientId: string): Promise<number> {
  const { data, error } = await (supabase as any).rpc('revogar_links_portal_paciente', {
    p_paciente_id: patientId,
  });
  if (error) throw error;

  const revokedCount = Number(data ?? 0);
  if (!Number.isSafeInteger(revokedCount) || revokedCount < 0) {
    throw new Error('O servidor retornou uma confirmação inválida de revogação.');
  }
  return revokedCount;
}
