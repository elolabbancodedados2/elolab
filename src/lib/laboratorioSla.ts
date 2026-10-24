import { supabase } from '@/integrations/supabase/client';

// Precisa coincidir com coalesce(s.sla_alerta_horas, 24) em public.laboratorio_sla_etapas.
export const SLA_LAB_PADRAO_HORAS = 24;

export interface SlaSetorLinha {
  setor_id: string | null;
  setor_nome: string;
  sla_horas: number;
  amostras: number;
  espera_coleta_h: number | null;
  coleta_recebimento_h: number | null;
  recebimento_processamento_h: number | null;
  processamento_liberacao_h: number | null;
  total_h: number | null;
  em_atraso: number;
}

/** Vazio volta ao padrão; caso contrário, inteiro de 1 a 720 horas (mesma regra da constraint). */
export function validarSlaHoras(valor: string): number | null {
  const texto = valor.trim();
  if (!texto) return null;
  const horas = Number(texto);
  if (!Number.isInteger(horas) || horas < 1 || horas > 720) throw new Error('Informe um limite inteiro entre 1 e 720 horas.');
  return horas;
}

export async function buscarSlaLaboratorio(inicio: string): Promise<SlaSetorLinha[]> {
  const { data, error } = await supabase.rpc('laboratorio_sla_etapas', { p_inicio: inicio });
  if (error) throw error;
  return (data ?? []) as SlaSetorLinha[];
}
