/**
 * Limites de consumo por clínica, definidos pelo dono da plataforma em
 * "Limites e Consumo" (tabela `platform_tenant_limits`).
 *
 * A tela gravava os limites, mas nenhuma função os consultava: uma clínica
 * podia passar do número de usuários, de tokens de IA ou de notificações do
 * mês sem nada acontecer. Estes helpers são a checagem no servidor.
 *
 * Os padrões espelham os de `platform_usage_overview` (20 usuários, 100 mil
 * tokens e 5 mil notificações por mês) para a tela e a aplicação concordarem.
 *
 * Exige um client com service role: a tabela de limites só é legível pela
 * plataforma.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const LIMITES_PADRAO = { max_users: 20, max_ai_tokens: 100_000, max_notifications: 5_000 };

export interface LimitesClinica {
  max_users: number;
  max_ai_tokens: number;
  max_notifications: number;
}

export async function limitesDaClinica(service: SupabaseClient, clinicaId: string): Promise<LimitesClinica> {
  const { data, error } = await service
    .from('platform_tenant_limits')
    .select('max_users, max_ai_tokens, max_notifications')
    .eq('clinica_id', clinicaId)
    .maybeSingle();
  if (error) console.error('[limites] falha ao ler limites da clínica:', error.message);
  return { ...LIMITES_PADRAO, ...(data ?? {}) };
}

function inicioDoMesISO() {
  const agora = new Date();
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1)).toISOString();
}

/** Usuários ativos da clínica já atingiram o limite? (checar antes de convidar/aceitar convite) */
export async function usuariosNoLimite(service: SupabaseClient, clinicaId: string) {
  const limites = await limitesDaClinica(service, clinicaId);
  const { count, error } = await service
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('clinica_id', clinicaId)
    .eq('ativo', true);
  if (error) {
    console.error('[limites] falha ao contar usuários:', error.message);
    return { atingido: false, usados: 0, limite: limites.max_users };
  }
  const usados = count ?? 0;
  return { atingido: usados >= limites.max_users, usados, limite: limites.max_users };
}

/** Tokens de IA do mês corrente já atingiram o limite? */
export async function tokensIaNoLimite(service: SupabaseClient, clinicaId: string) {
  const limites = await limitesDaClinica(service, clinicaId);
  const { data, error } = await service
    .from('platform_ai_usage')
    .select('input_tokens, output_tokens')
    .eq('clinica_id', clinicaId)
    .gte('created_at', inicioDoMesISO())
    .limit(50_000);
  if (error) {
    console.error('[limites] falha ao somar tokens de IA:', error.message);
    return { atingido: false, usados: 0, limite: limites.max_ai_tokens };
  }
  const usados = (data ?? []).reduce(
    (acc: number, r: any) => acc + Number(r.input_tokens || 0) + Number(r.output_tokens || 0),
    0,
  );
  return { atingido: usados >= limites.max_ai_tokens, usados, limite: limites.max_ai_tokens };
}

/** Notificações ENVIADAS no mês corrente e o limite da clínica. */
export async function consumoNotificacoes(service: SupabaseClient, clinicaId: string) {
  const limites = await limitesDaClinica(service, clinicaId);
  const { count, error } = await service
    .from('notification_queue')
    .select('id', { count: 'exact', head: true })
    .eq('clinica_id', clinicaId)
    .eq('status', 'enviado')
    .gte('enviado_em', inicioDoMesISO());
  if (error) console.error('[limites] falha ao contar notificações:', error.message);
  return { usados: error ? 0 : (count ?? 0), limite: limites.max_notifications };
}
