import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from './erros';

interface Lembrete { status: string; enviado_em: string | null; dados_extras: unknown }
interface Resposta { sucesso: boolean | null; tipo_acao: string; created_at: string | null; dados_entrada: unknown; dados_saida: unknown }
const objeto = (valor: unknown): Record<string, unknown> => valor && typeof valor === 'object' ? valor as Record<string, unknown> : {};

export function estadoLembrete(id: string, lembretes: Lembrete[], respostas: Resposta[]) {
  const enviados = lembretes.filter(item => {
    const dados = objeto(item.dados_extras);
    return dados.agendamento_id === id && item.status === 'enviado' && item.enviado_em
      && (dados.tipo_notificacao === 'confirmacao_agendamento' || ['24h', '24h_whatsapp', '2h', '2h_whatsapp'].includes(String(dados.tipo_lembrete)));
  });
  const ultimoEnvio = enviados.map(item => item.enviado_em!).sort().at(-1);
  const respondeu = respostas.some(item => item.sucesso && objeto(item.dados_entrada).agendamento_id === id
    && ['confirmar_presenca', 'cancelar_agendamento', 'reagendar_agendamento'].includes(item.tipo_acao)
    && (objeto(item.dados_saida).completed === true || objeto(item.dados_saida).requires_confirmation === true)
    && item.created_at && (!ultimoEnvio || item.created_at >= ultimoEnvio));
  return { enviado: enviados.length > 0, respondeu, semResposta: enviados.length > 0 && !respondeu };
}

export interface ConsultaConfirmacao {
  id: string;
  updated_at?: string | null;
  pacientes?: { nome?: string | null; nome_social?: string | null } | null;
}

export async function confirmarSelecionadas(consultas: ConsultaConfirmacao[], clinicaId: string) {
  const confirmadas: string[] = [];
  const falhas: { id: string; nome: string; motivo: string }[] = [];
  for (const consulta of consultas) {
    try {
      if (!clinicaId) throw new Error('Unidade não identificada.');
      let update = supabase.from('agendamentos').update({ status: 'confirmado' })
        .eq('id', consulta.id).eq('clinica_id', clinicaId).eq('status', 'agendado');
      update = consulta.updated_at ? update.eq('updated_at', consulta.updated_at) : update.is('updated_at', null);
      const { data, error } = await update.select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('A consulta mudou desde que a lista foi carregada. Atualize e confira antes de confirmar.');
      confirmadas.push(consulta.id);
    } catch (error) {
      falhas.push({ id: consulta.id, nome: consulta.pacientes?.nome_social || consulta.pacientes?.nome || 'Paciente', motivo: mensagemDeErro(error) });
    }
  }
  return { confirmadas, falhas };
}
