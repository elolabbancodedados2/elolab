import { supabase } from '@/integrations/supabase/client';

export const CONFIG_SEGURANCA_ATUALIZADA_EVENT = 'elolab:config-seguranca-atualizada';

/**
 * Chaves de `configuracoes_clinica` que pertencem à CLÍNICA (uma linha por
 * clínica, lida por toda a equipe). As demais são preferências pessoais.
 * Manter em sincronia com `public.chave_config_da_clinica()` no banco.
 */
export const CHAVES_DA_CLINICA = [
  'config_clinica', 'clinica_info', 'clinica_logo', 'config_impressao',
  'config_notificacoes', 'config_financeiro', 'config_seguranca',
  'lgpd_config', 'role_customization', 'precos_exames_internos',
  'agendamento_online',
] as const;

export function chaveDaClinica(chave: string): boolean {
  return (CHAVES_DA_CLINICA as readonly string[]).includes(chave);
}

/**
 * Grava uma configuração da clínica. Não usa upsert por (user_id, chave): isso
 * criava uma cópia por pessoa e cada tela lia uma versão diferente. Atualiza a
 * linha da clínica se existir; senão insere.
 */
export async function salvarConfigClinica(params: { clinicaId: string; userId: string; chave: string; valor: unknown; expectedUpdatedAt?: string | null }) {
  const { clinicaId, userId, chave, valor, expectedUpdatedAt } = params;
  const db = supabase as any;
  const agora = new Date().toISOString();

  // Para configurações editáveis por mais de uma pessoa, permite escrita
  // condicional à versão lida e evita sobrescrever uma atualização concorrente.
  if (expectedUpdatedAt !== undefined) {
    if (expectedUpdatedAt !== null) {
      const { data, error } = await db.from('configuracoes_clinica')
        .update({ valor, updated_at: agora })
        .eq('clinica_id', clinicaId).eq('chave', chave).eq('updated_at', expectedUpdatedAt)
        .select('id');
      if (error) throw error;
      if ((data ?? []).length > 0) return;
      throw new Error('Outra pessoa atualizou esta tabela de preços. Atualize os dados antes de salvar novamente.');
    }

    const { error } = await db.from('configuracoes_clinica')
      .insert({ clinica_id: clinicaId, user_id: userId, chave, valor, updated_at: agora });
    if (error) {
      if (error.code === '23505') throw new Error('Outra pessoa criou esta tabela de preços. Atualize os dados antes de salvar novamente.');
      throw error;
    }
    return;
  }

  const atualizar = async () => {
    const { data, error } = await db.from('configuracoes_clinica')
      .update({ valor, updated_at: agora })
      .eq('clinica_id', clinicaId).eq('chave', chave)
      .select('id');
    if (error) throw error;
    return (data ?? []).length > 0;
  };

  if (await atualizar()) return;

  const { error } = await db.from('configuracoes_clinica')
    .insert({ clinica_id: clinicaId, user_id: userId, chave, valor, updated_at: agora });
  if (error) {
    // Outra pessoa criou a linha entre a leitura e o insert: atualiza a dela.
    if (error.code === '23505' && await atualizar()) return;
    throw error;
  }
}

/** Lê configurações da clínica como mapa chave → valor. */
export async function lerConfigsClinica(clinicaId: string, chaves: readonly string[] = CHAVES_DA_CLINICA) {
  const { configs } = await lerConfigsClinicaComVersoes(clinicaId, chaves);
  return configs;
}

/** Lê também as versões para permitir salvamento concorrente sem sobrescrever outro administrador. */
export async function lerConfigsClinicaComVersoes(clinicaId: string, chaves: readonly string[] = CHAVES_DA_CLINICA) {
  const { data, error } = await (supabase as any).from('configuracoes_clinica')
    .select('chave, valor, updated_at')
    .eq('clinica_id', clinicaId)
    .in('chave', chaves as string[])
    .order('updated_at', { ascending: false });
  if (error) throw error;
  const configs: Record<string, any> = {};
  const updatedAtByKey: Record<string, string | null> = {};
  for (const linha of data ?? []) {
    if (linha.chave in configs) continue;
    configs[linha.chave] = linha.valor;
    updatedAtByKey[linha.chave] = linha.updated_at ?? null;
  }
  return { configs, updatedAtByKey };
}
