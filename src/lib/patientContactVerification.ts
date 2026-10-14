import { supabase } from '@/integrations/supabase/client';

export type ContactConfirmationSource = 'paciente' | 'responsavel' | 'equipe';
export type PatientContactChannel = 'telefone' | 'email';

const SOURCE_LABELS: Record<ContactConfirmationSource, string> = {
  paciente: 'Paciente',
  responsavel: 'Responsável',
  equipe: 'Equipe',
};

export function contactConfirmationSourceLabel(source: string | null | undefined): string {
  if (source === 'paciente' || source === 'responsavel' || source === 'equipe') {
    return SOURCE_LABELS[source];
  }
  return 'Origem não registrada';
}

export function describeContactVerification(confirmedAt: string | null | undefined, source: string | null | undefined): string {
  if (!confirmedAt) return 'Ainda não confirmado';
  const date = new Date(confirmedAt);
  if (!Number.isFinite(date.getTime())) return 'Confirmação registrada';
  const dateLabel = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(date);
  return `Confirmado em ${dateLabel} · ${contactConfirmationSourceLabel(source)}`;
}

export async function recordPatientContactVerification(
  patientId: string,
  channel: PatientContactChannel,
  source: ContactConfirmationSource,
): Promise<void> {
  const { error } = await (supabase as any).rpc('registrar_confirmacao_contato_paciente', {
    p_paciente_id: patientId,
    p_canal: channel,
    p_origem: source,
  });
  if (error) throw error;
}
