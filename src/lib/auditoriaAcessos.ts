import { supabase } from '@/integrations/supabase/client';
import { csvCell } from '@/lib/prontuarioAuditExport';

// Precisam coincidir com public.auditoria_acessos_intervalo.
export const LIMITE_DIAS_AUDITORIA = 93;
export const LIMITE_LINHAS_AUDITORIA = 5000;

export interface AcessoAuditado {
  evento_id: string;
  origem: string;
  ocorrido_em: string;
  acao: string;
  usuario_id: string | null;
  usuario_nome: string | null;
  recurso: string;
  registro_id: string | null;
}

/** Datas `yyyy-mm-dd` no horário local, inclusivas, como os filtros do histórico. */
export function intervaloAuditoria(inicio: string, fim: string): { p_inicio: string; p_fim: string } {
  if (!inicio || !fim) throw new Error('Informe a data inicial e final para auditar acessos.');
  const de = new Date(`${inicio}T00:00:00`);
  const ate = new Date(`${fim}T23:59:59.999`);
  if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime())) throw new Error('Datas inválidas.');
  if (ate < de) throw new Error('A data inicial deve ser anterior à final.');
  if (ate.getTime() - de.getTime() > LIMITE_DIAS_AUDITORIA * 86_400_000) {
    throw new Error(`O intervalo máximo é de ${LIMITE_DIAS_AUDITORIA} dias.`);
  }
  return { p_inicio: de.toISOString(), p_fim: ate.toISOString() };
}

export async function buscarAuditoriaAcessos(inicio: string, fim: string) {
  const { data, error } = await supabase.rpc('auditoria_acessos_intervalo', intervaloAuditoria(inicio, fim));
  if (error) throw error;
  const linhas = (data ?? []) as AcessoAuditado[];
  return { linhas, truncado: linhas.length >= LIMITE_LINHAS_AUDITORIA };
}

export function gerarCsvAcessos(linhas: AcessoAuditado[], inicio: string, fim: string, truncado: boolean): string {
  const rows: unknown[][] = [
    ['Auditoria de acessos', 'De', inicio, 'Até', fim],
    ...(truncado ? [[`Atenção: limite de ${LIMITE_LINHAS_AUDITORIA} eventos atingido; reduza o intervalo para ver todos.`]] : []),
    [],
    ['ID do evento', 'Origem', 'Data/hora (UTC)', 'Ação', 'Usuário (ID)', 'Nome do usuário', 'Recurso', 'Registro (ID)'],
    ...linhas.map((l) => [l.evento_id, l.origem, l.ocorrido_em, l.acao, l.usuario_id, l.usuario_nome, l.recurso, l.registro_id]),
  ];
  return String.fromCharCode(0xfeff) + rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
}
