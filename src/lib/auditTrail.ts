// Audit Trail System - reads/writes from Supabase audit_log table
import { supabase } from '@/integrations/supabase/client';

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: 'create' | 'update' | 'delete';
  collection: string;
  recordId: string;
  recordName?: string;
  changes?: {
    field: string;
    oldValue?: any;
    newValue?: any;
  }[];
  userId?: string;
  userName?: string;
}

/**
 * Fila local de auditoria que não conseguiu ser gravada.
 *
 * A trilha do prontuário é exigência da CFM 1.821/07: precisa constar quem
 * acessou e quem alterou. Perder um registro por causa de uma oscilação de rede
 * é perder prova. Guardamos no navegador e reenviamos na próxima chamada.
 *
 * Só metadados — nunca conteúdo clínico —, e os caches são limpos no logout.
 */
const CHAVE_PENDENTES = 'auditoria_pendente';
const MAX_PENDENTES = 200;

type LinhaAuditoria = Record<string, unknown>;

function lerPendentes(): LinhaAuditoria[] {
  try {
    const bruto = localStorage.getItem(CHAVE_PENDENTES);
    return bruto ? (JSON.parse(bruto) as LinhaAuditoria[]) : [];
  } catch {
    return [];
  }
}

function guardarPendente(linha: LinhaAuditoria) {
  try {
    const fila = lerPendentes();
    fila.push(linha);
    // Mantém as mais recentes: uma fila infinita estouraria o localStorage.
    localStorage.setItem(CHAVE_PENDENTES, JSON.stringify(fila.slice(-MAX_PENDENTES)));
  } catch {
    // localStorage cheio ou indisponível — o console abaixo já denuncia.
  }
}

/** Tenta reenviar o que ficou pendente. Silencioso: é oportunista. */
async function reenviarPendentes(): Promise<void> {
  const fila = lerPendentes();
  if (fila.length === 0) return;

  const { error } = await supabase.from('audit_log').insert(fila as any);
  if (!error) {
    localStorage.removeItem(CHAVE_PENDENTES);
    console.info(`[auditoria] ${fila.length} registro(s) pendente(s) reenviado(s).`);
  }
}

/**
 * Grava na trilha de auditoria.
 *
 * O corpo antigo era `try { await insert(...) } catch { console.error(...) }`.
 * O supabase-js NÃO lança em erro de API: devolve `{ error }`. Então o catch
 * nunca disparava e a falha era invisível até para o console — um prontuário
 * podia ser aberto ou alterado sem registro nenhum de quem foi.
 *
 * @returns `true` se gravou; `false` se ficou na fila para reenvio.
 */
export async function logAudit(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<boolean> {
  const linha: LinhaAuditoria = {
    action: entry.action,
    collection: entry.collection,
    record_id: entry.recordId,
    record_name: entry.recordName || null,
    changes: entry.changes ? JSON.parse(JSON.stringify(entry.changes)) : null,
    user_id: entry.userId || null,
    user_name: entry.userName || null,
  };

  const { error } = await supabase.from('audit_log').insert(linha as any);

  if (error) {
    console.error('[auditoria] falha ao gravar — enfileirado para reenvio:', error, linha);
    guardarPendente(linha);
    return false;
  }

  // Gravou: boa hora para escoar o que ficou para trás.
  await reenviarPendentes().catch(() => { /* oportunista */ });
  return true;
}

export async function getAuditLog(filters?: {
  collection?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<AuditEntry[]> {
  let query = supabase
    .from('audit_log')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(filters?.limit || 500);

  if (filters?.collection) query = query.eq('collection', filters.collection);
  if (filters?.action) query = query.eq('action', filters.action);
  if (filters?.startDate) query = query.gte('timestamp', filters.startDate);
  if (filters?.endDate) query = query.lte('timestamp', filters.endDate);

  const { data, error } = await query;
  if (error) {
    console.error('Error loading audit log:', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    timestamp: row.timestamp,
    action: row.action as AuditEntry['action'],
    collection: row.collection,
    recordId: row.record_id,
    recordName: row.record_name,
    changes: row.changes as AuditEntry['changes'],
    userId: row.user_id,
    userName: row.user_name,
  }));
}

export async function clearAuditLog() {
  // We don't actually delete - just a no-op for safety
  console.warn('clearAuditLog: operation disabled for data safety');
}

// Helper to detect changes between objects
export function detectChanges(oldObj: any, newObj: any): { field: string; oldValue: any; newValue: any }[] {
  const changes: { field: string; oldValue: any; newValue: any }[] = [];
  const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);
  
  allKeys.forEach(key => {
    if (key === 'id' || key === 'created_at' || key === 'updated_at') return;
    
    const oldVal = oldObj?.[key];
    const newVal = newObj?.[key];
    
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({ field: key, oldValue: oldVal, newValue: newVal });
    }
  });
  
  return changes;
}

// Collection labels for display
export const COLLECTION_LABELS: Record<string, string> = {
  pacientes: 'Pacientes',
  agendamentos: 'Agendamentos',
  prontuarios: 'Prontuários',
  prescricoes: 'Prescrições',
  atestados: 'Atestados',
  lancamentos: 'Lançamentos',
  estoque: 'Estoque',
  users: 'Usuários',
  medicos: 'Médicos',
  convenios: 'Convênios',
  salas: 'Salas',
  fila: 'Fila',
  prescription_templates: 'Templates Prescrição',
  certificate_templates: 'Templates Atestado',
};

export const ACTION_LABELS: Record<string, string> = {
  create: 'Criação',
  update: 'Atualização',
  delete: 'Exclusão',
};
