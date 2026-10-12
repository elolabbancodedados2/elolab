import { supabase } from '@/integrations/supabase/client';

export type ProntuarioAcaoAuditada = 'visualizacao' | 'edicao' | 'exportacao';

export async function registrarAcessoProntuario(
  prontuarioId: string,
  acao: ProntuarioAcaoAuditada,
  justificativa?: string,
) {
  const { data, error } = await (supabase as any).rpc('registrar_prontuario_acesso', {
    p_prontuario_id: prontuarioId,
    p_acao: acao,
    p_justificativa: justificativa?.trim() || null,
  });
  if (error) throw error;
  return data as string;
}

export async function registrarVisualizacaoHistoricoProntuarios(prontuarioIds: string[]) {
  const idsUnicos = [...new Set(prontuarioIds.filter(Boolean))];
  for (let inicio = 0; inicio < idsUnicos.length; inicio += 500) {
    const lote = idsUnicos.slice(inicio, inicio + 500);
    const { data, error } = await (supabase as any).rpc('registrar_visualizacao_historico_prontuarios', {
      p_prontuario_ids: lote,
    });
    if (error) throw error;
    if (data !== lote.length) {
      throw new Error('Nem todos os acessos ao histórico foram registrados');
    }
  }
}

export async function autorizarLeituraHistoricoPaciente(pacienteId: string) {
  if (!pacienteId) throw new Error('Paciente obrigatorio para auditar leitura clinica.');
  const { data, error } = await (supabase as any).rpc('registrar_visualizacao_historico_paciente', {
    p_paciente_id: pacienteId,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function autorizarLeituraHistoricoMedico(medicoId: string) {
  if (!medicoId) throw new Error('Profissional obrigatorio para auditar leitura clinica.');
  const { data, error } = await (supabase as any).rpc('registrar_visualizacao_historico_medico', {
    p_medico_id: medicoId,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function autorizarLeituraHistoricoClinica() {
  const { data, error } = await (supabase as any).rpc('registrar_visualizacao_historico_clinica');
  if (error) throw error;
  return Number(data ?? 0);
}

export interface AdendoProntuarioRegistrado {
  id: string;
  hash: string;
  created_at: string;
}

export async function registrarAdendoProntuario(
  prontuarioId: string,
  tipo: 'retificacao' | 'complemento' | 'erratum',
  motivo: string,
  texto: string,
): Promise<AdendoProntuarioRegistrado> {
  const { data, error } = await (supabase as any).rpc('registrar_prontuario_adendo', {
    p_prontuario_id: prontuarioId,
    p_tipo: tipo,
    p_motivo: motivo.trim(),
    p_texto: texto.trim(),
  });
  if (error) throw error;
  return data as AdendoProntuarioRegistrado;
}

export async function registrarExportacaoProntuarios(prontuarioIds: string[], formato: 'FHIR R4 JSON' | 'XML clínico simplificado' | 'PDF' | 'WhatsApp') {
  const idsUnicos = [...new Set(prontuarioIds.filter(Boolean))];
  const tamanhoLote = 20;
  for (let inicio = 0; inicio < idsUnicos.length; inicio += tamanhoLote) {
    const lote = idsUnicos.slice(inicio, inicio + tamanhoLote);
    await Promise.all(lote.map((id) => registrarAcessoProntuario(id, 'exportacao', `Formato: ${formato}`)));
  }
}
