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

export async function limitesDaClinica(
  service: SupabaseClient,
  clinicaId: string,
  defaults: Partial<LimitesClinica> = {},
): Promise<LimitesClinica> {
  const { data, error } = await service
    .from('platform_tenant_limits')
    .select('max_users, max_ai_tokens, max_notifications')
    .eq('clinica_id', clinicaId)
    .maybeSingle();
  if (error) {
    console.error('[limites] falha ao ler limites da clínica:', error.message);
    throw new Error('Não foi possível validar os limites de uso da clínica. Tente novamente.');
  }
  // Os limites explícitos da clínica prevalecem; na ausência deles, o dono da
  // plataforma pode definir a cota padrão global para IA.
  return { ...LIMITES_PADRAO, ...defaults, ...(data ?? {}) };
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
    throw new Error('Não foi possível validar o limite de usuários da clínica. Tente novamente.');
  }
  const usados = count ?? 0;
  return { atingido: usados >= limites.max_users, usados, limite: limites.max_users };
}

/** Tokens de IA do mês corrente já atingiram o limite? */
export async function tokensIaNoLimite(service: SupabaseClient, clinicaId: string, limitePadrao?: number) {
  const limites = await limitesDaClinica(service, clinicaId, {
    max_ai_tokens: limitePadrao && limitePadrao > 0 ? limitePadrao : LIMITES_PADRAO.max_ai_tokens,
  });
  const { data, error } = await service
    .from('platform_ai_usage')
    .select('input_tokens, output_tokens')
    .eq('clinica_id', clinicaId)
    .gte('created_at', inicioDoMesISO())
    .limit(50_000);
  if (error) {
    console.error('[limites] falha ao somar tokens de IA:', error.message);
    throw new Error('Não foi possível validar o limite de uso da IA. Tente novamente.');
  }
  // A API do Supabase limita a leitura. Ao atingir o teto, a soma pode estar
  // incompleta; bloquear temporariamente evita liberar IA com cota subcontada.
  if ((data ?? []).length >= 50_000) {
    return { atingido: true, usados: limites.max_ai_tokens, limite: limites.max_ai_tokens };
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
  if (error) {
    console.error('[limites] falha ao contar notificações:', error.message);
    throw new Error('Não foi possível validar o limite de notificações da clínica. Tente novamente.');
  }
  return { usados: count ?? 0, limite: limites.max_notifications };
}

/** Resolve e aplica limites de assentos do plano ao convidar e ativar equipe. */
export async function validarLimitesDeEquipe(
  service: SupabaseClient,
  clinicaId: string,
  roles: string[],
): Promise<string | null> {
  const { data: clinica, error: clinicaError } = await service
    .from('clinicas')
    .select('plano_id, owner_id')
    .eq('id', clinicaId)
    .maybeSingle();
  if (clinicaError || !clinica) {
    console.error('[limites] falha ao localizar clínica:', clinicaError?.message);
    throw new Error('Não foi possível validar o plano da clínica. Tente novamente.');
  }

  let planoId = clinica.plano_id;
  if (!planoId && clinica.owner_id) {
    const { data: assinatura, error: assinaturaError } = await service
      .from('assinaturas_plano')
      .select('plano_id, status, trial_fim, data_fim')
      .eq('user_id', clinica.owner_id)
      .in('status', ['ativa', 'trial'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (assinaturaError) {
      console.error('[limites] falha ao ler assinatura:', assinaturaError.message);
      throw new Error('Não foi possível validar a assinatura da clínica. Tente novamente.');
    }
    const fim = assinatura?.status === 'trial' ? assinatura.trial_fim : assinatura?.data_fim;
    if (assinatura && (!fim || new Date(fim).getTime() > Date.now())) planoId = assinatura.plano_id;
  }

  if (!planoId) return 'A clínica não possui um plano ativo vinculado. Regularize a assinatura ou fale com o suporte.';

  const { data: plano, error: planoError } = await service
    .from('planos')
    .select('nome, max_medicos, max_recepcao, max_funcionarios_total')
    .eq('id', planoId)
    .maybeSingle();
  if (planoError || !plano) {
    console.error('[limites] falha ao ler plano:', planoError?.message);
    throw new Error('Não foi possível validar os limites do plano. Tente novamente.');
  }

  const { count: funcionarios, error: funcionariosError } = await service
    .from('funcionarios')
    .select('id', { count: 'exact', head: true })
    .eq('clinica_id', clinicaId)
    .eq('ativo', true);
  if (funcionariosError) {
    console.error('[limites] falha ao contar funcionários:', funcionariosError.message);
    throw new Error('Não foi possível validar o limite de funcionários. Tente novamente.');
  }
  if (roles.length > 0 && (funcionarios ?? 0) >= (plano.max_funcionarios_total ?? 0)) {
    return `Limite de funcionários do plano ${plano.nome} atingido.`;
  }

  if (roles.includes('medico')) {
    const { count, error } = await service
      .from('medicos')
      .select('id', { count: 'exact', head: true })
      .eq('clinica_id', clinicaId)
      .eq('ativo', true);
    if (error) {
      console.error('[limites] falha ao contar médicos:', error.message);
      throw new Error('Não foi possível validar o limite de médicos. Tente novamente.');
    }
    if ((count ?? 0) >= (plano.max_medicos ?? 0)) return `Limite de médicos do plano ${plano.nome} atingido.`;
  }

  if (roles.includes('recepcao')) {
    const { data: papeis, error: papeisError } = await service
      .from('user_roles')
      .select('user_id')
      .eq('role', 'recepcao');
    if (papeisError) {
      console.error('[limites] falha ao consultar papéis de recepção:', papeisError.message);
      throw new Error('Não foi possível validar o limite de recepção. Tente novamente.');
    }
    const ids = [...new Set((papeis ?? []).map((p) => p.user_id))];
    if (ids.length > 0) {
      const { count, error } = await service
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('clinica_id', clinicaId)
        .eq('ativo', true)
        .in('id', ids);
      if (error) {
        console.error('[limites] falha ao contar recepção:', error.message);
        throw new Error('Não foi possível validar o limite de recepção. Tente novamente.');
      }
      if ((count ?? 0) >= (plano.max_recepcao ?? 0)) return `Limite de recepção do plano ${plano.nome} atingido.`;
    }
  }

  return null;
}
